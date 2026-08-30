import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Sparkles, Hash } from 'lucide-react';
import { Task } from '../../types';

interface AiDeveloperHandoffModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AiDeveloperHandoffModal: React.FC<AiDeveloperHandoffModalProps> = ({
  task,
  isOpen,
  onClose
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen || !task) return null;

  const commitTitle = task.title.toLowerCase().replace(/[^\w\s-]/g, '').trim();

  const generatedPrompt = `Implement Shiori task ${task.task_code}.

Task:
${task.title}
${task.description ? `\nDescription:\n${task.description}\n` : ''}
Requirements:
- Implement the requested task.
- Follow the existing Shiori architecture and design system.
- Do not modify unrelated functionality.
- Keep changes isolated to ${task.task_code}.
- Preserve existing behavior.
- Run relevant tests/build checks.
- Fix issues caused by this task before committing.

Git commit convention:
feat(${task.task_code}): ${commitTitle}

Before finishing:
1. Verify the implementation.
2. Run relevant tests.
3. Run the build if appropriate.
4. Review the changed files.
5. Ensure there are no unrelated changes.
6. Commit the completed work using the task ID.

Expected commit format:
feat(${task.task_code}): ${commitTitle}`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(task.task_code);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch (err) {
      console.error('Failed to copy task ID:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-lg w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-eink-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-mono text-[10px] font-bold">
              ✓
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-eink-textMuted uppercase block leading-none">
                TASK CREATED · AI HANDOFF
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-sm font-bold bg-eink-surface px-1.5 py-0.5 border border-eink-border rounded text-eink-text">
                  {task.task_code}
                </span>
                <h3 className="font-technical font-bold text-sm text-eink-text truncate max-w-[260px]">
                  {task.title}
                </h3>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-eink-textMuted hover:text-eink-text p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subtitle / Purpose */}
        <div className="text-xs text-eink-textSecondary space-y-1">
          <p className="font-technical text-eink-text font-bold">
            Ready for your AI coding assistant.
          </p>
          <p className="text-[11px] text-eink-textMuted font-sans">
            Give this prompt to Cursor, Antigravity, Claude Code, or your preferred AI tool.
          </p>
        </div>

        {/* Prompt Preview Card */}
        <div className="bg-eink-surface border border-eink-border rounded-sm p-3.5 space-y-2 font-mono text-[11px] max-h-48 overflow-y-auto eink-scrollbar">
          <div className="flex items-center justify-between text-[10px] text-eink-textMuted border-b border-eink-border/50 pb-1">
            <span className="flex items-center gap-1 font-bold">
              <Terminal className="w-3 h-3" />
              <span>STRUCTURED PROMPT</span>
            </span>
            <span className="text-[9px] uppercase">feat({task.task_code})</span>
          </div>
          <pre className="whitespace-pre-wrap text-eink-text leading-relaxed font-mono">
            {generatedPrompt}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
          <button
            onClick={handleCopyPrompt}
            className="w-full sm:flex-1 py-2.5 px-4 bg-eink-text text-eink-bg font-mono font-bold text-xs rounded-sm flex items-center justify-center gap-2 shadow-eink-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
          >
            {copiedPrompt ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>COPIED PROMPT ✓</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPY AI PROMPT</span>
              </>
            )}
          </button>

          <button
            onClick={handleCopyId}
            className="w-full sm:w-auto py-2.5 px-3.5 border border-eink-border bg-eink-bg hover:bg-eink-surface text-eink-text font-mono font-bold text-xs rounded-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedId ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>{task.task_code} ✓</span>
              </>
            ) : (
              <>
                <Hash className="w-3.5 h-3.5 text-eink-textMuted" />
                <span>COPY ID</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-3.5 border border-transparent hover:border-eink-border text-eink-textMuted hover:text-eink-text font-technical text-xs rounded-sm transition-colors cursor-pointer"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
