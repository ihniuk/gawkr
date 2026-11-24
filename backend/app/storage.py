import sqlite3
import json
import time
import shutil
import os
import hashlib
import uuid
import ipaddress
from typing import List, Optional, Dict, Any
from pathlib import Path
import cv2
import numpy as np
from app.config import (
    DATA_DIR, SNAPSHOTS_DIR, RECORDINGS_DIR,
    DEFAULT_ADMIN_USER, DEFAULT_ADMIN_PASS,
    DEFAULT_VIEWER_USER, DEFAULT_VIEWER_PASS
)
from app.models import (
    CameraModel, CameraSettings, DetectionEvent, DetectionObject, IncidentItem,
    SystemSettings, StorageConfig, AIVisionConfig, NotificationsConfig, AIMemoryConfig, AIMemoryItem
)

DB_PATH = DATA_DIR / "vision_nvr.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    cursor = conn.cursor()
    
    # Cameras table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cameras (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT NOT NULL,
        port INTEGER DEFAULT 554,
        onvif_port INTEGER DEFAULT 80,
        username TEXT DEFAULT '',
        password TEXT DEFAULT '',
        main_stream_url TEXT NOT NULL,
        sub_stream_url TEXT NOT NULL,
        vendor TEXT DEFAULT 'Generic',
        model TEXT DEFAULT 'IP Camera',
        is_simulation INTEGER DEFAULT 0,
        settings_json TEXT NOT NULL,
        created_at REAL NOT NULL
    );
    """)
    
    # Detection Events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        camera_id TEXT NOT NULL,
        camera_name TEXT NOT NULL,
        timestamp REAL NOT NULL,
        objects_json TEXT NOT NULL,
        snapshot_url TEXT NOT NULL,
        video_clip_url TEXT,
        ai_description TEXT,
        threat_level TEXT DEFAULT 'Safe'
    );
    """)
    
    # Try adding new columns if table already existed without them
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN ai_description TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE events ADD COLUMN threat_level TEXT DEFAULT 'Safe';")
    except Exception:
        pass

    # Natural Language Full-Text Search (FTS5) Table for Events
    try:
        cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
            event_id UNINDEXED,
            camera_name,
            objects_text,
            ai_description,
            threat_level
        );
        """)
        # Populate FTS5 table from existing events if empty
        cursor.execute("SELECT COUNT(*) FROM events_fts;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
            INSERT INTO events_fts (event_id, camera_name, objects_text, ai_description, threat_level)
            SELECT id, camera_name, objects_json, COALESCE(ai_description, ''), COALESCE(threat_level, 'Safe')
            FROM events;
            """)
        
        # Triggers to keep events_fts synchronized
        cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON events BEGIN
            INSERT INTO events_fts (event_id, camera_name, objects_text, ai_description, threat_level)
            VALUES (new.id, new.camera_name, new.objects_json, COALESCE(new.ai_description, ''), COALESCE(new.threat_level, 'Safe'));
        END;
        """)
        cursor.execute("""
        CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON events BEGIN
            DELETE FROM events_fts WHERE event_id = old.id;
        END;
        """)
    except Exception as e:
        print(f"FTS5 initialization notice: {e}")

    # Unified Multi-Camera Incidents Table (Feature 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        camera_sequence_json TEXT NOT NULL,
        event_ids_json TEXT NOT NULL,
        threat_level TEXT NOT NULL DEFAULT 'Safe',
        preview_snapshots_json TEXT DEFAULT '[]',
        created_at REAL NOT NULL
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_start ON incidents(start_time DESC);")

    # System Settings table (Key/Value store for Control Panel)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
    );
    """)

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        created_at REAL NOT NULL,
        totp_secret TEXT DEFAULT NULL,
        is_totp_enabled INTEGER DEFAULT 0,
        backup_codes TEXT DEFAULT NULL
    );
    """)

    # Ensure 2FA columns exist on existing users table
    cursor.execute("PRAGMA table_info(users)")
    existing_user_cols = [c[1] for c in cursor.fetchall()]
    if "totp_secret" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL")
    if "is_totp_enabled" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN is_totp_enabled INTEGER DEFAULT 0")
    if "backup_codes" not in existing_user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN backup_codes TEXT DEFAULT NULL")

    # Seed default users if table is empty
    cursor.execute("SELECT COUNT(*) FROM users;")
    if cursor.fetchone()[0] == 0:
        now = time.time()
        admin_hash = hashlib.sha256(DEFAULT_ADMIN_PASS.encode()).hexdigest()
        viewer_hash = hashlib.sha256(DEFAULT_VIEWER_PASS.encode()).hexdigest()
        cursor.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                       (DEFAULT_ADMIN_USER, admin_hash, "admin", now))
        cursor.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                       (DEFAULT_VIEWER_USER, viewer_hash, "viewer", now))
    
    # Login Security Audit table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS login_audit (
        id TEXT PRIMARY KEY,
        timestamp REAL NOT NULL,
        username TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        status TEXT NOT NULL,
        failure_reason TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_login_timestamp ON login_audit(timestamp);")

    # Blocked IPs table for Brute-Force Defense (Auto-blocks after 2 failed logins)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS blocked_ips (
        ip_address TEXT PRIMARY KEY,
        failed_attempts INTEGER DEFAULT 0,
        blocked_at REAL,
        reason TEXT DEFAULT 'Excessive failed login attempts',
        is_blocked INTEGER DEFAULT 1
    );
    """)

    conn.commit()
    conn.close()

# ----------------- CAMERAS PERSISTENCE -----------------

def save_camera_to_db(cam: CameraModel):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO cameras 
    (id, name, ip, port, onvif_port, username, password, main_stream_url, sub_stream_url, vendor, model, is_simulation, settings_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        cam.id, cam.name, cam.ip, cam.port, cam.onvif_port,
        cam.username, cam.password, cam.main_stream_url, cam.sub_stream_url,
        cam.vendor, cam.model, 1 if cam.is_simulation else 0,
        json.dumps(cam.settings.model_dump()), cam.created_at
    ))
    conn.commit()
    conn.close()

def load_cameras_from_db() -> List[CameraModel]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cameras ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    
    cameras = []
    for r in rows:
        settings_dict = json.loads(r[12]) if r[12] else {}
        cam = CameraModel(
            id=r[0],
            name=r[1],
            ip=r[2],
            port=r[3],
            onvif_port=r[4],
            username=r[5],
            password=r[6],
            main_stream_url=r[7],
            sub_stream_url=r[8],
            vendor=r[9],
            model=r[10],
            is_simulation=bool(r[11]),
            settings=CameraSettings(**settings_dict),
            created_at=r[13]
        )
        cameras.append(cam)
    return cameras

def delete_camera_from_db(camera_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cameras WHERE id = ?", (camera_id,))
    conn.commit()
    conn.close()

# ----------------- EVENTS PERSISTENCE -----------------

def save_event_to_db(event: DetectionEvent):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO events (id, camera_id, camera_name, timestamp, objects_json, snapshot_url, video_clip_url, ai_description, threat_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event.id, event.camera_id, event.camera_name, event.timestamp,
        json.dumps([obj.model_dump() for obj in event.objects]),
        event.snapshot_url, event.video_clip_url,
        event.ai_description, event.threat_level
    ))
    conn.commit()
    conn.close()

def load_recent_events_from_db(
    limit: int = 500,
    camera_id: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None
) -> List[DetectionEvent]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    query = "SELECT * FROM events WHERE 1=1"
    params = []
    
    if camera_id:
        query += " AND camera_id = ?"
        params.append(camera_id)
    if start_time is not None:
        query += " AND timestamp >= ?"
        params.append(start_time)
    if end_time is not None:
        query += " AND timestamp <= ?"
        params.append(end_time)
        
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    
    events = []
    for r in rows:
        objs_data = json.loads(r[4])
        objs = [DetectionObject(**o) for o in objs_data]
        ai_desc = r[7] if len(r) > 7 else None
        threat = r[8] if len(r) > 8 else "Safe"
        clip_url = r[6]
        if not clip_url:
            # Check if clip file exists on disk
            potential_file = RECORDINGS_DIR / f"{r[1]}_{r[0]}.mp4"
            if potential_file.exists():
                clip_url = f"/api/recordings/{r[1]}_{r[0]}.mp4"
        events.append(DetectionEvent(
            id=r[0],
            camera_id=r[1],
            camera_name=r[2],
            timestamp=r[3],
            objects=objs,
            snapshot_url=r[5],
            video_clip_url=clip_url,
            ai_description=ai_desc,
            threat_level=threat
        ))
    return events

def update_event_video_clip(event_id: str, video_clip_url: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE events SET video_clip_url = ? WHERE id = ?", (video_clip_url, event_id))
    conn.commit()
    conn.close()

def update_event_ai_description(event_id: str, ai_description: str, threat_level: str = "Safe"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE events SET ai_description = ?, threat_level = ? WHERE id = ?", (ai_description, threat_level, event_id))
    try:
        cursor.execute("UPDATE events_fts SET ai_description = ?, threat_level = ? WHERE event_id = ?", (ai_description, threat_level, event_id))
    except Exception:
        pass
    conn.commit()
    conn.close()

def search_events_fts(
    fts_query: str,
    camera_id: Optional[str] = None,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
    threat_level: Optional[str] = None,
    limit: int = 50
) -> List[DetectionEvent]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    params = []
    
    clean_fts = fts_query.strip() if fts_query else ""
    if clean_fts:
        sql = """
        SELECT e.* 
        FROM events e
        JOIN events_fts f ON e.id = f.event_id
        WHERE events_fts MATCH ?
        """
        params.append(clean_fts)
    else:
        sql = "SELECT e.* FROM events e WHERE 1=1"
        
    if camera_id:
        sql += " AND e.camera_id = ?"
        params.append(camera_id)
    if start_time is not None:
        sql += " AND e.timestamp >= ?"
        params.append(start_time)
    if end_time is not None:
        sql += " AND e.timestamp <= ?"
        params.append(end_time)
    if threat_level and threat_level.upper() != "ALL":
        sql += " AND LOWER(e.threat_level) = LOWER(?)"
        params.append(threat_level)

    if clean_fts:
        sql += " ORDER BY rank, e.timestamp DESC LIMIT ?"
    else:
        sql += " ORDER BY e.timestamp DESC LIMIT ?"
    params.append(limit)

    try:
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()
    except Exception:
        # Fallback to standard LIKE search if FTS query syntax error
        like_term = f"%{clean_fts.replace('*', '').strip()}%"
        fallback_sql = """
        SELECT * FROM events 
        WHERE (ai_description LIKE ? OR camera_name LIKE ? OR objects_json LIKE ?)
        """
        f_params = [like_term, like_term, like_term]
        if camera_id:
            fallback_sql += " AND camera_id = ?"
            f_params.append(camera_id)
        if start_time is not None:
            fallback_sql += " AND timestamp >= ?"
            f_params.append(start_time)
        if end_time is not None:
            fallback_sql += " AND timestamp <= ?"
            f_params.append(end_time)
        fallback_sql += " ORDER BY timestamp DESC LIMIT ?"
        f_params.append(limit)
        cursor.execute(fallback_sql, tuple(f_params))
        rows = cursor.fetchall()

    conn.close()

    events = []
    for r in rows:
        try:
            objs_data = json.loads(r[4])
            objs = [DetectionObject(**o) for o in objs_data]
        except Exception:
            objs = []
        ai_desc = r[7] if len(r) > 7 else None
        threat = r[8] if len(r) > 8 else "Safe"
        clip_url = r[6] if len(r) > 6 else None
        events.append(DetectionEvent(
            id=r[0],
            camera_id=r[1],
            camera_name=r[2],
            timestamp=r[3],
            objects=objs,
            snapshot_url=r[5],
            video_clip_url=clip_url,
            ai_description=ai_desc,
            threat_level=threat
        ))
    return events

# ----------------- MULTI-CAMERA INCIDENTS PERSISTENCE -----------------

def save_incident_to_db(incident: IncidentItem):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO incidents (
        id, start_time, end_time, title, summary,
        camera_sequence_json, event_ids_json, threat_level,
        preview_snapshots_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        incident.id,
        incident.start_time,
        incident.end_time,
        incident.title,
        incident.summary,
        json.dumps(incident.camera_sequence),
        json.dumps(incident.event_ids),
        incident.threat_level,
        json.dumps(incident.preview_snapshots),
        incident.created_at
    ))
    conn.commit()
    conn.close()

def load_recent_incidents_from_db(limit: int = 50) -> List[IncidentItem]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, start_time, end_time, title, summary, camera_sequence_json, event_ids_json, threat_level, preview_snapshots_json, created_at
    FROM incidents
    ORDER BY start_time DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    incidents = []
    for r in rows:
        try:
            cam_seq = json.loads(r[5])
        except Exception:
            cam_seq = []
        try:
            evt_ids = json.loads(r[6])
        except Exception:
            evt_ids = []
        try:
            snaps = json.loads(r[8]) if r[8] else []
        except Exception:
            snaps = []

        incidents.append(IncidentItem(
            id=r[0],
            start_time=r[1],
            end_time=r[2],
            title=r[3],
            summary=r[4],
            camera_sequence=cam_seq,
            event_ids=evt_ids,
            threat_level=r[7] or "Safe",
            preview_snapshots=snaps,
            created_at=r[9]
        ))
    return incidents

def get_incident_by_id(incident_id: str) -> Optional[IncidentItem]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, start_time, end_time, title, summary, camera_sequence_json, event_ids_json, threat_level, preview_snapshots_json, created_at
    FROM incidents WHERE id = ?
    """, (incident_id,))
    r = cursor.fetchone()
    conn.close()
    if not r:
        return None
    try:
        cam_seq = json.loads(r[5])
        evt_ids = json.loads(r[6])
        snaps = json.loads(r[8]) if r[8] else []
    except Exception:
        cam_seq, evt_ids, snaps = [], [], []

    return IncidentItem(
        id=r[0],
        start_time=r[1],
        end_time=r[2],
        title=r[3],
        summary=r[4],
        camera_sequence=cam_seq,
        event_ids=evt_ids,
        threat_level=r[7] or "Safe",
        preview_snapshots=snaps,
        created_at=r[9]
    )

def delete_incident_from_db(incident_id: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM incidents WHERE id = ?", (incident_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def delete_event_from_db(event_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT snapshot_url, video_clip_url FROM events WHERE id = ?", (event_id,))
    row = cursor.fetchone()
    if row:
        snap_url, clip_url = row
        # Delete files from disk if they exist
        if snap_url and snap_url.startswith("/api/snapshots/"):
            fname = snap_url.replace("/api/snapshots/", "")
            fpath = SNAPSHOTS_DIR / fname
            if fpath.exists():
                try: fpath.unlink()
                except Exception: pass
        if clip_url and clip_url.startswith("/api/recordings/"):
            fname = clip_url.replace("/api/recordings/", "")
            fpath = RECORDINGS_DIR / fname
            if fpath.exists():
                try: fpath.unlink()
                except Exception: pass
        cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
    conn.close()

def save_snapshot_image(camera_id: str, frame: np.ndarray, event_id: str) -> str:
    """Saves JPEG snapshot to disk and returns web URL path."""
    filename = f"{camera_id}_{event_id}.jpg"
    filepath = SNAPSHOTS_DIR / filename
    cv2.imwrite(str(filepath), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return f"/api/snapshots/{filename}"

# ----------------- SYSTEM SETTINGS PERSISTENCE -----------------

_cached_sys_settings: Optional[SystemSettings] = None
_cached_sys_settings_time: float = 0.0

def resolve_storage_dir(configured_path: Optional[str], default_dir: Path) -> Path:
    """
    Resolves a configured directory path string to a valid, existing directory Path.
    Handles cross-platform mismatches (e.g., Windows paths like C:\... inside a Linux Docker container),
    relative paths, and non-existent paths by falling back safely to default_dir.
    """
    if not configured_path or not str(configured_path).strip():
        return default_dir

    cleaned = str(configured_path).strip()

    # Check if a Windows drive path was provided on POSIX (e.g., C:\...)
    if os.name != 'nt' and len(cleaned) >= 2 and cleaned[1] == ':' and cleaned[0].isalpha():
        return default_dir

    try:
        p = Path(cleaned).expanduser().resolve()
        if p.exists() and p.is_dir():
            return p
    except Exception:
        pass

    return default_dir

def get_system_settings() -> SystemSettings:
    global _cached_sys_settings, _cached_sys_settings_time
    now = time.time()
    if _cached_sys_settings is not None and (now - _cached_sys_settings_time) < 2.0:
        return _cached_sys_settings

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT value_json FROM system_settings WHERE key = 'global'")
    row = cursor.fetchone()
    conn.close()
    
    if row and row[0]:
        try:
            data = json.loads(row[0])
            settings = SystemSettings(**data)
            
            # Ensure valid directory defaults and auto-heal cross-platform / invalid paths
            rec_resolved = resolve_storage_dir(settings.storage.recordings_dir, RECORDINGS_DIR)
            snap_resolved = resolve_storage_dir(settings.storage.snapshots_dir, SNAPSHOTS_DIR)

            needs_resave = False
            if settings.storage.recordings_dir != str(rec_resolved):
                settings.storage.recordings_dir = str(rec_resolved)
                needs_resave = True
            if settings.storage.snapshots_dir != str(snap_resolved):
                settings.storage.snapshots_dir = str(snap_resolved)
                needs_resave = True

            if not getattr(settings, 'ai_memory', None):
                settings.ai_memory = AIMemoryConfig()
                needs_resave = True

            if needs_resave:
                save_system_settings(settings)

            _cached_sys_settings = settings
            _cached_sys_settings_time = now
            return settings
        except Exception:
            pass
            
    # Default initial settings
    defaults = SystemSettings(
        storage=StorageConfig(
            recordings_dir=str(RECORDINGS_DIR),
            snapshots_dir=str(SNAPSHOTS_DIR),
            max_storage_gb=250,
            retention_days=14,
            auto_purge_enabled=True
        )
    )
    save_system_settings(defaults)
    _cached_sys_settings = defaults
    _cached_sys_settings_time = now
    return defaults

def save_system_settings(settings: SystemSettings):
    global _cached_sys_settings, _cached_sys_settings_time, _cached_disk_stats
    
    # Auto-resolve and sanitize directories before saving
    settings.storage.recordings_dir = str(resolve_storage_dir(settings.storage.recordings_dir, RECORDINGS_DIR))
    settings.storage.snapshots_dir = str(resolve_storage_dir(settings.storage.snapshots_dir, SNAPSHOTS_DIR))

    _cached_sys_settings = settings
    _cached_sys_settings_time = time.time()
    _cached_disk_stats = None
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO system_settings (key, value_json)
    VALUES ('global', ?)
    """, (json.dumps(settings.model_dump()),))
    conn.commit()
    conn.close()

_cached_disk_stats: Optional[Dict[str, Any]] = None
_cached_disk_stats_time: float = 0.0

def get_storage_disk_stats(force_refresh: bool = False) -> Dict[str, Any]:
    """Calculates disk drive space and total recordings / snapshots directory byte usage with caching."""
    global _cached_disk_stats, _cached_disk_stats_time
    now = time.time()
    if not force_refresh and _cached_disk_stats is not None and (now - _cached_disk_stats_time < 45.0):
        return _cached_disk_stats

    settings = get_system_settings()
    rec_dir = resolve_storage_dir(settings.storage.recordings_dir, RECORDINGS_DIR)
    snap_dir = resolve_storage_dir(settings.storage.snapshots_dir, SNAPSHOTS_DIR)

    total_bytes, used_bytes, free_bytes = shutil.disk_usage(str(DATA_DIR))
    
    # Calculate folder usage using os.scandir for high speed
    def _dir_stats(p: Path):
        if not p.exists() or not p.is_dir():
            return 0, 0
        count = 0
        total = 0
        try:
            with os.scandir(p) as it:
                for entry in it:
                    try:
                        if entry.is_file(follow_symlinks=False):
                            count += 1
                            total += entry.stat().st_size
                    except OSError:
                        pass
        except OSError:
            pass
        return count, total

    rec_count, rec_size = _dir_stats(rec_dir)
    snap_count, snap_size = _dir_stats(snap_dir)

    result = {
        "disk_total_gb": round(total_bytes / (1024**3), 1),
        "disk_used_gb": round(used_bytes / (1024**3), 1),
        "disk_free_gb": round(free_bytes / (1024**3), 1),
        "recordings_size_mb": round(rec_size / (1024**2), 1),
        "snapshots_size_mb": round(snap_size / (1024**2), 1),
        "recordings_count": rec_count,
        "snapshots_count": snap_count,
        "recordings_dir": str(rec_dir),
        "snapshots_dir": str(snap_dir),
        "max_storage_gb": settings.storage.max_storage_gb,
        "retention_days": settings.storage.retention_days,
        "auto_purge_enabled": settings.storage.auto_purge_enabled
    }
    _cached_disk_stats = result
    _cached_disk_stats_time = now
    return result

def purge_expired_storage() -> Dict[str, int]:
    """
    Automated FIFO retention worker:
    1. Purges events older than `retention_days` (if configured > 0).
    2. Enforces `max_storage_gb` cap if `auto_purge_enabled` is True by deleting oldest files.
    """
    settings = get_system_settings()
    storage = settings.storage
    if not storage.auto_purge_enabled:
        return {"deleted_events": 0, "deleted_files": 0, "freed_mb": 0}

    rec_dir = resolve_storage_dir(storage.recordings_dir, RECORDINGS_DIR)
    snap_dir = resolve_storage_dir(storage.snapshots_dir, SNAPSHOTS_DIR)
    
    now = time.time()
    deleted_events = 0
    deleted_files = 0
    freed_bytes = 0

    # 1. Retention by Days
    if storage.retention_days and storage.retention_days > 0:
        cutoff = now - (storage.retention_days * 86400.0)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id, snapshot_url, video_clip_url FROM events WHERE timestamp < ?", (cutoff,))
        expired_rows = cursor.fetchall()
        for eid, surl, curl in expired_rows:
            if surl and surl.startswith("/api/snapshots/"):
                sp = snap_dir / surl.replace("/api/snapshots/", "")
                if sp.exists():
                    try:
                        freed_bytes += sp.stat().st_size
                        sp.unlink()
                        deleted_files += 1
                    except Exception: pass
            if curl and curl.startswith("/api/recordings/"):
                cp = rec_dir / curl.replace("/api/recordings/", "")
                if cp.exists():
                    try:
                        freed_bytes += cp.stat().st_size
                        cp.unlink()
                        deleted_files += 1
                    except Exception: pass
            deleted_events += 1

        cursor.execute("DELETE FROM events WHERE timestamp < ?", (cutoff,))
        conn.commit()
        conn.close()

    # 2. Quota by Max Storage GB
    max_bytes = storage.max_storage_gb * (1024**3)
    target_bytes = int(max_bytes * 0.85) # Purge down to 85% capacity

    all_files = []
    for d in (rec_dir, snap_dir):
        if d.exists():
            for f in d.glob("*.*"):
                if f.is_file():
                    try:
                        all_files.append((f.stat().st_mtime, f.stat().st_size, f))
                    except Exception: pass

    current_size = sum(sz for _, sz, _ in all_files)
    if current_size > max_bytes:
        # Sort oldest first
        all_files.sort(key=lambda x: x[0])
        for mtime, sz, fpath in all_files:
            if current_size <= target_bytes:
                break
            try:
                fpath.unlink()
                current_size -= sz
                freed_bytes += sz
                deleted_files += 1
            except Exception: pass

    return {
        "deleted_events": deleted_events,
        "deleted_files": deleted_files,
        "freed_mb": round(freed_bytes / (1024**2), 1)
    }

# ----------------- USERS PERSISTENCE -----------------

def get_user_by_username(username: str) -> Optional[dict]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT username, password_hash, role, created_at, totp_secret, is_totp_enabled, backup_codes FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "username": row[0],
        "password_hash": row[1],
        "role": row[2],
        "created_at": row[3],
        "totp_secret": row[4],
        "is_totp_enabled": bool(row[5] == 1),
        "backup_codes": row[6]
    }

def list_all_users() -> List[dict]:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT username, role, created_at, is_totp_enabled FROM users ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [{"username": r[0], "role": r[1], "created_at": r[2], "is_totp_enabled": bool(r[3] == 1)} for r in rows]

def enable_user_totp(username: str, secret: str, backup_codes_json: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE users 
        SET totp_secret = ?, is_totp_enabled = 1, backup_codes = ?
        WHERE username = ?
    """, (secret, backup_codes_json, username))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def disable_user_totp(username: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE users 
        SET totp_secret = NULL, is_totp_enabled = 0, backup_codes = NULL
        WHERE username = ?
    """, (username,))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def update_user_backup_codes(username: str, backup_codes_json: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET backup_codes = ? WHERE username = ?", (backup_codes_json, username))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def create_user_in_db(username: str, password_hash: str, role: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.time()
    cursor.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                   (username, password_hash, role, now))
    conn.commit()
    conn.close()
    return {"username": username, "role": role, "created_at": now}

def update_user_password_in_db(username: str, password_hash: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET password_hash = ? WHERE username = ?", (password_hash, username))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def update_user_role_in_db(username: str, role: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET role = ? WHERE username = ?", (role, username))
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def delete_user_from_db(username: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE username = ?", (username,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def count_admin_users() -> int:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    count = cursor.fetchone()[0]
    conn.close()
    return count

# ----------------- LOGIN AUDIT -----------------

def record_login_audit(
    username: str,
    ip_address: str,
    user_agent: str,
    status: str,
    failure_reason: Optional[str] = None
):
    """Logs an authentication attempt for security monitoring and audit trails."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    audit_id = f"aud_{uuid.uuid4().hex[:10]}"
    cursor.execute("""
    INSERT INTO login_audit (id, timestamp, username, ip_address, user_agent, status, failure_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (audit_id, time.time(), username, ip_address, user_agent, status, failure_reason or ""))
    conn.commit()
    conn.close()

def get_login_audit_logs(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieves recent login events (success & failed attempts)."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, timestamp, username, ip_address, user_agent, status, failure_reason
    FROM login_audit
    ORDER BY timestamp DESC
    LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": r[0],
            "timestamp": r[1],
            "username": r[2],
            "ip_address": r[3],
            "user_agent": r[4],
            "status": r[5],
            "failure_reason": r[6]
        }
        for r in rows
    ]

def clear_login_audit_logs():
    """Purges security login audit logs."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM login_audit;")
    conn.commit()
    conn.close()

# ----------------- BRUTE-FORCE DEFENSE & BLOCKED IPS -----------------

def is_trusted_or_local_ip(ip: str) -> bool:
    """Returns True if the IP is a local loopback, Docker bridge gateway, or internal container network."""
    if not ip or ip in ("127.0.0.1", "::1", "localhost"):
        return True
    try:
        addr = ipaddress.ip_address(ip)
        if addr.is_loopback:
            return True
        # Docker default bridge subnets (172.16.0.0/12, which includes 172.17.x - 172.31.x, e.g. 172.29.0.1)
        # where Docker proxy SNATs all incoming host/LAN connections:
        if addr in ipaddress.ip_network("172.16.0.0/12"):
            return True
    except ValueError:
        pass
    return False

def is_ip_blocked(ip: str) -> bool:
    """Checks whether an IP address is actively blocked from authentication."""
    if is_trusted_or_local_ip(ip):
        return False
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT is_blocked FROM blocked_ips WHERE ip_address = ?", (ip,))
    row = cursor.fetchone()
    conn.close()
    return bool(row and row[0] == 1)

def record_login_failure(ip: str, max_failures: int = 5) -> bool:
    """
    Increments failure count for the IP.
    If failures >= max_failures (default 5), locks the IP and marks is_blocked = 1.
    Returns True if the IP is now blocked.
    Trusted/internal Docker bridge and loopback IPs are never blocked.
    """
    if is_trusted_or_local_ip(ip):
        return False
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT failed_attempts, is_blocked FROM blocked_ips WHERE ip_address = ?", (ip,))
    row = cursor.fetchone()
    now = time.time()
    
    if not row:
        attempts = 1
        is_blocked = 1 if attempts >= max_failures else 0
        blocked_time = now if is_blocked else None
        cursor.execute("""
        INSERT INTO blocked_ips (ip_address, failed_attempts, blocked_at, reason, is_blocked)
        VALUES (?, ?, ?, ?, ?)
        """, (ip, attempts, blocked_time, f"Blocked after {attempts} failed login attempts", is_blocked))
    else:
        attempts = (row[0] or 0) + 1
        is_blocked = 1 if attempts >= max_failures else (row[1] or 0)
        blocked_time = now if is_blocked else None
        cursor.execute("""
        UPDATE blocked_ips 
        SET failed_attempts = ?, blocked_at = COALESCE(blocked_at, ?), is_blocked = ?,
            reason = ?
        WHERE ip_address = ?
        """, (attempts, blocked_time, is_blocked, f"Blocked after {attempts} failed login attempts", ip))
        
    conn.commit()
    conn.close()
    return bool(is_blocked == 1)

def reset_ip_failures(ip: str):
    """Resets failed attempt count on successful login (if not hard-blocked)."""
    if not ip:
        return
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT is_blocked FROM blocked_ips WHERE ip_address = ?", (ip,))
    row = cursor.fetchone()
    if row and row[0] == 0:
        cursor.execute("DELETE FROM blocked_ips WHERE ip_address = ?", (ip,))
        conn.commit()
    conn.close()

def get_blocked_ips() -> List[Dict[str, Any]]:
    """Returns all actively blocked IP addresses."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    SELECT ip_address, failed_attempts, blocked_at, reason, is_blocked
    FROM blocked_ips
    WHERE is_blocked = 1
    ORDER BY blocked_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "ip_address": r[0],
            "failed_attempts": r[1],
            "blocked_at": r[2],
            "reason": r[3],
            "is_blocked": bool(r[4])
        }
        for r in rows
    ]

def unblock_ip(ip: str) -> bool:
    """Unblocks an IP address, clearing its block status and attempt count."""
    if not ip:
        return False
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM blocked_ips WHERE ip_address = ?", (ip,))
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected

def manually_block_ip(ip: str, reason: str = "Manual block via Control Panel") -> bool:
    """Manually blocks an IP address."""
    if not ip:
        return False
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.time()
    cursor.execute("""
    INSERT OR REPLACE INTO blocked_ips (ip_address, failed_attempts, blocked_at, reason, is_blocked)
    VALUES (?, 2, ?, ?, 1)
    """, (ip.strip(), now, reason))
    conn.commit()
    conn.close()
    return True

init_db()
