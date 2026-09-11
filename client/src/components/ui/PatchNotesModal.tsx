import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, GitBranch, Terminal, RefreshCw, BarChart3, CheckSquare, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchJson } from '../../utils/api';

export const PATCH_NOTES_VERSION = '2026.09.12';

interface PatchNotesModalProps {
  onOpenGitHubHub?: () => void;
}

export const PatchNotesModal: React.FC<PatchNotesModalProps> = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const userId = user?.id || 'guest';
    const storageKey = `shiori.patchNotes.${userId}.${PATCH_NOTES_VERSION}`;
    const localSeen = localStorage.getItem(storageKey);

    if (localSeen) {
      return;
    }

    // Check backend status if user is authenticated
    const checkStatus = async () => {
      try {
        const { ok, data } = await fetchJson(`/api/patch-notes/status?version=${PATCH_NOTES_VERSION}`);
        if (ok && data?.seen) {
          localStorage.setItem(storageKey, 'true');
        } else {
          setIsOpen(true);
        }
      } catch {
        if (!localStorage.getItem(storageKey)) {
          setIsOpen(true);
        }
      }
    };

    checkStatus();
  }, [user]);

  const handleDismiss = async () => {
    const userId = user?.id || 'guest';
    const storageKey = `shiori.patchNotes.${userId}.${PATCH_NOTES_VERSION}`;
    localStorage.setItem(storageKey, 'true');
    setIsOpen(false);

    try {
      await fetchJson('/api/patch-notes/ack', {
        method: 'POST',
        body: JSON.stringify({ version: PATCH_NOTES_VERSION })
      });
    } catch {
      // Offline / network failure handled gracefully
    }
  };

  if (!isOpen) return null;

  const updates = [
    { text: 'Automatic GitHub task verification', icon: ShieldCheck },
    { text: 'Developer branch detection', icon: GitBranch },
    { text: 'Team branch setup', icon: GitBranch },
    { text: 'Task-aware Git commands', icon: Terminal },
    { text: 'Automatic task completion', icon: CheckSquare },
    { text: 'Deadline lifecycle improvements', icon: Sparkles },
    { text: 'GitHub reconnect notifications', icon: RefreshCw },
    { text: 'Improved account isolation', icon: ShieldCheck },
    { text: 'Cleaner Weekly Reports', icon: BarChart3 }
  ];

  return (
    <div className="fixed inset-0 z-[10002] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 font-sans select-none animate-fade-in">
      <div className="bg-eink-bg border-2 border-eink-border shadow-eink-card rounded-sm max-w-lg w-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-eink-border bg-eink-surface flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-abask font-bold text-xs uppercase tracking-widest text-eink-text">
                SHIORI
              </span>
              <span className="text-eink-border font-mono">/</span>
              <span className="font-mono text-[10px] text-eink-textMuted uppercase">
                v{PATCH_NOTES_VERSION}
              </span>
            </div>
            <h2 className="text-xl font-technical font-bold text-eink-text uppercase tracking-tight">
              WHAT'S NEW
            </h2>
            <p className="text-xs font-technical font-bold text-eink-textSecondary uppercase pt-0.5">
              GitHub &amp; Task Workflow Update
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-eink-textMuted hover:text-eink-text border border-transparent hover:border-eink-border rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feature List */}
        <div className="p-4 sm:p-5 space-y-3 font-technical text-xs">
          <div className="space-y-2">
            {updates.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex items-center gap-2.5 p-2 bg-eink-surface border border-eink-border rounded-sm">
                  <div className="w-4 h-4 rounded-xs bg-eink-bg border border-eink-border flex items-center justify-center text-eink-text shrink-0">
                    <Check className="w-3 h-3 text-emerald-700 font-bold" />
                  </div>
                  <span className="text-eink-text font-medium">{item.text}</span>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-eink-bg border border-eink-border rounded-sm text-[11px] text-eink-textSecondary font-sans leading-relaxed">
            Activity and Daily Journal have been streamlined into project/task activity.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-eink-border bg-eink-surface flex items-center justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full sm:w-auto px-6 py-2.5 bg-eink-text text-eink-bg rounded text-xs font-technical font-bold shadow-eink-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>GOT IT</span>
          </button>
        </div>
      </div>
    </div>
  );
};
