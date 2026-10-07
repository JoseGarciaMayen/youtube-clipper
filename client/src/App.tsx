import React, { useState, useEffect, useCallback } from 'react';
import { AudioUpload } from './components/AudioUpload';
import { AudioTimeline } from './components/AudioTimeline';
import { SceneCard } from './components/SceneCard';
import { EditSceneModal } from './components/EditSceneModal';
import { RenderBar } from './components/RenderBar';
import { fetchProject, updateTimeline, generateScene, triggerRender } from './services/api';
import { SceneItem, WebSocketEvent } from './types';
import { Sparkles, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [hasRenderedVideo, setHasRenderedVideo] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Edit Scene Modal state
  const [editingScene, setEditingScene] = useState<SceneItem | null>(null);
  
  // Render & Logs State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatusMessage, setRenderStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  // WebSocket connection for real-time logs & render updates
  useEffect(() => {
    if (!projectId) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL;
    let wsUrl = '';
    if (apiBase) {
      const wsProto = apiBase.startsWith('https') ? 'wss:' : 'ws:';
      const host = apiBase.replace(/^https?:\/\//, '');
      wsUrl = `${wsProto}//${host}/api/projects/ws/${projectId}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/api/projects/ws/${projectId}`;
    }
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data: WebSocketEvent = JSON.parse(event.data);
          
          if (data.type === 'opencode_log' && data.line) {
            setLogs((prev) => [...prev.slice(-100), `[OpenCode] ${data.line}`]);
          } else if (data.type === 'render_log' && data.line) {
            setLogs((prev) => [...prev.slice(-100), `[Render] ${data.line}`]);
          } else if (data.type === 'render_progress') {
            setIsRendering(true);
            if (data.progress !== undefined) setRenderProgress(data.progress);
            if (data.message) setRenderStatusMessage(data.message);
          } else if (data.type === 'render_complete') {
            setIsRendering(false);
            setRenderProgress(100);
            setHasRenderedVideo(true);
            setRenderStatusMessage('Render complete');
            setLogs((prev) => [...prev, '✓ Video successfully rendered.']);
          } else if (data.type === 'render_error') {
            setIsRendering(false);
            setRenderStatusMessage('Error: ' + (data.error || 'Unknown'));
            setLogs((prev) => [...prev, `[ERROR] ${data.error}`]);
          } else if (data.type === 'opencode_complete' && data.scene_index !== undefined) {
            fetchProject(projectId).then((p) => setScenes(p.scenes));
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = (err) => console.log('WebSocket error', err);
    } catch (e) {
      console.warn('Could not establish WebSocket connection', e);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [projectId]);

  // Load project if ID is stored in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project');
    if (pid) {
      fetchProject(pid).then((data) => {
        setProjectId(data.project_id);
        setAudioDuration(data.audio_duration);
        setScenes(data.scenes || []);
        setHasRenderedVideo(!!data.has_rendered_video);
      }).catch(() => {});
    }
  }, []);

  const handleProjectCreated = (newId: string, duration: number) => {
    setProjectId(newId);
    setAudioDuration(duration);
    window.history.pushState({}, '', `?project=${newId}`);
    
    const initialScene: SceneItem = {
      id: 'sc-1',
      index: 1,
      start: 0.0,
      end: duration,
      duration: duration,
      prompt_voice: '',
      prompt_visual: '',
      status: 'pending',
    };
    const initialScenes = [initialScene];
    setScenes(initialScenes);
    updateTimeline(newId, initialScenes);
  };

  const handleSplit = useCallback((timestamp: number) => {
    if (!projectId || timestamp <= 0.1 || timestamp >= audioDuration - 0.1) return;

    setScenes((currentScenes) => {
      const targetIdx = currentScenes.findIndex(
        (s) => timestamp > s.start && timestamp < s.end
      );

      if (targetIdx === -1) return currentScenes;

      const target = currentScenes[targetIdx];
      const sceneA: SceneItem = {
        ...target,
        end: parseFloat(timestamp.toFixed(2)),
        duration: parseFloat((timestamp - target.start).toFixed(2)),
      };

      const sceneB: SceneItem = {
        id: `sc-${Date.now()}`,
        index: target.index + 1,
        start: parseFloat(timestamp.toFixed(2)),
        end: target.end,
        duration: parseFloat((target.end - timestamp).toFixed(2)),
        prompt_voice: '',
        prompt_visual: '',
        status: 'pending',
      };

      const reindexed = [
        ...currentScenes.slice(0, targetIdx),
        sceneA,
        sceneB,
        ...currentScenes.slice(targetIdx + 1).map((s) => ({
          ...s,
          index: s.index + 1,
        })),
      ];

      updateTimeline(projectId, reindexed);
      return reindexed;
    });
  }, [projectId, audioDuration]);

  // Delete scene: Reverts the last cut and merges back into the previous scene
  const handleDeleteScene = (sceneIndex: number) => {
    if (!projectId || scenes.length <= 1) return;

    setScenes((currentScenes) => {
      const targetIdx = currentScenes.findIndex((s) => s.index === sceneIndex);
      if (targetIdx <= 0) return currentScenes;

      const prev = currentScenes[targetIdx - 1];
      const current = currentScenes[targetIdx];

      // Merge back end timestamp
      const mergedPrev: SceneItem = {
        ...prev,
        end: current.end,
        duration: parseFloat((current.end - prev.start).toFixed(2)),
      };

      const updated = [
        ...currentScenes.slice(0, targetIdx - 1),
        mergedPrev,
        ...currentScenes.slice(targetIdx + 1).map((s) => ({
          ...s,
          index: s.index - 1,
        })),
      ];

      updateTimeline(projectId, updated);
      return updated;
    });
  };

  const handleUpdateScene = (updated: SceneItem) => {
    if (!projectId) return;
    const newScenes = scenes.map((s) => (s.index === updated.index ? updated : s));
    setScenes(newScenes);
    updateTimeline(projectId, newScenes);
  };

  // Fine tune scene from modal
  const handleSaveEditedScene = (saved: SceneItem) => {
    if (!projectId) return;
    setScenes((currentScenes) => {
      const targetIdx = currentScenes.findIndex((s) => s.index === saved.index);
      if (targetIdx === -1) return currentScenes;

      const newScenes = [...currentScenes];
      newScenes[targetIdx] = saved;

      // Adjust adjacent scenes if boundaries changed
      if (targetIdx > 0) {
        newScenes[targetIdx - 1] = {
          ...newScenes[targetIdx - 1],
          end: saved.start,
          duration: parseFloat((saved.start - newScenes[targetIdx - 1].start).toFixed(2)),
        };
      }
      if (targetIdx < newScenes.length - 1) {
        newScenes[targetIdx + 1] = {
          ...newScenes[targetIdx + 1],
          start: saved.end,
          duration: parseFloat((newScenes[targetIdx + 1].end - saved.end).toFixed(2)),
        };
      }

      updateTimeline(projectId, newScenes);
      return newScenes;
    });
  };

  const handleGenerate = async (sceneIdx: number, refinement?: string) => {
    if (!projectId) return;
    setScenes((prev) =>
      prev.map((s) => (s.index === sceneIdx ? { ...s, status: 'generating' } : s))
    );
    try {
      await generateScene(projectId, sceneIdx, refinement);
    } catch (err: any) {
      alert(`Generation failed: ${err.message}`);
      setScenes((prev) =>
        prev.map((s) => (s.index === sceneIdx ? { ...s, status: 'error' } : s))
      );
    }
  };

  const handleGenerateAll = async () => {
    if (!projectId) return;
    for (const sc of scenes) {
      await generateScene(projectId, sc.index);
    }
  };

  const handleStartRender = async () => {
    if (!projectId) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStatusMessage('Starting render engine...');
    try {
      await triggerRender(projectId);
    } catch (err: any) {
      setIsRendering(false);
      alert(`Render trigger failed: ${err.message}`);
    }
  };

  if (!projectId) {
    return <AudioUpload onProjectCreated={handleProjectCreated} />;
  }

  const splitPoints = scenes.slice(0, -1).map((s) => s.end);

  // Determine min and max bounds for currently edited scene
  let minStart = 0;
  let maxEnd = audioDuration;
  if (editingScene) {
    const idx = scenes.findIndex((s) => s.index === editingScene.index);
    if (idx > 0) minStart = scenes[idx - 1].start + 0.1;
    if (idx < scenes.length - 1) maxEnd = scenes[idx + 1].end - 0.1;
  }

  return (
    <div className="min-h-screen bg-background pb-28 pt-4 px-3 max-w-lg mx-auto flex flex-col gap-4">
      {/* Header */}
      <header className="flex items-center justify-between pb-2 border-b border-[#1f242d]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <h1 className="font-semibold text-sm tracking-wide text-neutral-100">Math Clipper</h1>
        </div>
        <div className="text-[11px] font-mono text-neutral-500">
          {projectId}
        </div>
      </header>

      {/* Audio Player & Tap to Split Controller */}
      <AudioTimeline
        projectId={projectId}
        duration={audioDuration}
        currentTime={currentTime}
        onTimeUpdate={setCurrentTime}
        onSplit={handleSplit}
        splits={splitPoints}
        seekTime={seekTime}
        onSeekHandled={() => setSeekTime(null)}
        onPlayStateChange={setIsPlaying}
      />

      {/* Scenes List Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
          <Layers size={14} className="text-blue-400" />
          <span>Scenes ({scenes.length})</span>
        </div>
        <button
          onClick={handleGenerateAll}
          className="text-xs px-2.5 py-1 rounded-lg bg-[#181b22] hover:bg-[#232834] text-blue-400 border border-[#2d3442] flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Sparkles size={12} />
          <span>Generate All</span>
        </button>
      </div>

      {/* Scene Cards with clip audio playback, edit modal & delete */}
      <div className="flex flex-col gap-2.5">
        {scenes.map((scene, idx) => {
          const isPlayingThisScene =
            isPlaying && currentTime >= scene.start && currentTime <= scene.end;

          return (
            <SceneCard
              key={scene.id || scene.index}
              scene={scene}
              projectId={projectId}
              isLastScene={idx === scenes.length - 1}
              canDelete={scenes.length > 1}
              isPlayingThisScene={isPlayingThisScene}
              onPlayScene={(startTime) => setSeekTime(startTime)}
              onEditScene={(sc) => setEditingScene(sc)}
              onDeleteScene={handleDeleteScene}
              onUpdate={handleUpdateScene}
              onGenerate={handleGenerate}
            />
          );
        })}
      </div>

      {/* Precision Trim Modal */}
      {editingScene && (
        <EditSceneModal
          scene={editingScene}
          projectId={projectId}
          minStart={minStart}
          maxEnd={maxEnd}
          isOpen={!!editingScene}
          onClose={() => setEditingScene(null)}
          onSave={handleSaveEditedScene}
        />
      )}

      {/* Fixed Bottom Render Bar */}
      <RenderBar
        projectId={projectId}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStatusMessage={renderStatusMessage}
        hasRenderedVideo={hasRenderedVideo}
        logs={logs}
        onStartRender={handleStartRender}
      />
    </div>
  );
};

export default App;
