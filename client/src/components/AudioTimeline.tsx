import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Scissors, Volume2, Upload, RotateCcw } from 'lucide-react';
import { API_BASE } from '../services/api';

interface AudioTimelineProps {
  projectId: string;
  duration: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSplit: (time: number) => void;
  splits: number[];
  seekTime: number | null;
  clipRange: { start: number; end: number } | null;
  onSeekHandled: () => void;
  onClipEnded?: () => void;
  onPlayStateChange?: (playing: boolean) => void;
  onResetAudio?: () => void;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  projectId,
  duration,
  currentTime,
  onTimeUpdate,
  onSplit,
  splits,
  seekTime,
  clipRange,
  onSeekHandled,
  onClipEnded,
  onPlayStateChange,
  onResetAudio,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTapPressed, setIsTapPressed] = useState(false);

  useEffect(() => {
    if (seekTime !== null && audioRef.current) {
      audioRef.current.currentTime = seekTime;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
      onSeekHandled();
    }
  }, [seekTime, onSeekHandled]);

  useEffect(() => {
    let animId: number;

    const loop = () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        onTimeUpdate(audio.currentTime);

        // If playing a specific clipped scene, stop precisely at scene.end
        if (clipRange && audio.currentTime >= clipRange.end) {
          audio.pause();
          audio.currentTime = clipRange.start;
          onTimeUpdate(clipRange.start);
          setIsPlaying(false);
          onPlayStateChange?.(false);
          onClipEnded?.();
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    const audio = audioRef.current;
    if (!audio) return () => cancelAnimationFrame(animId);

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
      onClipEnded?.();
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      cancelAnimationFrame(animId);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onPlayStateChange, clipRange, onClipEnded]);

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
    <div className="flex flex-col bg-[#12141a] border border-[#1f242d] rounded-2xl p-4 shadow-xl">
      <audio
        ref={audioRef}
        src={`${API_BASE}/${projectId}/audio`}
        preload="auto"
        playsInline
      />

      {/* Top Header: Play Button & Time Display & Remove Audio */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-md active:scale-95 transition-all"
            title="Play / Pause"
          >
            {isPlaying ? <Pause size={19} /> : <Play size={19} className="ml-0.5" />}
          </button>

          {onResetAudio && (
            <button
              onClick={onResetAudio}
              className="px-2.5 py-1.5 rounded-lg bg-[#181b22] hover:bg-[#232834] text-neutral-400 hover:text-rose-400 border border-[#2d3442] text-[11px] font-medium transition-all flex items-center gap-1.5"
              title="Remove current audio and upload another"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Change Audio</span>
            </button>
          )}
        </div>

        <div className="text-right font-mono">
          <div className="text-xl font-semibold text-neutral-100 tracking-tight">
            {formatTime(currentTime)}
          </div>
          <div className="text-[11px] text-neutral-400">
            Total {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* Scrubber Bar */}
      <div className="relative w-full my-2">
        <div className="relative h-2.5 bg-[#090a0f] rounded-full overflow-hidden border border-[#1f242d] flex items-center">
          <div
            className="h-full bg-blue-500 transition-all duration-75"
            style={{ width: `${(currentTime / Math.max(duration, 0.1)) * 100}%` }}
          />

          {splits.map((s, idx) => (
            <div
              key={idx}
              className="absolute top-0 bottom-0 w-[2px] bg-neutral-400 z-10"
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
        className={`w-full py-3.5 mt-2 rounded-xl font-bold text-xs tracking-widest uppercase transition-all duration-100 flex items-center justify-center gap-2 ${
          isTapPressed
            ? 'scale-[0.98] bg-blue-600 text-white'
            : 'bg-[#181b22] hover:bg-[#1f242d] text-neutral-200 border border-[#2d3442]'
        }`}
      >
        <Scissors size={15} className={isTapPressed ? 'rotate-45 text-white' : 'text-blue-400'} />
        <span>Tap to Split Scene</span>
      </button>
    </div>
  );
};
