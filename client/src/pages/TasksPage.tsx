import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Plus,
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Search,
  GitBranch,
  CheckSquare,
  Square,
  ShieldAlert,
  Github,
  Check,
  Calendar,
  X,
  Repeat,
  Bell,
  Sparkles,
  Tag,
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, TaskStatus, TaskPriority } from '../types';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { DevelopmentEvidenceBadge } from '../components/tasks/DevelopmentEvidenceBadge';
import { TodoListSkeleton, KanbanBoardSkeleton } from '../components/ui/Skeleton';
import { AiDeveloperHandoffModal } from '../components/tasks/AiDeveloperHandoffModal';
import { TaskCalendarView } from '../components/tasks/TaskCalendarView';
import { UndoToast, triggerUndoToast } from '../components/ui/UndoToast';
import { parseNaturalLanguageTask, ParsedTaskInput } from '../utils/nlpTaskParser';

export const TasksPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(() => searchParams.get('repo') || '');
  const [tabFilter, setTabFilter] = useState<'active' | 'completed' | 'archived'>('active');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [sortBy, setSortBy] = useState<'number_desc' | 'number_asc' | 'priority_desc' | 'title_asc'>('number_desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<TaskStatus>('TODO');
  const [createdHandoffTask, setCreatedHandoffTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  // Live NLP parsing for Quick Add
  const quickNlp: ParsedTaskInput = useMemo(() => {
    return parseNaturalLanguageTask(quickTaskTitle);
  }, [quickTaskTitle]);

  // Sync selectedRepo with searchParams when searchParams change
  useEffect(() => {
    const repoFromUrl = searchParams.get('repo');
    if (repoFromUrl !== null) {
      setSelectedRepo(repoFromUrl);
    }
  }, [searchParams]);

  const fetchRepositories = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/github/user-repositories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRepositories(data.repositories || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTasks = async (showSkeleton = false) => {
    if (!token) return;
    try {
      if (showSkeleton || tasks.length === 0) {
        setLoading(true);
      }
      let url = '/api/tasks?';
      if (tabFilter === 'archived') {
        url += 'archived=true&';
      } else if (tabFilter === 'completed') {
        url += 'status=DONE&archived=false&';
      } else {
        url += 'archived=false&';
      }

      if (selectedPriority) url += `priority=${selectedPriority}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, [token]);

  useEffect(() => {
    fetchTasks();

    const handleRefresh = () => fetchTasks();
    window.addEventListener('shiori-refresh', handleRefresh);
    return () => window.removeEventListener('shiori-refresh', handleRefresh);
  }, [token, tabFilter, selectedPriority, searchQuery]);

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    if (!token) return;
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      triggerEInkRefresh();
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTaskStatus = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = task.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    const newUserStatus = newStatus === 'DONE' ? 'COMPLETED' : 'IN_PROGRESS';
    if (!token) return;

    // 1. Instant optimistic update
    setTasks((prev) =>
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
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
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
      fetchTasks();
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim() || !token) return;

    const finalTitle = quickNlp.title || quickTaskTitle.trim();
    const finalDueDate = quickNlp.dueDate || 'Tomorrow';
    const finalPriority = quickNlp.priority || 'MEDIUM';
    const finalRecurrence = quickNlp.recurrenceRule || null;
    const finalTags = quickNlp.tags.length > 0 ? quickNlp.tags.join(', ') : null;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: 'default',
          title: finalTitle,
          status: 'TODO',
          priority: finalPriority,
          dueDate: finalDueDate,
          due_at: quickNlp.dueAt || null,
          recurrence_rule: finalRecurrence,
          tags: finalTags,
          githubRepo: selectedRepo || 'SHIORI',
          githubBranch: 'main'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.task) {
          setTasks((prev) => [data.task, ...prev]);
          if (data.task.status !== 'DONE' && data.task.user_status !== 'COMPLETED') {
            setCreatedHandoffTask(data.task);
          }
        }
        setQuickTaskTitle('');
        triggerEInkRefresh();
        window.dispatchEvent(new Event('shiori-refresh'));
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
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

  const filteredTasks = tasks.filter((t) => {
    if (selectedRepo && t.github_repo !== selectedRepo) return false;
    return true;
  });

  const activeTasks = useMemo(() => {
    return filteredTasks
      .filter((t) => t.status !== 'DONE' && !t.is_archived)
      .sort((a, b) => {
        if (sortBy === 'number_asc') {
          return (a.task_number || 0) - (b.task_number || 0);
        }
        if (sortBy === 'priority_desc') {
          const pDiff = getPriorityRank(b.priority) - getPriorityRank(a.priority);
          if (pDiff !== 0) return pDiff;
          return (b.task_number || 0) - (a.task_number || 0);
        }
        if (sortBy === 'title_asc') {
          return (a.title || '').localeCompare(b.title || '');
        }
        // Default: number_desc
        return (b.task_number || 0) - (a.task_number || 0);
      });
  }, [filteredTasks, sortBy]);

  const completedTasks = useMemo(() => {
    return filteredTasks
      .filter((t) => t.status === 'DONE' && !t.is_archived)
      .sort((a, b) => {
        if (sortBy === 'number_asc') {
          return (a.task_number || 0) - (b.task_number || 0);
        }
        if (sortBy === 'number_desc') {
          return (b.task_number || 0) - (a.task_number || 0);
        }
        if (sortBy === 'title_asc') {
          return (a.title || '').localeCompare(b.title || '');
        }
        const tA = a.completed_at ? new Date(a.completed_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0);
        const tB = b.completed_at ? new Date(b.completed_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0);
        return tB - tA;
      });
  }, [filteredTasks, sortBy]);

  const archivedTasks = filteredTasks.filter((t) => Boolean(t.is_archived));

  const totalCompletedCount = completedTasks.length;
  const totalEvidenceCommits = tasks.reduce((sum, t) => sum + (t.dev_evidence_commits_count || (t.github_last_commit_hash ? 1 : 0)), 0);

  const renderTaskRow = (task: Task, isDone: boolean) => {
    const hasDiscrepancy = Boolean(task.has_ci_discrepancy);
    const isOverdue =
      !isDone &&
      task.due_date &&
      (task.due_date.toLowerCase().includes('yesterday') ||
        (task.due_at && new Date(task.due_at).getTime() < Date.now()));

    return (
      <div
        key={task.id}
        onClick={() => openTaskModal(task.id)}
        className={`p-3 sm:p-3.5 flex items-start justify-between gap-2.5 sm:gap-3 hover:bg-eink-surfaceHover cursor-pointer transition-colors ${
          isDone ? 'opacity-75 bg-eink-bg/60' : 'bg-eink-surface'
        }`}
      >
        <div className="flex items-start gap-2 sm:gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => handleToggleTaskStatus(task, e)}
            className="mt-0.5 p-0.5 text-eink-text hover:text-eink-textSecondary shrink-0 cursor-pointer"
            title={isDone ? 'Restore as Active' : 'Mark as Complete'}
          >
            {isDone ? (
              <CheckSquare className="w-4 h-4 text-eink-text" />
            ) : (
              <Square className="w-4 h-4 text-eink-textMuted hover:text-eink-text" />
            )}
          </button>

          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
              <span className="font-bold text-[10px] sm:text-[11px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono">
                {task.task_code}
              </span>

              {/* Priority Badge with Clear Visual Rank */}
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

              <h3
                className={`text-xs font-bold text-eink-text truncate max-w-[150px] sm:max-w-md ${
                  isDone ? 'line-through text-eink-textMuted' : ''
                }`}
              >
                {task.title}
              </h3>

              {/* Recurring Indicator */}
              {task.recurrence_rule && (
                <span className="text-[9px] sm:text-[10px] font-bold bg-eink-bg text-eink-text px-1.5 py-0.2 border border-eink-border rounded flex items-center gap-1 font-mono">
                  <Repeat className="w-2.5 h-2.5" />
                  <span>{task.recurrence_rule}</span>
                </span>
              )}

              {/* Subtasks Count Badge */}
              {Boolean(task.subtasks_count) && (
                <span className="text-[9px] sm:text-[10px] bg-eink-bg text-eink-textSecondary px-1.5 py-0.2 border border-eink-border rounded font-mono">
                  {task.subtasks_completed || 0}/{task.subtasks_count} subtasks
                </span>
              )}

              {/* Overdue Notice */}
              {isOverdue && (
                <span className="text-[9px] sm:text-[10px] font-bold bg-eink-surface text-eink-text px-1.5 py-0.2 border border-eink-text rounded flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>OVERDUE</span>
                </span>
              )}

              {hasDiscrepancy && (
                <span className="text-[9px] sm:text-[10px] font-bold bg-eink-darkSurface text-eink-darkText px-1.5 py-0.2 rounded flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" />
                  <span>CI ALERT</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] text-eink-textSecondary font-mono leading-tight">
              <span className="font-bold text-eink-text">
                {task.github_repo || 'SHIORI'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-0.5">
                <GitBranch className="w-2.5 h-2.5" />
                <span>{task.github_branch || 'main'}</span>
              </span>
              {task.assignee_name && (
                <>
                  <span>•</span>
                  <span>@{task.assignee_name}</span>
                </>
              )}
              {Boolean(task.dev_evidence_commits_count) && (
                <>
                  <span>•</span>
                  <span>{task.dev_evidence_commits_count} commits</span>
                </>
              )}
              {task.due_date && (
                <>
                  <span>•</span>
                  <span>📅 {task.due_date}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center pt-0.5">
          <DevelopmentEvidenceBadge
            confidenceScore={task.dev_confidence_score}
            ciStatus={task.github_ci_status}
            hasDiscrepancy={task.has_ci_discrepancy}
            compact={true}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 select-none font-sans pb-12">
      {/* 1. Global Metrics Banner */}
      <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-technical shadow-eink-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-eink-text uppercase tracking-wider">TODAY SUMMARY:</span>
          <span className="text-eink-textSecondary">
            {totalCompletedCount} TODOs completed · {totalEvidenceCommits} verified commits
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-eink-text">
          <span className="bg-eink-bg px-1.5 py-0.5 border border-eink-border rounded font-bold">
            {user?.points ?? 120} PTS
          </span>
        </div>
      </div>

      {/* 2. Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4">
        <div>
          <div className="flex items-center gap-2 font-technical text-xs text-eink-textMuted mb-1">
            <span>WORKSPACE</span>
            <span>•</span>
            <span className="font-mono text-eink-text font-bold">
              {selectedRepo ? selectedRepo.toUpperCase() : 'ALL REPOSITORIES'} ({loading ? '...' : filteredTasks.length})
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-technical text-eink-text uppercase tracking-tight">
            YOUR TO-DO TASKS
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-technical text-xs">
          {/* View Mode Toggle: Checklist, Kanban, Calendar */}
          <div className="flex items-center bg-eink-surface border border-eink-border rounded-sm p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-eink-text text-eink-bg font-bold' : 'text-eink-text hover:bg-eink-bg'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 ${
                viewMode === 'kanban' ? 'bg-eink-text text-eink-bg font-bold' : 'text-eink-text hover:bg-eink-bg'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 ${
                viewMode === 'calendar' ? 'bg-eink-text text-eink-bg font-bold' : 'text-eink-text hover:bg-eink-bg'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          <button
            onClick={() => {
              setCreateInitialStatus('TODO');
              setIsCreateOpen(true);
            }}
            className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ ADD TODO</span>
          </button>
        </div>
      </div>

      {/* 3. Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs font-technical border-b border-eink-border pb-3">
        {/* Status Tab Filters */}
        <div className="flex items-center bg-eink-surface border border-eink-border rounded-sm p-0.5 self-start sm:self-auto">
          <button
            onClick={() => setTabFilter('active')}
            className={`px-3 py-1 rounded-sm text-xs font-bold ${
              tabFilter === 'active' ? 'bg-eink-darkSurface text-eink-darkText' : 'text-eink-text hover:bg-eink-bg'
            }`}
          >
            ACTIVE ({tasks.filter((t) => t.status !== 'DONE' && !t.is_archived).length})
          </button>
          <button
            onClick={() => setTabFilter('completed')}
            className={`px-3 py-1 rounded-sm text-xs font-bold ${
              tabFilter === 'completed' ? 'bg-eink-darkSurface text-eink-darkText' : 'text-eink-text hover:bg-eink-bg'
            }`}
          >
            COMPLETED ({tasks.filter((t) => t.status === 'DONE' && !t.is_archived).length})
          </button>
          <button
            onClick={() => setTabFilter('archived')}
            className={`px-3 py-1 rounded-sm text-xs font-bold ${
              tabFilter === 'archived' ? 'bg-eink-darkSurface text-eink-darkText' : 'text-eink-text hover:bg-eink-bg'
            }`}
          >
            ARCHIVED ({tasks.filter((t) => Boolean(t.is_archived)).length})
          </button>
        </div>

        {/* Priority & Repository & Search Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Filter */}
          <div className="flex items-center gap-1 bg-eink-surface border border-eink-border rounded-sm px-2 py-0.5 shadow-eink-sm">
            <ArrowUpDown className="w-3 h-3 text-eink-text" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-technical font-bold text-eink-text outline-none cursor-pointer py-1"
            >
              <option value="number_desc">SORT: NEWEST (SHR-30 → 1)</option>
              <option value="number_asc">SORT: OLDEST (SHR-1 → 30)</option>
              <option value="priority_desc">SORT: PRIORITY (URGENT)</option>
              <option value="title_asc">SORT: TITLE (A → Z)</option>
            </select>
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical font-bold text-eink-text outline-none shadow-eink-sm"
          >
            <option value="">ALL PRIORITIES</option>
            <option value="URGENT">URGENT</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>

          {/* Repository Filter */}
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="px-2.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical font-bold text-eink-text outline-none shadow-eink-sm"
          >
            <option value="">ALL REPOSITORIES</option>
            {repositories.map((repo) => (
              <option key={repo.name} value={repo.name}>
                {repo.name}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="flex items-center gap-1.5 bg-eink-surface border border-eink-border rounded-sm px-2.5 py-1.5 shadow-eink-sm">
            <Search className="w-3.5 h-3.5 text-eink-textMuted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="bg-transparent text-eink-text outline-none text-xs w-28 sm:w-40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-eink-textMuted hover:text-eink-text">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Main Content: List, Kanban, or Calendar */}
      {loading ? (
        viewMode === 'kanban' ? (
          <KanbanBoardSkeleton />
        ) : (
          <TodoListSkeleton rows={5} />
        )
      ) : viewMode === 'calendar' ? (
        <TaskCalendarView
          tasks={filteredTasks}
          onSelectTask={(task: Task) => openTaskModal(task.id)}
          onToggleStatus={handleToggleTaskStatus}
        />
      ) : viewMode === 'kanban' ? (
        <KanbanBoard
          tasks={filteredTasks}
          onSelectTask={(task: Task) => openTaskModal(task.id)}
          onUpdateStatus={handleUpdateStatus}
          onAddTask={(status?: TaskStatus) => {
            setCreateInitialStatus(status || 'TODO');
            setIsCreateOpen(true);
          }}
        />
      ) : (
        <div className="space-y-4 font-technical animate-fade-in">
          {/* Smart NLP Quick Add Input Form with Priority Selector */}
          <div className="space-y-2 p-3 bg-eink-surface border border-eink-border rounded-sm shadow-eink-sm">
            <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row gap-2 text-xs">
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder={`+ Quick add to-do: e.g. "Fix auth bug tomorrow at 5pm #security" (press Enter)...`}
                className="flex-1 px-3 py-2 bg-eink-bg border border-eink-border rounded-sm text-eink-text outline-none focus:border-eink-text text-xs font-sans"
              />
              <button
                type="submit"
                disabled={!quickTaskTitle.trim()}
                className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ADD TODO</span>
              </button>
            </form>

            {/* Smart NLP Interpretation Preview Chips */}
            {quickNlp.hasParsedData && (
              <div className="p-2 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between gap-2 text-[11px] font-technical animate-fade-in">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-eink-textMuted flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>PARSED:</span>
                  </span>
                  <span className="font-bold text-eink-text">"{quickNlp.title}"</span>
                  {quickNlp.dueDate && (
                    <span className="px-1.5 py-0.2 bg-eink-surface border border-eink-border rounded text-eink-text">
                      📅 {quickNlp.dueDate}
                    </span>
                  )}
                  {quickNlp.priority !== 'MEDIUM' && (
                    <span className="px-1.5 py-0.2 bg-eink-surface border border-eink-border rounded text-eink-text font-bold">
                      ⚡ {quickNlp.priority}
                    </span>
                  )}
                  {quickNlp.recurrenceRule && (
                    <span className="px-1.5 py-0.2 bg-eink-surface border border-eink-border rounded text-eink-text">
                      ↻ {quickNlp.recurrenceRule}
                    </span>
                  )}
                  {quickNlp.tags.map((t) => (
                    <span key={t} className="px-1.5 py-0.2 bg-eink-surface border border-eink-border rounded text-eink-text">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Active vs Completed Columns */}
          {tabFilter === 'active' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Active To-Dos Arranged by Priority */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-eink-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-eink-text shrink-0" />
                    <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
                      ACTIVE TO-DOS ({activeTasks.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-eink-textSecondary uppercase font-mono">
                    Priority Sorted (Urgent → Low)
                  </span>
                </div>

                <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden shadow-eink-card">
                  {activeTasks.length === 0 ? (
                    <div className="p-10 text-center text-xs text-eink-textMuted font-technical">
                      No active to-do tasks. Add one above to get started!
                    </div>
                  ) : (
                    activeTasks.map((task) => renderTaskRow(task, false))
                  )}
                </div>
              </div>

              {/* Right Column: Completed To-Dos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-eink-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-eink-textMuted shrink-0" />
                    <h3 className="font-bold text-xs uppercase text-eink-textSecondary tracking-wider">
                      COMPLETED TO-DOS ({completedTasks.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-eink-textMuted uppercase font-mono">
                    Moved When Done
                  </span>
                </div>

                <div className="border border-eink-border rounded-sm bg-eink-surface/70 divide-y divide-eink-border overflow-hidden shadow-eink-sm">
                  {completedTasks.length === 0 ? (
                    <div className="p-10 text-center text-xs text-eink-textMuted font-technical">
                      No completed to-dos yet. Check an active to-do to move it here!
                    </div>
                  ) : (
                    completedTasks.map((task) => renderTaskRow(task, true))
                  )}
                </div>
              </div>
            </div>
          ) : tabFilter === 'completed' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
                  ALL COMPLETED TO-DOS ({completedTasks.length})
                </h3>
              </div>
              <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden shadow-eink-card">
                {completedTasks.length === 0 ? (
                  <div className="p-12 text-center text-xs text-eink-textMuted font-technical">
                    No completed tasks found.
                  </div>
                ) : (
                  completedTasks.map((task) => renderTaskRow(task, true))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <h3 className="font-bold text-xs uppercase text-eink-text tracking-wider">
                  ARCHIVED TO-DOS ({archivedTasks.length})
                </h3>
              </div>
              <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border overflow-hidden shadow-eink-card">
                {archivedTasks.length === 0 ? (
                  <div className="p-12 text-center text-xs text-eink-textMuted font-technical">
                    No archived tasks found.
                  </div>
                ) : (
                  archivedTasks.map((task) => renderTaskRow(task, task.status === 'DONE'))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Create Modal */}
      <TaskCreateModal
        isOpen={isCreateOpen}
        initialStatus={createInitialStatus}
        initialRepo={selectedRepo}
        onClose={() => setIsCreateOpen(false)}
        onTaskCreated={() => {
          triggerEInkRefresh();
          fetchTasks();
        }}
      />

      <AiDeveloperHandoffModal
        isOpen={Boolean(createdHandoffTask)}
        task={createdHandoffTask}
        onClose={() => setCreatedHandoffTask(null)}
      />

      <UndoToast />
    </div>
  );
};
