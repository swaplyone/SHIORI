import React, { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Plus,
  LayoutGrid,
  List,
  Search,
  GitBranch,
  CheckSquare,
  Square,
  ShieldAlert,
  Github,
  Check,
  Calendar
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Task, TaskStatus } from '../types';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TaskCreateModal } from '../components/tasks/TaskCreateModal';
import { DevelopmentEvidenceBadge } from '../components/tasks/DevelopmentEvidenceBadge';

export const TasksPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>(() => searchParams.get('repo') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<TaskStatus>('TODO');
  const [loading, setLoading] = useState(true);

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

  const fetchTasks = async () => {
    if (!token) return;
    try {
      setLoading(true);
      let url = '/api/tasks?';
      if (selectedStatus) url += `status=${selectedStatus}&`;
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
  }, [token, selectedStatus, searchQuery]);

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

    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus, user_status: newUserStatus })
      });
      triggerEInkRefresh();
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim() || !token) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: 'proj-compiler-01',
          title: quickTaskTitle.trim(),
          priority: 'MEDIUM',
          status: 'TODO',
          githubRepo: selectedRepo || 'swaply-one-compiler',
          githubBranch: 'main'
        })
      });
      if (res.ok) {
        setQuickTaskTitle('');
        triggerEInkRefresh();
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter tasks by repository
  const filteredTasks = tasks.filter((t) => {
    if (selectedRepo && t.github_repo !== selectedRepo) return false;
    return true;
  });

  const completedCount = filteredTasks.filter((t) => t.status === 'DONE').length;

  return (
    <div className="space-y-6 font-sans select-none pb-12">
      {/* 1. Daily Minimal Summary Block */}
      <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-technical shadow-eink-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-eink-text uppercase tracking-wider">TODAY SUMMARY:</span>
          <span className="text-eink-textSecondary">
            {completedCount} TODOs completed · 7 commits · 13 files changed
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-eink-text">
          <span className="font-bold">+482 lines</span>
          <span className="text-eink-textMuted">-126 lines</span>
          <span className="bg-eink-bg px-1.5 py-0.5 border border-eink-border rounded font-bold">
            {user?.points ?? 120} PTS
          </span>
        </div>
      </div>

      {/* 2. Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4">
        <div>
          <div className="flex items-center gap-2 font-technical text-xs text-eink-textMuted mb-1">
            <span>REPOSITORY-BASED WORKSPACE</span>
            <span>•</span>
            <span className="font-mono text-eink-text font-bold">
              {selectedRepo ? selectedRepo.toUpperCase() : 'ALL REPOSITORIES'} ({filteredTasks.length})
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold font-technical text-eink-text uppercase tracking-tight">
            YOUR TO-DO TASKS
          </h1>
        </div>

        <div className="flex items-center gap-2 font-technical text-xs">
          <div className="flex items-center bg-eink-surface border border-eink-border rounded-sm p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-eink-text text-eink-bg font-bold' : 'text-eink-text hover:bg-eink-bg'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Checklist</span>
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
          </div>

          <button
            onClick={() => {
              setCreateInitialStatus('TODO');
              setIsCreateOpen(true);
            }}
            className="px-4 py-1.5 bg-eink-text text-eink-bg font-bold rounded-sm flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ ADD TODO</span>
          </button>
        </div>
      </div>

      {/* 3. Filter Toolbar: Repository = Project */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-technical text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Repository Selector (Repository = Project) */}
          <div className="flex items-center gap-1 bg-eink-surface border border-eink-border px-2 py-1 rounded-sm">
            <Github className="w-3.5 h-3.5 text-eink-text" />
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-transparent border-none text-eink-text font-mono font-bold text-xs outline-none cursor-pointer"
            >
              <option value="">ALL REPOSITORIES</option>
              {repositories.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-eink-text outline-none"
          >
            <option value="">ALL STATUSES</option>
            <option value="TODO">○ PENDING</option>
            <option value="IN_PROGRESS">◐ IN PROGRESS</option>
            <option value="DONE">✓ COMPLETED</option>
          </select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-eink-textMuted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tasks..."
            className="w-full md:w-56 pl-8 pr-3 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-eink-text outline-none"
          />
        </div>
      </div>

      {/* 4. Main Content: List or Kanban */}
      {viewMode === 'kanban' ? (
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
        <div className="space-y-4 font-technical">
          {/* Quick Add Input Form */}
          <form onSubmit={handleQuickAdd} className="flex gap-2 text-xs">
            <input
              type="text"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              placeholder={`+ Quick add TODO to ${selectedRepo || 'swaply-one-compiler'} (press Enter)...`}
              className="flex-1 px-3 py-2 bg-eink-surface border border-eink-border rounded-sm text-eink-text outline-none focus:border-eink-text text-xs font-sans"
            />
            <button
              type="submit"
              disabled={!quickTaskTitle.trim()}
              className="px-4 py-2 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD TODO</span>
            </button>
          </form>

          {/* List Table */}
          <div className="border border-eink-border rounded-sm bg-eink-surface divide-y divide-eink-border/60 overflow-hidden shadow-eink-card">
            {filteredTasks.length === 0 ? (
              <div className="p-12 text-center text-xs text-eink-textMuted font-technical">
                No to-do tasks found for this repository. Click <strong>+ ADD TODO</strong> to create one.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isDone = task.status === 'DONE';
                const hasDiscrepancy = Boolean(task.has_ci_discrepancy);

                return (
                  <div
                    key={task.id}
                    onClick={() => openTaskModal(task.id)}
                    className={`p-4 flex items-start sm:items-center justify-between gap-3 hover:bg-eink-surfaceHover cursor-pointer transition-colors ${
                      isDone ? 'opacity-70 bg-eink-bg/50' : ''
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleTaskStatus(task, e)}
                        className="mt-0.5 sm:mt-0 p-1 text-eink-text hover:text-eink-textSecondary shrink-0"
                        title={isDone ? 'Mark as Incomplete' : 'Mark as Complete'}
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
                            {task.task_code}
                          </span>
                          <h3
                            className={`text-xs font-bold text-eink-text truncate ${
                              isDone ? 'line-through text-eink-textMuted' : ''
                            }`}
                          >
                            {task.title}
                          </h3>
                          {Boolean(task.auto_completed) && (
                            <span className="text-[10px] font-bold bg-eink-bg text-eink-text px-1.5 py-0.2 border border-eink-border rounded flex items-center gap-1 font-mono">
                              ✓ AUTO COMPLETED • GitHub activity detected
                            </span>
                          )}
                          {hasDiscrepancy && (
                            <span className="text-[10px] font-bold bg-eink-darkSurface text-eink-darkText px-1.5 py-0.2 rounded flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              <span>CI DISCREPANCY</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-eink-textSecondary font-mono">
                          <span className="font-bold text-eink-text">
                            {task.github_repo || 'swaply-one-compiler'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            <span>{task.github_branch || 'main'}</span>
                          </span>
                          {task.due_date && <span>Due: {task.due_date}</span>}
                          {task.assignee_name && (
                            <span>Assigned: {task.assignee_name}</span>
                          )}
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
    </div>
  );
};
