# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend with Hardware Acceleration Support
FROM python:3.11-slim

# Install system dependencies for OpenCV, FFmpeg, and HW acceleration
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt paho-mqtt

# Copy backend application
COPY backend/app ./app

# Copy compiled frontend from Stage 1 into backend static path
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Setup persistent data directories
RUN mkdir -p /app/data /app/data/snapshots /app/data/recordings

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
