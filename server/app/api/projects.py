import os
import json
import uuid
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse

from server.app.config import PROJECTS_DIR
from server.app.models import TimelineUpdate, SceneGenerateRequest, ProjectStatus, SceneItem
from server.app.opencode_service import run_opencode_generation
from server.app.render_service import run_render_pipeline
from server.app.websocket_manager import ws_manager

router = APIRouter(prefix="/api/projects", tags=["projects"])

def get_project_dir(project_id: str) -> Path:
    p = PROJECTS_DIR / project_id
    if not p.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@router.post("")
async def create_project(audio: UploadFile = File(...)):
    """Uploads an audio file and initializes the project structure."""
    project_id = str(uuid.uuid4())[:8]
    p_dir = PROJECTS_DIR / project_id
    p_dir.mkdir(parents=True, exist_ok=True)
    (p_dir / "scenes").mkdir(exist_ok=True)
    (p_dir / "renders").mkdir(exist_ok=True)

    # Save audio file
    audio_path = p_dir / "audio.mp3"
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    # Calculate audio duration using ffprobe or mutagen if available
    duration = 0.0
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await proc.communicate()
        duration = float(stdout.decode().strip())
    except Exception:
        duration = 60.0 # fallback default

    # Initialize empty timeline
    timeline_data = {
        "project_id": project_id,
        "audio_duration": duration,
        "scenes": []
    }
    with open(p_dir / "timeline.json", "w", encoding="utf-8") as f:
        json.dump(timeline_data, f, indent=2)

    return {
        "project_id": project_id,
        "audio_url": f"/api/projects/{project_id}/audio",
        "audio_duration": duration,
        "message": "Project created successfully"
    }

@router.get("/{project_id}")
async def get_project(project_id: str):
    p_dir = get_project_dir(project_id)
    timeline_file = p_dir / "timeline.json"
    
    if not timeline_file.exists():
        raise HTTPException(status_code=404, detail="Timeline not found")
        
    with open(timeline_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Check for existing rendered video
    final_video = p_dir / "output_final.mp4"
    data["has_rendered_video"] = final_video.exists()
    return data

@router.get("/{project_id}/audio")
async def get_project_audio(project_id: str):
    p_dir = get_project_dir(project_id)
    audio_file = p_dir / "audio.mp3"
    if not audio_file.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(audio_file, media_type="audio/mpeg")

@router.put("/{project_id}/timeline")
async def update_timeline(project_id: str, update: TimelineUpdate):
    p_dir = get_project_dir(project_id)
    timeline_file = p_dir / "timeline.json"
    
    current_data = {}
    if timeline_file.exists():
        with open(timeline_file, "r", encoding="utf-8") as f:
            current_data = json.load(f)

    # Update scenes
    scenes_list = [scene.model_dump() for scene in update.scenes]
    current_data["scenes"] = scenes_list
    current_data["project_id"] = project_id

    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(current_data, f, indent=2)

    await ws_manager.broadcast_to_project(project_id, {
        "type": "timeline_updated",
        "scenes_count": len(scenes_list)
    })

    return {"status": "ok", "scenes": scenes_list}

@router.post("/{project_id}/scenes/{scene_idx}/generate")
async def generate_scene(
    project_id: str,
    scene_idx: int,
    req: SceneGenerateRequest,
    background_tasks: BackgroundTasks
):
    p_dir = get_project_dir(project_id)
    timeline_file = p_dir / "timeline.json"
    if not timeline_file.exists():
        raise HTTPException(status_code=404, detail="Timeline missing")

    with open(timeline_file, "r", encoding="utf-8") as f:
        timeline = json.load(f)

    # Locate scene
    scene = next((s for s in timeline.get("scenes", []) if s.get("index") == scene_idx), None)
    if not scene:
        raise HTTPException(status_code=404, detail=f"Scene #{scene_idx} not found in timeline")

    # Mark scene status as generating
    scene["status"] = "generating"
    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(timeline, f, indent=2)

    duration = scene.get("duration", 5.0)
    prompt_visual = scene.get("prompt_visual", "")
    prompt_voice = scene.get("prompt_voice", "")

    async def _task():
        success = await run_opencode_generation(
            project_dir=p_dir,
            project_id=project_id,
            scene_idx=scene_idx,
            duration=duration,
            prompt_visual=prompt_visual,
            prompt_voice=prompt_voice,
            refinement=req.refinement_prompt
        )
        # Update scene status
        with open(timeline_file, "r", encoding="utf-8") as f:
            tl = json.load(f)
        sc = next((s for s in tl.get("scenes", []) if s.get("index") == scene_idx), None)
        if sc:
            sc["status"] = "ready" if success else "error"
            sc["html_file"] = f"scenes/scene_{scene_idx:02d}.html"
            with open(timeline_file, "w", encoding="utf-8") as f:
                json.dump(tl, f, indent=2)

    background_tasks.add_task(_task)
    return {"status": "generating", "scene_index": scene_idx}

@router.get("/{project_id}/scenes/{scene_idx}/preview")
async def preview_scene(project_id: str, scene_idx: int):
    p_dir = get_project_dir(project_id)
    scene_file = p_dir / "scenes" / f"scene_{scene_idx:02d}.html"
    if not scene_file.exists():
        raise HTTPException(status_code=404, detail="Scene HTML not generated yet")
    return HTMLResponse(content=scene_file.read_text(encoding="utf-8"))

@router.post("/{project_id}/render")
async def start_render(project_id: str, background_tasks: BackgroundTasks):
    p_dir = get_project_dir(project_id)
    background_tasks.add_task(run_render_pipeline, p_dir, project_id)
    return {"status": "rendering_started", "project_id": project_id}

@router.get("/{project_id}/download")
async def download_final_video(project_id: str):
    p_dir = get_project_dir(project_id)
    video_path = p_dir / "output_final.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Rendered video not available")
    return FileResponse(
        video_path,
        media_type="video/mp4",
        filename=f"math_clipper_{project_id}.mp4"
    )

@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await ws_manager.connect(project_id, websocket)
    try:
        while True:
            # Keep alive and receive any client ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(project_id, websocket)
