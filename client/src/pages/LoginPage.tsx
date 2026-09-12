import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Github, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../utils/api';

const GoogleIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'github' | 'google' | null>(null);
  const [verifyingSession, setVerifyingSession] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Listen for OAuth callback redirect (?token=... or ?error=...)
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Remove query param from browser address bar
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
      return;
    }

    if (tokenParam) {
      setVerifyingSession(true);
      (async () => {
        try {
          const { ok, data } = await fetchJson('/api/auth/me', {
            headers: {
              Authorization: `Bearer ${tokenParam}`
            }
          });

          if (ok && data?.user) {
            login(tokenParam, data.user);
            if (!data.user.github_connected) {
              navigate('/onboarding', { replace: true });
            } else {
              navigate('/home', { replace: true });
            }
          } else {
            setError(data?.error || 'Failed to authenticate social login token. Please sign in again.');
            setVerifyingSession(false);
          }
        } catch (err: any) {
          setError(err.message || 'Network error during social authentication.');
          setVerifyingSession(false);
        }
      })();
    }
  }, [searchParams, login, navigate, setSearchParams]);

  // Standard Local Sign In
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (ok && data?.token && data?.user) {
        login(data.token, data.user);
        if (!data.user.github_connected) {
          navigate('/onboarding');
        } else {
          navigate('/home');
        }
      } else {
        setError(data?.error || 'Invalid email or password.');
      }
    } catch (err: any) {
      setError(err.message || 'Network connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // OAuth GitHub Sign In
  const handleGithubLogin = async () => {
    setError('');
    setSocialLoading('github');
    try {
      const { ok, data } = await fetchJson('/api/auth/github/url');
      if (ok && data?.url) {
        window.location.href = data.url;
      } else {
        setError(data?.error || 'GitHub OAuth is not configured or failed to initialize.');
        setSocialLoading(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to GitHub OAuth service.');
      setSocialLoading(null);
    }
  };

  // OAuth Google Sign In
  const handleGoogleLogin = async () => {
    setError('');
    setSocialLoading('google');
    try {
      const { ok, data } = await fetchJson('/api/auth/google/url');
      if (ok && data?.url) {
        window.location.href = data.url;
      } else {
        setError(data?.error || 'Google Login is currently not configured on this instance. (GOOGLE_CLIENT_ID required)');
        setSocialLoading(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Google OAuth service.');
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-4 pt-16 sm:pt-20 eink-paper font-sans select-none">
      <div className="w-full max-w-md bg-eink-surface border border-eink-border p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Brand */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-[10px] text-eink-textMuted uppercase tracking-wider">A SwaplyOne product • Plan. Build. Verify.</p>
        </div>

        {verifyingSession && (
          <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-center gap-2 text-xs font-bold text-eink-text animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-eink-accent" />
            <span>VERIFYING SOCIAL SESSION • LOGGING IN...</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-eink-bg border-2 border-eink-text text-xs text-eink-text font-bold rounded-sm">
            ✕ {error}
          </div>
        )}

        {/* Social Authentication Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleGithubLogin}
            disabled={loading || Boolean(socialLoading) || verifyingSession}
            className="w-full py-2.5 px-4 bg-eink-surface border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm flex items-center justify-center gap-2.5 transition-all text-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {socialLoading === 'github' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>CONNECTING TO GITHUB...</span>
              </>
            ) : (
              <>
                <Github className="w-4 h-4" />
                <span>CONTINUE WITH GITHUB</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || Boolean(socialLoading) || verifyingSession}
            className="w-full py-2.5 px-4 bg-eink-surface border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm flex items-center justify-center gap-2.5 transition-all text-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {socialLoading === 'google' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>CONNECTING TO GOOGLE...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="w-4 h-4" />
                <span>CONTINUE WITH GOOGLE</span>
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-eink-border w-full"></div>
          <span className="bg-eink-surface px-3 text-[10px] text-eink-textMuted uppercase tracking-wider font-bold shrink-0">
            OR SIGN IN WITH EMAIL
          </span>
          <div className="border-t border-eink-border w-full"></div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">EMAIL ADDRESS OR USERNAME</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. your-email@company.com"
              className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
              autoFocus
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] text-eink-textMuted uppercase font-bold">PASSWORD</label>
              <Link
                to="/forgot-password"
                className="text-[11px] text-eink-textMuted hover:text-eink-text underline font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || Boolean(socialLoading) || verifyingSession}
            className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'SIGNING IN...' : 'SIGN IN'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="pt-2 border-t border-eink-border flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="text-eink-textMuted hover:text-eink-text underline">
            Forgot credentials?
          </Link>
          <p className="text-eink-textMuted">
            Don't have an account?{' '}
            <Link to="/register" className="text-eink-text font-bold underline">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
