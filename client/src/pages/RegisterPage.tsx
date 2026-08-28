import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../utils/api';

export const RegisterPage: React.FC = () => {
  // Step 1: form details, Step 2: OTP verification
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Step 1: Send OTP to Email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResendMessage('');
    setLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/register/send-otp', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password
        })
      });

      if (ok) {
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
        navigate('/onboarding');
      } else {
        setError(data?.error || 'Incorrect or expired verification code.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    setError('');
    setResendMessage('');
    setResendLoading(true);

    try {
      const { ok, data } = await fetchJson('/api/auth/register/send-otp', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password
        })
      });

      if (ok) {
        setResendMessage(`New code sent to ${email}`);
      } else {
        setError(data?.error || 'Failed to resend code.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-eink-bg text-eink-text flex items-center justify-center p-4 pt-16 sm:pt-20 eink-paper font-sans select-none">
      <div className="w-full max-w-md bg-eink-surface border border-eink-border p-8 rounded-sm shadow-2xl space-y-6 font-technical">
        {/* Brand */}
        <div className="text-center space-y-1 pb-4 border-b border-eink-border">
          <img src="/logo.png" alt="SHIORI" className="w-10 h-10 object-contain mx-auto mb-2 rounded-sm" />
          <h1 className="font-bold text-xl tracking-tight text-eink-text uppercase">SHIORI</h1>
          <p className="text-[10px] text-eink-textMuted uppercase tracking-wider">
            {step === 'DETAILS' ? 'CREATE ACCOUNT' : 'EMAIL VERIFICATION'}
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

        {/* STEP 1: ACCOUNT DETAILS */}
        {step === 'DETAILS' ? (
          <form onSubmit={handleSendOtp} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">FULL NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="e.g. rahul-dev"
                className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahul@company.com"
                className="w-full px-3 py-2 bg-eink-bg border border-eink-border rounded-sm outline-none text-eink-text font-sans"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold">PASSWORD</label>
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
              disabled={loading}
              className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all text-xs"
            >
              <span>{loading ? 'SENDING VERIFICATION CODE...' : 'SEND VERIFICATION CODE'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          /* STEP 2: EMAIL OTP VERIFICATION */
          <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center space-y-1">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-widest block">
                VERIFICATION CODE SENT TO
              </span>
              <span className="font-bold text-xs text-eink-text font-mono block truncate">{email}</span>
              <p className="text-[10px] text-eink-textMuted">Check your inbox for the 6-digit code.</p>
            </div>

            <div>
              <label className="block text-[10px] text-eink-textMuted uppercase mb-1 font-bold text-center">
                ENTER 6-DIGIT OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="••••••"
                maxLength={6}
                className="w-full px-3 py-2.5 bg-eink-bg border border-eink-border rounded-sm text-center text-lg font-bold tracking-[0.3em] font-mono outline-none text-eink-text"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all text-xs"
            >
              <span>{loading ? 'VERIFYING...' : 'VERIFY & CREATE ACCOUNT'}</span>
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <button
                type="button"
                onClick={() => setStep('DETAILS')}
                className="text-eink-textSecondary hover:text-eink-text underline"
              >
                ← Edit details
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="text-eink-text font-bold hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{resendLoading ? 'Sending...' : 'Resend code'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="pt-2 border-t border-eink-border text-center text-xs">
          <p className="text-eink-textMuted">
            Already have an account?{' '}
            <Link to="/login" className="text-eink-text font-bold underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
