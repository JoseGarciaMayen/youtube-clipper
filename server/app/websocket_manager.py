import asyncio
import json
import logging
from typing import Dict, Set, List
from fastapi import WebSocket

logger = logging.getLogger("ws_manager")

class ConnectionManager:
    def __init__(self):
        # Map project_id -> set of active WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Map project_id -> in-memory ring buffer of recent logs/events (persists across reloads)
        self.project_log_history: Dict[str, List[dict]] = {}
        # Map project_id -> current render progress state
        self.render_state: Dict[str, dict] = {}

    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = set()
        self.active_connections[project_id].add(websocket)
        logger.info(f"WebSocket client connected to project {project_id}")

        # Send back rehydration packet: current render state & log history upon reconnect!
        if project_id in self.render_state:
            try:
                await websocket.send_text(json.dumps(self.render_state[project_id]))
            except:
                pass

        if project_id in self.project_log_history:
            for item in self.project_log_history[project_id][-100:]:
                try:
                    await websocket.send_text(json.dumps(item))
                except:
                    pass

    def disconnect(self, project_id: str, websocket: WebSocket):
        if project_id in self.active_connections:
            self.active_connections[project_id].discard(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
        logger.info(f"WebSocket client disconnected from project {project_id}")

    async def broadcast_to_project(self, project_id: str, message: dict):
        # Save in persistent history buffer
        if project_id not in self.project_log_history:
            self.project_log_history[project_id] = []
        self.project_log_history[project_id].append(message)
        if len(self.project_log_history[project_id]) > 250:
            self.project_log_history[project_id] = self.project_log_history[project_id][-200:]

        # Track render progress state
        if message.get("type") in ("render_progress", "render_start", "render_complete", "render_error"):
            self.render_state[project_id] = message

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
