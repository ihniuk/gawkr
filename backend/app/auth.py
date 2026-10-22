import time
import hashlib
import hmac
import jwt
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import (
    JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    STREAM_TICKET_EXPIRE_SECONDS, DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS,
    DEFAULT_VIEWER_USER, DEFAULT_VIEWER_PASS
)
from app.models import UserRole

security_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# In-memory users table (backed by persistence in storage.py)
USERS_DB = {
    DEFAULT_ADMIN_USER: {
        "username": DEFAULT_ADMIN_USER,
        "password_hash": hash_password(DEFAULT_ADMIN_PASS),
        "role": UserRole.ADMIN
    },
    DEFAULT_VIEWER_USER: {
        "username": DEFAULT_VIEWER_USER,
        "password_hash": hash_password(DEFAULT_VIEWER_PASS),
        "role": UserRole.VIEWER
    }
}

def authenticate_user(username: str, password: str) -> dict:
    user = USERS_DB.get(username)
    if not user or user["password_hash"] != hash_password(password):
        return None
    return user

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = time.time() + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
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
    user = USERS_DB.get(username)
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
