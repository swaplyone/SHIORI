import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Bell, CheckCircle2, XCircle, MessageSquare, UserCheck, Check } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

export const NotificationsPage: React.FC = () => {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();

  return (
    <div className="space-y-6 select-none font-sans max-w-3xl">
      <div className="border-b border-eink-border pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-technical text-xl font-bold tracking-tight text-eink-text uppercase">
            NOTIFICATIONS & NOTICES
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Development notices, build failure alerts, and collaborator mentions
          </p>
        </div>

        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs font-technical font-bold text-eink-text rounded-sm"
          >
            MARK ALL AS READ
          </button>
        )}
      </div>

      <div className="space-y-3 font-technical text-xs">
        {notifications.map((n) => {
          const isFailed = n.type === 'BUILD_FAILED';
          const isRecovered = n.type === 'BUILD_RECOVERED';
          const isReview = n.type === 'PR_REVIEW';

          return (
            <div
              key={n.id}
              onClick={() => {
                if (!n.read) markAsRead(n.id);
                if (n.task_id) openTaskModal(n.task_id);
              }}
              className={`p-4 border rounded-sm cursor-pointer transition-all ${
                !n.read
                  ? 'bg-eink-surface border-eink-text shadow-eink-card'
                  : 'bg-eink-bg border-eink-border text-eink-textSecondary opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-sm flex items-center justify-center font-bold text-xs shrink-0 ${
                      isFailed
                        ? 'bg-eink-darkSurface text-eink-darkText'
                        : isRecovered
                        ? 'bg-eink-text text-eink-bg'
                        : 'bg-eink-surface border border-eink-border text-eink-text'
                    }`}
                  >
                    {isFailed ? '✕' : isRecovered ? '✓' : '→'}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-eink-text">{n.title}</span>
                      {n.task_code && (
                        <span className="px-1 py-0.2 bg-eink-surface border border-eink-border rounded text-[10px]">
                          {n.task_code}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-eink-textSecondary font-sans">{n.message}</p>
                    <span className="text-[10px] text-eink-textMuted block pt-1">{n.created_at}</span>
                  </div>
                </div>

                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-eink-text shrink-0 mt-1.5" />
                )}
              </div>
            </div>
          );
        })}

        {notifications.length === 0 && (
          <div className="p-12 text-center text-xs text-eink-textMuted border border-dashed border-eink-border rounded-sm">
            No notifications recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};
