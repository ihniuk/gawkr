import hashlib
import json
import time
from typing import List, Dict, Optional
from app.models import DetectionEvent, IncidentItem
from app.storage import (
    load_recent_incidents_from_db,
    save_incident_to_db,
    load_recent_events_from_db,
    get_incident_by_id
)

THREAT_PRIORITY = {
    "critical": 4,
    "danger": 4,
    "suspicious": 3,
    "warning": 2,
    "safe": 1
}

def _calculate_threat(threats: List[str]) -> str:
    highest = "Safe"
    max_p = 1
    for t in threats:
        clean = (t or "Safe").strip().lower()
        p = THREAT_PRIORITY.get(clean, 1)
        if p > max_p:
            max_p = p
            highest = t.capitalize()
    return highest

def _generate_incident_title(camera_seq: List[str], event_objects: List[str], threat_level: str) -> str:
    primary_obj = "Subject"
    if any(o.lower() in {"car", "truck", "van", "vehicle"} for o in event_objects):
        if any(o.lower() in {"person", "human"} for o in event_objects):
            primary_obj = "Vehicle & Visitor"
        else:
            primary_obj = "Vehicle"
    elif any(o.lower() in {"cat", "dog", "animal"} for o in event_objects):
        primary_obj = "Animal"
    elif any(o.lower() in {"package", "box"} for o in event_objects):
        primary_obj = "Package / Delivery"

    unique_cams = []
    for c in camera_seq:
        if not unique_cams or unique_cams[-1] != c:
            unique_cams.append(c)

    if len(unique_cams) > 1:
        path = " → ".join(unique_cams)
        return f"{primary_obj} Journey: {path}"
    elif len(unique_cams) == 1:
        if threat_level.lower() in {"critical", "suspicious", "warning"}:
            return f"{threat_level} Alert on {unique_cams[0]}"
        return f"{primary_obj} Activity on {unique_cams[0]}"
    return "Multi-Camera Activity Session"

def _generate_incident_summary(events: List[DetectionEvent]) -> str:
    descriptions = []
    for e in events:
        if e.ai_description:
            descriptions.append(f"[{e.camera_name}]: {e.ai_description}")
        else:
            obj_names = ", ".join({o.label for o in e.objects}) if e.objects else "motion"
            descriptions.append(f"[{e.camera_name}]: Detected {obj_names}")
    
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for d in descriptions:
        if d not in seen:
            seen.add(d)
            deduped.append(d)
    return " | ".join(deduped[:5])

def correlate_events_into_incidents(
    events: List[DetectionEvent],
    max_gap_seconds: float = 180.0
) -> List[IncidentItem]:
    """
    Groups chronological detection events into multi-camera journeys or sustained activity incidents.
    A new incident begins when scene has been calm for > max_gap_seconds (default 3 mins).
    """
    if not events:
        return []

    # Sort chronologically ascending for clustering
    sorted_events = sorted(events, key=lambda e: e.timestamp)
    clusters: List[List[DetectionEvent]] = []
    current_cluster: List[DetectionEvent] = []

    for ev in sorted_events:
        if not current_cluster:
            current_cluster.append(ev)
            continue

        prev_ev = current_cluster[-1]
        time_diff = ev.timestamp - prev_ev.timestamp

        # Correlate if within sliding time window
        if time_diff <= max_gap_seconds:
            current_cluster.append(ev)
        else:
            clusters.append(current_cluster)
            current_cluster = [ev]

    if current_cluster:
        clusters.append(current_cluster)

    incidents: List[IncidentItem] = []
    for cluster in clusters:
        # We focus on clusters with either multiple events or cross-camera activity or threats
        start_t = cluster[0].timestamp
        end_t = cluster[-1].timestamp
        
        # Build camera sequence in chronological progression
        cam_sequence: List[str] = []
        for e in cluster:
            cam_sequence.append(e.camera_name)

        event_ids = [e.id for e in cluster]
        threat_level = _calculate_threat([e.threat_level for e in cluster])

        # Collect preview snapshots (up to 1 distinct per camera or up to 4 total)
        preview_snaps = []
        cams_with_snap = set()
        for e in cluster:
            if e.snapshot_url and (e.camera_id not in cams_with_snap or len(preview_snaps) < 4):
                preview_snaps.append(e.snapshot_url)
                cams_with_snap.add(e.camera_id)

        all_objects = []
        for e in cluster:
            for obj in e.objects:
                all_objects.append(obj.label)

        title = _generate_incident_title(cam_sequence, all_objects, threat_level)
        summary = _generate_incident_summary(cluster)
        
        # Deterministic stable incident ID based on start time and first event
        inc_id = f"inc_{int(start_t)}_{cluster[0].id}"

        incident = IncidentItem(
            id=inc_id,
            start_time=start_t,
            end_time=end_t,
            title=title,
            summary=summary,
            camera_sequence=cam_sequence,
            event_ids=event_ids,
            threat_level=threat_level,
            preview_snapshots=preview_snaps,
            created_at=end_t
        )
        incidents.append(incident)

    # Return incidents in reverse chronological order (newest first)
    return sorted(incidents, key=lambda i: i.start_time, reverse=True)

def backfill_all_incidents() -> int:
    """Reads all historical events and saves clustered incidents to the database."""
    events = load_recent_events_from_db(limit=2000)
    if not events:
        return 0
    incidents = correlate_events_into_incidents(events)
    for inc in incidents:
        save_incident_to_db(inc)
    return len(incidents)

def ingest_event_into_incidents(event: DetectionEvent, max_gap_seconds: float = 180.0):
    """
    Real-time incident ingestion: updates active incident or starts a new one when a new event fires.
    """
    recent = load_recent_incidents_from_db(limit=1)
    if recent and (event.timestamp - recent[0].end_time <= max_gap_seconds):
        # Extend current active incident
        active = recent[0]
        if event.id not in active.event_ids:
            active.event_ids.append(event.id)
            active.camera_sequence.append(event.camera_name)
            active.end_time = event.timestamp
            
            # Recalculate threat
            active.threat_level = _calculate_threat([active.threat_level, event.threat_level])
            
            # Update snapshots if needed
            if event.snapshot_url and len(active.preview_snapshots) < 4:
                active.preview_snapshots.append(event.snapshot_url)
                
            # Recompute title and summary
            obj_labels = [o.label for o in event.objects]
            active.title = _generate_incident_title(active.camera_sequence, obj_labels, active.threat_level)
            if event.ai_description:
                active.summary += f" | [{event.camera_name}]: {event.ai_description}"
            save_incident_to_db(active)
            return active
    else:
        # Create brand new incident
        obj_labels = [o.label for o in event.objects]
        new_inc = IncidentItem(
            id=f"inc_{int(event.timestamp)}_{event.id}",
            start_time=event.timestamp,
            end_time=event.timestamp,
            title=_generate_incident_title([event.camera_name], obj_labels, event.threat_level),
            summary=f"[{event.camera_name}]: {event.ai_description}" if event.ai_description else f"[{event.camera_name}]: Motion detected",
            camera_sequence=[event.camera_name],
            event_ids=[event.id],
            threat_level=event.threat_level or "Safe",
            preview_snapshots=[event.snapshot_url] if event.snapshot_url else [],
            created_at=event.timestamp
        )
        save_incident_to_db(new_inc)
        return new_inc
