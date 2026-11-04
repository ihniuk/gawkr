import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
RECORDINGS_DIR = DATA_DIR / "recordings"

for directory in [DATA_DIR, SNAPSHOTS_DIR, RECORDINGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Security & Authentication
JWT_SECRET = os.getenv("VISION_JWT_SECRET", "super-secret-vision-glass-nvr-key-2026-v1")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days for persistent home NVR sessions
STREAM_TICKET_EXPIRE_SECONDS = 86400 * 7  # 7 days for stable persistent streaming without 403 timeouts

# Default Credentials (can be changed in settings)
DEFAULT_ADMIN_USER = "admin"
DEFAULT_ADMIN_PASS = "admin123"
DEFAULT_VIEWER_USER = "viewer"
DEFAULT_VIEWER_PASS = "viewer123"

# AI Inference Defaults
DEFAULT_CONFIDENCE_THRESHOLD = 0.75
DEFAULT_CLASSES = ["person", "car", "motorcycle", "bus", "truck", "dog", "cat", "bicycle"]
INFERENCE_TARGET_FPS = 8
