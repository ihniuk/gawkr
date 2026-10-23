# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend with Hardware Acceleration Support
FROM python:3.11-slim

# Install system dependencies for OpenCV, FFmpeg, and PyTorch runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CPU first (compact ~180MB wheel vs 2.5GB CUDA)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install Python requirements
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache YOLOv8n weights inside container image so it starts instantly without internet dependency
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Copy backend application
COPY backend/app ./app

# Copy compiled frontend from Stage 1 into /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Setup persistent data directories
RUN mkdir -p /app/data /app/data/snapshots /app/data/recordings

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
