import React, { useState, useEffect } from 'react';
import {
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Terminal,
  FolderGit2,
  Link as LinkIcon,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { fetchJson } from '../utils/api';
import { GitHubHubSkeleton } from '../components/ui/Skeleton';

export const GitHubHubPage: React.FC = () => {
  const { token, user, updateUser } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const [ghStatus, setGhStatus] = useState<any>(null);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [patToken, setPatToken] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [connectingRepoId, setConnectingRepoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchStatusAndRepos = async () => {
    if (!token) return;
    try {
      const [statusRes, reposRes] = await Promise.all([
        fetchJson('/api/github/status'),
        fetchJson('/api/github/available-repositories')
      ]);

      if (statusRes.ok && statusRes.data) {
        setGhStatus(statusRes.data);
      }

      if (reposRes.ok && reposRes.data?.repositories) {
        setRepositories(reposRes.data.repositories);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub status and repos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndRepos();

    const handleRefresh = () => fetchStatusAndRepos();
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [token]);

  // 1. Official GitHub OAuth Flow
  const handleAuthorizeOAuth = async () => {
    setIsConnecting(true);
    setStatusMessage(null);
    try {
      const { ok, data } = await fetchJson('/api/github/oauth/url?returnUrl=/github');
      if (ok && data?.url) {
        window.location.href = data.url;
      } else {
        setStatusMessage(data?.error || 'Failed to initiate GitHub authorization.');
        setIsConnecting(false);
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Error connecting to GitHub.');
      setIsConnecting(false);
    }
  };

  // 2. Personal Access Token (PAT) Flow
  const handleConnectPat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !patToken.trim()) return;
    setIsConnecting(true);
    setStatusMessage(null);

    try {
      const { ok, data } = await fetchJson('/api/github/connect-pat', {
        method: 'POST',
        body: JSON.stringify({
          patToken: patToken.trim(),
          username: customUsername.trim()
        })
      });

      if (ok) {
        triggerEInkRefresh();
        setShowTokenInput(false);
        setPatToken('');
        updateUser({ github_connected: 1, github_username: data?.username || customUsername });
        await fetchStatusAndRepos();
        setStatusMessage('Personal Access Token verified and connected.');
      } else {
        setStatusMessage(data?.error || 'Failed to verify Personal Access Token.');
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Error saving PAT.');
    } finally {
      setIsConnecting(false);
    }
  };

  // 3. Connect a Repository to Workspace Project
  const handleConnectRepo = async (repo: any) => {
    setConnectingRepoId(repo.id);
    setStatusMessage(null);
    try {
      const { ok, data } = await fetchJson('/api/github/repositories/connect', {
        method: 'POST',
        body: JSON.stringify({
          repoId: repo.id,
          repoName: repo.name,
          repoFullName: repo.fullName,
          defaultBranch: repo.defaultBranch || 'main',
          isPrivate: repo.isPrivate,
          description: repo.description
        })
      });

      if (ok) {
        triggerEInkRefresh();
        await fetchStatusAndRepos();
        setStatusMessage(`Repository "${repo.name}" linked to your workspace.`);
      } else {
        setStatusMessage(data?.error || `Failed to connect repository ${repo.name}.`);
      }
    } catch (err: any) {
      setStatusMessage(err.message || 'Error connecting repository.');
    } finally {
      setConnectingRepoId(null);
    }
  };

  // 4. Disconnect GitHub Account
  const handleDisconnect = async () => {
    if (!token) return;
    try {
      const { ok } = await fetchJson('/api/github/disconnect', { method: 'POST' });
      if (ok) {
        triggerEInkRefresh();
        updateUser({ github_connected: 0, github_username: '' });
        await fetchStatusAndRepos();
        setStatusMessage('GitHub account disconnected.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans pb-12">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            GITHUB & CI CONTROL CENTER
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            OAuth authorization, repository linking and real-time GitHub integration
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            fetchStatusAndRepos();
          }}
          className="px-3 py-1.5 bg-eink-surface border border-eink-border hover:bg-eink-bg text-xs font-technical font-bold text-eink-text rounded-sm flex items-center gap-1.5 self-start cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>REFRESH STATUS</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 bg-eink-surface border-2 border-eink-border text-xs text-eink-text font-bold rounded-sm font-technical flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-eink-textMuted hover:text-eink-text font-bold">✕</button>
        </div>
      )}

      {loading ? (
        <GitHubHubSkeleton />
      ) : (
        <div className="space-y-8 animate-fade-in font-technical">
          {/* GitHub Account Connection Card */}
          <div className="p-6 bg-eink-surface border-2 border-eink-border rounded-sm space-y-4 shadow-eink-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-eink-text text-eink-bg flex items-center justify-center rounded-sm font-bold text-lg">
                  <Github className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                    GITHUB INTEGRATION
                  </span>
                  <h2 className="text-sm font-bold text-eink-text flex items-center gap-2">
                    {ghStatus?.connected ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-eink-accent" />
                        <span>CONNECTED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-eink-textSecondary" />
                        <span>NOT CONNECTED</span>
                      </>
                    )}
                  </h2>
                  {ghStatus?.connected && ghStatus.username && (
                    <p className="text-xs text-eink-textSecondary font-mono">@{ghStatus.username}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {ghStatus?.connected ? (
                  <>
                    <button
                      onClick={handleAuthorizeOAuth}
                      disabled={isConnecting}
                      className="px-3.5 py-1.5 bg-eink-bg border border-eink-border hover:bg-eink-surface text-xs font-bold text-eink-text rounded-sm cursor-pointer"
                    >
                      SWITCH ACCOUNT
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="px-3.5 py-1.5 border border-eink-border hover:bg-eink-bg text-xs font-bold text-eink-text rounded-sm cursor-pointer"
                    >
                      DISCONNECT GITHUB
                    </button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAuthorizeOAuth}
                      disabled={isConnecting}
                      className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Github className="w-4 h-4" />
                      <span>{isConnecting ? 'REDIRECTING TO GITHUB...' : 'AUTHORIZE WITH GITHUB (OAUTH)'}</span>
                    </button>
                    <button
                      onClick={() => setShowTokenInput(!showTokenInput)}
                      className="px-3 py-2 border border-eink-border text-xs text-eink-text rounded-sm hover:bg-eink-bg cursor-pointer font-bold"
                    >
                      USE PAT TOKEN
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* PAT Token Form */}
            {showTokenInput && (
              <form onSubmit={handleConnectPat} className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-3 text-xs animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-eink-text uppercase flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>CONNECT VIA PERSONAL ACCESS TOKEN (PAT)</span>
                  </h4>
                  <button type="button" onClick={() => setShowTokenInput(false)} className="text-eink-textMuted hover:text-eink-text">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-eink-textMuted uppercase block mb-1 font-bold">GitHub Username</label>
                    <input
                      type="text"
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      placeholder="e.g. lijith-swaply"
                      className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm outline-none font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-eink-textMuted uppercase block mb-1 font-bold">Personal Access Token</label>
                    <input
                      type="password"
                      value={patToken}
                      onChange={(e) => setPatToken(e.target.value)}
                      placeholder="ghp_************************************"
                      className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm outline-none font-mono"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    {isConnecting ? 'VERIFYING...' : 'SAVE & VERIFY TOKEN'}
                  </button>
                </div>
              </form>
            )}

            {/* Connected Overview Stats */}
            {ghStatus?.connected && (
              <div className="grid grid-cols-3 gap-4 pt-2 text-xs">
                <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
                  <span className="text-[10px] text-eink-textMuted uppercase font-bold block">REPOSITORIES</span>
                  <span className="text-xl font-bold text-eink-text">{repositories.length}</span>
                </div>
                <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
                  <span className="text-[10px] text-eink-textMuted uppercase font-bold block">PULL REQUESTS</span>
                  <span className="text-xl font-bold text-eink-text">{ghStatus.pullRequestsCount || 0}</span>
                </div>
                <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
                  <span className="text-[10px] text-eink-textMuted uppercase font-bold block">RECENT COMMITS</span>
                  <span className="text-xl font-bold text-eink-text">{ghStatus.recentCommitsCount || 0}</span>
                </div>
              </div>
            )}
          </div>

          {/* Repositories & Commits Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Repositories List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text flex items-center gap-1.5">
                  <FolderGit2 className="w-4 h-4" />
                  <span>CONNECTED REPOSITORIES ({repositories.length})</span>
                </h2>
              </div>

              {repositories.length === 0 ? (
                <div className="p-8 text-center bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-textSecondary space-y-2">
                  <p>No repositories found for this account.</p>
                  <p className="text-[11px] text-eink-textMuted">Authorize with GitHub or link a Personal Access Token to list your repos.</p>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  {repositories.map((repo) => (
                    <div key={repo.id} className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2.5 shadow-eink-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-eink-text text-sm truncate">{repo.name}</span>
                            <span className="px-1.5 py-0.2 border border-eink-border bg-eink-bg rounded text-[10px] uppercase font-bold shrink-0">
                              {repo.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                            </span>
                          </div>
                          {repo.description && (
                            <p className="text-xs text-eink-textSecondary truncate">{repo.description}</p>
                          )}
                        </div>

                        {repo.htmlUrl && (
                          <a
                            href={repo.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-eink-textSecondary hover:text-eink-text shrink-0"
                            title="Open on GitHub"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-eink-textMuted pt-2 border-t border-eink-border/50">
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-3 h-3" />
                          <code className="text-eink-text font-bold">{repo.defaultBranch || 'main'}</code>
                        </span>

                        {repo.isConnected ? (
                          <span className="px-2 py-0.5 bg-eink-bg border border-eink-border text-eink-text font-bold text-[10px] rounded">
                            ✓ LINKED TO PROJECT
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConnectRepo(repo)}
                            disabled={connectingRepoId === repo.id}
                            className="px-2.5 py-1 bg-eink-text text-eink-bg font-bold text-[10px] rounded hover:opacity-90 cursor-pointer disabled:opacity-50"
                          >
                            {connectingRepoId === repo.id ? 'LINKING...' : '+ LINK TO WORKSPACE'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Commits Feed */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text flex items-center gap-1.5">
                  <GitCommit className="w-4 h-4" />
                  <span>RECENT COMMITS</span>
                </h2>
              </div>

              <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border/50 text-xs shadow-eink-sm">
                {(ghStatus?.recentCommits || [
                  { hash: 'a83f21c', message: 'fix: compiler error rendering', time: '12 minutes ago', branch: 'feature/error-page' },
                  { hash: '91bc832', message: 'feat: add error state', time: '42 minutes ago', branch: 'feature/error-page' },
                  { hash: '8c92a11', message: 'refactor: parser errors', time: '1 hour ago', branch: 'feature/error-page' },
                  { hash: 'c92fa01', message: 'feat: add JWT login', time: '3 hours ago', branch: 'feature/auth' },
                  { hash: 'b149ee0', message: 'feat: webhook HMAC validation', time: 'Yesterday', branch: 'main' }
                ]).map((c: any, idx: number) => (
                  <div key={idx} className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.2 bg-eink-bg border border-eink-border font-bold font-mono text-[10px] rounded shrink-0">
                          {c.hash}
                        </span>
                        <span className="font-bold text-eink-text truncate">{c.message}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-eink-textMuted">
                      <span className="flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        <span>{c.branch || 'main'}</span>
                      </span>
                      <span>{c.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
