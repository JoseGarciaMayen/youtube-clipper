import { ProjectData, SceneItem } from '../types';

const getBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  // If running inside Electron / file:// protocol, target local backend on 8080
  if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || (window as any).electronAPI)) {
    return 'http://127.0.0.1:8080';
  }
  return '';
};

export const API_BASE = `${getBaseUrl()}/api/projects`;

export async function createProject(audioFile: File): Promise<{ project_id: string; audio_duration: number }> {
  const formData = new FormData();
  formData.append('audio', audioFile);

  const res = await fetch(API_BASE, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload audio: ${err}`);
  }
  return res.json();
}

export async function fetchProject(projectId: string): Promise<ProjectData> {
  const res = await fetch(`${API_BASE}/${projectId}`);
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function updateTimeline(projectId: string, scenes: SceneItem[]): Promise<void> {
  const res = await fetch(`${API_BASE}/${projectId}/timeline`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes }),
  });
  if (!res.ok) throw new Error('Failed to update timeline');
}

export async function generateScene(
  projectId: string,
  sceneIdx: number,
  refinementPrompt?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/${projectId}/scenes/${sceneIdx}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refinement_prompt: refinementPrompt || null,
    }),
  });
  if (!res.ok) throw new Error('Failed to trigger generation');
}

export async function triggerRender(projectId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${projectId}/render`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to start render');
}
