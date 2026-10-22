# Gawkr AI-NVR Server

> *"Having a gawk so you don't have to."*

A high-speed, hardware-accelerated local Network Video Recorder (NVR) with real-time AI object identification, spatial motion tracking (no endless alerts for stationary project cars!), multimodal Gemini Vision event descriptions, Telegram notifications, and a sleek glassmorphic dashboard.

---

## 🚀 Key Highlights

1. **Intelligent Spatial Motion & Anti-Repetition**:
   - **Stationary vs Moving Tracking**: Knows the difference between an actively driving car and a parked project car in the driveway. Parked cars are marked `[PARKED]` and never spam alerts unless they move ($\ge 12\%$ displacement).
   - **Multimodal AI Descriptions (Google Gemini / OpenAI / Ollama)**: Delivers 1-2 sentence human-like summaries of actual events without repeating static background items.

2. **Point-and-Click Network Discovery**:
   - Automated triple-protocol scan (ONVIF WS-Discovery UDP 3702, SSDP multicast, and LAN RTSP port sweep).
   - Enter credentials $\rightarrow$ Click **"Verify & Probe Profiles"** $\rightarrow$ Auto-populates Main & Sub stream RTSP URLs.
   - 1-Click **"Add to Matrix"** with zero manual URL guesswork.

3. **Hardware Acceleration & Codec Flexibility**:
   - Support for NVIDIA NVDEC/NVENC, Intel QuickSync (QSV), and multi-threaded CPU (`libx264`) decoding/encoding.
   - Zero-delay instant playback: MP4 clips recorded with pre-roll buffer and faststart for immediate browser playback.

4. **Glassmorphism UI & Interactive Management**:
   - Frosted acrylic panels (`backdrop-filter: blur(28px)`), obsidian dark theme, and live telemetry (FPS, Bitrate, Resolution, Decoder, AI latency).
   - Context menus, interactive zone/tripwire polygon editor, live detection overlays, and isolated notification feed drawer.

5. **Instant Outbound Alerts**:
   - Real-time Telegram alerts with photo snapshot captions, threat assessments, and instant plain-text fallbacks.
   - Support for Discord webhooks, Slack, Pushover, and Home Assistant MQTT auto-discovery.

---

## 🌐 Quick Access

* **URL**: [http://localhost:8000](http://localhost:8000)
* **Default Admin Login**: `admin` / `admin123`
* **Default Viewer Login**: `viewer` / `viewer123`

---

## 🛠️ Project Structure

```
gawkr/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI entrypoint, WebSockets & static server
│   │   ├── auth.py                     # RBAC JWT authentication & stream tickets
│   │   ├── ai_vision.py                # Multimodal LLM vision & anti-repetition rules
│   │   ├── discovery.py                # ONVIF WS-Discovery, SSDP & LAN RTSP probe
│   │   ├── inference.py                # Object detection & zone polygon filtering
│   │   ├── stream_worker.py            # Dual-stream worker, NVDEC & spatial tracking
│   │   ├── camera_manager.py           # In-memory & SQLite camera management
│   │   ├── storage.py                  # SQLite WAL database & snapshot repository
│   │   ├── notification_dispatchers.py # Telegram, Discord, Slack, Pushover webhooks
│   │   └── mqtt_client.py              # Home Assistant MQTT auto-discovery
│   └── requirements.txt
├── frontend/                           # React 18 + Vite Glassmorphic Dashboard
│   ├── src/
│   │   ├── components/                 # CameraGrid, CameraTile, EventDrawer, etc.
│   │   └── api/                        # REST & WebSocket API clients
│   └── package.json
└── docker-compose.yml
```
