import React, { useState, useEffect, useCallback } from 'react';
import { AudioUpload } from './components/AudioUpload';
import { AudioTimeline } from './components/AudioTimeline';
import { SceneCard } from './components/SceneCard';
import { RenderBar } from './components/RenderBar';
import { fetchProject, updateTimeline, generateScene, triggerRender } from './services/api';
import { SceneItem, WebSocketEvent } from './types';
import { Plus, Sparkles, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [hasRenderedVideo, setHasRenderedVideo] = useState(false);
  
  // Render & Logs State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatusMessage, setRenderStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  // WebSocket connection for real-time logs & render updates
  useEffect(() => {
    if (!projectId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/projects/ws/${projectId}`;
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
            setRenderStatusMessage('Render finished!');
            setLogs((prev) => [...prev, '✓ Video successfully rendered & synced.']);
          } else if (data.type === 'render_error') {
            setIsRendering(false);
            setRenderStatusMessage('Render Error: ' + (data.error || 'Unknown'));
            setLogs((prev) => [...prev, `[ERROR] ${data.error}`]);
          } else if (data.type === 'opencode_complete' && data.scene_index !== undefined) {
            // Refresh scenes
            fetchProject(projectId).then((p) => setScenes(p.scenes));
          }
        } catch (e) {
          // Non-JSON message
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
      }).catch(() => {
        // Project might not exist
      });
    }
  }, []);

  const handleProjectCreated = (newId: string, duration: number) => {
    setProjectId(newId);
    setAudioDuration(duration);
    window.history.pushState({}, '', `?project=${newId}`);
    
    // Create initial Scene 1 covering start to duration
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

  // TAP TO SPLIT logic
  const handleSplit = useCallback((timestamp: number) => {
    if (!projectId || timestamp <= 0.1 || timestamp >= audioDuration - 0.1) return;

    setScenes((currentScenes) => {
      // Find scene that contains timestamp
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

  const handleUpdateScene = (updated: SceneItem) => {
    if (!projectId) return;
    const newScenes = scenes.map((s) => (s.index === updated.index ? updated : s));
    setScenes(newScenes);
    updateTimeline(projectId, newScenes);
  };

  const handleGenerate = async (sceneIdx: number, refinement?: string) => {
    if (!projectId) return;
    // optimistic update
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
    setRenderStatusMessage('Starting headless render engine...');
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

  // Extract split cut positions for the timeline bar
  const splitPoints = scenes.slice(0, -1).map((s) => s.end);

  return (
    <div className="min-h-screen bg-background pb-32 pt-4 px-4 max-w-xl mx-auto flex flex-col gap-5">
      {/* App Header */}
      <header className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
          <h1 className="font-bold text-lg text-slate-100">Math Clipper Studio</h1>
        </div>
        <div className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
          ID: {projectId}
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
      />

      {/* Scenes List Section Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          <h2 className="font-bold text-sm tracking-wide text-slate-200 uppercase">
            Timeline Scenes ({scenes.length})
          </h2>
        </div>
        <button
          onClick={handleGenerateAll}
          className="text-xs px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <Sparkles size={14} />
          <span>Generate All</span>
        </button>
      </div>

      {/* Scene Cards */}
      <div className="flex flex-col gap-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id || scene.index}
            scene={scene}
            projectId={projectId}
            onUpdate={handleUpdateScene}
            onGenerate={handleGenerate}
          />
        ))}
      </div>

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
