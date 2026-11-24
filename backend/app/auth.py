import time
import hashlib
import hmac
import re
import io
import base64
import secrets
import json
import jwt
import pyotp
import qrcode
from typing import Optional, List, Tuple
from fastapi import HTTPException, Security, Depends, Request, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import (
    JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    STREAM_TICKET_EXPIRE_SECONDS, DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS,
    DEFAULT_VIEWER_USER, DEFAULT_VIEWER_PASS
)
from app.models import UserRole
import app.storage as storage

security_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def authenticate_user(username: str, password: str) -> dict:
    user = storage.get_user_by_username(username)
    if not user or user["password_hash"] != hash_password(password):
        return None
    return user

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = time.time() + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire, "typ": "access"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Enforce token type: only permit full access tokens on authenticated routes
        if payload.get("typ") not in (None, "access"):
            return None
        return payload
    except jwt.PyJWTError:
        return None

def create_stream_ticket(camera_id: str, username: str) -> str:
    """Generates a short-lived signed ticket for secure video stream access."""
    expire = int(time.time() + STREAM_TICKET_EXPIRE_SECONDS)
    payload = {
        "cam": camera_id,
        "sub": username,
        "exp": expire,
        "typ": "stream_ticket"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_stream_ticket(ticket: str, camera_id: str) -> bool:
    """Verifies that the stream ticket is valid and matches the requested camera."""
    if not ticket:
        return False
    try:
        payload = jwt.decode(ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("typ") != "stream_ticket":
            return False
        if payload.get("cam") != camera_id:
            return False
        if payload.get("exp", 0) < time.time():
            return False
        return True
    except jwt.PyJWTError:
        return False

# ----------------- 2FA / TOTP HELPERS -----------------

def create_2fa_challenge_token(username: str, role: str) -> str:
    """Generates a short-lived token (5 min) specifically for completing 2FA."""
    expire = int(time.time() + 300)
    payload = {
        "sub": username,
        "role": role,
        "exp": expire,
        "typ": "2fa_challenge"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_2fa_challenge_token(challenge_token: str) -> Optional[dict]:
    """Verifies that the challenge token is valid and of type '2fa_challenge'."""
    if not challenge_token:
        return None
    try:
        payload = jwt.decode(challenge_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("typ") != "2fa_challenge":
            return None
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except jwt.PyJWTError:
        return None

def generate_totp_secret() -> str:
    return pyotp.random_base32()

def generate_totp_qr_data_url(username: str, secret: str, issuer_name: str = "Gawkr NVR") -> Tuple[str, str]:
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=username, issuer_name=issuer_name)
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#06b6d4", back_color="#030712")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64_img = base64.b64encode(buf.getvalue()).decode()
    data_url = f"data:image/png;base64,{b64_img}"
    return provisioning_uri, data_url

def verify_totp_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    cleaned = code.strip().replace(" ", "").replace("-", "")
    totp = pyotp.TOTP(secret)
    return bool(totp.verify(cleaned, valid_window=1))

def generate_backup_codes(count: int = 8) -> Tuple[List[str], List[str]]:
    plain_codes = []
    hashed_codes = []
    for _ in range(count):
        code = f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        plain_codes.append(code)
        hashed_codes.append(hashlib.sha256(code.encode()).hexdigest())
    return plain_codes, hashed_codes

def verify_and_consume_backup_code(username: str, code: str) -> bool:
    user = storage.get_user_by_username(username)
    if not user or not user.get("backup_codes"):
        return False
    try:
        stored_hashes = json.loads(user["backup_codes"])
    except Exception:
        return False
    cleaned = code.strip().upper()
    code_hash = hashlib.sha256(cleaned.encode()).hexdigest()
    if code_hash in stored_hashes:
        stored_hashes.remove(code_hash)
        storage.update_user_backup_codes(username, json.dumps(stored_hashes))
        return True
    return False

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security_scheme)) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required"
        )
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    username = payload["sub"]
    user = storage.get_user_by_username(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found"
        )
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this operation"
        )
    return user


async def verify_ha_integration_auth(
    request: Request,
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
) -> dict:
    """Authenticates Home Assistant CCTV requests via JWT Bearer, ?token=, or X-HA-Token API key."""
    candidate = None
    if credentials and credentials.credentials:
        candidate = credentials.credentials
    elif request.headers.get("x-ha-token"):
        candidate = request.headers.get("x-ha-token").strip()
    elif token:
        candidate = token.strip()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token or Home Assistant API key required",
        )

    settings = storage.get_system_settings()
    ha_key = getattr(getattr(settings.notifications, "mqtt", None), "ha_api_key", "") or ""
    if ha_key and hmac.compare_digest(candidate, ha_key):
        return {"username": "homeassistant", "role": UserRole.ADMIN, "auth_type": "ha_api_key"}

    payload = decode_access_token(candidate)
    if payload and "sub" in payload:
        user = storage.get_user_by_username(payload["sub"])
        if user:
            return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )

def validate_password_strength(password: str) -> None:
    """Enforces minimum 8 characters, with letters and numbers."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )
    if not any(c.isalpha() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one letter"
        )
    if not any(c.isdigit() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number"
        )

# User Management Helpers
def list_users() -> list:
    return storage.list_all_users()

def add_new_user(username: str, password: str, role: str = UserRole.VIEWER) -> dict:
    username = username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters long")
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", username):
        raise HTTPException(status_code=400, detail="Username contains invalid characters (letters, numbers, _, -, . allowed)")
    validate_password_strength(password)
    if role not in [UserRole.ADMIN, UserRole.VIEWER]:
        raise HTTPException(status_code=400, detail="Role must be either 'admin' or 'viewer'")
    
    existing = storage.get_user_by_username(username)
    if existing:
        raise HTTPException(status_code=400, detail=f"User '{username}' already exists")
    
    pwd_hash = hash_password(password)
    return storage.create_user_in_db(username, pwd_hash, role)

def reset_user_password(username: str, new_password: str) -> dict:
    user = storage.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    validate_password_strength(new_password)
    
    pwd_hash = hash_password(new_password)
    storage.update_user_password_in_db(username, pwd_hash)
    return {"message": f"Password for '{username}' updated successfully"}

def update_user_role(username: str, new_role: str, current_username: str) -> dict:
    user = storage.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if new_role not in [UserRole.ADMIN, UserRole.VIEWER]:
        raise HTTPException(status_code=400, detail="Role must be either 'admin' or 'viewer'")
    
    if user["role"] == UserRole.ADMIN and new_role == UserRole.VIEWER:
        if username == current_username:
            raise HTTPException(status_code=400, detail="You cannot demote your own administrator account")
        if storage.count_admin_users() <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the only remaining administrator")

    storage.update_user_role_in_db(username, new_role)
    return {"message": f"Role for '{username}' updated to '{new_role}'"}

def delete_user(username: str, current_username: str) -> dict:
    if username == current_username:
        raise HTTPException(status_code=400, detail="You cannot delete your own account while logged in")
    
    user = storage.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user["role"] == UserRole.ADMIN and storage.count_admin_users() <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only remaining administrator")
    
    storage.delete_user_from_db(username)
    return {"message": f"User '{username}' deleted successfully"}
