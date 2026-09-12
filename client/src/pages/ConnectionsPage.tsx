import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  GitCommit,
  GitPullRequest,
  Clock,
  Trash2,
  Lock,
  UserX,
  ArrowRight,
  Shield,
  X,
  QrCode,
  Camera
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Connection, ConnectionRequest } from '../types';
import { ExactIdLookupModal } from '../components/connections/ExactIdLookupModal';
import { ConnectionQrCodeModal } from '../components/connections/ConnectionQrCodeModal';
import { QrScannerModal } from '../components/connections/QrScannerModal';
import { ConnectionsGridSkeleton } from '../components/ui/Skeleton';

export const ConnectionsPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [myShioriId, setMyShioriId] = useState('SHI-3A91M');
  const [copied, setCopied] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [requests, setRequests] = useState<{ incoming: ConnectionRequest[]; outgoing: ConnectionRequest[] }>({
    incoming: [],
    outgoing: []
  });
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [initialLookupQuery, setInitialLookupQuery] = useState('');
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

  useEffect(() => {
    const addQuery = searchParams.get('add');
    if (addQuery) {
      setInitialLookupQuery(addQuery);
      setIsLookupOpen(true);
      searchParams.delete('add');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

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
        triggerEInkRefresh();
        fetchRequests();
        fetchConnections();
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
            Connect via SHIORI ID, username, or email • 1-Click Accept / Decline
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-3.5 py-2 border border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-xs font-technical font-bold text-eink-text rounded-sm flex items-center gap-2 transition-colors cursor-pointer"
            title="Scan teammate's QR Code"
          >
            <Camera className="w-4 h-4" />
            <span>SCAN QR</span>
          </button>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className="px-3.5 py-2 border border-eink-border bg-eink-surface hover:bg-eink-surfaceHover text-xs font-technical font-bold text-eink-text rounded-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>MY QR CODE</span>
          </button>

          <button
            onClick={() => {
              setInitialLookupQuery('');
              setIsLookupOpen(true);
            }}
            className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm flex items-center gap-2 shadow-eink-sm hover:opacity-90 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>ADD CONNECTION</span>
          </button>
        </div>
      </div>

      {/* YOUR SHIORI ID CARD */}
      <div className="p-6 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-eink-card font-technical">
        <div className="space-y-1">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
            YOUR SHIORI ID
          </span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-eink-text tracking-widest bg-eink-bg px-3 py-1 border border-eink-border rounded-sm select-all font-mono">
              {myShioriId}
            </span>
          </div>
          <p className="text-xs text-eink-textSecondary pt-1 font-sans">
            Share your immutable ID or username with teammates to easily connect.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-3.5 py-2 border border-eink-border bg-eink-bg hover:bg-eink-surfaceHover text-xs font-bold text-eink-text rounded-sm flex items-center gap-2 self-start sm:self-auto transition-colors cursor-pointer"
            title="Scan a teammate's QR Code"
          >
            <Camera className="w-4 h-4" />
            <span>SCAN QR</span>
          </button>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className="px-3.5 py-2 border border-eink-border bg-eink-bg hover:bg-eink-surfaceHover text-xs font-bold text-eink-text rounded-sm flex items-center gap-2 self-start sm:self-auto transition-colors cursor-pointer"
            title="Display QR code for teammates to scan"
          >
            <QrCode className="w-4 h-4" />
            <span>SHOW QR</span>
          </button>

          <button
            onClick={handleCopyId}
            className="px-4 py-2 border border-eink-border bg-eink-bg hover:bg-eink-surfaceHover text-xs font-bold text-eink-text rounded-sm flex items-center gap-2 self-start sm:self-auto transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'COPIED TO CLIPBOARD' : 'COPY ID'}</span>
          </button>
        </div>
      </div>

      {/* PENDING REQUESTS */}
      {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <div className="space-y-4 font-technical text-xs">
          <h2 className="font-bold text-xs uppercase tracking-wider text-eink-text border-b border-eink-border pb-2">
            PENDING CONNECTION REQUESTS ({requests.incoming.length + requests.outgoing.length})
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
                    <span className="text-[10px] bg-eink-text text-eink-bg font-bold px-1.5 py-0.2 rounded uppercase">
                      INCOMING REQUEST
                    </span>
                    <span className="font-bold text-xs bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono">
                      {req.shiori_id}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-eink-text">
                    {req.name} <span className="text-eink-textSecondary font-normal font-mono">(@{req.username || req.shiori_id})</span> wants to connect with you.
                  </p>
                  {req.bio && <p className="text-xs text-eink-textSecondary">{req.bio}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRespond(req.id, 'DECLINE')}
                    className="px-3.5 py-1.5 border border-eink-border text-eink-textSecondary hover:bg-eink-bg rounded-sm font-bold text-xs cursor-pointer"
                  >
                    DECLINE
                  </button>
                  <button
                    onClick={() => handleRespond(req.id, 'ACCEPT')}
                    className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5 text-xs hover:opacity-90 active:scale-95 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ACCEPT</span>
                  </button>
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
                    {req.name} <span className="font-mono text-eink-textSecondary font-normal">(@{req.username || req.shiori_id})</span>
                  </p>
                  <p className="text-[11px] text-eink-textMuted mt-0.5">
                    Status: Waiting for response
                  </p>
                </div>

                <span className="text-[10px] font-mono px-2 py-1 bg-eink-bg border border-eink-border rounded text-eink-textMuted">
                  PENDING
                </span>
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
            Mutual verified development connections
          </span>
        </div>

        {loading ? (
          <ConnectionsGridSkeleton />
        ) : connections.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-eink-border bg-eink-surface rounded-sm space-y-3">
            <Users className="w-8 h-8 text-eink-textMuted mx-auto stroke-[1.5]" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-eink-text uppercase">NO CONNECTIONS YET</h3>
              <p className="text-xs text-eink-textSecondary max-w-sm mx-auto font-sans">
                Connect with team members to collaborate on tasks, assign work, and share progress.
              </p>
            </div>
            <button
              onClick={() => setIsLookupOpen(true)}
              className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm shadow-eink-sm hover:opacity-90 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ADD YOUR FIRST CONNECTION</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((conn) => (
              <div
                key={conn.connectionId}
                className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card relative group hover:border-eink-borderDark transition-colors"
              >
                {/* Header Profile */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center justify-center text-sm shrink-0">
                      {conn.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-eink-text">{conn.name}</span>
                        <span className="text-[10px] font-mono bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded">
                          {conn.shioriId}
                        </span>
                      </div>
                      <p className="text-xs text-eink-textSecondary">@{conn.username}</p>
                      {conn.bio && <p className="text-xs text-eink-textMuted mt-1 line-clamp-1">{conn.bio}</p>}
                    </div>
                  </div>

                  <button
                    onClick={() => setRemoveModalConn(conn)}
                    title="Remove connection"
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-eink-textMuted hover:text-eink-text transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Accountability Snapshot */}
                <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-2 text-xs font-technical">
                  <div className="flex items-center justify-between text-[10px] text-eink-textMuted uppercase font-bold border-b border-eink-border/50 pb-1">
                    <span>WORK ACTIVITY</span>
                    <span>{conn.stats?.lastActivity || 'Active'}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center py-1">
                    <div className="p-1.5 bg-eink-surface rounded">
                      <span className="text-xs font-bold block">{conn.stats?.totalTasks || 0}</span>
                      <span className="text-[9px] text-eink-textMuted">TASKS</span>
                    </div>
                    <div className="p-1.5 bg-eink-surface rounded">
                      <span className="text-xs font-bold block">{conn.stats?.completedTasks || 0}</span>
                      <span className="text-[9px] text-eink-textMuted">DONE</span>
                    </div>
                    <div className="p-1.5 bg-eink-surface rounded">
                      <span className="text-xs font-bold block">{conn.stats?.commitsToday || 0}</span>
                      <span className="text-[9px] text-eink-textMuted">COMMITS</span>
                    </div>
                  </div>

                  {conn.stats?.activeTaskTitle && (
                    <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-eink-textSecondary truncate">
                        Active: <strong>{conn.stats.activeTaskTitle}</strong>
                      </span>
                      {conn.stats.activeTaskCode && (
                        <span className="font-mono text-[9px] px-1 bg-eink-surface border border-eink-border rounded shrink-0">
                          {conn.stats.activeTaskCode}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-eink-textMuted pt-1 border-t border-eink-border/50">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-eink-text" />
                    <span>MUTUAL VERIFIED CONNECTION</span>
                  </span>
                  <span>{conn.connectedAt ? new Date(conn.connectedAt).toLocaleDateString() : 'Connected'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remove Confirmation Modal */}
      {removeModalConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
          <div className="bg-eink-bg border border-eink-border p-6 max-w-sm w-full rounded-sm space-y-4 font-technical shadow-2xl">
            <h3 className="font-bold text-sm uppercase text-eink-text">REMOVE CONNECTION?</h3>
            <p className="text-xs text-eink-textSecondary">
              Are you sure you want to remove <strong>{removeModalConn.name}</strong> ({removeModalConn.shioriId})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRemoveModalConn(null)}
                className="px-3 py-1.5 border border-eink-border rounded-sm cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleRemoveConnection}
                className="px-4 py-1.5 bg-eink-darkSurface text-eink-darkText font-bold rounded-sm shadow-eink-sm cursor-pointer"
              >
                REMOVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      <ConnectionQrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        shioriId={myShioriId}
        userName={user?.name || user?.username}
      />

      {/* QR Scanner Modal */}
      <QrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(scannedId) => {
          setInitialLookupQuery(scannedId);
          setIsLookupOpen(true);
        }}
      />

      {/* Exact-ID Lookup Modal */}
      <ExactIdLookupModal
        isOpen={isLookupOpen}
        initialQuery={initialLookupQuery}
        onOpenScanner={() => setIsScannerOpen(true)}
        onClose={() => {
          setIsLookupOpen(false);
          setInitialLookupQuery('');
        }}
        onRequestSent={() => {
          fetchRequests();
          triggerEInkRefresh();
        }}
      />
    </div>
  );
};
