import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECTS_DIR = BASE_DIR / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
SCRIPTS_DIR = BASE_DIR / "scripts" / "render"

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", str(Path.home() / ".opencode" / "bin" / "opencode"))
NODE_BIN = os.environ.get("NODE_BIN", "node")
FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "ffmpeg")

PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
