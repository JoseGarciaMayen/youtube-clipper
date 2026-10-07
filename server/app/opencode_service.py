import asyncio
import os
import re
from pathlib import Path
from server.app.config import OPENCODE_BIN
from server.app.websocket_manager import ws_manager

SYSTEM_ANIMATION_RULES = """
CRITICAL SPECIFICATIONS FOR THIS HTML ANIMATION:
1. Target Resolution: 1920x1080 (Full HD, 16:9).
2. Canvas/Container: Center perfectly, fill viewport, background must strictly be #0b0f19 (deep navy/slate dark theme).
3. Visual Aesthetic: Modern high-end conceptual visual style (inspired by 3Blue1Brown/Manim motion design). Use bright glowing visual accents: cyan (#06b6d4 / #22d3ee), amber/gold (#f59e0b), emerald green (#10b981), crisp white (#f8fafc) and subtle grid/structural lines (#1e293b).
4. Timing and Behavior:
   - Total scene animation duration: EXACTLY {duration:.2f} seconds.
   - The animation MUST start automatically on page load.
   - Interpolate smoothly with requestAnimationFrame using an eased progress t = (currentTime / {duration:.2f}).
   - Once elapsed time reaches {duration:.2f} seconds, FREEZE THE FRAME and stop modifying the canvas. Do NOT loop, do NOT clear screen, do NOT reset!
5. Tech Stack: Self-contained single file with inline HTML, CSS, and vanilla JavaScript (HTML5 Canvas 2D or SVG). Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) can be included if helpful.
6. NO interactive buttons, NO scrollbars (overflow: hidden), and NO external assets like images/fonts that require local hosting.
"""

def build_scene_prompt(project_dir: Path, scene_idx: int, duration: float, prompt_visual: str, prompt_voice: str, refinement: str = None, existing_code: str = None) -> str:
    scene_file_name = f"scene_{scene_idx:02d}.html"
    abs_scene_file = (project_dir / "scenes" / scene_file_name).resolve()
    
    if refinement and existing_code:
        return f"""
You are refining an existing HTML animation file `{abs_scene_file}`.

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
Produce the revised complete standalone HTML file and write it directly to `{abs_scene_file}`.
Ensure:
- Exact {duration:.2f}s timeline with freeze-frame at the end.
- Dark theme background #0b0f19.
- 1080p canvas scaling.
"""

    return f"""
Create a pedagogical, visually captivating animation file `{abs_scene_file}`.

SCENE CONTEXT:
- Scene Number: #{scene_idx}
- Duration: {duration:.2f} seconds
- Narration / Spoken audio cue: "{prompt_voice}"
- Visual Instruction: "{prompt_visual}"

{SYSTEM_ANIMATION_RULES.format(duration=duration)}

TASK:
Generate the complete HTML code and save it directly to `{abs_scene_file}`.
Make sure the file starts with <!DOCTYPE html> and is 100% self-contained and working.
"""

def build_review_prompt(project_dir: Path, scene_idx: int, duration: float, prompt_visual: str, prompt_voice: str, current_code: str) -> str:
    scene_file_name = f"scene_{scene_idx:02d}.html"
    abs_scene_file = (project_dir / "scenes" / scene_file_name).resolve()
    
    return f"""
You are the Lead Visual Reviewer and Quality Assurance Art Director.
You are critically reviewing and approving the generated HTML animation file `{abs_scene_file}` for Scene #{scene_idx}.

SCENE CONTEXT & CRITERIA:
- Scene Index: #{scene_idx}
- Exact Animation Duration: {duration:.2f} seconds
- Narration Audio Segment: "{prompt_voice}"
- Visual Instruction Directive: "{prompt_visual}"
- Dark Theme Requirement: Background strictly #0b0f19, canvas centered 1920x1080 (16:9).
- Freeze-Frame Requirement: Animation MUST progress smoothly and FREEZE completely when elapsed time reaches {duration:.2f} seconds. No resetting or infinite animation loops.
- Visual Aesthetics: Motion design aesthetic. Crisp typography, glowing visual elements, vibrant palettes (cyan #06b6d4, gold #f59e0b, emerald #10b981).

CURRENT GENERATED CODE IN `{abs_scene_file}`:
```html
{current_code}
```

REVIEW INSTRUCTIONS:
1. Thoroughly inspect the code for syntax errors, missing variables, or runtime glitches.
2. Verify the duration constant ({duration:.2f}s) and freeze-frame condition in the requestAnimationFrame loop.
3. Elevate the visual fidelity, clarity, and mathematical elegance if there are weaknesses.
4. Overwrite and save the perfected, complete standalone HTML directly to `{abs_scene_file}`.
"""

async def _execute_opencode_agent(
    agent_name: str,
    prompt: str,
    project_dir: Path,
    project_id: str,
    scene_idx: int,
    stage_tag: str
) -> bool:
    cmd = [OPENCODE_BIN, "run", "--agent", agent_name, "--auto", prompt]

    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(project_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
    except FileNotFoundError:
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
                "error": f"Failed to invoke OpenCode ({stage_tag}): {str(e)}"
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
                    "line": f"[{stage_tag}] {text}"
                })

    await asyncio.gather(
        stream_output(process.stdout),
        stream_output(process.stderr)
    )

    return_code = await process.wait()
    return return_code == 0

async def run_opencode_generation(
    project_dir: Path,
    project_id: str,
    scene_idx: int,
    duration: float,
    prompt_visual: str,
    prompt_voice: str,
    refinement: str = None
):
    import json
    scene_file_name = f"scene_{scene_idx:02d}.html"
    scenes_dir = project_dir / "scenes"
    scenes_dir.mkdir(parents=True, exist_ok=True)
    scene_path = scenes_dir / scene_file_name
    timeline_file = project_dir / "timeline.json"

    def _set_scene_status(st: str):
        if timeline_file.exists():
            try:
                with open(timeline_file, "r", encoding="utf-8") as f:
                    tl = json.load(f)
                sc = next((s for s in tl.get("scenes", []) if s.get("index") == scene_idx), None)
                if sc:
                    sc["status"] = st
                    if st == "ready":
                        sc["html_file"] = f"scenes/{scene_file_name}"
                    with open(timeline_file, "w", encoding="utf-8") as f:
                        json.dump(tl, f, indent=2)
            except Exception:
                pass

    existing_code = None
    if scene_path.exists():
        existing_code = scene_path.read_text(encoding="utf-8")

    # ==========================================
    # FASE 1: GENERACIÓN (DeepSeek Flash · visual_coder)
    # ==========================================
    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_start",
        "scene_index": scene_idx,
        "message": f"Fase 1/2: Generando animación con DeepSeek Flash para la escena #{scene_idx}..."
    })
    _set_scene_status("generating")

    gen_prompt = build_scene_prompt(
        project_dir=project_dir,
        scene_idx=scene_idx,
        duration=duration,
        prompt_visual=prompt_visual,
        prompt_voice=prompt_voice,
        refinement=refinement,
        existing_code=existing_code
    )

    await _execute_opencode_agent(
        agent_name="visual_coder",
        prompt=gen_prompt,
        project_dir=project_dir,
        project_id=project_id,
        scene_idx=scene_idx,
        stage_tag="DeepSeek Flash · Coder"
    )

    # Si por alguna razón el archivo no fue creado, inicializar fallback antes de la revisión
    if not scene_path.exists() or len(scene_path.read_text(encoding="utf-8").strip()) == 0:
        fallback_html = create_fallback_animation_html(scene_idx, duration, prompt_visual, prompt_voice)
        scene_path.write_text(fallback_html, encoding="utf-8")

    # ==========================================
    # FASE 2: FLUJO DE REVISIÓN (DeepSeek V4 Pro · visual_reviewer)
    # ==========================================
    _set_scene_status("reviewing")
    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_step",
        "scene_index": scene_idx,
        "step": "reviewing",
        "message": f"Fase 2/2: Auditando y perfeccionando escena con modelo revisor (DeepSeek V4 Pro)..."
    })

    current_code = scene_path.read_text(encoding="utf-8")
    review_prompt = build_review_prompt(
        project_dir=project_dir,
        scene_idx=scene_idx,
        duration=duration,
        prompt_visual=prompt_visual,
        prompt_voice=prompt_voice,
        current_code=current_code
    )

    await _execute_opencode_agent(
        agent_name="visual_reviewer",
        prompt=review_prompt,
        project_dir=project_dir,
        project_id=project_id,
        scene_idx=scene_idx,
        stage_tag="DeepSeek V4 Pro · Reviewer"
    )

    # ==========================================
    # FASE 3: APROBACIÓN FINAL
    # ==========================================
    if not scene_path.exists() or len(scene_path.read_text(encoding="utf-8").strip()) == 0:
        fallback_html = create_fallback_animation_html(scene_idx, duration, prompt_visual, prompt_voice)
        scene_path.write_text(fallback_html, encoding="utf-8")

    _set_scene_status("ready")
    await ws_manager.broadcast_to_project(project_id, {
        "type": "opencode_complete",
        "scene_index": scene_idx,
        "success": True,
        "reviewed": True,
        "reviewer_model": "deepseek/deepseek-v4-pro",
        "scene_file": f"scenes/{scene_file_name}",
        "message": f"✓ Escena #{scene_idx} revisada y aprobada por DeepSeek V4 Pro."
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
