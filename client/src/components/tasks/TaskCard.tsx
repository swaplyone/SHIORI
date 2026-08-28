import React from 'react';
import { GitBranch, MessageSquare, CheckSquare, AlertTriangle } from 'lucide-react';
import { Task } from '../../types';
import { DevelopmentEvidenceBadge } from './DevelopmentEvidenceBadge';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onStatusChange?: (newStatus: any) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  const isFailed = task.github_ci_status === 'FAILED';
  const isPassed = task.github_ci_status === 'PASSED';
  const hasDiscrepancy = Boolean(task.has_ci_discrepancy);

  return (
    <div
      onClick={onClick}
      className={`group relative bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border hover:border-eink-borderDark p-3.5 rounded-sm cursor-pointer transition-all shadow-eink-card select-none ${
        hasDiscrepancy ? 'ring-1 ring-eink-text ring-offset-1 ring-offset-eink-bg' : ''
      }`}
    >
      {/* Top Code & Priority */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-technical text-xs font-bold text-eink-text tracking-tight">
          {task.task_code}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-technical px-1.5 py-0.2 border border-eink-border rounded text-eink-textSecondary uppercase">
            {task.priority}
          </span>
          {hasDiscrepancy && (
            <span
              className="w-4 h-4 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-technical font-bold text-[10px]"
              title="Discrepancy Notice: Marked done but CI failing"
            >
              !
            </span>
          )}
        </div>
      </div>

      {/* Task Title */}
      <h3 className="text-xs font-semibold text-eink-text leading-snug line-clamp-2 mb-2 group-hover:underline decoration-eink-textMuted">
        {task.title}
      </h3>

      {/* Project & Branch */}
      <div className="space-y-1 my-2 text-[11px] font-technical text-eink-textSecondary">
        {task.project_name && (
          <p className="uppercase text-[10px] tracking-wider text-eink-textMuted truncate">
            {task.project_name}
          </p>
        )}
        {task.github_branch && (
          <div className="flex items-center gap-1 text-eink-text truncate">
            <GitBranch className="w-3 h-3 shrink-0" />
            <span className="truncate">{task.github_branch}</span>
          </div>
        )}
      </div>

      {/* CI Status Badge */}
      {task.github_ci_status && task.github_ci_status !== 'UNKNOWN' && (
        <div className="my-2">
          <DevelopmentEvidenceBadge
            ciStatus={task.github_ci_status}
            hasDiscrepancy={task.has_ci_discrepancy}
            compact
          />
        </div>
      )}

      {/* Card Footer */}
      <div className="pt-2 mt-2 border-t border-eink-border/50 flex items-center justify-between text-[11px] font-technical text-eink-textMuted">
        <div className="flex items-center gap-3">
          {task.subtasks_count !== undefined && task.subtasks_count > 0 && (
            <div className="flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              <span>{task.subtasks_completed || 0}/{task.subtasks_count}</span>
            </div>
          )}
          {task.comments_count !== undefined && task.comments_count > 0 && (
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{task.comments_count}</span>
            </div>
          )}
        </div>

        {task.assignee_name && (
          <div
            className="w-5 h-5 rounded-sm bg-eink-darkSurface text-eink-darkText flex items-center justify-center font-technical font-bold text-[9px] uppercase"
            title={`Assigned to ${task.assignee_name}`}
          >
            {task.assignee_name[0]}
          </div>
        )}
      </div>
    </div>
  );
};
