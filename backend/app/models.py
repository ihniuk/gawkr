from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import time

class UserRole:
    ADMIN = "admin"
    VIEWER = "viewer"

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str
    role: str
    token: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"

class UserPasswordReset(BaseModel):
    password: str

class UserPasswordChange(BaseModel):
    username: str
    current_password: str
    new_password: str

class UserRoleUpdate(BaseModel):
    role: str

class UserItem(BaseModel):
    username: str
    role: str
    created_at: float

class DetectionZone(BaseModel):
    id: str
    name: str
    points: List[List[float]] # Normalized coordinates [[0.1, 0.2], ...]
    color: str = "#10b981"
    classes: List[str] = ["person", "car"]
    enabled: bool = True
    zone_type: str = "include" # "include" (only trigger inside), "exclude" (ignore inside), "privacy_mask" (blackout)

class CameraSettings(BaseModel):
    confidence_threshold: float = 0.75
    enabled_classes: List[str] = ["person", "car", "motorcycle", "dog", "cat"]
    zones: List[DetectionZone] = []
    recording_mode: str = "ai_event" # "continuous", "ai_event", "disabled"
    ai_enabled: bool = True
    sub_fps: int = 8
    use_hw_accel: bool = True
    hw_accel_backend: str = "auto" # "auto", "cpu", "nvdec", "qsv"
    video_encoder: str = "auto"    # "auto", "libx264", "h264_nvenc", "h264_qsv"
    encoding_preset: str = "ultrafast" # "ultrafast", "veryfast", "fast", "medium"
    encoding_crf: int = 26
    alert_cooldown_seconds: int = 45   # Cooldown between alert triggers to prevent constant spam
    min_confirmation_frames: int = 4   # Require N consecutive frames to confirm real object vs glitch
    min_area_pixels: int = 2500        # Reject small pixel changes, leaves, wind
    pre_roll_seconds: int = 4          # Pre-roll recording seconds before detection
    post_roll_seconds: int = 6         # Post-roll recording seconds after detection

class CameraCreate(BaseModel):
    name: str
    ip: str = ""
    port: int = 554
    onvif_port: int = 80
    username: str = ""
    password: str = ""
    main_stream_url: str
    sub_stream_url: Optional[str] = None
    vendor: str = "Generic"
    model: str = "IP Camera"
    is_simulation: bool = False

class CameraUpdate(BaseModel):
    name: Optional[str] = None
    ip: Optional[str] = None
    port: Optional[int] = None
    onvif_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    main_stream_url: Optional[str] = None
    sub_stream_url: Optional[str] = None
    settings: Optional[CameraSettings] = None

class CameraModel(BaseModel):
    id: str
    name: str
    ip: str
    port: int
    onvif_port: int
    username: str
    password: str
    main_stream_url: str
    sub_stream_url: str
    vendor: str
    model: str
    is_simulation: bool = False
    is_online: bool = False
    created_at: float = Field(default_factory=time.time)
    settings: CameraSettings = Field(default_factory=CameraSettings)

class StreamTelemetry(BaseModel):
    camera_id: str
    fps: float = 0.0
    bitrate_kbps: int = 0
    resolution: str = "Unknown"
    decoder: str = "NVDEC (HW)"
    ai_latency_ms: float = 0.0
    dropped_frames: int = 0
    status: str = "active"

class DetectionObject(BaseModel):
    label: str
    confidence: float
    box: List[float] # [ymin, xmin, ymax, xmax] normalized 0.0 - 1.0
    zone_id: Optional[str] = None
    is_stationary: Optional[bool] = False
    has_moved: Optional[bool] = True

class DetectionEvent(BaseModel):
    id: str
    camera_id: str
    camera_name: str
    timestamp: float
    objects: List[DetectionObject]
    snapshot_url: str
    video_clip_url: Optional[str] = None
    ai_description: Optional[str] = None
    threat_level: Optional[str] = "Safe" # "Safe", "Suspicious", "Threat"

# ----------------- SYSTEM SETTINGS & CONTROL PANEL MODELS -----------------

class StorageConfig(BaseModel):
    recordings_dir: str = ""
    snapshots_dir: str = ""
    max_storage_gb: int = 250
    retention_days: int = 14
    auto_purge_enabled: bool = True

class AIVisionConfig(BaseModel):
    enabled: bool = False
    provider: str = "gemini" # "gemini", "openai", "ollama", "custom"
    api_key: str = ""
    base_url: str = ""
    model_name: str = "gemini-1.5-flash"
    prompt_template: str = (
        "Analyze this surveillance security snapshot. Provide a concise 1-2 sentence description "
        "of what the person, vehicle, or subject is doing. Note clothing color, vehicle make/color, "
        "and assess safety threat (Safe / Suspicious / Threat). Ignore stationary parked vehicles that have not moved."
    )

class TelegramConfig(BaseModel):
    enabled: bool = False
    bot_token: str = ""
    chat_id: str = ""
    send_photo: bool = True

class DiscordConfig(BaseModel):
    enabled: bool = False
    webhook_url: str = ""

class SlackConfig(BaseModel):
    enabled: bool = False
    webhook_url: str = ""

class MqttConfig(BaseModel):
    enabled: bool = False
    broker_url: str = ""
    broker_host: str = "localhost"
    broker_port: int = 1883
    username: str = ""
    password: str = ""
    topic_prefix: str = "homeassistant/nvr"
    ha_discovery: bool = True

class PushoverConfig(BaseModel):
    enabled: bool = False
    user_key: str = ""
    api_token: str = ""

class NotificationsConfig(BaseModel):
    telegram: TelegramConfig = Field(default_factory=TelegramConfig)
    discord: DiscordConfig = Field(default_factory=DiscordConfig)
    slack: SlackConfig = Field(default_factory=SlackConfig)
    mqtt: MqttConfig = Field(default_factory=MqttConfig)
    pushover: PushoverConfig = Field(default_factory=PushoverConfig)

class HardwareConfig(BaseModel):
    hw_accel_backend: str = "auto" # "auto", "cpu", "nvdec", "qsv"
    video_encoder: str = "auto"    # "auto", "libx264", "h264_nvenc", "h264_qsv"
    encoding_preset: str = "ultrafast" # "ultrafast", "veryfast", "fast", "medium"
    encoding_crf: int = 26

class SystemSettings(BaseModel):
    storage: StorageConfig = Field(default_factory=StorageConfig)
    ai_vision: AIVisionConfig = Field(default_factory=AIVisionConfig)
    notifications: NotificationsConfig = Field(default_factory=NotificationsConfig)
    hardware: HardwareConfig = Field(default_factory=HardwareConfig)

class DiscoveredDevice(BaseModel):
    ip: str
    vendor: str
    model: str
    onvif_port: int
    rtsp_port: int
    endpoint_url: str
    mac_address: Optional[str] = None

class CredentialVerifyRequest(BaseModel):
    ip: str
    onvif_port: int = 80
    rtsp_port: int = 554
    username: str
    password: str

class ProfileInfo(BaseModel):
    name: str
    token: str
    resolution: str
    encoding: str
    rtsp_url: str
    fps: Optional[int] = 25
    recommended_for: Optional[str] = "main" # "main", "sub", "both", "secondary"
    description: Optional[str] = ""

class TestStreamRequest(BaseModel):
    rtsp_url: str

class TestStreamResponse(BaseModel):
    success: bool
    message: str
    resolution: Optional[str] = None
    fps: Optional[float] = None

class CredentialVerifyResponse(BaseModel):
    success: bool
    message: str
    vendor: str = "Unknown"
    model: str = "IP Camera"
    profiles: List[ProfileInfo] = []
    suggested_main_url: str = ""
    suggested_sub_url: str = ""
