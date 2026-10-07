import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Scissors, Volume2 } from 'lucide-react';
import { API_BASE } from '../services/api';

interface AudioTimelineProps {
  projectId: string;
  duration: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSplit: (time: number) => void;
  splits: number[];
  seekTime: number | null;
  onSeekHandled: () => void;
  onPlayStateChange?: (playing: boolean) => void;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  projectId,
  duration,
  currentTime,
  onTimeUpdate,
  onSplit,
  splits,
  seekTime,
  onSeekHandled,
  onPlayStateChange,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTapPressed, setIsTapPressed] = useState(false);

  // Sync seek requests from scene clicks
  useEffect(() => {
    if (seekTime !== null && audioRef.current) {
      audioRef.current.currentTime = seekTime;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      onSeekHandled();
    }
  }, [seekTime, onSeekHandled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => onTimeUpdate(audio.currentTime);
    const handlePlay = () => {
      setIsPlaying(true);
      onPlayStateChange?.(true);
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      onPlayStateChange?.(false);
    };

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onPlayStateChange]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    onTimeUpdate(time);
  };

  const handleTapToSplit = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsTapPressed(true);
    setTimeout(() => setIsTapPressed(false), 150);

    const time = audioRef.current ? audioRef.current.currentTime : currentTime;
    onSplit(time);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="flex flex-col bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-sm">
      <audio
        ref={audioRef}
        src={`${API_BASE}/${projectId}/audio`}
        preload="auto"
        playsInline
      />

      {/* Top Header: Play Button & Time Display */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-md shadow-cyan-500/10 active:scale-95 transition-all"
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>

        <div className="text-right font-mono">
          <div className="text-xl font-semibold text-slate-100 tracking-tight">
            {formatTime(currentTime)}
          </div>
          <div className="text-[11px] text-slate-500">
            Total {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Minimal Scrubber Bar */}
      <div className="relative w-full my-2">
        <div className="relative h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex items-center">
          <div
            className="h-full bg-cyan-500 transition-all duration-75"
            style={{ width: `${(currentTime / Math.max(duration, 0.1)) * 100}%` }}
          />

          {splits.map((s, idx) => (
            <div
              key={idx}
              className="absolute top-0 bottom-0 w-[2px] bg-amber-400 z-10"
              style={{ left: `${(s / Math.max(duration, 0.1)) * 100}%` }}
            />
          ))}
        </div>

        <input
          type="range"
          min="0"
          max={duration || 100}
          step="0.05"
          value={currentTime}
          onChange={handleSeek}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Sleek Tap To Split Button */}
      <button
        onTouchStart={handleTapToSplit}
        onClick={handleTapToSplit}
        className={`w-full py-4 mt-2 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2.5 ${
          isTapPressed
            ? 'scale-[0.98] bg-amber-400 text-slate-950'
            : 'bg-slate-800 hover:bg-slate-700 active:bg-cyan-400 active:text-slate-950 text-slate-200 border border-slate-700/60'
        }`}
      >
        <Scissors size={18} className={isTapPressed ? 'rotate-45 text-slate-950' : 'text-cyan-400'} />
        <span>Tap to Split Scene</span>
      </button>
    </div>
  );
};
