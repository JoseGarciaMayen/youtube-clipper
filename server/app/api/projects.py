import os
import json
import uuid
import shutil
import asyncio
from typing import Optional
from pydantic import BaseModel
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse

from server.app.config import PROJECTS_DIR
from server.app.models import TimelineUpdate, SceneGenerateRequest, ProjectStatus, SceneItem
from server.app.opencode_service import run_opencode_generation
from server.app.render_service import run_render_pipeline
from server.app.websocket_manager import ws_manager
from server.app.transcription_service import transcribe_clip_async

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectUpdate(BaseModel):
    name: Optional[str] = None

def get_project_dir(project_id: str) -> Path:
    p = PROJECTS_DIR / project_id
    if not p.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return p

@router.get("")
async def list_projects():
    """Returns a list of all existing projects with summary metadata."""
    results = []
    if not PROJECTS_DIR.exists():
        return results

    for p in PROJECTS_DIR.iterdir():
        if p.is_dir() and (p / "timeline.json").exists():
            try:
                with open(p / "timeline.json", "r", encoding="utf-8") as f:
                    data = json.load(f)
                scenes = data.get("scenes", [])
                ready_scenes = sum(1 for s in scenes if s.get("status") == "ready")
                results.append({
                    "project_id": data.get("project_id", p.name),
                    "name": data.get("name", p.name),
                    "audio_duration": data.get("audio_duration", 0.0),
                    "scenes_count": len(scenes),
                    "ready_scenes": ready_scenes,
                    "updated_at": p.stat().st_mtime
                })
            except Exception:
                pass
    results.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return results

@router.post("")
async def create_project(
    audio: UploadFile = File(...),
    name: Optional[str] = Form(None)
):
    """Uploads an audio file and initializes the project structure with a name."""
    project_id = str(uuid.uuid4())[:8]
    project_name = (name or f"Project-{project_id}").strip()
    p_dir = PROJECTS_DIR / project_id
    p_dir.mkdir(parents=True, exist_ok=True)
    (p_dir / "scenes").mkdir(exist_ok=True)
    (p_dir / "renders").mkdir(exist_ok=True)

    # Save audio file
    audio_path = p_dir / "audio.mp3"
    with open(audio_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    # Calculate audio duration using ffprobe
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
        duration = 60.0

    # Initialize empty timeline with project name
    timeline_data = {
        "project_id": project_id,
        "name": project_name,
        "audio_duration": duration,
        "scenes": []
    }
    with open(p_dir / "timeline.json", "w", encoding="utf-8") as f:
        json.dump(timeline_data, f, indent=2)

    return {
        "project_id": project_id,
        "name": project_name,
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

@router.patch("/{project_id}")
async def update_project(project_id: str, req: ProjectUpdate):
    """Updates project metadata, such as renaming the project."""
    p_dir = get_project_dir(project_id)
    timeline_file = p_dir / "timeline.json"
    if not timeline_file.exists():
        raise HTTPException(status_code=404, detail="Timeline not found")

    with open(timeline_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    if req.name is not None and req.name.strip():
        data["name"] = req.name.strip()

    with open(timeline_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return {"status": "ok", "project_id": project_id, "name": data.get("name")}

@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Deletes an entire project directory and all its files."""
    p_dir = get_project_dir(project_id)
    shutil.rmtree(p_dir, ignore_errors=True)
    return {"status": "ok", "message": f"Project {project_id} deleted"}

@router.get("/{project_id}/audio")
async def get_project_audio(project_id: str):
    p_dir = get_project_dir(project_id)
    audio_file = p_dir / "audio.mp3"
    if not audio_file.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(audio_file, media_type="audio/mpeg")

@router.put("/{project_id}/timeline")
async def update_timeline(
    project_id: str,
    update: TimelineUpdate,
    background_tasks: BackgroundTasks
):
    p_dir = get_project_dir(project_id)
    timeline_file = p_dir / "timeline.json"
    audio_file = p_dir / "audio.mp3"
    
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

    # Auto-transcribe any scene that has empty prompt_voice in background
    scenes_to_transcribe = [
        s for s in scenes_list if not s.get("prompt_voice") and s.get("duration", 0) > 0.3
    ]

    if scenes_to_transcribe and audio_file.exists():
        async def _auto_transcribe():
            updated_any = False
            for sc in scenes_to_transcribe:
                idx = sc.get("index")
                st = sc.get("start", 0.0)
                dur = sc.get("duration", 5.0)

                text = await transcribe_clip_async(audio_file, st, dur)
                if text:
                    # Reload timeline and update scene
                    if timeline_file.exists():
                        with open(timeline_file, "r", encoding="utf-8") as f:
                            tl = json.load(f)
                        target = next((item for item in tl.get("scenes", []) if item.get("index") == idx), None)
                        if target and not target.get("prompt_voice"):
                            target["prompt_voice"] = text
                            with open(timeline_file, "w", encoding="utf-8") as f:
                                json.dump(tl, f, indent=2)
                            updated_any = True
                            await ws_manager.broadcast_to_project(project_id, {
                                "type": "scene_transcribed",
                                "scene_index": idx,
                                "text": text
                            })
            if updated_any:
                await ws_manager.broadcast_to_project(project_id, {
                    "type": "timeline_transcription_completed"
                })

        background_tasks.add_task(_auto_transcribe)

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

@router.post("/{project_id}/scenes/{scene_idx}/upload")
async def upload_custom_scene(
    project_id: str,
    scene_idx: int,
    file: UploadFile = File(...)
):
    """Allows importing a custom HTML animation file directly for a specific scene/split."""
    p_dir = get_project_dir(project_id)
    scenes_dir = p_dir / "scenes"
    scenes_dir.mkdir(exist_ok=True)
    target_file = scenes_dir / f"scene_{scene_idx:02d}.html"

    with open(target_file, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Update status in timeline.json
    timeline_file = p_dir / "timeline.json"
    if timeline_file.exists():
        with open(timeline_file, "r", encoding="utf-8") as f:
            tl = json.load(f)
        target = next((s for s in tl.get("scenes", []) if s.get("index") == scene_idx), None)
        if target:
            target["status"] = "ready"
            target["html_file"] = f"scenes/scene_{scene_idx:02d}.html"
            with open(timeline_file, "w", encoding="utf-8") as f:
                json.dump(tl, f, indent=2)

    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_complete",
        "scene_index": scene_idx,
        "success": True,
        "imported": True
    })

    return {"status": "ok", "scene_index": scene_idx, "file": str(target_file)}

@router.post("/{project_id}/open-folder")
async def open_project_folder(project_id: str):
    """Opens the project folder in the local desktop file explorer (Linux/xdg-open)."""
    p_dir = get_project_dir(project_id)
    scenes_dir = p_dir / "scenes"
    scenes_dir.mkdir(exist_ok=True)
    try:
        import subprocess
        subprocess.Popen(["xdg-open", str(scenes_dir)])
        return {"status": "ok", "path": str(scenes_dir)}
    except Exception as e:
        return {"status": "error", "message": str(e), "path": str(scenes_dir)}

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
        filename=f"clipper_studio_{project_id}.mp4"
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
