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
import { DashboardSkeleton } from '../components/ui/Skeleton';

export const DashboardPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<any[]>(() => {
    try {
      const cached = sessionStorage.getItem('shiori_cached_projects');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [availableRepos, setAvailableRepos] = useState<any[]>(() => {
    try {
      const cached = sessionStorage.getItem('shiori_cached_repos');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [selectedRepoName, setSelectedRepoName] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !sessionStorage.getItem('shiori_cached_projects'));
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const fetchHomeData = async () => {
    if (!token) return;
    try {
      const [projRes, repoRes, inviteRes] = await Promise.all([
        fetchJson('/api/projects'),
        fetchJson('/api/github/available-repositories'),
        fetchJson('/api/projects/invitations/pending')
      ]);

      if (projRes.ok && projRes.data?.projects) {
        setProjects(projRes.data.projects);
        sessionStorage.setItem('shiori_cached_projects', JSON.stringify(projRes.data.projects));
      }

      if (inviteRes.ok && inviteRes.data?.invitations) {
        setPendingInvitations(inviteRes.data.invitations);
      }

      if (repoRes.ok && repoRes.data?.repositories) {
        const repos = repoRes.data.repositories;
        setAvailableRepos(repos);
        sessionStorage.setItem('shiori_cached_repos', JSON.stringify(repos));
        if (repos.length > 0 && !selectedRepoName) {
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

  const handleRespondInvitation = async (inviteId: string, action: 'ACCEPT' | 'DECLINE') => {
    if (!token) return;
    try {
      const { ok } = await fetchJson(`/api/projects/invitations/${inviteId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      if (ok) {
        triggerEInkRefresh();
        fetchHomeData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const totalActiveTodos = projects.reduce((sum, p) => sum + (p.active_todos || 0), 0);
  const totalCompletedTodos = projects.reduce((sum, p) => sum + (p.completed_tasks || 0), 0);
  const totalCommitsToday = projects.reduce((sum, p) => sum + (p.commitsTodayCount || 0), 0);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8 select-none font-sans pb-12 animate-fade-in">
      {/* 1. TODAY SUMMARY STRIP */}
      <div className="p-4 bg-eink-surface border-2 border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-technical shadow-eink-sm">
        <div>
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
            SHIORI HOME • TODAY
          </span>
          <h2 className="text-sm sm:text-base font-bold text-eink-text uppercase mt-0.5">
            {totalActiveTodos} TODOs remaining · {totalCompletedTodos} completed · {totalActiveTodos + totalCompletedTodos} total
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

      {/* PENDING PROJECT INVITATIONS BANNER */}
      {pendingInvitations.length > 0 && (
        <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm space-y-3 shadow-eink-card animate-fade-in font-technical">
          <div className="flex items-center justify-between border-b border-eink-border pb-2">
            <span className="font-bold text-xs uppercase text-eink-text tracking-wider flex items-center gap-2">
              <span>✉️</span>
              <span>PENDING PROJECT INVITATIONS ({pendingInvitations.length})</span>
            </span>
            <span className="text-[11px] text-eink-textSecondary">
              Click Accept to join workspace & collaborate
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 bg-eink-bg border border-eink-border rounded-sm space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm text-eink-text uppercase truncate">
                      {inv.project_name}
                    </span>
                    <span className="text-[10px] bg-eink-surface px-1.5 py-0.2 border border-eink-border rounded font-mono font-bold shrink-0">
                      ROLE: {inv.role || 'MEMBER'}
                    </span>
                  </div>
                  <p className="text-xs text-eink-textSecondary">
                    Invited by <strong className="text-eink-text font-mono">{inv.inviter_name}</strong> ({inv.inviter_shiori_id})
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-eink-border/50">
                  <button
                    type="button"
                    onClick={() => handleRespondInvitation(inv.id, 'DECLINE')}
                    className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs text-eink-textSecondary hover:text-eink-text rounded-sm cursor-pointer"
                  >
                    DECLINE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespondInvitation(inv.id, 'ACCEPT')}
                    className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm hover:opacity-90 flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ACCEPT INVITATION</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. MY PROJECTS CARDS GRID (Project = GitHub Repository) */}
      <div className="space-y-4 font-technical">
        <div className="flex items-center justify-between border-b border-eink-border pb-2">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-eink-text" />
            <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
              MY PROJECTS ({projects.length})
            </h3>
          </div>
          <span className="text-[11px] text-eink-textSecondary">
            Every TODO belongs to exactly one project
          </span>
        </div>

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
                    {proj.total_tasks !== undefined
                      ? `${proj.active_todos || 0} active · ${proj.completed_tasks || 0} done`
                      : `${proj.active_todos ?? 0} TODOs`}
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
