import React, { useState } from 'react';
import {
  X,
  GitCommit,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  RotateCcw,
  ShieldCheck,
  Users,
  Clock,
  Sparkles,
  Building2,
  Activity
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { useMorphBar } from '../../context/MorphBarContext';

interface SimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const SimulatorDrawer: React.FC<SimulatorDrawerProps> = ({ isOpen, onClose, onRefreshData }) => {
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('fix: parser AST token bounds validation');
  const [branchName, setBranchName] = useState('feature/error-page');
  const { triggerEInkRefresh } = useNotifications();
  const { token } = useAuth();
  const { dispatchEvent, startFocusTimer, dismissCurrentEvent } = useMorphBar();

  if (!isOpen) return null;

  const handleSimulate = async (endpoint: string, payload: any, actionName: string) => {
    setLoading(true);
    setLastAction(null);
    try {
      const res = await fetch(`/api/simulator/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setLastAction(`✓ ${actionName}: ${data.message || data.notice || 'Dispatched successfully'}`);
      triggerEInkRefresh();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setLastAction(`✕ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-technical select-none">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative w-full max-w-md bg-eink-bg border-l border-eink-border shadow-2xl h-full flex flex-col justify-between p-5 z-10 overflow-y-auto">
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-eink-border">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-eink-text text-eink-bg flex items-center justify-center font-bold text-xs rounded-sm">
                ◉
              </div>
              <div>
                <h3 className="font-bold text-sm text-eink-text uppercase">MORPH BAR & DEV SIMULATOR</h3>
                <p className="text-[10px] text-eink-textMuted uppercase">Dynamic Island Interactive Sandbox</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 border border-eink-border rounded hover:bg-eink-surface">
              <X className="w-4 h-4" />
            </button>
          </div>

          {lastAction && (
            <div className="p-2.5 bg-eink-surface border border-eink-border text-xs text-eink-text rounded-sm animate-fade-in">
              {lastAction}
            </div>
          )}

          {/* Section 1: Interactive Morph Bar States */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-eink-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>1. MORPH BAR STATE TRIGGERS</span>
            </h4>
            <p className="text-[11px] text-eink-textSecondary">
              Click any state to watch the floating Morph Bar physically transform in realtime:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => {
                  startFocusTimer('Complete task implementation', 'SHIORI', 25);
                  setLastAction('✓ Morph Bar: Focus Session active (25m Pomodoro)');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Focus Timer</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent('GITHUB_COMMIT', {
                    message: 'feat: add JWT login and refresh token rotation',
                    branchName: 'main',
                    commitHash: 'c92fa01',
                    filesChanged: 4,
                    timeAgo: 'Just now',
                  });
                  setLastAction('✓ Morph Bar: GitHub Commit event');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <GitCommit className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Git Commit</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent('BUILD_ERROR', {
                    projectName: 'SHIORI',
                    branchName: 'main',
                    errorsCount: 3,
                    errors: [
                      'Undefined reference in AST parser',
                      'Macro bracket mismatch in lexer_nested_test.rs',
                      'Process exited with code 1',
                    ],
                    taskCode: 'TASK-042',
                  });
                  setLastAction('✓ Morph Bar: CI Build Error (Priority 100)');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Build Failed</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent(
                    'BUILD_SUCCESS',
                    { message: '✓ BUILD RECOVERED', branchName: 'main', filesChanged: 4 },
                    4000
                  );
                  setLastAction('✓ Morph Bar: Build Recovered');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Build Recovered</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent('CONNECTION_REQUEST', {
                    requestId: 'sim-req-01',
                    senderName: 'Rahul',
                    senderShioriId: 'SHI-8F42K',
                  });
                  setLastAction('✓ Morph Bar: Connection Request');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Connection Req</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent('OTP_VERIFICATION', {
                    sessionId: 'sim-otp-01',
                    otherUserName: 'Rahul',
                    otherShioriId: 'SHI-8F42K',
                    myCodeFormatted: '482 631',
                  });
                  setLastAction('✓ Morph Bar: OTP Verification');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Two-Sided OTP</span>
              </button>

              <button
                onClick={() => {
                  dispatchEvent('WORKSPACE_INVITATION', {
                    inviteId: 'sim-invite-01',
                    workspaceName: 'SHIORI COMPILER',
                    inviterName: 'Lijith',
                  });
                  setLastAction('✓ Morph Bar: Workspace Invitation');
                }}
                className="p-2 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border rounded-sm text-left flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Workspace Invite</span>
              </button>

              <button
                onClick={() => {
                  dismissCurrentEvent();
                  setLastAction('✓ Morph Bar reset to IDLE pill');
                }}
                className="p-2 bg-eink-bg hover:bg-eink-surface border border-dashed border-eink-border rounded-sm text-left flex items-center gap-2 text-eink-textMuted"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Reset to Idle</span>
              </button>
            </div>
          </div>

          {/* Section 2: Realtime Backend Webhooks */}
          <div className="space-y-3 pt-4 border-t border-eink-border">
            <h4 className="text-xs font-bold text-eink-textMuted uppercase tracking-wider">
              2. BACKEND WEBHOOK & CI DISPATCH
            </h4>
            <div className="space-y-2">
              <button
                disabled={loading}
                onClick={() =>
                  handleSimulate(
                    'ci-fail',
                    { repoName: 'swaply-one-compiler', branchName: 'feature/error-page', commitHash: 'a83f21c', testsFailed: 3 },
                    'Realtime CI Failure'
                  )
                }
                className="w-full py-2 px-3 bg-eink-darkSurface text-eink-darkText text-xs font-bold rounded-sm flex items-center justify-center gap-2 shadow-eink-sm"
              >
                <XCircle className="w-4 h-4" />
                <span>DISPATCH LIVE CI FAILURE (PORT 4000)</span>
              </button>

              <button
                disabled={loading}
                onClick={() =>
                  handleSimulate(
                    'ci-pass',
                    { repoName: 'swaply-one-compiler', branchName: 'feature/error-page', commitHash: 'a91d203' },
                    'Realtime CI Recovery'
                  )
                }
                className="w-full py-2 px-3 bg-eink-surface hover:bg-eink-surfaceHover border border-eink-border text-xs font-bold text-eink-text rounded-sm flex items-center justify-center gap-2 shadow-eink-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-eink-text" />
                <span>DISPATCH LIVE CI RECOVERY</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Reset */}
        <div className="pt-4 border-t border-eink-border">
          <button
            disabled={loading}
            onClick={() => handleSimulate('reset-demo', {}, 'Database Reset')}
            className="w-full py-2 px-3 border border-dashed border-eink-border hover:bg-eink-surface text-xs text-eink-textMuted hover:text-eink-text rounded-sm flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET DEMO DATABASE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
