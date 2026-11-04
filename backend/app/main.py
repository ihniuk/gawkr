import asyncio
import base64
import time
import uuid
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from pathlib import Path
from pydantic import BaseModel
from fastapi import FastAPI, Depends, HTTPException, status, Query, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.responses import StreamingResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import SNAPSHOTS_DIR, RECORDINGS_DIR
from app.models import (
    UserLogin, UserResponse, UserCreate, UserPasswordReset, UserPasswordChange, UserRoleUpdate, UserItem,
    CameraModel, CameraCreate, CameraUpdate,
    CredentialVerifyRequest, CredentialVerifyResponse, SystemSettings, AIVisionConfig,
    AIMemoryConfig, AIMemoryItem,
    TestStreamRequest, TestStreamResponse
)
from app.auth import (
    authenticate_user, create_access_token, get_current_user, require_admin,
    create_stream_ticket, verify_stream_ticket,
    list_users, add_new_user, reset_user_password, update_user_role, delete_user
)
from app.discovery import discover_network_cameras, verify_camera_credentials, _test_rtsp_stream_cv2
from app.camera_manager import camera_manager
from app.notifications import notification_manager
from app.storage import (
    load_recent_events_from_db, delete_event_from_db,
    get_system_settings, save_system_settings, get_storage_disk_stats,
    record_login_audit, get_login_audit_logs, clear_login_audit_logs
)
from app.ai_vision import test_ai_vision_connection, extract_memory_profile_from_snapshot
from app.notification_dispatchers import (
    send_telegram_alert, send_discord_alert, send_slack_alert, send_pushover_alert
)
from app.hardware import detect_hardware_capabilities
from app.logger import setup_app_logging, get_system_logs, clear_system_logs, logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize unified system logging & log database
    setup_app_logging()
    logger.info("Gawkr AI-NVR Server starting up...", component="system")

    # Startup: Initialize camera manager with the active event loop
    loop = asyncio.get_running_loop()
    camera_manager.initialize(loop)
    
    # Background task for periodic telemetry broadcast
    async def telemetry_loop():
        while True:
            await asyncio.sleep(2.0)
            for cam in camera_manager.get_all():
                worker = camera_manager.get_worker(cam.id)
                if worker:
                    telem = worker.get_telemetry()
                    await notification_manager.send_telemetry_update(telem.model_dump())
    
    async def storage_retention_loop():
        from app.storage import purge_expired_storage
        while True:
            try:
                purge_expired_storage()
            except Exception as e:
                logger.error(f"Storage retention worker error: {e}", component="storage")
            await asyncio.sleep(1800) # Check every 30 minutes
    
    task = asyncio.create_task(telemetry_loop())
    storage_task = asyncio.create_task(storage_retention_loop())
    yield
    # Shutdown
    logger.info("Gawkr AI-NVR Server shutting down...", component="system")
    task.cancel()
    storage_task.cancel()
    camera_manager.shutdown()

app = FastAPI(title="Gawkr AI-NVR Server", version="1.0.0", lifespan=lifespan)

# Allow CORS for local dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- AUTHENTICATION -----------------

def extract_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return "127.0.0.1"

@app.post("/api/auth/login", response_model=UserResponse)
async def login(credentials: UserLogin, request: Request):
    client_ip = extract_client_ip(request)
    user_agent = request.headers.get("user-agent", "Unknown")

    user = authenticate_user(credentials.username, credentials.password)
    if not user:
        record_login_audit(credentials.username, client_ip, user_agent, "FAILED", "Incorrect username or password")
        logger.warning(f"Failed login attempt for '{credentials.username}' from {client_ip} ({user_agent[:45]})", component="auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    record_login_audit(credentials.username, client_ip, user_agent, "SUCCESS")
    logger.info(f"Successful login for user '{credentials.username}' from {client_ip}", component="auth")
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return UserResponse(
        username=user["username"],
        role=user["role"],
        token=token
    )

@app.post("/api/auth/change-password")
async def self_service_change_password(payload: UserPasswordChange):
    """Verifies existing credentials and updates the password."""
    user = authenticate_user(payload.username, payload.current_password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current username or password incorrect"
        )
    return reset_user_password(payload.username, payload.new_password)

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"username": user["username"], "role": user["role"]}

@app.get("/api/auth/stream-ticket/{camera_id}")
async def get_stream_ticket(camera_id: str, user: dict = Depends(get_current_user)):
    """Generates an ephemeral, signed stream ticket for zero-unauthorized-access video feeds."""
    ticket = create_stream_ticket(camera_id, user["username"])
    return {"ticket": ticket, "camera_id": camera_id}

# ----------------- USER MANAGEMENT -----------------

@app.get("/api/users", response_model=list[UserItem])
async def get_users_list(user: dict = Depends(get_current_user)):
    """Lists all registered system users."""
    return list_users()

@app.post("/api/users")
async def create_new_user_account(user_in: UserCreate, user: dict = Depends(require_admin)):
    """Creates a new user account with specified role (Admin only)."""
    return add_new_user(user_in.username, user_in.password, user_in.role)

@app.put("/api/users/{username}/password")
async def update_password(username: str, pwd_in: UserPasswordReset, user: dict = Depends(get_current_user)):
    """Resets password for an account (Admin can reset any user; viewers can reset their own)."""
    if user["role"] != "admin" and user["username"] != username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are only permitted to reset your own password"
        )
    return reset_user_password(username, pwd_in.password)

@app.put("/api/users/{username}/role")
async def change_role(username: str, role_in: UserRoleUpdate, user: dict = Depends(require_admin)):
    """Updates user authorization role (Admin only)."""
    return update_user_role(username, role_in.role, user["username"])

@app.delete("/api/users/{username}")
async def remove_user_account(username: str, user: dict = Depends(require_admin)):
    """Deletes a user account (Admin only, cannot delete self or last admin)."""
    return delete_user(username, user["username"])

# ----------------- CAMERAS -----------------

@app.get("/api/cameras")
async def list_cameras(user: dict = Depends(get_current_user)):
    cams = camera_manager.get_all()
    # Mask passwords before sending to frontend
    res = []
    for c in cams:
        d = c.model_dump()
        d["password"] = "••••••••" if d["password"] else ""
        res.append(d)
    return res

@app.post("/api/cameras", response_model=CameraModel)
async def create_camera(cam: CameraCreate, user: dict = Depends(require_admin)):
    return camera_manager.add(cam)

@app.get("/api/cameras/{camera_id}")
async def get_camera(camera_id: str, user: dict = Depends(get_current_user)):
    cam = camera_manager.get(camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    d = cam.model_dump()
    d["password"] = "••••••••" if d["password"] else ""
    return d

@app.put("/api/cameras/{camera_id}")
async def update_camera(camera_id: str, update: CameraUpdate, user: dict = Depends(require_admin)):
    cam = camera_manager.update(camera_id, update)
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    return cam

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str, user: dict = Depends(require_admin)):
    success = camera_manager.delete(camera_id)
    if not success:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"status": "deleted", "camera_id": camera_id}

@app.post("/api/cameras/{camera_id}/restart")
async def restart_camera(camera_id: str, user: dict = Depends(require_admin)):
    camera_manager.restart_worker(camera_id)
    return {"status": "restarted", "camera_id": camera_id}

@app.get("/api/cameras/{camera_id}/telemetry")
async def get_camera_telemetry(camera_id: str, user: dict = Depends(get_current_user)):
    worker = camera_manager.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Camera stream not found")
    return worker.get_telemetry()

# ----------------- VIDEO STREAMING & SNAPSHOTS -----------------

@app.get("/api/cameras/{camera_id}/stream")
async def get_camera_stream(camera_id: str, ticket: str = Query(...)):
    """
    High-speed, low-latency multipart/x-mixed-replace JPEG video stream.
    Protected by signed stream tickets against unauthorized viewing.
    """
    if not verify_stream_ticket(ticket, camera_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or expired stream ticket"
        )
    
    worker = camera_manager.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Camera stream inactive")

    async def frame_generator():
        last_frame_ref = None
        while True:
            jpeg = worker.get_latest_jpeg()
            if jpeg is not None and jpeg is not last_frame_ref:
                last_frame_ref = jpeg
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
                await asyncio.sleep(0.010)
            else:
                await asyncio.sleep(0.008)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/api/cameras/{camera_id}/snapshot")
async def capture_snapshot(camera_id: str, user: dict = Depends(get_current_user)):
    """Captures a pristine, high-resolution snapshot frame directly from the main stream."""
    jpeg = camera_manager.take_snapshot(camera_id)
    if not jpeg:
        raise HTTPException(status_code=500, detail="Failed to capture snapshot frame")
    return Response(content=jpeg, media_type="image/jpeg")

@app.get("/api/snapshots/{filename}")
async def get_snapshot_file(filename: str):
    file_path = SNAPSHOTS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(str(file_path), media_type="image/jpeg")

@app.get("/api/recordings/{filename}")
async def get_recording_file(filename: str):
    """Serves recorded H.264 MP4 clips with HTTP Range seeking support for smooth web playback."""
    file_path = RECORDINGS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Recording clip not found or still processing")
    return FileResponse(str(file_path), media_type="video/mp4")

@app.post("/api/cameras/{camera_id}/test-alert")
async def trigger_camera_test_alert(camera_id: str, user: dict = Depends(require_admin)):
    """Triggers an intentional confirmed AI event & video clip on-demand for testing."""
    worker = camera_manager.get_worker(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Camera not found")
    evt = worker.trigger_manual_alert()
    return {"status": "triggered", "event": evt.model_dump() if evt else None}

# ----------------- DISCOVERY & CREDENTIAL VERIFICATION -----------------

@app.post("/api/discovery/scan")
async def scan_network_cameras(user: dict = Depends(require_admin)):
    """
    Point-and-click network camera scanner:
    Runs ONVIF WS-Discovery, SSDP and LAN sweeps.
    """
    devices = await discover_network_cameras()
    return {"count": len(devices), "devices": devices}

@app.post("/api/discovery/verify", response_model=CredentialVerifyResponse)
async def verify_credentials(req: CredentialVerifyRequest, user: dict = Depends(require_admin)):
    """
    Tests credentials against a camera, validates profiles, and auto-generates Main/Sub stream URLs.
    """
    return await verify_camera_credentials(
        ip=req.ip,
        onvif_port=req.onvif_port,
        rtsp_port=req.rtsp_port,
        username=req.username,
        password=req.password
    )

@app.post("/api/discovery/test-stream", response_model=TestStreamResponse)
async def test_stream(req: TestStreamRequest, user: dict = Depends(require_admin)):
    """
    Tests an individual RTSP stream URL by opening and decoding frames with FFmpeg/CV2.
    """
    is_ok, res, fps = await asyncio.to_thread(_test_rtsp_stream_cv2, req.rtsp_url, 2)
    if is_ok:
        return TestStreamResponse(
            success=True,
            message=f"Stream online and delivering video ({res} @ {fps:.1f} FPS)!",
            resolution=res,
            fps=fps
        )
    return TestStreamResponse(
        success=False,
        message="Could not decode stream. Verify stream URL, port 554, or credentials."
    )

# ----------------- EVENTS -----------------

@app.get("/api/events")
async def get_events(
    limit: int = 500,
    camera_id: str = None,
    start_time: float = None,
    end_time: float = None,
    user: dict = Depends(get_current_user)
):
    return load_recent_events_from_db(
        limit=min(limit, 2500),
        camera_id=camera_id,
        start_time=start_time,
        end_time=end_time
    )

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(require_admin)):
    delete_event_from_db(event_id)
    return {"status": "deleted", "id": event_id}

# ----------------- SYSTEM SETTINGS & CONTROL PANEL -----------------

@app.get("/api/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    """Returns current system configuration and real-time storage disk usage statistics."""
    settings = get_system_settings()
    disk_stats = get_storage_disk_stats()
    return {
        "settings": settings.model_dump(),
        "disk_stats": disk_stats
    }

@app.get("/api/settings/hardware-capabilities")
async def get_hardware_capabilities(user: dict = Depends(get_current_user)):
    """Detects CPU cores, NVIDIA GPU presence, Intel QuickSync availability, and active codec engines."""
    return detect_hardware_capabilities()

@app.put("/api/settings")
async def update_settings(new_settings: SystemSettings, user: dict = Depends(require_admin)):
    """Updates storage retention, AI vision credentials, and notification webhooks."""
    save_system_settings(new_settings)
    return {
        "status": "updated",
        "settings": new_settings.model_dump(),
        "disk_stats": get_storage_disk_stats()
    }

@app.post("/api/settings/apply-global-threshold")
async def apply_global_threshold_to_all(user: dict = Depends(require_admin)):
    """Applies the current global detection threshold across all registered cameras."""
    settings = get_system_settings()
    global_thresh = getattr(settings.detection, 'global_confidence_threshold', 0.50)
    cams = camera_manager.get_all()
    updated_count = 0
    for c in cams:
        c.settings.confidence_threshold = global_thresh
        c.settings.use_global_threshold = True
        camera_manager.update(c.id, CameraUpdate(settings=c.settings))
        updated_count += 1
    return {
        "status": "applied",
        "threshold": global_thresh,
        "updated_cameras": updated_count
    }

@app.get("/api/settings/ai-memory")
async def get_ai_memory_settings(user: dict = Depends(get_current_user)):
    """Retrieves current AI recognition memory entities and configuration."""
    settings = get_system_settings()
    return settings.ai_memory.model_dump()

@app.put("/api/settings/ai-memory")
async def update_ai_memory_settings(memory_config: AIMemoryConfig, user: dict = Depends(require_admin)):
    """Updates AI recognition memory entities (couriers, residents, vehicles)."""
    settings = get_system_settings()
    settings.ai_memory = memory_config
    save_system_settings(settings)
    return {"status": "updated", "ai_memory": memory_config.model_dump()}

@app.post("/api/settings/ai-memory/reset-defaults")
async def reset_ai_memory_defaults(user: dict = Depends(require_admin)):
    """Restores default courier and visitor recognition templates."""
    settings = get_system_settings()
    settings.ai_memory = AIMemoryConfig()
    save_system_settings(settings)
    return {"status": "reset", "ai_memory": settings.ai_memory.model_dump()}

class ExtractCuesRequest(BaseModel):
    snapshot_path: Optional[str] = None
    image_base64: Optional[str] = None

@app.post("/api/settings/ai-memory/upload-image")
async def upload_ai_memory_image(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    """Uploads an image file to serve as a visual reference snapshot in AI Memory."""
    ext = Path(file.filename or "snapshot.jpg").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    filename = f"memory_ref_{uuid.uuid4().hex[:8]}{ext}"
    dest = SNAPSHOTS_DIR / filename
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    return {
        "status": "uploaded",
        "snapshot_path": filename,
        "snapshot_url": f"/api/snapshots/{filename}"
    }

@app.post("/api/settings/ai-memory/extract-cues")
async def extract_ai_memory_cues(req: ExtractCuesRequest, user: dict = Depends(require_admin)):
    """Uses configured AI Vision to analyze a snapshot and automatically extract visual identifying cues, subject name, category, and threat bias."""
    settings = get_system_settings()
    img_input = None
    if req.image_base64:
        b64_data = req.image_base64.split(",")[-1]
        img_input = base64.b64decode(b64_data)
    elif req.snapshot_path:
        filename = Path(req.snapshot_path).name
        full_path = SNAPSHOTS_DIR / filename
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="Snapshot file not found")
        img_input = full_path
    else:
        raise HTTPException(status_code=400, detail="Either snapshot_path or image_base64 is required")

    profile = extract_memory_profile_from_snapshot(img_input, settings.ai_vision)
    return profile

@app.get("/api/settings/ai-memory/recent-snapshots")
async def get_recent_memory_snapshots(limit: int = 30, user: dict = Depends(get_current_user)):
    """Returns recent snapshot files from camera events for visual memory picking."""
    events = load_recent_events_from_db(limit=limit)
    snapshots = []
    seen = set()
    for e in events:
        if e.snapshot_url and e.snapshot_url not in seen:
            seen.add(e.snapshot_url)
            snapshots.append({
                "snapshot_url": e.snapshot_url,
                "snapshot_path": Path(e.snapshot_url).name,
                "camera_name": e.camera_name,
                "timestamp": e.timestamp,
                "ai_description": e.ai_description or "",
                "threat_level": e.threat_level or "Safe"
            })
    return {"snapshots": snapshots}

@app.post("/api/settings/test-ai-vision")
async def test_ai_vision(config: AIVisionConfig, user: dict = Depends(require_admin)):
    """Generates a test frame and runs real-time natural language description via configured AI API."""
    result = test_ai_vision_connection(config)
    return result

@app.post("/api/settings/test-notification/{service}")
async def test_notification(service: str, payload: dict, user: dict = Depends(require_admin)):
    """Sends an immediate test alert to Telegram, Discord, Slack, or Pushover."""
    class DummyEvent:
        camera_name = "Test Camera (Driveway)"
        timestamp = time.time()
        threat_level = "Safe"
        ai_description = "Test alert from Gawkr AI-NVR Server. All notification channels operational!"
        objects = []
        
    try:
        if service == "telegram":
            bot_token = payload.get("bot_token")
            chat_id = payload.get("chat_id")
            if not bot_token or not chat_id:
                raise HTTPException(status_code=400, detail="Missing Bot Token or Chat ID")
            return send_telegram_alert(bot_token, chat_id, DummyEvent())

        elif service == "discord":
            webhook_url = payload.get("webhook_url")
            if not webhook_url:
                raise HTTPException(status_code=400, detail="Missing Discord Webhook URL")
            return send_discord_alert(webhook_url, DummyEvent())

        elif service == "slack":
            webhook_url = payload.get("webhook_url")
            if not webhook_url:
                raise HTTPException(status_code=400, detail="Missing Slack Webhook URL")
            return send_slack_alert(webhook_url, DummyEvent())

        elif service == "pushover":
            user_key = payload.get("user_key")
            api_token = payload.get("api_token")
            if not user_key or not api_token:
                raise HTTPException(status_code=400, detail="Missing Pushover User Key or API Token")
            return send_pushover_alert(user_key, api_token, DummyEvent())

        elif service == "mqtt":
            broker = payload.get("broker_url")
            if not broker:
                raise HTTPException(status_code=400, detail="Missing MQTT Broker URL (e.g. localhost:1883)")
            from app.mqtt_client import mqtt_service
            from app.models import MqttConfig
            cfg = MqttConfig(**payload)
            mqtt_service.publish_ha_discovery("test_cam", "Test Security Cam", cfg)
            return {"success": True, "message": "MQTT connected! Home Assistant discovery published."}

        raise HTTPException(status_code=400, detail=f"Unsupported notification service: {service}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/settings/purge-storage")
async def trigger_storage_purge(user: dict = Depends(require_admin)):
    from app.storage import purge_expired_storage
    res = purge_expired_storage()
    return {"status": "ok", "result": res}

# ----------------- SYSTEM LOGS & AUDIT -----------------

@app.get("/api/system/logs")
async def get_logs_endpoint(
    level: str = "ALL",
    component: str = "ALL",
    search: str = "",
    limit: int = 250,
    user: dict = Depends(require_admin)
):
    """Returns system logs with severity and component filtering."""
    logs = get_system_logs(level=level, component=component, search=search, limit=limit)
    return {"count": len(logs), "logs": logs}

@app.post("/api/system/logs/clear")
async def clear_logs_endpoint(user: dict = Depends(require_admin)):
    """Clears system logs from database and memory."""
    clear_system_logs()
    logger.info(f"System logs cleared by user '{user['username']}'", component="system")
    return {"status": "cleared"}

@app.get("/api/security/login-audit")
async def get_login_audit_endpoint(limit: int = 100, user: dict = Depends(require_admin)):
    """Retrieves security audit logs of authentication attempts."""
    logs = get_login_audit_logs(limit=limit)
    now = time.time()
    past_24h = now - 86400
    failed_24h = sum(1 for l in logs if l.get("status") == "FAILED" and l.get("timestamp", 0) >= past_24h)
    success_24h = sum(1 for l in logs if l.get("status") == "SUCCESS" and l.get("timestamp", 0) >= past_24h)
    return {
        "stats": {
            "total_recorded": len(logs),
            "failed_attempts_24h": failed_24h,
            "successful_logins_24h": success_24h
        },
        "audit_logs": logs
    }

@app.post("/api/security/login-audit/clear")
async def clear_login_audit_endpoint(user: dict = Depends(require_admin)):
    """Clears authentication security audit trail."""
    clear_login_audit_logs()
    logger.info(f"Security login audit trail cleared by user '{user['username']}'", component="security")
    return {"status": "cleared"}

# ----------------- DAILY AI BRIEFING -----------------

@app.get("/api/briefing/today")
async def get_today_briefing(user: dict = Depends(get_current_user)):
    """Generates or returns 24-hour synthesized AI security intelligence briefing."""
    from app.daily_briefing import generate_daily_briefing
    return generate_daily_briefing(hours=24)

@app.post("/api/briefing/generate")
async def trigger_generate_briefing(user: dict = Depends(require_admin)):
    """Triggers an on-demand refresh of the AI security digest."""
    from app.daily_briefing import generate_daily_briefing
    return generate_daily_briefing(hours=24)

# ----------------- WEBSOCKET ALERTS -----------------

@app.websocket("/api/ws/events")
async def websocket_events_endpoint(websocket: WebSocket):
    await notification_manager.connect(websocket)
    try:
        while True:
            # Keepalive listener
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        notification_manager.disconnect(websocket)
    except Exception:
        notification_manager.disconnect(websocket)

# ----------------- ANDROID APK DOWNLOAD -----------------

@app.get("/api/download/gawkr.apk")
@app.head("/api/download/gawkr.apk")
@app.get("/gawkr.apk")
@app.head("/gawkr.apk")
async def download_gawkr_apk():
    """Serves the compiled Gawkr Android APK with native background push notifications."""
    for p in [
        Path(__file__).resolve().parent.parent / "downloads" / "gawkr.apk",
        Path("/app/downloads/gawkr.apk"),
        Path("/app/frontend/dist/gawkr.apk"),
        Path(__file__).resolve().parent.parent.parent / "frontend" / "dist" / "gawkr.apk",
        Path(__file__).resolve().parent.parent.parent / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk",
    ]:
        if p.exists() and p.is_file():
            return FileResponse(
                str(p),
                media_type="application/vnd.android.package-archive",
                filename="gawkr.apk"
            )
    raise HTTPException(status_code=404, detail="Gawkr APK not found. Please build the Android package.")

# ----------------- FRONTEND STATIC SERVING (IF BUILT) -----------------
for candidate in [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(__file__).resolve().parent.parent / "frontend" / "dist",
    Path("/app/frontend/dist"),
]:
    if candidate.exists() and (candidate / "index.html").exists():
        app.mount("/", StaticFiles(directory=str(candidate), html=True), name="static")
        print(f"Mounted frontend static files from: {candidate}")
        break

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
