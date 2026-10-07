import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Maximize2, Minimize2, Trash2, CheckCircle2, ChevronDown, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface TerminalPanelProps {
  logs: string[];
  onClearLogs?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isDesktopEmbedded?: boolean;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  logs,
  onClearLogs,
  isOpen,
  onToggleOpen,
  isDesktopEmbedded = false,
}) => {
  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const [isExpandedHeight, setIsExpandedHeight] = useState(false);
  const [showVerboseDetails, setShowVerboseDetails] = useState(false);

  // Auto-scroll to latest log
  useEffect(() => {
    if (isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen, showVerboseDetails]);

  // Identify high-level milestones vs raw bash commands
  const isRawNoise = (line: string) => {
    const l = line.trim();
    return (
      l.startsWith('$') ||
      l.startsWith('← Write') ||
      l.startsWith('← Edit') ||
      l.startsWith('→ Read') ||
      l.startsWith('Index:') ||
      l.startsWith('===') ||
      l.startsWith('---') ||
      l.startsWith('+++') ||
      l.startsWith('@@') ||
      l.startsWith('total ') ||
      l.startsWith('drwx') ||
      l.startsWith('-rw-') ||
      l.startsWith('SYNTAX_OK') ||
      l.startsWith('written') ||
      l.includes('google-chrome-stable') ||
      l.includes('node -e') ||
      l.includes('mkdir -p') ||
      l.includes('timeout ')
    );
  };

  const isErrorOrImportant = (line: string) => {
    const l = line.toLowerCase();
    return (
      l.includes('error') ||
      l.includes('fail') ||
      l.includes('exception') ||
      l.includes('warning') ||
      l.includes('starting opencode') ||
      l.includes('transcribed') ||
      l.includes('render complete') ||
      l.includes('rendering scene')
    );
  };

  // Filter logs for concise view unless verbose details is toggled
  const displayedLogs = showVerboseDetails
    ? logs
    : logs.filter((l) => !isRawNoise(l) || isErrorOrImportant(l));

  const errorsCount = logs.filter((l) => {
    const low = l.toLowerCase();
    return low.includes('error') || low.includes('failed');
  }).length;

  const isGenerating = logs.length > 0 && !logs[logs.length - 1].includes('complete');

  const renderFormattedLine = (line: string, index: number) => {
    let clean = line
      .replace(/\[\d+m/g, '')
      .replace(/\[1m/g, '')
      .replace(/\[0m/g, '')
      .replace(/¤/g, '');

    let colorClass = 'text-neutral-300';
    let prefixTag = null;

    if (clean.includes('ERROR') || clean.includes('Error:') || clean.includes('failed')) {
      colorClass = 'text-rose-400 font-semibold';
      prefixTag = <span className="text-rose-500 font-bold select-none">[ERROR] </span>;
    } else if (clean.includes('[OpenCode]') || clean.includes('> visual_coder')) {
      colorClass = 'text-blue-300';
      prefixTag = <span className="text-blue-500 font-bold select-none">[OPENCODE] </span>;
      clean = clean.replace(/^\[OpenCode\]\s*/, '');
    } else if (clean.includes('[Render]') || clean.includes('Rendering scene')) {
      colorClass = 'text-cyan-300';
      prefixTag = <span className="text-cyan-500 font-bold select-none">[RENDER] </span>;
      clean = clean.replace(/^\[Render\]\s*/, '');
    } else if (clean.includes('[Whisper]')) {
      colorClass = 'text-amber-300';
      prefixTag = <span className="text-amber-500 font-bold select-none">[VOICE] </span>;
      clean = clean.replace(/^\[Whisper\]\s*/, '');
    } else if (clean.includes('✓') || clean.includes('success') || clean.includes('complete')) {
      colorClass = 'text-emerald-400 font-medium';
      prefixTag = <span className="text-emerald-500 font-bold select-none">[SUCCESS] </span>;
    }

    return (
      <div key={index} className="leading-relaxed hover:bg-[#151821] px-1 py-0.5 rounded transition-colors break-words">
        {prefixTag}
        <span className={colorClass}>{clean}</span>
      </div>
    );
  };

  if (!isOpen && !isDesktopEmbedded) return null;

  return (
    <div className={`bg-[#07080c] border border-[#1f242d] rounded-2xl flex flex-col overflow-hidden shadow-2xl font-mono text-xs ${
      isDesktopEmbedded
        ? 'w-full h-72'
        : `w-full ${isExpandedHeight ? 'h-96' : 'h-64'}`
    }`}>
      {/* Terminal Title Bar */}
      <div className="bg-[#101218] border-b border-[#1f242d] px-3.5 py-2 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-semibold text-neutral-300 ml-2 flex items-center gap-1.5">
            <Terminal size={13} className="text-blue-400" />
            Status Console
          </span>

          {errorsCount > 0 && (
            <span className="text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-800 flex items-center gap-1">
              <AlertCircle size={10} /> {errorsCount} Error{errorsCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-neutral-400">
          {/* Toggle Raw CLI Output vs Concise Status */}
          <button
            onClick={() => setShowVerboseDetails(!showVerboseDetails)}
            className={`px-2 py-0.5 rounded text-[10px] font-sans flex items-center gap-1 border transition-colors ${
              showVerboseDetails
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                : 'bg-[#181b22] text-neutral-400 border-[#2d3442] hover:text-neutral-200'
            }`}
            title="Toggle raw bash shell commands"
          >
            {showVerboseDetails ? <EyeOff size={11} /> : <Eye size={11} />}
            <span>{showVerboseDetails ? 'Hide Raw Shell' : 'Show Raw Shell'}</span>
          </button>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              className="p-1 rounded hover:text-neutral-200 hover:bg-[#1a1e27] transition-colors"
              title="Clear terminal"
            >
              <Trash2 size={13} />
            </button>
          )}

          {!isDesktopEmbedded && (
            <button
              onClick={() => setIsExpandedHeight(!isExpandedHeight)}
              className="p-1 rounded hover:text-neutral-200 hover:bg-[#1a1e27] transition-colors"
              title={isExpandedHeight ? 'Minimize' : 'Expand'}
            >
              {isExpandedHeight ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {!isDesktopEmbedded && (
            <button
              onClick={onToggleOpen}
              className="p-1 rounded hover:text-neutral-200 hover:bg-[#1a1e27] transition-colors"
              title="Close terminal"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Screen Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-1 font-mono text-[11px] text-neutral-300 select-text">
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic select-none py-6 text-center flex flex-col items-center gap-1">
            <span>Terminal idle. Ready to generate.</span>
          </div>
        ) : displayedLogs.length === 0 ? (
          <div className="text-neutral-400 py-6 text-center flex flex-col items-center gap-2">
            <span className="animate-pulse text-blue-400">Generando escena con OpenCode...</span>
            <button
              onClick={() => setShowVerboseDetails(true)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 underline"
            >
              Ver detalles técnicos del subproceso
            </button>
          </div>
        ) : (
          displayedLogs.map((log, idx) => renderFormattedLine(log, idx))
        )}

        {/* Live indicator when generating */}
        {isGenerating && !showVerboseDetails && displayedLogs.length > 0 && (
          <div className="text-blue-400 animate-pulse text-[10px] pt-1 flex items-center gap-1.5 select-none font-sans">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span>Generando animación...</span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
