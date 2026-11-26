import re
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from app.models import DetectionEvent, NaturalSearchResponse
from app.storage import search_events_fts, load_cameras_from_db

# Common stopwords to strip from natural queries before FTS tokenization
STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "up", "about", "into", "over", "after", "is", "are", "was", "were",
    "be", "been", "being", "have", "has", "had", "do", "does", "did", "show", "me",
    "find", "search", "get", "look", "any", "all", "there", "some", "what", "which",
    "who", "when", "where", "why", "how", "please", "can", "you", "tell", "clips",
    "clip", "event", "events", "video", "videos", "recording", "recordings", "footage"
}

def parse_natural_query(query: str) -> Dict[str, Any]:
    """
    Parses a natural language query like:
    'suspicious person in front porch yesterday evening'
    'delivery van in driveway this morning'
    'threat after 10pm'
    into structured filters (camera_id, time ranges, threat_level, fts_terms).
    """
    filters: Dict[str, Any] = {
        "camera_id": None,
        "camera_name": None,
        "start_time": None,
        "end_time": None,
        "threat_level": None,
        "fts_query": "",
        "explanation": []
    }
    
    now = datetime.now()
    today_midnight = datetime(now.year, now.month, now.day)
    q = query.lower().strip()
    
    # 1. Threat / Risk levels
    if re.search(r"\b(critical|danger|severe)\b", q):
        filters["threat_level"] = "Critical"
        filters["explanation"].append("Filtered by Threat Level: Critical")
        q = re.sub(r"\b(critical|danger|severe)\b", " ", q)
    elif re.search(r"\b(suspicious|warning|alert|unusual)\b", q):
        filters["threat_level"] = "Suspicious"
        filters["explanation"].append("Filtered by Threat Level: Suspicious")
        q = re.sub(r"\b(suspicious|warning|alert|unusual)\b", " ", q)
    elif re.search(r"\b(safe|normal|routine)\b", q):
        filters["threat_level"] = "Safe"
        filters["explanation"].append("Filtered by Threat Level: Safe")
        q = re.sub(r"\b(safe|normal|routine)\b", " ", q)

    # 2. Camera identification
    cameras = load_cameras_from_db()
    for cam in cameras:
        cam_name_clean = cam.name.lower()
        # Direct word match of camera name or parts
        if cam_name_clean in q:
            filters["camera_id"] = cam.id
            filters["camera_name"] = cam.name
            filters["explanation"].append(f"Camera: {cam.name}")
            q = q.replace(cam_name_clean, " ")
            break
        else:
            # Check individual distinctive tokens of camera name (e.g. "porch", "driveway", "garden")
            name_tokens = [t for t in re.split(r"[\s_-]+", cam_name_clean) if len(t) > 3 and t not in STOP_WORDS]
            for tok in name_tokens:
                if re.search(r"\b" + re.escape(tok) + r"\b", q):
                    filters["camera_id"] = cam.id
                    filters["camera_name"] = cam.name
                    filters["explanation"].append(f"Camera matched '{tok}': {cam.name}")
                    q = re.sub(r"\b" + re.escape(tok) + r"\b", " ", q)
                    break
            if filters["camera_id"]:
                break

    # 3. Temporal filters (Relative & Absolute)
    # Check "yesterday", "today", "past 24h", "this week"
    target_date = today_midnight
    date_specified = False

    if "yesterday" in q:
        target_date = today_midnight - timedelta(days=1)
        filters["start_time"] = target_date.timestamp()
        filters["end_time"] = (target_date + timedelta(days=1)).timestamp()
        filters["explanation"].append("Date: Yesterday")
        q = q.replace("yesterday", " ")
        date_specified = True
    elif "today" in q:
        filters["start_time"] = today_midnight.timestamp()
        filters["end_time"] = now.timestamp()
        filters["explanation"].append("Date: Today")
        q = q.replace("today", " ")
        date_specified = True
    elif "this week" in q:
        monday = today_midnight - timedelta(days=today_midnight.weekday())
        filters["start_time"] = monday.timestamp()
        filters["end_time"] = now.timestamp()
        filters["explanation"].append("Date: This Week")
        q = q.replace("this week", " ")
        date_specified = True
    elif "past hour" in q or "last hour" in q:
        filters["start_time"] = (now - timedelta(hours=1)).timestamp()
        filters["end_time"] = now.timestamp()
        filters["explanation"].append("Time: Past Hour")
        q = re.sub(r"\b(past|last)\s+hour\b", " ", q)
        date_specified = True
    elif "past 24 hours" in q or "last 24 hours" in q or "past 24h" in q:
        filters["start_time"] = (now - timedelta(hours=24)).timestamp()
        filters["end_time"] = now.timestamp()
        filters["explanation"].append("Time: Last 24 Hours")
        q = re.sub(r"\b(past|last)\s+24\s*(hours|h)\b", " ", q)
        date_specified = True

    # Time of day parts (morning, afternoon, evening, night)
    if "morning" in q:
        start_dt = target_date.replace(hour=5, minute=0, second=0)
        end_dt = target_date.replace(hour=12, minute=0, second=0)
        filters["start_time"] = start_dt.timestamp()
        filters["end_time"] = min(end_dt.timestamp(), now.timestamp()) if not date_specified or target_date == today_midnight else end_dt.timestamp()
        filters["explanation"].append("Time: Morning (05:00 - 12:00)")
        q = q.replace("morning", " ")
    elif "afternoon" in q:
        start_dt = target_date.replace(hour=12, minute=0, second=0)
        end_dt = target_date.replace(hour=17, minute=0, second=0)
        filters["start_time"] = start_dt.timestamp()
        filters["end_time"] = min(end_dt.timestamp(), now.timestamp()) if not date_specified or target_date == today_midnight else end_dt.timestamp()
        filters["explanation"].append("Time: Afternoon (12:00 - 17:00)")
        q = q.replace("afternoon", " ")
    elif "evening" in q:
        start_dt = target_date.replace(hour=17, minute=0, second=0)
        end_dt = target_date.replace(hour=21, minute=0, second=0)
        filters["start_time"] = start_dt.timestamp()
        filters["end_time"] = min(end_dt.timestamp(), now.timestamp()) if not date_specified or target_date == today_midnight else end_dt.timestamp()
        filters["explanation"].append("Time: Evening (17:00 - 21:00)")
        q = q.replace("evening", " ")
    elif "night" in q or "midnight" in q or "dark" in q:
        start_dt = target_date.replace(hour=21, minute=0, second=0)
        end_dt = (target_date + timedelta(days=1)).replace(hour=5, minute=0, second=0)
        filters["start_time"] = start_dt.timestamp()
        filters["end_time"] = end_dt.timestamp()
        filters["explanation"].append("Time: Night (21:00 - 05:00)")
        q = re.sub(r"\b(night|midnight|dark)\b", " ", q)

    # 4. Clean remaining tokens for SQLite FTS5 search
    tokens = re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", q)
    valid_tokens = [t for t in tokens if t not in STOP_WORDS]
    
    # Common synonyms expansion
    expanded_tokens = []
    for t in valid_tokens:
        if t in {"delivery", "courier", "postman", "mail", "amazon", "ups", "dhl", "fedex"}:
            expanded_tokens.append("(delivery* OR courier* OR package* OR postman* OR amazon* OR parcel*)")
        elif t in {"car", "vehicle", "automobile", "van", "truck", "suv"}:
            expanded_tokens.append("(car* OR vehicle* OR van* OR truck* OR automobile*)")
        elif t in {"person", "human", "guy", "woman", "man", "pedestrian", "stranger", "visitor"}:
            expanded_tokens.append("(person* OR human* OR pedestrian* OR visitor*)")
        elif t in {"loitering", "waiting", "standing", "lingering", "prowling"}:
            expanded_tokens.append("(loitering* OR standing* OR waiting* OR lingering*)")
        else:
            expanded_tokens.append(f"{t}*")

    filters["fts_query"] = " AND ".join(expanded_tokens) if expanded_tokens else ""
    return filters

def execute_natural_search(query: str, limit: int = 50) -> NaturalSearchResponse:
    """Executes the parsed natural search across events using SQLite FTS5."""
    parsed = parse_natural_query(query)
    
    events = search_events_fts(
        fts_query=parsed["fts_query"],
        camera_id=parsed["camera_id"],
        start_time=parsed["start_time"],
        end_time=parsed["end_time"],
        threat_level=parsed["threat_level"],
        limit=limit
    )
    
    return NaturalSearchResponse(
        query=query,
        parsed_filters=parsed,
        total_matches=len(events),
        events=events
    )
