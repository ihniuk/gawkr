import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
RECORDINGS_DIR = DATA_DIR / "recordings"
TIMELAPSES_DIR = DATA_DIR / "timelapses"

for directory in [DATA_DIR, SNAPSHOTS_DIR, RECORDINGS_DIR, TIMELAPSES_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Security & Authentication
def _resolve_jwt_secret() -> str:
    env_secret = os.getenv("VISION_JWT_SECRET")
    if env_secret and env_secret.strip():
        return env_secret.strip()
    
    secret_file = DATA_DIR / ".jwt_secret"
    try:
        if secret_file.exists():
            val = secret_file.read_text(encoding="utf-8").strip()
            if len(val) >= 32:
                return val
    except Exception:
        pass
    
    import secrets
    new_secret = secrets.token_hex(32)
    try:
        secret_file.write_text(new_secret, encoding="utf-8")
    except Exception:
        pass
    return new_secret

JWT_SECRET = _resolve_jwt_secret()
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
