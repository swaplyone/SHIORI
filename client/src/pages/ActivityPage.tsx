import React, { useState, useEffect } from 'react';
import { Activity as ActivityIcon, GitCommit, GitPullRequest, Terminal, CheckCircle2, XCircle, CheckSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GlobalActivity } from '../types';
import { ActivityLogSkeleton } from '../components/ui/Skeleton';

export const ActivityPage: React.FC = () => {
  const { token } = useAuth();
  const [activities, setActivities] = useState<GlobalActivity[]>([]);
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

  return (
    <div className="space-y-8 select-none font-sans">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            DEVELOPMENT ACTIVITY TIMELINE
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Chronological engineering audit log across commits, CI builds, tasks and pull requests
          </p>
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="max-w-3xl border border-eink-border rounded-sm bg-eink-surface p-6 font-technical space-y-6 shadow-eink-card">
        <div className="flex items-center justify-between border-b border-eink-border pb-2">
          <span className="text-xs font-bold text-eink-text uppercase">TODAY & RECENT CHRONOLOGY</span>
          <span className="text-[11px] text-eink-textMuted">{loading ? '...' : `${activities.length} events recorded`}</span>
        </div>

        {loading ? (
          <ActivityLogSkeleton rows={5} />
        ) : activities.length === 0 ? (
          <div className="p-8 text-center text-xs text-eink-textMuted">
            No activity events recorded yet. Perform Git commits or task updates to see live audit logs.
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-eink-border animate-fade-in">
            {activities.map((act) => (
              <div key={act.id} className="relative flex items-start justify-between gap-4 group">
                <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-eink-bg border-2 border-eink-text flex items-center justify-center text-[8px] font-bold text-eink-text">
                  •
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-eink-bg px-1.5 py-0.2 border border-eink-border rounded">
                      {act.category}
                    </span>
                    <span className="font-bold text-xs text-eink-text">{act.title}</span>
                  </div>
                  {act.meta_text && (
                    <p className="text-[11px] text-eink-textSecondary">{act.meta_text}</p>
                  )}
                </div>
                <span className="text-[10px] text-eink-textMuted font-mono shrink-0">
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
