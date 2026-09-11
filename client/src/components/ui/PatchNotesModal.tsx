import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, GitBranch, ShieldCheck, FileText, Clock, RefreshCw, BarChart3, CheckSquare, Square, ChevronRight } from 'lucide-react';
import { fetchJson } from '../../utils/api';

export const CURRENT_PATCH_VERSION = '2026.09.12-github-task-workflow';

interface PatchNotesModalProps {
  onOpenGitHubHub?: () => void;
}

export const PatchNotesModal: React.FC<PatchNotesModalProps> = ({ onOpenGitHubHub }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const storageKey = `shiori_seen_patch_${CURRENT_PATCH_VERSION}`;
    const localSeen = localStorage.getItem(storageKey);

    if (localSeen) {
      return;
    }

    // Check backend status if user is authenticated
    const checkStatus = async () => {
      try {
        const { ok, data } = await fetchJson(`/api/patch-notes/status?version=${CURRENT_PATCH_VERSION}`);
        if (ok && data?.seen) {
          localStorage.setItem(storageKey, 'true');
        } else {
          setIsOpen(true);
        }
      } catch {
        // If API fails, check localStorage only
        if (!localStorage.getItem(storageKey)) {
          setIsOpen(true);
        }
      }
    };

    checkStatus();
  }, []);

  const handleDismiss = async () => {
    const storageKey = `shiori_seen_patch_${CURRENT_PATCH_VERSION}`;
    localStorage.setItem(storageKey, 'true');
    setIsOpen(false);

    try {
      await fetchJson('/api/patch-notes/ack', {
        method: 'POST',
        body: JSON.stringify({ version: CURRENT_PATCH_VERSION })
      });
    } catch {
      // Offline / network failure handled gracefully
    }
  };


  const toggleCheck = (index: number) => {
    setCheckedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  if (!isOpen) return null;

  const features = [
    {
      icon: <span className="font-mono font-bold text-xs">#</span>,
      title: 'TASK-001 Numbering',
      description: 'Tasks now use stable 3-digit task numbers (TASK-001, TASK-002...). Historical Git evidence remains permanently anchored to immutable UUIDs.'
    },
    {
      icon: <GitBranch className="w-3.5 h-3.5" />,
      title: 'Team Branching',
      description: 'Each developer gets a personal feature/<GitHub-username> branch. Task identity identifies the work, developer branch identifies the author.'
    },
    {
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      title: 'Smarter GitHub Verification',
      description: 'SHIORI now validates task, repository, developer and branch before automatically completing work, with duplicate SHA protection.'
    },
    {
      icon: <FileText className="w-3.5 h-3.5" />,
      title: 'Completion Walkthrough',
      description: 'After a task is completed, SHIORI generates a concise completion walkthrough based only on verified work.'
    },
    {
      icon: <Clock className="w-3.5 h-3.5" />,
      title: 'NEEDS_VERIFICATION',
      description: 'Medium-confidence GitHub matches now require manual confirmation instead of being marked complete automatically.'
    },
    {
      icon: <Sparkles className="w-3.5 h-3.5" />,
      title: 'Schedule Improvements',
      description: 'Completed tasks no longer incorrectly show Due Tomorrow or Overdue. Deadlines reflect derived display lifecycles.'
    },
    {
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      title: 'GitHub Reconnection',
      description: 'If GitHub access needs attention, SHIORI notifies you with a simple one-click Reconnect action.'
    },
    {
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      title: 'Reports Reliability',
      description: 'Improved timestamp normalization for production PostgreSQL database queries and burn-down analytics.'
    }
  ];

  const checklist = [
    'Create a TASK-001 task',
    'Assign it to a team member',
    'Verify the correct feature/<username> branch',
    'Copy the generated Git commands',
    'Push a [TASK-001] commit',
    'Verify automatic completion',
    'Open the Completed Walkthrough',
    'Check the Schedule status',
    'Check project counters',
    'Open Reports',
    'Test GitHub reconnect flow'
  ];

  return (
    <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-eink-border bg-eink-surface flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-eink-text text-eink-bg font-mono font-bold text-[10px] rounded-sm tracking-wider">
                RELEASE PATCH
              </span>
              <span className="font-mono text-xs text-eink-textMuted">
                v{CURRENT_PATCH_VERSION}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-technical font-bold text-eink-text uppercase tracking-tight">
              SHIORI Update
            </h2>
            <p className="text-xs text-eink-textSecondary font-sans">
              Plan. Build. Verify. — Workflow Consistency & Verification Improvements
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-eink-textMuted hover:text-eink-text border border-transparent hover:border-eink-border rounded transition-colors"
            title="Close patch notes"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 eink-scrollbar">
          {/* Key Improvements Grid */}
          <div className="space-y-3">
            <h3 className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text flex items-center gap-1.5">
              <span>KEY IMPROVEMENTS</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {features.map((feat, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-eink-surface/70 border border-eink-border rounded-sm space-y-1 hover:border-eink-text/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-sm bg-eink-bg border border-eink-border flex items-center justify-center text-eink-text shrink-0">
                      {feat.icon}
                    </div>
                    <span className="font-technical font-bold text-xs text-eink-text truncate">
                      {feat.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-eink-textSecondary leading-relaxed pl-7 font-sans">
                    {feat.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Verification Cross-Check Checklist */}
          <div className="p-3.5 bg-eink-surface border border-eink-border rounded-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-technical font-bold text-xs uppercase tracking-wider text-eink-text">
                QUICK VERIFICATION CHECKLIST
              </span>
              <span className="text-[10px] font-mono text-eink-textMuted">
                {Object.values(checkedItems).filter(Boolean).length}/{checklist.length} CHECKED
              </span>
            </div>
            <p className="text-[11px] text-eink-textMuted font-sans">
              Test the end-to-end Git verification workflow in your workspace:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {checklist.map((item, idx) => {
                const isChecked = !!checkedItems[idx];
                return (
                  <div
                    key={idx}
                    onClick={() => toggleCheck(idx)}
                    className="flex items-center gap-2 p-1.5 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded text-[11px] text-eink-text cursor-pointer transition-colors"
                  >
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-eink-text shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-eink-textMuted shrink-0" />
                    )}
                    <span className={`truncate ${isChecked ? 'line-through text-eink-textMuted' : ''}`}>
                      {item}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-eink-border bg-eink-surface flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="text-[11px] text-eink-textMuted font-sans text-center sm:text-left">
            This note is shown once per release update.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onOpenGitHubHub && (
              <button
                type="button"
                onClick={() => {
                  handleDismiss();
                  onOpenGitHubHub();
                }}
                className="flex-1 sm:flex-none px-3 py-2 border border-eink-border bg-eink-bg hover:bg-eink-surface rounded text-xs font-technical font-bold text-eink-text flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>VIEW GITHUB WORKFLOW</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 sm:flex-none px-4 py-2 bg-eink-text text-eink-bg rounded text-xs font-technical font-bold shadow-eink-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>GOT IT</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
