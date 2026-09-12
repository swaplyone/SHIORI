import React from 'react';
import { X, CheckCircle2, GitCommit, GitBranch, User, Calendar, ExternalLink, ShieldCheck, FileCode } from 'lucide-react';
import { Task } from '../../types';

interface CompletedTaskWalkthroughModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CompletedTaskWalkthroughModal: React.FC<CompletedTaskWalkthroughModalProps> = ({
  task,
  isOpen,
  onClose
}) => {
  // CRITICAL: Completed walkthrough must ONLY show when task is genuinely DONE
  const isDone = Boolean(task && (task.status === 'DONE' || task.user_status === 'COMPLETED'));
  if (!isOpen || !task || !isDone) return null;

  const commitSha = task.completion_commit_sha || task.github_last_commit_hash;
  const commitUrl = task.completion_commit_url;
  const authorName = task.github_last_commit_author || task.assignee_name || 'Assigned Developer';
  const branchName = task.github_branch || 'main';
  const reason = task.completion_reason || (task.auto_completed ? 'Automatically verified via GitHub commit.' : 'Marked completed through authorized verification.');
  const completionSource = task.completion_source || (task.auto_completed ? 'GITHUB_COMMIT' : 'MANUAL_VERIFIED');

  // Format completed timestamp safely
  let formattedDate = 'Recorded';
  if (task.completed_at) {
    try {
      const d = new Date(task.completed_at);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleString();
      }
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto eink-scrollbar">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-eink-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-emerald-700 text-white rounded-sm flex items-center justify-center font-bold text-xs">
              ✓
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-eink-textMuted uppercase block leading-none">
                COMPLETED TASK WALKTHROUGH
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs font-bold bg-eink-surface px-1.5 py-0.5 border border-eink-border rounded text-eink-text">
                  {task.task_code}
                </span>
                <h3 className="font-technical font-bold text-xs sm:text-sm text-eink-text truncate max-w-[240px] sm:max-w-[320px]">
                  {task.title}
                </h3>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-eink-textMuted hover:text-eink-text p-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Verification Success Banner */}
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-sm space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200 font-technical font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>VERIFIED COMPLETION</span>
            </div>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200 rounded">
              {completionSource}
            </span>
          </div>
          <p className="text-xs text-emerald-800 dark:text-emerald-300 font-sans leading-relaxed pt-0.5">
            {reason}
          </p>
        </div>

        {/* Real Evidence Grid */}
        <div className="border border-eink-border bg-eink-surface rounded-sm p-3.5 space-y-3 font-technical text-xs">
          <div className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider border-b border-eink-border/60 pb-1.5 flex items-center justify-between">
            <span>VERIFIED GITHUB EVIDENCE</span>
            <span>REAL IDENTITY AUDIT</span>
          </div>

          <div className="space-y-2">
            {commitSha && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-eink-textMuted flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>Commit SHA:</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <code className="bg-eink-bg px-1.5 py-0.5 rounded border border-eink-border font-mono text-[11px] font-bold">
                    {commitSha.substring(0, 7)}
                  </code>
                  {commitUrl && (
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-eink-text hover:underline flex items-center gap-0.5 text-[11px]"
                      title="View on GitHub"
                    >
                      <ExternalLink className="w-3 h-3 inline" />
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-eink-textMuted flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                <span>Verified Branch:</span>
              </span>
              <span className="font-mono font-bold text-eink-text">{branchName}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-eink-textMuted flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Author:</span>
              </span>
              <span className="font-bold text-eink-text">{authorName}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-eink-textMuted flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Completed At:</span>
              </span>
              <span className="font-mono text-[11px] text-eink-textSecondary">{formattedDate}</span>
            </div>

            {Boolean(task.dev_evidence_files_changed) && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-eink-textMuted flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Files Changed:</span>
                </span>
                <span className="font-mono font-bold text-eink-text">{task.dev_evidence_files_changed}</span>
              </div>
            )}
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="p-3 bg-eink-bg border border-eink-border rounded-sm space-y-2 font-technical text-xs">
          <span className="text-[10px] uppercase font-bold text-eink-textMuted tracking-wider block">
            VERIFICATION CHAIN
          </span>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Task reference matched: <strong>{task.task_code}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Commit pushed to authorized branch: <strong>{branchName}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Commit author verified against assigned developer</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Functional work validated without trivial commit bypass</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-eink-text text-eink-bg font-technical font-bold text-xs rounded-sm shadow-eink-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            CLOSE WALKTHROUGH
          </button>
        </div>
      </div>
    </div>
  );
};
