import subprocess
import os
import platform
import shutil
import time
from typing import Dict, Any, List

_cached_hardware_info: Dict[str, Any] = {}
_cache_timestamp: float = 0.0

def detect_hardware_capabilities() -> Dict[str, Any]:
    """
    Detects host CPU cores, NVIDIA GPU presence, driver versions, and available FFmpeg hardware encoders/decoders.
    Caches results for 60 seconds to avoid repeated process calls.
    """
    global _cached_hardware_info, _cache_timestamp
    now = time.time()
    if _cached_hardware_info and (now - _cache_timestamp < 60.0):
        return _cached_hardware_info

    cpu_cores = os.cpu_count() or 4
    cpu_processor = platform.processor() or platform.machine() or "Standard Processor"
    
    # Check NVIDIA GPU via nvidia-smi
    nvidia_info = {
        "available": False,
        "name": "",
        "memory_mb": 0,
        "driver_version": ""
    }
    try:
        res = subprocess.run(
            ['nvidia-smi', '--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'],
            capture_output=True,
            text=True,
            timeout=3
        )
        if res.returncode == 0 and res.stdout.strip():
            first_line = res.stdout.strip().splitlines()[0]
            parts = [p.strip() for p in first_line.split(',')]
            nvidia_info["available"] = True
            nvidia_info["name"] = parts[0]
            if len(parts) > 1:
                try:
                    nvidia_info["memory_mb"] = int(float(parts[1]))
                except Exception:
                    pass
            if len(parts) > 2:
                nvidia_info["driver_version"] = parts[2]
    except Exception:
        nvidia_info["available"] = False

    # Check FFmpeg encoders and decoders
    ffmpeg_path = shutil.which("ffmpeg")
    available_encoders: List[str] = []
    available_decoders: List[str] = []
    
    if ffmpeg_path:
        try:
            enc_res = subprocess.run(['ffmpeg', '-encoders'], capture_output=True, text=True, timeout=4)
            for line in enc_res.stdout.splitlines():
                if ' V..... ' in line or ' V....D ' in line:
                    tokens = line.split()
                    if len(tokens) >= 2:
                        available_encoders.append(tokens[1])
        except Exception:
            pass

        try:
            dec_res = subprocess.run(['ffmpeg', '-decoders'], capture_output=True, text=True, timeout=4)
            for line in dec_res.stdout.splitlines():
                if ' V' in line:
                    tokens = line.split()
                    if len(tokens) >= 2:
                        available_decoders.append(tokens[1])
        except Exception:
            pass

    has_nvenc = "h264_nvenc" in available_encoders and nvidia_info["available"]
    has_nvdec = "h264_cuvid" in available_decoders and nvidia_info["available"]
    has_qsv = "h264_qsv" in available_encoders
    has_x264 = "libx264" in available_encoders

    # Codec profiles for UI selection
    supported_engines = [
        {
            "id": "auto",
            "name": "Auto-Detect (Recommended)",
            "description": "Automatically selects GPU acceleration if available, seamlessly falling back to CPU",
            "compatible": True,
            "is_hardware": nvidia_info["available"] or has_qsv
        },
        {
            "id": "cpu",
            "name": "CPU Only (Software libx264)",
            "description": "Optimized software encoding using host CPU cores. Universal compatibility without requiring a dedicated GPU",
            "compatible": has_x264 or True,
            "is_hardware": False
        },
        {
            "id": "nvdec",
            "name": "NVIDIA GPU (NVENC / NVDEC)",
            "description": f"Hardware acceleration via NVIDIA CUDA cores ({nvidia_info['name'] if nvidia_info['available'] else 'No NVIDIA GPU detected'})",
            "compatible": has_nvenc,
            "is_hardware": True
        },
        {
            "id": "qsv",
            "name": "Intel QuickSync (QSV)",
            "description": "Hardware video acceleration via Intel integrated or Arc graphics",
            "compatible": has_qsv,
            "is_hardware": True
        }
    ]

    recommended = "nvdec" if has_nvenc else "cpu"

    info = {
        "cpu": {
            "model": cpu_processor,
            "cores": cpu_cores
        },
        "nvidia": nvidia_info,
        "ffmpeg": {
            "found": bool(ffmpeg_path),
            "path": ffmpeg_path or "",
            "has_nvenc": has_nvenc,
            "has_nvdec": has_nvdec,
            "has_qsv": has_qsv,
            "has_x264": has_x264
        },
        "supported_engines": supported_engines,
        "recommended_engine": recommended
    }

    _cached_hardware_info = info
    _cache_timestamp = now
    return info

def get_ffmpeg_encode_args(backend: str = "auto", preset: str = "ultrafast", crf: int = 26) -> List[str]:
    """
    Constructs optimal FFmpeg video encoding arguments based on the selected hardware engine.
    Includes quality and preset parameters mapped to each codec's specification.
    """
    hw = detect_hardware_capabilities()
    active_backend = backend.lower() if backend else "auto"

    if active_backend == "auto":
        if hw["nvidia"]["available"] and hw["ffmpeg"]["has_nvenc"]:
            active_backend = "nvdec"
        else:
            active_backend = "cpu"

    if active_backend in ("nvdec", "nvenc", "nvidia") and hw["ffmpeg"]["has_nvenc"]:
        # NVIDIA NVENC uses p1 (fastest) to p7 (slowest/highest quality)
        nv_preset = "p1" if preset in ("ultrafast", "veryfast") else "p4"
        return [
            '-c:v', 'h264_nvenc',
            '-preset', nv_preset,
            '-cq', str(crf),
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'main',
            '-g', '40',
            '-bf', '0',
            '-movflags', '+faststart'
        ]

    elif active_backend in ("qsv", "intel") and hw["ffmpeg"]["has_qsv"]:
        # Intel QuickSync
        return [
            '-c:v', 'h264_qsv',
            '-preset', 'veryfast',
            '-global_quality', str(crf),
            '-pix_fmt', 'nv12',
            '-g', '40',
            '-movflags', '+faststart'
        ]

    else:
        # Standard Universal CPU x264
        cpu_preset = preset if preset in ("ultrafast", "veryfast", "fast", "medium") else "ultrafast"
        return [
            '-c:v', 'libx264',
            '-preset', cpu_preset,
            '-crf', str(crf),
            '-pix_fmt', 'yuv420p',
            '-g', '40',
            '-movflags', '+faststart'
        ]
