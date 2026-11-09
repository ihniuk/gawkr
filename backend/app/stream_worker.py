import os
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"

import threading
import time
import uuid
import math
import collections
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any, Deque
import numpy as np
import cv2
from app.config import RECORDINGS_DIR, SNAPSHOTS_DIR
from app.models import CameraModel, StreamTelemetry, DetectionEvent
from app.inference import inference_engine
from app.storage import save_snapshot_image, save_event_to_db, update_event_video_clip
from app.hardware import detect_hardware_capabilities, get_ffmpeg_encode_args

class CameraStreamWorker:
    def __init__(self, camera: CameraModel, notification_callback=None):
        self.camera = camera
        self.notification_callback = notification_callback
        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        
        self.latest_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.latest_detections = []
        self.frame_lock = threading.Lock()

        # Decoupled high-speed raw RTSP capture buffer
        self.raw_frame: Optional[np.ndarray] = None
        self.raw_frame_lock = threading.Lock()
        self.raw_frame_time = 0.0
        self.capture_thread: Optional[threading.Thread] = None
        self.ai_thread: Optional[threading.Thread] = None
        
        # Pre-roll ring buffer (stores recent frames in memory)
        # Up to 6 seconds of pre-roll at 25 FPS = 150 frames
        self.pre_roll_buffer: Deque[np.ndarray] = collections.deque(maxlen=150)
        self.last_preroll_time = 0.0
        self.active_recordings: List[Dict[str, Any]] = []
        self.recording_lock = threading.Lock()
        
        # False-alert prevention: multi-frame persistence filter
        self.consecutive_detection_count = 0
        self.last_alert_time = 0.0
        
        # Stationary Vehicle & Motion Tracking
        self.tracked_vehicles: List[Dict[str, Any]] = []
        self.last_ai_description: Optional[str] = None
        
        # Telemetry
        self.fps = 0.0
        self.bitrate_kbps = 0
        self.ai_latency_ms = 0.0
        self.dropped_frames = 0
        self.resolution = "1280x720"
        
        self.frame_counter = 0
        self.byte_counter = 0
        self.last_stat_time = time.time()

    def start(self):
        if not self.is_running:
            self.is_running = True
            if not self.camera.is_simulation:
                self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
                self.capture_thread.start()
                if getattr(self.camera.settings, 'ai_enabled', True):
                    self.ai_thread = threading.Thread(target=self._ai_loop, daemon=True)
                    self.ai_thread.start()
            self.thread = threading.Thread(target=self._run_loop, daemon=True)
            self.thread.start()

    def stop(self):
        self.is_running = False
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=1.0)
        if self.ai_thread and self.ai_thread.is_alive():
            self.ai_thread.join(timeout=1.0)
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)

    def _generate_synthetic_frame(self, t: float) -> np.ndarray:
        """Generates a realistic surveillance camera simulation with moving objects and timecode."""
        w, h = 1280, 720
        frame = np.zeros((h, w, 3), dtype=np.uint8)
        
        # Driveway / building gradient background
        for y in range(h):
            r = int(16 + (y / h) * 18)
            g = int(22 + (y / h) * 20)
            b = int(30 + (y / h) * 22)
            frame[y, :] = [b, g, r]

        # Draw driveway floor & wall perspective
        cv2.line(frame, (0, 480), (w, 480), (45, 55, 65), 2)
        cv2.line(frame, (200, 480), (50, 720), (40, 50, 60), 2)
        cv2.line(frame, (w - 200, 480), (w - 50, 720), (40, 50, 60), 2)
        
        # Simulated person movement on a 30s cycle (visible 4s-16s)
        cycle = (t * 0.15) % 30.0
        if 4.0 <= cycle <= 16.0:
            progress = (cycle - 4.0) / 12.0
            px = int((0.15 + progress * 0.65) * w)
            py = int((0.45 + 0.03 * math.sin(cycle * 3.0)) * h)
            pw = int(0.10 * w)
            ph = int(0.32 * h)
            
            # Head
            cv2.circle(frame, (px + pw // 2, py + ph // 6), ph // 8, (190, 210, 230), -1)
            # Torso
            cv2.rectangle(frame, (px + pw // 4, py + ph // 3), (px + 3 * pw // 4, py + 2 * ph // 3), (80, 110, 160), -1)
            # Legs
            cv2.line(frame, (px + pw // 3, py + 2 * ph // 3), (px + pw // 4, py + ph), (50, 60, 80), 6)
            cv2.line(frame, (px + 2 * pw // 3, py + 2 * ph // 3), (px + 3 * pw // 4, py + ph), (50, 60, 80), 6)

        # Draw HUD overlay
        timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"CAM: {self.camera.name.upper()}", (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(frame, timestamp_str, (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 160), 1)
        cv2.putText(frame, "LIVE - NVDEC HW DECODE", (w - 320, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 210, 255), 1)
        
        # Scanline effect
        frame[::4, :, :] = (frame[::4, :, :] * 0.94).astype(np.uint8)
        return frame

    def _evaluate_vehicle_motion(self, detections: List[Any], current_time: float) -> List[Any]:
        """
        Tracks vehicle and stationary object spatial positions over time to prevent repetitive alerts for parked / stationary objects.
        Marks objects as is_stationary=True / has_moved=False if their position has not moved since the last alert.
        Marks objects as has_moved=True if their displacement exceeds threshold (actively in motion).
        """
        TRACKED_STATIC_LABELS = {"car", "truck", "motorcycle", "bus", "bicycle"}
        processed = []
        
        for det in detections:
            ymin, xmin, ymax, xmax = det.box
            cx = (xmin + xmax) / 2.0
            cy = (ymin + ymax) / 2.0
            
            # Allow tracking for vehicles, bicycles, and static candidate detections (e.g. low-confidence person)
            should_track = (det.label in TRACKED_STATIC_LABELS) or (det.label == "person" and det.confidence < 0.65)
            if not should_track:
                # Dynamic non-vehicle subjects with strong confidence are active
                det.is_stationary = False
                det.has_moved = True
                processed.append(det)
                continue
                
            # Match against tracked objects
            best_match = None
            min_dist = 999.0
            
            for tracked in self.tracked_vehicles:
                tcx, tcy = tracked["centroid"]
                dist = math.hypot(cx - tcx, cy - tcy)
                if dist < min_dist:
                    min_dist = dist
                    best_match = tracked
                    
            if best_match and min_dist < 0.08:
                # Same object in virtually identical position
                best_match["last_seen"] = current_time
                best_match["centroid"] = (cx, cy)
                best_match["box"] = det.box
                best_match["still_frames"] = best_match.get("still_frames", 0) + 1
                
                # Check displacement from the position it held at the last notification
                last_alert_cx, last_alert_cy = best_match.get("last_alert_pos", (cx, cy))
                alert_displacement = math.hypot(cx - last_alert_cx, cy - last_alert_cy)
                
                if alert_displacement >= 0.10:
                    # Object has moved significantly since last alert!
                    det.is_stationary = False
                    det.has_moved = True
                else:
                    # Object has remained stationary in same spot
                    det.is_stationary = True
                    det.has_moved = False
            else:
                # Newly detected object or relocated to new area
                det.is_stationary = False
                det.has_moved = True
                self.tracked_vehicles.append({
                    "centroid": (cx, cy),
                    "box": det.box,
                    "label": det.label,
                    "first_seen": current_time,
                    "last_seen": current_time,
                    "last_alert_pos": (cx, cy),
                    "still_frames": 1
                })
                
            processed.append(det)
            
        # Clean up stale tracked objects not seen in > 10 minutes
        self.tracked_vehicles = [
            v for v in self.tracked_vehicles 
            if (current_time - v.get("last_seen", current_time)) < 600.0
        ]
        
        return processed

    def _process_ai_vision_and_dispatch(self, evt: DetectionEvent, snap_frame: np.ndarray, snap_path: Path, stationary_note: Optional[str] = None):
        """Asynchronously calls AI Vision Enhancement API and dispatches outbound notifications concurrently."""
        try:
            from app.ai_vision import analyze_snapshot_with_ai
            from app.notification_dispatchers import dispatch_event_notifications
            from app.storage import get_system_settings, update_event_ai_description

            sys_settings = get_system_settings()

            def _run_ai_vision():
                if sys_settings.ai_vision.enabled:
                    try:
                        ai_res = analyze_snapshot_with_ai(
                            snap_frame,
                            sys_settings.ai_vision,
                            last_description=self.last_ai_description,
                            stationary_objects_note=stationary_note,
                            memory_config=sys_settings.ai_memory
                        )
                        evt.ai_description = ai_res.get("description")
                        evt.threat_level = ai_res.get("threat_level", "Safe")
                        if evt.ai_description:
                            self.last_ai_description = evt.ai_description
                        update_event_ai_description(evt.id, evt.ai_description, evt.threat_level)
                        
                        # Broadcast updated event with AI description to Web App
                        if self.notification_callback:
                            self.notification_callback(evt)
                    except Exception as err:
                        print(f"AI Vision background error: {err}")

            vision_thread = None
            if sys_settings.ai_vision.enabled:
                vision_thread = threading.Thread(target=_run_ai_vision, daemon=True)
                vision_thread.start()
                # Wait up to 4.5 seconds for quick LLM description so Telegram includes it
                vision_thread.join(timeout=4.5)

            # False Alarm Suppression:
            # If AI Vision analyzed the snapshot and explicitly confirmed that no people or dynamic activity are present
            # and threat level is Safe, suppress sending a false positive alert to Telegram/Discord and remove from DB.
            desc_lower = (evt.ai_description or "").lower()
            false_alarm_keywords = [
                "no people are visible", "no people or dynamic activity",
                "remains empty", "garden is empty", "empty garden",
                "empty with no people", "no dynamic activity", "no activity present",
                "vacant", "blissfully vacant", "delightfully empty", "completely empty",
                "abandoned by humanity", "deserted", "unoccupied", "no persons",
                "no human", "no pedestrians", "no one is visible", "no visible person",
                "scene is empty", "driveway is empty", "area is empty", "quiet with no activity"
            ]
            is_confirmed_false_alarm = (evt.threat_level == "Safe") and any(k in desc_lower for k in false_alarm_keywords)
            if is_confirmed_false_alarm:
                print(f"False alert suppressed for {evt.camera_name}: AI Vision confirmed no dynamic activity or persons.")
                try:
                    from app.storage import delete_event_from_db
                    delete_event_from_db(evt.id)
                except Exception as del_err:
                    print(f"Error pruning false alarm event from DB: {del_err}")
                return

            # Outbound notifications (Telegram, Discord, Slack, Pushover)
            dispatch_event_notifications(evt, sys_settings.notifications, snapshot_path=str(snap_path))
        except Exception as e:
            print(f"Vision enhancement / notification dispatch error: {e}")

    def _record_event_clip_async(self, event_id: str, pre_roll_frames: List[np.ndarray], post_roll_seconds: int = 5):
        """Asynchronously records pre-roll and post-roll frames into an H.264 MP4 with +faststart."""
        def _recorder():
            try:
                # Synchronize recording frame rate to stream FPS so pre-roll and post-roll match 1.0x real-time speed
                clip_fps = max(10, min(30, int(round(self.fps)))) if self.fps > 5 else 20
                frame_interval = 1.0 / clip_fps
                total_post_frames = int(post_roll_seconds * clip_fps)

                # Determine recording resolution from pre-roll frames
                if pre_roll_frames:
                    h, w = pre_roll_frames[0].shape[:2]
                else:
                    w, h = 640, 360
                w = (w // 2) * 2
                h = (h // 2) * 2
                
                post_roll_frames = []
                for _ in range(total_post_frames):
                    time.sleep(frame_interval)
                    with self.frame_lock:
                        if self.latest_frame is not None:
                            post_roll_frames.append(cv2.resize(self.latest_frame, (w, h)))
                            
                all_frames = list(pre_roll_frames) + post_roll_frames
                if not all_frames:
                    return
                    
                out_filename = f"{self.camera.id}_{event_id}.mp4"
                out_path = RECORDINGS_DIR / out_filename
                temp_out_path = RECORDINGS_DIR / f"tmp_{out_filename}"
                
                # Retrieve configured hardware backend and encoding parameters
                cam_settings = getattr(self.camera, 'settings', None)
                hw_backend = getattr(cam_settings, 'hw_accel_backend', 'auto') if cam_settings else 'auto'
                preset = getattr(cam_settings, 'encoding_preset', 'ultrafast') if cam_settings else 'ultrafast'
                crf = getattr(cam_settings, 'encoding_crf', 26) if cam_settings else 26

                encode_args = get_ffmpeg_encode_args(backend=hw_backend, preset=preset, crf=crf)

                # Encode web-compatible H.264 MP4 via FFmpeg pipe with matching -r {clip_fps} and +faststart
                cmd = [
                    'ffmpeg', '-y',
                    '-f', 'rawvideo',
                    '-vcodec', 'rawvideo',
                    '-s', f'{w}x{h}',
                    '-pix_fmt', 'bgr24',
                    '-r', str(clip_fps),
                    '-i', '-',
                    *encode_args,
                    str(temp_out_path)
                ]
                
                proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
                for f in all_frames:
                    if f.shape[:2] != (h, w):
                        f = cv2.resize(f, (w, h))
                    try:
                        proc.stdin.write(f.tobytes())
                    except (BrokenPipeError, IOError):
                        break
                try:
                    proc.stdin.close()
                except Exception:
                    pass
                proc.wait()

                # Robust fallback: if hardware encoder failed (e.g., GPU memory exhaustion or unsupported format),
                # retry encoding with software libx264 so clip is guaranteed never lost
                if proc.returncode != 0 and ('h264_nvenc' in encode_args or 'h264_qsv' in encode_args):
                    fallback_cmd = [
                        'ffmpeg', '-y',
                        '-f', 'rawvideo',
                        '-vcodec', 'rawvideo',
                        '-s', f'{w}x{h}',
                        '-pix_fmt', 'bgr24',
                        '-r', str(clip_fps),
                        '-i', '-',
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-crf', str(crf),
                        '-pix_fmt', 'yuv420p',
                        '-g', '40',
                        '-movflags', '+faststart',
                        str(temp_out_path)
                    ]
                    fallback_proc = subprocess.Popen(fallback_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
                    for f in all_frames:
                        if f.shape[:2] != (h, w):
                            f = cv2.resize(f, (w, h))
                        try:
                            fallback_proc.stdin.write(f.tobytes())
                        except (BrokenPipeError, IOError):
                            break
                    try:
                        fallback_proc.stdin.close()
                    except Exception:
                        pass
                    fallback_proc.wait()
                
                # Atomically promote temporary file to final output path
                if temp_out_path.exists():
                    try:
                        if out_path.exists():
                            out_path.unlink()
                        temp_out_path.replace(out_path)
                    except Exception:
                        pass

                # Update DB and notify
                video_url = f"/api/recordings/{out_filename}"
                update_event_video_clip(event_id, video_url)
                
                if self.notification_callback:
                    # Send updated event notification
                    updated_evt = DetectionEvent(
                        id=event_id,
                        camera_id=self.camera.id,
                        camera_name=self.camera.name,
                        timestamp=time.time(),
                        objects=self.latest_detections,
                        snapshot_url=f"/api/snapshots/{self.camera.id}_{event_id}.jpg",
                        video_clip_url=video_url
                    )
                    self.notification_callback(updated_evt)
            except Exception as e:
                print(f"Clip recording error: {e}")

        t = threading.Thread(target=_recorder, daemon=True)
        t.start()

    def trigger_manual_alert(self):
        """Forces an instant AI alert and video clip for testing on-demand."""
        with self.frame_lock:
            frame = self.latest_frame.copy() if self.latest_frame is not None else None
            pre_roll = list(self.pre_roll_buffer)
            
        if frame is None:
            return None
            
        event_id = str(uuid.uuid4())[:8]
        snap_url = save_snapshot_image(self.camera.id, frame, event_id)
        
        rec_mode = getattr(self.camera.settings, 'recording_mode', 'ai_event')
        is_rec_enabled = rec_mode in ['ai_event', 'continuous']
        clip_url = f"/api/recordings/{self.camera.id}_{event_id}.mp4" if is_rec_enabled else None
        
        event = DetectionEvent(
            id=event_id,
            camera_id=self.camera.id,
            camera_name=self.camera.name,
            timestamp=time.time(),
            objects=self.latest_detections or [],
            snapshot_url=snap_url,
            video_clip_url=clip_url
        )
        save_event_to_db(event)
        
        if self.notification_callback:
            self.notification_callback(event)
            
        # Spawn AI Vision enhancement & notifications
        snap_path = SNAPSHOTS_DIR / f"{self.camera.id}_{event_id}.jpg"
        threading.Thread(
            target=self._process_ai_vision_and_dispatch,
            args=(event, frame.copy(), snap_path),
            daemon=True
        ).start()
            
        # Spawn clip recording
        post_roll = getattr(self.camera.settings, 'post_roll_seconds', 5)
        self._record_event_clip_async(event_id, pre_roll, post_roll_seconds=post_roll)
        return event

    def _capture_loop(self):
        """Dedicated high-speed thread that drains the RTSP buffer in real-time over TCP."""
        stream_url = self.camera.sub_stream_url or self.camera.main_stream_url
        cap = None
        consecutive_errors = 0
        last_success_time = time.time()
        
        while self.is_running:
            if cap is None or not cap.isOpened():
                self.camera.is_online = False
                try:
                    if cap:
                        cap.release()
                except Exception:
                    pass
                cap = cv2.VideoCapture(stream_url, cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                time.sleep(1.0)
                consecutive_errors = 0
                last_success_time = time.time()
                continue
                
            ret, frame = cap.read()
            now = time.time()
            if not ret or frame is None:
                consecutive_errors += 1
                self.dropped_frames += 1
                # If reading fails continuously for > 2 seconds or 20 frames, force a clean socket reconnect
                if consecutive_errors > 20 or (now - last_success_time > 2.5):
                    self.camera.is_online = False
                    try:
                        cap.release()
                    except Exception:
                        pass
                    cap = None
                    consecutive_errors = 0
                    time.sleep(0.5)
                else:
                    time.sleep(0.02)
                continue
                
            consecutive_errors = 0
            last_success_time = now
            self.camera.is_online = True
            
            with self.raw_frame_lock:
                self.raw_frame = frame
                self.raw_frame_time = now
                self.resolution = f"{frame.shape[1]}x{frame.shape[0]}"

        if cap:
            try:
                cap.release()
            except Exception:
                pass

    def _run_loop(self):
        """Dedicated high-speed live rendering pipeline running at full camera FPS (15-30 FPS)."""
        self.camera.is_online = True
        last_processed_time = 0.0
        
        while self.is_running:
            loop_start = time.time()
            
            if self.camera.is_simulation:
                frame = self._generate_synthetic_frame(loop_start)
                self.resolution = f"{frame.shape[1]}x{frame.shape[0]}"
                time.sleep(0.04) # ~25 FPS
            else:
                with self.raw_frame_lock:
                    if self.raw_frame is None or self.raw_frame_time == last_processed_time:
                        frame = None
                    else:
                        frame = self.raw_frame
                        last_processed_time = self.raw_frame_time

                if frame is None:
                    time.sleep(0.005)
                    continue

            fh, fw = frame.shape[:2]

            # Fast preview frame (downscaled if >960w to conserve bandwidth and avoid heavy copies)
            if fw > 960:
                preview_frame = cv2.resize(frame, (960, int(fh * 960 / fw)))
            else:
                preview_frame = frame.copy()

            h, w = preview_frame.shape[:2]

            # Apply privacy masks directly to preview frame
            if hasattr(self.camera, 'settings') and self.camera.settings.zones:
                for z in self.camera.settings.zones:
                    if getattr(z, 'enabled', True) and getattr(z, 'zone_type', 'include') == 'privacy_mask' and len(z.points) >= 3:
                        mask_pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in z.points], np.int32)
                        cv2.fillPoly(preview_frame, [mask_pts], (16, 16, 18))
                        cv2.putText(preview_frame, "PRIVACY MASK", (mask_pts[0][0] + 6, max(20, mask_pts[0][1] + 18)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (110, 110, 120), 1)

            # Draw zones
            if hasattr(self.camera, 'settings') and self.camera.settings.zones:
                for zone in self.camera.settings.zones:
                    if getattr(zone, 'enabled', True) and len(zone.points) >= 3:
                        ztype = getattr(zone, 'zone_type', 'include')
                        if ztype == 'privacy_mask':
                            continue
                        pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in zone.points], np.int32)
                        if ztype == 'exclude':
                            cv2.polylines(preview_frame, [pts], True, (40, 70, 245), 2)
                            cv2.putText(preview_frame, f"EXCLUDE: {zone.name.upper()}", (pts[0][0], max(16, pts[0][1] - 8)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 70, 245), 1)
                        else:
                            cv2.polylines(preview_frame, [pts], True, (0, 220, 140), 2)
                            cv2.putText(preview_frame, f"ZONE: {zone.name.upper()}", (pts[0][0], max(16, pts[0][1] - 8)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 140), 1)

            # Draw AI Detections (asynchronously computed from background AI worker)
            for det in list(self.latest_detections):
                ymin, xmin, ymax, xmax = det.box
                bx1, by1 = int(xmin * w), int(ymin * h)
                bx2, by2 = int(xmax * w), int(ymax * h)
                
                is_stat = getattr(det, 'is_stationary', False)
                if is_stat:
                    color = (130, 130, 140)
                    badge_text = f"{det.label.upper()} [PARKED]"
                else:
                    color = (0, 230, 255) if det.label == "person" else (255, 160, 50)
                    badge_text = f"{det.label.upper()} {int(det.confidence * 100)}%"
                    if det.label in {"car", "truck", "motorcycle", "bus"} and getattr(det, 'has_moved', False):
                        badge_text += " [MOVING]"

                cv2.rectangle(preview_frame, (bx1, by1), (bx2, by2), color, 2)
                (tw, th), _ = cv2.getTextSize(badge_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(preview_frame, (bx1, by1 - th - 10), (bx1 + tw + 10, by1), color, -1)
                cv2.putText(preview_frame, badge_text, (bx1 + 5, by1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (10, 15, 25), 1)

            # Create lightweight web-preview JPEG (max 960w, saves ~85% bandwidth & browser rendering CPU)
            ret, jpeg = cv2.imencode('.jpg', preview_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 74])
            if ret:
                jpeg_bytes = jpeg.tobytes()
                with self.frame_lock:
                    self.latest_frame = frame
                    self.latest_jpeg = jpeg_bytes

                self.frame_counter += 1
                self.byte_counter += len(jpeg_bytes)

            # Add frame to rolling pre-roll buffer synchronized to stream clip FPS
            clip_fps = max(10, min(30, int(round(self.fps)))) if self.fps > 5 else 20
            preroll_interval = 1.0 / clip_fps
            now = time.time()
            if now - self.last_preroll_time >= (preroll_interval * 0.90):
                self.last_preroll_time = now
                target_w = 640
                target_h = int(fh * target_w / fw)
                target_w = (target_w // 2) * 2
                target_h = (target_h // 2) * 2
                with self.frame_lock:
                    self.pre_roll_buffer.append(cv2.resize(frame, (target_w, target_h)))

            now = time.time()
            if now - self.last_stat_time >= 1.0:
                elapsed = now - self.last_stat_time
                self.fps = round(self.frame_counter / elapsed, 1)
                self.bitrate_kbps = int((self.byte_counter * 8) / (elapsed * 1000))
                self.frame_counter = 0
                self.byte_counter = 0
                self.last_stat_time = now

    def _ai_loop(self):
        """Dedicated background thread for YOLOv8 neural detection & event management."""
        infer_interval = 1.0 / max(1, getattr(self.camera.settings, 'sub_fps', 8))
        last_processed_time = 0.0
        
        while self.is_running:
            loop_start = time.time()
            if not getattr(self.camera.settings, 'ai_enabled', True):
                time.sleep(0.5)
                continue
                
            frame = None
            with self.raw_frame_lock:
                if self.raw_frame is not None and self.raw_frame_time != last_processed_time:
                    frame = self.raw_frame
                    last_processed_time = self.raw_frame_time
                    
            if frame is None:
                time.sleep(0.02)
                continue
                
            effective_threshold = getattr(self.camera.settings, 'confidence_threshold', 0.50)
            if getattr(self.camera.settings, 'use_global_threshold', True):
                try:
                    from app.storage import get_system_settings
                    sys_settings = get_system_settings()
                    if hasattr(sys_settings, 'detection') and hasattr(sys_settings.detection, 'global_confidence_threshold'):
                        effective_threshold = sys_settings.detection.global_confidence_threshold
                except Exception:
                    pass

            # Fast downscale for neural network if frame width > 640
            fh, fw = frame.shape[:2]
            if fw > 640:
                ai_input = cv2.resize(frame, (640, int(fh * 640 / fw)))
            else:
                ai_input = frame

            detections, lat_ms = inference_engine.detect(
                ai_input,
                self.camera.settings,
                is_simulation=self.camera.is_simulation,
                effective_threshold=effective_threshold
            )
            self.ai_latency_ms = lat_ms
            
            alert_detections = [
                d for d in detections
                if d.confidence >= effective_threshold
            ]

            evaluated_detections = self._evaluate_vehicle_motion(alert_detections, loop_start)
            self.latest_detections = evaluated_detections

            active_trigger_detections = [
                d for d in evaluated_detections
                if not (getattr(d, 'is_stationary', False) and not getattr(d, 'has_moved', True))
            ]
            
            min_frames = max(1, getattr(self.camera.settings, 'min_confirmation_frames', 2))
            cooldown = getattr(self.camera.settings, 'alert_cooldown_seconds', 45)
            
            if active_trigger_detections:
                self.consecutive_detection_count += 1
            else:
                self.consecutive_detection_count = max(0, self.consecutive_detection_count - 1)
            
            if (self.consecutive_detection_count >= min_frames) and (loop_start - self.last_alert_time >= cooldown):
                self.last_alert_time = loop_start
                self.consecutive_detection_count = 0
                
                for d in evaluated_detections:
                    dcx = (d.box[1] + d.box[3]) / 2.0
                    dcy = (d.box[0] + d.box[2]) / 2.0
                    for tracked in self.tracked_vehicles:
                        tcx, tcy = tracked["centroid"]
                        if math.hypot(dcx - tcx, dcy - tcy) < 0.10:
                            tracked["last_alert_pos"] = (dcx, dcy)
                
                event_id = str(uuid.uuid4())[:8]
                snap_url = save_snapshot_image(self.camera.id, frame, event_id)
                
                rec_mode = getattr(self.camera.settings, 'recording_mode', 'ai_event')
                is_rec_enabled = rec_mode in ['ai_event', 'continuous']
                clip_url = f"/api/recordings/{self.camera.id}_{event_id}.mp4" if is_rec_enabled else None

                event_objects = active_trigger_detections if active_trigger_detections else evaluated_detections

                event = DetectionEvent(
                    id=event_id,
                    camera_id=self.camera.id,
                    camera_name=self.camera.name,
                    timestamp=loop_start,
                    objects=event_objects,
                    snapshot_url=snap_url,
                    video_clip_url=clip_url
                )
                save_event_to_db(event)
                
                if self.notification_callback:
                    self.notification_callback(event)
                    
                snap_path = SNAPSHOTS_DIR / f"{self.camera.id}_{event_id}.jpg"
                has_stationary_cars = any(d.label in {"car", "truck", "motorcycle", "bus"} and getattr(d, 'is_stationary', False) for d in evaluated_detections)
                stat_note = "A project or resident vehicle is parked stationary in the driveway and has not moved." if has_stationary_cars else None

                threading.Thread(
                    target=self._process_ai_vision_and_dispatch,
                    args=(event, frame.copy(), snap_path, stat_note),
                    daemon=True
                ).start()
                    
                if self.camera.settings.recording_mode in ['ai_event', 'continuous']:
                    with self.frame_lock:
                        pre_roll = list(self.pre_roll_buffer)
                    post_roll = getattr(self.camera.settings, 'post_roll_seconds', 6)
                    self._record_event_clip_async(event_id, pre_roll, post_roll_seconds=post_roll)

            elapsed = time.time() - loop_start
            sleep_needed = max(0.01, infer_interval - elapsed)
            time.sleep(sleep_needed)

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self.frame_lock:
            return self.latest_jpeg

    def get_snapshot(self) -> Optional[np.ndarray]:
        with self.frame_lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
            return None

    def _get_active_decoder_label(self) -> str:
        cam_settings = getattr(self.camera, 'settings', None)
        backend = getattr(cam_settings, 'hw_accel_backend', 'auto') if cam_settings else 'auto'
        if backend == "cpu":
            return "CPU (Software)"
        elif backend == "nvdec":
            return "NVDEC (HW/CUDA)"
        elif backend == "qsv":
            return "Intel QSV (HW)"
        else: # auto
            hw = detect_hardware_capabilities()
            if hw.get("nvidia", {}).get("available"):
                return "NVDEC (HW/CUDA)"
            return "CPU (Software)"

    def get_telemetry(self) -> StreamTelemetry:
        return StreamTelemetry(
            camera_id=self.camera.id,
            fps=self.fps,
            bitrate_kbps=self.bitrate_kbps,
            resolution=self.resolution,
            decoder=self._get_active_decoder_label(),
            ai_latency_ms=self.ai_latency_ms,
            dropped_frames=self.dropped_frames,
            status="online" if self.camera.is_online else "offline"
        )
