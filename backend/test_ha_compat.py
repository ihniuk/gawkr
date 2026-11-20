import asyncio
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import HTTPException
from app.auth import verify_ha_integration_auth
from app.main import ha_camera_snapshot, ha_list_cameras
from app.models import CameraModel, CameraSettings, DetectionEvent, DetectionObject, MqttConfig
from app.mqtt_client import MQTTService, parse_broker_connection


class TestHomeAssistantCCTVCompat(unittest.TestCase):
    def test_parse_broker_connection_url_and_fields(self):
        cfg_url = MqttConfig(enabled=True, broker_url="mqtt://niall:secret%20pw@10.10.0.51:1884")
        self.assertEqual(parse_broker_connection(cfg_url), ("10.10.0.51", 1884, "niall", "secret pw"))

        cfg_fields = MqttConfig(
            enabled=True,
            broker_url="",
            broker_host="homeassistant.local",
            broker_port=1883,
            username="gawkr",
            password="pw",
        )
        self.assertEqual(parse_broker_connection(cfg_fields), ("homeassistant.local", 1883, "gawkr", "pw"))

        cfg_empty = MqttConfig(enabled=True, broker_url="", broker_host="")
        self.assertIsNone(parse_broker_connection(cfg_empty))

    def test_discovery_payloads_include_camera_motion_ai_switch_and_telemetry(self):
        svc = MQTTService()
        cfg = MqttConfig(enabled=True, broker_host="10.10.0.51", topic_prefix="gawkr/nvr")
        cam = CameraModel(
            id="cam_front",
            name="Front",
            ip="10.10.0.21",
            port=554,
            onvif_port=80,
            username="admin",
            password="pw",
            main_stream_url="rtsp://10.10.0.21:554/1",
            sub_stream_url="rtsp://10.10.0.21:554/2",
            vendor="Hikvision",
            model="ColorVu",
            is_online=True,
        )
        payloads = svc.build_ha_discovery_payloads(cam.id, cam.name, cfg, camera=cam)

        self.assertIn("homeassistant/camera/gawkr_cam_front/config", payloads)
        self.assertEqual(payloads["homeassistant/camera/gawkr_cam_front/config"]["topic"], "gawkr/nvr/cam_front/snapshot")
        self.assertIn("homeassistant/binary_sensor/vision_nvr_cam_front_motion/config", payloads)
        self.assertIn("homeassistant/binary_sensor/gawkr_cam_front_online/config", payloads)
        self.assertIn("homeassistant/sensor/vision_nvr_cam_front_detection/config", payloads)
        self.assertIn("homeassistant/sensor/gawkr_cam_front_threat/config", payloads)
        self.assertIn("homeassistant/sensor/gawkr_cam_front_fps/config", payloads)
        self.assertIn("homeassistant/switch/gawkr_cam_front_ai/config", payloads)
        self.assertIn("homeassistant/button/gawkr_cam_front_test_alert/config", payloads)

    def test_mqtt_ai_toggle_command_updates_camera_settings(self):
        svc = MQTTService()
        mock_cam = CameraModel(
            id="cam_drive",
            name="Drive",
            ip="10.10.0.22",
            port=554,
            onvif_port=80,
            username="admin",
            password="pw",
            main_stream_url="rtsp://10.10.0.22:554/1",
            sub_stream_url="rtsp://10.10.0.22:554/2",
            vendor="Hikvision",
            model="IP Camera",
            settings=CameraSettings(ai_enabled=True),
        )
        mock_client = MagicMock()
        svc.client = mock_client
        svc.is_connected = True
        svc._conn_sig = ("10.10.0.51", 1883, "gawkr", "pw", "homeassistant/nvr")

        with patch("app.camera_manager.camera_manager") as cm, patch(
            "app.storage.get_system_settings",
            return_value=SimpleNamespace(
                notifications=SimpleNamespace(
                    mqtt=MqttConfig(enabled=True, broker_host="10.10.0.51", username="gawkr", password="pw")
                )
            ),
        ):
            cm.get.return_value = mock_cam
            msg = SimpleNamespace(topic="homeassistant/nvr/cam_drive/ai/set", payload=b"OFF")
            svc._on_message(mock_client, None, msg)
            self.assertFalse(mock_cam.settings.ai_enabled)
            cm.update.assert_called_once()
            mock_client.publish.assert_called_with("homeassistant/nvr/cam_drive/ai/state", "OFF", retain=True)

    def test_publish_event_sends_motion_detection_threat_and_snapshot(self):
        svc = MQTTService()
        mock_client = MagicMock()
        svc.client = mock_client
        svc.is_connected = True
        cfg = MqttConfig(enabled=True, broker_host="10.10.0.51", topic_prefix="homeassistant/nvr")
        svc._conn_sig = ("10.10.0.51", 1883, "", "", "homeassistant/nvr")

        evt = DetectionEvent(
            id="evt1",
            camera_id="cam_front",
            camera_name="Front",
            timestamp=1700000000.0,
            objects=[DetectionObject(label="person", confidence=0.92, box=[0.1, 0.1, 0.5, 0.5])],
            snapshot_url="/api/snapshots/cam_front_evt1.jpg",
            threat_level="Safe",
            ai_description="Person walking up driveway.",
        )

        with patch("app.mqtt_client.threading.Thread") as mock_thread:
            svc.publish_event(evt, cfg, snapshot_bytes=b"\xff\xd8\xff\xe0jpeg")
            mock_thread.assert_called_once()

        published_topics = [call.args[0] for call in mock_client.publish.call_args_list]
        self.assertIn("vision_nvr/cam_front/motion", published_topics)
        self.assertIn("homeassistant/nvr/cam_front/threat", published_topics)
        self.assertIn("homeassistant/nvr/cam_front/snapshot", published_topics)
        self.assertIn("vision_nvr/cam_front/detection", published_topics)

    def test_ha_auth_and_camera_endpoints(self):
        async def _run():
            fake_req = SimpleNamespace(headers={}, base_url="http://10.10.0.10:8000/", query_params={})
            with patch(
                "app.storage.get_system_settings",
                return_value=SimpleNamespace(notifications=SimpleNamespace(mqtt=MqttConfig(ha_api_key="secret-ha-key"))),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    await verify_ha_integration_auth(fake_req, token=None, credentials=None)
                self.assertEqual(ctx.exception.status_code, 401)

                with self.assertRaises(HTTPException) as ctx2:
                    await verify_ha_integration_auth(fake_req, token="wrong-key", credentials=None)
                self.assertEqual(ctx2.exception.status_code, 401)

                ok_user = await verify_ha_integration_auth(fake_req, token="secret-ha-key", credentials=None)
                self.assertEqual(ok_user["auth_type"], "ha_api_key")

            cam = CameraModel(
                id="cam_1",
                name="Front",
                ip="10.10.0.21",
                port=554,
                onvif_port=80,
                username="admin",
                password="pw",
                main_stream_url="rtsp://10.10.0.21:554/1",
                sub_stream_url="rtsp://10.10.0.21:554/2",
                vendor="XM",
                model="IP Camera",
                is_online=True,
            )
            fake_worker = MagicMock()
            fake_worker.get_telemetry.return_value = SimpleNamespace(fps=15.0, resolution="1920x1080")
            fake_worker.get_latest_jpeg.return_value = b"\xff\xd8\xff\xe0test"

            req_with_tok = SimpleNamespace(
                base_url="http://10.10.0.10:8000/",
                query_params={"token": "secret-ha-key"},
            )
            with patch("app.main.camera_manager") as cm:
                cm.get_all.return_value = [cam]
                cm.get_worker.return_value = fake_worker
                listing = await ha_list_cameras(req_with_tok, user={"username": "homeassistant"})
                self.assertEqual(listing["count"], 1)
                self.assertEqual(
                    listing["cameras"][0]["mjpeg_url"],
                    "http://10.10.0.10:8000/api/ha/cameras/cam_1/stream?token=secret-ha-key",
                )
                snap = await ha_camera_snapshot("cam_1", user={"username": "homeassistant"})
                self.assertEqual(snap.media_type, "image/jpeg")
                self.assertEqual(snap.body, b"\xff\xd8\xff\xe0test")

        asyncio.run(_run())


if __name__ == "__main__":
    unittest.main()
