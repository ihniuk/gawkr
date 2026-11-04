import time
import sqlite3
import logging
from typing import List, Dict, Any, Optional
from collections import deque
from pathlib import Path
from app.config import DATA_DIR

DB_PATH = DATA_DIR / "vision_nvr.db"

# In-memory fast ring buffer for sub-millisecond API response
_LOG_BUFFER: deque = deque(maxlen=2000)

def init_log_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp REAL NOT NULL,
        level TEXT NOT NULL,
        component TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);")
    conn.commit()
    conn.close()

def log_event(level: str, component: str, message: str, details: Optional[str] = None):
    """Logs an event to in-memory buffer and SQLite."""
    now = time.time()
    level_normalized = level.upper()
    entry = {
        "timestamp": now,
        "level": level_normalized,
        "component": component,
        "message": str(message),
        "details": details or ""
    }
    _LOG_BUFFER.append(entry)

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO system_logs (timestamp, level, component, message, details)
        VALUES (?, ?, ?, ?, ?)
        """, (now, level_normalized, component, str(message), details or ""))
        conn.commit()
        conn.close()
    except Exception as e:
        # Avoid recursive logging failure
        print(f"Failed to persist system log to SQLite: {e}")

class BufferLogHandler(logging.Handler):
    """Captures Python logging output from Uvicorn, FastAPI, and NVR background workers."""
    def emit(self, record):
        try:
            msg = self.format(record)
            level = record.levelname
            component = record.name
            log_event(level, component, msg)
        except Exception:
            pass

def setup_app_logging():
    """Initializes the database and connects Python logging handlers."""
    init_log_db()
    handler = BufferLogHandler()
    formatter = logging.Formatter('%(message)s')
    handler.setFormatter(formatter)
    
    # Attach to root and uvicorn
    root_logger = logging.getLogger()
    if handler not in root_logger.handlers:
        root_logger.addHandler(handler)

    for name in ["uvicorn", "uvicorn.error", "uvicorn.access", "fastapi", "gawkr"]:
        l = logging.getLogger(name)
        l.setLevel(logging.INFO)
        if handler not in l.handlers:
            l.addHandler(handler)

def get_system_logs(
    level: Optional[str] = None,
    component: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 200
) -> List[Dict[str, Any]]:
    """Retrieves system logs from SQLite with optional filtering."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    query = "SELECT id, timestamp, level, component, message, details FROM system_logs WHERE 1=1"
    params = []

    if level and level.upper() != "ALL":
        query += " AND level = ?"
        params.append(level.upper())

    if component and component != "ALL":
        query += " AND component LIKE ?"
        params.append(f"%{component}%")

    if search:
        query += " AND (message LIKE ? OR details LIKE ? OR component LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])

    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    logs = []
    for r in rows:
        logs.append({
            "id": r[0],
            "timestamp": r[1],
            "level": r[2],
            "component": r[3],
            "message": r[4],
            "details": r[5] or ""
        })
    return logs

def clear_system_logs():
    """Purges system logs from SQLite and memory."""
    _LOG_BUFFER.clear()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM system_logs;")
    conn.commit()
    conn.close()

# Direct convenience logging functions
class GawkrLogger:
    @staticmethod
    def info(msg: str, component: str = "system", details: Optional[str] = None):
        log_event("INFO", component, msg, details)
        print(f"[{component.upper()}] INFO: {msg}")

    @staticmethod
    def warning(msg: str, component: str = "system", details: Optional[str] = None):
        log_event("WARNING", component, msg, details)
        print(f"[{component.upper()}] WARNING: {msg}")

    @staticmethod
    def error(msg: str, component: str = "system", details: Optional[str] = None):
        log_event("ERROR", component, msg, details)
        print(f"[{component.upper()}] ERROR: {msg}")

    @staticmethod
    def debug(msg: str, component: str = "system", details: Optional[str] = None):
        log_event("DEBUG", component, msg, details)

logger = GawkrLogger()
