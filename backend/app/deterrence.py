import json
import logging
import threading
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.storage import get_system_settings
from app.logger import logger

class ActiveDeterrenceManager:
    """
    Monitors camera subject loitering / dwell time and triggers active deterrence
    (Home Assistant floodlights, flashing, sirens, critical notifications)
    when human presence exceeds perimeter thresholds.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.camera_dwell: Dict[str, Dict[str, Any]] = {}
        self.last_trigger_time: float = 0.0
        self.trigger_history: List[Dict[str, Any]] = []

    def _is_night_time(self, start_hour: int, end_hour: int) -> bool:
        current_hour = datetime.now().hour
        if start_hour > end_hour:
            # Overnights e.g. 22:00 to 06:00
            return current_hour >= start_hour or current_hour < end_hour
        else:
            return start_hour <= current_hour < end_hour

    def evaluate_dwell(
        self,
        camera_id: str,
        camera_name: str,
        detected_labels: List[str],
        now: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluates real-time dwell for person / vehicle activity on a given camera.
        Returns a trigger event dict if loitering threshold exceeded, else None.
        """
        now = now or time.time()
        has_subject = any(l.lower() in {"person", "human", "car", "truck", "van"} for l in detected_labels)

        with self._lock:
            state = self.camera_dwell.get(camera_id)
            if not has_subject:
                # If scene cleared for > 8s, reset dwell
                if state and (now - state["last_seen"] > 8.0):
                    self.camera_dwell.pop(camera_id, None)
                return None

            if not state:
                state = {
                    "first_seen": now,
                    "last_seen": now,
                    "camera_name": camera_name,
                    "labels": detected_labels
                }
                self.camera_dwell[camera_id] = state
                return None

            state["last_seen"] = now
            state["labels"] = detected_labels
            dwell_seconds = now - state["first_seen"]

        # Check settings
        settings = get_system_settings()
        cfg = settings.deterrence
        if not cfg.enabled:
            return None

        # Check dwell threshold
        if dwell_seconds < cfg.loiter_threshold_seconds:
            return None

        # Check night restriction
        if cfg.night_only and not self._is_night_time(cfg.night_start_hour, cfg.night_end_hour):
            return None

        # Check cooldown
        with self._lock:
            if now - self.last_trigger_time < cfg.cooldown_seconds:
                return None
            self.last_trigger_time = now

        # Fire deterrence trigger!
        return self._execute_deterrence(
            camera_id=camera_id,
            camera_name=camera_name,
            dwell_seconds=dwell_seconds,
            is_test=False
        )

    def trigger_test(self, camera_name: str = "Test Camera") -> Dict[str, Any]:
        """Manually test-fires the deterrence pipeline bypassing timers/night conditions."""
        return self._execute_deterrence(
            camera_id="test_cam",
            camera_name=camera_name,
            dwell_seconds=15.0,
            is_test=True
        )

    def _execute_deterrence(
        self,
        camera_id: str,
        camera_name: str,
        dwell_seconds: float,
        is_test: bool = False
    ) -> Dict[str, Any]:
        settings = get_system_settings()
        cfg = settings.deterrence
        now = time.time()

        trigger_data = {
            "timestamp": now,
            "camera_id": camera_id,
            "camera_name": camera_name,
            "dwell_seconds": round(dwell_seconds, 1),
            "is_test": is_test,
            "action": cfg.action_note,
            "target_entity": cfg.ha_entity_id,
            "ha_service": cfg.ha_service,
            "ha_flash": cfg.ha_flash
        }

        # 1. Log deterrence activation
        log_msg = (
            f"[ACTIVE DETERRENCE {'TEST ' if is_test else ''}TRIGGERED] "
            f"Camera '{camera_name}' loitering dwell {dwell_seconds:.1f}s exceeded threshold. "
            f"Dispatched {cfg.ha_service} to {cfg.ha_entity_id}"
        )
        logger.critical(log_msg, component="deterrence")

        # 2. Dispatch Home Assistant MQTT commands
        try:
            from app.mqtt_client import mqtt_service
            mqtt_cfg = settings.notifications.mqtt
            if mqtt_cfg.enabled:
                client = mqtt_service.ensure_connected(mqtt_cfg)
                if client and mqtt_service.is_connected:
                    prefix = (mqtt_cfg.topic_prefix or "homeassistant/nvr").strip().strip("/")
                    # Publish active state
                    client.publish(f"{prefix}/deterrence/state", "ON", retain=False)
                    client.publish("homeassistant/binary_sensor/gawkr_active_deterrence/state", "ON", retain=False)
                    
                    # Publish event attributes
                    client.publish(
                        "homeassistant/sensor/gawkr_active_deterrence_event/state",
                        "TRIGGERED",
                        retain=False
                    )
                    client.publish(
                        "homeassistant/sensor/gawkr_active_deterrence_event/attributes",
                        json.dumps(trigger_data),
                        retain=False
                    )

                    # Dispatch command topic for Home Assistant light/switch automations
                    ha_cmd_payload = {
                        "entity_id": cfg.ha_entity_id,
                        "service": cfg.ha_service,
                        "flash": cfg.ha_flash,
                        "flash_count": cfg.ha_flash_count,
                        "camera": camera_name,
                        "timestamp": now
                    }
                    client.publish(f"{prefix}/deterrence/action", json.dumps(ha_cmd_payload), retain=False)
                    client.publish("homeassistant/deterrence/action", json.dumps(ha_cmd_payload), retain=False)

                    # Reset sensor state back to OFF after 10 seconds in background
                    def _reset_state():
                        time.sleep(10)
                        try:
                            client.publish(f"{prefix}/deterrence/state", "OFF", retain=False)
                            client.publish("homeassistant/binary_sensor/gawkr_active_deterrence/state", "OFF", retain=False)
                            client.publish("homeassistant/sensor/gawkr_active_deterrence_event/state", "IDLE", retain=False)
                        except Exception:
                            pass
                    threading.Thread(target=_reset_state, daemon=True).start()
        except Exception as e:
            print(f"Error publishing deterrence to MQTT: {e}")

        # 3. WebSocket notification broadcast
        try:
            from app.notifications import notification_manager
            notification_manager.broadcast_sync({
                "type": "ACTIVE_DETERRENCE_TRIGGERED",
                "data": trigger_data
            })
        except Exception:
            pass

        with self._lock:
            self.trigger_history.insert(0, trigger_data)
            if len(self.trigger_history) > 30:
                self.trigger_history = self.trigger_history[:30]

        return trigger_data

# Singleton instance
active_deterrence_manager = ActiveDeterrenceManager()
