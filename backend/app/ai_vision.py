import base64
import json
import time
import re
from pathlib import Path
import requests
import cv2
import numpy as np
from typing import Dict, Any, Optional
from app.models import AIVisionConfig

def _clean_vision_boilerplate(text: str) -> str:
    """Strips preamble filler, meta-descriptions, and redundant negative clauses from vision LLM output."""
    if not text:
        return text
    t = text.strip()
    
    # Strip common leading AI vision preamble
    patterns = [
        r'^(the\s+(image|photo|picture|surveillance\s+snapshot|screenshot|scene)\s+(is\s+a\s+[^.]+?\s+(that\s+depicts|depicting|showing)|shows|depicts|features|presents|appears\s+to\s+be|is)\s*:?\s*)',
        r'^(this\s+(image|photo|picture|surveillance\s+snapshot)\s+(shows|depicts|features|is)\s*:?\s*)',
        r'^(in\s+this\s+(image|photo|picture|frame|snapshot),\s*)',
        r'^(it\s+(features|shows|depicts)\s+)'
    ]
    for p in patterns:
        t = re.sub(p, '', t, flags=re.IGNORECASE).strip()
    
    # Strip redundant absence and filler chatter
    t = re.sub(r'\s*there(\s+is|\'?s)?\s+no\s+(indication|sign|evidence)\s+of\s+any\s+[^.]*\.?', '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'\s*the\s+(car|vehicle)\s+is\s+stationary[^.]*\.?', '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'\s*the\s+(street|scene|area)\s+appears\s+to\s+be\s+safe[^.]*\.?', '', t, flags=re.IGNORECASE).strip()
    t = re.sub(r'\s*and\s+(there\s+are\s+)?no\s+recognizable\s+(courier|delivery|known\s+entities)[^.]*\.?', '', t, flags=re.IGNORECASE).strip()

    # Clean trailing threat verdict redundancy if at end of sentence
    t = re.sub(r'[\s.]*(the\s+)?(safety\s+)?threat\s+(level|assessment)\s+(is\s+|appears\s+to\s+be\s+)?\[?(safe|suspicious|threat)\]?\.?$', '.', t, flags=re.IGNORECASE).strip()
    
    # Normalize spacing
    t = ' '.join(t.split()).strip()

    # Capitalize first letter
    if t and t[0].islower():
        t = t[0].upper() + t[1:]
    return t

def _get_ollama_base_url(config: AIVisionConfig) -> str:
    """Resolves the proper Ollama API endpoint, automatically routing localhost to host.docker.internal in Docker."""
    raw = (config.base_url or "").strip().rstrip('/')
    if not raw:
        if Path('/.dockerenv').exists() or Path('/run/.containerenv').exists():
            return "http://host.docker.internal:11434"
        return "http://localhost:11434"
    if Path('/.dockerenv').exists() or Path('/run/.containerenv').exists():
        raw = raw.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal")
    return raw

def encode_image_base64(image_input) -> str:
    """Encodes a numpy ndarray frame or file path into an optimized base64 string (max 768px for sub-second API upload)."""
    if isinstance(image_input, (str, bytes, Path)):
        # Read from file path and optimize dimensions
        img = cv2.imread(str(image_input))
        if img is not None:
            image_input = img
        else:
            with open(str(image_input), "rb") as f:
                return base64.b64encode(f.read()).decode('utf-8')
    
    if isinstance(image_input, np.ndarray):
        h, w = image_input.shape[:2]
        # Scale down to max 640px width/height for sub-second upload without detail loss for LLMs
        if max(h, w) > 640:
            scale = 640.0 / max(h, w)
            image_input = cv2.resize(image_input, (int(w * scale), int(h * scale)))
        ret, buf = cv2.imencode('.jpg', image_input, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        if ret:
            return base64.b64encode(buf.tobytes()).decode('utf-8')
    raise ValueError("Invalid image input for base64 encoding")

def analyze_snapshot_with_ai(
    image_input,
    config: AIVisionConfig,
    last_description: Optional[str] = None,
    stationary_objects_note: Optional[str] = None,
    memory_config: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Sends frame snapshot to configured AI Vision Provider (Gemini, OpenAI, Ollama, Custom).
    Applies anti-repetition rules so stationary parked vehicles (e.g. project cars) are not repeated.
    Returns: {"description": str, "threat_level": "Safe" | "Suspicious" | "Threat"}
    """
    if not config.enabled or not config.api_key and config.provider != 'ollama':
        return {
            "description": "AI Vision enhancement is not configured or disabled.",
            "threat_level": "Safe"
        }

    b64_img = encode_image_base64(image_input)
    base_prompt = config.prompt_template or (
        "Analyze this surveillance security snapshot. Provide a concise 1-2 sentence description "
        "of what the person, vehicle, or subject is doing. Note clothing color, vehicle make/color, "
        "and conclude with threat assessment: [Safe], [Suspicious], or [Threat]."
    )

    prompt_parts = [base_prompt, "\nANTI-REPETITION & STATIONARY VEHICLE RULES:"]
    prompt_parts.append(
        "- DO NOT describe or repeat mention of stationary/parked resident or project cars (e.g. red Cooper S or parked cars in driveway) that are parked and unchanged from previous notifications."
    )
    prompt_parts.append(
        "- ONLY mention a vehicle if it is actively in motion, newly arrived, departing, occupied, or if someone is touching or tampering with it."
    )
    prompt_parts.append(
        "- Focus strictly on dynamic events: persons walking, arriving/departing people, couriers, animals, or perimeter activity."
    )

    if last_description and not last_description.startswith("AI Vision") and not last_description.startswith("Gemini API Error"):
        prompt_parts.append(
            f"- Note: The previous alert on this camera reported: \"{last_description}\". Do not repeat identical details or static background elements; focus only on what is new or changed."
        )

    if stationary_objects_note:
        prompt_parts.append(f"- Context: {stationary_objects_note}")

    if memory_config and getattr(memory_config, 'enabled', True):
        items = getattr(memory_config, 'items', [])
        active_items = [m for m in items if getattr(m, 'enabled', True)]
        if active_items:
            mem_lines = [
                "\nAI RECOGNITION MEMORY & KNOWN ENTITIES:",
                "You have learned memory knowledge of regular visitors, delivery couriers, recognized vehicles, and residents.",
                "If any subject in the snapshot matches the visual cues below, EXPLICITLY identify them by their recognized name in your 1-2 sentence description and assign their corresponding threat level:"
            ]
            for item in active_items:
                name = getattr(item, 'name', '')
                category = getattr(item, 'category', 'custom').upper()
                cues = getattr(item, 'cues', '')
                action_note = getattr(item, 'action_note', '')
                threat = getattr(item, 'threat_bias', 'Safe')
                note_str = f" Context/Action: {action_note}." if action_note else ""
                mem_lines.append(f"- [{category}: {name}] Visual cues: {cues}.{note_str} (Threat: [{threat}])")
            
            mem_lines.append(
                "CRITICAL: Only match an entity if the specific visual cues (e.g. logos, uniforms, vehicle models) are CLEARLY visible in the frame. If the subject does NOT match, describe the person and vehicle objectively without using the entity name."
            )
            prompt_parts.append("\n".join(mem_lines))

    prompt_parts.append(
        "\nSTYLE & BREVITY INSTRUCTIONS:\n"
        "- Be direct and concise: maximum 1 to 2 sentences (under 25 words).\n"
        "- Do NOT include preamble like 'The image is a photo that depicts', 'This is a snapshot', or describe image quality.\n"
        "- Do NOT list things that are missing or absent (e.g. do not say 'no people or vehicles in motion')."
    )

    prompt = "\n".join(prompt_parts)

    try:
        if config.provider == "gemini":
            # Google Gemini Vision API
            model = config.model_name or "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={config.api_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": b64_img
                            }
                        }
                    ]
                }]
            }
            
            resp = None
            last_err = None
            for attempt in range(2):
                try:
                    resp = requests.post(url, json=payload, timeout=25)
                    if resp.status_code == 200:
                        break
                    time.sleep(0.5)
                except requests.RequestException as rex:
                    last_err = rex
                    if attempt == 0:
                        time.sleep(1.0)
                    else:
                        raise last_err

            if resp is None or resp.status_code != 200:
                err_detail = resp.text[:120] if resp else str(last_err)
                return {
                    "description": f"Gemini API Error ({resp.status_code if resp else 'network'}): {err_detail}",
                    "threat_level": "Safe"
                }
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            threat = _parse_threat_level(text)
            text = _clean_vision_boilerplate(text)
            return {"description": text, "threat_level": threat}

        elif config.provider == "openai" or config.provider == "custom":
            # OpenAI or OpenAI-compatible endpoint
            base = config.base_url.rstrip('/') if config.base_url else "https://api.openai.com/v1"
            url = f"{base}/chat/completions"
            headers = {
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": config.model_name or "gpt-4o-mini",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}
                            }
                        ]
                    }
                ],
                "max_tokens": 150
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=25)
            if resp.status_code != 200:
                return {
                    "description": f"OpenAI API Error ({resp.status_code}): {resp.text[:120]}",
                    "threat_level": "Safe"
                }
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()
            threat = _parse_threat_level(text)
            text = _clean_vision_boilerplate(text)
            return {"description": text, "threat_level": threat}

        elif config.provider == "ollama":
            # Local Ollama Multimodal Vision (llava / moondream / llama3.2-vision)
            base = _get_ollama_base_url(config)
            url = f"{base}/api/generate"
            payload = {
                "model": config.model_name or "llava",
                "prompt": prompt,
                "images": [b64_img],
                "stream": False,
                "options": {
                    "num_predict": 75,
                    "temperature": 0.2
                }
            }
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code != 200:
                return {
                    "description": f"Ollama Error ({resp.status_code}): {resp.text[:120]}",
                    "threat_level": "Safe"
                }
            data = resp.json()
            text = data.get("response", "").strip()
            threat = _parse_threat_level(text)
            text = _clean_vision_boilerplate(text)
            return {"description": text, "threat_level": threat}

    except requests.Timeout:
        return {
            "description": "AI Vision request timed out. Security targets classified locally by NVR neural detector.",
            "threat_level": "Safe"
        }
    except Exception as e:
        return {
            "description": f"AI Vision service temporarily unavailable: {str(e)[:100]}",
            "threat_level": "Safe"
        }

    return {"description": "Provider not supported", "threat_level": "Safe"}

def _parse_threat_level(text: str) -> str:
    """Extracts Safe / Suspicious / Threat level from model output with accurate verdict parsing."""
    lower = text.lower()
    
    # 1. Exact bracketed or formatted verdict checks
    if "[threat]" in lower or "verdict: threat" in lower or "assessment: threat" in lower:
        return "Threat"
    if "[suspicious]" in lower or "verdict: suspicious" in lower or "assessment: suspicious" in lower:
        return "Suspicious"
    if "[safe]" in lower or "verdict: safe" in lower or "assessment: safe" in lower or "safety threat:** safe" in lower or "safety threat: safe" in lower:
        return "Safe"

    # 2. Check for explicit safe statements before raw keyword search
    if any(p in lower for p in ["no suspicious", "not suspicious", "no sign of any suspicious", "no threat", "threat level is low", "threat level of this image is low", "no safety threat", "not threatening", "threat: low", "appears to be safe"]):
        return "Safe"

    # 3. Keywords
    if "weapon" in lower or "intruder" in lower or "armed" in lower or "break-in" in lower or "burglary" in lower:
        return "Threat"
    if "suspicious" in lower or "caution" in lower or "loitering" in lower or "prowling" in lower or "lurking" in lower:
        return "Suspicious"

    # Default to Safe if model concludes Safe or no negative indicators found
    return "Safe"

def test_ai_vision_connection(config: AIVisionConfig) -> Dict[str, Any]:
    """Generates a test security frame and verifies AI Vision API credentials and responses."""
    # Create test surveillance test frame
    test_img = np.zeros((360, 640, 3), dtype=np.uint8)
    cv2.rectangle(test_img, (0, 0), (640, 360), (20, 25, 35), -1)
    cv2.putText(test_img, "GAWKR AI TEST FRAME", (80, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 220, 255), 2)
    cv2.putText(test_img, "Simulated Delivery Courier with Package", (80, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 230, 160), 1)
    cv2.circle(test_img, (520, 180), 40, (100, 140, 200), -1)
    cv2.rectangle(test_img, (490, 220), (550, 270), (80, 60, 40), -1)

    return analyze_snapshot_with_ai(test_img, config)

def extract_memory_profile_from_snapshot(
    image_input,
    config: AIVisionConfig
) -> Dict[str, Any]:
    """
    Analyzes an image snapshot to profile a subject (courier, person, vehicle)
    for AI Recognition Memory, returning suggested name, category, visual cues, and action.
    """
    if not config.enabled or not config.api_key and config.provider != 'ollama':
        return {
            "name": "Recognized Subject",
            "category": "custom",
            "cues": "Visual subject detected in snapshot.",
            "action_note": "",
            "threat_bias": "Safe"
        }

    b64_img = encode_image_base64(image_input)
    prompt = (
        "You are an expert security vision AI profiling a subject from a camera snapshot to add to AI Recognition Memory. "
        "Examine the primary person, delivery courier, vehicle, or subject in this image.\n"
        "Respond with ONLY a single valid JSON object, without markdown formatting or code blocks, matching this schema:\n"
        "{\n"
        '  "name": "<Short descriptive name, e.g. Amazon Delivery Driver, Royal Mail Postie, Resident in Navy Jacket, White Van>",\n'
        '  "category": "<one of: courier, person, vehicle, custom>",\n'
        '  "cues": "<Detailed distinctive visual cues, including clothing colors, logos, badges, hats, packages, vehicle make/color, distinctive markings>",\n'
        '  "action_note": "<Observed activity, e.g. Delivering package to front door, Walking to entrance, Parked in driveway>",\n'
        '  "threat_bias": "<one of: Safe, Suspicious, High>"\n'
        "}"
    )

    raw_text = ""
    try:
        if config.provider == "gemini":
            model = config.model_name or "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={config.api_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": b64_img
                            }
                        }
                    ]
                }]
            }
            resp = requests.post(url, json=payload, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        elif config.provider in ["openai", "custom"]:
            base = config.base_url.rstrip('/') if config.base_url else "https://api.openai.com/v1"
            url = f"{base}/chat/completions"
            headers = {
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": config.model_name or "gpt-4o-mini",
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                    ]
                }],
                "max_tokens": 300
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"].strip()
        elif config.provider == "ollama":
            base = _get_ollama_base_url(config)
            url = f"{base}/api/generate"
            payload = {
                "model": config.model_name or "moondream",
                "prompt": prompt,
                "images": [b64_img],
                "stream": False
            }
            resp = requests.post(url, json=payload, timeout=30)
            if resp.status_code == 200:
                raw_text = resp.json().get("response", "").strip()
    except Exception as e:
        print(f"Error in extract_memory_profile_from_snapshot: {e}")

    # Parse JSON from raw_text
    if raw_text:
        clean_text = raw_text
        if "```" in clean_text:
            parts = clean_text.split("```")
            if len(parts) > 1:
                clean_text = parts[1]
                if clean_text.startswith("json"):
                    clean_text = clean_text[4:]
                clean_text = clean_text.strip()
        try:
            parsed = json.loads(clean_text)
            cat = str(parsed.get("category", "custom")).lower()
            if cat not in ["courier", "person", "vehicle", "custom"]:
                cat = "custom"
            tb = str(parsed.get("threat_bias", "Safe"))
            if tb not in ["Safe", "Suspicious", "High"]:
                tb = "Safe"
            return {
                "name": str(parsed.get("name", "Recognized Subject")),
                "category": cat,
                "cues": str(parsed.get("cues", "Visual cues identified by camera")),
                "action_note": str(parsed.get("action_note", "")),
                "threat_bias": tb
            }
        except Exception:
            pass

    return {
        "name": "Recognized Subject",
        "category": "custom",
        "cues": raw_text or "Visual cues identified by camera snapshot",
        "action_note": "",
        "threat_bias": "Safe"
    }
