export interface SceneItem {
  id: string;
  index: number;
  start: number;
  end: number;
  duration: number;
  prompt_voice: string;
  prompt_visual: string;
  status: 'pending' | 'generating' | 'ready' | 'error';
  html_file?: string;
  render_file?: string;
  error_message?: string;
}

export interface ProjectData {
  project_id: string;
  audio_duration: number;
  scenes: SceneItem[];
  has_rendered_video?: boolean;
}

export interface WebSocketEvent {
  type: string;
  scene_index?: number;
  message?: string;
  error?: string;
  progress?: number;
  stream?: string;
  line?: string;
  video_url?: string;
}
