import React, { useState } from 'react';
import { X, Search, Check, Send, UserCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface ExactIdLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestSent: () => void;
}

export const ExactIdLookupModal: React.FC<ExactIdLookupModalProps> = ({
  isOpen,
  onClose,
  onRequestSent,
}) => {
  const { token } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foundPerson, setFoundPerson] = useState<any>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setFoundPerson(null);
    setError('');
    setRequestSuccess(false);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim() || !token) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/connections/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ query: searchInput.trim(), shioriId: searchInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.person) {
        setFoundPerson(data.person);
      } else {
        setError(data.error || 'User not found. Check the SHIORI ID, username, or email.');
      }
    } catch (err: any) {
      setError(err.message || 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async () => {
    if (!foundPerson || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/connections/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId: foundPerson.userId,
          targetShioriId: foundPerson.shioriId
        })
      });
      if (res.ok) {
        setRequestSuccess(true);
        onRequestSent();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send connection request.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative w-full max-w-md bg-eink-bg border border-eink-border shadow-2xl rounded-sm p-6 z-10 space-y-5 font-technical">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-eink-border">
          <div>
            <h3 className="font-bold text-sm text-eink-text uppercase flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>ADD CONNECTION</span>
            </h3>
            <p className="text-[10px] text-eink-textMuted">Search by SHIORI ID, username, or email</p>
          </div>
          <button onClick={onClose} className="p-1 text-eink-textMuted hover:text-eink-text cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-eink-surface border border-eink-border text-xs text-eink-text space-y-0.5 rounded-sm">
            <span className="font-bold block">✕ NOT FOUND</span>
            <p className="text-[11px] text-eink-textSecondary">{error}</p>
          </div>
        )}

        {requestSuccess ? (
          <div className="p-4 bg-eink-surface border border-eink-border rounded-sm text-xs space-y-2 text-center animate-fade-in">
            <span className="font-bold text-eink-text block text-sm">✓ REQUEST SENT</span>
            <p className="text-eink-text font-bold">{foundPerson?.name}</p>
            <span className="font-bold text-[11px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded inline-block font-mono">
              @{foundPerson?.username || foundPerson?.shioriId}
            </span>
            <p className="text-[11px] text-eink-textMuted pt-1">
              Connection request sent. Once accepted, you will both be connected instantly.
            </p>
            <div className="pt-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs cursor-pointer shadow-eink-sm"
              >
                DONE
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search Input Form */}
            <form onSubmit={handleLookup} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-eink-text uppercase tracking-wider block">
                  SEARCH USER
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={handleInputChange}
                    placeholder="e.g. SHI-8F42K or username or email"
                    className="flex-1 px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none focus:border-eink-text"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={loading || !searchInput.trim()}
                    className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-bold rounded-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0 shadow-eink-sm cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{loading ? 'SEARCHING...' : 'FIND'}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Found Person Profile Card */}
            {foundPerson && (
              <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm space-y-3 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center justify-center text-sm shrink-0">
                      {foundPerson.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-eink-text">{foundPerson.name}</span>
                        <span className="text-[10px] font-mono bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded">
                          {foundPerson.shioriId}
                        </span>
                      </div>
                      <p className="text-xs text-eink-textSecondary">@{foundPerson.username}</p>
                      {foundPerson.bio && (
                        <p className="text-xs text-eink-textMuted mt-1">{foundPerson.bio}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-eink-border flex items-center justify-between">
                  {foundPerson.isConnected ? (
                    <span className="text-xs font-bold text-eink-text flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>ALREADY CONNECTED</span>
                    </span>
                  ) : foundPerson.pendingRequest ? (
                    <span className="text-xs font-mono text-eink-textMuted">
                      {foundPerson.pendingRequest.isOutgoing ? 'Request already sent (Pending)' : 'They requested to connect with you'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendRequest}
                      disabled={loading}
                      className="w-full py-2 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{loading ? 'SENDING...' : 'SEND CONNECTION REQUEST'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
