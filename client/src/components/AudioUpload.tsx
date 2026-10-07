import React, { useState } from 'react';
import { Upload, Music, AlertCircle, FileAudio } from 'lucide-react';
import { createProject } from '../services/api';

interface AudioUploadProps {
  onProjectCreated: (projectId: string, duration: number) => void;
}

export const AudioUpload: React.FC<AudioUploadProps> = ({ onProjectCreated }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const data = await createProject(file);
      onProjectCreated(data.project_id, data.audio_duration);
    } catch (err: any) {
      setError(err.message || 'Failed to upload audio file');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-2xl flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-6">
          <Music size={40} />
        </div>

        <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-400 via-teal-300 to-amber-400 bg-clip-text text-transparent mb-2">
          Math Video Clipper
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Upload your spoken audio track to start live splitting scenes and generating high-end math animations.
        </p>

        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="w-full cursor-pointer">
          <div className="w-full py-4 px-6 rounded-2xl bg-primary hover:bg-cyan-400 text-slate-950 font-bold text-base shadow-lg shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-3">
            <Upload size={20} />
            <span>{isUploading ? 'Uploading Audio...' : 'Choose Audio File (.mp3, .wav)'}</span>
          </div>
          <input
            type="file"
            accept="audio/*"
            disabled={isUploading}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
};
