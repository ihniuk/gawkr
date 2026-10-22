import asyncio
import json
from typing import Set, Dict, Any
from fastapi import WebSocket

class NotificationManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcasts event JSON to all connected browser sessions."""
        if not self.active_connections:
            return
        data = json.dumps(message)
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                dead_connections.append(connection)
                
        for dead in dead_connections:
            self.disconnect(dead)

    async def send_detection_alert(self, event: Dict[str, Any]):
        await self.broadcast({
            "type": "DETECTION_ALERT",
            "event": event
        })

    async def send_telemetry_update(self, telemetry: Dict[str, Any]):
        await self.broadcast({
            "type": "TELEMETRY_UPDATE",
            "telemetry": telemetry
        })

notification_manager = NotificationManager()
