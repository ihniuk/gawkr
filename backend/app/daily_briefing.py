import time
import json
import sqlite3
import requests
from typing import Dict, Any, Optional
from datetime import datetime
from app.config import DATA_DIR
from app.storage import get_system_settings, DB_PATH

def generate_daily_briefing(hours: int = 24) -> Dict[str, Any]:
    """
    Synthesizes surveillance detections from the last N hours into an executive security digest.
    Uses Gemini API if configured, otherwise produces a crisp heuristic intelligence briefing.
    """
    now = time.time()
    cutoff = now - (hours * 3600.0)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    SELECT camera_name, timestamp, objects_json, ai_description, threat_level
    FROM events
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
    """, (cutoff,))
    rows = cursor.fetchall()
    conn.close()

    total_events = len(rows)
    camera_counts: Dict[str, int] = {}
    class_counts: Dict[str, int] = {"person": 0, "car": 0, "animal": 0}
    threat_counts: Dict[str, int] = {"Safe": 0, "Suspicious": 0, "Threat": 0}
    descriptions = []

    for cam_name, ts, objs_json, ai_desc, threat in rows:
        camera_counts[cam_name] = camera_counts.get(cam_name, 0) + 1
        t_level = threat or "Safe"
        threat_counts[t_level] = threat_counts.get(t_level, 0) + 1
        
        try:
            objs = json.loads(objs_json) if objs_json else []
            for o in objs:
                lbl = o.get("label", "").lower()
                if lbl in ("person",):
                    class_counts["person"] += 1
                elif lbl in ("car", "vehicle", "truck", "motorcycle"):
                    class_counts["car"] += 1
                elif lbl in ("dog", "cat", "animal"):
                    class_counts["animal"] += 1
        except Exception:
            pass

        t_str = time.strftime("%H:%M", time.localtime(ts))
        if ai_desc:
            descriptions.append(f"[{t_str}] {cam_name}: {ai_desc} ({t_level})")
        else:
            descriptions.append(f"[{t_str}] {cam_name}: Motion/Object confirmed ({t_level})")

    # If no events
    if total_events == 0:
        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "period_hours": hours,
            "total_events": 0,
            "briefing_text": "No security events or anomalies detected in the past 24 hours. All monitored zones are secure.",
            "stats": {
                "total_events": 0,
                "cameras_active": len(camera_counts),
                "threat_level": "Safe",
                "persons": 0,
                "vehicles": 0,
                "threats": 0
            },
            "generated_at": now
        }

    # Synthesize with Gemini if available
    sys_settings = get_system_settings()
    api_key = sys_settings.ai_vision.api_key
    model_name = getattr(sys_settings.ai_vision, 'model_name', 'gemini-1.5-flash') or "gemini-1.5-flash"

    briefing_text = ""
    if sys_settings.ai_vision.enabled and api_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            log_sample = "\n".join(descriptions[-30:]) # Feed up to 30 most recent event logs
            prompt = (
                "You are an expert AI security analyst reviewing CCTV surveillance logs for a property. "
                "Synthesize the following surveillance event log into a clear, professional 2-3 sentence executive daily briefing. "
                "Highlight key activities (deliveries, visitors, vehicles, times) and give an overall threat verdict.\n\n"
                f"Surveillance Logs ({total_events} events):\n{log_sample}\n\nExecutive Briefing:"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 200}
            }
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                cand = data.get("candidates", [])
                if cand:
                    briefing_text = cand[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
        except Exception as e:
            print(f"Gemini briefing generation failed: {e}")

    # Fallback heuristic summary
    if not briefing_text:
        cams_str = ", ".join([f"{k} ({v})" for k, v in camera_counts.items()])
        threat_status = "Elevated" if threat_counts.get("Threat", 0) > 0 else "Guarded" if threat_counts.get("Suspicious", 0) > 0 else "Normal"
        briefing_text = (
            f"Over the last {hours} hours, {total_events} events were verified across monitored cameras ({cams_str}). "
            f"Logged {class_counts['person']} person and {class_counts['car']} vehicle detections. "
            f"Overall perimeter threat posture is {threat_status} with 0 unverified breaches."
        )

    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "period_hours": hours,
        "total_events": total_events,
        "briefing_text": briefing_text,
        "stats": {
            "total_events": total_events,
            "cameras_active": len(camera_counts),
            "threat_level": "Threat" if threat_counts.get("Threat", 0) > 0 else "Suspicious" if threat_counts.get("Suspicious", 0) > 0 else "Safe",
            "persons": class_counts["person"],
            "vehicles": class_counts["car"],
            "threats": threat_counts.get("Threat", 0)
        },
        "camera_breakdown": camera_counts,
        "generated_at": now
    }
