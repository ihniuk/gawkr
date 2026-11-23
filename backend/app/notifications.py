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

    async def send_deterrence_alert(self, deterrence_data: Dict[str, Any]):
        await self.broadcast({
            "type": "ACTIVE_DETERRENCE_TRIGGERED",
            "data": deterrence_data
        })

    def broadcast_sync(self, message: Dict[str, Any]):
        """Helper to safely broadcast from background threads."""
        if not self.active_connections:
            return
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(self.broadcast(message), loop)
            else:
                loop.run_until_complete(self.broadcast(message))
        except Exception:
            pass

notification_manager = NotificationManager()
