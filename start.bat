@echo off
title VisionGlass AI-NVR Server
echo ========================================================
echo       VisionGlass AI-NVR Server (High-Speed Local NVR)
echo ========================================================
echo.
cd /d "%~dp0backend"
echo [1/2] Starting VisionGlass NVR Backend & Web Dashboard on http://localhost:8000 ...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
