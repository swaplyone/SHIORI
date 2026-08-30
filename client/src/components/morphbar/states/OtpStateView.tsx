import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Check, RotateCcw, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useMorphBar } from '../../../context/MorphBarContext';

export const OtpCollapsedView: React.FC<{ data?: any }> = ({ data }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(data?.secondsRemaining ?? 300);
  const totalSeconds = 300; // 5-minute standard OTP expiration

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isExpired = secondsRemaining === 0;

  // Progress fills as expiration approaches
  const progressPercent = Math.min(100, Math.max(0, ((totalSeconds - secondsRemaining) / totalSeconds) * 100));

  // Determine state
  const isVerifying = data?.state === 'VERIFYING';
  const isCorrect = data?.state === 'CORRECT';
  const isWrong = data?.state === 'WRONG';

  return (
    <div
      className={`relative w-full h-[42px] flex items-center justify-between select-none overflow-hidden rounded-full font-technical text-xs transition-transform ${
        isWrong ? 'animate-shake' : ''
      }`}
    >
      {/* LAYER 1: Paper Background with Dark Ink Text */}
      <div className="absolute inset-0 bg-eink-bg flex items-center justify-between px-3.5 z-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-eink-text" />
          <span className="font-mono font-bold tracking-wider text-xs text-eink-text">
            {isCorrect
              ? '✓ VERIFIED'
              : isWrong
              ? '× INCORRECT'
              : isVerifying
              ? 'VERIFYING...'
              : isExpired
              ? 'OTP EXPIRED'
              : `OTP •••••• ${timeStr}`}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-eink-textSecondary">
          {isCorrect ? 'SUCCESS' : isWrong ? 'RETRY' : isExpired ? 'EXPIRED' : 'OTP'}
        </span>
      </div>

      {/* LAYER 2: Black Ink Filling Container with White Inverted Text */}
      <div
        className="absolute top-0 left-0 bottom-0 bg-eink-text overflow-hidden transition-[width] duration-300 ease-out z-10"
        style={{ width: isCorrect ? '100%' : `${progressPercent}%` }}
      >
        {/* Ink Leading Edge */}
        <div className="absolute top-0 right-0 bottom-0 w-1.5 bg-repeat-y opacity-30 bg-eink-bg" />

        {/* Pinned Identical White Text */}
        <div className="w-[270px] sm:w-[300px] h-[42px] flex items-center justify-between px-3.5 text-eink-bg">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-eink-bg" />
            <span className="font-mono font-bold tracking-wider text-xs text-eink-bg">
              {isCorrect
                ? '✓ VERIFIED'
                : isWrong
                ? '× INCORRECT'
                : isVerifying
                ? 'VERIFYING...'
                : isExpired
                ? 'OTP EXPIRED'
                : `OTP •••••• ${timeStr}`}
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-eink-bg/90">
            {isCorrect ? 'SUCCESS' : isWrong ? 'RETRY' : isExpired ? 'EXPIRED' : 'OTP'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const OtpExpandedView: React.FC<{ data?: any; onClose: () => void }> = ({ data, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const { dispatchEvent } = useMorphBar();

  const [inputOtp, setInputOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.sessionId || !token) {
      navigate('/connections');
      onClose();
      return;
    }

    setVerifying(true);
    setError('');
    dispatchEvent('OTP_VERIFICATION', { ...data, state: 'VERIFYING' });

    try {
      const res = await fetch(`/api/connections/session/${data.sessionId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ otp: inputOtp })
      });
      const resData = await res.json();
      if (res.ok) {
        setVerified(true);
        dispatchEvent('OTP_VERIFICATION', { ...data, state: 'CORRECT' }, 4000);
        triggerEInkRefresh();
        setTimeout(() => {
          navigate('/connections');
          onClose();
        }, 1500);
      } else {
        setError(resData.error || 'Verification failed');
        dispatchEvent('OTP_VERIFICATION', { ...data, state: 'WRONG' }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Error verifying');
      dispatchEvent('OTP_VERIFICATION', { ...data, state: 'WRONG' }, 3000);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4 font-technical text-xs">
      <div className="flex items-center justify-between border-b border-eink-border pb-2">
        <span className="font-bold text-xs uppercase text-eink-text">
          TWO-SIDED CONNECTION VERIFICATION
        </span>
        {data?.otherUserName && (
          <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono">
            {data.otherUserName} ({data?.otherShioriId || 'SHI-COLLAB'})
          </span>
        )}
      </div>

      {verified ? (
        <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm text-center space-y-1 animate-fade-in">
          <span className="font-bold text-sm text-eink-text block">✓ YOUR SIDE VERIFIED</span>
          <p className="text-[11px] text-eink-textSecondary">
            Connection will activate once both participants complete OTP verification.
          </p>
        </div>
      ) : (
        <>
          <div className="p-3 bg-eink-surface border border-eink-border rounded-sm text-center space-y-1">
            <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-widest block">
              COLLABORATOR HANDSHAKE CODE
            </span>
            <div className="text-2xl sm:text-3xl font-bold tracking-[0.25em] text-eink-text font-mono py-0.5">
              {data?.myCodeFormatted || data?.otp || '••••••'}
            </div>
            <p className="text-[10px] text-eink-textMuted font-mono">
              Share this code with your peer to link workspaces • Expires in {timeStr}
            </p>
          </div>

          <p className="text-[10px] text-eink-textMuted font-sans text-center">
            (Note: For account signup, enter the code from your email inbox on the registration page.)
          </p>

          {error && (
            <div className="p-2.5 bg-eink-surface border-2 border-eink-text text-[11px] font-bold text-eink-text text-center">
              × INCORRECT OTP. Please try again.
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-3">
            <div>
              <input
                type="text"
                value={inputOtp}
                onChange={(e) => setInputOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="ENTER 6-DIGIT CODE"
                maxLength={6}
                className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-center text-sm font-bold tracking-[0.2em] font-mono outline-none text-eink-text"
                autoFocus
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={verifying || inputOtp.length !== 6}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 disabled:opacity-50"
              >
                {verifying ? 'VERIFYING...' : 'VERIFY CODE'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};
