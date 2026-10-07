import React from 'react';
import { Film, Download, RefreshCw, Terminal } from 'lucide-react';
import { API_BASE } from '../services/api';

interface RenderBarProps {
  projectId: string;
  isRendering: boolean;
  renderProgress: number;
  renderStatusMessage: string;
  hasRenderedVideo: boolean;
  showTerminal: boolean;
  onToggleTerminal: () => void;
  onStartRender: () => void;
}

export const RenderBar: React.FC<RenderBarProps> = ({
  projectId,
  isRendering,
  renderProgress,
  renderStatusMessage,
  hasRenderedVideo,
  showTerminal,
  onToggleTerminal,
  onStartRender,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#090a0f]/95 backdrop-blur-md border-t border-[#1f242d] p-3 z-40">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Progress status */}
        {isRendering && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-mono text-blue-400">
              <span className="truncate">{renderStatusMessage || 'Rendering...'}</span>
              <span>{renderProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-[#12141a] h-1.5 rounded-full overflow-hidden border border-[#1f242d]">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center gap-2 max-w-xl mx-auto w-full">
          <button
            onClick={onToggleTerminal}
            className={`p-2.5 rounded-xl border transition-all ${
              showTerminal
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                : 'bg-[#12141a] border-[#1f242d] text-neutral-400 hover:text-blue-400'
            }`}
            title="Toggle Live Terminal"
          >
            <Terminal size={15} />
          </button>

          <button
            onClick={onStartRender}
            disabled={isRendering}
            className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md"
          >
            {isRendering ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Rendering 60 FPS...</span>
              </>
            ) : (
              <>
                <Film size={14} />
                <span>Render Master MP4</span>
              </>
            )}
          </button>

          {hasRenderedVideo && (
            <a
              href={`${API_BASE}/${projectId}/download`}
              download
              className="py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Download size={14} />
              <span>Save</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
