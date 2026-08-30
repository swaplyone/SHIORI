import React, { useState, useEffect } from 'react';
import {
  Activity as ActivityIcon,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Filter,
  BarChart2,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GlobalActivity } from '../types';
import { ActivityLogSkeleton } from '../components/ui/Skeleton';
import { ProjectBurndownCard } from '../components/activity/ProjectBurndownCard';

export const ActivityPage: React.FC = () => {
  const { token } = useAuth();
  const [activities, setActivities] = useState<GlobalActivity[]>([]);
  const [categoryStats, setCategoryStats] = useState<{ category: string; count: number }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; slug?: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  const fetchActivities = async () => {
    if (!token) return;
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [token]);

  const filteredActivities = activities.filter((act) => {
    if (selectedCategory === 'ALL') return true;
    return act.category === selectedCategory;
  });

  const totalCommits = activities.filter((a) => a.category === 'COMMIT').length;
  const totalTasks = activities.filter((a) => a.category === 'TASK').length;
  const totalCI = activities.filter((a) => a.category === 'CI').length;

  return (
    <div className="space-y-6 select-none font-sans max-w-5xl pb-16 animate-fade-in">
      {/* Page Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-technical text-xl sm:text-2xl font-bold tracking-tight text-eink-text uppercase">
            DEVELOPMENT ACTIVITY AUDIT
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Engineering burndown velocity, commit history, and chronological audit trail
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchActivities}
            className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs font-technical font-bold text-eink-text rounded-sm cursor-pointer"
          >
            REFRESH AUDIT
          </button>
        </div>
      </div>

      {/* 1. TOP SECTION: PROJECT BURNDOWN GRAPH CARD */}
      <ProjectBurndownCard projects={projects} />

      {/* 2. MIDDLE SECTION: AUDIT METRICS & CATEGORY BREAKDOWN CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card: Task Velocity */}
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
          <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>TASK EVENTS</span>
            </span>
            <span className="font-mono text-xs font-bold text-eink-text">
              {totalTasks}
            </span>
          </div>
          <p className="text-[11px] text-eink-textSecondary font-sans">
            Creations, assignments, status transitions and completions.
          </p>
        </div>

        {/* Card: Commit Logs */}
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
          <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5" />
              <span>GIT COMMITS</span>
            </span>
            <span className="font-mono text-xs font-bold text-eink-text">
              {totalCommits}
            </span>
          </div>
          <p className="text-[11px] text-eink-textSecondary font-sans">
            Code pushes, branch commits, and repository merges.
          </p>
        </div>

        {/* Card: CI & Automation */}
        <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-2 shadow-eink-card font-technical">
          <div className="flex items-center justify-between border-b border-eink-border pb-1.5">
            <span className="text-[10px] uppercase font-bold text-eink-textMuted flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5" />
              <span>CI WORKFLOWS</span>
            </span>
            <span className="font-mono text-xs font-bold text-eink-text">
              {totalCI}
            </span>
          </div>
          <p className="text-[11px] text-eink-textSecondary font-sans">
            Automated test suites, build validations, and deployment checks.
          </p>
        </div>
      </div>

      {/* 3. CHRONOLOGICAL AUDIT TRAIL CARD */}
      <div className="border border-eink-border rounded-sm bg-eink-surface p-4 sm:p-6 font-technical space-y-5 shadow-eink-card">
        {/* Card Header & Filter Pills */}
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
        {loading ? (
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
                {/* Node Dot */}
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
  );
};
