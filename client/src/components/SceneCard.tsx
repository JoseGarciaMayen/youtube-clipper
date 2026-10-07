import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, RefreshCw, Eye, Check, AlertCircle, Play, Pause, ChevronDown, ChevronUp, Edit3, Trash2, FileUp } from 'lucide-react';
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
  onImportScene?: (sceneIdx: number, file: File) => void;
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
  const [cardVersion, setCardVersion] = useState<number>(1);
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportScene) {
      onImportScene(scene.index, file);
    }
  };

  const statusIndicators = {
    pending: <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" title="Pendiente" />,
    generating: <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" title="Fase 1: Generando con DeepSeek Flash" />,
    reviewing: <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Fase 2: Revisando con DeepSeek V4 Pro" />,
    ready: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Revisado y Aprobado" />,
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

          {scene.status === 'reviewing' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono animate-pulse">
              Revisando (V4 Pro)
            </span>
          )}
          {scene.status === 'generating' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono animate-pulse">
              Generando (Flash)
            </span>
          )}
          {scene.status === 'ready' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[9px]">
              Aprobado ✓
            </span>
          )}
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

      {/* Spoken Narration Cue */}
      <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-[#090a0f] border border-[#1f242d] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-300 w-full font-mono">
          <span className="text-[10px] text-blue-400 font-semibold select-none shrink-0" title="Auto-transcribed audio or custom voice cue">[VOICE]</span>
          <input
            type="text"
            value={scene.prompt_voice}
            placeholder={scene.prompt_voice ? "" : "Transcribing spoken audio or type here..."}
            onChange={(e) => onUpdate({ ...scene, prompt_voice: e.target.value })}
            className="bg-transparent border-0 text-neutral-200 text-[11px] focus:outline-none w-full"
            title="Spoken audio cue passed to animation generator"
          />
        </div>
        <button
          onClick={() => toggleSpeechRecognition('voice')}
          className={`p-1 rounded-md border text-xs shrink-0 transition-all ${
            isListening && activeSpeechField === 'voice'
              ? 'bg-rose-500/20 text-rose-400 border-rose-500'
              : 'bg-transparent border-transparent text-neutral-500 hover:text-blue-400'
          }`}
          title="Dictate voice prompt"
        >
          {isListening && activeSpeechField === 'voice' ? <MicOff size={12} /> : <Mic size={12} />}
        </button>
      </div>

      {/* Main Single Row Visual Prompt */}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={scene.prompt_visual}
          placeholder="Visual prompt (e.g. Monty Hall problem with 3 glowing doors)..."
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
          title="Dictate visual prompt"
        >
          {isListening && activeSpeechField === 'visual' ? <MicOff size={13} /> : <Mic size={13} />}
        </button>

        {/* Import custom HTML file for this split */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-xl bg-[#090a0f] hover:bg-[#181b22] text-neutral-400 hover:text-blue-400 border border-[#1f242d] text-xs transition-all"
          title="Import custom HTML animation for this scene"
        >
          <FileUp size={13} />
        </button>

        <button
          onClick={() => onGenerate(scene.index)}
          disabled={scene.status === 'generating' || scene.status === 'reviewing'}
          className="px-2.5 py-1.5 rounded-xl bg-[#181b22] hover:bg-[#232834] active:bg-blue-600 active:text-white text-blue-400 font-medium text-xs border border-[#2d3442] disabled:opacity-50 transition-all flex items-center gap-1"
          title={
            scene.status === 'generating'
              ? 'Fase 1: Generando con DeepSeek Flash...'
              : scene.status === 'reviewing'
              ? 'Fase 2: Revisando con DeepSeek V4 Pro...'
              : 'Generar con OpenCode (DeepSeek Flash + V4 Pro Review)'
          }
        >
          <Sparkles size={12} className={scene.status === 'generating' || scene.status === 'reviewing' ? 'animate-spin text-amber-400' : ''} />
          <span>
            {scene.status === 'generating'
              ? 'Generando...'
              : scene.status === 'reviewing'
              ? 'Revisando...'
              : scene.status === 'ready'
              ? 'Redo'
              : 'Gen'}
          </span>
        </button>

        {scene.status === 'ready' && (
          <button
            onClick={() => {
              if (!showPreview) setCardVersion(Date.now());
              setShowPreview(!showPreview);
            }}
            className="p-1.5 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-300 border border-[#2d3442] text-xs transition-all"
            title="Preview animation"
          >
            <Eye size={13} />
          </button>
        )}
      </div>

      {/* Preview Section */}
      {showPreview && scene.status === 'ready' && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-[#1f242d] bg-black">
            <iframe
              key={`card-preview-${scene.index}-${cardVersion}`}
              src={`${API_BASE}/${projectId}/scenes/${scene.index}/preview?v=${cardVersion}`}
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
