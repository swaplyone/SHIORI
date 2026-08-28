import React, { useState, useEffect } from 'react';
import { Building2, Plus, Users, Shield, UserPlus, ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Workspace } from '../types';
import { WorkspaceOtpModal } from '../components/workspaces/WorkspaceOtpModal';

export const WorkspacesPage: React.FC = () => {
  const { token, user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteShioriId, setInviteShioriId] = useState('SHI-');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
        if (data.workspaces?.length > 0 && !selectedWorkspace) {
          setSelectedWorkspace(data.workspaces[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async (wsId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/workspaces/${wsId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [token]);

  useEffect(() => {
    if (selectedWorkspace) {
      fetchMembers(selectedWorkspace.id);
    }
  }, [selectedWorkspace, token]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteShioriId.trim() || !selectedWorkspace || !token) return;

    try {
      const res = await fetch(`/api/workspaces/${selectedWorkspace.id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ shioriId: inviteShioriId.trim().toUpperCase() })
      });

      if (res.ok) {
        const data = await res.json();
        setInviteShioriId('SHI-');
        setIsInviteOpen(false);
        fetchMembers(selectedWorkspace.id);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send invitation');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/workspaces/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'ACCEPT' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            COLLABORATIVE WORKSPACES
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Simple Creator & Member collaboration • Two-Sided OTP Member Verification
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workspaces List */}
        <div className="space-y-4 font-technical">
          <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
            YOUR WORKSPACES
          </h2>

          <div className="space-y-2">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => setSelectedWorkspace(ws)}
                className={`p-4 border rounded-sm cursor-pointer transition-colors ${
                  selectedWorkspace?.id === ws.id
                    ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                    : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    <span className="font-bold text-xs">{ws.name}</span>
                  </div>
                  <span className="text-[10px] uppercase opacity-75">
                    {ws.user_role || 'member'}
                  </span>
                </div>
                <p className="text-xs mt-2 opacity-90 line-clamp-1">{ws.description || 'Workspace'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Workspace Members */}
        <div className="lg:col-span-2 space-y-4 font-technical">
          <div className="flex items-center justify-between border-b border-eink-border pb-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                {selectedWorkspace?.name || 'WORKSPACE'} MEMBERS ({members.length})
              </h2>
              <p className="text-[11px] text-eink-textMuted">
                Members collaborate on project tasks with explicit two-sided verification
              </p>
            </div>

            <button
              onClick={() => setIsInviteOpen(true)}
              className="px-3 py-1.5 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>INVITE BY SHIORI ID</span>
            </button>
          </div>

          {/* Pending Invitations Banner */}
          {invitations.length > 0 && (
            <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm space-y-2 text-xs">
              <h3 className="font-bold text-eink-text uppercase">PENDING MEMBER INVITATIONS</h3>
              <div className="divide-y divide-eink-border/50">
                {invitations.map((inv) => (
                  <div key={inv.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-eink-text">{inv.invitee_name}</span>
                      <span className="bg-eink-bg border border-eink-border px-1.5 py-0.2 rounded text-[10px] ml-2">
                        {inv.invitee_shiori_id}
                      </span>
                    </div>
                    {inv.active_session_id ? (
                      <button
                        onClick={() => setActiveSessionId(inv.active_session_id)}
                        className="px-3 py-1 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1 text-xs"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>ENTER INVITATION OTP</span>
                      </button>
                    ) : (
                      <span className="text-eink-textMuted text-[11px]">Awaiting recipient response</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members Table */}
          <div className="border border-eink-border rounded-sm bg-eink-surface overflow-hidden">
            <table className="w-full text-left text-xs font-technical">
              <thead className="bg-eink-bg border-b border-eink-border text-eink-textMuted uppercase text-[10px]">
                <tr>
                  <th className="p-3">MEMBER</th>
                  <th className="p-3">SHIORI ID</th>
                  <th className="p-3">ROLE</th>
                  <th className="p-3">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eink-border/50">
                {members.map((m) => (
                  <tr key={m.membership_id}>
                    <td className="p-3 font-bold text-eink-text flex items-center gap-2">
                      <div className="w-6 h-6 rounded-sm bg-eink-darkSurface text-eink-darkText flex items-center justify-center font-bold text-[10px]">
                        {m.name[0]}
                      </div>
                      <span>{m.name}</span>
                    </td>
                    <td className="p-3">
                      <span className="bg-eink-bg border border-eink-border px-1.5 py-0.2 rounded text-[10px] font-bold">
                        {m.shiori_id || 'SHI-***'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 border border-eink-border rounded text-[10px] bg-eink-bg text-eink-text uppercase font-bold">
                        {m.role}
                      </span>
                    </td>
                    <td className="p-3 text-eink-text font-bold text-[11px]">
                      ✓ ACTIVE
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Invite Member by Exact SHIORI ID Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setIsInviteOpen(false)} />
          <div className="relative w-full max-w-md bg-eink-bg border border-eink-border p-6 rounded-sm shadow-2xl z-10 space-y-4 font-technical">
            <h3 className="font-bold text-sm uppercase text-eink-text">
              ADD MEMBER TO {selectedWorkspace?.name}
            </h3>
            <p className="text-xs text-eink-textSecondary font-sans">
              Enter the person's exact SHIORI ID. Two-sided OTP verification will be required upon acceptance.
            </p>

            <form onSubmit={handleInvite} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] text-eink-textMuted uppercase mb-1">
                  EXACT SHIORI ID *
                </label>
                <input
                  type="text"
                  value={inviteShioriId}
                  onChange={(e) => setInviteShioriId(e.target.value.toUpperCase())}
                  placeholder="SHI-XXXXXX"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-sm font-bold text-eink-text tracking-widest outline-none"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm"
                >
                  SEND INVITATION
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Workspace Verification Session Modal */}
      <WorkspaceOtpModal
        sessionId={activeSessionId}
        onClose={() => setActiveSessionId(null)}
        onVerified={() => {
          if (selectedWorkspace) fetchMembers(selectedWorkspace.id);
        }}
      />
    </div>
  );
};
