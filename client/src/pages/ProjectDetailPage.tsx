import React, { useState, useEffect, useMemo } from 'react';
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
  Calendar,
  ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, TaskStatus, TaskPriority } from '../types';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { CodeRecoveryModal } from '../components/recovery/CodeRecoveryModal';
import { GitHistoryModal } from '../components/github/GitHistoryModal';
import { DevelopmentEvidenceBadge } from '../components/tasks/DevelopmentEvidenceBadge';
import { fetchJson } from '../utils/api';
import { Skeleton, SkeletonTitle, SkeletonBadge, SkeletonButton, TodoListSkeleton } from '../components/ui/Skeleton';
import { AiDeveloperHandoffModal } from '../components/tasks/AiDeveloperHandoffModal';

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const navigate = useNavigate();

  const [project, setProject] = useState<any | null>(null);
  const [todos, setTodos] = useState<Task[]>([]);
  const [activeTab, setActiveTab] = useState<'todos' | 'git' | 'members'>('todos');
  const [loading, setLoading] = useState(true);

  // Filter & Sort state for Project TODOs
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority' | 'due_date'>('newest');

  // Modals state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAddTodoOpen, setIsAddTodoOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [createdHandoffTask, setCreatedHandoffTask] = useState<Task | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);

  // Forms state
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDescription, setNewTodoDescription] = useState('');
  const [newTodoBranch, setNewTodoBranch] = useState('main');
  const [newTodoAssignee, setNewTodoAssignee] = useState('');
  const [newTodoPriority, setNewTodoPriority] = useState<TaskPriority>('MEDIUM');
  const [newTodoDueDate, setNewTodoDueDate] = useState('Tomorrow');
  const [newTodoDueAt, setNewTodoDueAt] = useState('');
  const [memberShioriId, setMemberShioriId] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Commits & Git history state
  const [commits, setCommits] = useState<any[]>([]);

  const fetchProjectData = async (silent = false) => {
    if (!projectId || !token) return;
    try {
      if (!silent && !project) {
        setLoading(true);
      }
      const { ok, data } = await fetchJson(`/api/projects/${encodeURIComponent(projectId)}`);
      if (ok && data?.project) {
        setProject(data.project);
        setTodos(data.todos || []);
        if (data.project.default_branch) {
          setNewTodoBranch(data.project.default_branch);
        }

        // Fetch Git commits in background asynchronously without blocking UI render
        if (data.project.github_repo_name) {
          fetchJson(`/api/github/history?repo=${encodeURIComponent(data.project.github_repo_name)}`)
            .then(({ ok: gitOk, data: gitData }) => {
              if (gitOk && gitData?.commits) {
                setCommits(gitData.commits);
              }
            })
            .catch(console.error);
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

    const handleRefresh = () => fetchProjectData(true);
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
    } catch (err) {
      console.error(err);
      fetchProjectData(true);
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || !project || !token) return;

    const tempTitle = newTodoTitle.trim();
    const tempDesc = newTodoDescription.trim() || null;
    const tempBranch = newTodoBranch.trim() || 'main';
    const tempAssigneeId = newTodoAssignee || null;
    const tempPriority = newTodoPriority;
    const tempDueDate = newTodoDueDate;
    const tempDueAt = newTodoDueAt || null;

    // 1. Instant optimistic creation
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: any = {
      id: tempId,
      task_code: '...',
      title: tempTitle,
      description: tempDesc,
      status: 'TODO',
      priority: tempPriority,
      user_status: 'TODO',
      project_id: project.id,
      github_branch: tempBranch,
      assignee_id: tempAssigneeId,
      assignee_name: project.members?.find((m: any) => m.id === tempAssigneeId)?.name || 'Unassigned',
      due_date: tempDueDate,
      due_at: tempDueAt,
      created_at: new Date().toISOString()
    };

    setTodos((prev) => [optimisticTask, ...prev]);
    setNewTodoTitle('');
    setNewTodoDescription('');
    setNewTodoPriority('MEDIUM');
    setNewTodoDueDate('Tomorrow');
    setNewTodoDueAt('');
    setIsAddTodoOpen(false);
    triggerEInkRefresh();

    try {
      const { ok, data } = await fetchJson('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          title: tempTitle,
          description: tempDesc,
          status: 'TODO',
          priority: tempPriority,
          dueDate: tempDueDate,
          due_at: tempDueAt,
          githubRepo: project.github_repo_name,
          githubBranch: tempBranch,
          assigneeId: tempAssigneeId
        })
      });

      if (ok && data?.task) {
        setTodos((prev) => prev.map((t) => (t.id === tempId ? data.task : t)));
        if (data.task.status !== 'DONE' && data.task.user_status !== 'COMPLETED') {
          setCreatedHandoffTask(data.task);
        }
      }
    } catch (err) {
      console.error(err);
      // Rollback on network error
      setTodos((prev) => prev.filter((t) => t.id !== tempId));
    }
  };

  const getPriorityRank = (p?: string): number => {
    switch ((p || '').toUpperCase()) {
      case 'URGENT': return 4;
      case 'HIGH': return 3;
      case 'MEDIUM': return 2;
      case 'LOW': return 1;
      default: return 2;
    }
  };

  const filteredAndSortedTodos = useMemo(() => {
    return todos
      .filter((t) => {
        if (priorityFilter && (t.priority || 'MEDIUM').toUpperCase() !== priorityFilter.toUpperCase()) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') {
          return (a.task_number || 0) - (b.task_number || 0);
        }
        if (sortBy === 'priority') {
          const pDiff = getPriorityRank(b.priority) - getPriorityRank(a.priority);
          if (pDiff !== 0) return pDiff;
          return (b.task_number || 0) - (a.task_number || 0);
        }
        if (sortBy === 'due_date') {
          const dA = a.due_at ? new Date(a.due_at).getTime() : 9999999999999;
          const dB = b.due_at ? new Date(b.due_at).getTime() : 9999999999999;
          return dA - dB;
        }
        // Default: newest
        return (b.task_number || 0) - (a.task_number || 0);
      });
  }, [todos, priorityFilter, sortBy]);

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

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!project || !token) return;
    const isSelf = memberId === user?.id;
    const confirmed = window.confirm(
      isSelf
        ? `Are you sure you want to leave ${project.name}?`
        : `Are you sure you want to remove ${memberName} from ${project.name}?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/projects/${project.id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchProjectData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && !project) {
    return (
      <div className="space-y-6 select-none font-sans pb-12" aria-busy="true" aria-label="Loading project workspace...">
        {/* Top Breadcrumb & Project Header */}
        <div className="border-b border-eink-border pb-4 space-y-3 font-technical">
          <Skeleton variant="text" className="h-3 w-32" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2">
                <Skeleton variant="rounded" className="w-4 h-4" />
                <SkeletonTitle size="lg" width="220px" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton variant="text" className="h-2.5 w-36" />
                <Skeleton variant="text" className="h-2.5 w-24" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SkeletonButton width="110px" />
              <SkeletonButton width="105px" />
            </div>
          </div>
        </div>

        {/* Overview Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-technical text-xs">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 bg-eink-surface border border-eink-border rounded-sm space-y-1">
              <Skeleton variant="text" className="h-2 w-20" />
              <SkeletonTitle size="md" width="45px" />
            </div>
          ))}
        </div>

        {/* Tabs & Content List */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-eink-border pb-2">
            <SkeletonButton width="80px" size="sm" />
            <SkeletonButton width="90px" size="sm" />
            <SkeletonButton width="75px" size="sm" />
          </div>
          <TodoListSkeleton rows={4} />
        </div>
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
          className="text-xs font-bold text-eink-textSecondary hover:text-eink-text flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>BACK TO PROJECTS</span>
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
              className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ADD TODO</span>
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
          {/* Header & Filter/Sort Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-eink-border/60">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider">
                PROJECT TODOS ({filteredAndSortedTodos.length})
              </span>
              <span className="text-xs text-eink-textSecondary">
                {todos.filter((t) => t.status !== 'DONE').length} pending · {todos.filter((t) => t.status === 'DONE').length} completed
              </span>
            </div>

            {/* Filter by Priority & Sort Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Sort Filter */}
              <div className="flex items-center gap-1 bg-eink-surface border border-eink-border rounded-sm px-2 py-0.5 shadow-eink-sm">
                <ArrowUpDown className="w-3 h-3 text-eink-text" />
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs font-technical font-bold text-eink-text outline-none cursor-pointer py-1"
                >
                  <option value="newest">SORT: NEWEST</option>
                  <option value="oldest">SORT: OLDEST (1 → 30)</option>
                  <option value="priority">SORT: PRIORITY</option>
                  <option value="due_date">SORT: DUE DATE</option>
                </select>
              </div>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical font-bold text-eink-text outline-none shadow-eink-sm"
              >
                <option value="">ALL PRIORITIES</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
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
            ) : filteredAndSortedTodos.length === 0 ? (
              <div className="p-12 text-center text-xs text-eink-textMuted font-technical space-y-2">
                <p>{todos.length === 0 ? 'No TODOs in this project yet.' : 'No TODOs match the selected priority filter.'}</p>
                {todos.length === 0 && (
                  <button
                    onClick={() => setIsAddTodoOpen(true)}
                    className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs cursor-pointer"
                  >
                    + CREATE FIRST TODO
                  </button>
                )}
              </div>
            ) : (
              filteredAndSortedTodos.map((task) => {
                const isDone = task.status === 'DONE';
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 hover:bg-eink-surfaceHover cursor-pointer transition-colors ${
                      isDone ? 'opacity-70 bg-eink-bg/50' : ''
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={(e) => handleToggleTaskStatus(task, e)}
                        className="mt-0.5 sm:mt-0 p-1 text-eink-text hover:text-eink-textSecondary shrink-0 cursor-pointer"
                      >
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-eink-text" />
                        ) : (
                          <Square className="w-4 h-4 text-eink-textMuted" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="font-bold text-[10px] sm:text-xs bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono">
                            {task.task_code || 'TODO'}
                          </span>

                          {/* Priority Badge */}
                          <span
                            className={`text-[9px] sm:text-[10px] font-mono font-bold px-1.5 py-0.2 border rounded ${
                              (task.priority || 'MEDIUM') === 'URGENT'
                                ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                                : task.priority === 'HIGH'
                                ? 'bg-eink-text text-eink-bg border-eink-text'
                                : task.priority === 'LOW'
                                ? 'bg-eink-bg text-eink-textMuted border-eink-border'
                                : 'bg-eink-bg text-eink-text border-eink-border'
                            }`}
                          >
                            {task.priority === 'URGENT' ? '⚡ URGENT' : task.priority || 'MEDIUM'}
                          </span>

                          <h4
                            className={`text-xs font-bold text-eink-text truncate max-w-[200px] sm:max-w-md ${
                              isDone ? 'line-through text-eink-textMuted' : ''
                            }`}
                          >
                            {task.title}
                          </h4>
                          {Boolean(task.auto_completed) && (
                            <span className="text-[9px] sm:text-[10px] font-bold bg-eink-bg text-eink-text px-1.5 py-0.2 border border-eink-border rounded flex items-center gap-1 font-mono">
                              ✓ AUTO COMPLETED • GitHub activity detected
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-eink-textSecondary font-mono">
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
                          {task.due_date && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-eink-text font-bold">
                                <Calendar className="w-3 h-3" />
                                <span>{task.due_date}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 self-end sm:self-center">
                      <DevelopmentEvidenceBadge
                        confidenceScore={task.dev_confidence_score}
                        ciStatus={task.github_ci_status}
                        hasDiscrepancy={task.has_ci_discrepancy}
                        compact={true}
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
                className="px-3.5 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90"
              >
                <GitCommit className="w-3.5 h-3.5" />
                <span>FULL COMMITS ({commits.length})</span>
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

          {/* Quick Commit History Strip */}
          <div className="border border-eink-border rounded-sm bg-eink-surface overflow-hidden">
            <div className="p-3 border-b border-eink-border bg-eink-bg flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider">
                RECENT COMMITS ({commits.length})
              </span>
              <span className="text-[10px] text-eink-textSecondary font-mono">
                Branch: <strong>{project.default_branch || 'main'}</strong>
              </span>
            </div>

            <div className="divide-y divide-eink-border">
              {commits.length === 0 ? (
                <div className="p-8 text-center text-xs text-eink-textMuted font-mono">
                  No Git commits recorded for this repository yet.
                </div>
              ) : (
                commits.slice(0, 5).map((c) => (
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
                ))
              )}
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

                {/* Remove / Leave member option */}
                {(project.created_by === user?.id || m.id === user?.id) && m.id !== project.created_by && (
                  <div className="pt-2 border-t border-eink-border flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id, m.name)}
                      className="px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-500/10 border border-red-300 rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{m.id === user?.id ? 'LEAVE PROJECT' : 'REMOVE'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD TODO MODAL (With Priority & Calendar Options) */}
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

              {/* PRIORITY SELECTION */}
              <div>
                <label className="block text-[10px] font-technical font-bold text-eink-textMuted uppercase mb-1.5">
                  PRIORITY
                </label>
                <div className="grid grid-cols-4 gap-1.5 font-technical text-xs">
                  {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as TaskPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewTodoPriority(p)}
                      className={`py-1.5 px-2 border rounded-sm font-bold text-[11px] transition-all cursor-pointer ${
                        newTodoPriority === p
                          ? p === 'URGENT'
                            ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface shadow-eink-sm'
                            : 'bg-eink-text text-eink-bg border-eink-text shadow-eink-sm'
                          : 'bg-eink-surface hover:bg-eink-surfaceHover border-eink-border text-eink-text'
                      }`}
                    >
                      {p === 'URGENT' ? '⚡ URGENT' : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* CALENDAR / DUE DATE SELECTION */}
              <div>
                <label className="block text-[10px] font-technical font-bold text-eink-textMuted uppercase mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-eink-text" />
                  <span>CALENDAR / DUE DATE</span>
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-technical">
                    {['Today', 'Tomorrow', 'This Friday', 'Next Week'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setNewTodoDueDate(preset);
                          setNewTodoDueAt('');
                        }}
                        className={`px-2.5 py-1 border rounded-sm transition-all cursor-pointer ${
                          newTodoDueDate === preset && !newTodoDueAt
                            ? 'bg-eink-text text-eink-bg font-bold border-eink-text shadow-eink-sm'
                            : 'bg-eink-surface text-eink-text border-eink-border hover:bg-eink-surfaceHover'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newTodoDueAt}
                      onChange={(e) => {
                        setNewTodoDueAt(e.target.value);
                        if (e.target.value) {
                          setNewTodoDueDate(new Date(e.target.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                        }
                      }}
                      className="px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-mono text-eink-text outline-none cursor-pointer"
                    />
                    <span className="text-[11px] text-eink-textSecondary font-mono">
                      📅 {newTodoDueDate || 'Tomorrow'}
                    </span>
                  </div>
                </div>
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
                  className="px-3 py-1.5 border border-eink-border text-xs text-eink-textSecondary hover:bg-eink-surface rounded-sm cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTodoTitle.trim()}
                  className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 disabled:opacity-50 cursor-pointer"
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
        repoName={project.github_repo_name || 'SHIORI'}
        branchName={project.default_branch || 'main'}
      />

      {/* Code Recovery Modal */}
      <CodeRecoveryModal
        isOpen={isRecoveryOpen}
        onClose={() => setIsRecoveryOpen(false)}
        defaultRepo={project.github_repo_name || 'SHIORI'}
      />

      {/* AI Developer Handoff Modal */}
      <AiDeveloperHandoffModal
        isOpen={Boolean(createdHandoffTask)}
        task={createdHandoffTask}
        onClose={() => setCreatedHandoffTask(null)}
      />
    </div>
  );
};
