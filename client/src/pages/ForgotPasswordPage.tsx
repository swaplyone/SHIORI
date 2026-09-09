import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, KeyRound, User, RotateCcw, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../utils/api';

export const ForgotPasswordPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PASSWORD' | 'USERNAME'>('PASSWORD');
  
  // Password Recovery States
  const [step, setStep] = useState<'REQUEST' | 'VERIFY_AND_RESET' | 'SUCCESS'>('REQUEST');
  const [accountInput, setAccountInput] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Expiration countdown (5 minutes = 300 seconds)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  
  // Username Recovery States
  const [usernameEmail, setUsernameEmail] = useState('');
  const [usernameSent, setUsernameSent] = useState(false);

  // Common UI States
  const [authPayload, setAuthPayload] = useState<{ token: string; user: any } | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Active Countdown Timer
  useEffect(() => {
    let interval: any = null;
    if (step === 'VERIFY_AND_RESET' && secondsRemaining > 0) {
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

  // Step 1: Send Password Reset OTP
  const handleSendResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/forgot-password/send-otp', {
        method: 'POST',
        body: JSON.stringify({ account: accountInput.trim() })
      });

      if (ok && data?.email) {
        setResolvedEmail(data.email);
        setMaskedEmail(data.maskedEmail || data.email);
        setSecondsRemaining(data.expiresInSeconds || 300);
        setIsExpired(false);
        setStep('VERIFY_AND_RESET');
      } else {
        setError(data?.error || 'No account found matching that email or username.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1b: Resend Password Reset OTP
  const handleResendResetOtp = async () => {
    setError('');
    setSuccessMessage('');
    setResendLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/forgot-password/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email: resolvedEmail })
      });

      if (ok) {
        setSecondsRemaining(data.expiresInSeconds || 300);
        setIsExpired(false);
        setOtp('');
        setSuccessMessage('A fresh 5-minute verification code has been dispatched to your email.');
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(data?.error || 'Failed to resend code.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setResendLoading(false);
    }
  };

  // Step 2: Verify OTP & Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isExpired) {
      setError('Verification code has expired. Please click "Resend Code" to get a new one.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({
          email: resolvedEmail,
          otp: otp.trim(),
          newPassword
        })
      });

      if (ok) {
        if (data?.token && data?.user) {
          setAuthPayload({ token: data.token, user: data.user });
        }
        setStep('SUCCESS');
      } else {
        setError(data?.error || 'Failed to reset password.');
      }
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Username Request
  const handleForgotUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/forgot-username', {
        method: 'POST',
        body: JSON.stringify({ email: usernameEmail.trim() })
      });

      if (ok) {
        setUsernameSent(true);
      } else {
        setError(data?.error || 'Failed to request username.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-4 pt-16 sm:pt-20 eink-paper font-sans select-none">
      <div className="w-full max-w-md bg-eink-surface border border-eink-border p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Brand Header */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-[10px] text-eink-textMuted uppercase tracking-wider">
            ACCOUNT RECOVERY & AUTHENTICATION
          </p>
        </div>

        {/* Tab Switcher */}
        {step !== 'SUCCESS' && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-eink-bg border border-eink-border rounded-sm text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('PASSWORD');
                setError('');
                setSuccessMessage('');
              }}
              className={`py-2 flex items-center justify-center gap-1.5 rounded-xs transition-all cursor-pointer ${
                activeTab === 'PASSWORD'
                  ? 'bg-eink-text text-eink-bg shadow-eink-sm'
                  : 'text-eink-textSecondary hover:text-eink-text'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>RESET PASSWORD</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('USERNAME');
                setError('');
                setSuccessMessage('');
              }}
              className={`py-2 flex items-center justify-center gap-1.5 rounded-xs transition-all cursor-pointer ${
                activeTab === 'USERNAME'
                  ? 'bg-eink-text text-eink-bg shadow-eink-sm'
                  : 'text-eink-textSecondary hover:text-eink-text'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>FIND USERNAME</span>
            </button>
          </div>
        )}

        {/* Error / Success Messages */}
        {error && (
          <div className="p-3 bg-eink-bg border-2 border-eink-text text-xs text-eink-text font-bold rounded-sm animate-fade-in">
            ✕ {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-eink-surface border-2 border-eink-border text-xs text-eink-text font-bold rounded-sm flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-eink-accent shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: RESET PASSWORD */}
        {activeTab === 'PASSWORD' && (
          <div>
            {/* Step 1: Request Code */}
            {step === 'REQUEST' && (
              <form onSubmit={handleSendResetOtp} className="space-y-4 text-xs">
                <p className="text-xs text-eink-textSecondary leading-relaxed">
                  Enter your registered email address or username. We will send a secure <strong>5-minute verification code</strong> to reset your password.
                </p>

                <div>
                  <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                    EMAIL OR USERNAME
                  </label>
                  <input
                    type="text"
                    value={accountInput}
                    onChange={(e) => setAccountInput(e.target.value)}
                    placeholder="e.g. your-email@company.com or username"
                    className="w-full px-3 py-2.5 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !accountInput.trim()}
                  className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
                >
                  <span>{loading ? 'SENDING CODE...' : 'SEND VERIFICATION CODE'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            )}

            {/* Step 2: Verify Code with Countdown & Set New Password */}
            {step === 'VERIFY_AND_RESET' && (
              <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
                {/* Expiration Timer Banner */}
                <div className={`p-3 border rounded-sm flex items-center justify-between gap-3 ${
                  isExpired
                    ? 'bg-eink-bg border-2 border-eink-text text-eink-text font-bold'
                    : 'bg-eink-surface border-eink-border text-eink-text'
                }`}>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${isExpired ? 'text-eink-text animate-bounce' : 'text-eink-accent'}`} />
                    <div>
                      <span className="block text-[10px] text-eink-textMuted uppercase font-bold tracking-wider">
                        CODE STATUS
                      </span>
                      <span className="font-mono text-xs font-bold">
                        {isExpired ? 'EXPIRED' : `EXPIRES IN ${formatTime(secondsRemaining)}`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResendResetOtp}
                    disabled={resendLoading}
                    className="px-2.5 py-1 bg-eink-bg border border-eink-border rounded-sm text-[11px] font-bold text-eink-text hover:bg-eink-surface flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3 h-3 ${resendLoading ? 'animate-spin' : ''}`} />
                    <span>{resendLoading ? 'SENDING...' : 'RESEND CODE'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-eink-textSecondary">
                  Enter the 6-digit code sent to <strong className="text-eink-text font-mono">{maskedEmail}</strong> along with your new password.
                </p>

                <div>
                  <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                    6-DIGIT VERIFICATION CODE
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full px-3 py-2.5 bg-eink-bg border-2 border-eink-border focus:border-eink-text rounded-sm outline-none text-center font-mono text-lg tracking-[0.4em] text-eink-text"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                    NEW PASSWORD (MIN. 6 CHARACTERS)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                    CONFIRM NEW PASSWORD
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('REQUEST');
                      setError('');
                    }}
                    className="px-3 py-2.5 border border-eink-border hover:bg-eink-bg rounded-sm text-eink-text font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>BACK</span>
                  </button>

                  <button
                    type="submit"
                    disabled={loading || otp.length < 6 || isExpired}
                    className="flex-1 py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{loading ? 'RESETTING PASSWORD...' : 'RESET PASSWORD'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Success State */}
            {step === 'SUCCESS' && (
              <div className="text-center space-y-4 py-4 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-eink-bg border-2 border-eink-border flex items-center justify-center mx-auto text-eink-accent">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-eink-text uppercase">Password Reset Successfully</h2>
                  <p className="text-xs text-eink-textSecondary">
                    Your password has been updated. You can now proceed to your dashboard or sign in with your new password.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (authPayload?.token && authPayload?.user) {
                        login(authPayload.token, authPayload.user);
                      }
                      navigate('/home');
                    }}
                    className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] text-xs cursor-pointer"
                  >
                    <span>CONTINUE TO DASHBOARD</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <Link
                    to="/login"
                    className="w-full py-2 border border-eink-border hover:bg-eink-bg text-eink-text font-bold rounded-sm text-center text-xs"
                  >
                    RETURN TO SIGN IN
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: FIND USERNAME */}
        {activeTab === 'USERNAME' && (
          <div>
            {!usernameSent ? (
              <form onSubmit={handleForgotUsername} className="space-y-4 text-xs">
                <p className="text-xs text-eink-textSecondary leading-relaxed">
                  Enter your registered email address below. We will send your <strong>SHIORI username and SHIORI ID</strong> directly to your email inbox.
                </p>

                <div>
                  <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">
                    REGISTERED EMAIL ADDRESS
                  </label>
                  <input
                    type="email"
                    value={usernameEmail}
                    onChange={(e) => setUsernameEmail(e.target.value)}
                    placeholder="e.g. your-email@company.com"
                    className="w-full px-3 py-2.5 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !usernameEmail.trim()}
                  className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs cursor-pointer disabled:opacity-50"
                >
                  <span>{loading ? 'LOOKING UP...' : 'SEND MY USERNAME'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="text-center space-y-4 py-4 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-eink-bg border-2 border-eink-border flex items-center justify-center mx-auto text-eink-accent">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-eink-text uppercase">Check Your Inbox</h2>
                  <p className="text-xs text-eink-textSecondary">
                    If an account is associated with <strong className="text-eink-text font-mono">{usernameEmail}</strong>, we have sent your username and account details.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    to="/login"
                    className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 text-xs"
                  >
                    <span>RETURN TO SIGN IN</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setUsernameSent(false);
                      setUsernameEmail('');
                    }}
                    className="text-xs text-eink-textMuted hover:text-eink-text underline cursor-pointer py-1"
                  >
                    Look up another email
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="pt-2 border-t border-eink-border flex items-center justify-between text-xs">
          <Link to="/login" className="text-eink-textMuted hover:text-eink-text flex items-center gap-1 font-bold">
            <ArrowLeft className="w-3 h-3" />
            <span>Back to Sign In</span>
          </Link>
          <Link to="/register" className="text-eink-text font-bold underline">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
};
