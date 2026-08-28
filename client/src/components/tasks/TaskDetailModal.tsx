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
  AlertOctagon
} from 'lucide-react';
import { Task, Subtask, Comment, TaskActivity, GitHubCommit, GitHubWorkflowRun } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { DevelopmentEvidenceBadge } from './DevelopmentEvidenceBadge';
import { CodeRecoveryModal } from '../recovery/CodeRecoveryModal';
import { GitHistoryModal } from '../github/GitHistoryModal';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 select-none font-sans">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-4xl max-h-[92vh] bg-eink-bg border border-eink-border shadow-2xl rounded-sm flex flex-col z-10 overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b border-eink-border flex items-center justify-between bg-eink-surface">
          <div className="flex items-center gap-3">
            <span className="font-technical text-sm font-bold px-2 py-0.5 bg-eink-text text-eink-bg rounded-sm">
              {task?.task_code || 'TASK'}
            </span>
            <span className="font-technical text-xs text-eink-textMuted uppercase">
              {task?.project_name || 'Project'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 border border-eink-border hover:bg-eink-surfaceHover rounded text-eink-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Container */}
        {loading ? (
          <div className="p-12 text-center font-technical text-xs text-eink-textMuted">
            Loading technical document...
          </div>
        ) : task ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Title & Specs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-eink-border">
              <div className="md:col-span-2 space-y-4">
                <h1 className="text-xl sm:text-2xl font-bold text-eink-text tracking-tight uppercase font-sans">
                  {task.title}
                </h1>
                
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
                  <span className="text-xs font-bold text-eink-text">{task.priority}</span>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">ASSIGNEE</span>
                  <span className="text-xs text-eink-text">{task.assignee_name || 'Unassigned'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-eink-textMuted uppercase block">DUE DATE</span>
                  <span className="text-xs text-eink-text">{task.due_date || 'No due date'}</span>
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

              {/* Commits List */}
              {commits.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-technical font-bold text-eink-textMuted uppercase">
                    COMMITS ({commits.length})
                  </h4>
                  <div className="border border-eink-border rounded-sm divide-y divide-eink-border/50 bg-eink-surface/30">
                    {commits.map((c) => (
                      <div key={c.id} className="p-2.5 flex items-center justify-between text-xs font-technical">
                        <div className="flex items-center gap-2 truncate">
                          <span className="px-1.5 py-0.2 bg-eink-surface border border-eink-border font-bold rounded">
                            {c.commit_hash}
                          </span>
                          <span className="text-eink-text truncate">{c.message}</span>
                        </div>
                        <span className="text-[10px] text-eink-textMuted shrink-0 ml-2">
                          {c.author_name} • {c.files_changed} files
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                SUBTASKS ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
              </h3>

              <div className="space-y-1.5">
                {subtasks.map((subtask) => (
                  <button
                    key={subtask.id}
                    onClick={() => handleToggleSubtask(subtask.id, subtask.completed)}
                    className="w-full flex items-center gap-2.5 p-2 bg-eink-surface/50 hover:bg-eink-surface border border-eink-border rounded text-left transition-colors text-xs"
                  >
                    {subtask.completed ? (
                      <CheckSquare className="w-4 h-4 text-eink-text shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-eink-textMuted shrink-0" />
                    )}
                    <span className={subtask.completed ? 'line-through text-eink-textMuted' : 'text-eink-text'}>
                      {subtask.title}
                    </span>
                  </button>
                ))}
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

        {/* Modals for Git History & Code Recovery */}
        <GitHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          repoName={task?.github_repo || 'swaply-one-compiler'}
          branchName={task?.github_branch || 'main'}
        />

        <CodeRecoveryModal
          isOpen={isRecoveryOpen}
          onClose={() => setIsRecoveryOpen(false)}
          defaultRepo={task?.github_repo || 'swaply-one-compiler'}
          taskId={task?.id}
        />
      </div>
    </div>
  );
};
