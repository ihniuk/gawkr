import asyncio
import uuid
import time
from typing import Dict, List, Optional
import cv2
from app.models import CameraModel, CameraCreate, CameraUpdate, CameraSettings, DetectionZone
from app.storage import load_cameras_from_db, save_camera_to_db, delete_camera_from_db, save_snapshot_image
from app.stream_worker import CameraStreamWorker
from app.notifications import notification_manager

class CameraManager:
    def __init__(self):
        self.workers: Dict[str, CameraStreamWorker] = {}
        self.cameras: Dict[str, CameraModel] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def initialize(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        loaded = load_cameras_from_db()
        if not loaded:
            # Seed 2 realistic simulated cameras for instant testing
            cam1 = CameraModel(
                id="cam_driveway_01",
                name="Driveway North (AI Dual-Stream)",
                ip="192.168.1.120",
                port=554,
                onvif_port=80,
                username="admin",
                password="••••••",
                main_stream_url="rtsp://192.168.1.120:554/Streaming/Channels/101",
                sub_stream_url="rtsp://192.168.1.120:554/Streaming/Channels/102",
                vendor="Hikvision",
                model="DS-2CD2387G2-LU (ColorVu)",
                is_simulation=True,
                settings=CameraSettings(
                    confidence_threshold=0.50,
                    enabled_classes=["person", "car"],
                    zones=[
                        DetectionZone(
                            id="zone_driveway",
                            name="Driveway Entry Tripwire",
                            points=[[0.1, 0.4], [0.85, 0.4], [0.95, 0.95], [0.05, 0.95]],
                            color="#00e699"
                        )
                    ],
                    recording_mode="ai_event"
                )
            )
            cam2 = CameraModel(
                id="cam_porch_02",
                name="Front Porch & Walkway",
                ip="192.168.1.121",
                port=554,
                onvif_port=8000,
                username="admin",
                password="••••••",
                main_stream_url="rtsp://192.168.1.121:554/cam/realmonitor?channel=1&subtype=0",
                sub_stream_url="rtsp://192.168.1.121:554/cam/realmonitor?channel=1&subtype=1",
                vendor="Dahua",
                model="IPC-HFW5442T-ASE (WizMind)",
                is_simulation=True,
                settings=CameraSettings(
                    confidence_threshold=0.45,
                    enabled_classes=["person", "dog", "cat"],
                    recording_mode="continuous"
                )
            )
            self._register_and_start(cam1)
            self._register_and_start(cam2)
            save_camera_to_db(cam1)
            save_camera_to_db(cam2)
        else:
            for cam in loaded:
                self._register_and_start(cam)

    def _on_detection_event(self, event):
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(
                notification_manager.send_detection_alert(event.model_dump()),
                self.loop
            )

    def _register_and_start(self, camera: CameraModel):
        self.cameras[camera.id] = camera
        worker = CameraStreamWorker(camera, notification_callback=self._on_detection_event)
        self.workers[camera.id] = worker
        worker.start()

    def get_all(self) -> List[CameraModel]:
        return list(self.cameras.values())

    def get(self, camera_id: str) -> Optional[CameraModel]:
        return self.cameras.get(camera_id)

    def get_worker(self, camera_id: str) -> Optional[CameraStreamWorker]:
        return self.workers.get(camera_id)

    def add(self, data: CameraCreate) -> CameraModel:
        cam_id = f"cam_{uuid.uuid4().hex[:8]}"
        cam = CameraModel(
            id=cam_id,
            name=data.name,
            ip=data.ip,
            port=data.port,
            onvif_port=data.onvif_port,
            username=data.username,
            password=data.password,
            main_stream_url=data.main_stream_url,
            sub_stream_url=data.sub_stream_url or data.main_stream_url,
            vendor=data.vendor,
            model=data.model,
            is_simulation=data.is_simulation
        )
        self._register_and_start(cam)
        save_camera_to_db(cam)
        return cam

    def update(self, camera_id: str, data: CameraUpdate) -> Optional[CameraModel]:
        cam = self.cameras.get(camera_id)
        if not cam:
            return None

        old_main = cam.main_stream_url
        old_sub = cam.sub_stream_url
        old_ip = cam.ip
        old_user = cam.username
        old_pass = cam.password
            
        if data.name is not None:
            cam.name = data.name
        if data.ip is not None:
            cam.ip = data.ip
        if data.port is not None:
            cam.port = data.port
        if data.onvif_port is not None:
            cam.onvif_port = data.onvif_port
        if data.username is not None:
            cam.username = data.username
        if data.password is not None and data.password != "":
            cam.password = data.password
        if data.main_stream_url is not None:
            cam.main_stream_url = data.main_stream_url
        if data.sub_stream_url is not None:
            cam.sub_stream_url = data.sub_stream_url
        if data.settings is not None:
            cam.settings = data.settings

        # Update worker settings
        worker = self.workers.get(camera_id)
        if worker:
            worker.camera = cam

        # If stream URLs or connection credentials changed, restart the stream pipeline automatically
        stream_changed = (
            (data.main_stream_url is not None and data.main_stream_url != old_main) or
            (data.sub_stream_url is not None and data.sub_stream_url != old_sub) or
            (data.ip is not None and data.ip != old_ip) or
            (data.username is not None and data.username != old_user) or
            (data.password is not None and data.password != "" and data.password != old_pass)
        )
        if worker and stream_changed:
            self.restart_worker(camera_id)

        save_camera_to_db(cam)
        return cam

    def restart_worker(self, camera_id: str):
        worker = self.workers.get(camera_id)
        if worker:
            worker.stop()
            worker.start()

    def delete(self, camera_id: str) -> bool:
        worker = self.workers.pop(camera_id, None)
        if worker:
            worker.stop()
        self.cameras.pop(camera_id, None)
        delete_camera_from_db(camera_id)
        return True

    def take_snapshot(self, camera_id: str) -> Optional[bytes]:
        worker = self.workers.get(camera_id)
        if not worker:
            return None
        frame = worker.get_snapshot()
        if frame is None:
            return None
        ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
        return jpeg.tobytes() if ret else None

    def shutdown(self):
        for worker in self.workers.values():
            worker.stop()

camera_manager = CameraManager()
