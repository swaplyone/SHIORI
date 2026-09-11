import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Terminal, AlertTriangle, GitBranch, RefreshCw, Hash } from 'lucide-react';
import { Task } from '../../types';
import { useAuth } from '../../context/AuthContext';

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
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [promptData, setPromptData] = useState<any>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCommands, setCopiedCommands] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const fetchPrompt = async () => {
    if (!task || !token) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/tasks/${task.id}/ai-prompt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPromptData(data);
      } else {
        const err = await res.json();
        setPromptData({ ready: false, message: err.error || 'Failed to generate prompt' });
      }
    } catch (err) {
      console.error('Failed to fetch AI prompt:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && task) {
      fetchPrompt();
    } else {
      setPromptData(null);
    }
  }, [isOpen, task?.id]);

  if (!isOpen || !task) return null;

  const handleCopyPrompt = async () => {
    if (!promptData?.prompt) return;
    try {
      await navigator.clipboard.writeText(promptData.prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
    }
  };

  const handleCopySetupCommands = async () => {
    if (!promptData?.setupCommands) return;
    try {
      await navigator.clipboard.writeText(promptData.setupCommands);
      setCopiedCommands(true);
      setTimeout(() => setCopiedCommands(false), 2000);
    } catch (err) {
      console.error('Failed to copy commands:', err);
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
    <div className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-lg w-full p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-eink-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-mono text-[10px] font-bold">
              ⚡
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-eink-textMuted uppercase block leading-none">
                AI CODING HANDOFF · {promptData?.workingMode || 'SOLO'} MODE
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs font-bold bg-eink-surface px-1.5 py-0.5 border border-eink-border rounded text-eink-text">
                  {task.task_code}
                </span>
                <h3 className="font-technical font-bold text-xs sm:text-sm text-eink-text truncate max-w-[240px] sm:max-w-[280px]">
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

        {/* Loading state */}
        {loading ? (
          <div className="p-8 text-center space-y-2 font-technical text-xs text-eink-textSecondary">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-eink-text" />
            <p>Resolving developer identity & verifying GitHub branch...</p>
          </div>
        ) : promptData?.ready ? (
          /* Ready & Verified Prompt */
          <>
            <div className="flex items-center justify-between p-2.5 bg-eink-surface border border-eink-border rounded text-xs font-technical">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-eink-text" />
                <span>
                  Branch: <strong className="font-mono">{promptData.requiredBranch}</strong>
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 rounded font-mono">
                ✓ VERIFIED
              </span>
            </div>

            {/* Prompt Preview Card */}
            <div className="bg-eink-surface border border-eink-border rounded-sm p-3.5 space-y-2 font-mono text-[11px] max-h-52 overflow-y-auto eink-scrollbar">
              <div className="flex items-center justify-between text-[10px] text-eink-textMuted border-b border-eink-border/50 pb-1">
                <span className="flex items-center gap-1 font-bold">
                  <Terminal className="w-3 h-3" />
                  <span>INTELLIGENT AI PROMPT</span>
                </span>
                <span className="text-[9px] uppercase">READY FOR AI ASSISTANT</span>
              </div>
              <pre className="whitespace-pre-wrap text-eink-text leading-relaxed font-mono">
                {promptData.prompt}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                type="button"
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
                type="button"
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
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto py-2.5 px-3.5 border border-transparent hover:border-eink-border text-eink-textMuted hover:text-eink-text font-technical text-xs rounded-sm transition-colors cursor-pointer"
              >
                DONE
              </button>
            </div>
          </>
        ) : promptData?.reason === 'BRANCH_NOT_CREATED' ? (
          /* Branch Missing / Setup Guidance */
          <div className="space-y-3 font-technical text-xs">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 rounded space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>BRANCH SETUP REQUIRED</span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-sans leading-normal">
                Assigned branch <strong className="font-mono">{promptData.requiredBranch}</strong> has not been created on GitHub yet. Run these commands in your local repository to create and push your branch:
              </p>
            </div>

            <div className="bg-eink-surface border border-eink-border rounded p-3 font-mono text-[11px] text-eink-text space-y-2">
              <div className="text-[10px] text-eink-textMuted uppercase font-bold">
                FIRST-TIME BRANCH SETUP
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {promptData.setupCommands}
              </pre>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopySetupCommands}
                className="flex-1 py-2 px-3 bg-eink-text text-eink-bg font-bold font-mono text-xs rounded shadow-eink-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedCommands ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCommands ? 'COPIED COMMANDS ✓' : 'COPY SETUP COMMANDS'}</span>
              </button>
              <button
                type="button"
                onClick={fetchPrompt}
                className="py-2 px-3 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded font-bold text-xs flex items-center gap-1 text-eink-text cursor-pointer"
                title="Re-check GitHub for created branch"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>RE-CHECK</span>
              </button>
            </div>
          </div>
        ) : (
          /* Generic or Identity Not Verified State */
          <div className="space-y-3 font-technical text-xs">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 rounded space-y-1 text-rose-900 dark:text-rose-200">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>GIT SETUP INCOMPLETE</span>
              </div>
              <p className="text-[11px] font-sans">
                {promptData?.message || 'The assigned developer Git setup or branch configuration is incomplete.'}
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-1.5 px-4 bg-eink-text text-eink-bg font-bold rounded text-xs"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

