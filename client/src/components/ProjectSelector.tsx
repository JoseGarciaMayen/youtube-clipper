import React, { useState, useEffect } from 'react';
import { Upload, Music, AlertCircle, Folder, Plus, Clock, Layers, Sparkles, Pencil, Trash2, X } from 'lucide-react';
import { listProjects, createProject, renameProject, deleteProject } from '../services/api';
import { ProjectSummary } from '../types';

interface ProjectSelectorProps {
  onSelectProject: (projectId: string) => void;
  onProjectCreated: (projectId: string, duration: number, name?: string) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  onSelectProject,
  onProjectCreated,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit / Rename project state
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete project state
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err: any) {
      console.warn('Could not list projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    const trimmed = editName.trim();
    if (!trimmed) return;

    setIsRenaming(true);
    try {
      await renameProject(editingProject.project_id, trimmed);
      setEditingProject(null);
      await loadProjects();
    } catch (err: any) {
      alert(`Error al renombrar: ${err.message}`);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deletingProject) return;
    setIsDeleting(true);
    try {
      await deleteProject(deletingProject.project_id);
      setDeletingProject(null);
      await loadProjects();
    } catch (err: any) {
      alert(`Error al borrar el proyecto: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select an audio file for the project.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const name = newProjectName.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');
      const data = await createProject(selectedFile, name);
      onProjectCreated(data.project_id, data.audio_duration, data.name);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      setIsUploading(false);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}m ${s}s`;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full flex flex-col gap-6">
        {/* Top Branding Header */}
        <div className="flex items-center justify-between border-b border-[#1f242d] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-100 tracking-wide">Math Clipper Desktop Studio</h1>
              <p className="text-xs text-neutral-400">Select an existing project or create a new audio timeline</p>
            </div>
          </div>

          <button
            onClick={() => {
              setError(null);
              setShowCreateModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md active:scale-95 transition-all flex items-center gap-2"
          >
            <Plus size={15} />
            <span>New Project</span>
          </button>
        </div>

        {/* Existing Projects List */}
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
            Projects on this machine ({projects.length})
          </span>

          {isLoading ? (
            <div className="p-12 text-center text-neutral-500 font-mono text-xs">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="bg-[#12141a] border border-[#1f242d] rounded-2xl p-10 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#181b22] border border-[#2d3442] flex items-center justify-center text-neutral-500">
                <Folder size={24} />
              </div>
              <p className="text-xs text-neutral-400">No projects found yet. Create your first project to begin!</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-all flex items-center gap-2"
              >
                <Plus size={14} />
                <span>Create First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {projects.map((p) => (
                <div
                  key={p.project_id}
                  onClick={() => onSelectProject(p.project_id)}
                  className="bg-[#12141a] hover:bg-[#181b22] border border-[#1f242d] hover:border-blue-500/60 rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between gap-3 group shadow-sm hover:shadow-md relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-[#090a0f] border border-[#1f242d] group-hover:border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                        <Folder size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm text-neutral-200 group-hover:text-blue-400 transition-colors truncate">
                          {p.name || p.project_id}
                        </h3>
                        <span className="text-[10px] font-mono text-neutral-500">ID: {p.project_id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {p.ready_scenes > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono mr-1">
                          {p.ready_scenes} ready
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(p);
                          setEditName(p.name);
                        }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-400 hover:bg-[#1f242d] transition-colors"
                        title="Editar nombre del proyecto"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingProject(p);
                        }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                        title="Borrar proyecto"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-2 border-t border-[#1f242d]/60 font-mono">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-neutral-500" />
                        {formatDuration(p.audio_duration)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers size={11} className="text-neutral-500" />
                        {p.scenes_count} scenes
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-600">{formatDate(p.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create New Project */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141a] border border-[#1f242d] w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-[#1f242d] pb-3">
              <div className="flex items-center gap-2">
                <Music size={18} className="text-blue-500" />
                <h2 className="font-bold text-sm text-neutral-100">Create New Project</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xs"
              >
                Cancel
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateProject} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-neutral-400 font-medium">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Monty Hall Paradox Video"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-[#090a0f] border border-[#1f242d] rounded-xl px-3 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-neutral-400 font-medium">Audio Voiceover (.mp3, .wav)</label>
                <label className="border border-dashed border-[#2d3442] hover:border-blue-500/60 bg-[#090a0f] rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
                  <Upload size={20} className="text-neutral-500 mb-1.5" />
                  <span className="text-neutral-300 font-medium">
                    {selectedFile ? selectedFile.name : 'Click to select audio file'}
                  </span>
                  <span className="text-[10px] text-neutral-500 mt-0.5">MP3, WAV, AAC, M4A</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setSelectedFile(f);
                        if (!newProjectName) {
                          setNewProjectName(f.name.replace(/\.[^/.]+$/, ''));
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1f242d]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-400 text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {isUploading ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <Plus size={14} />
                      <span>Start Project</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rename Project */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141a] border border-[#1f242d] w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-[#1f242d] pb-3">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-blue-500" />
                <h2 className="font-bold text-sm text-neutral-100">Editar Nombre del Proyecto</h2>
              </div>
              <button
                onClick={() => setEditingProject(null)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRenameProject} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-neutral-400 font-medium">Nombre del proyecto</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Introduce el nuevo nombre"
                  autoFocus
                  required
                  className="bg-[#090a0f] border border-[#1f242d] rounded-xl px-3 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1f242d]">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-3 py-2 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-400 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRenaming || !editName.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md disabled:opacity-50 transition-all"
                >
                  {isRenaming ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Project Confirmation */}
      {deletingProject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141a] border border-rose-900/40 w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-[#1f242d] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400">
                  <Trash2 size={14} />
                </div>
                <h2 className="font-bold text-sm text-neutral-100">Borrar Proyecto</h2>
              </div>
              <button
                onClick={() => setDeletingProject(null)}
                className="text-neutral-500 hover:text-neutral-300"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs text-neutral-300">
              <p>
                ¿Estás seguro de que deseas eliminar permanentemente el proyecto{' '}
                <span className="font-bold text-white">"{deletingProject.name}"</span>?
              </p>
              <p className="text-[11px] text-rose-400/90 bg-rose-950/30 p-2.5 rounded-xl border border-rose-900/30">
                ⚠️ Esta acción no se puede deshacer. Se eliminarán el audio, los splits y todas las escenas y animaciones generadas.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1f242d]">
              <button
                type="button"
                onClick={() => setDeletingProject(null)}
                className="px-3 py-2 rounded-xl bg-[#181b22] hover:bg-[#232834] text-neutral-400 text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>{isDeleting ? 'Eliminando...' : 'Eliminar Proyecto'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

