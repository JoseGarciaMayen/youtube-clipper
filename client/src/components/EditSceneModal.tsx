import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, RotateCcw, Check, Volume2 } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(scene.start);
  const [start, setStart] = useState(scene.start);
  const [end, setEnd] = useState(scene.end);

  useEffect(() => {
    setStart(scene.start);
    setEnd(scene.end);
    setCurrentPlayTime(scene.start);
    setIsPlaying(false);
  }, [scene]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => {
      setCurrentPlayTime(audio.currentTime);
      // Auto loop or stop at scene end
      if (audio.currentTime >= end) {
        audio.currentTime = start;
        audio.play().catch(() => {});
      }
    };

    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [start, end]);

  if (!isOpen) return null;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current.currentTime < start || audioRef.current.currentTime >= end) {
        audioRef.current.currentTime = start;
      }
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleStartChange = (val: number) => {
    const newStart = Math.max(minStart, Math.min(val, end - 0.2));
    setStart(parseFloat(newStart.toFixed(2)));
    if (audioRef.current) {
      audioRef.current.currentTime = newStart;
    }
  };

  const handleEndChange = (val: number) => {
    const newEnd = Math.min(maxEnd, Math.max(val, start + 0.2));
    setEnd(parseFloat(newEnd.toFixed(2)));
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const duration = end - start;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4">
      <audio
        ref={audioRef}
        src={`${API_BASE}/${projectId}/audio`}
        preload="auto"
      />

      <div className="bg-[#12141a] border border-[#1f242d] w-full max-w-md rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#1f242d] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 font-mono font-bold text-base">Scene #{scene.index.toString().padStart(2, '0')}</span>
            <span className="text-xs text-neutral-400">Precision Trim</span>
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

        {/* Audio Player & Loop Control */}
        <div className="bg-[#090a0f] border border-[#1f242d] rounded-xl p-3 flex items-center justify-between">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>

          <div className="flex flex-col text-right font-mono">
            <span className="text-sm font-semibold text-neutral-100">
              {formatTime(currentPlayTime)}
            </span>
            <span className="text-[11px] text-blue-400">
              Loop duration: {duration.toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Start Slider & Nudges */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-neutral-400 font-medium">Start Timestamp</span>
            <span className="font-mono text-neutral-200">{start.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={minStart}
            max={end - 0.2}
            step="0.05"
            value={start}
            onChange={(e) => handleStartChange(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-[#1f242d] rounded-lg"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => handleStartChange(start - 0.1)}
              className="px-2 py-0.5 rounded bg-[#1f242d] hover:bg-[#2d3748] text-[11px] font-mono text-neutral-300"
            >
              -0.1s
            </button>
            <button
              onClick={() => handleStartChange(start + 0.1)}
              className="px-2 py-0.5 rounded bg-[#1f242d] hover:bg-[#2d3748] text-[11px] font-mono text-neutral-300"
            >
              +0.1s
            </button>
          </div>
        </div>

        {/* End Slider & Nudges */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-neutral-400 font-medium">End Timestamp</span>
            <span className="font-mono text-neutral-200">{end.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={start + 0.2}
            max={maxEnd}
            step="0.05"
            value={end}
            onChange={(e) => handleEndChange(parseFloat(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer h-1.5 bg-[#1f242d] rounded-lg"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => handleEndChange(end - 0.1)}
              className="px-2 py-0.5 rounded bg-[#1f242d] hover:bg-[#2d3748] text-[11px] font-mono text-neutral-300"
            >
              -0.1s
            </button>
            <button
              onClick={() => handleEndChange(end + 0.1)}
              className="px-2 py-0.5 rounded bg-[#1f242d] hover:bg-[#2d3748] text-[11px] font-mono text-neutral-300"
            >
              +0.1s
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-[#1f242d] hover:bg-[#2d3748] text-neutral-300 text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
          >
            <Check size={14} />
            <span>Apply Trim</span>
          </button>
        </div>
      </div>
    </div>
  );
};
