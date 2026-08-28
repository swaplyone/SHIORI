import React, { useState } from 'react';
import { X, Search, ArrowRight, Check, Send, AlertCircle, UserCheck } from 'lucide-react';
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
  const [shioriIdInput, setShioriIdInput] = useState('SHI-');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foundPerson, setFoundPerson] = useState<any>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();
    if (!val.startsWith('SHI-')) {
      val = 'SHI-' + val.replace(/^SHI-?/i, '');
    }
    setShioriIdInput(val);
    setFoundPerson(null);
    setError('');
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shioriIdInput.trim() || !token) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/connections/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ shioriId: shioriIdInput })
      });
      const data = await res.json();
      if (res.ok) {
        setFoundPerson(data.person);
      } else {
        setError(data.error || 'Account not found');
      }
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
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
        body: JSON.stringify({ targetShioriId: foundPerson.shioriId })
      });
      if (res.ok) {
        setRequestSuccess(true);
        onRequestSent();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send request');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed');
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
            <h3 className="font-bold text-sm text-eink-text uppercase">ADD CONNECTION</h3>
            <p className="text-[10px] text-eink-textMuted">No discovery • Exact SHIORI ID only</p>
          </div>
          <button onClick={onClose} className="p-1 text-eink-textMuted hover:text-eink-text">
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
            <span className="font-bold text-eink-text block text-sm">REQUEST SENT</span>
            <p className="text-eink-text">{foundPerson?.name}</p>
            <span className="font-bold text-[11px] bg-eink-bg px-2 py-0.5 border border-eink-border rounded inline-block">
              {foundPerson?.shioriId}
            </span>
            <p className="text-[11px] text-eink-textMuted pt-1">
              Waiting for their response. Once accepted, two-sided verification will be required.
            </p>
            <div className="pt-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs"
              >
                DONE
              </button>
            </div>
          </div>
        ) : !foundPerson ? (
          <form onSubmit={handleLookup} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] text-eink-textMuted uppercase mb-1.5">
                ENTER EXACT SHIORI ID
              </label>
              <input
                type="text"
                value={shioriIdInput}
                onChange={handleInputChange}
                placeholder="SHI-XXXXXX"
                className="w-full px-3 py-2.5 bg-eink-surface border border-eink-border rounded-sm text-sm font-bold text-eink-text uppercase tracking-widest outline-none font-technical"
                autoFocus
                required
              />
              <p className="text-[10px] text-eink-textMuted mt-1.5">
                Ask your collaborator for their exact 6-character SHIORI ID (e.g. SHI-8F42K or SHI-4M92KP).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
              >
                <span>{loading ? 'LOOKING UP...' : 'CONTINUE'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-4 text-xs animate-fade-in">
            <div className="border-b border-eink-border pb-3">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                PERSON FOUND
              </span>
              <div className="mt-1 flex items-center justify-between">
                <h4 className="font-bold text-sm text-eink-text">{foundPerson.name}</h4>
                <span className="font-bold text-xs bg-eink-bg px-2 py-0.5 border border-eink-border rounded">
                  {foundPerson.shioriId}
                </span>
              </div>
              {foundPerson.bio && (
                <p className="text-[11px] text-eink-textSecondary mt-1 font-sans">{foundPerson.bio}</p>
              )}
            </div>

            {foundPerson.isConnected ? (
              <div className="p-2.5 bg-eink-bg border border-eink-border rounded text-center text-xs text-eink-text font-bold">
                ✓ Already connected with {foundPerson.name}
              </div>
            ) : foundPerson.pendingRequest ? (
              <div className="p-2.5 bg-eink-bg border border-eink-border rounded text-center text-xs text-eink-textMuted">
                Connection request is currently {foundPerson.pendingRequest.status}.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-eink-textSecondary leading-relaxed">
                  Send a connection request to <strong>{foundPerson.name}</strong>. Both of you will complete two-sided verification before the connection becomes active.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setFoundPerson(null)}
                    className="px-3 py-1.5 border border-eink-border text-xs rounded-sm"
                  >
                    BACK
                  </button>
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={loading}
                    className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{loading ? 'SENDING...' : 'SEND REQUEST'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
