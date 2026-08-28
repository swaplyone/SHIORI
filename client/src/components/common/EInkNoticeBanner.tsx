import React from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

interface EInkNoticeBannerProps {
  onViewTask?: (taskId: string) => void;
}

export const EInkNoticeBanner: React.FC<EInkNoticeBannerProps> = ({ onViewTask }) => {
  const { activeNotice, dismissNotice } = useNotifications();

  if (!activeNotice) return null;

  const isFailed = activeNotice.type === 'BUILD_FAILED';
  const isRecovered = activeNotice.type === 'BUILD_RECOVERED';

  return (
    <aside aria-label="Development Alert" className="w-full bg-eink-surface border-b border-eink-border px-4 py-3 font-sans transition-all animate-fade-in select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-7 h-7 rounded-sm flex items-center justify-center font-technical font-bold text-xs shrink-0 ${
              isFailed
                ? 'bg-eink-darkSurface text-eink-darkText'
                : isRecovered
                ? 'bg-eink-text text-eink-bg'
                : 'bg-eink-surface text-eink-text border border-eink-border'
            }`}
          >
            {isFailed ? '✕' : isRecovered ? '✓' : '○'}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-technical uppercase tracking-wider text-eink-textMuted font-bold">
                DEVELOPMENT NOTICE
              </span>
              <span className="font-technical font-bold text-xs text-eink-text">
                {activeNotice.title}
              </span>
            </div>
            <p className="text-xs text-eink-textSecondary mt-0.5 font-sans">
              {activeNotice.message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {activeNotice.taskId && (
            <button
              onClick={() => {
                if (onViewTask && activeNotice.taskId) {
                  onViewTask(activeNotice.taskId);
                }
              }}
              className="px-2.5 py-1 text-xs font-technical bg-eink-bg border border-eink-border hover:bg-eink-surfaceHover text-eink-text rounded-sm flex items-center gap-1.5 shadow-eink-sm"
            >
              <span>VIEW DETAILS</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={dismissNotice}
            className="p-1 text-eink-textMuted hover:text-eink-text border border-transparent hover:border-eink-border rounded"
            title="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
