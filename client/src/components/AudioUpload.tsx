import React, { useState } from 'react';
import { Upload, Music, AlertCircle } from 'lucide-react';
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
      <div className="max-w-md w-full bg-[#12141a] border border-[#1f242d] rounded-2xl p-8 shadow-2xl flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-[#181b22] border border-[#2d3442] flex items-center justify-center text-blue-500 mb-5">
          <Music size={32} />
        </div>

        <h1 className="text-xl font-bold text-neutral-100 mb-1.5">
          Math Video Clipper
        </h1>
        <p className="text-xs text-neutral-400 mb-6 max-w-xs">
          Upload audio to start real-time timeline splitting and generating synchronized math animations.
        </p>

        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="w-full cursor-pointer">
          <div className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2">
            <Upload size={16} />
            <span>{isUploading ? 'Uploading Audio...' : 'Select Audio (.mp3, .wav)'}</span>
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
