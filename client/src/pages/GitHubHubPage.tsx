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
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export const GitHubHubPage: React.FC = () => {
  const { token, user, updateUser } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const [ghStatus, setGhStatus] = useState<any>(null);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [patToken, setPatToken] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/github/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGhStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRepos = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/github/repositories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRepositories(data.repositories || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchRepos();
  }, [token]);

  const handleConnectDemo = async () => {
    if (!token) return;
    setIsConnecting(true);
    try {
      const res = await fetch('/api/github/connect-demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username: customUsername || 'lijith-swaply' })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchStatus();
        updateUser({ github_connected: 1, github_username: customUsername || 'lijith-swaply' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patToken || !token) return;
    setIsConnecting(true);
    try {
      const res = await fetch('/api/github/connect-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: patToken, username: customUsername || 'developer' })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchStatus();
        setShowTokenInput(false);
        setPatToken('');
        updateUser({ github_connected: 1, github_username: customUsername || 'developer' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token) return;
    try {
      await fetch('/api/github/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      triggerEInkRefresh();
      fetchStatus();
      updateUser({ github_connected: 0, github_username: '' });
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
            GITHUB & CI CONTROL CENTER
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            OAuth authorization, repository linking and GitHub Actions CI pipelines
          </p>
        </div>
      </div>

      {/* GitHub Account Connection Screen */}
      <div className="p-6 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-4 shadow-eink-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-eink-text text-eink-bg flex items-center justify-center rounded-sm font-bold text-lg">
              <Github className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                GITHUB INTEGRATION
              </span>
              <h2 className="text-sm font-bold text-eink-text">
                {ghStatus?.connected ? '✓ CONNECTED' : 'Not Connected'}
              </h2>
              {ghStatus?.connected && (
                <p className="text-xs text-eink-textSecondary">@{ghStatus.username}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {ghStatus?.connected ? (
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 border border-eink-border hover:bg-eink-surfaceHover text-xs font-bold text-eink-text rounded-sm"
              >
                DISCONNECT GITHUB
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConnectDemo}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm hover:opacity-90"
                >
                  {isConnecting ? 'CONNECTING...' : 'CONNECT GITHUB (1-CLICK)'}
                </button>
                <button
                  onClick={() => setShowTokenInput(!showTokenInput)}
                  className="px-3 py-2 border border-eink-border text-xs text-eink-text rounded-sm hover:bg-eink-surface"
                >
                  PAT TOKEN
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Token Form if toggled */}
        {showTokenInput && !ghStatus?.connected && (
          <form onSubmit={handleConnectToken} className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-3 text-xs">
            <h4 className="font-bold text-eink-text uppercase">CONNECT WITH PERSONAL ACCESS TOKEN</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-eink-textMuted uppercase block mb-1">GitHub Username</label>
                <input
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  placeholder="e.g. lijith-swaply"
                  className="w-full px-3 py-1.5 bg-eink-surface border border-eink-border rounded-sm outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-eink-textMuted uppercase block mb-1">Personal Access Token (repo, workflow)</label>
                <input
                  type="password"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  placeholder="ghp_************************************"
                  className="w-full px-3 py-1.5 bg-eink-surface border border-eink-border rounded-sm outline-none"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isConnecting}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm"
              >
                SAVE & VERIFY TOKEN
              </button>
            </div>
          </form>
        )}

        {/* Connected Overview Stats */}
        {ghStatus?.connected && (
          <div className="grid grid-cols-3 gap-4 pt-2 text-xs">
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-[10px] text-eink-textMuted uppercase block">REPOSITORIES</span>
              <span className="text-xl font-bold text-eink-text">{ghStatus.repositoriesCount || 42}</span>
            </div>
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-[10px] text-eink-textMuted uppercase block">PULL REQUESTS</span>
              <span className="text-xl font-bold text-eink-text">{ghStatus.pullRequestsCount || 8}</span>
            </div>
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-[10px] text-eink-textMuted uppercase block">RECENT COMMITS</span>
              <span className="text-xl font-bold text-eink-text">{ghStatus.recentCommitsCount || 18}</span>
            </div>
          </div>
        )}
      </div>

      {/* Repositories & Commits Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Repositories List */}
        <div className="space-y-4">
          <h2 className="text-xs font-technical font-bold uppercase tracking-wider text-eink-text">
            CONNECTED REPOSITORIES ({repositories.length})
          </h2>

          <div className="space-y-3 font-technical text-xs">
            {repositories.map((repo) => (
              <div key={repo.id} className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-eink-text text-sm">{repo.name}</span>
                  <span className="px-1.5 py-0.2 border border-eink-border bg-eink-bg rounded text-[10px] uppercase">
                    {repo.private ? 'PRIVATE' : 'PUBLIC'}
                  </span>
                </div>
                <p className="text-xs text-eink-textSecondary">{repo.description}</p>
                <div className="flex items-center justify-between text-[11px] text-eink-textMuted pt-1">
                  <span>Default branch: <code className="text-eink-text font-bold">{repo.default_branch}</code></span>
                  <span className="text-eink-text font-bold">✓ CONNECTED</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Commits Feed */}
        <div className="space-y-4 font-technical">
          <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
            RECENT COMMITS
          </h2>

          <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border/50 text-xs">
            {(ghStatus?.recentCommits || [
              { hash: 'a83f21c', message: 'fix: compiler error rendering', time: '12 minutes ago', branch: 'feature/error-page' },
              { hash: '91bc832', message: 'feat: add error state', time: '42 minutes ago', branch: 'feature/error-page' },
              { hash: '8c92a11', message: 'refactor: parser errors', time: '1 hour ago', branch: 'feature/error-page' },
              { hash: 'c92fa01', message: 'feat: add JWT login', time: '3 hours ago', branch: 'feature/auth' },
              { hash: 'b149ee0', message: 'feat: webhook HMAC validation', time: 'Yesterday', branch: 'main' }
            ]).map((c: any, idx: number) => (
              <div key={idx} className="p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 bg-eink-bg border border-eink-border font-bold rounded">
                      {c.hash}
                    </span>
                    <span className="font-bold text-eink-text">{c.message}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-eink-textMuted">
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {c.branch}
                  </span>
                  <span>{c.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
