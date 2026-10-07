import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, Sparkles, Scissors } from 'lucide-react';

interface AudioTimelineProps {
  projectId: string;
  duration: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSplit: (time: number) => void;
  splits: number[];
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  projectId,
  duration,
  currentTime,
  onTimeUpdate,
  onSplit,
  splits,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTapPressed, setIsTapPressed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTime = () => onTimeUpdate(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
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
    setTimeout(() => setIsTapPressed(false), 200);

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
    <div className="flex flex-col bg-surface border border-border/80 rounded-2xl p-4 shadow-xl">
      <audio ref={audioRef} src={`/api/projects/${projectId}/audio`} preload="auto" />

      {/* Top Playback Controls & Time Display */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-primary hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-1" />}
        </button>

        <div className="text-right font-mono">
          <div className="text-2xl font-bold text-primary tracking-wider">
            {formatTime(currentTime)}
          </div>
          <div className="text-xs text-slate-400">
            Total: {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Visual Timeline Bar with Split Markers */}
      <div className="relative w-full my-3">
        <div className="relative h-6 bg-slate-950 rounded-lg overflow-hidden border border-border flex items-center">
          {/* Progress bar */}
          <div
            className="h-full bg-cyan-900/60 transition-all duration-75"
            style={{ width: `${(currentTime / Math.max(duration, 0.1)) * 100}%` }}
          />

          {/* Scene cut markers */}
          {splits.map((s, idx) => {
            const leftPct = (s / Math.max(duration, 0.1)) * 100;
            return (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${leftPct}%` }}
              >
                <div className="w-2 h-2 -ml-[3px] rounded-full bg-amber-400 -mt-1 shadow-sm" />
              </div>
            );
          })}
        </div>

        {/* Range Slider for Scrubbing */}
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

      {/* GIANT TAP TO SPLIT BUTTON (Mobile Optimized) */}
      <button
        onTouchStart={handleTapToSplit}
        onClick={handleTapToSplit}
        className={`w-full py-6 mt-2 rounded-2xl font-black text-xl tracking-wider uppercase transition-all duration-150 shadow-2xl flex items-center justify-center gap-3 ${
          isTapPressed
            ? 'scale-95 bg-amber-400 text-slate-950 ring-4 ring-amber-300'
            : 'bg-gradient-to-r from-cyan-500 via-teal-500 to-amber-500 text-slate-950 hover:brightness-110 active:scale-95'
        }`}
      >
        <Scissors size={28} className={isTapPressed ? 'rotate-45' : ''} />
        <span>TAP TO SPLIT SCENE</span>
      </button>
      <p className="text-center text-xs text-slate-400 mt-2 font-medium">
        Press button while audio plays to stamp cut markers in real time.
      </p>
    </div>
  );
};
