import React, { useState, useEffect, useCallback } from 'react';
import { AudioUpload } from './components/AudioUpload';
import { AudioTimeline } from './components/AudioTimeline';
import { SceneCard } from './components/SceneCard';
import { EditSceneModal } from './components/EditSceneModal';
import { RenderBar } from './components/RenderBar';
import { TerminalPanel } from './components/TerminalPanel';
import { fetchProject, updateTimeline, generateScene, triggerRender, uploadCustomScene, openProjectFolder } from './services/api';
import { SceneItem, WebSocketEvent } from './types';
import { Sparkles, Layers, Sliders, Eye, Maximize2, X, FolderOpen } from 'lucide-react';
import { API_BASE } from './services/api';

export const App: React.FC = () => {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [hasRenderedVideo, setHasRenderedVideo] = useState(false);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeClipScene, setActiveClipScene] = useState<{ id: string; start: number; end: number } | null>(null);

  // Active scene for large desktop live preview
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(1);
  const [isFullscreenStage, setIsFullscreenStage] = useState(false);

  // Edit Scene Modal state
  const [editingScene, setEditingScene] = useState<SceneItem | null>(null);
  
  // Render & Logs State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatusMessage, setRenderStatusMessage] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);

  // WebSocket connection for real-time logs & render updates
  useEffect(() => {
    if (!projectId) return;

    const apiBase = import.meta.env.VITE_API_BASE_URL;
    let wsUrl = '';
    if (apiBase) {
      const wsProto = apiBase.startsWith('https') ? 'wss:' : 'ws:';
      const host = apiBase.replace(/^https?:\/\//, '');
      wsUrl = `${wsProto}//${host}/api/projects/ws/${projectId}`;
    } else if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || (window as any).electronAPI)) {
      wsUrl = `ws://127.0.0.1:8080/api/projects/ws/${projectId}`;
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
            setLogs((prev) => [...prev, '✓ Master MP4 finished.']);
          } else if (data.type === 'render_error') {
            setIsRendering(false);
            setRenderStatusMessage('Error: ' + (data.error || 'Unknown'));
            setLogs((prev) => [...prev, `[ERROR] ${data.error}`]);
          } else if (data.type === 'scene_transcribed' && data.scene_index !== undefined && data.text) {
            setScenes((prev) =>
              prev.map((s) => (s.index === data.scene_index ? { ...s, prompt_voice: data.text || s.prompt_voice } : s))
            );
            setLogs((prev) => [...prev, `[Whisper] Scene #${data.scene_index} transcribed: "${data.text}"`]);
          } else if (data.type === 'timeline_transcription_completed') {
            fetchProject(projectId).then((p) => setScenes(p.scenes));
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

  // Load project if ID is stored in URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project') || localStorage.getItem('math_clipper_active_project');
    if (pid) {
      if (!params.get('project')) {
        window.history.replaceState({}, '', `?project=${pid}`);
      }
      fetchProject(pid).then((data) => {
        setProjectId(data.project_id);
        localStorage.setItem('math_clipper_active_project', data.project_id);
        setAudioDuration(data.audio_duration);
        setScenes(data.scenes || []);
        setHasRenderedVideo(!!data.has_rendered_video);
      }).catch(() => {
        localStorage.removeItem('math_clipper_active_project');
      });
    }
  }, []);

  const handleProjectCreated = (newId: string, duration: number) => {
    setProjectId(newId);
    setAudioDuration(duration);
    localStorage.setItem('math_clipper_active_project', newId);
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
    setSelectedSceneIndex(1);
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
      setSelectedSceneIndex(sceneB.index);
      return reindexed;
    });
  }, [projectId, audioDuration]);

  const handleDeleteScene = (sceneIndex: number) => {
    if (!projectId || scenes.length <= 1) return;

    setScenes((currentScenes) => {
      const targetIdx = currentScenes.findIndex((s) => s.index === sceneIndex);
      if (targetIdx === -1) return currentScenes;

      // Keep previous scenes intact without expanding to deleted range
      const updated = currentScenes
        .filter((s) => s.index !== sceneIndex)
        .map((s, idx) => ({
          ...s,
          index: idx + 1,
        }));

      updateTimeline(projectId, updated);
      const newActiveIdx = Math.max(1, targetIdx);
      setSelectedSceneIndex(newActiveIdx);
      return updated;
    });
  };

  const handleUpdateScene = (updated: SceneItem) => {
    if (!projectId) return;
    const newScenes = scenes.map((s) => (s.index === updated.index ? updated : s));
    setScenes(newScenes);
    updateTimeline(projectId, newScenes);
  };

  const handleSaveEditedScene = (saved: SceneItem) => {
    if (!projectId) return;
    setScenes((currentScenes) => {
      const targetIdx = currentScenes.findIndex((s) => s.index === saved.index);
      if (targetIdx === -1) return currentScenes;

      const newScenes = [...currentScenes];
      newScenes[targetIdx] = saved;

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

  const handleImportScene = async (sceneIdx: number, file: File) => {
    if (!projectId) return;
    try {
      await uploadCustomScene(projectId, sceneIdx, file);
      const updated = await fetchProject(projectId);
      setScenes(updated.scenes);
    } catch (err: any) {
      alert(`Failed to import scene HTML: ${err.message}`);
    }
  };

  const handleOpenFolder = async () => {
    if (!projectId) return;
    try {
      await openProjectFolder(projectId);
    } catch (err: any) {
      alert(`Could not open folder: ${err.message}`);
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
    setRenderStatusMessage('Starting render pipeline...');
    try {
      await triggerRender(projectId);
    } catch (err: any) {
      setIsRendering(false);
      alert(`Render trigger failed: ${err.message}`);
    }
  };

  const handlePlaySceneClip = (scene: SceneItem) => {
    // If this scene is already playing, pause it
    if (activeClipScene && activeClipScene.id === scene.id && isPlaying) {
      setActiveClipScene(null);
      setIsPlaying(false);
      setSeekTime(null);
    } else {
      // Play ONLY this scene's slice: start to end
      setActiveClipScene({ id: scene.id, start: scene.start, end: scene.end });
      setSeekTime(scene.start);
      setSelectedSceneIndex(scene.index);
    }
  };

  const handleResetAudio = () => {
    if (confirm('Are you sure you want to remove the current audio and start over?')) {
      localStorage.removeItem('math_clipper_active_project');
      setProjectId(null);
      setAudioDuration(0);
      setCurrentTime(0);
      setScenes([]);
      setActiveClipScene(null);
      setHasRenderedVideo(false);
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  if (!projectId) {
    return <AudioUpload onProjectCreated={handleProjectCreated} />;
  }

  const splitPoints = scenes.slice(0, -1).map((s) => s.end);

  let minStart = 0;
  let maxEnd = audioDuration;
  if (editingScene) {
    const idx = scenes.findIndex((s) => s.index === editingScene.index);
    if (idx > 0) minStart = scenes[idx - 1].start + 0.1;
    if (idx < scenes.length - 1) maxEnd = scenes[idx + 1].end - 0.1;
  }

  const activeDesktopScene = scenes.find((s) => s.index === selectedSceneIndex) || scenes[0];

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 pb-28 pt-4 px-4 max-w-7xl mx-auto flex flex-col gap-4">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-3 border-b border-[#1f242d]">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <h1 className="font-semibold text-sm tracking-wide text-neutral-100">Math Clipper Studio</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenFolder}
            className="text-[11px] px-2.5 py-1 rounded-md bg-[#12141a] hover:bg-[#181b22] text-neutral-300 hover:text-blue-400 border border-[#1f242d] transition-colors flex items-center gap-1.5"
            title="Open scenes folder on disk in file explorer"
          >
            <FolderOpen size={12} className="text-blue-400" />
            <span>Open Scenes Folder</span>
          </button>
          <button
            onClick={handleResetAudio}
            className="text-[11px] px-2.5 py-1 rounded-md bg-[#12141a] hover:bg-[#181b22] text-neutral-400 hover:text-rose-400 border border-[#1f242d] transition-colors"
            title="Remove current audio"
          >
            New Project / Change Audio
          </button>
          <div className="text-[11px] font-mono text-neutral-400 bg-[#12141a] px-2.5 py-1 rounded-md border border-[#1f242d]">
            Project: {projectId}
          </div>
        </div>
      </header>

      {/* Responsive Grid: Mobile stacked, Desktop (lg+) 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Audio Timeline & Scene List (lg: 7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <AudioTimeline
            projectId={projectId}
            duration={audioDuration}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onSplit={handleSplit}
            splits={splitPoints}
            seekTime={seekTime}
            clipRange={activeClipScene ? { start: activeClipScene.start, end: activeClipScene.end } : null}
            onSeekHandled={() => setSeekTime(null)}
            onClipEnded={() => setActiveClipScene(null)}
            onPlayStateChange={setIsPlaying}
            onResetAudio={handleResetAudio}
          />

          {/* Scenes Section Header */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
              <Layers size={14} className="text-blue-400" />
              <span>Timeline Scenes ({scenes.length})</span>
            </div>
            <button
              onClick={handleGenerateAll}
              className="text-xs px-2.5 py-1 rounded-lg bg-[#181b22] hover:bg-[#232834] text-blue-400 border border-[#2d3442] flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Sparkles size={12} />
              <span>Generate All</span>
            </button>
          </div>

          {/* Scenes Cards List */}
          <div className="flex flex-col gap-2.5">
            {scenes.map((scene, idx) => {
              const isPlayingThisScene =
                isPlaying && activeClipScene?.id === scene.id;

              return (
                <div
                  key={scene.id || scene.index}
                  onClick={() => setSelectedSceneIndex(scene.index)}
                  className={`cursor-pointer transition-all ${
                    selectedSceneIndex === scene.index ? 'ring-1 ring-blue-500/60 rounded-2xl' : ''
                  }`}
                >
                  <SceneCard
                    scene={scene}
                    projectId={projectId}
                    isLastScene={idx === scenes.length - 1}
                    canDelete={scenes.length > 1}
                    isPlayingThisScene={isPlayingThisScene}
                    onPlayScene={handlePlaySceneClip}
                    onEditScene={(sc) => setEditingScene(sc)}
                    onDeleteScene={handleDeleteScene}
                    onUpdate={handleUpdateScene}
                    onGenerate={handleGenerate}
                    onImportScene={handleImportScene}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Desktop Large Live Monitor & Inspector (lg: 5 cols) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col gap-3 sticky top-4">
          <div className="bg-[#12141a] border border-[#1f242d] rounded-2xl p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#1f242d] pb-2.5">
              <div className="flex items-center gap-2">
                <Eye size={15} className="text-blue-400" />
                <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
                  Live Visual Stage
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeDesktopScene && (
                  <span className="text-[11px] font-mono text-neutral-400">
                    Scene #{activeDesktopScene.index.toString().padStart(2, '0')} ({activeDesktopScene.duration.toFixed(1)}s)
                  </span>
                )}
                {activeDesktopScene?.status === 'ready' && (
                  <button
                    onClick={() => setIsFullscreenStage(true)}
                    className="p-1 rounded-md text-neutral-400 hover:text-blue-400 hover:bg-[#181b22] transition-colors"
                    title="View Fullscreen"
                  >
                    <Maximize2 size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* 16:9 Big Preview Screen */}
            <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#1f242d] bg-black shadow-inner flex items-center justify-center">
              {activeDesktopScene?.status === 'ready' ? (
                <iframe
                  src={`${API_BASE}/${projectId}/scenes/${activeDesktopScene.index}/preview?t=${Date.now()}`}
                  title={`Stage Scene ${activeDesktopScene.index}`}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="text-center p-6 text-neutral-500 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#181b22] border border-[#1f242d] flex items-center justify-center text-neutral-400">
                    <Sparkles size={18} />
                  </div>
                  <span className="text-xs">
                    {activeDesktopScene?.status === 'generating'
                      ? 'Generating Canvas animation...'
                      : 'Press "Gen" to create animation with OpenCode'}
                  </span>
                </div>
              )}
            </div>

            {/* Prompt Overview & Quick Refine in Inspector */}
            {activeDesktopScene && (
              <div className="flex flex-col gap-2 pt-1 text-xs">
                <div className="bg-[#090a0f] border border-[#1f242d] rounded-xl p-2.5">
                  <span className="text-[10px] text-neutral-500 font-semibold block uppercase mb-1">Visual Directive</span>
                  <p className="text-neutral-300 text-xs italic">
                    {activeDesktopScene.prompt_visual || 'No visual prompt specified yet.'}
                  </p>
                </div>

                {activeDesktopScene.status === 'ready' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Desktop Quick Refine..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                          handleGenerate(activeDesktopScene.index, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      className="flex-1 bg-[#090a0f] border border-[#1f242d] rounded-xl px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        if (input && input.value) {
                          handleGenerate(activeDesktopScene.index, input.value);
                          input.value = '';
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs active:scale-95 transition-all"
                    >
                      Refine
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Large Desktop Embedded Terminal */}
          <TerminalPanel
            logs={logs}
            onClearLogs={() => setLogs([])}
            isOpen={true}
            onToggleOpen={() => {}}
            isDesktopEmbedded={true}
          />
        </div>
      </div>

      {/* Fullscreen Stage Modal */}
      {isFullscreenStage && activeDesktopScene && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 px-2">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-sm text-blue-400">
                Scene #{activeDesktopScene.index.toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-neutral-400 font-mono">
                {activeDesktopScene.start.toFixed(1)}s - {activeDesktopScene.end.toFixed(1)}s ({activeDesktopScene.duration.toFixed(1)}s)
              </span>
            </div>
            <button
              onClick={() => setIsFullscreenStage(false)}
              className="p-1.5 rounded-lg bg-[#181b22] text-neutral-400 hover:text-white border border-[#2d3442] transition-colors"
              title="Close Fullscreen"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 w-full flex items-center justify-center rounded-2xl overflow-hidden border border-[#1f242d] bg-black">
            <iframe
              src={`${API_BASE}/${projectId}/scenes/${activeDesktopScene.index}/preview?t=${Date.now()}`}
              title={`Fullscreen Scene ${activeDesktopScene.index}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

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

      {/* Mobile Floating Terminal Panel */}
      <div className="lg:hidden fixed bottom-16 left-3 right-3 z-50">
        <TerminalPanel
          logs={logs}
          onClearLogs={() => setLogs([])}
          isOpen={showTerminal}
          onToggleOpen={() => setShowTerminal(false)}
          isDesktopEmbedded={false}
        />
      </div>

      {/* Bottom Render Bar */}
      <RenderBar
        projectId={projectId}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStatusMessage={renderStatusMessage}
        hasRenderedVideo={hasRenderedVideo}
        showTerminal={showTerminal}
        onToggleTerminal={() => setShowTerminal(!showTerminal)}
        onStartRender={handleStartRender}
      />
    </div>
  );
};

export default App;
