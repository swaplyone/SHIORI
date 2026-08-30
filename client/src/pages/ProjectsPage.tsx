import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, FolderGit2, GitBranch, Github, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Project, Workspace } from '../types';

export const ProjectsPage: React.FC = () => {
  const { token } = useAuth();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();

  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectRepo, setNewProjectRepo] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
        if (data.workspaces?.length > 0) {
          setSelectedWorkspaceId(data.workspaces[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchWorkspaces();
  }, [token]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !selectedWorkspaceId || !token) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc,
          workspaceId: selectedWorkspaceId,
          githubRepoName: newProjectRepo || null,
          githubRepoUrl: newProjectRepo ? `https://github.com/swaplyone/${newProjectRepo}` : null
        })
      });

      if (res.ok) {
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectRepo('');
        setIsModalOpen(false);
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            PROJECTS & REPOSITORIES
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Repository linking and technical project progress
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3 py-1.5 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>NEW PROJECT</span>
        </button>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-eink-border/40 rounded-xs" />
                <div className="h-4 w-12 bg-eink-border/30 rounded-xs" />
              </div>
              <div className="h-10 bg-eink-border/20 rounded-xs" />
              <div className="h-12 bg-eink-border/25 rounded-xs" />
              <div className="h-4 bg-eink-border/30 rounded-xs" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-eink-border rounded-sm space-y-3 bg-eink-surface/30">
          <FolderGit2 className="w-8 h-8 text-eink-textMuted mx-auto" />
          <h3 className="font-technical font-bold text-sm text-eink-text uppercase">No projects yet</h3>
          <p className="text-xs text-eink-textSecondary max-w-sm mx-auto">
            Create your first project or connect a GitHub repository to start tracking verified tasks.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm inline-flex items-center gap-1.5 shadow-eink-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>CREATE FIRST PROJECT</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => {
            const total = Number(proj.total_tasks || 0);
            const completed = Number(proj.completed_tasks || 0);
            const inProg = Number(proj.in_progress_tasks || 0);
            const review = Number(proj.review_tasks || 0);
            const failedCI = Number(proj.failed_ci_tasks || 0);
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <div
                key={proj.id}
                className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-eink-text" />
                      <h3 className="font-technical font-bold text-sm text-eink-text uppercase">
                        {proj.name}
                      </h3>
                    </div>
                    <span className="text-[10px] font-technical px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text">
                      {proj.status || 'ACTIVE'}
                    </span>
                  </div>

                  <p className="text-xs text-eink-textSecondary line-clamp-2">
                    {proj.description || 'Workspace repository project'}
                  </p>

                  {/* GitHub Repo info */}
                  <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm text-xs font-technical space-y-1">
                    <span className="text-[10px] text-eink-textMuted uppercase block">GITHUB REPOSITORY</span>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-eink-text truncate">
                        {proj.github_repo_name || 'No repository linked'}
                      </span>
                      <span className="text-[10px] text-eink-textMuted">
                        branch: {proj.default_branch || 'main'}
                      </span>
                    </div>
                  </div>

                  {/* Progress breakdown */}
                  <div className="space-y-2 pt-2 border-t border-eink-border/60 text-xs font-technical">
                    <div className="flex items-center justify-between">
                      <span className="text-eink-textSecondary">{total} total tasks</span>
                      <span className="font-bold text-eink-text">
                        {percent}% complete
                      </span>
                    </div>

                    <div className="w-full bg-eink-bg h-2 border border-eink-border rounded overflow-hidden">
                      <div
                        className="bg-eink-text h-full"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-eink-textMuted pt-1">
                      <div>✓ {completed} completed</div>
                      <div>◐ {inProg} in progress</div>
                      <div>→ {review} in review</div>
                      <div>{failedCI > 0 ? `✕ ${failedCI} failing CI` : '✓ 0 failed'}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-eink-border flex items-center justify-between font-technical text-xs">
                  <span className="text-eink-textMuted text-[11px]">TASK BOARD</span>
                  <span className="text-eink-text font-bold flex items-center gap-1">
                    <span>OPEN BOARD</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-eink-bg border border-eink-border p-6 rounded-sm shadow-2xl z-10 space-y-4">
            <h3 className="font-technical font-bold text-sm uppercase">CREATE NEW PROJECT</h3>
            <form onSubmit={handleCreateProject} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  PROJECT NAME *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. SwaplyOne Compiler"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  DESCRIPTION
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Project scope and goals..."
                  rows={2}
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  LINK GITHUB REPO NAME
                </label>
                <input
                  type="text"
                  value={newProjectRepo}
                  onChange={(e) => setNewProjectRepo(e.target.value)}
                  placeholder="e.g. swaply-one-compiler"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs font-technical rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm shadow-eink-sm"
                >
                  CREATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
