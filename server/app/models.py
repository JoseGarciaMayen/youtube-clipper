from pydantic import BaseModel, Field
from typing import List, Optional

class SceneItem(BaseModel):
    id: str
    index: int
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    duration: float = Field(..., description="Duration in seconds (end - start)")
    prompt_voice: Optional[str] = Field(default="", description="Speech transcript or voice prompt")
    prompt_visual: Optional[str] = Field(default="", description="Visual prompt / instructions for OpenCode")
    status: str = Field(default="pending", description="Status: pending, generating, ready, error")
    html_file: Optional[str] = Field(default=None, description="Relative path to scene_XX.html")
    render_file: Optional[str] = Field(default=None, description="Relative path to scene_XX.mp4")
    error_message: Optional[str] = Field(default=None)

class TimelineUpdate(BaseModel):
    scenes: List[SceneItem]

class SceneGenerateRequest(BaseModel):
    refinement_prompt: Optional[str] = Field(default=None, description="Optional prompt to refine existing scene")
    custom_instructions: Optional[str] = Field(default=None)

class ProjectStatus(BaseModel):
    project_id: str
    audio_file: str
    audio_duration: float
    total_scenes: int
    scenes: List[SceneItem]
    render_status: str = "idle" # idle, rendering, completed, failed
    final_video: Optional[str] = None
