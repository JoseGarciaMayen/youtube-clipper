import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from server.app.api.projects import router as projects_router
from server.app.config import BASE_DIR

app = FastAPI(
    title="YouTube Math Clipper Suite API",
    description="Backend API for orchestrating math video production, OpenCode generation, and Puppeteer rendering",
    version="1.0.0"
)

# CORS middleware for mobile / frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects_router)

# Mount client dist if built
dist_dir = BASE_DIR / "client" / "dist"
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "youtube-clipper-backend"}
