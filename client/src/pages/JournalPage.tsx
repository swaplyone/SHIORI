import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, ArrowRight, CheckCircle2, GitCommit, GitPullRequest, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const JournalPage: React.FC = () => {
  const { token } = useAuth();
  const [tab, setTab] = useState<'daily' | 'weekly'>('daily');
  const [dailyData, setDailyData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetch('/api/journal/today', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch('/api/journal/weekly', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([d, w]) => {
        setDailyData(d);
        setWeeklyData(w);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            DEVELOPER WORK JOURNAL
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Automated engineering notebook entries and weekly summaries
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border border-eink-border rounded-sm bg-eink-surface p-0.5 font-technical text-xs">
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

      {/* DAILY PAGE VIEW */}
      {tab === 'daily' && (
        <div className="max-w-4xl border border-eink-border rounded-sm bg-eink-surface p-6 sm:p-8 font-technical space-y-8 shadow-eink-card">
          {/* Top Date Header */}
          <div className="border-b border-eink-border pb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold uppercase tracking-widest text-eink-text">
              28 AUGUST 2026
            </h2>
            <span className="text-xs text-eink-textMuted uppercase">
              PAGE 241 • ENGINEERING LOG
            </span>
          </div>

          {/* TASKS SUMMARY SECTION */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
              TASKS
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.summary.tasksCompleted || 7).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">completed</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.summary.tasksRemaining || 3).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">remaining</span>
              </div>
              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm col-span-2 sm:col-span-1">
                <span className="text-xl font-bold text-eink-text block">
                  {String(dailyData?.summary.needsAttention || 1).padStart(2, '0')}
                </span>
                <span className="text-eink-textSecondary text-[11px]">needs attention</span>
              </div>
            </div>
          </div>

          {/* DEVELOPMENT SECTION */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
              DEVELOPMENT
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

          {/* ACTIVITY LOG SECTION */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border/60 pb-1">
              ACTIVITY
            </h3>
            <div className="divide-y divide-eink-border/50 text-xs">
              {[
                { time: '09:12', label: 'task created: Fix compiler error handling' },
                { time: '10:02', label: 'commit pushed a83f21c' },
                { time: '11:08', label: 'PR opened #31 Improve compiler error handling' },
                { time: '11:42', label: 'build failed on feature/error-page (3 tests failed)' },
                { time: '12:03', label: 'fix pushed a91d203' },
                { time: '12:07', label: 'build passed (all 48 checks)' },
              ].map((act, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-eink-textMuted w-12">{act.time}</span>
                    <span className="text-eink-text font-medium">{act.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WEEKLY SUMMARY VIEW */}
      {tab === 'weekly' && (
        <div className="max-w-4xl border border-eink-border rounded-sm bg-eink-surface p-6 sm:p-8 font-technical space-y-8 shadow-eink-card">
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

          {/* Project Distribution with Minimal Grayscale ASCII / Bars */}
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
    </div>
  );
};
