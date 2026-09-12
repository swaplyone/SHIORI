import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Github, Loader2, Fingerprint, Key, ShieldCheck, AlertCircle } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
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
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'github' | 'google' | null>(null);
  const [verifyingSession, setVerifyingSession] = useState(false);

  // WebAuthn state: NORMAL | WEBAUTHN | LOADING | ERROR
  const [authState, setAuthState] = useState<'NORMAL' | 'WEBAUTHN' | 'LOADING' | 'ERROR'>('NORMAL');
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean>(false);
  const [hasDeviceCredential, setHasDeviceCredential] = useState<boolean>(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect platform authenticator availability
  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      Boolean(window.PublicKeyCredential) &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

    if (isSupported) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => setWebAuthnSupported(available))
        .catch(() => setWebAuthnSupported(false));
    }

    // Check if any device credential exists for this device/system
    fetchJson('/api/auth/webauthn/has-credential')
      .then(({ ok, data }) => {
        if (ok && data?.hasCredential) {
          setHasDeviceCredential(true);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for OAuth callback redirect (?token=... or ?error=...)
  useEffect(() => {
    const tokenParam = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
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

  // Primary Email/Password Login Flow
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, rememberMe })
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

  // WebAuthn Device Biometric / Passkey Login
  const handleDeviceLogin = async () => {
    setError('');
    setAuthState('WEBAUTHN');

    try {
      const { ok, data: options } = await fetchJson('/api/auth/webauthn/login/options', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() || undefined })
      });

      if (!ok || !options) {
        throw new Error(options?.error || 'Failed to initiate device authentication');
      }

      // Prompt OS / hardware authenticator (Windows Hello, Face ID, Fingerprint, PIN)
      const assertion = await startAuthentication({ optionsJSON: options });

      setAuthState('LOADING');
      const { ok: verifyOk, data: verifyData } = await fetchJson('/api/auth/webauthn/login/verify', {
        method: 'POST',
        body: JSON.stringify({ assertion, rememberMe })
      });

      if (verifyOk && verifyData?.user) {
        login(verifyData.token, verifyData.user);
        if (!verifyData.user.github_connected) {
          navigate('/onboarding', { replace: true });
        } else {
          navigate('/home', { replace: true });
        }
      } else {
        throw new Error(verifyData?.error || 'Device verification could not be completed.');
      }
    } catch (err: any) {
      console.warn('[WEBAUTHN LOGIN NOTICE]', err?.message || err);
      setAuthState('ERROR');
      setError(err?.message || "Device authentication couldn't be completed.");
    }
  };

  // Secondary OAuth: GitHub
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

  // Secondary OAuth: Google
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
        {/* SHIORI Logo & Welcome */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-xs text-eink-textMuted tracking-wider">Welcome back</p>
        </div>

        {/* Global Loading / Session Verification State */}
        {verifyingSession && (
          <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-center gap-2 text-xs font-bold text-eink-text animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-eink-accent" />
            <span>AUTHENTICATING SESSION...</span>
          </div>
        )}

        {/* Interactive WebAuthn Verification Modal / Banner */}
        {authState === 'WEBAUTHN' && (
          <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm space-y-3 text-center animate-in fade-in duration-200">
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full border border-eink-border flex items-center justify-center bg-eink-bg">
                <Fingerprint className="w-5 h-5 text-eink-accent animate-pulse" />
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-eink-text uppercase tracking-wide">Verify with your device</p>
              <p className="text-[11px] text-eink-textMuted mt-0.5">
                Use your fingerprint, Face ID, Windows Hello, or device PIN.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAuthState('NORMAL');
                setError('');
              }}
              className="text-[11px] text-eink-text underline hover:opacity-75 cursor-pointer font-bold"
            >
              Cancel and use password
            </button>
          </div>
        )}

        {/* WebAuthn Processing State */}
        {authState === 'LOADING' && (
          <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-center gap-2 text-xs font-bold text-eink-text">
            <Loader2 className="w-4 h-4 animate-spin text-eink-accent" />
            <span>AUTHENTICATING WITH DEVICE...</span>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-eink-bg border-2 border-eink-text text-xs text-eink-text font-bold rounded-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {authState === 'ERROR' && (
              <div className="flex items-center gap-3 pt-1 border-t border-eink-border text-[11px]">
                <button
                  type="button"
                  onClick={handleDeviceLogin}
                  className="underline hover:text-eink-accent font-bold cursor-pointer"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthState('NORMAL');
                    setError('');
                  }}
                  className="underline hover:text-eink-accent cursor-pointer"
                >
                  Use another login method
                </button>
              </div>
            )}
          </div>
        )}

        {/* PRIMARY FLOW: Email/Password Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">Email</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. your-email@company.com"
              className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans focus:border-eink-text"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans focus:border-eink-text"
              required
            />
          </div>

          {/* Remember me option */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-3.5 h-3.5 rounded-sm border-eink-border text-eink-text cursor-pointer accent-eink-accent"
            />
            <label htmlFor="remember-me" className="text-xs text-eink-textMuted cursor-pointer select-none">
              Remember me
            </label>
          </div>

          {/* Log in Button */}
          <button
            type="submit"
            disabled={loading || Boolean(socialLoading) || verifyingSession || authState === 'WEBAUTHN'}
            className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'LOGGING IN...' : 'Log in'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* Forgot password */}
          <div className="text-center pt-1">
            <Link
              to="/forgot-password"
              className="text-[11px] text-eink-textMuted hover:text-eink-text underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-eink-border w-full"></div>
          <span className="bg-eink-surface px-3 text-[10px] text-eink-textMuted tracking-wider font-bold shrink-0">
            or continue with
          </span>
          <div className="border-t border-eink-border w-full"></div>
        </div>

        {/* SECONDARY AUTHENTICATION AT BOTTOM */}
        <div className="space-y-2.5">
          {/* Continue with Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || Boolean(socialLoading) || verifyingSession}
            className="w-full py-2.5 px-4 bg-eink-surface border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm flex items-center justify-center gap-2.5 transition-all text-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {socialLoading === 'google' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <GoogleIcon className="w-4 h-4" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Continue with GitHub */}
          <button
            type="button"
            onClick={handleGithubLogin}
            disabled={loading || Boolean(socialLoading) || verifyingSession}
            className="w-full py-2.5 px-4 bg-eink-surface border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm flex items-center justify-center gap-2.5 transition-all text-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {socialLoading === 'github' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting to GitHub...</span>
              </>
            ) : (
              <>
                <Github className="w-4 h-4" />
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          {/* WebAuthn Passkey / Biometric Option */}
          {webAuthnSupported && (hasDeviceCredential || email.trim()) && (
            <button
              type="button"
              onClick={handleDeviceLogin}
              disabled={loading || Boolean(socialLoading) || verifyingSession || authState === 'WEBAUTHN'}
              className="w-full py-2.5 px-4 bg-eink-surface border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm flex items-center justify-center gap-2.5 transition-all text-xs cursor-pointer active:scale-[0.99] disabled:opacity-50"
              title="Use fingerprint, Face ID, Windows Hello, or device PIN"
            >
              <Fingerprint className="w-4 h-4 text-eink-accent" />
              <span>Continue with device</span>
            </button>
          )}

          {/* Fallback note if WebAuthn is unsupported on this browser */}
          {!webAuthnSupported && (
            <p className="text-[10px] text-center text-eink-textMuted">
              Device login isn't available on this browser.
            </p>
          )}
        </div>

        {/* Create account link */}
        <div className="pt-2 border-t border-eink-border text-center text-xs">
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
