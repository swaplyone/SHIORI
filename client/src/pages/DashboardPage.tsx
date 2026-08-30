import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  GitBranch,
  Users,
  Plus,
  ArrowRight,
  GitCommit,
  Check,
  X,
  Copy,
  FolderGit2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { fetchJson } from '../utils/api';

export const DashboardPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<any[]>([]);
  const [availableRepos, setAvailableRepos] = useState<any[]>([]);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedRepoName, setSelectedRepoName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const fetchHomeData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [projRes, repoRes] = await Promise.all([
        fetchJson('/api/projects'),
        fetchJson('/api/github/available-repositories')
      ]);

      if (projRes.ok) {
        setProjects(projRes.data?.projects || []);
      }

      if (repoRes.ok) {
        const repos = repoRes.data?.repositories || [];
        setAvailableRepos(repos);
        if (repos.length > 0) {
          setSelectedRepoName(repos[0].name);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeData();

    const handleRefresh = () => fetchHomeData();
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [token]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepoName || !token) return;

    setSubmitting(true);
    try {
      const { ok } = await fetchJson('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          repositoryName: selectedRepoName,
          defaultBranch: 'main'
        })
      });

      if (ok) {
        setIsAddProjectOpen(false);
        triggerEInkRefresh();
        fetchHomeData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyShioriId = () => {
    navigator.clipboard.writeText(user?.shiori_id || 'SHI-3A91M');
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const totalActiveTodos = projects.reduce((sum, p) => sum + (p.active_todos || 0), 0);
  const totalCompletedTodos = projects.reduce((sum, p) => sum + (p.completed_tasks || 0), 0);
  const totalCommitsToday = projects.reduce((sum, p) => sum + (p.commitsTodayCount || 0), 0);

  return (
    <div className="space-y-8 select-none font-sans pb-12">
      {/* 1. TODAY SUMMARY STRIP */}
      {loading ? (
        <div className="p-4 bg-eink-surface border-2 border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical shadow-eink-sm animate-pulse">
          <div className="space-y-2">
            <div className="h-2.5 w-32 bg-eink-border/40 rounded-xs" />
            <div className="h-4 w-64 bg-eink-border/50 rounded-xs" />
          </div>
          <div className="h-8 w-28 bg-eink-border/40 rounded-xs" />
        </div>
      ) : (
        <div className="p-4 bg-eink-surface border-2 border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical shadow-eink-sm">
          <div>
            <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
              SHIORI HOME • TODAY
            </span>
            <h2 className="text-sm sm:text-base font-bold text-eink-text uppercase mt-0.5">
              {totalActiveTodos} TODOs remaining · {totalCompletedTodos} completed · {totalCommitsToday} commits recorded
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* User Points Badge */}
            <div className="px-2.5 py-1 bg-eink-bg border border-eink-border rounded-sm font-mono text-xs font-bold text-eink-text">
              {user?.points ?? 120} SHIORI POINTS
            </div>

            <button
              onClick={() => setIsAddProjectOpen(true)}
              className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] text-xs font-technical cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ ADD PROJECT</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. MY PROJECTS CARDS GRID (Project = GitHub Repository) */}
      <div className="space-y-4 font-technical">
        <div className="flex items-center justify-between border-b border-eink-border pb-2">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
              MY PROJECTS ({loading ? '...' : projects.length})
            </h3>
          </div>
          <span className="text-[11px] text-eink-textSecondary">
            Every TODO belongs to exactly one project
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 bg-eink-surface border-2 border-eink-border rounded-sm space-y-3 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-4 w-32 bg-eink-border/40 rounded-xs" />
                  <div className="h-4 w-14 bg-eink-border/30 rounded-xs" />
                </div>
                <div className="h-16 bg-eink-border/20 rounded-xs" />
                <div className="h-3 w-24 bg-eink-border/30 rounded-xs" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => navigate(`/projects/${proj.id}`)}
                className="p-5 bg-eink-surface border-2 border-eink-border hover:border-eink-text hover:bg-eink-surfaceHover cursor-pointer rounded-sm space-y-3.5 transition-all shadow-eink-sm group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0">
                    <span className="font-bold text-sm text-eink-text uppercase tracking-tight block truncate group-hover:underline">
                      {proj.name}
                    </span>
                    <p className="text-[10px] text-eink-textMuted font-mono truncate">
                      repo: {proj.github_repo_name}
                    </p>
                  </div>
                  <span className="text-[10px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded font-mono font-bold shrink-0">
                    {proj.active_todos ?? 0} TODOs
                  </span>
                </div>

                <div className="space-y-1 text-xs text-eink-textSecondary font-mono border-t border-b border-eink-border/50 py-2.5">
                  <div className="flex justify-between">
                    <span>Members:</span>
                    <strong className="text-eink-text">{proj.membersCount || 1} members</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Repository commits:</span>
                    <span>{proj.commitsTodayCount || 0} commits</span>
                  </div>
                  <p className="text-[10px] text-eink-textMuted truncate pt-0.5">
                    Last: {proj.lastCommitMessage}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="text-[10px] text-eink-textMuted font-mono">
                    branch: {proj.default_branch || 'main'}
                  </span>
                  <span className="font-bold text-eink-text flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    OPEN PROJECT →
                  </span>
                </div>
              </div>
            ))}

            {/* Add Project Placeholder Card */}
            <div
              onClick={() => setIsAddProjectOpen(true)}
              className="p-5 bg-eink-surface/40 border-2 border-dashed border-eink-border hover:border-eink-text cursor-pointer rounded-sm flex flex-col items-center justify-center text-center space-y-2 min-h-[180px] transition-colors"
            >
              <div className="w-8 h-8 rounded-full border border-eink-border flex items-center justify-center text-eink-text">
                <Plus className="w-4 h-4" />
              </div>
              <span className="font-bold text-xs text-eink-text uppercase">ADD GITHUB PROJECT</span>
              <p className="text-[10px] text-eink-textMuted font-sans max-w-[200px]">
                Select a repository to create a shared project. No new GitHub login.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. YOUR INTENTIONAL SHIORI ID */}
      <div className="p-4 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical text-xs shadow-eink-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-eink-text" />
            <span className="font-bold text-xs uppercase text-eink-text">YOUR INTENTIONAL SHIORI ID</span>
          </div>
          <p className="text-[11px] text-eink-textSecondary font-sans">
            Share this exact ID with collaborators to initiate two-sided email OTP verified connections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-eink-bg px-3 py-1.5 border border-eink-border rounded font-mono font-bold tracking-widest text-sm text-eink-text select-all">
            {user?.shiori_id || 'SHI-3A91M'}
          </div>
          <button
            onClick={handleCopyShioriId}
            className="px-3 py-1.5 border border-eink-border hover:bg-eink-bg font-bold rounded flex items-center gap-1.5"
          >
            {copiedId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedId ? 'COPIED' : 'COPY'}</span>
          </button>
        </div>
      </div>

      {/* ADD PROJECT MODAL */}
      {isAddProjectOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-technical select-none">
          <div className="bg-eink-bg border-2 border-eink-text w-full max-w-md rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-eink-text" />
                <h3 className="font-bold text-sm uppercase text-eink-text">
                  CREATE NEW PROJECT
                </h3>
              </div>
              <button onClick={() => setIsAddProjectOpen(false)} className="p-1 text-eink-textMuted hover:text-eink-text">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs font-technical">
              <div>
                <label className="block text-[11px] font-bold text-eink-textMuted uppercase mb-1">
                  SELECT GITHUB REPOSITORY *
                </label>
                <div className="border border-eink-border rounded-sm divide-y divide-eink-border bg-eink-surface max-h-56 overflow-y-auto">
                  {availableRepos.map((repo) => (
                    <label
                      key={repo.name}
                      className="p-3 flex items-center justify-between hover:bg-eink-surfaceHover cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="selectedRepo"
                          value={repo.name}
                          checked={selectedRepoName === repo.name}
                          onChange={(e) => setSelectedRepoName(e.target.value)}
                          className="accent-eink-text"
                        />
                        <div>
                          <span className="font-bold text-eink-text font-mono">{repo.name}</span>
                          <p className="text-[10px] text-eink-textMuted font-sans">{repo.description || 'GitHub Repository'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-eink-textMuted font-mono">{repo.default_branch}</span>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-eink-textSecondary font-sans">
                The selected repository becomes the project with its own TODOs, members, and Git history.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-eink-border">
                <button
                  type="button"
                  onClick={() => setIsAddProjectOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedRepoName}
                  className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'CREATING...' : 'CREATE PROJECT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
