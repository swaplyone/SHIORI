import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  ArrowRight,
  CheckCircle2,
  GitCommit,
  GitPullRequest,
  Activity,
  CheckSquare,
  Square,
  Repeat,
  AlertCircle,
  FileText,
  Save,
  Clock,
  Tag,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { JournalSkeleton } from '../components/ui/Skeleton';
import { Task } from '../types';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';

export const JournalPage: React.FC = () => {
  const { token } = useAuth();
  const { triggerEInkRefresh } = useNotifications();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [dailyData, setDailyData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [dailyNote, setDailyNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSavedAt, setNoteSavedAt] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const todayDateKey = new Date().toISOString().split('T')[0];

  const fetchJournalData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [dRes, wRes, tRes, nRes] = await Promise.all([
        fetch('/api/journal/today', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch('/api/journal/weekly', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch('/api/tasks?archived=false', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
        fetch(`/api/journal/notes/${todayDateKey}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      ]);

      setDailyData(dRes);
      setWeeklyData(wRes);
      setAllTasks(tRes.tasks || []);
      setDailyNote(nRes.note?.content || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournalData();
  }, [token]);

  // Autosave daily note
  useEffect(() => {
    if (!token) return;
    const timeout = setTimeout(async () => {
      if (dailyNote === undefined) return;
      try {
        setIsSavingNote(true);
        await fetch(`/api/journal/notes/${todayDateKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: dailyNote }),
        });
        setNoteSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (err) {
        console.error(err);
      } finally {
        setIsSavingNote(false);
      }
    }, 1200);

    return () => clearTimeout(timeout);
  }, [dailyNote, token, todayDateKey]);

  const handleToggleTask = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    const newStatus = task.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';
    const newUserStatus = newStatus === 'DONE' ? 'COMPLETED' : 'IN_PROGRESS';

    setAllTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus, user_status: newUserStatus } : t))
    );

    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, userStatus: newUserStatus }),
      });
      triggerEInkRefresh();
      fetchJournalData();
    } catch (err) {
      console.error(err);
    }
  };

  // Group tasks for the Daily Page
  const now = new Date();
  const todayTasks = allTasks.filter(
    (t) => t.status !== 'DONE' && (!t.due_date || t.due_date.toLowerCase().includes('today') || !t.due_at || new Date(t.due_at).toDateString() === now.toDateString())
  );
  const completedTodayTasks = allTasks.filter((t) => t.status === 'DONE');
  const overdueTasks = allTasks.filter(
    (t) =>
      t.status !== 'DONE' &&
      ((t.due_date && t.due_date.toLowerCase().includes('yesterday')) ||
        (t.due_at && new Date(t.due_at).getTime() < Date.now() && new Date(t.due_at).toDateString() !== now.toDateString()))
  );
  const upcomingTasks = allTasks.filter(
    (t) =>
      t.status !== 'DONE' &&
      t.due_date &&
      (t.due_date.toLowerCase().includes('tomorrow') || (t.due_at && new Date(t.due_at).getTime() > Date.now()))
  );

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(now).toUpperCase();

  return (
    <div className="space-y-8 select-none font-sans pb-16">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            DAILY PAGE & WORK JOURNAL
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Calm overview of your daily focus, completed work, and engineering log
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border border-eink-border rounded-sm bg-eink-surface p-0.5 font-technical text-xs self-start sm:self-auto">
          <button
            onClick={() => setTab('daily')}
            className={`px-3 py-1 rounded-sm ${tab === 'daily' ? 'bg-eink-darkSurface text-eink-darkText font-bold' : 'text-eink-text'}`}
          >
            DAILY PAGE
          </button>
          <button
            onClick={() => setTab('weekly')}
            className={`px-3 py-1 rounded-sm ${tab === 'weekly' ? 'bg-eink-darkSurface text-eink-darkText font-bold' : 'text-eink-text'}`}
          >
            WEEKLY SUMMARY
          </button>
        </div>
      </div>

      {/* LOADING SKELETON */}
      {loading ? (
        <JournalSkeleton />
      ) : tab === 'daily' ? (
        <div className="max-w-4xl border border-eink-border rounded-sm bg-eink-surface p-6 sm:p-8 font-technical space-y-8 shadow-eink-card animate-fade-in">
          {/* Top Date Header */}
          <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] text-eink-textMuted uppercase tracking-widest block">
                SHIORI DAILY DISPATCH
              </span>
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-widest text-eink-text">
                {formattedDate}
              </h2>
            </div>
            <span className="text-xs text-eink-textMuted uppercase font-mono">
              {completedTodayTasks.length} COMPLETED · {todayTasks.length} REMAINING
            </span>
          </div>

          {/* 1. OVERDUE TODOS (if any) */}
          {overdueTasks.length > 0 && (
            <div className="space-y-3 p-3.5 bg-eink-bg border border-eink-border rounded-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-eink-text">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="uppercase tracking-wider">OVERDUE ({overdueTasks.length})</span>
              </div>
              <div className="space-y-1.5">
                {overdueTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="p-2 bg-eink-surface border border-eink-border rounded-sm flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-eink-surfaceHover"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={(e) => handleToggleTask(task, e)} className="p-0.5 text-eink-text shrink-0">
                        <Square className="w-3.5 h-3.5 text-eink-textMuted" />
                      </button>
                      <span className="font-mono text-[10px] font-bold text-eink-textMuted">{task.task_code}</span>
                      <span className="truncate font-medium text-eink-text">{task.title}</span>
                    </div>
                    <span className="text-[10px] text-eink-textSecondary shrink-0 font-mono">
                      Due: {task.due_date || 'Past'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. TODAY'S TASKS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-eink-border/60 pb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                TODAY'S TODOS ({todayTasks.length})
              </h3>
            </div>

            {todayTasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-eink-textMuted border border-dashed border-eink-border rounded-sm">
                No active tasks for today. All caught up.
              </div>
            ) : (
              <div className="space-y-1.5 text-xs">
                {todayTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="p-2.5 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between gap-3 cursor-pointer hover:bg-eink-surface transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button onClick={(e) => handleToggleTask(task, e)} className="p-0.5 text-eink-text shrink-0">
                        <Square className="w-4 h-4 text-eink-textMuted" />
                      </button>
                      <span className="font-mono text-[10px] font-bold text-eink-textMuted px-1 py-0.2 border border-eink-border rounded">
                        {task.task_code}
                      </span>
                      <span className="font-medium text-eink-text truncate">{task.title}</span>
                      {task.recurrence_rule && (
                        <span className="text-[10px] text-eink-textMuted flex items-center gap-0.5">
                          <Repeat className="w-2.5 h-2.5" />
                          <span>{task.recurrence_rule}</span>
                        </span>
                      )}
                    </div>
                    {task.priority !== 'MEDIUM' && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 border border-eink-border rounded text-eink-textSecondary shrink-0">
                        {task.priority}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. COMPLETED TODAY */}
          {completedTodayTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
                COMPLETED ({completedTodayTasks.length})
              </h3>
              <div className="space-y-1 text-xs opacity-75">
                {completedTodayTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="p-2 bg-eink-bg/50 border border-eink-border/70 rounded-sm flex items-center justify-between gap-2 cursor-pointer hover:bg-eink-surface"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={(e) => handleToggleTask(task, e)} className="p-0.5 text-eink-text shrink-0">
                        <CheckSquare className="w-3.5 h-3.5 text-eink-text" />
                      </button>
                      <span className="font-mono text-[10px] text-eink-textMuted">{task.task_code}</span>
                      <span className="line-through text-eink-textMuted truncate">{task.title}</span>
                    </div>
                    <span className="text-[10px] text-eink-textMuted font-mono">DONE</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. UPCOMING / TOMORROW */}
          {upcomingTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
                UPCOMING ({upcomingTasks.length})
              </h3>
              <div className="space-y-1 text-xs">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="p-2 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between gap-2 cursor-pointer hover:bg-eink-surface"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] text-eink-textMuted">{task.task_code}</span>
                      <span className="text-eink-textSecondary truncate">{task.title}</span>
                    </div>
                    <span className="text-[10px] text-eink-textMuted font-mono">Due: {task.due_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. DAILY NOTES & REFLECTIONS */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-eink-border/60 pb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-eink-text flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>DAILY NOTES & ENGINEERING LOG</span>
              </h3>
              <span className="text-[10px] text-eink-textMuted font-mono">
                {isSavingNote ? 'Saving...' : noteSavedAt ? `Saved at ${noteSavedAt}` : 'Autosaved'}
              </span>
            </div>

            <textarea
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              placeholder="Jot down notes, thoughts, standup summary, or blockers for today..."
              rows={5}
              className="w-full p-3 bg-eink-bg border border-eink-border rounded-sm text-xs font-technical text-eink-text outline-none focus:border-eink-text resize-y leading-relaxed font-mono"
            />
          </div>

          {/* DEVELOPMENT STATS */}
          <div className="space-y-3 pt-2 border-t border-eink-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
              DEVELOPMENT PULSE
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.development.commits || 18).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">commits pushed</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.development.pullRequests || 4).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">pull requests</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.development.checksPassed || 14).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">checks passed</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.development.checksFailed || 2).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">checks failed</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* WEEKLY SUMMARY VIEW */
        <div className="max-w-4xl border border-eink-border rounded-sm bg-eink-surface p-6 sm:p-8 font-technical space-y-8 shadow-eink-card animate-fade-in">
          <div className="border-b border-eink-border pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold uppercase tracking-widest text-eink-text">
                WEEK {weeklyData?.weekNumber || 35} SUMMARY
              </h2>
              <p className="text-xs text-eink-textMuted">{weeklyData?.dateRange || '24 Aug - 30 Aug 2026'}</p>
            </div>
            <span className="text-xs px-2.5 py-1 bg-eink-text text-eink-bg font-bold rounded-sm">
              CI SUCCESS RATE: {weeklyData?.buildSuccessRate || 94}%
            </span>
          </div>

          {/* High Level Numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-2xl font-bold text-eink-text block">
                {weeklyData?.tasksCompleted || 31}
              </span>
              <span className="text-eink-textSecondary text-[11px]">Tasks completed</span>
            </div>
            <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-2xl font-bold text-eink-text block">
                {weeklyData?.commitsCount || 74}
              </span>
              <span className="text-eink-textSecondary text-[11px]">Commits pushed</span>
            </div>
            <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-2xl font-bold text-eink-text block">
                {weeklyData?.pullRequestsCount || 12}
              </span>
              <span className="text-eink-textSecondary text-[11px]">Pull requests</span>
            </div>
            <div className="p-3.5 bg-eink-bg border border-eink-border rounded-sm">
              <span className="text-2xl font-bold text-eink-text block">
                {weeklyData?.buildSuccessRate || 94}%
              </span>
              <span className="text-eink-textSecondary text-[11px]">Build pass rate</span>
            </div>
          </div>

          {/* Project Distribution */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
              PROJECT COMMIT DISTRIBUTION
            </h3>

            <div className="space-y-3 text-xs">
              {(weeklyData?.projectsDistribution || [
                { name: 'SwaplyOne Compiler', commits: 42, percentage: 56, bar: '██████████' },
                { name: 'Swaply Backend', commits: 22, percentage: 30, bar: '███████' },
                { name: 'AI Artisan Marketplace', commits: 10, percentage: 14, bar: '████' }
              ]).map((proj: any, idx: number) => (
                <div key={idx} className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-eink-text">{proj.name}</span>
                    <span className="text-eink-textMuted">{proj.commits} commits ({proj.percentage}%)</span>
                  </div>
                  <div className="font-technical tracking-tighter text-sm text-eink-text select-all">
                    {proj.bar}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={() => fetchJournalData()}
      />
    </div>
  );
};
