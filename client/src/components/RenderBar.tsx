import React, { useState } from 'react';
import { Film, Download, RefreshCw, Terminal } from 'lucide-react';
import { API_BASE } from '../services/api';

interface RenderBarProps {
  projectId: string;
  isRendering: boolean;
  renderProgress: number;
  renderStatusMessage: string;
  hasRenderedVideo: boolean;
  logs: string[];
  onStartRender: () => void;
}

export const RenderBar: React.FC<RenderBarProps> = ({
  projectId,
  isRendering,
  renderProgress,
  renderStatusMessage,
  hasRenderedVideo,
  logs,
  onStartRender,
}) => {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 p-3 z-50">
      <div className="max-w-lg mx-auto flex flex-col gap-2">
        {/* Progress status */}
        {isRendering && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-mono text-cyan-400">
              <span className="truncate">{renderStatusMessage || 'Rendering...'}</span>
              <span>{renderProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-cyan-500 h-full transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 active:scale-95 transition-all"
            title="Terminal logs"
          >
            <Terminal size={16} />
          </button>

          <button
            onClick={onStartRender}
            disabled={isRendering}
            className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs uppercase tracking-wider active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isRendering ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
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
              className="py-2.5 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Download size={14} />
              <span>Save</span>
            </a>
          )}
        </div>

        {/* Log Viewer */}
        {showLogs && (
          <div className="max-h-40 overflow-y-auto bg-black p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-400 space-y-1">
            <div className="text-cyan-400 font-medium mb-1 flex items-center justify-between">
              <span>Logs:</span>
              <button onClick={() => setShowLogs(false)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">No output yet.</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="break-all whitespace-pre-wrap">{log}</div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
