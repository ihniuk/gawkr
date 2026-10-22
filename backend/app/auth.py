import time
import hashlib
import hmac
import re
import jwt
from fastapi import HTTPException, Security, Depends, status
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

# User Management Helpers
def list_users() -> list:
    return storage.list_all_users()

def add_new_user(username: str, password: str, role: str = UserRole.VIEWER) -> dict:
    username = username.strip()
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters long")
    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", username):
        raise HTTPException(status_code=400, detail="Username contains invalid characters (letters, numbers, _, -, . allowed)")
    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long")
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
    if len(new_password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long")
    
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
