import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Github,
  ShieldCheck,
  AlertTriangle,
  Search,
  Lock,
  Globe,
  GitBranch,
  FolderGit2,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../utils/api';

interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar?: string;
  description: string;
  isPrivate: boolean;
  defaultBranch: string;
  htmlUrl: string;
  updatedAt: string;
  starsCount: number;
  language?: string;
  isConnected?: boolean;
  projectId?: string | null;
}

export const OnboardingPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // Repositories state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [connectingRepoId, setConnectingRepoId] = useState<string | null>(null);
  const [connectedProject, setConnectedProject] = useState<{ id: string; name: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL errors & GitHub connection status
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const githubParam = searchParams.get('github');

    if (errorParam) {
      if (errorParam === 'access_denied') {
        setErrorMessage('GitHub authorization was cancelled. Please authorize to access your repositories.');
      } else {
        setErrorMessage(`GitHub authorization failed (${errorParam}). Please try connecting again.`);
      }
    }

    if (githubParam === 'connected') {
      setIsAuthorized(true);
      fetchRepositories();
    }

    const initOnboarding = async () => {
      try {
        setCheckingStatus(true);
        const { ok, data } = await fetchJson('/api/github/status');
        if (ok && data?.connected) {
          setIsAuthorized(true);
          setGithubUsername(data.username);
          updateUser({ github_connected: 1, github_username: data.username });
          await fetchRepositories();
        } else if (user?.github_connected || githubParam === 'connected') {
          setIsAuthorized(true);
          setGithubUsername(user?.github_username || 'developer');
          await fetchRepositories();
        }
      } catch (err) {
        console.error('Failed to check GitHub status:', err);
      } finally {
        setCheckingStatus(false);
      }
    };

    initOnboarding();
  }, [searchParams, user?.github_connected]);

  const fetchRepositories = async () => {
    try {
      setLoadingRepos(true);
      const { ok, data } = await fetchJson('/api/github/available-repositories');
      if (ok && data?.repositories) {
        setRepositories(data.repositories);
        const alreadyConnected = data.repositories.find((r: Repository) => r.isConnected && r.projectId);
        if (alreadyConnected) {
          setConnectedProject({ id: alreadyConnected.projectId!, name: alreadyConnected.name });
        }
      } else if (data?.error) {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      console.error('Error loading repositories:', err);
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleAuthorizeGitHub = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { ok, data } = await fetchJson('/api/github/oauth/url?returnUrl=/onboarding');
      if (ok && data?.url) {
        window.location.href = data.url;
        return;
      } else {
        setErrorMessage(data?.error || 'Unable to initiate GitHub OAuth session.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error while connecting to GitHub.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRepository = async (repo: Repository) => {
    setConnectingRepoId(repo.id);
    setErrorMessage(null);

    try {
      const { ok, data } = await fetchJson('/api/github/repositories/connect', {
        method: 'POST',
        body: JSON.stringify({
          repoId: repo.id,
          repoName: repo.name,
          repoFullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          description: repo.description
        })
      });

      if (ok && data?.project) {
        setConnectedProject({
          id: data.project.id,
          name: data.project.name
        });

        // Mark repository as connected in local list
        setRepositories((prev) =>
          prev.map((r) => (r.id === repo.id ? { ...r, isConnected: true, projectId: data.project.id } : r))
        );
      } else {
        setErrorMessage(data?.error || 'Failed to connect repository.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error while connecting repository.');
    } finally {
      setConnectingRepoId(null);
    }
  };

  const handleOpenWorkspace = () => {
    if (connectedProject) {
      navigate(`/projects/${connectedProject.id}`);
    } else {
      navigate('/home');
    }
  };

  const filteredRepos = repositories.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-4 pt-16 sm:pt-20 eink-paper font-sans select-none">
      <div className="w-full max-w-2xl bg-eink-surface border border-eink-border p-6 sm:p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Brand */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-[10px] text-eink-textMuted uppercase tracking-wider">
            {isAuthorized ? 'Repository Workspace Setup' : 'GitHub Authorization'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-eink-bg border border-red-500/50 text-red-600 rounded-sm text-xs font-technical flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">NOTICE:</span> {errorMessage}
            </div>
          </div>
        )}

        {/* STEP 1: GITHUB AUTHORIZATION (If not authorized yet) */}
        {!isAuthorized && (
          <div className="space-y-6 py-2">
            <div className="space-y-2 text-center">
              <h2 className="text-base font-bold text-eink-text uppercase">
                CONNECT YOUR GITHUB ACCOUNT
              </h2>
              <p className="text-xs text-eink-textSecondary leading-relaxed font-sans max-w-md mx-auto">
                Authorize SHIORI to import your code repository into an e-ink workspace, link development TODOs to commits, and track automated CI checks.
              </p>
            </div>

            {/* Permissions list */}
            <div className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-3 text-xs">
              <span className="text-[10px] font-bold text-eink-textMuted uppercase tracking-wider block border-b border-eink-border pb-1.5">
                REQUESTED GITHUB PERMISSIONS
              </span>

              <div className="space-y-2 font-sans text-xs">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-eink-text">Repository Access (Public & Private):</span>
                    <p className="text-[11px] text-eink-textSecondary">Retrieve your repositories so you can bring your codebase into SHIORI.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-eink-text">Webhook CI Verification:</span>
                    <p className="text-[11px] text-eink-textSecondary">Receive GitHub Actions test results to auto-complete verified tasks.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleAuthorizeGitHub}
                disabled={loading || checkingStatus}
                className="w-full py-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-2 shadow-eink-sm hover:opacity-90 transition-opacity"
              >
                <Github className="w-4 h-4" />
                <span>{loading ? 'CONNECTING TO GITHUB...' : 'AUTHORIZE WITH GITHUB'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/home')}
                disabled={loading}
                className="w-full py-2.5 border border-eink-border text-eink-text text-xs font-bold rounded-sm hover:bg-eink-bg transition-colors"
              >
                SKIP FOR NOW
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: REPOSITORY PICKER (When authorized) */}
        {isAuthorized && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-eink-text uppercase">CHOOSE A REPOSITORY</h2>
                <p className="text-xs text-eink-textSecondary font-sans">
                  Select a repository to create your SHIORI workspace.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 bg-eink-bg border border-eink-border rounded-sm">
                <Github className="w-3.5 h-3.5 text-eink-text" />
                <span className="font-bold text-eink-text">@{githubUsername || 'developer'}</span>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-eink-textMuted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search repositories by name or description..."
                className="w-full pl-9 pr-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans text-eink-text outline-none"
              />
            </div>

            {/* Repositories List */}
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {loadingRepos ? (
                <div className="py-12 text-center text-xs text-eink-textMuted font-technical space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-eink-text" />
                  <p>Fetching repositories from GitHub...</p>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-eink-border rounded-sm space-y-2 text-xs">
                  <FolderGit2 className="w-6 h-6 text-eink-textMuted mx-auto" />
                  <p className="font-bold text-eink-text">No repositories found</p>
                  <p className="text-[11px] text-eink-textSecondary font-sans">
                    {searchQuery ? `No matches for "${searchQuery}"` : 'Create a repository on GitHub or check permissions.'}
                  </p>
                </div>
              ) : (
                filteredRepos.map((repo) => {
                  const isConnecting = connectingRepoId === repo.id;
                  const isConnected = repo.isConnected || (connectedProject && connectedProject.name === repo.name);

                  return (
                    <div
                      key={repo.id}
                      className={`p-3.5 bg-eink-bg border rounded-sm transition-all flex items-center justify-between gap-4 ${
                        isConnected ? 'border-eink-text shadow-sm' : 'border-eink-border hover:border-eink-text'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-eink-text font-mono truncate">{repo.name}</span>
                          
                          {/* Private/Public badge */}
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-sm font-technical flex items-center gap-1 border ${
                              repo.isPrivate
                                ? 'bg-eink-surface border-eink-border text-eink-text'
                                : 'bg-transparent border-eink-border text-eink-textSecondary'
                            }`}
                          >
                            {repo.isPrivate ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                            <span>{repo.isPrivate ? 'PRIVATE' : 'PUBLIC'}</span>
                          </span>

                          {/* Default branch badge */}
                          <span className="text-[9px] text-eink-textMuted font-mono flex items-center gap-0.5">
                            <GitBranch className="w-2.5 h-2.5" />
                            <span>{repo.defaultBranch}</span>
                          </span>
                        </div>

                        <div className="text-[11px] text-eink-textSecondary font-sans truncate">
                          {repo.fullName}
                          {repo.description ? ` — ${repo.description}` : ''}
                        </div>
                      </div>

                      {/* Connect / Open Action */}
                      <div className="shrink-0">
                        {isConnected ? (
                          <button
                            type="button"
                            onClick={handleOpenWorkspace}
                            className="px-3 py-1.5 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center gap-1 shadow-eink-sm hover:opacity-90"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>OPEN</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConnectRepository(repo)}
                            disabled={isConnecting}
                            className="px-3 py-1.5 border border-eink-border text-eink-text text-xs font-bold rounded-sm hover:bg-eink-surface flex items-center gap-1"
                          >
                            {isConnecting ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>CONNECTING...</span>
                              </>
                            ) : (
                              <span>CONNECT</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-2 pt-2 border-t border-eink-border">
              <button
                type="button"
                onClick={() => navigate('/home')}
                className="flex-1 py-2.5 border border-eink-border text-eink-text text-xs font-bold rounded-sm hover:bg-eink-bg transition-colors"
              >
                SKIP FOR NOW
              </button>

              {connectedProject && (
                <button
                  type="button"
                  onClick={handleOpenWorkspace}
                  className="flex-1 py-2.5 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-1.5 hover:opacity-90"
                >
                  <span>OPEN SHIORI WORKSPACE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
