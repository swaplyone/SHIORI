import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  GitCommit,
  CheckCircle2,
  AlertCircle,
  Clock,
  CheckSquare,
  Filter,
  BarChart2,
  Calendar,
  Layers,
  FolderGit2,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GlobalActivity } from '../types';
import { ActivityLogSkeleton } from '../components/ui/Skeleton';

interface ReportDay {
  dayName: string;
  dayShort: string;
  dateStr: string;
  count: number;
  tasks: any[];
}

interface ProjectBreakdownItem {
  projectId: string;
  projectName: string;
  repoName?: string;
  completedCount: number;
  activeCount: number;
  pendingCount: number;
  overdueCount: number;
  totalCount: number;
}

interface RepoBreakdownItem {
  repoName: string;
  completedCount: number;
  activeCount: number;
  totalCount: number;
}

interface BurnDownPoint {
  dayName: string;
  dateStr: string;
  remainingTasks: number;
  completedTasks: number;
  idealRemaining: number;
}

interface ReportData {
  timeframe: string;
  dateRange: {
    start: string;
    end: string;
    startDateStr: string;
    endDateStr: string;
    label?: string;
  };
  metrics: {
    completedCount: number;
    activeCount: number;
    overdueCount: number;
    pendingCount?: number;
    dueThisWeekCount?: number;
    dueTodayCount?: number;
    completionRate: number;
  };
  days?: ReportDay[];
  completedTasks: any[];
  activeTasks: any[];
  overdueTasks: any[];
  dueTasks?: any[];
  projectBreakdown?: ProjectBreakdownItem[];
  repositoryBreakdown?: RepoBreakdownItem[];
  burndown?: BurnDownPoint[];
}

export const ActivityPage: React.FC = () => {
  const { token } = useAuth();
  const location = useLocation();

  // Tab State: If route is /reports, default to REPORTS; else REPORTS tab is primary
  const [activeTab, setActiveTab] = useState<'REPORTS' | 'AUDIT'>('REPORTS');

  // Report Filter States
  const [timeframe, setTimeframe] = useState<string>('this_week');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRepo, setSelectedRepo] = useState<string>('ALL');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  // Report Data
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(true);

  // Audit Data
  const [activities, setActivities] = useState<GlobalActivity[]>([]);
  const [categoryStats, setCategoryStats] = useState<{ category: string; count: number }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; slug?: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [auditLoading, setAuditLoading] = useState<boolean>(true);

  // Fetch Report Summary
  const fetchReport = async () => {
    if (!token) return;
    try {
      setReportLoading(true);
      const params = new URLSearchParams();
      params.append('timeframe', timeframe);
      if (selectedProject !== 'ALL') params.append('projectId', selectedProject);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      if (selectedRepo !== 'ALL') params.append('repository', selectedRepo);
      if (timeframe === 'custom' && customStart && customEnd) {
        params.append('startDate', customStart);
        params.append('endDate', customEnd);
      }

      const res = await fetch(`/api/reports/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error('Failed to load report summary:', err);
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch Audit Log
  const fetchActivities = async () => {
    if (!token) return;
    try {
      setAuditLoading(true);
      const res = await fetch('/api/activity', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
        setCategoryStats(data.categoryStats || []);
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [token, timeframe, selectedProject, selectedStatus, selectedRepo, customStart, customEnd]);

  useEffect(() => {
    fetchActivities();
  }, [token]);

  // Extract unique repositories from tasks/breakdown
  const availableRepos = React.useMemo(() => {
    const repos = new Set<string>();
    if (reportData?.repositoryBreakdown) {
      reportData.repositoryBreakdown.forEach((r) => {
        if (r.repoName && r.repoName !== 'No Repository') repos.add(r.repoName);
      });
    }
    return Array.from(repos);
  }, [reportData]);

  // Filtered Audit Activities
  const filteredActivities = activities.filter((act) => {
    if (selectedCategory === 'ALL') return true;
    return act.category === selectedCategory;
  });

  const totalCommits = activities.filter((a) => a.category === 'COMMIT').length;
  const totalTasks = activities.filter((a) => a.category === 'TASK').length;
  const totalCI = activities.filter((a) => a.category === 'CI').length;

  return (
    <div className="space-y-6 select-none font-sans max-w-5xl pb-20 animate-fade-in">
      {/* Page Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-technical text-xl sm:text-2xl font-bold tracking-tight text-eink-text uppercase">
            REPORTS & ACTIVITY AUDIT
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Unified Single Source of Truth for task intelligence, weekly to-dos, and chronological audit trail
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1 bg-eink-surface border border-eink-border p-1 rounded-sm">
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`px-3 py-1 text-xs font-technical font-bold uppercase transition-all rounded-sm cursor-pointer ${
              activeTab === 'REPORTS'
                ? 'bg-eink-text text-eink-bg shadow-sm'
                : 'text-eink-textSecondary hover:text-eink-text hover:bg-eink-bg'
            }`}
          >
            WEEKLY TO-DOS & REPORTS
          </button>
          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1 text-xs font-technical font-bold uppercase transition-all rounded-sm cursor-pointer ${
              activeTab === 'AUDIT'
                ? 'bg-eink-text text-eink-bg shadow-sm'
                : 'text-eink-textSecondary hover:text-eink-text hover:bg-eink-bg'
            }`}
          >
            AUDIT LOGS & COMMITS
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: WEEKLY TO-DOS & TASK INTELLIGENCE REPORTS */}
      {/* ========================================================================= */}
      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-3 font-technical text-xs shadow-eink-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Timeframe Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    TIMEFRAME:
                  </span>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="px-2.5 py-1.5 bg-eink-bg border border-eink-border rounded-sm font-technical font-bold text-eink-text cursor-pointer focus:outline-none"
                  >
                    <option value="this_week">This Week (Mon → Sun)</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="last_week">Last Week</option>
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="custom">Custom Range...</option>
                  </select>
                </div>

                {/* Project Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    PROJECT:
                  </span>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="px-2.5 py-1.5 bg-eink-bg border border-eink-border rounded-sm font-technical text-eink-text cursor-pointer focus:outline-none"
                  >
                    <option value="ALL">All Projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5" />
                    STATUS:
                  </span>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-2.5 py-1.5 bg-eink-bg border border-eink-border rounded-sm font-technical text-eink-text cursor-pointer focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DONE">Completed</option>
                    <option value="IN_PROGRESS">Active</option>
                    <option value="TODO">Pending</option>
                  </select>
                </div>

                {/* Repository Filter */}
                {availableRepos.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1">
                      <GitCommit className="w-3.5 h-3.5" />
                      REPO:
                    </span>
                    <select
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      className="px-2.5 py-1.5 bg-eink-bg border border-eink-border rounded-sm font-technical text-eink-text cursor-pointer focus:outline-none"
                    >
                      <option value="ALL">All Repositories</option>
                      {availableRepos.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchReport}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-eink-border hover:bg-eink-bg text-xs font-technical font-bold text-eink-text rounded-sm cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`} />
                <span>SYNC</span>
              </button>
            </div>

            {/* Custom Date Range Picker Sub-row */}
            {timeframe === 'custom' && (
              <div className="pt-2 border-t border-eink-border flex flex-wrap items-center gap-3 animate-fade-in">
                <span className="text-[10px] uppercase font-bold text-eink-textMuted">DATE RANGE:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1 bg-eink-bg border border-eink-border rounded-sm font-mono text-xs text-eink-text"
                />
                <span className="text-xs text-eink-textMuted">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1 bg-eink-bg border border-eink-border rounded-sm font-mono text-xs text-eink-text"
                />
                {customStart && customEnd && (
                  <span className="text-[11px] text-eink-textSecondary font-mono">
                    ({customStart} → {customEnd})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Date Range Badge */}
          {reportData?.dateRange && (
            <div className="flex items-center justify-between text-xs font-technical text-eink-textMuted px-1">
              <span>
                CURRENT VIEW:{' '}
                <strong className="text-eink-text font-mono">
                  {reportData.dateRange.label || `${reportData.dateRange.startDateStr} → ${reportData.dateRange.endDateStr}`}
                </strong>
              </span>
              <span className="text-[10px] uppercase tracking-wider">
                Single Source of Truth: TaskReportService
              </span>
            </div>
          )}

          {/* KPI Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Completed */}
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-1 shadow-eink-card">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-eink-textMuted border-b border-eink-border pb-1">
                <span>COMPLETED</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-eink-text" />
              </div>
              <div className="text-2xl font-mono font-bold text-eink-text pt-1">
                {reportLoading ? '...' : reportData?.metrics.completedCount ?? 0}
              </div>
              <p className="text-[10px] text-eink-textSecondary font-sans">
                {timeframe === 'this_week'
                  ? 'Completed tasks this week'
                  : timeframe === 'today'
                  ? 'Completed today'
                  : 'Completed in timeframe'}
              </p>
            </div>

            {/* Card 2: Active */}
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-1 shadow-eink-card">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-eink-textMuted border-b border-eink-border pb-1">
                <span>ACTIVE</span>
                <Clock className="w-3.5 h-3.5 text-eink-text" />
              </div>
              <div className="text-2xl font-mono font-bold text-eink-text pt-1">
                {reportLoading ? '...' : reportData?.metrics.activeCount ?? 0}
              </div>
              <p className="text-[10px] text-eink-textSecondary font-sans">
                Currently in progress
              </p>
            </div>

            {/* Card 3: Overdue */}
            <div className={`p-4 bg-eink-surface border rounded-sm font-technical space-y-1 shadow-eink-card ${
              (reportData?.metrics.overdueCount ?? 0) > 0 ? 'border-eink-text' : 'border-eink-border'
            }`}>
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-eink-textMuted border-b border-eink-border pb-1">
                <span>OVERDUE</span>
                <AlertCircle className="w-3.5 h-3.5 text-eink-text" />
              </div>
              <div className="text-2xl font-mono font-bold text-eink-text pt-1">
                {reportLoading ? '...' : reportData?.metrics.overdueCount ?? 0}
              </div>
              <p className="text-[10px] text-eink-textSecondary font-sans">
                {(reportData?.metrics.overdueCount ?? 0) > 0 ? 'Needs attention' : 'All on schedule'}
              </p>
            </div>

            {/* Card 4: Completion Rate */}
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-1 shadow-eink-card">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-eink-textMuted border-b border-eink-border pb-1">
                <span>COMPLETION</span>
                <BarChart2 className="w-3.5 h-3.5 text-eink-text" />
              </div>
              <div className="text-2xl font-mono font-bold text-eink-text pt-1">
                {reportLoading ? '...' : `${reportData?.metrics.completionRate ?? 0}%`}
              </div>
              {/* Visual Progress Bar */}
              <div className="w-full bg-eink-bg border border-eink-border h-1.5 rounded-full overflow-hidden mt-1">
                <div
                  className="bg-eink-text h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, reportData?.metrics.completionRate ?? 0)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Weekly Completion Bar Trend (Mon -> Sun) */}
          {reportData?.days && reportData.days.length === 7 && (
            <div className="p-5 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-4 shadow-eink-card">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-eink-text" />
                  <h3 className="text-xs uppercase font-bold tracking-wider text-eink-text">
                    WEEKLY COMPLETION TREND (MONDAY → SUNDAY)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-eink-textMuted">
                  Total Completed: <strong>{reportData.metrics.completedCount}</strong>
                </span>
              </div>

              <div className="grid grid-cols-7 gap-2 pt-2">
                {reportData.days.map((day) => {
                  const isToday = new Date().toISOString().split('T')[0] === day.dateStr;
                  const maxCount = Math.max(1, ...reportData.days!.map((d) => d.count));
                  const barPercent = Math.round((day.count / maxCount) * 100);

                  return (
                    <div
                      key={day.dateStr}
                      className={`p-2.5 rounded-sm border flex flex-col items-center justify-between text-center transition-colors ${
                        isToday
                          ? 'border-eink-text bg-eink-bg'
                          : 'border-eink-border bg-eink-bg/50 hover:bg-eink-bg'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold text-eink-textMuted">
                        {day.dayShort}
                      </span>
                      <span className="text-[9px] font-mono text-eink-textMuted">
                        {day.dateStr.split('-').slice(1).join('/')}
                      </span>

                      {/* Visual Bar */}
                      <div className="w-full h-12 flex items-end justify-center my-2">
                        <div
                          className="w-4 bg-eink-text rounded-t-sm transition-all duration-300"
                          style={{ height: `${Math.max(4, barPercent * 0.45)}px` }}
                        />
                      </div>

                      <span className="font-mono text-xs font-bold text-eink-text">
                        {day.count}
                      </span>
                      <span className="text-[8px] uppercase text-eink-textSecondary">
                        {day.count === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weekly Burn-Down Chart */}
          {reportData?.burndown && reportData.burndown.length > 0 && (
            <div className="p-5 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-4 shadow-eink-card">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-eink-text" />
                  <h3 className="text-xs uppercase font-bold tracking-wider text-eink-text">
                    WEEKLY BURN-DOWN VELOCITY (REAL TASK DATA)
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-eink-textSecondary">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-eink-text inline-block" />
                    <span>Actual Remaining</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-eink-textMuted border-t border-dashed border-eink-textMuted inline-block" />
                    <span>Ideal Burndown</span>
                  </div>
                </div>
              </div>

              {/* SVG Graphic */}
              <div className="w-full overflow-x-auto">
                <svg viewBox="0 0 700 160" className="w-full h-40">
                  {/* Grid Lines */}
                  {[0, 40, 80, 120].map((y) => (
                    <line
                      key={y}
                      x1="40"
                      y1={y + 15}
                      x2="680"
                      y2={y + 15}
                      stroke="currentColor"
                      className="text-eink-border"
                      strokeDasharray="2,2"
                    />
                  ))}

                  {/* Burndown Data Points & Lines */}
                  {(() => {
                    const maxTasks = Math.max(1, ...reportData.burndown!.map((p) => Math.max(p.remainingTasks, p.idealRemaining)));
                    const xStep = 640 / Math.max(1, reportData.burndown!.length - 1);

                    const actualCoords = reportData.burndown!.map((p, idx) => {
                      const x = 40 + idx * xStep;
                      const y = 135 - (p.remainingTasks / maxTasks) * 110;
                      return { x, y, p };
                    });

                    const idealCoords = reportData.burndown!.map((p, idx) => {
                      const x = 40 + idx * xStep;
                      const y = 135 - (p.idealRemaining / maxTasks) * 110;
                      return { x, y, p };
                    });

                    const actualPath = actualCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
                    const idealPath = idealCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

                    return (
                      <>
                        {/* Ideal Burndown Path */}
                        <path d={idealPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4,4" className="text-eink-textMuted" />
                        {/* Actual Burndown Path */}
                        <path d={actualPath} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-eink-text" />

                        {/* Point Circles */}
                        {actualCoords.map((c, idx) => (
                          <g key={idx}>
                            <circle cx={c.x} cy={c.y} r="3.5" className="fill-eink-text" />
                            <text x={c.x} y="152" textAnchor="middle" className="text-[10px] fill-eink-textSecondary font-mono">
                              {c.p.dayName}
                            </text>
                            <text x={c.x} y={c.y - 7} textAnchor="middle" className="text-[9px] fill-eink-text font-mono font-bold">
                              {c.p.remainingTasks}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* Grouped Day-by-Day Completed Tasks (Mon -> Sun) */}
          {reportData?.days && (
            <div className="p-5 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-4 shadow-eink-card">
              <div className="flex items-center justify-between border-b border-eink-border pb-2">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-eink-text" />
                  <h3 className="text-xs uppercase font-bold tracking-wider text-eink-text">
                    COMPLETED TASKS GROUPED BY DAY
                  </h3>
                </div>
                <span className="text-[10px] uppercase text-eink-textMuted">Chronological Week Breakdown</span>
              </div>

              <div className="space-y-4">
                {reportData.days.map((day) => (
                  <div key={day.dateStr} className="border-l-2 border-eink-border pl-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono uppercase text-eink-text flex items-center gap-2">
                        <span>{day.dayName}</span>
                        <span className="text-[10px] text-eink-textMuted">({day.dateStr})</span>
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 border border-eink-border rounded bg-eink-bg text-eink-text">
                        {day.count} {day.count === 1 ? 'completed' : 'completed'}
                      </span>
                    </div>

                    {day.tasks.length === 0 ? (
                      <p className="text-[11px] text-eink-textMuted font-sans italic pl-1">
                        No tasks completed on this day.
                      </p>
                    ) : (
                      <div className="space-y-1.5 pl-1">
                        {day.tasks.map((task: any) => (
                          <div
                            key={task.id}
                            className="p-2 bg-eink-bg border border-eink-border rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-eink-text shrink-0" />
                              <span className="font-mono font-bold text-[11px] text-eink-text shrink-0">
                                {task.task_code || 'TSK'}
                              </span>
                              <span className="font-sans font-medium text-eink-text truncate">
                                {task.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {task.project_name && (
                                <span className="text-[9px] font-mono border border-eink-border px-1 py-0.2 rounded bg-eink-surface text-eink-textMuted">
                                  {task.project_name}
                                </span>
                              )}
                              {task.github_repo && (
                                <span className="text-[9px] font-mono border border-eink-border px-1 py-0.2 rounded bg-eink-surface text-eink-textMuted flex items-center gap-1">
                                  <FolderGit2 className="w-2.5 h-2.5" />
                                  {task.github_repo}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Tasks & Overdue Tasks Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active Tasks */}
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-3 shadow-eink-card">
              <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
                <span className="text-xs uppercase font-bold tracking-wider text-eink-text flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  ACTIVE TASKS ({reportData?.activeTasks.length ?? 0})
                </span>
              </div>
              {reportData?.activeTasks.length === 0 ? (
                <p className="text-xs text-eink-textMuted font-sans italic">No active tasks right now.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {reportData?.activeTasks.map((t: any) => (
                    <div key={t.id} className="p-2 bg-eink-bg border border-eink-border rounded-sm text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono font-bold text-[10px]">{t.task_code || 'TSK'}</span>
                        <span className="truncate font-sans">{t.title}</span>
                      </div>
                      <span className="text-[9px] font-mono uppercase bg-eink-surface border border-eink-border px-1 py-0.2 rounded shrink-0">
                        {t.priority || 'MED'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overdue Tasks */}
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-3 shadow-eink-card">
              <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
                <span className="text-xs uppercase font-bold tracking-wider text-eink-text flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  OVERDUE TASKS ({reportData?.overdueTasks.length ?? 0})
                </span>
              </div>
              {reportData?.overdueTasks.length === 0 ? (
                <p className="text-xs text-eink-textMuted font-sans italic">No overdue tasks. All deadlines intact.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {reportData?.overdueTasks.map((t: any) => (
                    <div key={t.id} className="p-2 bg-eink-bg border border-eink-border rounded-sm text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono font-bold text-[10px] text-eink-text">{t.task_code || 'TSK'}</span>
                        <span className="truncate font-sans">{t.title}</span>
                      </div>
                      <span className="text-[9px] font-mono text-eink-text shrink-0">
                        Due: {t.deadline ? t.deadline.split('T')[0] : t.due_date || 'Past'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Project & Repository Breakdown Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Project Breakdown */}
            {reportData?.projectBreakdown && reportData.projectBreakdown.length > 0 && (
              <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-3 shadow-eink-card">
                <div className="border-b border-eink-border pb-1.5 flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-eink-text flex items-center gap-1.5">
                    <FolderGit2 className="w-3.5 h-3.5" />
                    THIS WEEK BY PROJECT
                  </span>
                </div>
                <div className="space-y-2">
                  {reportData.projectBreakdown.map((pb) => (
                    <div key={pb.projectId} className="p-2.5 bg-eink-bg border border-eink-border rounded-sm text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-eink-text">{pb.projectName}</span>
                        <span className="font-mono text-[11px] font-bold text-eink-text">
                          {pb.completedCount} completed
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-eink-textMuted font-mono">
                        <span>Active: {pb.activeCount}</span>
                        <span>Pending: {pb.pendingCount}</span>
                        {pb.overdueCount > 0 && <span className="font-bold">Overdue: {pb.overdueCount}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Repository Breakdown */}
            {reportData?.repositoryBreakdown && reportData.repositoryBreakdown.length > 0 && (
              <div className="p-4 bg-eink-surface border border-eink-border rounded-sm font-technical space-y-3 shadow-eink-card">
                <div className="border-b border-eink-border pb-1.5 flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider text-eink-text flex items-center gap-1.5">
                    <GitCommit className="w-3.5 h-3.5" />
                    THIS WEEK BY REPOSITORY
                  </span>
                </div>
                <div className="space-y-2">
                  {reportData.repositoryBreakdown.map((rb) => (
                    <div key={rb.repoName} className="p-2.5 bg-eink-bg border border-eink-border rounded-sm text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-eink-text font-mono truncate">{rb.repoName}</span>
                        <span className="font-mono text-[11px] font-bold text-eink-text">
                          {rb.completedCount} completed
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-eink-textMuted font-mono">
                        <span>Active: {rb.activeCount}</span>
                        <span>Total: {rb.totalCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: AUDIT LOGS & CHRONOLOGICAL COMMITS */}
      {/* ========================================================================= */}
      {activeTab === 'AUDIT' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
              <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
                <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>TASK EVENTS</span>
                </span>
                <span className="font-mono text-xs font-bold text-eink-text">{totalTasks}</span>
              </div>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Creations, assignments, status transitions and completions.
              </p>
            </div>

            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
              <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
                <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>GIT COMMITS</span>
                </span>
                <span className="font-mono text-xs font-bold text-eink-text">{totalCommits}</span>
              </div>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Code pushes, branch commits, and repository merges.
              </p>
            </div>

            <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
              <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
                <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>CI WORKFLOWS</span>
                </span>
                <span className="font-mono text-xs font-bold text-eink-text">{totalCI}</span>
              </div>
              <p className="text-[11px] text-eink-textSecondary font-sans">
                Automated test suites, build validations, and deployment checks.
              </p>
            </div>
          </div>

          {/* Chronological Audit Trail Card */}
          <div className="border border-eink-border rounded-sm bg-eink-surface p-4 sm:p-6 font-technical space-y-5 shadow-eink-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-eink-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ActivityIcon className="w-4 h-4 text-eink-text" />
                  <h3 className="font-bold text-sm text-eink-text uppercase tracking-wider">
                    Chronological Audit Trail
                  </h3>
                </div>
                <p className="text-[11px] text-eink-textSecondary font-sans">
                  Complete verifiable log of development actions
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                    selectedCategory === 'ALL'
                      ? 'bg-eink-text text-eink-bg'
                      : 'border border-eink-border hover:bg-eink-bg text-eink-textSecondary'
                  }`}
                >
                  ALL ({activities.length})
                </button>
                {categoryStats.map((cs) => (
                  <button
                    key={cs.category}
                    onClick={() => setSelectedCategory(cs.category)}
                    className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                      selectedCategory === cs.category
                        ? 'bg-eink-text text-eink-bg'
                        : 'border border-eink-border hover:bg-eink-bg text-eink-textSecondary'
                    }`}
                  >
                    {cs.category} ({cs.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Content */}
            {auditLoading ? (
              <ActivityLogSkeleton rows={6} />
            ) : filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-xs text-eink-textMuted space-y-1">
                <p className="font-bold uppercase">No Audit Events Found</p>
                <p className="text-[11px] text-eink-textSecondary font-sans">
                  Perform Git commits or task modifications to generate verifiable audit entries.
                </p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-eink-border">
                {filteredActivities.map((act) => (
                  <div
                    key={act.id}
                    className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 p-2 rounded hover:bg-eink-bg transition-colors"
                  >
                    <div className="absolute -left-6 top-3 w-3 h-3 rounded-full bg-eink-bg border-2 border-eink-text flex items-center justify-center text-[7px] font-bold text-eink-text shrink-0">
                      •
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold font-mono bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded shrink-0">
                          {act.category}
                        </span>
                        {act.task_code && (
                          <span className="text-[10px] font-mono font-bold text-eink-text shrink-0">
                            {act.task_code}
                          </span>
                        )}
                        <span className="font-bold text-xs text-eink-text truncate">
                          {act.title}
                        </span>
                      </div>

                      {act.meta_text && (
                        <p className="text-[11px] text-eink-textSecondary font-sans pl-0.5">
                          {act.meta_text}
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-eink-textMuted font-mono shrink-0 pl-0.5 sm:pl-0">
                      {act.created_at}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
