import React, { useState, useEffect } from 'react';
import { Activity as ActivityIcon, GitCommit, GitPullRequest, Terminal, CheckCircle2, XCircle, CheckSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GlobalActivity } from '../types';

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
          <span className="text-[11px] text-eink-textMuted">{activities.length} events recorded</span>
        </div>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-eink-border">
          {(activities.length > 0 ? activities : [
            { id: '1', category: 'TASK', icon_symbol: '○', title: 'Task created: Fix compiler error handling', meta_text: 'TASK-042', created_at: '09:12' },
            { id: '2', category: 'COMMIT', icon_symbol: '⎇', title: 'Commit pushed a83f21c', meta_text: 'fix: compiler error rendering (feature/error-page)', created_at: '10:02' },
            { id: '3', category: 'PR', icon_symbol: '→', title: 'Pull request opened #31', meta_text: 'Improve compiler error handling', created_at: '10:41' },
            { id: '4', category: 'CI', icon_symbol: '✕', title: 'CI failed on feature/error-page', meta_text: '3 tests failed in parser_nested_test.rs', created_at: '11:42' },
            { id: '5', category: 'COMMIT', icon_symbol: '⎇', title: 'Fix pushed a91d203', meta_text: 'fix: parser AST token recovery', created_at: '12:03' },
            { id: '6', category: 'CI', icon_symbol: '✓', title: 'CI passed on feature/error-page', meta_text: 'All 48 checks passed', created_at: '12:07' },
            { id: '7', category: 'PR', icon_symbol: '✓', title: 'Pull request #31 merged', meta_text: 'Merged into main', created_at: '12:31' },
            { id: '8', category: 'TASK', icon_symbol: '✓', title: 'Task completed: Fix compiler error handling', meta_text: 'TASK-042', created_at: '12:32' },
          ]).map((act, idx) => (
            <div key={act.id || idx} className="relative group">
              {/* Timeline dot */}
              <div className="absolute -left-6 top-0.5 w-5 h-5 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-center font-bold text-[10px] text-eink-text shadow-eink-sm">
                {act.icon_symbol}
              </div>

              <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-eink-text">{act.title}</span>
                  <span className="text-[11px] text-eink-textMuted">{act.created_at}</span>
                </div>
                {act.meta_text && (
                  <p className="text-[11px] text-eink-textSecondary">{act.meta_text}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
