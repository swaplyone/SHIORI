import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Github,
  GitBranch,
  Users,
  CheckSquare,
  Square,
  Plus,
  ArrowLeft,
  RotateCcw,
  GitCommit,
  UserPlus,
  Trash2,
  Check,
  ShieldCheck,
  Code,
  FileCode,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, TaskStatus } from '../types';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { CodeRecoveryModal } from '../components/recovery/CodeRecoveryModal';
import { GitHistoryModal } from '../components/github/GitHistoryModal';
import { DevelopmentEvidenceBadge } from '../components/tasks/DevelopmentEvidenceBadge';
import { fetchJson } from '../utils/api';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const navigate = useNavigate();

  const [project, setProject] = useState<any | null>(null);
  const [todos, setTodos] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'todos' | 'git' | 'members'>('todos');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAddTodoOpen, setIsAddTodoOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  // Forms state
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDescription, setNewTodoDescription] = useState('');
  const [newTodoBranch, setNewTodoBranch] = useState('main');
  const [newTodoAssignee, setNewTodoAssignee] = useState('');
  const [memberShioriId, setMemberShioriId] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Commits & Git history state
  const [commits, setCommits] = useState<any[]>([]);

  const fetchProjectData = async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      const { ok, data } = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`);
      if (ok && data?.project) {
        setProject(data.project);
        setTodos(data.todos || []);
        if (data.project.default_branch) {
          setNewTodoBranch(data.project.default_branch);
        }

        // Fetch Git commits for the project's repository
        if (data.project.github_repo_name) {
          const { ok: gitOk, data: gitData } = await fetchJson(`/api/github/history?repo=${encodeURIComponent(data.project.github_repo_name)}`);
          if (gitOk) {
            setCommits(gitData?.commits || []);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();

    const handleRefresh = () => fetchProjectData();
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [projectId, token]);

  const handleToggleTaskStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = task.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    const newUserStatus = newStatus === 'DONE' ? 'COMPLETED' : 'IN_PROGRESS';
    if (!token) return;

    // 1. Instant optimistic state update
    setTodos((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: newStatus,
              user_status: newUserStatus,
              completed_at: newStatus === 'DONE' ? new Date().toISOString() : undefined
            }
          : t
      )
    );

    try {
      await fetchJson(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          userStatus: newUserStatus,
          user_status: newUserStatus
        })
      });
      triggerEInkRefresh();
      window.dispatchEvent(new Event('shiori-refresh'));
    } catch (err) {
      console.error(err);
      fetchProjectData();
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !project || !token) return;

    setSubmitting(true);
    try {
      const { ok, data } = await fetchJson('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          title: newTodoTitle.trim(),
          description: newTodoDescription.trim() || null,
          status: 'TODO',
          priority: 'MEDIUM',
          githubRepo: project.github_repo_name,
          githubBranch: newTodoBranch.trim() || 'main',
          assigneeId: newTodoAssignee || null
        })
      });

      if (ok) {
        if (data?.task) {
          setTodos((prev) => [data.task, ...prev]);
        }
        setNewTodoTitle('');
        setNewTodoDescription('');
        setIsAddTodoOpen(false);
        triggerEInkRefresh();
        window.dispatchEvent(new Event('shiori-refresh'));
        fetchProjectData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberShioriId.trim() || !project || !token) return;

    setSubmitting(true);
    setMemberError(null);
    setMemberSuccess(null);
    try {
      const { ok, data } = await fetchJson(`/api/projects/${project.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ shioriId: memberShioriId.trim() })
      });

      if (ok) {
        setMemberSuccess(data?.message || 'Member added successfully.');
        setMemberShioriId('');
        triggerEInkRefresh();
        fetchProjectData();
        setTimeout(() => setIsAddMemberOpen(false), 1500);
      } else {
        setMemberError(data?.error || 'Failed to add member.');
      }
    } catch (err) {
      setMemberError('Failed to add member. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !project) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center font-technical text-xs space-y-2 select-none text-eink-text">
        <div className="w-2.5 h-2.5 rounded-full bg-eink-text animate-pulse" />
        <span className="font-bold tracking-widest text-xs uppercase">SHIORI</span>
        <span className="text-[10px] text-eink-textMuted">Loading project workspace...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-12 text-center font-technical text-xs space-y-3">
        <p className="text-eink-text">Project not found.</p>
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm"
        >
          RETURN HOME
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none font-sans pb-12">
      {/* Top Breadcrumb & Project Header */}
      <div className="border-b border-eink-border pb-4 space-y-3 font-technical">
        <button
          onClick={() => navigate('/home')}
          className="text-xs font-bold text-eink-textSecondary hover:text-eink-text flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← BACK TO PROJECTS</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-eink-text" />
              <h1 className="text-xl sm:text-2xl font-bold text-eink-text uppercase tracking-tight font-technical">
                {project.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-eink-textSecondary font-mono">
              <span>Repo: <strong className="text-eink-text">{project.github_repo_name}</strong></span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-eink-text" />
                <span>{project.default_branch || 'main'}</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-eink-text" />
                <span>{project.membersCount || project.members?.length || 1} members</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setIsAddTodoOpen(true)}
              className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>+ ADD TODO</span>
            </button>
          </div>
        </div>

        {/* 3 Main Navigation Tabs: TODOs | GIT | MEMBERS */}
        <div className="flex items-center gap-1 pt-2 border-t border-eink-border/60">
          <button
            onClick={() => setActiveTab('todos')}
            className={`px-4 py-1.5 border rounded-sm font-bold text-xs flex items-center gap-1.5 transition-all ${
              activeTab === 'todos'
                ? 'bg-eink-text text-eink-bg border-eink-text shadow-eink-sm'
                : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>TODOs ({todos.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('git')}
            className={`px-4 py-1.5 border rounded-sm font-bold text-xs flex items-center gap-1.5 transition-all ${
              activeTab === 'git'
                ? 'bg-eink-text text-eink-bg border-eink-text shadow-eink-sm'
                : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>GIT & RECOVERY</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-1.5 border rounded-sm font-bold text-xs flex items-center gap-1.5 transition-all ${
              activeTab === 'members'
                ? 'bg-eink-text text-eink-bg border-eink-text shadow-eink-sm'
                : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>MEMBERS ({project.members?.length || 1})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TODOS (Shared with all project members) */}
      {activeTab === 'todos' && (
        <div className="space-y-4 font-technical">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider">
              PROJECT TODOS (SHARED IN REAL-TIME WITH ALL MEMBERS)
            </span>
            <span className="text-xs text-eink-textSecondary">
              {todos.filter((t) => t.status !== 'DONE').length} pending · {todos.filter((t) => t.status === 'DONE').length} completed
            </span>
          </div>

          <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 p-2 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 bg-eink-border/40 rounded-xs" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-48 bg-eink-border/50 rounded-xs" />
                        <div className="h-3 w-32 bg-eink-border/30 rounded-xs" />
                      </div>
                    </div>
                    <div className="h-6 w-24 bg-eink-border/35 rounded-xs" />
                  </div>
                ))}
              </div>
            ) : todos.length === 0 ? (
              <div className="p-12 text-center text-xs text-eink-textMuted font-technical space-y-2">
                <p>No TODOs in this project yet.</p>
                <button
                  onClick={() => setIsAddTodoOpen(true)}
                  className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs cursor-pointer"
                >
                  + CREATE FIRST TODO
                </button>
              </div>
            ) : (
              todos.map((task) => {
                const isDone = task.status === 'DONE';
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-4 flex items-start sm:items-center justify-between gap-3 hover:bg-eink-surfaceHover cursor-pointer transition-colors ${
                      isDone ? 'opacity-70 bg-eink-bg/50' : ''
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleTaskStatus(task, e)}
                        className="mt-0.5 sm:mt-0 p-1 text-eink-text hover:text-eink-textSecondary shrink-0"
                      >
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-eink-text" />
                        ) : (
                          <Square className="w-4 h-4 text-eink-textMuted" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono">
                            {task.task_code || 'TODO'}
                          </span>
                          <h4
                            className={`text-xs font-bold text-eink-text truncate ${
                              isDone ? 'line-through text-eink-textMuted' : ''
                            }`}
                          >
                            {task.title}
                          </h4>
                          {Boolean(task.auto_completed) && (
                            <span className="text-[10px] font-bold bg-eink-bg text-eink-text px-1.5 py-0.2 border border-eink-border rounded flex items-center gap-1 font-mono">
                              ✓ AUTO COMPLETED • GitHub activity detected
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-eink-textSecondary font-mono">
                          <span>Assigned to: <strong className="text-eink-text">{task.assignee_name || 'Unassigned'}</strong></span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            <span>{task.github_branch || 'main'}</span>
                          </span>
                          <span>•</span>
                          <span>
                            {task.dev_evidence_commits_count || (task.github_last_commit_hash ? 1 : 0)} commits
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <DevelopmentEvidenceBadge
                        confidenceScore={task.dev_confidence_score}
                        ciStatus={task.github_ci_status}
                        hasDiscrepancy={task.has_ci_discrepancy}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GIT & CODE RECOVERY */}
      {activeTab === 'git' && (
        <div className="space-y-6 font-technical">
          {/* Action strip */}
          <div className="p-4 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-eink-sm">
            <div>
              <span className="font-bold text-eink-text block uppercase">GIT WORKSPACE & RECOVERY</span>
              <p className="text-[11px] text-eink-textSecondary">
                Inspect commit diffs or restore previous versions safely without destroying current code.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="px-3 py-1.5 border border-eink-border hover:bg-eink-bg font-bold rounded flex items-center gap-1.5 text-eink-text"
              >
                <GitCommit className="w-3.5 h-3.5" />
                <span>FULL GIT HISTORY</span>
              </button>
              <button
                onClick={() => setIsRecoveryOpen(true)}
                className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded flex items-center gap-1.5 shadow-eink-sm hover:opacity-90"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RECOVER CODE</span>
              </button>
            </div>
          </div>

          {/* Recent Commits List */}
          <div className="space-y-3">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
              RECENT COMMITS ({commits.length})
            </span>

            <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border/60 overflow-hidden shadow-eink-card">
              {commits.map((c) => (
                <div
                  key={c.hash}
                  onClick={() => setIsHistoryOpen(true)}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-eink-surfaceHover cursor-pointer text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded">
                        ⎇ {c.hash}
                      </span>
                      <h4 className="font-bold text-eink-text truncate">{c.message}</h4>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-eink-textSecondary font-mono">
                      <span>Author: <strong className="text-eink-text">{c.author}</strong></span>
                      <span>•</span>
                      <span>{c.date}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs shrink-0">
                    <span className="font-bold text-eink-text">+{c.additions}</span>{' '}
                    <span className="text-eink-textMuted">-{c.deletions}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-4 font-technical">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider">
              PROJECT COLLABORATORS ({project.members?.length || 1})
            </span>

            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs flex items-center gap-1.5 shadow-eink-sm hover:opacity-90"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ ADD MEMBER</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {project.members?.map((m: any) => (
              <div
                key={m.id}
                className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 text-xs shadow-eink-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-eink-text uppercase">{m.name}</span>
                  <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono font-bold">
                    {m.role || 'MEMBER'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-eink-textSecondary">
                  <p>SHIORI ID: <strong className="text-eink-text">{m.shiori_id || 'SHI-8F42K'}</strong></p>
                  <p className="text-[10px] text-eink-textMuted">{m.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD TODO MODAL (Repository automatically inherited) */}
      {isAddTodoOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-technical select-none">
          <div className="bg-eink-bg border-2 border-eink-text w-full max-w-lg rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-bold text-xs">
                  +
                </span>
                <h3 className="font-bold text-sm uppercase text-eink-text">
                  ADD TODO TO {project.name}
                </h3>
              </div>
              <button onClick={() => setIsAddTodoOpen(false)} className="p-1 text-eink-textMuted hover:text-eink-text">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTodo} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  TODO TITLE *
                </label>
                <input
                  type="text"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="e.g. Fix authentication & token expiration"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none font-sans"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-technical font-bold text-eink-textMuted uppercase mb-1">
                  DESCRIPTION (OPTIONAL)
                </label>
                <textarea
                  value={newTodoDescription}
                  onChange={(e) => setNewTodoDescription(e.target.value)}
                  placeholder="Technical specifications, requirements, or steps..."
                  rows={2}
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs text-eink-text outline-none resize-none font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-technical">
                <div>
                  <label className="block text-[10px] font-bold text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-eink-text" />
                    <span>BRANCH *</span>
                  </label>
                  <input
                    type="text"
                    value={newTodoBranch}
                    onChange={(e) => setNewTodoBranch(e.target.value)}
                    placeholder="main or feature/auth"
                    className="w-full px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-mono text-eink-text outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-eink-textMuted uppercase mb-1 flex items-center gap-1">
                    <Users className="w-3 h-3 text-eink-text" />
                    <span>ASSIGN TO MEMBER</span>
                  </label>
                  <select
                    value={newTodoAssignee}
                    onChange={(e) => setNewTodoAssignee(e.target.value)}
                    className="w-full px-2 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs outline-none text-eink-text"
                  >
                    <option value="">Unassigned</option>
                    {project.members?.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.shiori_id || 'Member'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-2.5 bg-eink-surface border border-eink-border rounded text-[11px] font-technical text-eink-textSecondary flex items-center gap-2">
                <Github className="w-3.5 h-3.5 text-eink-text" />
                <span>Repository automatically inherited: <strong className="font-mono text-eink-text">{project.github_repo_name}</strong></span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-eink-border font-technical">
                <button
                  type="button"
                  onClick={() => setIsAddTodoOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTodoTitle.trim()}
                  className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'ADDING...' : 'ADD TODO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-technical select-none">
          <div className="bg-eink-bg border-2 border-eink-text w-full max-w-md rounded-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-eink-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-eink-text" />
                <h3 className="font-bold text-sm uppercase text-eink-text">
                  ADD PROJECT MEMBER
                </h3>
              </div>
              <button onClick={() => setIsAddMemberOpen(false)} className="p-1 text-eink-textMuted hover:text-eink-text">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4 text-xs font-technical">
              <div>
                <label className="block text-[11px] font-bold text-eink-textMuted uppercase mb-1">
                  ENTER FRIEND'S EXACT SHIORI ID *
                </label>
                <input
                  type="text"
                  value={memberShioriId}
                  onChange={(e) => setMemberShioriId(e.target.value.toUpperCase())}
                  placeholder="e.g. SHI-8F42K"
                  className="w-full px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-xs font-mono text-eink-text outline-none uppercase tracking-wider"
                  required
                  autoFocus
                />
              </div>

              {memberError && (
                <div className="p-2.5 bg-eink-surface border border-eink-text text-eink-text text-xs rounded">
                  {memberError}
                </div>
              )}

              {memberSuccess && (
                <div className="p-2.5 bg-eink-surface border-2 border-eink-text text-eink-text text-xs rounded font-bold">
                  ✓ {memberSuccess}
                </div>
              )}

              <p className="text-[11px] text-eink-textSecondary font-sans">
                Project members immediately share all TODOs, Git activity, and recovery features.
              </p>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-eink-border">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting || !memberShioriId.trim()}
                  className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'ADDING...' : 'ADD TO PROJECT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TODO Detail Modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={() => fetchProjectData()}
      />

      {/* Git History Modal */}
      <GitHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        repoName={project.github_repo_name || 'swaply-one-compiler'}
        branchName={project.default_branch || 'main'}
      />

      {/* Code Recovery Modal */}
      <CodeRecoveryModal
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        defaultRepo={project.github_repo_name || 'swaply-one-compiler'}
      />
    </div>
  );
};
