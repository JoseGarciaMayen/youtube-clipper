import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger("ws_manager")

class ConnectionManager:
    def __init__(self):
        # Map project_id -> set of active WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = set()
        self.active_connections[project_id].add(websocket)
        logger.info(f"WebSocket client connected to project {project_id}")

    def disconnect(self, project_id: str, websocket: WebSocket):
        if project_id in self.active_connections:
            self.active_connections[project_id].discard(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
        logger.info(f"WebSocket client disconnected from project {project_id}")

    async def broadcast_to_project(self, project_id: str, message: dict):
        if project_id in self.active_connections:
            text_data = json.dumps(message)
            dead_sockets = set()
            for ws in self.active_connections[project_id]:
                try:
                    await ws.send_text(text_data)
                except Exception as e:
                    logger.warning(f"Error sending message to ws: {e}")
                    dead_sockets.add(ws)
            for dead in dead_sockets:
                self.disconnect(project_id, dead)

ws_manager = ConnectionManager()
