import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2, Minimize2, X, Sparkles, Layers } from 'lucide-react';
import { SceneItem } from '../types';
import { API_BASE } from '../services/api';

interface FullscreenPlayerProps {
  projectId: string;
  projectName?: string;
  scenes: SceneItem[];
  duration: number;
  initialTime: number;
  isOpen: boolean;
  onClose: (finalTime: number) => void;
}

export const FullscreenPlayer: React.FC<FullscreenPlayerProps> = ({
  projectId,
  projectName,
  scenes,
  duration,
  initialTime,
  isOpen,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(Date.now());
  const lastActiveSceneIndex = useRef<number | null>(null);

  // Determine current active scene based on currentTime
  const activeScene = scenes.find((s) => currentTime >= s.start && currentTime < s.end) || scenes[scenes.length - 1] || scenes[0];

  // When activeScene index changes during playback, refresh iframe so animation starts
  useEffect(() => {
    if (activeScene && activeScene.index !== lastActiveSceneIndex.current) {
      lastActiveSceneIndex.current = activeScene.index;
      setIframeKey(Date.now());
    }
  }, [activeScene?.index]);

  // Audio initialization and continuous sync
  useEffect(() => {
    if (!isOpen) return;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = initialTime;
      setCurrentTime(initialTime);
      audio.volume = isMuted ? 0 : volume;
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Audio autoplay blocked, user interaction required:', e);
        setIsPlaying(false);
      });
    }

    let animId: number;
    const syncLoop = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setCurrentTime(audioRef.current.currentTime);
      }
      animId = requestAnimationFrame(syncLoop);
    };
    animId = requestAnimationFrame(syncLoop);

    return () => {
      cancelAnimationFrame(animId);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [isOpen, initialTime]);

  // Mouse activity timer for hiding controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-3);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(3);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPlaying, currentTime]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const seekTo = (time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
    setIframeKey(Date.now());
  };

  const seekRelative = (delta: number) => {
    seekTo(currentTime + delta);
  };

  const goToPrevScene = () => {
    if (!activeScene) return;
    const currentIdx = scenes.findIndex((s) => s.index === activeScene.index);
    if (currentIdx > 0) {
      seekTo(scenes[currentIdx - 1].start);
    } else {
      seekTo(0);
    }
  };

  const goToNextScene = () => {
    if (!activeScene) return;
    const currentIdx = scenes.findIndex((s) => s.index === activeScene.index);
    if (currentIdx < scenes.length - 1) {
      seekTo(scenes[currentIdx + 1].start);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      setIsMuted(false);
      audioRef.current.volume = volume || 0.5;
    } else {
      setIsMuted(true);
      audioRef.current.volume = 0;
    }
  };

  const handleClose = () => {
    const finalTime = audioRef.current ? audioRef.current.currentTime : currentTime;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    onClose(finalTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black select-none flex flex-col justify-between overflow-hidden cursor-default"
    >
      {/* Hidden audio element synced with project voiceover */}
      <audio
        ref={audioRef}
        src={`${API_BASE}/${projectId}/audio`}
        onEnded={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
      />

      {/* Top Header Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent transition-opacity duration-300 flex items-center justify-between ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/80 animate-pulse" />
          <h2 className="text-sm font-semibold text-white tracking-wide">
            {projectName || 'Math Clipper Studio'}
          </h2>
          {activeScene && (
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <span className="text-xs font-mono font-bold text-blue-400">
                Escena #{activeScene.index.toString().padStart(2, '0')} / {scenes.length}
              </span>
              <span className="text-[11px] font-mono text-neutral-400">
                ({formatTime(activeScene.start)} - {formatTime(activeScene.end)})
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleClose}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white backdrop-blur-md transition-colors"
          title="Salir de pantalla completa (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Visual Display (16:9 Canvas or Scene Placeholder) */}
      <div
        onClick={togglePlay}
        className="flex-1 w-full h-full flex items-center justify-center relative cursor-pointer bg-[#05060a]"
      >
        {activeScene?.status === 'ready' ? (
          <iframe
            key={`${activeScene.index}-${iframeKey}`}
            src={`${API_BASE}/${projectId}/scenes/${activeScene.index}/preview?t=${iframeKey}`}
            title={`Fullscreen Scene ${activeScene.index}`}
            className="w-full h-full border-0 pointer-events-none"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="text-center p-8 text-neutral-400 max-w-xl flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#12141a] border border-[#1f242d] flex items-center justify-center text-blue-400">
              <Sparkles size={28} />
            </div>
            <h3 className="text-lg font-bold text-neutral-200">
              Escena #{activeScene ? activeScene.index : 1}
            </h3>
            {activeScene?.prompt_visual && (
              <p className="text-xs text-neutral-300 italic bg-[#12141a]/80 p-3 rounded-xl border border-[#1f242d]">
                "{activeScene.prompt_visual}"
              </p>
            )}
            <span className="text-[11px] font-mono text-neutral-500">
              {activeScene?.status === 'generating'
                ? 'Generando animación Canvas con OpenCode...'
                : 'Esta escena aún no ha sido generada. El audio sigue reproduciéndose.'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 flex flex-col gap-3 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Timeline with Scene Cut Markers */}
        <div className="relative w-full flex flex-col gap-1 group/slider">
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seekTo(percent * duration);
            }}
            className="relative w-full h-2.5 bg-neutral-800/80 hover:h-3 rounded-full overflow-hidden cursor-pointer transition-all border border-neutral-700/40"
          >
            {/* Played track */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-blue-500 transition-[width] duration-75"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />

            {/* Scene divider tick marks */}
            {scenes.map((s, i) => {
              if (i === 0) return null;
              const posPercent = duration > 0 ? (s.start / duration) * 100 : 0;
              return (
                <div
                  key={s.index}
                  className="absolute top-0 bottom-0 w-0.5 bg-white/70 pointer-events-none"
                  style={{ left: `${posPercent}%` }}
                  title={`Corte Escena #${s.index}`}
                />
              );
            })}
          </div>

          {/* Time & Scene Quick Labels below scrubber */}
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 px-0.5">
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
            {activeScene && (
              <span className="text-neutral-400 text-[10px]">
                Escena {activeScene.index} de {scenes.length}
              </span>
            )}
          </div>
        </div>

        {/* Playback Controls & Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Prev scene */}
            <button
              onClick={goToPrevScene}
              className="p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Escena anterior"
            >
              <SkipBack size={18} />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg active:scale-95 transition-all"
              title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="translate-x-0.5" />}
            </button>

            {/* Next scene */}
            <button
              onClick={goToNextScene}
              className="p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Siguiente escena"
            >
              <SkipForward size={18} />
            </button>

            {/* Volume control */}
            <div className="flex items-center gap-2 pl-3 border-l border-white/10">
              <button
                onClick={toggleMute}
                className="text-neutral-300 hover:text-white transition-colors"
                title={isMuted ? 'Activar sonido' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 accent-blue-500 h-1 bg-neutral-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Minimize2 size={14} />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
