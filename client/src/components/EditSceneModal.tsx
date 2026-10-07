import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, Check, Volume2, MoveHorizontal, ChevronLeft, ChevronRight, Activity, Repeat } from 'lucide-react';
import { SceneItem } from '../types';
import { API_BASE } from '../services/api';

interface EditSceneModalProps {
  scene: SceneItem;
  projectId: string;
  minStart: number;
  maxEnd: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: SceneItem) => void;
}

export const EditSceneModal: React.FC<EditSceneModalProps> = ({
  scene,
  projectId,
  minStart,
  maxEnd,
  isOpen,
  onClose,
  onSave,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(scene.start);
  const [start, setStart] = useState(scene.start);
  const [end, setEnd] = useState(scene.end);

  // AudioBuffer for waveform extraction
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);

  // Zoomed window state (defaults to ~12s around scene)
  const WINDOW_SPAN = 12;
  const [windowCenter, setWindowCenter] = useState((scene.start + scene.end) / 2);

  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'playhead' | null>(null);

  // Fetch & decode audio file for waveform rendering
  useEffect(() => {
    if (!isOpen || !projectId) return;

    let isMounted = true;
    setIsLoadingWaveform(true);

    fetch(`${API_BASE}/${projectId}/audio`)
      .then((res) => res.arrayBuffer())
      .then((arrayBuffer) => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioCtx.decodeAudioData(arrayBuffer);
      })
      .then((decoded) => {
        if (isMounted) {
          setAudioBuffer(decoded);
          setIsLoadingWaveform(false);
        }
      })
      .catch((err) => {
        console.warn('Could not decode audio data for waveform:', err);
        if (isMounted) setIsLoadingWaveform(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId]);

  useEffect(() => {
    setStart(scene.start);
    setEnd(scene.end);
    setCurrentPlayTime(scene.start);
    setWindowCenter((scene.start + scene.end) / 2);
    setIsPlaying(false);
  }, [scene]);

  useEffect(() => {
    let animId: number;

    const updateLoop = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const ct = audio.currentTime;
        setCurrentPlayTime(ct);

        // Auto scroll viewport window smoothly if playhead gets close to edge
        if (ct > windowCenter + WINDOW_SPAN / 2 - 1.5) {
          setWindowCenter(ct);
        }

        // Stop or loop precisely within clip range
        if (ct >= end) {
          if (isLooping) {
            audio.currentTime = start;
            setCurrentPlayTime(start);
            audio.play().catch(() => {});
          } else {
            audio.pause();
            audio.currentTime = start;
            setCurrentPlayTime(start);
            setIsPlaying(false);
          }
        }
      }
      animId = requestAnimationFrame(updateLoop);
    };

    animId = requestAnimationFrame(updateLoop);

    const audio = audioRef.current;
    const handleEnded = () => setIsPlaying(false);
    if (audio) {
      audio.addEventListener('ended', handleEnded);
    }

    return () => {
      cancelAnimationFrame(animId);
      if (audio) {
        audio.removeEventListener('ended', handleEnded);
      }
    };
  }, [start, end, windowCenter, isLooping]);

  // Viewport calculation
  const winStart = Math.max(minStart, windowCenter - WINDOW_SPAN / 2);
  const winEnd = Math.min(maxEnd, winStart + WINDOW_SPAN);
  const currentSpan = Math.max(winEnd - winStart, 1);

  // Draw the waveform whenever window or audioBuffer updates
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioBuffer) return;

    // Use actual client bounding rect for crisp 1:1 pixel rendering
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(rect.width || 600, 300);
    const height = Math.max(rect.height || 96, 60);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const startSample = Math.floor(winStart * sampleRate);
    const endSample = Math.floor(winEnd * sampleRate);
    const totalSamplesInView = endSample - startSample;

    if (totalSamplesInView <= 0) return;

    const samplesPerPixel = Math.max(1, Math.floor(totalSamplesInView / width));
    const centerY = height / 2;

    // First pass: find maximum peak in this visible window for dynamic normalization / amplification
    let maxVisiblePeak = 0.05;
    const stepCheck = Math.max(1, Math.floor(totalSamplesInView / 1000));
    for (let s = Math.max(0, startSample); s < Math.min(channelData.length, endSample); s += stepCheck) {
      const a = Math.abs(channelData[s]);
      if (a > maxVisiblePeak) maxVisiblePeak = a;
    }
    // Boost factor: target at least 85% height for the loudest syllable in view
    const boostMultiplier = Math.min(5.0, Math.max(1.8, 0.85 / maxVisiblePeak));

    // Draw center baseline
    ctx.fillStyle = '#1e242d';
    ctx.fillRect(0, centerY - 0.5, width, 1);

    for (let x = 0; x < width; x++) {
      const idx = startSample + x * samplesPerPixel;
      if (idx < 0 || idx >= channelData.length) continue;

      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < samplesPerPixel; j += Math.max(1, Math.floor(samplesPerPixel / 12))) {
        const val = channelData[idx + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const rawAmp = Math.max(Math.abs(min), Math.abs(max));
      const amplifiedAmp = Math.min(1.0, rawAmp * boostMultiplier);
      const barHeight = Math.max(2, amplifiedAmp * (height - 8));
      const y = centerY - barHeight / 2;

      // Color variation: highlight inside [start, end]
      const curTime = winStart + (x / width) * currentSpan;
      if (curTime >= start && curTime <= end) {
        ctx.fillStyle = '#60a5fa'; // Bright active clip wave
      } else {
        ctx.fillStyle = '#1f2937'; // Subdued outside clip
      }

      ctx.fillRect(x, y, 1.5, barHeight);
    }
  }, [audioBuffer, winStart, winEnd, start, end, currentSpan]);

  if (!isOpen) return null;

  const timeToPct = (t: number) => {
    return Math.max(0, Math.min(100, ((t - winStart) / currentSpan) * 100));
  };

  const pctToTime = (pct: number) => {
    return winStart + (pct / 100) * currentSpan;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current.currentTime < start || audioRef.current.currentTime >= end) {
        audioRef.current.currentTime = start;
        setCurrentPlayTime(start);
      }
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handlePointerDown = (handle: 'start' | 'end' | 'playhead') => (e: React.PointerEvent) => {
    e.preventDefault();
    setDraggingHandle(handle);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingHandle || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = (x / rect.width) * 100;
    // Continuous continuous precision (not quantized/choppy)
    const targetTime = pctToTime(pct);

    if (draggingHandle === 'start') {
      const newStart = Math.max(minStart, Math.min(targetTime, end - 0.1));
      setStart(newStart);
      if (audioRef.current && !isPlaying) {
        audioRef.current.currentTime = newStart;
        setCurrentPlayTime(newStart);
      }
    } else if (draggingHandle === 'end') {
      const newEnd = Math.min(maxEnd, Math.max(targetTime, start + 0.1));
      setEnd(newEnd);
    } else if (draggingHandle === 'playhead') {
      const clamped = Math.max(start, Math.min(targetTime, end));
      if (audioRef.current) {
        audioRef.current.currentTime = clamped;
        setCurrentPlayTime(clamped);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingHandle) {
      setDraggingHandle(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const shiftWindow = (seconds: number) => {
    setWindowCenter((prev) => Math.max(minStart + WINDOW_SPAN / 2, Math.min(maxEnd - WINDOW_SPAN / 2, prev + seconds)));
  };

  const handleSave = () => {
    if (audioRef.current) audioRef.current.pause();
    onSave({
      ...scene,
      start,
      end,
      duration: parseFloat((end - start).toFixed(2)),
    });
    onClose();
  };

  const duration = end - start;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4">
      <audio
        ref={audioRef}
        src={`${API_BASE}/${projectId}/audio`}
        preload="auto"
      />

      <div className="bg-[#12141a] border border-[#1f242d] w-full max-w-xl rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1f242d] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 font-mono font-bold text-base">Scene #{scene.index.toString().padStart(2, '0')}</span>
            <span className="text-xs text-neutral-400">Audio Waveform Precision Trim</span>
          </div>
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="p-1 rounded-lg text-neutral-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Audio Player & Loop Status */}
        <div className="bg-[#090a0f] border border-[#1f242d] rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
              title="Play audio clip"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            <button
              onClick={() => setIsLooping(!isLooping)}
              className={`p-2 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${
                isLooping
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[#181b22] text-neutral-400 border-[#2d3442] hover:text-neutral-200'
              }`}
              title={isLooping ? 'Looping enabled' : 'Click to enable loop'}
            >
              <Repeat size={13} />
              <span className="text-[11px]">{isLooping ? 'Loop ON' : 'Loop OFF'}</span>
            </button>
          </div>

          <div className="flex flex-col text-right font-mono">
            <span className="text-sm font-semibold text-neutral-100">
              {formatTime(currentPlayTime)}
            </span>
            <span className="text-[11px] text-blue-400 font-medium">
              Duration: {duration.toFixed(2)}s ({start.toFixed(2)}s ➔ {end.toFixed(2)}s)
            </span>
          </div>
        </div>

        {/* Zoomed Timeline Track with REAL AUDIO WAVEFORM */}
        <div className="flex flex-col gap-1.5 select-none">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <button
              onClick={() => shiftWindow(-4)}
              className="px-2 py-0.5 rounded bg-[#181b22] hover:bg-[#232834] flex items-center gap-1 text-neutral-300"
              title="Pan left"
            >
              <ChevronLeft size={12} /> -4s
            </button>
            <span className="text-neutral-500 flex items-center gap-1.5">
              <Activity size={12} className="text-blue-400" />
              {isLoadingWaveform ? 'Decoding waveform...' : `Window: ${winStart.toFixed(1)}s — ${winEnd.toFixed(1)}s`}
            </span>
            <button
              onClick={() => shiftWindow(4)}
              className="px-2 py-0.5 rounded bg-[#181b22] hover:bg-[#232834] flex items-center gap-1 text-neutral-300"
              title="Pan right"
            >
              +4s <ChevronRight size={12} />
            </button>
          </div>

          {/* Interactive Multi-Handle Track with Canvas Waveform */}
          <div
            ref={trackRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative h-24 bg-[#090a0f] rounded-xl border border-[#1f242d] overflow-hidden cursor-crosshair touch-none"
          >
            {/* Real Waveform Canvas */}
            <canvas
              ref={waveformCanvasRef}
              width={600}
              height={96}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Timeline Tick Marks (every 1 second) */}
            <div className="absolute inset-0 pointer-events-none flex justify-between px-2 opacity-25">
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} className="h-full w-[1px] bg-neutral-500 flex flex-col justify-between py-1">
                  <span className="text-[8px] font-mono text-neutral-400 -ml-2">
                    {(winStart + (i * currentSpan) / 10).toFixed(0)}s
                  </span>
                </div>
              ))}
            </div>

            {/* Active Scene Highlight Tint */}
            <div
              className="absolute top-0 bottom-0 bg-blue-500/10 border-t-2 border-b-2 border-blue-500/60 pointer-events-none"
              style={{
                left: `${timeToPct(start)}%`,
                width: `${Math.max(0, timeToPct(end) - timeToPct(start))}%`,
              }}
            />

            {/* Left Boundary Handle (Start) */}
            <div
              onPointerDown={handlePointerDown('start')}
              className="absolute top-0 bottom-0 w-5 -ml-2.5 z-20 cursor-ew-resize flex items-center justify-center group"
              style={{ left: `${timeToPct(start)}%` }}
            >
              <div className="w-1.5 h-full bg-blue-500 rounded-sm group-hover:bg-blue-400 shadow-md flex items-center justify-center">
                <div className="w-0.5 h-5 bg-white/70 rounded" />
              </div>
              <div className="absolute -top-5 font-mono text-[9px] bg-blue-600 text-white px-1 rounded pointer-events-none whitespace-nowrap shadow">
                {start.toFixed(2)}s
              </div>
            </div>

            {/* Right Boundary Handle (End) */}
            <div
              onPointerDown={handlePointerDown('end')}
              className="absolute top-0 bottom-0 w-5 -ml-2.5 z-20 cursor-ew-resize flex items-center justify-center group"
              style={{ left: `${timeToPct(end)}%` }}
            >
              <div className="w-1.5 h-full bg-blue-500 rounded-sm group-hover:bg-blue-400 shadow-md flex items-center justify-center">
                <div className="w-0.5 h-5 bg-white/70 rounded" />
              </div>
              <div className="absolute -top-5 font-mono text-[9px] bg-blue-600 text-white px-1 rounded pointer-events-none whitespace-nowrap shadow">
                {end.toFixed(2)}s
              </div>
            </div>

            {/* Red Playhead Line */}
            <div
              onPointerDown={handlePointerDown('playhead')}
              className="absolute top-0 bottom-0 w-3 -ml-1.5 z-30 cursor-pointer flex items-center justify-center pointer-events-auto"
              style={{ left: `${timeToPct(currentPlayTime)}%` }}
            >
              <div className="w-[2px] h-full bg-rose-500 shadow-sm" />
              <div className="absolute top-0 w-2.5 h-2.5 -mt-1 bg-rose-500 rotate-45" />
            </div>
          </div>

          <span className="text-[10px] text-neutral-500 text-center">
            Audio waveform synchronized with visible window. Drag handles to trim with phonetic precision.
          </span>
        </div>

        {/* Nudge Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Start Nudge */}
          <div className="bg-[#090a0f] border border-[#1f242d] rounded-xl p-2.5 flex flex-col gap-1.5">
            <span className="text-[11px] text-neutral-400 font-medium">Start: <span className="font-mono text-neutral-200">{start.toFixed(2)}s</span></span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setStart((prev) => Math.max(minStart, parseFloat((prev - 0.1).toFixed(2))))}
                className="flex-1 py-1 rounded bg-[#181b22] hover:bg-[#232834] text-xs font-mono text-neutral-300"
              >
                -0.1s
              </button>
              <button
                onClick={() => setStart((prev) => Math.min(end - 0.2, parseFloat((prev + 0.1).toFixed(2))))}
                className="flex-1 py-1 rounded bg-[#181b22] hover:bg-[#232834] text-xs font-mono text-neutral-300"
              >
                +0.1s
              </button>
            </div>
          </div>

          {/* End Nudge */}
          <div className="bg-[#090a0f] border border-[#1f242d] rounded-xl p-2.5 flex flex-col gap-1.5">
            <span className="text-[11px] text-neutral-400 font-medium">End: <span className="font-mono text-neutral-200">{end.toFixed(2)}s</span></span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setEnd((prev) => Math.max(start + 0.2, parseFloat((prev - 0.1).toFixed(2))))}
                className="flex-1 py-1 rounded bg-[#181b22] hover:bg-[#232834] text-xs font-mono text-neutral-300"
              >
                -0.1s
              </button>
              <button
                onClick={() => setEnd((prev) => Math.min(maxEnd, parseFloat((prev + 0.1).toFixed(2))))}
                className="flex-1 py-1 rounded bg-[#181b22] hover:bg-[#232834] text-xs font-mono text-neutral-300"
              >
                +0.1s
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#1f242d]">
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-300 text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md"
          >
            <Check size={14} />
            <span>Apply Trim</span>
          </button>
        </div>
      </div>
    </div>
  );
};
