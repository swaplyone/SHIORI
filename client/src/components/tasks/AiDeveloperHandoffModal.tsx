import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Terminal, AlertTriangle, GitBranch, RefreshCw, Hash, ArrowRight, Play, CheckCircle } from 'lucide-react';
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

  // Separate copy state flags for each block
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedSetup, setCopiedSetup] = useState(false);
  const [copiedStart, setCopiedStart] = useState(false);
  const [copiedFinish, setCopiedFinish] = useState(false);
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

  const copyToClipboard = async (text: string, setCopied: (val: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const branchSetupCommands =
    promptData?.branchSetupCommands ||
    promptData?.setupCommands ||
    (promptData?.requiredBranch
      ? `git fetch origin\ngit switch -c ${promptData.requiredBranch} origin/${promptData.defaultBranch || 'main'}\ngit push -u origin ${promptData.requiredBranch}`
      : '');

  const startTaskCommands =
    promptData?.startTaskCommands ||
    (promptData?.requiredBranch
      ? `git switch ${promptData.requiredBranch}\ngit pull origin ${promptData.requiredBranch}`
      : '');

  const finishTaskCommands =
    promptData?.finishTaskCommands ||
    (promptData?.requiredBranch
      ? `git add .\ngit commit -m "[${task.task_code}] ${task.title}"\ngit push origin ${promptData.requiredBranch}`
      : '');

  const isBranchVerified = promptData?.branchStatus === 'VERIFIED';
  const isBranchNotCreated = promptData?.reason === 'BRANCH_NOT_CREATED';

  return (
    <div className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto eink-scrollbar">
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
                <h3 className="font-technical font-bold text-xs sm:text-sm text-eink-text truncate max-w-[240px] sm:max-w-[320px]">
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
        ) : promptData?.ready || isBranchNotCreated ? (
          <div className="space-y-4">
            {/* Branch Status Banner */}
            <div className="flex items-center justify-between p-2.5 bg-eink-surface border border-eink-border rounded text-xs font-technical">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-eink-text" />
                <span>
                  Expected Branch: <strong className="font-mono">{promptData.requiredBranch}</strong>
                </span>
              </div>
              {isBranchVerified ? (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 rounded font-mono">
                  ✓ Branch verified
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 rounded font-mono">
                  ⚠ First-time branch setup required
                </span>
              )}
            </div>

            {/* BLOCK 1: BRANCH SETUP */}
            <div className="border border-eink-border bg-eink-surface rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-technical font-bold uppercase text-eink-text flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>BRANCH SETUP</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(branchSetupCommands, setCopiedSetup)}
                  className="px-2.5 py-1 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded text-[10px] font-mono font-bold text-eink-text flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedSetup ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSetup ? 'COPIED ✓' : 'COPY'}</span>
                </button>
              </div>
              <pre className="bg-eink-bg p-2 rounded border border-eink-border/70 font-mono text-[11px] text-eink-text leading-relaxed whitespace-pre-wrap select-all">
                {branchSetupCommands}
              </pre>
            </div>

            {/* BLOCK 2: START TASK */}
            <div className="border border-eink-border bg-eink-surface rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-technical font-bold uppercase text-eink-text flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" />
                  <span>START TASK</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(startTaskCommands, setCopiedStart)}
                  className="px-2.5 py-1 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded text-[10px] font-mono font-bold text-eink-text flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedStart ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedStart ? 'COPIED ✓' : 'COPY'}</span>
                </button>
              </div>
              <pre className="bg-eink-bg p-2 rounded border border-eink-border/70 font-mono text-[11px] text-eink-text leading-relaxed whitespace-pre-wrap select-all">
                {startTaskCommands}
              </pre>
            </div>

            {/* BLOCK 3: FINISH TASK */}
            <div className="border border-eink-border bg-eink-surface rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-technical font-bold uppercase text-eink-text flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>FINISH TASK</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(finishTaskCommands, setCopiedFinish)}
                  className="px-2.5 py-1 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded text-[10px] font-mono font-bold text-eink-text flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedFinish ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedFinish ? 'COPIED ✓' : 'COPY'}</span>
                </button>
              </div>
              <pre className="bg-eink-bg p-2 rounded border border-eink-border/70 font-mono text-[11px] text-eink-text leading-relaxed whitespace-pre-wrap select-all">
                {finishTaskCommands}
              </pre>
            </div>

            {/* BLOCK 4: AI CODING PROMPT */}
            {promptData?.prompt && (
              <div className="border border-eink-border bg-eink-surface rounded-sm p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-technical font-bold uppercase text-eink-text flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>AI CODING PROMPT</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(promptData.prompt, setCopiedPrompt)}
                    className="px-2.5 py-1 bg-eink-text text-eink-bg rounded text-[10px] font-mono font-bold flex items-center gap-1 shadow-eink-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                  >
                    {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPrompt ? 'COPIED PROMPT ✓' : 'COPY'}</span>
                  </button>
                </div>
                <pre className="bg-eink-bg p-2.5 rounded border border-eink-border/70 font-mono text-[11px] text-eink-text leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto eink-scrollbar select-all">
                  {promptData.prompt}
                </pre>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(task.task_code, setCopiedId)}
                  className="px-3 py-1.5 border border-eink-border bg-eink-bg hover:bg-eink-surface text-eink-text font-mono font-bold text-xs rounded-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Hash className="w-3.5 h-3.5 text-eink-textMuted" />
                  <span>{copiedId ? `${task.task_code} ✓` : 'COPY ID'}</span>
                </button>

                {!isBranchVerified && (
                  <button
                    type="button"
                    onClick={fetchPrompt}
                    className="px-3 py-1.5 border border-eink-border bg-eink-bg hover:bg-eink-surface text-eink-text font-technical font-bold text-xs rounded-sm flex items-center gap-1 transition-colors cursor-pointer"
                    title="Re-check branch existence on GitHub"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>RE-CHECK</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-eink-text text-eink-bg font-technical font-bold text-xs rounded-sm shadow-eink-sm hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
              >
                DONE
              </button>
            </div>
          </div>
        ) : (
          /* Missing GitHub Identity or Error State */
          <div className="space-y-3 font-technical text-xs">
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 rounded space-y-1.5 text-rose-900 dark:text-rose-200">
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
                className="py-1.5 px-4 bg-eink-text text-eink-bg font-bold rounded text-xs cursor-pointer"
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
