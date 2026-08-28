import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Github, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../utils/api';

export const OnboardingPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<{ username: string; avatarUrl?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL query parameters & backend GitHub status
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      if (errorParam === 'access_denied') {
        setErrorMessage('GitHub authorization was cancelled. Please authorize to connect your repositories.');
      } else {
        setErrorMessage(`GitHub authorization failed (${errorParam}). Please try connecting again.`);
      }
    }

    const checkGitHubStatus = async () => {
      try {
        setCheckingStatus(true);
        const { ok, data } = await fetchJson('/api/github/status');
        if (ok && data?.connected) {
          setIsConnected(true);
          setGithubUser({
            username: data.username,
            avatarUrl: data.avatarUrl
          });
          updateUser({ github_connected: 1, github_username: data.username });
        } else if (user?.github_connected) {
          setIsConnected(true);
          setGithubUser({
            username: user.github_username || 'developer',
            avatarUrl: user.avatar_url
          });
        }
      } catch (err) {
        console.error('Failed to check GitHub status:', err);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkGitHubStatus();
  }, [searchParams, user]);

  const handleAuthorizeGitHub = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { ok, data } = await fetchJson('/api/github/oauth/url?returnUrl=/onboarding');
      if (ok && data?.url) {
        window.location.href = data.url;
        return;
      } else {
        setErrorMessage(data?.error || 'Unable to initiate GitHub OAuth session. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error while connecting to GitHub.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate('/home');
  };

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-4 pt-16 sm:pt-20 eink-paper font-sans select-none">
      <div className="w-full max-w-lg bg-eink-surface border border-eink-border p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Brand */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-[10px] text-eink-textMuted uppercase tracking-wider">GitHub Onboarding & Verification</p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-eink-bg border border-red-500/50 text-red-600 rounded-sm text-xs font-technical flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">AUTHORIZATION NOTICE:</span> {errorMessage}
            </div>
          </div>
        )}

        {/* CONNECTED STATE */}
        {isConnected ? (
          <div className="space-y-6 py-2 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-eink-text text-eink-bg flex items-center justify-center mx-auto mb-2 shadow-eink-sm">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h2 className="text-base font-bold text-eink-text uppercase">GITHUB ACCOUNT CONNECTED</h2>
              <p className="text-xs text-eink-textSecondary font-sans max-w-sm mx-auto">
                Your GitHub account is authorized. SHIORI is ready to track commits, pull requests, and CI verification runs for your tasks.
              </p>
            </div>

            {/* Account Card */}
            <div className="p-4 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Github className="w-6 h-6 text-eink-text" />
                <div>
                  <div className="font-bold text-xs text-eink-text font-mono">@{githubUser?.username || 'developer'}</div>
                  <div className="text-[10px] text-eink-textMuted flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    <span>OAuth Access Granted (repo, user, read:org)</span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 border border-eink-border font-bold uppercase">ACTIVE</span>
            </div>

            <button
              onClick={handleContinue}
              className="w-full py-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-2 shadow-eink-sm hover:opacity-90 transition-opacity"
            >
              <span>CONTINUE TO SHIORI WORKSPACE</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* NOT CONNECTED STATE */
          <div className="space-y-6 py-2">
            <div className="space-y-2 text-center">
              <h2 className="text-base font-bold text-eink-text uppercase">
                CONNECT YOUR GITHUB ACCOUNT
              </h2>
              <p className="text-xs text-eink-textSecondary leading-relaxed font-sans max-w-sm mx-auto">
                SHIORI pairs your development TODOs directly with the commits, branches, and test checks you ship.
              </p>
            </div>

            {/* Requested Permissions List */}
            <div className="p-4 bg-eink-bg border border-eink-border rounded-sm space-y-3 text-xs">
              <span className="text-[10px] font-bold text-eink-textMuted uppercase tracking-wider block border-b border-eink-border pb-1.5">
                REQUIRED ACCESS PERMISSIONS
              </span>

              <div className="space-y-2 font-sans text-xs">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-eink-text">Repository Access:</span>
                    <p className="text-[11px] text-eink-textSecondary">Read commits, branches, and pull requests to link work to tasks.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-eink-text">Webhook Verification:</span>
                    <p className="text-[11px] text-eink-textSecondary">Receive GitHub Actions CI run results to auto-resolve completed tasks.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-eink-text shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-eink-text">User Identity:</span>
                    <p className="text-[11px] text-eink-textSecondary">Identify your commit author email with your SHIORI account.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
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
                onClick={handleContinue}
                disabled={loading}
                className="w-full py-2.5 border border-eink-border text-eink-text text-xs font-bold rounded-sm hover:bg-eink-bg transition-colors"
              >
                SKIP FOR NOW
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
