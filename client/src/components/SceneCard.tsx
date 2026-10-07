import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Sparkles, RefreshCw, Eye, Check, AlertCircle, Play, Pause, ChevronDown, ChevronUp } from 'lucide-react';
import { SceneItem } from '../types';
import { API_BASE } from '../services/api';

interface SceneCardProps {
  scene: SceneItem;
  projectId: string;
  isPlayingThisScene: boolean;
  onPlayScene: (start: number) => void;
  onUpdate: (updated: SceneItem) => void;
  onGenerate: (sceneIdx: number, refinement?: string) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  projectId,
  isPlayingThisScene,
  onPlayScene,
  onUpdate,
  onGenerate,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [activeSpeechField, setActiveSpeechField] = useState<'voice' | 'visual'>('visual');
  const [refinementText, setRefinementText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setSpeechSupported(true);
    }
  }, []);

  const toggleSpeechRecognition = (field: 'voice' | 'visual') => {
    if (!speechSupported) {
      alert('Speech API not supported on this browser. Please type manually.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    setActiveSpeechField(field);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (field === 'voice') {
        onUpdate({ ...scene, prompt_voice: (scene.prompt_voice ? scene.prompt_voice + ' ' : '') + transcript });
      } else {
        onUpdate({ ...scene, prompt_visual: (scene.prompt_visual ? scene.prompt_visual + ' ' : '') + transcript });
      }
    };

    recognition.start();
  };

  const statusIndicators = {
    pending: <span className="w-2 h-2 rounded-full bg-slate-600" title="Pending" />,
    generating: <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" title="Generating" />,
    ready: <span className="w-2 h-2 rounded-full bg-emerald-400" title="Ready" />,
    error: <span className="w-2 h-2 rounded-full bg-rose-500" title="Error" />,
  };

  return (
    <div className={`bg-slate-900/40 border rounded-2xl p-3.5 transition-all backdrop-blur-sm ${
      isPlayingThisScene ? 'border-cyan-500/70 ring-1 ring-cyan-500/30' : 'border-slate-800/80 hover:border-slate-700'
    }`}>
      {/* Minimal Header */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Play Scene Audio Button & Tag */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onPlayScene(scene.start)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isPlayingThisScene
                ? 'bg-cyan-400 text-slate-950 scale-105 shadow-sm shadow-cyan-400/20'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title="Listen to this clipped audio segment"
          >
            {isPlayingThisScene ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>

          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-sm font-bold text-slate-200">#{scene.index.toString().padStart(2, '0')}</span>
            <span className="text-xs text-slate-400">
              {scene.start.toFixed(1)}s - {scene.end.toFixed(1)}s
            </span>
            <span className="text-xs text-amber-400/90 font-medium">({scene.duration.toFixed(1)}s)</span>
          </div>
        </div>

        {/* Right: Status badge & Toggle Details */}
        <div className="flex items-center gap-2">
          {statusIndicators[scene.status]}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Main Visual Prompt (Always visible in 1 clean line or expanded) */}
      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="text"
          value={scene.prompt_visual}
          placeholder="Visual prompt: e.g. 3D hyperbolic graph..."
          onChange={(e) => onUpdate({ ...scene, prompt_visual: e.target.value })}
          className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/80"
        />

        <button
          onClick={() => toggleSpeechRecognition('visual')}
          className={`p-2 rounded-xl border text-xs transition-all ${
            isListening && activeSpeechField === 'visual'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500 animate-pulse'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-cyan-400'
          }`}
          title="Dictate visual prompt"
        >
          {isListening && activeSpeechField === 'visual' ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        <button
          onClick={() => onGenerate(scene.index)}
          disabled={scene.status === 'generating'}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-500 active:text-slate-950 text-cyan-400 font-medium text-xs border border-slate-700/60 disabled:opacity-50 transition-all flex items-center gap-1.5"
          title="Generate with OpenCode"
        >
          <Sparkles size={13} />
          <span className="hidden sm:inline">{scene.status === 'ready' ? 'Redo' : 'Gen'}</span>
        </button>

        {scene.status === 'ready' && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-xs transition-all"
            title="Preview animation"
          >
            <Eye size={14} />
          </button>
        )}
      </div>

      {/* Expanded Details: Narration cue & Refinement */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-col gap-2.5 text-xs">
          {/* Narration Cue */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500 font-medium">Audio Narration Cue</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={scene.prompt_voice}
                placeholder="Spoken words in this clip..."
                onChange={(e) => onUpdate({ ...scene, prompt_voice: e.target.value })}
                className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/80"
              />
              <button
                onClick={() => toggleSpeechRecognition('voice')}
                className={`p-2 rounded-xl border ${
                  isListening && activeSpeechField === 'voice'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500 animate-pulse'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
              >
                {isListening && activeSpeechField === 'voice' ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {showPreview && scene.status === 'ready' && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black">
            <iframe
              src={`${API_BASE}/${projectId}/scenes/${scene.index}/preview?t=${Date.now()}`}
              title={`Preview Scene ${scene.index}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Refine: Make wave curve faster..."
              value={refinementText}
              onChange={(e) => setRefinementText(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={() => {
                if (refinementText) {
                  onGenerate(scene.index, refinementText);
                  setRefinementText('');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-semibold text-xs active:scale-95 transition-all"
            >
              Refine
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
