import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Filter,
  ShieldCheck,
  RotateCcw,
  Users,
  FolderGit2,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { fetchJson } from '../utils/api';
import { Skeleton } from '../components/ui/Skeleton';

export const WeeklyReportPage: React.FC = () => {
  const { token, user } = useAuth();
  const { triggerEInkRefresh } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  const fetchReport = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('weekOffset', String(weekOffset));
      if (selectedProjectId && selectedProjectId !== 'all') {
        params.set('projectId', selectedProjectId);
      }
      if (selectedRepo && selectedRepo !== 'all') {
        params.set('repository', selectedRepo);
      }

      const { ok, data } = await fetchJson(`/api/reports/weekly?${params.toString()}`);
      if (ok && data) {
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to load weekly report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [token, weekOffset, selectedProjectId, selectedRepo]);

  // Derived projects and repos list for filters
  const authorizedProjects = report?.authorizedProjects || [];
  const availableRepos = Array.from(
    new Set(
      authorizedProjects
        .filter((p: any) => selectedProjectId === 'all' || p.id === selectedProjectId)
        .map((p: any) => p.repoName)
        .filter(Boolean)
    )
  );

  const isFutureWeek = weekOffset > 0;
  const summary = report?.summary || { tasksCompleted: 0, commits: 0, pullRequests: 0, completionRate: 0 };
  const dailyCompletion = report?.dailyCompletion || [];
  const deadlinePerformance = report?.deadlinePerformance || { onTime: 0, late: 0, overdue: 0, dueSoon: 0, pending: 0 };
  const taskStatus = report?.taskStatus || { done: 0, pending: 0, needsVerification: 0 };
  const completionTrend = report?.completionTrend || [];
  const github = report?.github || { commits: 0, verifiedCommits: 0, unlinkedCommits: 0, pullRequests: 0, activeBranches: 0 };
  const commitVerification = report?.commitVerification || { verified: 0, needsReview: 0, unmatched: 0, verificationRate: 0 };
  const teamContribution = report?.teamContribution || [];
  const isSolo = report?.isSolo ?? true;

  // Max completion count for bar scaling
  const maxDayCount = Math.max(...dailyCompletion.map((d: any) => d.completed), 1);
  const totalDeadlineScope = deadlinePerformance.onTime + deadlinePerformance.late + deadlinePerformance.overdue + deadlinePerformance.dueSoon + deadlinePerformance.pending;
  const totalStatusScope = taskStatus.done + taskStatus.pending + taskStatus.needsVerification;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans text-eink-text animate-fade-in select-none">
      {/* 1. Header & Navigation Controls */}
      <header className="border-b border-eink-border pb-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-technical text-xs font-bold uppercase tracking-widest text-eink-textMuted">
                WEEK {report?.weekNumber || '--'}
              </span>
              <span className="text-eink-border font-mono">/</span>
              <span className="font-mono text-xs font-bold text-eink-text uppercase">
                {report?.dateRange?.label || 'CURRENT REPORT PERIOD'}
              </span>
            </div>
            <h1 className="font-abask text-2xl sm:text-3xl font-bold tracking-tight text-eink-text uppercase leading-none">
              WEEKLY REPORT
            </h1>
            <p className="text-xs text-eink-textSecondary italic font-sans">
              "Your engineering week at a glance."
            </p>
          </div>

          {/* Week Selector Controls */}
          <div className="flex items-center gap-2 font-technical text-xs">
            <div className="flex items-center border border-eink-border rounded-sm bg-eink-surface overflow-hidden shadow-eink-sm">
              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev - 1)}
                className="px-2.5 py-1.5 hover:bg-eink-surfaceHover text-eink-text border-r border-eink-border transition-colors cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className={`px-3 py-1.5 font-bold transition-colors cursor-pointer ${
                  weekOffset === 0 ? 'bg-eink-text text-eink-bg' : 'text-eink-text hover:bg-eink-surfaceHover'
                }`}
              >
                CURRENT WEEK
              </button>

              <button
                type="button"
                onClick={() => setWeekOffset((prev) => prev + 1)}
                className="px-2.5 py-1.5 hover:bg-eink-surfaceHover text-eink-text border-l border-eink-border transition-colors cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerEInkRefresh();
                fetchReport();
              }}
              className="p-2 border border-eink-border bg-eink-surface hover:bg-eink-surfaceHover rounded-sm text-eink-text transition-colors shadow-eink-sm cursor-pointer"
              title="Refresh Report"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Filters Strip: Account-Safe Project & Repository Filtering */}
        <div className="p-3 bg-eink-surface border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-technical shadow-eink-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-eink-textMuted uppercase font-bold text-[10px]">
              <Filter className="w-3 h-3 text-eink-text" />
              <span>FILTERS:</span>
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-eink-textSecondary text-[11px]">Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedRepo('all');
                }}
                className="px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical font-bold text-eink-text outline-none cursor-pointer hover:border-eink-text"
              >
                <option value="all">All authorized projects</option>
                {authorizedProjects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Repository Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-eink-textSecondary text-[11px]">Repository:</span>
              <select
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                disabled={availableRepos.length === 0}
                className="px-2 py-1 bg-eink-bg border border-eink-border rounded text-xs font-technical font-bold text-eink-text outline-none cursor-pointer hover:border-eink-text disabled:opacity-50"
              >
                <option value="all">All project repositories</option>
                {availableRepos.map((r: any) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[10px] text-eink-textMuted font-mono uppercase text-right">
            <span>STRICTLY ACCOUNT SCOPED</span>
          </div>
        </div>
      </header>

      {/* Future Week Notice Banner */}
      {isFutureWeek && (
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm text-center font-technical text-xs space-y-1">
          <span className="font-bold uppercase text-eink-text block">Future Date Range</span>
          <p className="text-eink-textMuted">No activity recorded for this period.</p>
        </div>
      )}

      {/* 3. Top 4 Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-technical">
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-1 shadow-eink-sm">
          <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
            TASKS COMPLETED
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold font-abask text-eink-text">
              {summary.tasksCompleted}
            </span>
            <CheckCircle2 className="w-4 h-4 text-eink-textMuted" />
          </div>
          <span className="text-[10px] text-eink-textSecondary block">
            Reaching DONE this week
          </span>
        </div>

        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-1 shadow-eink-sm">
          <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
            COMMITS
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold font-abask text-eink-text">
              {summary.commits}
            </span>
            <GitCommit className="w-4 h-4 text-eink-textMuted" />
          </div>
          <span className="text-[10px] text-eink-textSecondary block">
            Authorized repo commits
          </span>
        </div>

        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-1 shadow-eink-sm">
          <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
            PULL REQUESTS
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold font-abask text-eink-text">
              {summary.pullRequests}
            </span>
            <GitPullRequest className="w-4 h-4 text-eink-textMuted" />
          </div>
          <span className="text-[10px] text-eink-textSecondary block">
            Active / linked PRs
          </span>
        </div>

        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-1 shadow-eink-sm">
          <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
            COMPLETION RATE
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-bold font-abask text-eink-text">
              {summary.completionRate}%
            </span>
            <span className="text-[10px] font-mono text-eink-textMuted">TARGET: 80%</span>
          </div>
          <span className="text-[10px] text-eink-textSecondary block">
            Completed vs due scope
          </span>
        </div>
      </section>

      {/* 4. Main Visualizations: Weekly Completion Chart & Completion Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-technical">
        {/* Main Chart 1: WEEKLY TASK COMPLETION BAR CHART (2 cols) */}
        <div className="lg:col-span-2 p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="flex items-center justify-between border-b border-eink-border pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                WEEKLY TASK COMPLETION
              </h2>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Number of tasks reaching status = DONE during each calendar day.
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold bg-eink-bg border border-eink-border px-2 py-0.5 rounded">
              TOTAL: {summary.tasksCompleted}
            </span>
          </div>

          {summary.tasksCompleted === 0 ? (
            <div className="py-12 text-center space-y-2">
              <span className="text-xs font-bold uppercase text-eink-text block">
                No tasks completed this week
              </span>
              <p className="text-xs text-eink-textMuted font-sans max-w-sm mx-auto">
                Tasks only appear on this chart once they are verified and reach DONE status.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Daily Bars */}
              <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-44 border-b border-eink-border pb-2">
                {dailyCompletion.map((day: any) => {
                  const heightPercent = maxDayCount > 0 ? (day.completed / maxDayCount) * 100 : 0;
                  const isToday = new Date().toISOString().split('T')[0] === day.date;

                  return (
                    <div key={day.date} className="flex flex-col items-center justify-end h-full gap-1.5 group">
                      <span className="text-[11px] font-mono font-bold text-eink-text group-hover:scale-110 transition-transform">
                        {day.completed > 0 ? day.completed : ''}
                      </span>
                      <div className="w-full bg-eink-bg rounded-t-sm h-32 flex items-end p-0.5 border border-eink-border/50">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-xs transition-all duration-300 ${
                            day.completed > 0
                              ? isToday ? 'bg-eink-text' : 'bg-eink-text/80 group-hover:bg-eink-text'
                              : 'bg-transparent'
                          }`}
                        />
                      </div>
                      <div className="text-center">
                        <span className={`text-[10px] font-bold uppercase block ${isToday ? 'underline font-extrabold' : 'text-eink-textSecondary'}`}>
                          {day.day}
                        </span>
                        <span className="text-[9px] text-eink-textMuted font-mono block">
                          {day.date.split('-').slice(1).join('/')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-eink-textMuted font-mono pt-1">
                <span>Calculated strictly by completed_at timestamp</span>
                <span>NEEDS_VERIFICATION excluded</span>
              </div>
            </div>
          )}
        </div>

        {/* Main Chart 2: COMPLETION TREND LINE (1 col) */}
        <div className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="border-b border-eink-border pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
              COMPLETION TREND
            </h2>
            <p className="text-[11px] text-eink-textSecondary font-sans">
              Cumulative completed tasks across the selected week.
            </p>
          </div>

          {summary.tasksCompleted === 0 ? (
            <div className="py-12 text-center text-xs text-eink-textMuted font-sans">
              No tasks completed during this period.
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                {completionTrend.map((pt: any, idx: number) => {
                  const widthPercent = summary.tasksCompleted > 0 ? (pt.cumulative / summary.tasksCompleted) * 100 : 0;

                  return (
                    <div key={pt.date} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-bold text-eink-text">{pt.day}</span>
                        <span className="text-eink-textSecondary">{pt.cumulative} cumulative</span>
                      </div>
                      <div className="w-full bg-eink-bg border border-eink-border h-2 rounded-xs overflow-hidden">
                        <div
                          style={{ width: `${widthPercent}%` }}
                          className="bg-eink-text h-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-xs font-sans text-eink-textSecondary">
                Answers: <strong>"Are we steadily completing work?"</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Deadline Performance & Task Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-technical">
        {/* TASK DEADLINE PERFORMANCE */}
        <div className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="flex items-center justify-between border-b border-eink-border pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                TASK DEADLINE PERFORMANCE
              </h2>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Derived lifecycle states reflecting deadlines and completion punctuality.
              </p>
            </div>
            <span className="text-[11px] font-mono bg-eink-bg border border-eink-border px-2 py-0.5 rounded font-bold">
              SCOPE: {totalDeadlineScope}
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {/* Horizontal Bar: Completed on time */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-eink-text">Completed on time</span>
                <span className="font-mono font-bold text-eink-text">{deadlinePerformance.onTime}</span>
              </div>
              <div className="w-full bg-eink-bg border border-eink-border h-3 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${totalDeadlineScope > 0 ? (deadlinePerformance.onTime / totalDeadlineScope) * 100 : 0}%` }}
                  className="bg-emerald-700 h-full transition-all"
                />
              </div>
            </div>

            {/* Completed late */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-eink-text">Completed late</span>
                <span className="font-mono font-bold text-eink-text">{deadlinePerformance.late}</span>
              </div>
              <div className="w-full bg-eink-bg border border-eink-border h-3 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${totalDeadlineScope > 0 ? (deadlinePerformance.late / totalDeadlineScope) * 100 : 0}%` }}
                  className="bg-amber-600 h-full transition-all"
                />
              </div>
            </div>

            {/* Currently overdue */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-eink-text">Currently overdue</span>
                <span className="font-mono font-bold text-eink-text">{deadlinePerformance.overdue}</span>
              </div>
              <div className="w-full bg-eink-bg border border-eink-border h-3 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${totalDeadlineScope > 0 ? (deadlinePerformance.overdue / totalDeadlineScope) * 100 : 0}%` }}
                  className="bg-rose-700 h-full transition-all"
                />
              </div>
            </div>

            {/* Due soon */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-eink-text">Due soon (within 3 days)</span>
                <span className="font-mono font-bold text-eink-text">{deadlinePerformance.dueSoon}</span>
              </div>
              <div className="w-full bg-eink-bg border border-eink-border h-3 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${totalDeadlineScope > 0 ? (deadlinePerformance.dueSoon / totalDeadlineScope) * 100 : 0}%` }}
                  className="bg-blue-600 h-full transition-all"
                />
              </div>
            </div>

            {/* Pending */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-eink-textSecondary">Other pending</span>
                <span className="font-mono font-bold text-eink-textSecondary">{deadlinePerformance.pending}</span>
              </div>
              <div className="w-full bg-eink-bg border border-eink-border h-3 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${totalDeadlineScope > 0 ? (deadlinePerformance.pending / totalDeadlineScope) * 100 : 0}%` }}
                  className="bg-eink-border h-full transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* TASK STATUS DISTRIBUTION */}
        <div className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="flex items-center justify-between border-b border-eink-border pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                TASK STATUS DISTRIBUTION
              </h2>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Active workflow breakdown across authorized projects.
              </p>
            </div>
            <span className="text-[11px] font-mono bg-eink-bg border border-eink-border px-2 py-0.5 rounded font-bold">
              TOTAL: {totalStatusScope}
            </span>
          </div>

          <div className="space-y-4 pt-1">
            {/* Segmented Bar */}
            <div className="w-full bg-eink-bg border border-eink-border h-6 rounded-xs overflow-hidden flex">
              <div
                style={{ width: `${totalStatusScope > 0 ? (taskStatus.done / totalStatusScope) * 100 : 0}%` }}
                className="bg-eink-text h-full transition-all flex items-center justify-center text-[10px] text-eink-bg font-bold"
                title={`DONE: ${taskStatus.done}`}
              >
                {taskStatus.done > 0 ? taskStatus.done : ''}
              </div>
              <div
                style={{ width: `${totalStatusScope > 0 ? (taskStatus.needsVerification / totalStatusScope) * 100 : 0}%` }}
                className="bg-amber-500 h-full transition-all flex items-center justify-center text-[10px] text-white font-bold"
                title={`NEEDS_VERIFICATION: ${taskStatus.needsVerification}`}
              >
                {taskStatus.needsVerification > 0 ? taskStatus.needsVerification : ''}
              </div>
              <div
                style={{ width: `${totalStatusScope > 0 ? (taskStatus.pending / totalStatusScope) * 100 : 0}%` }}
                className="bg-eink-border h-full transition-all flex items-center justify-center text-[10px] text-eink-text font-bold"
                title={`PENDING: ${taskStatus.pending}`}
              >
                {taskStatus.pending > 0 ? taskStatus.pending : ''}
              </div>
            </div>

            {/* Status Legend & Counts */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
                <span className="text-[10px] font-bold text-eink-text uppercase block">DONE</span>
                <span className="text-xl font-abask font-bold text-eink-text">{taskStatus.done}</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
                <span className="text-[10px] font-bold text-amber-600 uppercase block">NEEDS VERIFICATION</span>
                <span className="text-xl font-abask font-bold text-amber-600">{taskStatus.needsVerification}</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
                <span className="text-[10px] font-bold text-eink-textSecondary uppercase block">PENDING</span>
                <span className="text-xl font-abask font-bold text-eink-textSecondary">{taskStatus.pending}</span>
              </div>
            </div>

            <p className="text-[11px] text-eink-textSecondary font-sans pt-1">
              NEEDS_VERIFICATION tasks are flagged for review and are not counted as completed work.
            </p>
          </div>
        </div>
      </div>

      {/* 6. GitHub Activity & Verification Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-technical">
        {/* GITHUB ACTIVITY */}
        <div className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="border-b border-eink-border pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                GITHUB ACTIVITY
              </h2>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Activity from repositories authorized for the current user.
              </p>
            </div>
            <FolderGit2 className="w-4 h-4 text-eink-textMuted" />
          </div>

          <div className="divide-y divide-eink-border border border-eink-border rounded-sm bg-eink-bg">
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-eink-text font-medium">Total Commits Pushed</span>
              <span className="font-mono font-bold text-eink-text">{github.commits}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-eink-text font-medium">Task-Verified Commits</span>
              <span className="font-mono font-bold text-emerald-700">{github.verifiedCommits}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-eink-text font-medium">Unlinked Commits</span>
              <span className="font-mono font-bold text-eink-textSecondary">{github.unlinkedCommits}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-eink-text font-medium">Pull Requests</span>
              <span className="font-mono font-bold text-eink-text">{github.pullRequests}</span>
            </div>
            <div className="p-3 flex items-center justify-between text-xs">
              <span className="text-eink-text font-medium">Active Branches</span>
              <span className="font-mono font-bold text-eink-text">{github.activeBranches}</span>
            </div>
          </div>
        </div>

        {/* COMMIT VERIFICATION */}
        <div className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm">
          <div className="border-b border-eink-border pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
                COMMIT VERIFICATION
              </h2>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Accuracy of Git commit to task correlation.
              </p>
            </div>
            <ShieldCheck className="w-4 h-4 text-eink-textMuted" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block">VERIFIED</span>
              <span className="text-2xl font-abask font-bold text-emerald-700">{commitVerification.verified}</span>
            </div>
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
              <span className="text-[10px] font-bold text-amber-600 uppercase block">NEEDS REVIEW</span>
              <span className="text-2xl font-abask font-bold text-amber-600">{commitVerification.needsReview}</span>
            </div>
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
              <span className="text-[10px] font-bold text-eink-textSecondary uppercase block">UNMATCHED</span>
              <span className="text-2xl font-abask font-bold text-eink-textSecondary">{commitVerification.unmatched}</span>
            </div>
            <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-center">
              <span className="text-[10px] font-bold text-eink-text uppercase block">RATE</span>
              <span className="text-2xl font-abask font-bold text-eink-text">{commitVerification.verificationRate}%</span>
            </div>
          </div>

          <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-xs text-eink-textSecondary font-sans leading-relaxed">
            <strong>Verification Rate:</strong> Verified commits ÷ total commits processed ({commitVerification.verified} / {github.commits || 1}).
          </div>
        </div>
      </div>

      {/* 7. Team Contribution / Your Contribution */}
      <section className="p-5 bg-eink-surface border border-eink-border rounded-sm space-y-4 shadow-eink-sm font-technical">
        <div className="border-b border-eink-border pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-eink-text">
              {isSolo ? 'YOUR CONTRIBUTION' : 'TEAM CONTRIBUTION'}
            </h2>
            <p className="text-[11px] text-eink-textSecondary font-sans">
              {isSolo
                ? 'Engineering contributions for your solo project.'
                : 'Breakdown of developer activity across team members in this project.'}
            </p>
          </div>
          <Users className="w-4 h-4 text-eink-textMuted" />
        </div>

        {teamContribution.length === 0 ? (
          <div className="py-6 text-center text-xs text-eink-textMuted font-mono">
            No team contributor activity recorded for this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-eink-border text-[10px] font-bold text-eink-textMuted uppercase">
                  <th className="py-2 pr-4">Developer</th>
                  <th className="py-2 px-4">Tasks Assigned</th>
                  <th className="py-2 px-4">Commits Pushed</th>
                  <th className="py-2 pl-4 text-right">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-eink-border">
                {teamContribution.map((member: any) => (
                  <tr key={member.developer || member.username} className="hover:bg-eink-surfaceHover">
                    <td className="py-2.5 pr-4 font-bold text-eink-text flex items-center gap-2">
                      <span>{member.developer}</span>
                      {member.githubUsername && (
                        <span className="text-[10px] text-eink-textMuted font-mono">
                          (@{member.githubUsername})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{member.tasks}</td>
                    <td className="py-2.5 px-4 font-mono">{member.commits}</td>
                    <td className="py-2.5 pl-4 text-right font-mono font-bold text-emerald-700">
                      {member.completed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 8. Report Definitions: "How these numbers are calculated" */}
      <section className="border border-eink-border rounded-sm bg-eink-surface overflow-hidden shadow-eink-sm">
        <button
          type="button"
          onClick={() => setShowDefinitions((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-eink-surfaceHover cursor-pointer font-technical text-xs font-bold uppercase text-eink-text"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-eink-textMuted" />
            <span>HOW THESE NUMBERS ARE CALCULATED</span>
          </div>
          {showDefinitions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showDefinitions && (
          <div className="p-4 border-t border-eink-border bg-eink-bg text-xs font-sans space-y-3 leading-relaxed text-eink-textSecondary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Tasks completed</strong>
                <p>Tasks that transitioned to <code>status = DONE</code> during the selected reporting period.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Commits</strong>
                <p>GitHub commits pushed to authorized project repositories during the selected period.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Completion rate</strong>
                <p>Tasks completed ÷ total active/due tasks during the period.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Verified commits</strong>
                <p>Commits successfully correlated and verified against a task ID with verified branch & author.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Completed on time</strong>
                <p>DONE tasks whose <code>completed_at &lt;= deadline</code>.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Completed late</strong>
                <p>DONE tasks whose <code>completed_at &gt; deadline</code>.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Currently overdue</strong>
                <p>PENDING tasks whose deadline has already passed.</p>
              </div>

              <div>
                <strong className="text-eink-text font-technical uppercase block text-[11px]">Strict Account Isolation</strong>
                <p>Queries are strictly scoped to the authenticated user's authorized projects and linked repositories.</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
