import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  Plus,
  Trash2,
  GitBranch,
  FolderGit2,
  Check,
  X,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Archive
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export const RepositoriesPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const navigate = useNavigate();

  const [repositories, setRepositories] = useState<any[]>([]);
  const [availableRepos, setAvailableRepos] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedReposToAdd, setSelectedReposToAdd] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchRepositories = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [userRepoRes, availRepoRes] = await Promise.all([
        fetch('/api/github/user-repositories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/github/available-repositories', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (userRepoRes.ok) {
        const data = await userRepoRes.json();
        setRepositories(data.repositories || []);
      }

      if (availRepoRes.ok) {
        const data = await availRepoRes.json();
        setAvailableRepos(data.repositories || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, [token]);

  const handleOpenAddModal = () => {
    const activeMap: Record<string, boolean> = {};
    repositories.forEach((r) => {
      activeMap[r.name] = true;
    });
    setSelectedReposToAdd(activeMap);
    setIsAddModalOpen(true);
  };

  const handleToggleRepo = (repoName: string) => {
    setSelectedReposToAdd((prev) => ({
      ...prev,
      [repoName]: !prev[repoName]
    }));
  };

  const handleSaveRepositories = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      for (const repo of availableRepos) {
        const shouldBeActive = Boolean(selectedReposToAdd[repo.name]);
        await fetch('/api/github/user-repositories/toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            repoName: repo.name,
            isEnabled: shouldBeActive
          })
        });
      }
      triggerEInkRefresh();
      setIsAddModalOpen(false);
      fetchRepositories();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveRepo = async (repoName: string) => {
    if (!token) return;
    try {
      await fetch(`/api/github/user-repositories/${encodeURIComponent(repoName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      triggerEInkRefresh();
      fetchRepositories();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 font-sans select-none pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4 font-technical">
        <div>
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-widest block mb-1">
            REPOSITORY = PROJECT MANAGEMENT
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-eink-text uppercase tracking-tight">
            YOUR REPOSITORIES ({repositories.length})
          </h1>
          <p className="text-[11px] text-eink-textSecondary font-sans mt-0.5">
            Each repository represents a project with its own TODOs, Git commits, and recovery history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm text-xs font-technical flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD REPOSITORY</span>
          </button>
        </div>
      </div>

      {/* Repositories Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-technical">
        {repositories.map((repo) => (
          <div
            key={repo.name}
            className="p-5 bg-eink-surface border-2 border-eink-border hover:border-eink-text rounded-sm space-y-4 shadow-eink-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4 text-eink-text" />
                <h3 className="font-bold text-sm text-eink-text uppercase tracking-wide">
                  {repo.name}
                </h3>
              </div>
              <span className="text-[10px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded font-mono font-bold">
                {repo.activeTodosCount} ACTIVE
              </span>
            </div>

            <div className="space-y-1 text-xs text-eink-textSecondary font-mono border-t border-b border-eink-border/50 py-2.5">
              <div className="flex justify-between">
                <span>Branch:</span>
                <strong className="text-eink-text">{repo.defaultBranch}</strong>
              </div>
              <div className="flex justify-between">
                <span>Completed:</span>
                <span>{repo.completedTodosCount} tasks</span>
              </div>
              <div className="flex justify-between">
                <span>Today activity:</span>
                <span>{repo.commitsTodayCount} commits</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => navigate(`/tasks?repo=${repo.name}`)}
                className="px-3 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs flex items-center gap-1 hover:opacity-90"
              >
                <span>OPEN WORKSPACE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleArchiveRepo(repo.name)}
                className="p-1.5 text-eink-textMuted hover:text-eink-text border border-eink-border hover:bg-eink-bg rounded"
                title="Archive repository from active list (never deletes from GitHub)"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ADD REPOSITORY MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-technical select-none">
          <div className="bg-eink-bg border-2 border-eink-text w-full max-w-lg rounded-sm p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div className="flex items-center gap-2">
                <Github className="w-4 h-4 text-eink-text" />
                <h3 className="font-bold text-sm uppercase text-eink-text">
                  SELECT REPOSITORIES
                </h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-eink-textMuted hover:text-eink-text">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-eink-textSecondary font-sans">
              Choose the GitHub repositories you want to work on in SHIORI. No new GitHub login required.
            </p>

            <div className="border border-eink-border rounded-sm divide-y divide-eink-border bg-eink-surface max-h-64 overflow-y-auto">
              {availableRepos.map((repo) => {
                const isSelected = Boolean(selectedReposToAdd[repo.name]);
                return (
                  <div
                    key={repo.name}
                    onClick={() => handleToggleRepo(repo.name)}
                    className="p-3 flex items-center justify-between hover:bg-eink-surfaceHover cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 border rounded-sm flex items-center justify-center ${isSelected ? 'bg-eink-text text-eink-bg border-eink-text' : 'border-eink-border bg-eink-bg'}`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <div>
                        <span className="font-bold text-eink-text font-mono">{repo.name}</span>
                        <p className="text-[10px] text-eink-textMuted font-sans">{repo.description || 'GitHub repository'}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-eink-textMuted">{repo.default_branch}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-eink-border text-xs">
              <span className="text-[10px] text-eink-textMuted">
                GitHub connected once per account
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-eink-text font-bold rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleSaveRepositories}
                  disabled={submitting}
                  className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'SAVING...' : 'SAVE SELECTION'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
