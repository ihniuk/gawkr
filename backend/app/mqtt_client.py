import json
import threading
import time
from typing import Any, Dict, Optional, Tuple
import urllib.parse
import paho.mqtt.client as mqtt

from app.models import CameraUpdate, DetectionEvent, MqttConfig


def _create_mqtt_client(client_id: str) -> mqtt.Client:
    """Creates a paho-mqtt Client compatible with both paho-mqtt 1.x and 2.x."""
    if hasattr(mqtt, "CallbackAPIVersion"):
        return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    return mqtt.Client(client_id=client_id)


def parse_broker_connection(config: MqttConfig) -> Optional[Tuple[str, int, str, str]]:
    """Parses MQTT connection parameters from broker_url or explicit host/port/credential fields."""
    raw_url = (config.broker_url or "").strip()
    host = (config.broker_host or "").strip()
    port = int(config.broker_port or 1883)
    username = config.username or ""
    password = config.password or ""

    if raw_url:
        normalized = raw_url if "://" in raw_url else f"mqtt://{raw_url}"
        parsed = urllib.parse.urlparse(normalized)
        if parsed.hostname:
            host = parsed.hostname
        if parsed.port:
            port = parsed.port
        if parsed.username and not username:
            username = urllib.parse.unquote(parsed.username)
        if parsed.password and not password:
            password = urllib.parse.unquote(parsed.password)

    if not host:
        return None
    return host, port, username, password


def _topic_prefix(config: MqttConfig) -> str:
    prefix = (config.topic_prefix or "homeassistant/nvr").strip().strip("/")
    return prefix or "homeassistant/nvr"


class MQTTService:
    """Persistent Home Assistant MQTT auto-discovery, live CCTV snapshot, and command service."""

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected = False
        self._lock = threading.Lock()
        self._conn_sig: Optional[Tuple[str, int, str, str, str]] = None

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.is_connected = True
        prefix = self._conn_sig[4] if self._conn_sig else "homeassistant/nvr"
        client.publish(f"{prefix}/status", "online", retain=True)
        client.subscribe(f"{prefix}/+/ai/set")
        client.subscribe(f"{prefix}/+/test_alert")

    def _on_disconnect(self, client, userdata, *args):
        self.is_connected = False

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic or ""
            payload = msg.payload.decode("utf-8", errors="ignore").strip()
            parts = topic.split("/")
            # Expected: <prefix>/<camera_id>/ai/set or <prefix>/<camera_id>/test_alert
            if len(parts) >= 3 and parts[-2] == "ai" and parts[-1] == "set":
                cam_id = parts[-3]
                enabled = payload.upper() in {"ON", "TRUE", "1", "ENABLE", "ENABLED"}
                self._handle_ai_toggle(cam_id, enabled)
            elif len(parts) >= 2 and parts[-1] == "test_alert":
                cam_id = parts[-2]
                self._handle_test_alert(cam_id)
        except Exception as e:
            print(f"MQTT command handler error: {e}")

    def _handle_ai_toggle(self, camera_id: str, enabled: bool):
        from app.camera_manager import camera_manager
        from app.storage import get_system_settings

        cam = camera_manager.get(camera_id)
        if not cam:
            return
        cam.settings.ai_enabled = enabled
        camera_manager.update(camera_id, CameraUpdate(settings=cam.settings))
        cfg = get_system_settings().notifications.mqtt
        if cfg.enabled:
            client = self.ensure_connected(cfg)
            if client:
                prefix = _topic_prefix(cfg)
                client.publish(f"{prefix}/{camera_id}/ai/state", "ON" if enabled else "OFF", retain=True)

    def _handle_test_alert(self, camera_id: str):
        from app.camera_manager import camera_manager

        worker = camera_manager.get_worker(camera_id)
        if worker:
            worker.trigger_manual_alert()

    def ensure_connected(self, config: MqttConfig) -> Optional[mqtt.Client]:
        """Returns a connected persistent MQTT client, reconnecting if config changed."""
        if not config.enabled:
            return None
        parsed = parse_broker_connection(config)
        if not parsed:
            return None

        host, port, username, password = parsed
        prefix = _topic_prefix(config)
        sig = (host, port, username, password, prefix)

        with self._lock:
            if self.client is not None and self._conn_sig == sig and self.is_connected:
                return self.client

            if self.client is not None:
                try:
                    self.client.loop_stop()
                    self.client.disconnect()
                except Exception:
                    pass
                self.client = None
                self.is_connected = False

            try:
                client = _create_mqtt_client(client_id="gawkr_nvr_server")
                if username:
                    client.username_pw_set(username, password)
                client.will_set(f"{prefix}/status", "offline", retain=True)
                client.on_connect = self._on_connect
                client.on_disconnect = self._on_disconnect
                client.on_message = self._on_message
                client.reconnect_delay_set(min_delay=1, max_delay=30)
                client.connect(host, port, keepalive=60)
                client.loop_start()
                self._conn_sig = sig
                self.client = client
                # Brief wait so initial connect/LWT completes cleanly
                deadline = time.time() + 1.5
                while not self.is_connected and time.time() < deadline:
                    time.sleep(0.05)
                return client
            except Exception as e:
                print(f"MQTT connection error: {e}")
                self.client = None
                self.is_connected = False
                return None

    def build_ha_discovery_payloads(
        self,
        camera_id: str,
        camera_name: str,
        config: MqttConfig,
        camera: Optional[Any] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Builds all Home Assistant MQTT auto-discovery topics and payloads for a camera."""
        prefix = _topic_prefix(config)
        availability = {"availability_topic": f"{prefix}/status"}
        device_info = {
            "identifiers": [f"gawkr_{camera_id}"],
            "name": f"Gawkr {camera_name}",
            "manufacturer": getattr(camera, "vendor", None) or "Gawkr",
            "model": getattr(camera, "model", None) or "AI Camera Stream",
            "sw_version": "1.0.0",
        }

        return {
            f"homeassistant/camera/gawkr_{camera_id}/config": {
                "name": f"{camera_name} Live",
                "unique_id": f"gawkr_{camera_id}_camera",
                "topic": f"{prefix}/{camera_id}/snapshot",
                "device": device_info,
                **availability,
            },
            f"homeassistant/binary_sensor/vision_nvr_{camera_id}_motion/config": {
                "name": f"{camera_name} Motion",
                "unique_id": f"vision_nvr_{camera_id}_motion",
                "state_topic": f"vision_nvr/{camera_id}/motion",
                "device_class": "motion",
                "device": device_info,
                **availability,
            },
            f"homeassistant/binary_sensor/gawkr_{camera_id}_online/config": {
                "name": f"{camera_name} Online",
                "unique_id": f"gawkr_{camera_id}_online",
                "state_topic": f"{prefix}/{camera_id}/online",
                "device_class": "connectivity",
                "entity_category": "diagnostic",
                "device": device_info,
                **availability,
            },
            f"homeassistant/sensor/vision_nvr_{camera_id}_detection/config": {
                "name": f"{camera_name} Detected Object",
                "unique_id": f"vision_nvr_{camera_id}_detection",
                "state_topic": f"vision_nvr/{camera_id}/detection",
                "value_template": "{{ value_json.label }}",
                "json_attributes_topic": f"vision_nvr/{camera_id}/detection",
                "icon": "mdi:cctv",
                "device": device_info,
                **availability,
            },
            f"homeassistant/sensor/gawkr_{camera_id}_threat/config": {
                "name": f"{camera_name} Threat Level",
                "unique_id": f"gawkr_{camera_id}_threat",
                "state_topic": f"{prefix}/{camera_id}/threat",
                "icon": "mdi:shield-alert-outline",
                "device": device_info,
                **availability,
            },
            f"homeassistant/sensor/gawkr_{camera_id}_fps/config": {
                "name": f"{camera_name} FPS",
                "unique_id": f"gawkr_{camera_id}_fps",
                "state_topic": f"{prefix}/{camera_id}/fps",
                "unit_of_measurement": "FPS",
                "state_class": "measurement",
                "entity_category": "diagnostic",
                "icon": "mdi:speedometer",
                "device": device_info,
                **availability,
            },
            f"homeassistant/switch/gawkr_{camera_id}_ai/config": {
                "name": f"{camera_name} AI Detection",
                "unique_id": f"gawkr_{camera_id}_ai_switch",
                "command_topic": f"{prefix}/{camera_id}/ai/set",
                "state_topic": f"{prefix}/{camera_id}/ai/state",
                "icon": "mdi:brain",
                "device": device_info,
                **availability,
            },
            f"homeassistant/button/gawkr_{camera_id}_test_alert/config": {
                "name": f"{camera_name} Test Alert",
                "unique_id": f"gawkr_{camera_id}_test_alert",
                "command_topic": f"{prefix}/{camera_id}/test_alert",
                "icon": "mdi:bell-ring-outline",
                "device": device_info,
                **availability,
            },
        }

    def publish_ha_discovery(
        self,
        camera_id: str,
        camera_name: str,
        config: MqttConfig,
        camera: Optional[Any] = None,
    ) -> bool:
        """Publishes Home Assistant MQTT Auto-Discovery configs and initial states for a camera."""
        if not getattr(config, "ha_discovery", True):
            return False
        client = self.ensure_connected(config)
        if not client:
            return False

        payloads = self.build_ha_discovery_payloads(camera_id, camera_name, config, camera=camera)
        for topic, payload in payloads.items():
            client.publish(topic, json.dumps(payload), retain=True)

        prefix = _topic_prefix(config)
        ai_on = getattr(getattr(camera, "settings", None), "ai_enabled", True) if camera else True
        is_online = getattr(camera, "is_online", False) if camera else False
        client.publish(f"{prefix}/{camera_id}/ai/state", "ON" if ai_on else "OFF", retain=True)
        client.publish(f"{prefix}/{camera_id}/online", "ON" if is_online else "OFF", retain=True)
        client.publish(f"vision_nvr/{camera_id}/motion", "OFF", retain=False)
        return True

    def remove_ha_discovery(self, camera_id: str, config: MqttConfig):
        """Removes Home Assistant MQTT discovery entries when a camera is deleted."""
        client = self.ensure_connected(config)
        if not client:
            return
        payloads = self.build_ha_discovery_payloads(camera_id, camera_id, config)
        for topic in payloads:
            client.publish(topic, "", retain=True)

    def publish_camera_state(
        self,
        camera_id: str,
        is_online: bool,
        fps: float,
        ai_enabled: bool,
        jpeg_bytes: Optional[bytes],
        config: MqttConfig,
    ):
        """Publishes live camera availability, FPS, AI toggle state, and JPEG snapshot."""
        client = self.ensure_connected(config)
        if not client:
            return
        prefix = _topic_prefix(config)
        client.publish(f"{prefix}/{camera_id}/online", "ON" if is_online else "OFF")
        client.publish(f"{prefix}/{camera_id}/fps", str(round(fps, 1)))
        client.publish(f"{prefix}/{camera_id}/ai/state", "ON" if ai_enabled else "OFF")
        if jpeg_bytes and getattr(config, "publish_live_snapshots", True):
            client.publish(f"{prefix}/{camera_id}/snapshot", jpeg_bytes)

    def publish_event(
        self,
        event: DetectionEvent,
        config: MqttConfig,
        snapshot_bytes: Optional[bytes] = None,
    ):
        """Publishes AI detection event state, threat level, and snapshot to MQTT."""
        client = self.ensure_connected(config)
        if not client:
            return

        prefix = _topic_prefix(config)
        cam_id = event.camera_id
        label = event.objects[0].label if event.objects else "motion"
        conf = round(event.objects[0].confidence, 2) if event.objects else 1.0
        threat = getattr(event, "threat_level", "Safe") or "Safe"

        client.publish(f"vision_nvr/{cam_id}/motion", "ON")
        client.publish(f"{prefix}/{cam_id}/threat", threat)
        if snapshot_bytes:
            client.publish(f"{prefix}/{cam_id}/snapshot", snapshot_bytes)

        payload = {
            "camera_id": cam_id,
            "camera_name": event.camera_name,
            "label": label,
            "confidence": conf,
            "threat_level": threat,
            "ai_description": getattr(event, "ai_description", "") or "",
            "snapshot_url": getattr(event, "snapshot_url", "") or "",
            "video_clip_url": getattr(event, "video_clip_url", "") or "",
            "timestamp": event.timestamp,
        }
        client.publish(f"vision_nvr/{cam_id}/detection", json.dumps(payload))

        def _reset_motion():
            time.sleep(8)
            try:
                c = self.ensure_connected(config)
                if c:
                    c.publish(f"vision_nvr/{cam_id}/motion", "OFF")
            except Exception:
                pass

        threading.Thread(target=_reset_motion, daemon=True).start()

    def sync_all_cameras(self, cameras, config: MqttConfig) -> int:
        """Publishes Home Assistant MQTT discovery for all registered cameras."""
        count = 0
        for cam in cameras:
            if self.publish_ha_discovery(cam.id, cam.name, config, camera=cam):
                count += 1
        return count

    def shutdown(self):
        with self._lock:
            if self.client is not None:
                try:
                    prefix = self._conn_sig[4] if self._conn_sig else "homeassistant/nvr"
                    self.client.publish(f"{prefix}/status", "offline", retain=True)
                    time.sleep(0.05)
                    self.client.loop_stop()
                    self.client.disconnect()
                except Exception:
                    pass
                self.client = None
                self.is_connected = False


mqtt_service = MQTTService()
