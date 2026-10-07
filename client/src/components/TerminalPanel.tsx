import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Maximize2, Minimize2, Trash2, CheckCircle2, ChevronDown } from 'lucide-react';

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

  // Auto-scroll to latest log
  useEffect(() => {
    if (isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  // ANSI color parser for rich raw terminal output
  const renderFormattedLine = (line: string, index: number) => {
    let clean = line
      .replace(/\[\d+m/g, '')
      .replace(/\[1m/g, '')
      .replace(/\[0m/g, '')
      .replace(/¤/g, '');

    let colorClass = 'text-neutral-300';
    let prefixTag = null;

    if (clean.includes('[OpenCode]') || clean.includes('> visual_coder')) {
      colorClass = 'text-blue-300';
      prefixTag = <span className="text-blue-500 font-bold select-none">[OPENCODE] </span>;
      clean = clean.replace(/^\[OpenCode\]\s*/, '');
    } else if (clean.includes('[Render]') || clean.includes('Rendering scene')) {
      colorClass = 'text-cyan-300';
      prefixTag = <span className="text-cyan-500 font-bold select-none">[RENDER] </span>;
      clean = clean.replace(/^\[Render\]\s*/, '');
    } else if (clean.includes('ERROR') || clean.includes('Error:') || clean.includes('failed')) {
      colorClass = 'text-rose-400 font-medium';
      prefixTag = <span className="text-rose-500 font-bold select-none">[ERROR] </span>;
    } else if (clean.includes('✓') || clean.includes('success') || clean.includes('complete')) {
      colorClass = 'text-emerald-400';
      prefixTag = <span className="text-emerald-500 font-bold select-none">[SUCCESS] </span>;
    } else if (clean.startsWith('$') || clean.startsWith('>')) {
      colorClass = 'text-neutral-100 font-semibold';
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
            Backend CLI Console
          </span>
          <span className="text-[10px] text-neutral-500 bg-[#090a0f] px-1.5 py-0.5 rounded border border-[#1f242d]">
            {logs.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1 text-neutral-400">
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

      {/* Terminal Body Screen */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-0.5 font-mono text-[11px] text-neutral-300 select-text">
        {logs.length === 0 ? (
          <div className="text-neutral-600 italic select-none py-6 text-center flex flex-col items-center gap-1">
            <span>Terminal idle. Logs will stream in real-time here.</span>
            <span className="text-[10px] text-neutral-700">OpenCode subagent calls & Puppeteer render status</span>
          </div>
        ) : (
          logs.map((log, idx) => renderFormattedLine(log, idx))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
