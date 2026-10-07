import React, { useState } from 'react';
import { Film, Download, CheckCircle, RefreshCw, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-lg border-t border-border p-4 shadow-2xl z-50">
      <div className="max-w-xl mx-auto flex flex-col gap-3">
        {/* Progress or Status */}
        {isRendering && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-mono text-cyan-400">
              <span>{renderStatusMessage || 'Rendering headless 60 FPS video...'}</span>
              <span>{renderProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-cyan-500 to-amber-500 h-full transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="p-3 rounded-xl bg-slate-900 border border-border text-slate-400 hover:text-cyan-400 active:scale-95 transition-all"
            title="Toggle Live Logs"
          >
            <Terminal size={20} />
          </button>

          <button
            onClick={onStartRender}
            disabled={isRendering}
            className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-amber-500 hover:brightness-110 active:scale-95 disabled:opacity-50 text-slate-950 font-black text-sm tracking-wide uppercase transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {isRendering ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Rendering Headless 60 FPS...</span>
              </>
            ) : (
              <>
                <Film size={18} />
                <span>Render Master MP4</span>
              </>
            )}
          </button>

          {hasRenderedVideo && (
            <a
              href={`/api/projects/${projectId}/download`}
              download
              className="py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm tracking-wide uppercase active:scale-95 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              <Download size={18} />
              <span>Download</span>
            </a>
          )}
        </div>

        {/* Real-time Log Console Drawer */}
        {showLogs && (
          <div className="max-h-48 overflow-y-auto bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-400 space-y-1">
            <div className="text-cyan-400 font-semibold mb-1 flex items-center justify-between">
              <span>Server & OpenCode Live Logs:</span>
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
