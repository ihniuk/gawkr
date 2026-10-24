import requests
import json
import time
import html
from typing import Dict, Any, Optional
from pathlib import Path
from app.models import NotificationsConfig, DetectionEvent

def dispatch_event_notifications(event: DetectionEvent, config: NotificationsConfig, snapshot_path: Optional[str] = None):
    """Dispatches a confirmed AI alert to all configured notification services without blocking."""
    # 1. Telegram
    if config.telegram.enabled and config.telegram.bot_token and config.telegram.chat_id:
        try:
            send_telegram_alert(config.telegram.bot_token, config.telegram.chat_id, event, snapshot_path)
        except Exception as e:
            print(f"Telegram dispatch error: {e}")

    # 2. Discord Webhook
    if config.discord.enabled and config.discord.webhook_url:
        try:
            send_discord_alert(config.discord.webhook_url, event, snapshot_path)
        except Exception as e:
            print(f"Discord dispatch error: {e}")

    # 3. Slack Webhook
    if config.slack.enabled and config.slack.webhook_url:
        try:
            send_slack_alert(config.slack.webhook_url, event)
        except Exception as e:
            print(f"Slack dispatch error: {e}")

    # 4. Pushover
    if config.pushover.enabled and config.pushover.user_key and config.pushover.api_token:
        try:
            send_pushover_alert(config.pushover.user_key, config.pushover.api_token, event)
        except Exception as e:
            print(f"Pushover dispatch error: {e}")

    # 5. MQTT & Home Assistant
    if config.mqtt.enabled and config.mqtt.broker_url:
        try:
            from app.mqtt_client import mqtt_service
            mqtt_service.publish_event(event, config.mqtt)
        except Exception as e:
            print(f"MQTT dispatch error: {e}")

# ----------------- TELEGRAM -----------------

def _format_detected_labels(objects: list) -> str:
    """Formats detected objects filtering out repetitive stationary/parked vehicles."""
    active_labels = []
    for o in objects:
        is_stat = getattr(o, 'is_stationary', False) and not getattr(o, 'has_moved', True)
        if is_stat:
            continue
        status_tag = " (IN MOTION)" if getattr(o, 'has_moved', False) and o.label in ["car", "truck", "motorcycle", "bus"] else ""
        active_labels.append(f"{o.label.upper()}{status_tag} ({int(o.confidence * 100)}%)")
    if not active_labels:
        active_labels = [f"{o.label.upper()} ({int(o.confidence * 100)}%)" for o in objects]
    return ', '.join(active_labels)

def send_telegram_alert(bot_token: str, chat_id: str, event: Any, snapshot_path: Optional[str] = None) -> Dict[str, Any]:
    cam_name = html.escape(str(getattr(event, 'camera_name', 'Surveillance')))
    time_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(getattr(event, 'timestamp', time.time())))
    threat = getattr(event, 'threat_level', 'Safe')
    threat_icon = "🟢" if threat == "Safe" else "🟡" if threat == "Suspicious" else "🔴"
    
    caption_html = (
        f"🚨 <b>GAWKR ALERT</b>\n"
        f"📹 <b>Camera:</b> {cam_name}\n"
        f"🕒 <b>Time:</b> {time_str}\n"
        f"🛡️ <b>Threat Level:</b> {threat_icon} {html.escape(str(threat))}\n"
    )
    if hasattr(event, 'objects') and event.objects:
        labels_str = _format_detected_labels(event.objects)
        caption_html += f"🎯 <b>Detected:</b> {html.escape(labels_str)}\n"
    if hasattr(event, 'ai_description') and event.ai_description:
        caption_html += f"🧠 <b>AI Vision:</b> <i>{html.escape(str(event.ai_description))}</i>\n"

    # Plain text fallback if HTML parser encounters any issue
    caption_plain = (
        f"🚨 GAWKR ALERT\n"
        f"📹 Camera: {getattr(event, 'camera_name', 'Surveillance')}\n"
        f"🕒 Time: {time_str}\n"
        f"🛡️ Threat Level: {threat}\n"
    )
    if hasattr(event, 'objects') and event.objects:
        labels_str = _format_detected_labels(event.objects)
        caption_plain += f"🎯 Detected: {labels_str}\n"
    if hasattr(event, 'ai_description') and event.ai_description:
        caption_plain += f"🧠 AI Vision: {event.ai_description}\n"

    # Dispatch: Try HTML first, automatically fallback to plain text if Telegram rejects markup
    resp = None
    if snapshot_path and Path(snapshot_path).exists():
        url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
        with open(snapshot_path, "rb") as f:
            resp = requests.post(url, data={"chat_id": chat_id, "caption": caption_html, "parse_mode": "HTML"}, files={"photo": f}, timeout=10)
        if resp.status_code != 200:
            with open(snapshot_path, "rb") as f:
                resp = requests.post(url, data={"chat_id": chat_id, "caption": caption_plain}, files={"photo": f}, timeout=10)
    else:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = requests.post(url, json={"chat_id": chat_id, "text": caption_html, "parse_mode": "HTML"}, timeout=10)
        if resp.status_code != 200:
            resp = requests.post(url, json={"chat_id": chat_id, "text": caption_plain}, timeout=10)

    if resp.status_code != 200:
        raise Exception(f"Telegram error {resp.status_code}: {resp.text}")
    return {"success": True, "message": "Telegram alert dispatched successfully"}

# ----------------- DISCORD -----------------

def send_discord_alert(webhook_url: str, event: Any, snapshot_path: Optional[str] = None) -> Dict[str, Any]:
    threat = getattr(event, 'threat_level', 'Safe')
    color = 0xef4444 if threat == 'Threat' else 0xf59e0b if threat == 'Suspicious' else 0x06b6d4
    
    desc = getattr(event, 'ai_description', '')
    if not desc and hasattr(event, 'objects') and event.objects:
        labels_str = _format_detected_labels(event.objects)
        desc = f"Identified: {labels_str}"

    embed = {
        "title": f"🚨 Surveillance Alert: {getattr(event, 'camera_name', 'Security Camera')}",
        "description": desc or "AI object detection triggered a security event.",
        "color": color,
        "fields": [
            {"name": "Security Assessment", "value": f"**{threat}**", "inline": True},
            {"name": "Timestamp", "value": time.strftime('%H:%M:%S', time.localtime(getattr(event, 'timestamp', time.time()))), "inline": True}
        ],
        "footer": {"text": "Gawkr AI-NVR Server"}
    }

    payload = {"embeds": [embed]}

    if snapshot_path and Path(snapshot_path).exists():
        with open(snapshot_path, "rb") as f:
            resp = requests.post(
                webhook_url,
                data={"payload_json": json.dumps(payload)},
                files={"file": ("snapshot.jpg", f, "image/jpeg")},
                timeout=10
            )
    else:
        resp = requests.post(webhook_url, json=payload, timeout=10)

    if resp.status_code not in (200, 204):
        raise Exception(f"Discord error {resp.status_code}: {resp.text}")
    return {"success": True, "message": "Discord webhook delivered successfully"}

# ----------------- SLACK -----------------

def send_slack_alert(webhook_url: str, event: Any) -> Dict[str, Any]:
    cam = getattr(event, 'camera_name', 'Camera')
    desc = getattr(event, 'ai_description', '') or "Target movement confirmed by AI inference."
    payload = {
        "text": f"🚨 *Gawkr Alert: {cam}*\n{desc}"
    }
    resp = requests.post(webhook_url, json=payload, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Slack error {resp.status_code}: {resp.text}")
    return {"success": True, "message": "Slack message delivered"}

# ----------------- PUSHOVER -----------------

def send_pushover_alert(user_key: str, api_token: str, event: Any) -> Dict[str, Any]:
    cam = getattr(event, 'camera_name', 'Camera')
    desc = getattr(event, 'ai_description', '') or "AI detection triggered an alert."
    data = {
        "token": api_token,
        "user": user_key,
        "title": f"Gawkr: {cam}",
        "message": desc,
        "sound": "siren"
    }
    resp = requests.post("https://api.pushover.net/1/messages.json", data=data, timeout=10)
    if resp.status_code != 200:
        raise Exception(f"Pushover error {resp.status_code}: {resp.text}")
    return {"success": True, "message": "Pushover alert delivered"}
