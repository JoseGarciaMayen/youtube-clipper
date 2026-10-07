import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Sparkles, RefreshCw, Eye, Check, AlertCircle, Play, Pause, ChevronDown, ChevronUp, Edit3, Trash2 } from 'lucide-react';
import { SceneItem } from '../types';
import { API_BASE } from '../services/api';

interface SceneCardProps {
  scene: SceneItem;
  projectId: string;
  isLastScene: boolean;
  canDelete: boolean;
  isPlayingThisScene: boolean;
  onPlayScene: (scene: SceneItem) => void;
  onEditScene: (scene: SceneItem) => void;
  onDeleteScene: (sceneIndex: number) => void;
  onUpdate: (updated: SceneItem) => void;
  onGenerate: (sceneIdx: number, refinement?: string) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  projectId,
  isLastScene,
  canDelete,
  isPlayingThisScene,
  onPlayScene,
  onEditScene,
  onDeleteScene,
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
    pending: <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" title="Pending" />,
    generating: <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" title="Generating" />,
    ready: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Ready" />,
    error: <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Error" />,
  };

  return (
    <div className={`bg-[#12141a] border rounded-2xl p-3 transition-all ${
      isPlayingThisScene ? 'border-blue-500/80 ring-1 ring-blue-500/30' : 'border-[#1f242d] hover:border-[#2d3442]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Play snippet audio button */}
          <button
            onClick={() => onPlayScene(scene)}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
              isPlayingThisScene
                ? 'bg-blue-600 text-white'
                : 'bg-[#181b22] text-neutral-300 hover:text-white hover:bg-[#232834]'
            }`}
            title="Listen to this clip"
          >
            {isPlayingThisScene ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
          </button>

          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-xs font-bold text-neutral-200">#{scene.index.toString().padStart(2, '0')}</span>
            <span className="text-[11px] text-neutral-400">
              {scene.start.toFixed(1)}s - {scene.end.toFixed(1)}s
            </span>
            <span className="text-[11px] text-blue-400 font-semibold">({scene.duration.toFixed(1)}s)</span>
          </div>
        </div>

        {/* Right action icons: Edit modal, Delete, Details */}
        <div className="flex items-center gap-1">
          {statusIndicators[scene.status]}

          <button
            onClick={() => onEditScene(scene)}
            className="p-1 rounded-md text-neutral-400 hover:text-blue-400 transition-colors"
            title="Edit & fine-tune timestamps with audio loop"
          >
            <Edit3 size={13} />
          </button>

          {canDelete && isLastScene && (
            <button
              onClick={() => onDeleteScene(scene.index)}
              className="p-1 rounded-md text-neutral-400 hover:text-rose-400 transition-colors"
              title="Delete scene (undo split)"
            >
              <Trash2 size={13} />
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Auto Speech Recognition Tag / Narration Line */}
      {scene.prompt_voice ? (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-[#090a0f] border border-[#1f242d] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-300 truncate font-mono">
            <span className="text-[10px] text-blue-400 font-semibold select-none shrink-0">[VOICE]</span>
            <input
              type="text"
              value={scene.prompt_voice}
              onChange={(e) => onUpdate({ ...scene, prompt_voice: e.target.value })}
              className="bg-transparent border-0 text-neutral-200 text-[11px] focus:outline-none w-full"
              title="Click to edit speech transcript"
            />
          </div>
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-neutral-600 italic px-1 flex items-center gap-1 font-mono">
          <span>Transcribing spoken audio...</span>
        </div>
      )}

      {/* Main Single Row Visual Prompt */}
      <div className="mt-2.5 flex items-center gap-1.5">
        <input
          type="text"
          value={scene.prompt_visual}
          placeholder="Visual prompt..."
          onChange={(e) => onUpdate({ ...scene, prompt_visual: e.target.value })}
          className="flex-1 bg-[#090a0f] border border-[#1f242d] rounded-xl px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
        />

        <button
          onClick={() => toggleSpeechRecognition('visual')}
          className={`p-1.5 rounded-xl border text-xs transition-all ${
            isListening && activeSpeechField === 'visual'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500'
              : 'bg-[#090a0f] border-[#1f242d] text-neutral-400 hover:text-blue-400'
          }`}
          title="Dictate"
        >
          {isListening && activeSpeechField === 'visual' ? <MicOff size={13} /> : <Mic size={13} />}
        </button>

        <button
          onClick={() => onGenerate(scene.index)}
          disabled={scene.status === 'generating'}
          className="px-2.5 py-1.5 rounded-xl bg-[#181b22] hover:bg-[#232834] active:bg-blue-600 active:text-white text-blue-400 font-medium text-xs border border-[#2d3442] disabled:opacity-50 transition-all flex items-center gap-1"
          title="Generate with OpenCode"
        >
          <Sparkles size={12} />
          <span>{scene.status === 'ready' ? 'Redo' : 'Gen'}</span>
        </button>

        {scene.status === 'ready' && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="p-1.5 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-300 border border-[#2d3442] text-xs transition-all"
            title="Preview animation"
          >
            <Eye size={13} />
          </button>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1f242d] flex flex-col gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-neutral-500">Audio Narration Cue</span>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={scene.prompt_voice}
                placeholder="Spoken words in this segment..."
                onChange={(e) => onUpdate({ ...scene, prompt_voice: e.target.value })}
                className="flex-1 bg-[#090a0f] border border-[#1f242d] rounded-xl px-2.5 py-1 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => toggleSpeechRecognition('voice')}
                className={`p-1.5 rounded-xl border ${
                  isListening && activeSpeechField === 'voice'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500'
                    : 'bg-[#090a0f] border-[#1f242d] text-neutral-400 hover:text-blue-400'
                }`}
              >
                {isListening && activeSpeechField === 'voice' ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {showPreview && scene.status === 'ready' && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#1f242d] bg-black">
            <iframe
              src={`${API_BASE}/${projectId}/scenes/${scene.index}/preview?t=${Date.now()}`}
              title={`Preview Scene ${scene.index}`}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Refine prompt..."
              value={refinementText}
              onChange={(e) => setRefinementText(e.target.value)}
              className="flex-1 bg-[#090a0f] border border-[#1f242d] rounded-xl px-2.5 py-1 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                if (refinementText) {
                  onGenerate(scene.index, refinementText);
                  setRefinementText('');
                }
              }}
              className="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-medium text-xs active:scale-95 transition-all"
            >
              Refine
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
