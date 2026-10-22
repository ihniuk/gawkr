import time
import math
from typing import List, Tuple, Optional
from pathlib import Path
import numpy as np
import cv2
from app.models import DetectionObject, DetectionZone, CameraSettings

def is_point_in_polygon(x: float, y: float, polygon: List[List[float]]) -> bool:
    """Ray casting algorithm to determine if normalized point (x, y) is inside polygon."""
    n = len(polygon)
    if n < 3:
        return True # Zone with <3 points covers all
    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def evaluate_detection_zones(center_x: float, bottom_y: float, zones: List[DetectionZone], center_y: Optional[float] = None) -> Tuple[bool, Optional[str]]:
    """
    Evaluates detection against active zones:
    1. If point is in ANY active 'exclude' zone -> REJECT (False, None).
    2. If active 'include' zones exist -> ACCEPT (True, zone_id) only if inside at least one include zone.
    3. If no active 'include' zones exist -> ACCEPT (True, None) across entire unmasked frame.
    Evaluates both feet (center_x, bottom_y) and body center (center_x, center_y) for robust perimeter triggers.
    """
    if not zones:
        return True, None

    active_zones = [z for z in zones if getattr(z, 'enabled', True)]
    if not active_zones:
        return True, None

    cy = center_y if center_y is not None else bottom_y

    # 1. Reject if inside any exclusion zone
    for z in active_zones:
        if getattr(z, 'zone_type', 'include') == 'exclude':
            if len(z.points) >= 3 and (is_point_in_polygon(center_x, bottom_y, z.points) or is_point_in_polygon(center_x, cy, z.points)):
                return False, None

    # 2. Check inclusion zones
    include_zones = [z for z in active_zones if getattr(z, 'zone_type', 'include') == 'include']
    if not include_zones:
        return True, None

    for z in include_zones:
        if len(z.points) >= 3 and (is_point_in_polygon(center_x, bottom_y, z.points) or is_point_in_polygon(center_x, cy, z.points)):
            return True, z.id

    return False, None

class AIInferenceEngine:
    def __init__(self):
        # MOG2 background subtractor with shadow suppression
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=32, detectShadows=True)

    def detect(self, frame: np.ndarray, settings: CameraSettings, is_simulation: bool = False) -> Tuple[List[DetectionObject], float]:
        """
        Runs object detection on the given sub-stream frame with strict false-alert rejection.
        Returns: (List[DetectionObject], inference_latency_ms)
        """
        t0 = time.time()
        detected_objects: List[DetectionObject] = []
        h, w = frame.shape[:2]
        
        if is_simulation:
            now = time.time()
            # Simulated person movement (e.g. walks across the frame on a 30-second cycle)
            cycle = (now * 0.15) % 30.0
            # Visible only during seconds 4 to 16
            if 4.0 <= cycle <= 16.0:
                progress = (cycle - 4.0) / 12.0
                norm_x = 0.15 + progress * 0.65
                norm_y = 0.45 + 0.03 * math.sin(cycle * 3.0)
                box_w = 0.11
                box_h = 0.34
                
                box = [norm_y, norm_x, norm_y + box_h, norm_x + box_w]
                conf = 0.94
                label = "person"
                
                if label in settings.enabled_classes and conf >= settings.confidence_threshold:
                    center_x = (box[1] + box[3]) / 2.0
                    bottom_y = box[2]
                    
                    is_valid, matched_zone = evaluate_detection_zones(center_x, bottom_y, settings.zones)
                    if is_valid:
                        detected_objects.append(DetectionObject(
                            label=label,
                            confidence=conf,
                            box=box,
                            zone_id=matched_zone
                        ))

            latency_ms = (time.time() - t0) * 1000.0 + 4.5
            return detected_objects, round(latency_ms, 2)

        # Real Camera Feed Analysis:
        proc_w, proc_h = 640, 360
        resized = cv2.resize(frame, (proc_w, proc_h))
        
        # 1. Background subtraction with shadow removal
        fg_mask = self.bg_subtractor.apply(resized)
        # Suppress shadows (value 127 in MOG2)
        _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
        
        # Morphological noise opening (removes leaves, bugs, sensor noise)
        kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_open)
        
        # Morphological closing (joins body parts together)
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        dilated = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel_close)
        
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        min_area = getattr(settings, 'min_area_pixels', 1000)
        
        for c in contours:
            area = cv2.contourArea(c)
            if area < min_area:
                continue # Reject small noise, wind, leaves
                
            x, y, bw, bh = cv2.boundingRect(c)
            aspect_ratio = bw / float(bh)
            
            label = None
            conf = 0.50
            
            # Person detection:
            # Standard upright person silhouette (height >= 7% of frame, aspect ratio 0.18 to 0.90)
            if 0.18 <= aspect_ratio <= 0.90 and bh >= (proc_h * 0.07):
                label = "person"
                conf = min(0.96, 0.78 + (bh / float(proc_h)) * 0.22)
            # Person walking diagonally, carrying bags/jacket, or bending (aspect ratio 0.90 to 1.30)
            elif 0.90 < aspect_ratio <= 1.30 and bh >= (proc_h * 0.12) and area >= min_area:
                label = "person"
                conf = 0.82
            # Vehicle: distinctly horizontal shape
            elif 1.25 <= aspect_ratio <= 3.4 and area > (min_area * 1.8):
                label = "car"
                conf = 0.88
            # Smaller horizontal/square animal shape
            elif 0.70 <= aspect_ratio <= 1.30 and bh < (proc_h * 0.18):
                if "dog" in settings.enabled_classes or "cat" in settings.enabled_classes:
                    label = "dog" if "dog" in settings.enabled_classes else "cat"
                    conf = 0.76

            confidence_req = max(0.75, getattr(settings, 'confidence_threshold', 0.75))
            if label and label in settings.enabled_classes and conf >= confidence_req:
                ymin = y / proc_h
                xmin = x / proc_w
                ymax = (y + bh) / proc_h
                xmax = (x + bw) / proc_w
                
                center_x = (xmin + xmax) / 2.0
                center_y = (ymin + ymax) / 2.0
                bottom_y = ymax
                
                is_valid, matched_zone = evaluate_detection_zones(center_x, bottom_y, settings.zones, center_y=center_y)
                if is_valid:
                    detected_objects.append(DetectionObject(
                        label=label,
                        confidence=round(conf, 2),
                        box=[ymin, xmin, ymax, xmax],
                        zone_id=matched_zone
                    ))

        latency_ms = (time.time() - t0) * 1000.0
        return detected_objects, round(latency_ms, 2)

inference_engine = AIInferenceEngine()
