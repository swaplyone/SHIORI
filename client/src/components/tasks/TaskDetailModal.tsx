import React, { useState, useEffect } from 'react';
import {
  X,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Terminal,
  CheckSquare,
  Square,
  Send,
  Calendar,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Trash2,
  Archive,
  ArchiveRestore,
  Repeat,
  Bell,
  Clock,
  Play,
  Tag
} from 'lucide-react';
import { Task, Subtask, Comment, TaskActivity, GitHubCommit, GitHubWorkflowRun, TaskPriority } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { DevelopmentEvidenceBadge } from './DevelopmentEvidenceBadge';
import { CodeRecoveryModal } from '../recovery/CodeRecoveryModal';
import { GitHistoryModal } from '../github/GitHistoryModal';
import { Skeleton, SkeletonTitle, SkeletonText, SkeletonBadge } from '../ui/Skeleton';
import { AiDeveloperHandoffModal } from './AiDeveloperHandoffModal';
import { TaskCommitHistory } from './TaskCommitHistory';
import { FocusModeModal } from './FocusModeModal';
import { triggerUndoToast } from '../ui/UndoToast';
import { reminderManager } from '../../utils/reminderManager';

interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ taskId, onClose, onTaskUpdated }) => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<GitHubWorkflowRun[]>([]);
  const [evidence, setEvidence] = useState<any>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHandoffOpen, setIsHandoffOpen] = useState(false);
  const [isFocusOpen, setIsFocusOpen] = useState(false);

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const fetchTaskDetails = async () => {
    if (!taskId || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTask(data.task);
        setSubtasks(data.subtasks || []);
        setComments(data.comments || []);
        setActivity(data.activity || []);
        setCommits(data.commits || []);
        setWorkflowRuns(data.workflowRuns || []);
        setEvidence(data.evidence || null);
      }
    } catch (err) {
      console.error('Failed to load task details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
  }, [taskId, token]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdatePriority = async (newPriority: TaskPriority) => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ priority: newPriority })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateRecurrence = async (rule: string) => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ recurrence_rule: rule || null })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetReminder = async (preset: string) => {
    if (!task || !token) return;
    let reminderDate: Date | null = null;
    const now = new Date();

    if (preset === '15m') {
      reminderDate = new Date(now.getTime() + 15 * 60 * 1000);
    } else if (preset === 'today_evening') {
      reminderDate = new Date();
      reminderDate.setHours(18, 0, 0, 0);
    } else if (preset === 'tomorrow_morning') {
      reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 1);
      reminderDate.setHours(9, 0, 0, 0);
    } else if (preset === 'clear') {
      reminderDate = null;
    }

    // Request notification permission if enabling
    if (reminderDate) {
      await reminderManager.requestPermission();
      reminderManager.scheduleReminder({
        taskId: task.id,
        taskCode: task.task_code,
        taskTitle: task.title,
        reminderAt: reminderDate.toISOString(),
      });
    } else {
      reminderManager.clearReminder(task.id);
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reminder_at: reminderDate ? reminderDate.toISOString() : null })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleArchiveTask = async () => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/archive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        triggerUndoToast(`Todo ${task.task_code} archived`, async () => {
          await fetch(`/api/tasks/${task.id}/restore`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          triggerEInkRefresh();
          fetchTaskDetails();
          if (onTaskUpdated) onTaskUpdated();
        });
        triggerEInkRefresh();
        onClose();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestoreTask = async () => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async () => {
    if (!task || !token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        triggerUndoToast(`Todo ${task.task_code} deleted`, async () => {
          await fetch(`/api/tasks/${task.id}/undo-delete`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
          triggerEInkRefresh();
          if (onTaskUpdated) onTaskUpdated();
        });
        triggerEInkRefresh();
        onClose();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleUserStatus = async () => {
    if (!task || !token) return;
    const nextStatus = task.user_status === 'COMPLETED' ? 'IN_PROGRESS' : 'COMPLETED';
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userStatus: nextStatus })
      });
      if (res.ok) {
        triggerEInkRefresh();
        fetchTaskDetails();
        if (onTaskUpdated) onTaskUpdated();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, currentCompleted: boolean | number) => {
    if (!task || !token) return;
    try {
      await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ completed: !currentCompleted })
      });
      fetchTaskDetails();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task || !token) return;
    try {
      await fetch(`/api/tasks/${task.id}/subtasks/${subtaskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchTaskDetails();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !task || !token) return;
    try {
      await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newSubtaskTitle })
      });
      setNewSubtaskTitle('');
      fetchTaskDetails();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !task || !token) return;
    try {
      await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: newCommentText })
      });
      setNewCommentText('');
      fetchTaskDetails();
    } catch (err) {
      console.error(err);
    }
  };

  if (!taskId) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-2 sm:p-4 md:p-6 select-none font-sans">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[92vh] bg-eink-bg border border-eink-border shadow-2xl rounded-sm flex flex-col z-10 overflow-hidden">
        {/* Header Bar */}
        <div className="p-3 sm:p-4 border-b border-eink-border flex items-center justify-between bg-eink-surface gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="font-mono text-xs sm:text-sm font-bold px-2 py-0.5 bg-eink-text text-eink-bg rounded-sm tracking-wider shrink-0">
              {task?.task_code || 'TASK'}
            </span>
            <span className="font-technical text-[11px] sm:text-xs text-eink-textMuted uppercase truncate">
              {task?.project_name || 'Project'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {task && (
              <>
                {task.status !== 'DONE' && task.user_status !== 'COMPLETED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsFocusOpen(true)}
                      className="px-2 sm:px-2.5 py-1 bg-eink-text text-eink-bg rounded-sm text-[11px] font-bold flex items-center gap-1 shadow-eink-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                      title="Open Focus Mode for this task"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">FOCUS MODE</span>
                      <span className="sm:hidden text-[10px]">FOCUS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsHandoffOpen(true)}
                      className="px-2 sm:px-2.5 py-1 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-[11px] font-mono font-bold text-eink-text flex items-center gap-1 transition-colors cursor-pointer"
                      title="Open AI Developer Handoff"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">AI PROMPT</span>
                      <span className="sm:hidden text-[10px]">PROMPT</span>
                    </button>
                  </>
                )}

                {Boolean(task.is_archived) ? (
                  <button
                    type="button"
                    onClick={handleRestoreTask}
                    className="p-1 border border-eink-border hover:bg-eink-surface rounded text-eink-text cursor-pointer"
                    title="Restore Task"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleArchiveTask}
                    className="p-1 border border-eink-border hover:bg-eink-surface rounded text-eink-text cursor-pointer"
                    title="Archive Task"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDeleteTask}
                  className="p-1 border border-eink-border hover:bg-eink-surface rounded text-eink-textMuted hover:text-eink-text cursor-pointer"
                  title="Delete Task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-1 border border-eink-border hover:bg-eink-surfaceHover rounded text-eink-text cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Container */}
        {loading ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6" aria-busy="true" aria-label="Loading task details...">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-eink-border">
              <div className="md:col-span-2 space-y-4">
                <SkeletonTitle size="lg" width="70%" />
                <div className="p-4 bg-eink-surface/50 border border-eink-border rounded-sm space-y-2">
                  <SkeletonText lines={3} widths={['95%', '85%', '60%']} />
                </div>
              </div>
              <div className="space-y-3 p-3.5 bg-eink-surface border border-eink-border rounded-sm">
                <div className="space-y-1">
                  <Skeleton variant="text" className="h-2 w-14" />
                  <Skeleton variant="text" className="h-3 w-28" />
                </div>
                <div className="space-y-1">
                  <Skeleton variant="text" className="h-2 w-16" />
                  <Skeleton variant="text" className="h-3 w-24" />
                </div>
                <div className="space-y-1">
                  <Skeleton variant="text" className="h-2 w-20" />
                  <Skeleton variant="text" className="h-3 w-32" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SkeletonTitle size="sm" width="140px" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <Skeleton variant="rounded" className="w-3.5 h-3.5" />
                      <SkeletonTitle size="sm" width={i === 1 ? '60%' : '45%'} />
                    </div>
                    <SkeletonBadge width="40px" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : task ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Title & Specs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-eink-border">
              <div className="md:col-span-2 space-y-4">
                <div className="space-y-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-eink-text tracking-tight uppercase font-sans">
                    {task.title}
                  </h1>
                  {task.tags && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {task.tags.split(',').map((tag, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 bg-eink-surface border border-eink-border rounded text-[10px] font-technical text-eink-textMuted flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          <span>#{tag.trim()}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-eink-textSecondary leading-relaxed whitespace-pre-line bg-eink-surface/50 p-3 border border-eink-border rounded-sm">
                  {task.description || 'No description provided for this technical task.'}
                </div>

                {/* Discrepancy Alert Notice if any */}
                {Boolean(task.has_ci_discrepancy) && (
                  <div className="p-3 bg-eink-surface border-2 border-eink-text rounded-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-eink-text" />
                      <h4 className="font-technical font-bold text-xs text-eink-text uppercase tracking-wider">
                        SHIORI VERIFICATION NOTICE
                      </h4>
                    </div>
                    <div className="text-xs text-eink-textSecondary space-y-1 font-sans">
                      <p>
                        <strong>User status:</strong> ✓ Completed
                      </p>
                      <p>
                        <strong>Development status:</strong> ✕ Latest CI build failed (3 tests failed)
                      </p>
                      <p className="pt-1 text-[11px] font-technical text-eink-text">
                        Marked complete, but the latest development check is failing. GitHub activity is evidence of work, not absolute proof of correctness.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Specs Sidebar */}
              <div className="space-y-3 p-3.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-technical">
                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">STATUS</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <select
                      value={task.status}
                      onChange={(e) => handleUpdateStatus(e.target.value)}
                      className="w-full px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical text-eink-text outline-none"
                    >
                      <option value="BACKLOG">· BACKLOG</option>
                      <option value="TODO">○ TODO</option>
                      <option value="IN_PROGRESS">◐ IN PROGRESS</option>
                      <option value="REVIEW">→ REVIEW</option>
                      <option value="DONE">✓ DONE</option>
                    </select>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">USER REPORTED</span>
                  <button
                    onClick={handleToggleUserStatus}
                    className={`mt-1 w-full py-1 px-2 border rounded text-xs font-technical flex items-center justify-between ${
                      task.user_status === 'COMPLETED'
                        ? 'bg-eink-text text-eink-bg border-eink-text'
                        : 'bg-eink-bg text-eink-text border-eink-border'
                    }`}
                  >
                    <span>{task.user_status === 'COMPLETED' ? '✓ Completed' : '○ In Progress'}</span>
                    <span className="text-[9px] underline">TOGGLE</span>
                  </button>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">PRIORITY</span>
                  <select
                    value={task.priority || 'MEDIUM'}
                    onChange={(e) => handleUpdatePriority(e.target.value as TaskPriority)}
                    className="w-full mt-1 px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical font-bold text-eink-text outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block flex items-center gap-1">
                    <Repeat className="w-3 h-3" />
                    <span>RECURRING</span>
                  </span>
                  <select
                    value={task.recurrence_rule || ''}
                    onChange={(e) => handleUpdateRecurrence(e.target.value)}
                    className="w-full mt-1 px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical text-eink-text outline-none"
                  >
                    <option value="">None (One-time)</option>
                    <option value="Daily">↻ Every day</option>
                    <option value="Weekdays">↻ Weekdays (Mon-Fri)</option>
                    <option value="Weekly">↻ Every week</option>
                    <option value="Monthly">↻ Every month</option>
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block flex items-center gap-1">
                    <Bell className="w-3 h-3" />
                    <span>REMINDER</span>
                  </span>
                  <select
                    value={task.reminder_at ? 'active' : ''}
                    onChange={(e) => handleSetReminder(e.target.value)}
                    className="w-full mt-1 px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical text-eink-text outline-none"
                  >
                    <option value="clear">No reminder</option>
                    <option value="15m">In 15 minutes</option>
                    <option value="today_evening">Today · 6:00 PM</option>
                    <option value="tomorrow_morning">Tomorrow · 9:00 AM</option>
                    {task.reminder_at && <option value="active">Active ({new Date(task.reminder_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</option>}
                  </select>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">ASSIGNEE</span>
                  <span className="text-xs text-eink-text block mt-1">{task.assignee_name || 'Unassigned'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">DUE DATE</span>
                  <span className="text-xs text-eink-text block mt-1">{task.due_date || 'No due date'}</span>
                </div>
              </div>
            </div>

            {/* Development & GitHub Linking Section */}
            <div className="space-y-4 pb-6 border-b border-eink-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                    DEVELOPMENT & GITHUB EVIDENCE
                  </h3>
                  {task.github_repo && (
                    <span className="text-[10px] bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded font-mono font-bold">
                      {task.github_repo}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 font-technical text-xs">
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(true)}
                    className="px-2.5 py-1 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-[11px] font-bold text-eink-text flex items-center gap-1.5 transition-colors"
                  >
                    <GitCommit className="w-3.5 h-3.5" />
                    <span>VIEW GIT HISTORY</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRecoveryOpen(true)}
                    className="px-2.5 py-1 bg-eink-text text-eink-bg rounded-sm text-[11px] font-bold flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>RECOVER CODE</span>
                  </button>
                </div>
              </div>

              {/* GitHub Connected Specs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-eink-surface border border-eink-border rounded-sm">
                  <span className="text-[10px] font-technical text-eink-textMuted uppercase block">BRANCH</span>
                  <div className="flex items-center gap-1.5 mt-1 font-technical text-xs font-bold text-eink-text">
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{task.github_branch || 'None connected'}</span>
                  </div>
                </div>

                <div className="p-3 bg-eink-surface border border-eink-border rounded-sm">
                  <span className="text-[10px] font-technical text-eink-textMuted uppercase block">PULL REQUEST</span>
                  <div className="flex items-center gap-1.5 mt-1 font-technical text-xs font-bold text-eink-text">
                    <GitPullRequest className="w-3.5 h-3.5" />
                    {task.github_pr_number ? (
                      <span className="flex items-center gap-1.5">
                        #{task.github_pr_number} ({task.github_pr_state || 'OPEN'})
                      </span>
                    ) : (
                      <span className="text-eink-textMuted font-normal">None active</span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-eink-surface border border-eink-border rounded-sm">
                  <span className="text-[10px] font-technical text-eink-textMuted uppercase block">CI CHECKS</span>
                  <div className="mt-1">
                    <DevelopmentEvidenceBadge
                      ciStatus={task.github_ci_status}
                      confidenceScore={evidence?.confidenceScore || task.dev_confidence_score}
                      compact
                    />
                  </div>
                </div>
              </div>

              {/* Confidence Score breakdown */}
              {evidence && (
                <div className="p-3 bg-eink-surface/60 border border-eink-border rounded-sm text-xs font-technical space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-eink-textSecondary">DEVELOPMENT EVIDENCE METRICS</span>
                    <span className="font-bold text-eink-text">Confidence: {evidence.confidenceScore}%</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-eink-textSecondary">
                    <div className="border border-eink-border p-1.5 bg-eink-bg rounded">
                      <span className="block text-[9px] text-eink-textMuted">COMMITS</span>
                      <span className="font-bold">{evidence.commitsCount} recorded</span>
                    </div>
                    <div className="border border-eink-border p-1.5 bg-eink-bg rounded">
                      <span className="block text-[9px] text-eink-textMuted">PULL REQUESTS</span>
                      <span className="font-bold">{evidence.prsCount} linked</span>
                    </div>
                    <div className="border border-eink-border p-1.5 bg-eink-bg rounded">
                      <span className="block text-[9px] text-eink-textMuted">FILES CHANGED</span>
                      <span className="font-bold">{evidence.filesChanged} files</span>
                    </div>
                    <div className="border border-eink-border p-1.5 bg-eink-bg rounded">
                      <span className="block text-[9px] text-eink-textMuted">CHECKS PASSED</span>
                      <span className="font-bold text-eink-text">{evidence.checksPassed} passed</span>
                    </div>
                    <div className="border border-eink-border p-1.5 bg-eink-bg rounded">
                      <span className="block text-[9px] text-eink-textMuted">CHECKS FAILED</span>
                      <span className="font-bold">{evidence.checksFailed} failed</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Task Commit History Section */}
              <TaskCommitHistory taskId={task.id} taskCode={task.task_code} />

              {/* CI Workflow Logs toggle */}
              {workflowRuns.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase">
                      LATEST CI WORKFLOW RUN ({workflowRuns[0].conclusion?.toUpperCase() || 'RUNNING'})
                    </h4>
                    <button
                      onClick={() => setShowLogs(!showLogs)}
                      className="text-xs font-technical flex items-center gap-1 text-eink-text underline"
                    >
                      <span>{showLogs ? 'HIDE LOGS' : 'VIEW LOGS'}</span>
                      {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>

                  {showLogs && (
                    <pre className="p-3 bg-eink-darkSurface text-eink-darkText text-[11px] font-technical rounded-sm overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {workflowRuns[0].logs || 'No build logs captured.'}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {/* Subtasks Section */}
            <div className="space-y-3 pb-6 border-b border-eink-border">
              <div className="flex items-center justify-between">
                <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                  SUBTASKS ({subtasks.filter((s) => Boolean(s.completed)).length}/{subtasks.length})
                </h3>
                {subtasks.length > 0 && (
                  <span className="text-[10px] font-mono text-eink-textMuted">
                    {Math.round((subtasks.filter((s) => Boolean(s.completed)).length / subtasks.length) * 100)}% DONE
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {subtasks.map((subtask) => {
                  const isDone = Boolean(subtask.completed);
                  return (
                    <div
                      key={subtask.id}
                      onClick={() => handleToggleSubtask(subtask.id, subtask.completed)}
                      className="group w-full flex items-center justify-between gap-2.5 p-2 bg-eink-surface/50 hover:bg-eink-surface border border-eink-border rounded text-left transition-colors text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-eink-text shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-eink-textMuted shrink-0" />
                        )}
                        <span className={`truncate ${isDone ? 'line-through text-eink-textMuted' : 'text-eink-text'}`}>
                          {subtask.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSubtask(subtask.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-eink-textMuted hover:text-eink-text transition-opacity"
                        title="Delete subtask"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleAddSubtask} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add a new subtask..."
                  className="flex-1 px-3 py-1.5 text-xs bg-eink-surface border border-eink-border rounded-sm outline-none text-eink-text"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-technical font-bold bg-eink-text text-eink-bg rounded-sm shadow-eink-sm"
                >
                  ADD
                </button>
              </form>
            </div>

            {/* Comments & Activity Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Comments */}
              <div className="space-y-3">
                <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                  COMMENTS ({comments.length})
                </h3>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {comments.map((c) => (
                    <div key={c.id} className="p-3 bg-eink-surface border border-eink-border rounded-sm space-y-1 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-technical">
                        <span className="font-bold text-eink-text">{c.user_name}</span>
                        <span className="text-eink-textMuted">{c.created_at}</span>
                      </div>
                      <p className="text-eink-textSecondary leading-normal">{c.content}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Write a comment or note..."
                    className="flex-1 px-3 py-1.5 text-xs bg-eink-surface border border-eink-border rounded-sm outline-none text-eink-text"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-eink-text text-eink-bg rounded-sm shadow-eink-sm"
                    title="Send comment"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

              {/* Activity Audit Log */}
              <div className="space-y-3">
                <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                  AUDIT TIMELINE
                </h3>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {activity.map((act) => (
                    <div key={act.id} className="p-2 border-l-2 border-eink-border pl-2.5 text-xs font-technical space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] text-eink-textMuted">
                        <span>{act.action_type}</span>
                        <span>{act.created_at}</span>
                      </div>
                      <p className="text-eink-text font-medium">{act.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-xs text-eink-textMuted">Task not found.</div>
        )}

        {/* Modals for Git History, Code Recovery, Focus Mode, and AI Handoff */}
        <GitHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          repoName={task?.github_repo || 'SHIORI'}
          branchName={task?.github_branch || 'main'}
        />

        <CodeRecoveryModal
          isOpen={isRecoveryOpen}
          onClose={() => setIsRecoveryOpen(false)}
          defaultRepo={task?.github_repo || 'SHIORI'}
          taskId={task?.id}
        />

        <AiDeveloperHandoffModal
          isOpen={isHandoffOpen}
          task={task}
          onClose={() => setIsHandoffOpen(false)}
        />

        <FocusModeModal
          isOpen={isFocusOpen}
          task={task}
          onClose={() => setIsFocusOpen(false)}
          onTaskCompleted={(tid) => {
            handleUpdateStatus('DONE');
            setIsFocusOpen(false);
          }}
        />
      </div>
    </div>
  );
};
