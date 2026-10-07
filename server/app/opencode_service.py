import asyncio
import os
import re
from pathlib import Path
from server.app.config import OPENCODE_BIN
from server.app.websocket_manager import ws_manager

SYSTEM_MATH_RULES = """
CRITICAL SPECIFICATIONS FOR THIS HTML ANIMATION:
1. Target Resolution: 1920x1080 (Full HD, 16:9).
2. Canvas/Container: Center perfectly, fill viewport, background must strictly be #0b0f19 (deep navy/slate dark theme).
3. Visual Aesthetic: Modern high-end educational math visual (similar to 3Blue1Brown/Manim style). Use bright glowing mathematical accents: cyan (#06b6d4 / #22d3ee), amber/gold (#f59e0b), emerald green (#10b981), crisp white (#f8fafc) and subtle grid lines (#1e293b).
4. Timing and Behavior:
   - Total scene animation duration: EXACTLY {duration:.2f} seconds.
   - The animation MUST start automatically on page load.
   - Interpolate smoothly with requestAnimationFrame using an eased progress t = (currentTime / {duration:.2f}).
   - Once elapsed time reaches {duration:.2f} seconds, FREEZE THE FRAME and stop modifying the canvas. Do NOT loop, do NOT clear screen, do NOT reset!
5. Tech Stack: Self-contained single file with inline HTML, CSS, and vanilla JavaScript (HTML5 Canvas 2D or SVG). Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) can be included if helpful.
6. NO interactive buttons, NO scrollbars (overflow: hidden), and NO external assets like images/fonts that require local hosting.
"""

def build_scene_prompt(scene_idx: int, duration: float, prompt_visual: str, prompt_voice: str, refinement: str = None, existing_code: str = None) -> str:
    scene_file_name = f"scene_{scene_idx:02d}.html"
    
    if refinement and existing_code:
        return f"""
You are refining an existing HTML math animation file `{scene_file_name}`.

CURRENT CODE:
```html
{existing_code}
```

USER REFINEMENT REQUEST:
"{refinement}"

ADDITIONAL CONTEXT:
Voice locution for this segment: "{prompt_voice}"
Duration must remain: {duration:.2f} seconds.

TASK:
Produce the revised complete standalone HTML file and write it directly to `scenes/{scene_file_name}`.
Ensure:
- Exact {duration:.2f}s timeline with freeze-frame at the end.
- Dark theme background #0b0f19.
- 1080p canvas scaling.
"""

    return f"""
Create a pedagogical, visually captivating math/logic animation file `scenes/{scene_file_name}`.

SCENE CONTEXT:
- Scene Number: #{scene_idx}
- Duration: {duration:.2f} seconds
- Narration / Spoken audio cue: "{prompt_voice}"
- Visual Instruction: "{prompt_visual}"

{SYSTEM_MATH_RULES.format(duration=duration)}

TASK:
Generate the complete HTML code and save it to `scenes/{scene_file_name}`.
Make sure the file starts with <!DOCTYPE html> and is 100% self-contained and working.
"""

async def run_opencode_generation(project_dir: Path, project_id: str, scene_idx: int, duration: float, prompt_visual: str, prompt_voice: str, refinement: str = None):
    scene_file_name = f"scene_{scene_idx:02d}.html"
    scene_path = project_dir / "scenes" / scene_file_name
    
    existing_code = None
    if scene_path.exists():
        existing_code = scene_path.read_text(encoding="utf-8")
        
    full_prompt = build_scene_prompt(
        scene_idx=scene_idx,
        duration=duration,
        prompt_visual=prompt_visual,
        prompt_voice=prompt_voice,
        refinement=refinement,
        existing_code=existing_code
    )

    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_start",
        "scene_index": scene_idx,
        "message": f"Starting OpenCode generation for scene #{scene_idx}..."
    })

    # Prepare command: we run opencode run with the message
    # If opencode executable exists, call it. If fallback or dry mode needed, handled gracefully.
    cmd = [OPENCODE_BIN, "run", full_prompt]

    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(project_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
    except FileNotFoundError:
        # Fallback if opencode binary not found at specified path, try PATH
        cmd[0] = "opencode"
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(project_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
        except Exception as e:
            await ws_manager.broadcast_to_project(project_id, {
                "type": "opencode_error",
                "scene_index": scene_idx,
                "error": f"Failed to invoke OpenCode CLI: {str(e)}"
            })
            return False

    async def stream_output(stream, is_err=False):
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode(errors="replace").strip()
            if text:
                await ws_manager.broadcast_to_project(project_id, {
                    "type": "opencode_log",
                    "scene_index": scene_idx,
                    "stream": "stderr" if is_err else "stdout",
                    "line": text
                })

    await asyncio.gather(
        stream_output(process.stdout),
        stream_output(process.stderr)
    )
    
    return_code = await process.wait()

    # If the file wasn't directly written by OpenCode or in case OpenCode outputted raw code blocks
    if not scene_path.exists():
        # Check if project_dir or subfolder has it, or generate a high quality template if failed
        await ws_manager.broadcast_to_project(project_id, {
            "type": "opencode_warning",
            "scene_index": scene_idx,
            "message": f"Scene file was not generated automatically by CLI. Creating fallback animation based on prompt."
        })
        fallback_html = create_fallback_animation_html(scene_idx, duration, prompt_visual, prompt_voice)
        scene_path.write_text(fallback_html, encoding="utf-8")

    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_complete",
        "scene_index": scene_idx,
        "success": True,
        "scene_file": f"scenes/{scene_file_name}"
    })
    return True

def create_fallback_animation_html(scene_idx: int, duration: float, prompt_visual: str, prompt_voice: str) -> str:
    """Generates a high-fidelity standalone fallback animation if OpenCode output needs bootstrapping."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1920, height=1080, initial-scale=1.0">
  <title>Scene {scene_idx}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      background: #0b0f19;
      color: #f8fafc;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }}
    canvas {{
      position: absolute;
      top: 0;
      left: 0;
      width: 1920px;
      height: 1080px;
    }}
  </style>
</head>
<body class="flex flex-col items-center justify-between p-16 select-none">
  <canvas id="mathCanvas" width="1920" height="1080"></canvas>
  
  <!-- Overlay Content -->
  <div class="relative z-10 w-full flex justify-between items-center text-slate-400 text-2xl font-mono">
    <div class="flex items-center gap-3">
      <span class="inline-block w-4 h-4 rounded-full bg-cyan-500 animate-ping"></span>
      <span>SCENE {scene_idx:02d}</span>
    </div>
    <div id="timer" class="text-amber-400">0.00s / {duration:.2f}s</div>
  </div>

  <div class="relative z-10 text-center max-w-4xl bg-slate-900/80 p-8 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">
    <h1 class="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-400 bg-clip-text text-transparent mb-4">
      {prompt_visual or "Mathematical Visualization"}
    </h1>
    <p class="text-xl text-slate-300 italic">
      "{prompt_voice or 'Audio narration synchronization cue'}"
    </p>
  </div>

  <div class="relative z-10 w-full bg-slate-950/60 rounded-full h-3 overflow-hidden border border-slate-800">
    <div id="progressBar" class="bg-gradient-to-r from-cyan-500 to-amber-500 h-full w-0 transition-all"></div>
  </div>

  <script>
    const canvas = document.getElementById('mathCanvas');
    const ctx = canvas.getContext('2d');
    const timerElem = document.getElementById('timer');
    const progressBar = document.getElementById('progressBar');
    
    const DURATION = {duration:.2f};
    let startTime = null;

    function drawGrid(t) {{
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const step = 80;
      for (let x = 0; x < canvas.width; x += step) {{
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }}
      for (let y = 0; y < canvas.height; y += step) {{
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }}
    }}

    function animate(timestamp) {{
      if (!startTime) startTime = timestamp;
      const elapsed = Math.min((timestamp - startTime) / 1000, DURATION);
      const progress = Math.min(elapsed / DURATION, 1.0);

      // Clear Canvas
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid(progress);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Draw dynamic visual logic graph / waves
      ctx.save();
      ctx.translate(cx, cy);

      // Glowing mathematical spiral or wave
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#06b6d4';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 15;

      const points = 300;
      for (let i = 0; i < points * progress; i++) {{
        const angle = i * 0.08 + progress * Math.PI;
        const radius = 50 + i * 1.2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius * 0.6;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }}
      ctx.stroke();

      // Golden focal node
      const headAngle = (points * progress) * 0.08 + progress * Math.PI;
      const headRadius = 50 + (points * progress) * 1.2;
      const hx = Math.cos(headAngle) * headRadius;
      const hy = Math.sin(headAngle) * headRadius * 0.6;

      ctx.beginPath();
      ctx.arc(hx, hy, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 25;
      ctx.fill();

      ctx.restore();

      // Update timer UI
      timerElem.textContent = `${{elapsed.toFixed(2)}}s / ${{DURATION.toFixed(2)}}s`;
      progressBar.style.width = `${{(progress * 100).toFixed(1)}}%`;

      if (progress < 1.0) {{
        requestAnimationFrame(animate);
      }} else {{
        // Frame is frozen at final state
        console.log("Animation completed and frozen at exact duration.");
      }}
    }}

    requestAnimationFrame(animate);
  </script>
</body>
</html>
"""
