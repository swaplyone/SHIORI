import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, RotateCcw, Clock, Github, Loader2, Fingerprint, CheckCircle2 } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
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

export const RegisterPage: React.FC = () => {
  // Steps: DETAILS -> OTP -> READY_DEVICE_PROMPT
  const [step, setStep] = useState<'DETAILS' | 'OTP' | 'READY_DEVICE_PROMPT'>('DETAILS');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'github' | 'google' | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [registeredUser, setRegisteredUser] = useState<any>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Active Countdown Timer for Registration OTP
  useEffect(() => {
    let interval: any = null;
    if (step === 'OTP' && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setIsExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (secondsRemaining === 0) {
      setIsExpired(true);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step, secondsRemaining]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Step 1: Send OTP to Email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResendMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address with a domain (e.g. yourname@gmail.com).');
      return;
    }

    setLoading(true);

    // Auto-derive clean username from email
    const autoUsername = email.trim().split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'dev';

    try {
      const { ok, data } = await fetchJson('/api/auth/register/send-otp', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: autoUsername,
          email: email.trim(),
          password
        })
      });

      if (ok) {
        setSecondsRemaining(300);
        setIsExpired(false);
        setStep('OTP');
      } else {
        setError(data?.error || 'Failed to send verification code. Please check your details.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP & Create Account
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isExpired) {
      setError('Verification code has expired. Please click "Resend code" to request a fresh OTP.');
      return;
    }

    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/register/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim()
        })
      });

      if (ok && data?.token && data?.user) {
        login(data.token, data.user);
        setRegisteredUser(data.user);

        // Check if WebAuthn is supported on this browser
        const isSupported =
          typeof window !== 'undefined' &&
          Boolean(window.PublicKeyCredential) &&
          typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

        if (isSupported) {
          // Show the optional "Set up device login" screen
          setStep('READY_DEVICE_PROMPT');
        } else {
          // If unsupported, proceed immediately
          navigate('/onboarding');
        }
      } else {
        setError(data?.error || 'Incorrect or expired verification code.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Optional Setup Device Login
  const handleEnableDeviceLogin = async () => {
    setError('');
    setDeviceLoading(true);
    try {
      const { ok, data: options } = await fetchJson('/api/auth/webauthn/register/options', {
        method: 'POST'
      });

      if (!ok || !options) {
        throw new Error(options?.error || 'Could not initiate device registration');
      }

      // Prompt OS / platform biometric authenticator
      const regResponse = await startRegistration({ optionsJSON: options });

      const { ok: verifyOk, data: verifyData } = await fetchJson('/api/auth/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify(regResponse)
      });

      if (verifyOk) {
        navigate('/onboarding');
      } else {
        throw new Error(verifyData?.error || 'Device verification could not be saved.');
      }
    } catch (err: any) {
      console.warn('[DEVICE SETUP NOTICE]', err?.message || err);
      // If user canceled or failed, they can still continue safely
      navigate('/onboarding');
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleSkipDeviceLogin = () => {
    navigate('/onboarding');
  };

  // Resend OTP
  const handleResend = async () => {
    setError('');
    setResendMessage('');
    setResendLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/register/resend-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim()
        })
      });

      if (ok) {
        setSecondsRemaining(300);
        setIsExpired(false);
        setOtp('');
        setResendMessage(`New 5-minute code sent to ${email}`);
      } else {
        setError(data?.error || 'Failed to resend verification code.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setResendLoading(false);
    }
  };

  // OAuth GitHub
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

  // OAuth Google
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
          <p className="text-xs text-eink-textMuted tracking-wider">
            {step === 'DETAILS'
              ? 'Create your SHIORI account'
              : step === 'OTP'
              ? 'Email Verification'
              : 'Your SHIORI account is ready'}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-eink-bg border-2 border-eink-text text-xs text-eink-text font-bold rounded-sm">
            ✕ {error}
          </div>
        )}

        {resendMessage && (
          <div className="p-2.5 bg-eink-bg border border-eink-border text-xs text-eink-text font-bold rounded-sm">
            ✓ {resendMessage}
          </div>
        )}

        {/* STEP 1: PRIMARY ACCOUNT DETAILS */}
        {step === 'DETAILS' && (
          <div className="space-y-4">
            <form onSubmit={handleSendOtp} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Miller"
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans focus:border-eink-text"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. alex@example.com"
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans focus:border-eink-text"
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

              <div>
                <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans focus:border-eink-text"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || Boolean(socialLoading)}
                className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? 'CREATING ACCOUNT...' : 'Create account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center pt-2">
              <div className="border-t border-eink-border w-full"></div>
              <span className="bg-eink-surface px-3 text-[10px] text-eink-textMuted tracking-wider font-bold shrink-0">
                or continue with
              </span>
              <div className="border-t border-eink-border w-full"></div>
            </div>

            {/* Secondary OAuth at bottom */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading || Boolean(socialLoading)}
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

              <button
                type="button"
                onClick={handleGithubLogin}
                disabled={loading || Boolean(socialLoading)}
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
            </div>

            {/* Already have an account */}
            <div className="pt-2 border-t border-eink-border text-center text-xs">
              <p className="text-eink-textMuted">
                Already have an account?{' '}
                <Link to="/login" className="text-eink-text font-bold underline">
                  Log in
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: EMAIL OTP VERIFICATION */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
            <div
              className={`p-3 border rounded-sm flex items-center justify-between gap-3 ${
                isExpired
                  ? 'bg-eink-bg border-2 border-eink-text text-eink-text font-bold'
                  : 'bg-eink-surface border-eink-border text-eink-text'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className={`w-4 h-4 ${isExpired ? 'text-eink-text animate-bounce' : 'text-eink-accent'}`} />
                <div>
                  <span className="block text-[10px] text-eink-textMuted uppercase font-bold tracking-wider">
                    Code status
                  </span>
                  <span className="font-mono text-xs font-bold">
                    {isExpired ? 'EXPIRED' : `EXPIRES IN ${formatTime(secondsRemaining)}`}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                Verification code sent to {email}
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-mono text-center tracking-widest text-lg font-bold"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'VERIFYING...' : 'Verify & Continue'}</span>
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <button
                type="button"
                onClick={() => setStep('DETAILS')}
                className="text-eink-textSecondary hover:text-eink-text underline cursor-pointer"
              >
                ← Edit details
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="text-eink-text hover:underline flex items-center gap-1 font-bold cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3 h-3 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>Resend code</span>
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: OPTIONAL WEBAUTHN DEVICE LOGIN SETUP */}
        {step === 'READY_DEVICE_PROMPT' && (
          <div className="space-y-5 text-center py-2">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full border border-eink-border bg-eink-bg flex items-center justify-center text-eink-accent">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold uppercase tracking-tight text-eink-text">
                Your SHIORI account is ready.
              </h2>
              <p className="text-xs text-eink-textMuted mt-1">
                Set up device login for faster sign-in?
              </p>
              <p className="text-[11px] text-eink-textMuted mt-1">
                Use your fingerprint, Face ID, Windows Hello, or device PIN on supported devices.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleEnableDeviceLogin}
                disabled={deviceLoading}
                className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
              >
                {deviceLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>ACTIVATING DEVICE PASSKEY...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Enable device login</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSkipDeviceLogin}
                disabled={deviceLoading}
                className="w-full py-2 px-4 border border-eink-border bg-eink-surface hover:bg-eink-bg text-eink-text font-bold rounded-sm transition-all text-xs cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
