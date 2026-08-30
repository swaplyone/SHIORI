import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Plus,
  FolderGit2,
  GitBranch,
  Github,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Users,
  UserPlus,
  Check,
  X,
  Mail,
  Shield,
  Clock,
  Send
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Project, Workspace } from '../types';
import { ProjectsGridSkeleton } from '../components/ui/Skeleton';

interface ProjectInvitation {
  id: string;
  project_id: string;
  project_name: string;
  project_slug: string;
  project_description?: string;
  github_repo_name?: string;
  inviter_name: string;
  inviter_email: string;
  inviter_shiori_id: string;
  role: string;
  created_at: string;
}

export const ProjectsPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();

  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  // New Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectRepo, setNewProjectRepo] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');

  // Members Management Modal State
  const [selectedProjectForMembers, setSelectedProjectForMembers] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [projectPendingInvites, setProjectPendingInvites] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'maintainer'>('member');
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const fetchProjects = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvitations = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/projects/invitations/pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingInvitations(data.invitations || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWorkspaces = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/workspaces', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
        if (data.workspaces?.length > 0) {
          setSelectedWorkspaceId(data.workspaces[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchPendingInvitations();
    fetchWorkspaces();
  }, [token]);

  const handleRespondInvitation = async (inviteId: string, action: 'ACCEPT' | 'DECLINE') => {
    if (!token) return;
    try {
      const res = await fetch(`/api/projects/invitations/${inviteId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchPendingInvitations();
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openMembersModal = async (proj: Project) => {
    setSelectedProjectForMembers(proj);
    setInviteMsg(null);
    setInviteIdentifier('');
    if (!token) return;
    try {
      setMembersLoading(true);
      const res = await fetch(`/api/projects/${proj.id}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjectMembers(data.members || []);
        setProjectPendingInvites(data.pendingInvitations || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleSendProjectInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectForMembers || !inviteIdentifier.trim() || !token) return;
    setInviteSubmitting(true);
    setInviteMsg(null);

    const val = inviteIdentifier.trim();
    const payload: any = { role: inviteRole };
    if (val.toUpperCase().startsWith('SHI-')) {
      payload.shioriId = val;
    } else if (val.includes('@')) {
      payload.email = val;
    } else {
      payload.username = val;
    }

    try {
      const res = await fetch(`/api/projects/${selectedProjectForMembers.id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMsg({ type: 'success', text: data.message || 'Invitation sent successfully.' });
        setInviteIdentifier('');
        openMembersModal(selectedProjectForMembers);
      } else {
        setInviteMsg({ type: 'error', text: data.error || 'Failed to send invitation.' });
      }
    } catch (err: any) {
      setInviteMsg({ type: 'error', text: err.message || 'Network error sending invitation.' });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRemoveMemberOrInvite = async (userId: string) => {
    if (!selectedProjectForMembers || !token) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectForMembers.id}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        openMembersModal(selectedProjectForMembers);
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !selectedWorkspaceId || !token) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc,
          workspaceId: selectedWorkspaceId,
          githubRepoName: newProjectRepo || null,
          githubRepoUrl: newProjectRepo ? `https://github.com/swaplyone/${newProjectRepo}` : null
        })
      });

      if (res.ok) {
        setNewProjectName('');
        setNewProjectDesc('');
        setNewProjectRepo('');
        setIsModalOpen(false);
        fetchProjects();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 select-none font-sans pb-12">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-technical text-xl sm:text-2xl font-bold tracking-tight text-eink-text uppercase">
            PROJECTS & REPOSITORIES
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Repository linking, multi-developer collaboration, and technical progress
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3.5 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>NEW PROJECT</span>
        </button>
      </div>

      {/* PENDING PROJECT INVITATIONS BANNER */}
      {pendingInvitations.length > 0 && (
        <div className="p-4 bg-eink-surface border-2 border-eink-text rounded-sm space-y-3 shadow-eink-card animate-fade-in font-technical">
          <div className="flex items-center gap-2 border-b border-eink-border pb-2">
            <Mail className="w-4 h-4 text-eink-text animate-pulse" />
            <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
              PENDING PROJECT INVITATIONS ({pendingInvitations.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 bg-eink-bg border border-eink-border rounded-sm space-y-2 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm text-eink-text uppercase truncate">
                      {inv.project_name}
                    </span>
                    <span className="text-[10px] bg-eink-surface px-1.5 py-0.2 border border-eink-border rounded font-mono font-bold shrink-0">
                      ROLE: {inv.role || 'MEMBER'}
                    </span>
                  </div>
                  <p className="text-xs text-eink-textSecondary">
                    Invited by <strong className="text-eink-text font-mono">{inv.inviter_name}</strong> ({inv.inviter_shiori_id})
                  </p>
                  {inv.project_description && (
                    <p className="text-[11px] text-eink-textMuted line-clamp-1">{inv.project_description}</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-eink-border/50">
                  <button
                    type="button"
                    onClick={() => handleRespondInvitation(inv.id, 'DECLINE')}
                    className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs text-eink-textSecondary hover:text-eink-text rounded-sm cursor-pointer"
                  >
                    DECLINE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespondInvitation(inv.id, 'ACCEPT')}
                    className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold text-xs rounded-sm shadow-eink-sm hover:opacity-90 flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>ACCEPT INVITATION</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <ProjectsGridSkeleton count={3} />
      ) : projects.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-eink-border rounded-sm space-y-3 bg-eink-surface/30">
          <FolderGit2 className="w-8 h-8 text-eink-textMuted mx-auto" />
          <h3 className="font-technical font-bold text-sm text-eink-text uppercase">No projects yet</h3>
          <p className="text-xs text-eink-textSecondary max-w-sm mx-auto">
            Create your first project or connect a GitHub repository to start tracking verified tasks.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm inline-flex items-center gap-1.5 shadow-eink-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>CREATE FIRST PROJECT</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => {
            const total = Number(proj.total_tasks || 0);
            const completed = Number(proj.completed_tasks || 0);
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            const membersCount = proj.members?.length || proj.membersCount || 1;

            return (
              <div
                key={proj.id}
                className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-card flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-eink-text" />
                      <h3 className="font-technical font-bold text-sm text-eink-text uppercase">
                        {proj.name}
                      </h3>
                    </div>
                    <span className="text-[10px] font-technical px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-text">
                      {proj.status || 'ACTIVE'}
                    </span>
                  </div>

                  <p className="text-xs text-eink-textSecondary line-clamp-2">
                    {proj.description || 'Workspace repository project'}
                  </p>

                  {/* GitHub Repo info & Members Badge */}
                  <div className="p-2.5 bg-eink-bg border border-eink-border rounded-sm text-xs font-technical space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-eink-textMuted uppercase">REPOSITORY</span>
                      <button
                        type="button"
                        onClick={() => openMembersModal(proj)}
                        className="text-[10px] text-eink-text hover:underline flex items-center gap-1 font-bold cursor-pointer"
                      >
                        <Users className="w-3 h-3" />
                        <span>{membersCount} {membersCount === 1 ? 'MEMBER' : 'MEMBERS'}</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-eink-text truncate">
                        {proj.github_repo_name || 'No repository linked'}
                      </span>
                      <span className="text-[10px] text-eink-textMuted">
                        branch: {proj.default_branch || 'main'}
                      </span>
                    </div>
                  </div>

                  {/* Progress breakdown */}
                  <div className="space-y-2 pt-2 border-t border-eink-border/60 text-xs font-technical">
                    <div className="flex items-center justify-between">
                      <span className="text-eink-textSecondary">{total} total tasks</span>
                      <span className="font-bold text-eink-text">
                        {percent}% complete
                      </span>
                    </div>

                    <div className="w-full bg-eink-bg h-2 border border-eink-border rounded overflow-hidden">
                      <div
                        className="bg-eink-text h-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-eink-textMuted pt-0.5">
                      <span>✓ {completed} completed</span>
                      <span>○ {Math.max(0, total - completed)} active</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-eink-border flex items-center justify-between font-technical text-xs">
                  <button
                    type="button"
                    onClick={() => openMembersModal(proj)}
                    className="px-2.5 py-1 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>+ INVITE</span>
                  </button>

                  <a
                    href={`/tasks?repo=${encodeURIComponent(proj.github_repo_name || proj.name)}`}
                    className="text-eink-text font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>VIEW TASKS</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PROJECT MEMBERS MANAGEMENT & INVITATION MODAL */}
      {selectedProjectForMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setSelectedProjectForMembers(null)}
          />
          <div className="relative w-full max-w-lg bg-eink-bg border border-eink-border p-6 rounded-sm shadow-2xl z-10 space-y-4 font-technical max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div>
                <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                  PROJECT COLLABORATION
                </span>
                <h3 className="font-bold text-base text-eink-text uppercase">
                  {selectedProjectForMembers.name} MEMBERS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProjectForMembers(null)}
                className="p-1 border border-eink-border rounded hover:bg-eink-surface cursor-pointer text-eink-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Invite New Collaborator Form */}
            <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm space-y-2">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold block">
                INVITE A DEVELOPER TO JOIN THIS PROJECT
              </span>
              <p className="text-[11px] text-eink-textSecondary font-sans leading-tight">
                Invitees will receive a notification in their dashboard and must accept the invitation to become a project member.
              </p>

              <form onSubmit={handleSendProjectInvite} className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteIdentifier}
                    onChange={(e) => setInviteIdentifier(e.target.value)}
                    placeholder="Enter SHIORI ID (e.g. SHI-XXXXX) or Username..."
                    className="flex-1 px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-mono text-eink-text outline-none"
                    required
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="px-2 py-2 bg-eink-bg border border-eink-border rounded-sm text-xs font-bold font-technical outline-none text-eink-text"
                  >
                    <option value="member">MEMBER</option>
                    <option value="maintainer">MAINTAINER</option>
                  </select>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={inviteSubmitting || !inviteIdentifier.trim()}
                    className="px-4 py-2 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{inviteSubmitting ? 'SENDING...' : 'SEND INVITATION'}</span>
                  </button>
                </div>
              </form>

              {inviteMsg && (
                <div
                  className={`p-2.5 border rounded-sm text-xs font-bold ${
                    inviteMsg.type === 'success'
                      ? 'bg-eink-bg text-eink-text border-eink-text'
                      : 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                  }`}
                >
                  {inviteMsg.text}
                </div>
              )}
            </div>

            {/* Current Active Members */}
            <div className="space-y-2">
              <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
                ACTIVE MEMBERS ({projectMembers.length})
              </span>

              {membersLoading ? (
                <div className="p-4 text-center text-xs text-eink-textMuted font-mono">Loading members...</div>
              ) : projectMembers.length === 0 ? (
                <div className="p-3 text-center text-xs text-eink-textMuted border border-dashed border-eink-border">
                  No members recorded yet.
                </div>
              ) : (
                <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border">
                  {projectMembers.map((m) => {
                    const isSelf = m.id === user?.id;
                    const isOwner = m.role === 'owner';
                    return (
                      <div key={m.id} className="p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-sm bg-eink-bg border border-eink-border flex items-center justify-center font-bold text-xs font-mono">
                            {m.name?.[0] || 'U'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-eink-text">{m.name}</span>
                              {isSelf && <span className="text-[10px] text-eink-textMuted">(You)</span>}
                            </div>
                            <span className="text-[10px] text-eink-textSecondary font-mono block">
                              {m.shiori_id || m.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 border rounded ${
                              isOwner
                                ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                                : 'bg-eink-bg text-eink-text border-eink-border'
                            }`}
                          >
                            {m.role ? m.role.toUpperCase() : 'MEMBER'}
                          </span>

                          {!isOwner && !isSelf && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberOrInvite(m.id)}
                              className="text-[10px] text-eink-textMuted hover:text-eink-text hover:underline cursor-pointer"
                              title="Remove member from project"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Outgoing Invitations */}
            {projectPendingInvites.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
                  PENDING INVITATIONS ({projectPendingInvites.length})
                </span>
                <div className="border border-eink-border rounded-sm bg-eink-surface/70 divide-y divide-eink-border">
                  {projectPendingInvites.map((pi) => (
                    <div key={pi.id} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-eink-text block">{pi.name}</span>
                        <span className="text-[10px] text-eink-textSecondary font-mono block">
                          {pi.shiori_id || pi.email} • Awaiting Acceptance
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-eink-bg border border-eink-border rounded text-eink-textMuted flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          <span>PENDING</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMemberOrInvite(pi.id)}
                          className="text-[10px] text-eink-textMuted hover:text-eink-text hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-eink-bg border border-eink-border p-6 rounded-sm shadow-2xl z-10 space-y-4">
            <h3 className="font-technical font-bold text-sm uppercase">CREATE NEW PROJECT</h3>
            <form onSubmit={handleCreateProject} className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  PROJECT NAME *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. SHIORI"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  DESCRIPTION
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Project scope and goals..."
                  rows={2}
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  LINK GITHUB REPO NAME
                </label>
                <input
                  type="text"
                  value={newProjectRepo}
                  onChange={(e) => setNewProjectRepo(e.target.value)}
                  placeholder="e.g. SHIORI"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs font-technical rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-eink-text text-eink-bg text-xs font-technical font-bold rounded-sm shadow-eink-sm"
                >
                  CREATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
