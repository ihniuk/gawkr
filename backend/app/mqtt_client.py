import time
import json
import threading
from typing import Dict, Any, Optional
import paho.mqtt.client as mqtt
from app.models import MqttConfig, DetectionEvent
from app.storage import get_system_settings

class MQTTService:
    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self._lock = threading.Lock()

    def _get_client(self, config: MqttConfig) -> Optional[mqtt.Client]:
        if not config.enabled or not config.broker_url:
            return None

        # Parse broker_url e.g. "localhost:1883" or "mqtt://user:pass@192.168.1.50:1883"
        host = config.broker_url
        port = 1883
        username = None
        password = None

        if "://" in host:
            host = host.split("://", 1)[1]
        if "@" in host:
            auth_part, host_part = host.split("@", 1)
            host = host_part
            if ":" in auth_part:
                username, password = auth_part.split(":", 1)
            else:
                username = auth_part
        if ":" in host:
            host, port_str = host.split(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                port = 1883

        try:
            client = mqtt.Client(client_id="gawkr_nvr_server")
            if username:
                client.username_pw_set(username, password)
            client.connect(host, port, keepalive=60)
            client.loop_start()
            return client
        except Exception as e:
            print(f"MQTT connection error: {e}")
            return None

    def publish_ha_discovery(self, camera_id: str, camera_name: str, config: MqttConfig):
        """Publishes Home Assistant MQTT Auto-Discovery topics for binary_sensor and sensor entities."""
        client = self._get_client(config)
        if not client:
            return

        device_info = {
            "identifiers": [f"gawkr_{camera_id}"],
            "name": f"Gawkr {camera_name}",
            "manufacturer": "Gawkr",
            "model": "AI Camera Stream"
        }

        # 1. Motion Binary Sensor
        motion_topic = f"homeassistant/binary_sensor/vision_nvr_{camera_id}_motion/config"
        motion_payload = {
            "name": f"{camera_name} Motion",
            "unique_id": f"vision_nvr_{camera_id}_motion",
            "state_topic": f"vision_nvr/{camera_id}/motion",
            "device_class": "motion",
            "device": device_info
        }
        client.publish(motion_topic, json.dumps(motion_payload), retain=True)

        # 2. AI Detection Sensor
        detection_topic = f"homeassistant/sensor/vision_nvr_{camera_id}_detection/config"
        detection_payload = {
            "name": f"{camera_name} Detected Object",
            "unique_id": f"vision_nvr_{camera_id}_detection",
            "state_topic": f"vision_nvr/{camera_id}/detection",
            "value_template": "{{ value_json.label }}",
            "json_attributes_topic": f"vision_nvr/{camera_id}/detection",
            "icon": "mdi:cctv",
            "device": device_info
        }
        client.publish(detection_topic, json.dumps(detection_payload), retain=True)
        time.sleep(0.1)
        client.loop_stop()
        client.disconnect()

    def publish_event(self, event: DetectionEvent, config: MqttConfig):
        """Publishes event state to MQTT broker."""
        client = self._get_client(config)
        if not client:
            return

        cam_id = event.camera_id
        label = event.objects[0].label if event.objects else "motion"
        conf = round(event.objects[0].confidence, 2) if event.objects else 1.0

        # Motion ON
        client.publish(f"vision_nvr/{cam_id}/motion", "ON")

        # Detailed payload
        payload = {
            "camera_id": cam_id,
            "camera_name": event.camera_name,
            "label": label,
            "confidence": conf,
            "threat_level": getattr(event, 'threat_level', 'Safe'),
            "ai_description": getattr(event, 'ai_description', ''),
            "timestamp": event.timestamp
        }
        client.publish(f"vision_nvr/{cam_id}/detection", json.dumps(payload))

        # Auto-reset motion to OFF after 8 seconds in a background thread
        def _reset_motion():
            time.sleep(8)
            try:
                c = self._get_client(config)
                if c:
                    c.publish(f"vision_nvr/{cam_id}/motion", "OFF")
                    time.sleep(0.1)
                    c.loop_stop()
                    c.disconnect()
            except Exception:
                pass

        threading.Thread(target=_reset_motion, daemon=True).start()
        time.sleep(0.1)
        client.loop_stop()
        client.disconnect()

mqtt_service = MQTTService()
