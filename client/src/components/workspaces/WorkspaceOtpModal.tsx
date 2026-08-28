import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, Clock, ArrowRight, Building2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNotifications } from '../../context/NotificationContext';

interface WorkspaceOtpModalProps {
  sessionId: string | null;
  onClose: () => void;
  onVerified: () => void;
}

export const WorkspaceOtpModal: React.FC<WorkspaceOtpModalProps> = ({
  sessionId,
  onClose,
  onVerified,
}) => {
  const { token } = useAuth();
  const { socket } = useSocket();
  const { triggerEInkRefresh } = useNotifications();

  const [session, setSession] = useState<any>(null);
  const [inputOtp, setInputOtp] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const fetchSession = async () => {
    if (!sessionId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/workspaces/invites/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      } else {
        setError('Workspace verification session not found or expired.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [sessionId, token]);

  useEffect(() => {
    if (!socket) return;
    const handleJoined = () => {
      fetchSession();
      triggerEInkRefresh();
      onVerified();
    };
    socket.on('workspace:member_joined', handleJoined);
    return () => {
      socket.off('workspace:member_joined', handleJoined);
    };
  }, [socket]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !inputOtp.trim() || !token) return;

    setVerifying(true);
    setError('');
    try {
      const res = await fetch(`/api/workspaces/invites/session/${sessionId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ otp: inputOtp })
      });
      const data = await res.json();
      if (res.ok) {
        triggerEInkRefresh();
        fetchSession();
        if (data.isComplete) {
          onVerified();
        }
      } else {
        setError(data.error || 'Verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'Error verifying code');
    } finally {
      setVerifying(false);
    }
  };

  if (!sessionId) return null;

  const isComplete = session?.mySideVerified && session?.otherSideVerified;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 sm:p-8 z-10 space-y-6 font-technical">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-eink-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-eink-text text-eink-bg flex items-center justify-center font-bold text-xs rounded-sm">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-eink-text uppercase">WORKSPACE INVITATION</h3>
              <p className="text-[10px] text-eink-textMuted uppercase">Two-Sided Member Verification</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-eink-textMuted hover:text-eink-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-eink-surface border border-eink-border text-xs text-eink-text font-bold rounded-sm">
            ✕ {error}
          </div>
        )}

        {isComplete ? (
          <div className="p-6 bg-eink-surface border-2 border-eink-text rounded-sm text-center space-y-4 animate-fade-in">
            <div className="w-10 h-10 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-bold text-lg mx-auto">
              ✓
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-eink-text uppercase tracking-wider">
                MEMBER ADDED TO WORKSPACE
              </h4>
              <p className="text-xs text-eink-textSecondary font-sans">
                {session?.otherUser?.name} is now an active member of {session?.workspaceName}.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm"
            >
              DONE
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-eink-textMuted uppercase block font-bold">WORKSPACE</span>
                <span className="font-bold text-sm text-eink-text">{session?.workspaceName}</span>
              </div>
              <span className="font-bold text-xs bg-eink-bg px-2.5 py-1 border border-eink-border rounded">
                {session?.otherUser?.name} ({session?.otherUser?.shioriId})
              </span>
            </div>

            <div className="p-4 bg-eink-surface/80 border border-eink-border rounded-sm space-y-2 text-center">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-widest block">
                YOUR ONE-TIME INVITATION CODE
              </span>
              <div className="font-bold text-3xl sm:text-4xl text-eink-text tracking-[0.25em] font-technical py-1 select-all">
                {session?.myCodeFormatted}
              </div>
            </div>

            {session?.mySideVerified ? (
              <div className="p-4 bg-eink-surface border border-eink-border rounded-sm text-center space-y-2">
                <span className="font-bold text-xs text-eink-text flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-eink-text" />
                  <span>YOUR SIDE VERIFIED</span>
                </span>
                <p className="text-xs text-eink-textSecondary font-sans">
                  Waiting for {session.otherUser?.name} to verify their code...
                </p>
              </div>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-[11px] text-eink-textMuted uppercase mb-1">
                    ENTER YOUR 6-DIGIT CODE TO CONFIRM
                  </label>
                  <input
                    type="text"
                    value={inputOtp}
                    onChange={(e) => setInputOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="______"
                    maxLength={6}
                    className="w-full px-3 py-2.5 bg-eink-surface border border-eink-border rounded-sm text-center text-xl font-bold tracking-[0.3em] font-technical outline-none text-eink-text"
                    autoFocus
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || inputOtp.length < 6}
                    className="px-5 py-2 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                  >
                    <span>{verifying ? 'VERIFYING...' : 'VERIFY CODE'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
