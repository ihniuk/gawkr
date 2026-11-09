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

# COCO class index to label mappings
COCO_CLASS_MAP = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    15: "cat",
    16: "dog"
}

LABEL_TO_COCO_ID = {
    "person": [0],
    "bicycle": [1],
    "car": [2, 5, 7], # car, bus, truck grouped into car
    "motorcycle": [3],
    "bus": [5],
    "truck": [7],
    "cat": [15],
    "dog": [16]
}

class AIInferenceEngine:
    def __init__(self):
        self.model = None
        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            import torch
            torch.set_num_threads(2)
            # Initialize real YOLOv8n deep neural network
            self.model = YOLO("yolov8n.pt")
            print("AI Inference Engine: YOLOv8n Neural Network loaded successfully (optimized 2 CPU threads).")
        except Exception as e:
            print(f"AI Inference Engine: YOLO initialization notice: {e}")
            self.model = None

    def detect(self, frame: np.ndarray, settings: CameraSettings, is_simulation: bool = False, effective_threshold: Optional[float] = None) -> Tuple[List[DetectionObject], float]:
        """
        Runs neural network object detection on the frame with true spatial perception and zone filtering.
        Returns: (List[DetectionObject], inference_latency_ms)
        """
        t0 = time.time()
        detected_objects: List[DetectionObject] = []
        
        user_conf = effective_threshold if effective_threshold is not None else getattr(settings, 'confidence_threshold', 0.50)
        
        if is_simulation:
            now = time.time()
            # Simulated person movement (walks across the frame on a 30-second cycle)
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
                
                if label in settings.enabled_classes and conf >= user_conf:
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

        if self.model is None:
            self._init_model()

        if self.model is not None:
            # Build target COCO class IDs based on camera enabled classes
            target_ids = []
            for c in settings.enabled_classes:
                if c in LABEL_TO_COCO_ID:
                    target_ids.extend(LABEL_TO_COCO_ID[c])
            target_ids = list(set(target_ids)) if target_ids else [0, 1, 2, 3, 5, 7, 15, 16]

            # Query YOLO with sensitivity down to 0.35 so night walkers are not missed
            yolo_query_conf = min(0.35, user_conf)

            try:
                # Run YOLO inference with optimal 480px neural receptive field
                results = self.model(
                    frame,
                    verbose=False,
                    conf=yolo_query_conf,
                    classes=target_ids,
                    imgsz=480
                )
                
                if results and len(results) > 0:
                    boxes = results[0].boxes
                    for b in boxes:
                        cls_id = int(b.cls[0])
                        conf = float(b.conf[0])
                        
                        raw_label = COCO_CLASS_MAP.get(cls_id, self.model.names.get(cls_id, "unknown"))
                        # Normalize vehicle types
                        if raw_label in ["bus", "truck"] and "car" in settings.enabled_classes and raw_label not in settings.enabled_classes:
                            label = "car"
                        else:
                            label = raw_label

                        # Check if label is enabled
                        if label not in settings.enabled_classes:
                            continue

                        # Extract normalized bounding box [ymin, xmin, ymax, xmax]
                        xmin, ymin, xmax, ymax = b.xyxyn[0].tolist()
                        ymin = max(0.0, min(1.0, float(ymin)))
                        xmin = max(0.0, min(1.0, float(xmin)))
                        ymax = max(0.0, min(1.0, float(ymax)))
                        xmax = max(0.0, min(1.0, float(xmax)))

                        bw = xmax - xmin
                        bh = ymax - ymin

                        # Geometric filter for vehicles (eliminate wheelie bins, lampposts, fence posts):
                        # Passenger vehicles (cars/trucks/vans) are wide or square. A tall, skinny vertical object
                        # (width < 50% of height and width < 0.20) is physically a bin/post, NOT a vehicle!
                        if label in ["car", "truck", "bus"]:
                            if bw < (bh * 0.50) and bw < 0.20:
                                continue # Reject tall narrow clutter like wheelie bins
                            # Require at least 0.60 confidence for vehicles (or user_conf if higher)
                            # to prevent shadows, recycling bins, and porch furniture from triggering car alerts
                            vehicle_min = max(0.60, user_conf)
                            if conf < vehicle_min:
                                continue
                        elif label == "person":
                            # Geometric filter for person: reject tiny slivers/specks (garden stakes, fence posts, leaves)
                            # A real person in surveillance frame has width >= 0.025 and height >= 0.05
                            if bw < 0.025 or bh < 0.05:
                                continue
                            if conf < user_conf:
                                continue
                        else:
                            # Person / animals / bicycle: respect configured threshold
                            if conf < user_conf:
                                continue

                        center_x = (xmin + xmax) / 2.0
                        center_y = (ymin + ymax) / 2.0
                        bottom_y = ymax

                        is_valid, matched_zone = evaluate_detection_zones(
                            center_x, bottom_y, settings.zones, center_y=center_y
                        )

                        if is_valid:
                            detected_objects.append(DetectionObject(
                                label=label,
                                confidence=round(conf, 2),
                                box=[ymin, xmin, ymax, xmax],
                                zone_id=matched_zone
                            ))
            except Exception as e:
                print(f"YOLO inference error: {e}")

        latency_ms = (time.time() - t0) * 1000.0
        return detected_objects, round(latency_ms, 2)

inference_engine = AIInferenceEngine()
