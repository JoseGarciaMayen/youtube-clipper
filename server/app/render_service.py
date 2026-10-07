import asyncio
import json
import logging
from pathlib import Path
from server.app.config import SCRIPTS_DIR, NODE_BIN, FFMPEG_BIN
from server.app.websocket_manager import ws_manager

logger = logging.getLogger("render_service")

async def run_render_pipeline(project_dir: Path, project_id: str):
    render_script = SCRIPTS_DIR / "render_pipeline.js"
    timeline_path = project_dir / "timeline.json"
    
    if not timeline_path.exists():
        await ws_manager.broadcast_to_project(project_id, {
            "type": "render_error",
            "error": "Timeline file not found. Create scenes first."
        })
        return False

    await ws_manager.broadcast_to_project(project_id, {
        "type": "render_start",
        "message": "Initiating headless Puppeteer rendering pipeline..."
    })

    cmd = [
        NODE_BIN,
        str(render_script),
        "--project", str(project_dir)
    ]

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        async def stream_output(stream, is_err=False):
            while True:
                line = await stream.readline()
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if not text:
                    continue
                # Try to parse json progress messages
                try:
                    if text.startswith("{") and text.endswith("}"):
                        parsed = json.loads(text)
                        await ws_manager.broadcast_to_project(project_id, parsed)
                        continue
                except:
                    pass

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "render_log",
                    "stream": "stderr" if is_err else "stdout",
                    "line": text
                })

        await asyncio.gather(
            stream_output(process.stdout),
            stream_output(process.stderr, is_err=True)
        )

        rc = await process.wait()
        final_video = project_dir / "output_final.mp4"

        if rc == 0 and final_video.exists():
            await ws_manager.broadcast_to_project(project_id, {
                "type": "render_complete",
                "success": True,
                "video_url": f"/api/projects/{project_id}/download",
                "message": "Video rendering and assembly finished successfully!"
            })
            return True
        else:
            await ws_manager.broadcast_to_project(project_id, {
                "type": "render_error",
                "error": f"Rendering process exited with status code {rc}"
            })
            return False

    except Exception as e:
        logger.error(f"Render pipeline failed: {e}")
        await ws_manager.broadcast_to_project(project_id, {
            "type": "render_error",
            "error": f"Failed to execute render pipeline: {str(e)}"
        })
        return False
