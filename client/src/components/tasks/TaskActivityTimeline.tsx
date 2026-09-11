import React from 'react';
import {
  CheckCircle2,
  Clock,
  GitCommit,
  GitBranch,
  ShieldCheck,
  UserCheck,
  PlusCircle,
  ExternalLink,
  AlertCircle,
  ArrowDown
} from 'lucide-react';
import { Task } from '../../types';

interface TaskActivityTimelineProps {
  task: Task;
  activity: any[];
  commits: any[];
}

export const TaskActivityTimeline: React.FC<TaskActivityTimelineProps> = ({
  task,
  activity = [],
  commits = []
}) => {
  // Synthesize canonical lifecycle milestones
  const isCompleted = task.status === 'DONE' || task.user_status === 'COMPLETED';
  const hasAssignee = Boolean(task.assignee_id || (task as any).assignee_name);
  const isAccepted = task.assignment_status === 'ACCEPTED' || hasAssignee;
  const hasBranch = Boolean(task.github_branch);
  const latestCommit = commits[0] || (task.github_last_commit_hash ? {
    commit_hash: task.github_last_commit_hash,
    message: task.github_last_commit_msg,
    author_name: task.github_last_commit_author
  } : null);
  const hasVerification = Boolean(
    task.auto_completed ||
    task.completion_reason ||
    (task.dev_confidence_score ?? 0) > 0 ||
    activity.some((a) => a.action_type === 'AUTO_COMPLETE' || a.action_type === 'VERIFIED')
  );

  const milestones = [
    {
      id: 'created',
      title: 'Created',
      desc: `Task initialized: ${task.task_code}`,
      timestamp: task.created_at,
      actor: (task as any).creator_name || 'Creator',
      icon: PlusCircle,
      active: true,
      completed: true
    },
    {
      id: 'assigned',
      title: hasAssignee ? `Assigned to ${(task as any).assignee_name || (task as any).assignee_username || 'developer'}` : 'Unassigned',
      desc: hasAssignee ? `Developer responsibility established` : 'Awaiting assignment',
      timestamp: null,
      actor: (task as any).assignee_name || null,
      icon: UserCheck,
      active: hasAssignee,
      completed: hasAssignee
    },
    {
      id: 'accepted',
      title: isAccepted ? 'Task accepted' : 'Pending acceptance',
      desc: isAccepted ? 'Developer accepted task scope' : 'Waiting for developer acknowledgment',
      timestamp: null,
      actor: (task as any).assignee_name || null,
      icon: CheckCircle2,
      active: isAccepted,
      completed: isAccepted
    },
    {
      id: 'branch',
      title: hasBranch ? `Branch verified: ${task.github_branch}` : 'Branch assignment',
      desc: hasBranch ? `Target Git branch verified` : 'No developer branch assigned yet',
      timestamp: null,
      actor: null,
      icon: GitBranch,
      active: hasBranch,
      completed: hasBranch
    },
    {
      id: 'commit',
      title: latestCommit ? `Commit detected (${(latestCommit.commit_hash || '').substring(0, 7)})` : 'Commit detected',
      desc: latestCommit ? latestCommit.message || 'Pushed to branch' : 'Awaiting developer commit push',
      timestamp: latestCommit?.pushed_at || null,
      actor: latestCommit?.author_username || latestCommit?.author_name || null,
      commitSha: latestCommit?.commit_hash,
      icon: GitCommit,
      active: Boolean(latestCommit),
      completed: Boolean(latestCommit)
    },
    {
      id: 'verification',
      title: hasVerification ? 'GitHub verification passed' : 'Verification pending',
      desc: task.completion_reason || (task.dev_confidence_score ? `${task.dev_confidence_score}% confidence evidence match` : 'Automated check pending'),
      timestamp: null,
      actor: 'SHIORI GitHub Engine',
      icon: ShieldCheck,
      active: hasVerification,
      completed: hasVerification
    },
    {
      id: 'completed',
      title: isCompleted ? 'Task completed' : 'Task pending',
      desc: isCompleted
        ? `Finished ${task.completed_at ? new Date(task.completed_at).toLocaleString() : ''} (${task.completion_source || 'AUTO_VERIFIED'})`
        : 'Pending completion',
      timestamp: task.completed_at,
      actor: (task as any).completed_by_name || 'System',
      icon: CheckCircle2,
      active: isCompleted,
      completed: isCompleted
    }
  ];

  const getCommitUrl = (sha: string) => {
    const repo = task.github_repo || 'SHIORI';
    return `https://github.com/${repo}/commit/${sha}`;
  };

  return (
    <div className="space-y-6 font-technical">
      {/* Visual Canonical Lifecycle Stepper */}
      <div className="p-4 bg-eink-surface border border-eink-border rounded-sm space-y-3 shadow-eink-sm">
        <div className="flex items-center justify-between border-b border-eink-border pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-eink-text flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-eink-text" />
            <span>LIFECYCLE TIMELINE ({task.task_code})</span>
          </span>
          <span className="text-[10px] font-mono font-bold bg-eink-bg border border-eink-border px-2 py-0.5 rounded">
            STATUS: {task.status}
          </span>
        </div>

        <div className="space-y-1.5 pt-1">
          {milestones.map((m, idx) => {
            const Icon = m.icon;
            const isLast = idx === milestones.length - 1;

            return (
              <div key={m.id} className="space-y-1">
                <div className={`flex items-start gap-2.5 p-2 rounded-sm border transition-colors ${
                  m.completed
                    ? 'bg-eink-bg border-eink-border text-eink-text'
                    : 'bg-eink-surface/40 border-dashed border-eink-border/50 text-eink-textMuted opacity-60'
                }`}>
                  <div className={`p-1 rounded shrink-0 mt-0.5 ${
                    m.completed ? 'bg-eink-text text-eink-bg' : 'bg-eink-border text-eink-textMuted'
                  }`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-xs">{m.title}</span>
                      {m.timestamp && (
                        <span className="text-[10px] text-eink-textMuted font-mono">
                          {new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-eink-textSecondary truncate font-sans">
                      {m.desc}
                    </p>

                    <div className="flex items-center gap-3 pt-1 text-[10px] text-eink-textMuted font-mono">
                      {m.actor && <span>Actor: @{m.actor}</span>}
                      {m.commitSha && (
                        <a
                          href={getCommitUrl(m.commitSha)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-eink-text underline hover:opacity-80 flex items-center gap-0.5"
                        >
                          SHA: {m.commitSha.substring(0, 7)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {!isLast && (
                  <div className="flex justify-center py-0.5 text-eink-textMuted">
                    <ArrowDown className="w-3 h-3 opacity-40" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Granular Historical Activity Audit Log */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-eink-text">
          ALL RECORDED AUDIT EVENTS ({activity.length})
        </h4>

        {activity.length === 0 ? (
          <div className="p-4 bg-eink-surface/50 border border-eink-border rounded-sm text-center text-xs text-eink-textMuted">
            No additional activity recorded yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {activity.map((act) => (
              <div
                key={act.id}
                className="p-3 bg-eink-surface border border-eink-border rounded-sm space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] text-eink-textMuted flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold bg-eink-bg border border-eink-border px-1.5 py-0.5 rounded text-eink-text">
                      {act.action_type}
                    </span>
                    {act.user_name && (
                      <span className="font-medium text-eink-text">
                        by @{act.username || act.user_name}
                      </span>
                    )}
                  </div>
                  <span className="font-mono">
                    {act.created_at ? new Date(act.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                <p className="text-eink-text font-medium leading-normal font-sans">
                  {act.summary}
                </p>

                {act.details && (
                  <p className="text-[11px] text-eink-textSecondary font-sans leading-relaxed">
                    {act.details}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
