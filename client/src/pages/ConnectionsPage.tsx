import React, { useState, useEffect } from 'react';
import {
  Users,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  GitCommit,
  GitPullRequest,
  CheckSquare,
  Clock,
  Trash2,
  Lock,
  UserX,
  ArrowRight,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Connection, ConnectionRequest } from '../types';
import { ExactIdLookupModal } from '../components/connections/ExactIdLookupModal';
import { TwoSidedOtpModal } from '../components/connections/TwoSidedOtpModal';
import { ConnectionsGridSkeleton } from '../components/ui/Skeleton';

export const ConnectionsPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const [myShioriId, setMyShioriId] = useState('SHI-3A91M');
  const [copied, setCopied] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [requests, setRequests] = useState<{ incoming: ConnectionRequest[]; outgoing: ConnectionRequest[] }>({
    incoming: [],
    outgoing: []
  });
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [removeModalConn, setRemoveModalConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMyId = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/connections/my-id', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyShioriId(data.shioriId || 'SHI-3A91M');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchConnections = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/connections', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/connections/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests({
          incoming: data.incoming || [],
          outgoing: data.outgoing || []
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMyId();
    fetchConnections();
    fetchRequests();

    const handleRefresh = () => {
      fetchConnections();
      fetchRequests();
    };
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [token]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(myShioriId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRespond = async (requestId: string, action: 'ACCEPT' | 'DECLINE') => {
    if (!token) return;
    try {
      const res = await fetch('/api/connections/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ requestId, action })
      });
      if (res.ok) {
        const data = await res.json();
        triggerEInkRefresh();
        fetchRequests();
        if (action === 'ACCEPT' && data.sessionId) {
          setActiveSessionId(data.sessionId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveConnection = async () => {
    if (!removeModalConn || !token) return;
    try {
      await fetch(`/api/connections/${removeModalConn.connectionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      triggerEInkRefresh();
      setRemoveModalConn(null);
      fetchConnections();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Top Header */}
      <div className="border-b border-eink-border pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-technical text-xl sm:text-2xl font-bold tracking-tight text-eink-text uppercase">
            INTENTIONAL CONNECTIONS
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical mt-1">
            No discovery • No guessing • Exact SHIORI ID verification only
          </p>
        </div>

        <button
          onClick={() => setIsLookupOpen(true)}
          className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm flex items-center gap-2 shadow-eink-sm hover:opacity-90 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>ADD CONNECTION</span>
        </button>
      </div>

      {/* YOUR SHIORI ID CARD */}
      <div className="p-6 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-eink-card font-technical">
        <div className="space-y-1">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
            YOUR SHIORI ID
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-eink-text tracking-widest bg-eink-bg px-3 py-1 border border-eink-border rounded-sm select-all">
              {myShioriId}
            </span>
          </div>
          <p className="text-xs text-eink-textSecondary pt-1 font-sans">
            Share this immutable ID with teammates you wish to connect with.
          </p>
        </div>

        <button
          onClick={handleCopyId}
          className="px-4 py-2 border border-eink-border bg-eink-bg hover:bg-eink-surfaceHover text-xs font-bold text-eink-text rounded-sm flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'COPIED TO CLIPBOARD' : 'COPY ID'}</span>
        </button>
      </div>

      {/* PENDING VERIFICATION SESSIONS OR REQUESTS */}
      {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <div className="space-y-4 font-technical text-xs">
          <h2 className="font-bold text-xs uppercase tracking-wider text-eink-text border-b border-eink-border pb-2">
            PENDING REQUESTS & VERIFICATION HANDSHAKES
          </h2>

          <div className="space-y-3">
            {/* Incoming Requests */}
            {requests.incoming.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-eink-card animate-fade-in"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-eink-textMuted uppercase font-bold">
                      INCOMING REQUEST
                    </span>
                    <span className="font-bold text-xs bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded">
                      {req.shiori_id}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-eink-text">{req.name} wants to connect with you.</p>
                  {req.status === 'VERIFICATION_PENDING' && (
                    <p className="text-[11px] text-eink-textSecondary">
                      Two-sided verification session is active. Both participants must verify OTP codes.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {req.active_session_id ? (
                    <button
                      onClick={() => setActiveSessionId(req.active_session_id!)}
                      className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>ENTER VERIFICATION CODE</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleRespond(req.id, 'DECLINE')}
                        className="px-3 py-1.5 border border-eink-border text-eink-textSecondary hover:bg-eink-bg rounded-sm"
                      >
                        DECLINE
                      </button>
                      <button
                        onClick={() => handleRespond(req.id, 'ACCEPT')}
                        className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>ACCEPT & VERIFY</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Outgoing Requests */}
            {requests.outgoing.map((req) => (
              <div
                key={req.id}
                className="p-3.5 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                    OUTGOING REQUEST
                  </span>
                  <p className="font-bold text-eink-text mt-0.5">
                    {req.name} ({req.shiori_id})
                  </p>
                  <p className="text-[11px] text-eink-textMuted">
                    Status: {req.status === 'VERIFICATION_PENDING' ? 'Waiting for OTP verification' : 'Waiting for response'}
                  </p>
                </div>

                {req.active_session_id && (
                  <button
                    onClick={() => setActiveSessionId(req.active_session_id!)}
                    className="px-3 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>VERIFY MY CODE</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE VERIFIED CONNECTIONS LIST */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-eink-border pb-2 font-technical">
          <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
            ACTIVE CONNECTIONS ({loading ? '...' : connections.length})
          </h2>
          <span className="text-[11px] text-eink-textMuted">
            Mutual two-sided verified relationships
          </span>
        </div>

        {loading ? (
          <ConnectionsGridSkeleton count={3} />
        ) : connections.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-eink-border rounded-sm space-y-3 bg-eink-surface/30 font-technical">
            <Users className="w-8 h-8 text-eink-textMuted mx-auto" />
            <h3 className="font-bold text-sm text-eink-text uppercase">NO ACTIVE CONNECTIONS</h3>
            <p className="text-xs text-eink-textSecondary max-w-sm mx-auto font-sans">
              Enter an exact SHIORI ID above to initiate a verified, two-sided mutual connection.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-technical">
          {connections.map((conn) => (
            <div
              key={conn.connectionId}
              className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-eink-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-sm bg-eink-darkSurface text-eink-darkText flex items-center justify-center font-bold text-xs">
                      {conn.name[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-eink-text uppercase tracking-tight">
                        {conn.name}
                      </h3>
                      <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-bold text-eink-text">
                        {conn.shioriId}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-eink-text px-1.5 py-0.2 border border-eink-border rounded bg-eink-bg">
                    CONNECTED
                  </span>
                </div>

                {/* Accountability Metrics */}
                {conn.stats && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-eink-textSecondary">Tasks completed:</span>
                      <span className="font-bold text-eink-text">
                        {String(conn.stats.completedTasks).padStart(2, '0')} / {String(conn.stats.totalTasks).padStart(2, '0')}
                      </span>
                    </div>

                    <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-eink-textSecondary">
                        <GitCommit className="w-3.5 h-3.5" />
                        <span>{conn.stats.commitsToday} commits</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-eink-textSecondary">
                        <GitPullRequest className="w-3.5 h-3.5" />
                        <span>{conn.stats.prsToday} PR</span>
                      </div>
                    </div>

                    {conn.stats.activeTaskTitle && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-eink-textMuted uppercase block">ACTIVE TASK</span>
                        <div className="p-2 bg-eink-bg border border-eink-border rounded-sm truncate">
                          <p className="font-bold text-eink-text truncate text-xs">
                            {conn.stats.activeTaskTitle}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer: Connected date & options */}
              <div className="pt-3 border-t border-eink-border flex items-center justify-between text-[11px] text-eink-textMuted">
                <span>Connected {conn.connectedAt || '28 AUG 2026'}</span>
                <button
                  onClick={() => setRemoveModalConn(conn)}
                  className="hover:text-eink-text underline"
                >
                  MANAGE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Remove Connection Confirmation Modal */}
      {removeModalConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setRemoveModalConn(null)} />
          <div className="relative w-full max-w-sm bg-eink-bg border border-eink-border p-6 rounded-sm shadow-2xl z-10 space-y-4 font-technical text-xs">
            <h3 className="font-bold text-sm uppercase text-eink-text">REMOVE CONNECTION?</h3>
            <p className="text-eink-textSecondary font-sans leading-relaxed">
              You will no longer be connected with <strong>{removeModalConn.name}</strong> ({removeModalConn.shioriId}). Historical collaboration and project records will remain where appropriate.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRemoveModalConn(null)}
                className="px-3 py-1.5 border border-eink-border rounded-sm"
              >
                CANCEL
              </button>
              <button
                onClick={handleRemoveConnection}
                className="px-4 py-1.5 bg-eink-darkSurface text-eink-darkText font-bold rounded-sm shadow-eink-sm"
              >
                REMOVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exact-ID Lookup Modal */}
      <ExactIdLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        onRequestSent={() => {
          fetchRequests();
          triggerEInkRefresh();
        }}
      />

      {/* Two-Sided OTP Verification Modal */}
      <TwoSidedOtpModal
        sessionId={activeSessionId}
        onClose={() => setActiveSessionId(null)}
        onVerified={() => {
          fetchConnections();
          fetchRequests();
          triggerEInkRefresh();
        }}
      />
    </div>
  );
};
