import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Sparkles, RefreshCw, Eye, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { SceneItem } from '../types';
import { API_BASE } from '../services/api';

interface SceneCardProps {
  scene: SceneItem;
  projectId: string;
  onUpdate: (updated: SceneItem) => void;
  onGenerate: (sceneIdx: number, refinement?: string) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  projectId,
  onUpdate,
  onGenerate,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [activeSpeechField, setActiveSpeechField] = useState<'voice' | 'visual'>('visual');
  const [refinementText, setRefinementText] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setSpeechSupported(true);
    }
  }, []);

  const toggleSpeechRecognition = (field: 'voice' | 'visual') => {
    if (!speechSupported) {
      alert('Web Speech API is not supported in this browser. Please use Chrome/Edge or type manually.');
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

  const statusBadges = {
    pending: <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-medium border border-slate-700">Pending</span>,
    generating: <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-400 font-medium border border-cyan-800 flex items-center gap-1.5"><RefreshCw size={12} className="animate-spin" /> Generating</span>,
    ready: <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 font-medium border border-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> Ready</span>,
    error: <span className="text-xs px-2.5 py-1 rounded-full bg-rose-950 text-rose-400 font-medium border border-rose-800 flex items-center gap-1.5"><AlertCircle size={12} /> Error</span>,
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-lg flex flex-col gap-3 transition-all">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg text-primary">#{scene.index.toString().padStart(2, '0')}</span>
          <div className="flex items-center text-xs font-mono text-slate-400 gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            <Clock size={12} />
            <span>{scene.start.toFixed(2)}s - {scene.end.toFixed(2)}s</span>
            <span className="text-amber-400 font-semibold">({scene.duration.toFixed(2)}s)</span>
          </div>
        </div>
        {statusBadges[scene.status]}
      </div>

      {/* Voice Prompt (Spoken Locution) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-400">Audio Narration Cue</label>
          <button
            onClick={() => toggleSpeechRecognition('voice')}
            className={`p-1 rounded-lg text-xs flex items-center gap-1 transition-all ${
              isListening && activeSpeechField === 'voice'
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
          >
            {isListening && activeSpeechField === 'voice' ? <MicOff size={14} /> : <Mic size={14} />}
            <span>Voice</span>
          </button>
        </div>
        <input
          type="text"
          value={scene.prompt_voice}
          placeholder="e.g. As x approaches infinity, the curvature flattens..."
          onChange={(e) => onUpdate({ ...scene, prompt_voice: e.target.value })}
          className="w-full bg-slate-950 border border-border rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Visual Instruction Prompt */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-400">Visual Math Animation Prompt</label>
          <button
            onClick={() => toggleSpeechRecognition('visual')}
            className={`p-1 rounded-lg text-xs flex items-center gap-1 transition-all ${
              isListening && activeSpeechField === 'visual'
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
          >
            {isListening && activeSpeechField === 'visual' ? <MicOff size={14} /> : <Mic size={14} />}
            <span>Voice</span>
          </button>
        </div>
        <textarea
          rows={2}
          value={scene.prompt_visual}
          placeholder="e.g. Draw a 3Blue1Brown glowing cyan vector field rotating into a spiral."
          onChange={(e) => onUpdate({ ...scene, prompt_visual: e.target.value })}
          className="w-full bg-slate-950 border border-border rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onGenerate(scene.index)}
          disabled={scene.status === 'generating'}
          className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-semibold text-xs border border-cyan-500/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
        >
          <Sparkles size={16} />
          <span>{scene.status === 'ready' ? 'Regenerate' : 'Generate with OpenCode'}</span>
        </button>

        {scene.status === 'ready' && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-border flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Eye size={16} />
            <span>{showPreview ? 'Hide' : 'Preview'}</span>
          </button>
        )}
      </div>

      {/* Interactive 16:9 Responsive Preview Iframe */}
      {showPreview && scene.status === 'ready' && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border bg-black shadow-inner">
            <iframe
              src={`${API_BASE}/${projectId}/scenes/${scene.index}/preview?t=${Date.now()}`}
              title={`Preview Scene ${scene.index}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          {/* Quick Refactoring Prompt */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Refine: Make vector arrows glow brighter..."
              value={refinementText}
              onChange={(e) => setRefinementText(e.target.value)}
              className="flex-1 bg-slate-950 border border-border rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={() => {
                if (refinementText) {
                  onGenerate(scene.index, refinementText);
                  setRefinementText('');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 active:scale-95 transition-all"
            >
              Refine
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
