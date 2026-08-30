import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Bell,
  CheckCircle2,
  XCircle,
  MessageSquare,
  UserCheck,
  Check,
  ShieldCheck,
  Send,
  Clock,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { reminderManager } from '../utils/reminderManager';
import { shioriAudio } from '../utils/shioriAudio';

export const NotificationsPage: React.FC = () => {
  const { notifications, markAsRead, markAllAsRead, triggerEInkRefresh } = useNotifications();
  const { openTaskModal } = useOutletContext<{ openTaskModal: (id: string) => void }>();
  const [permission, setPermission] = useState<string>(() => reminderManager.getPermission());
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [delayedCountdown, setDelayedCountdown] = useState<number | null>(null);

  useEffect(() => {
    setPermission(reminderManager.getPermission());
  }, []);

  const handleRequestPermission = async () => {
    const res = await reminderManager.requestPermission();
    setPermission(res);
    if (res === 'granted') {
      await reminderManager.showNotification('SHIORI Notifications Active 🔔', {
        body: 'Real phone notifications are active for task assignments and reminders.',
      });
      setTestStatus('✓ Notifications successfully enabled on your device!');
    } else {
      setTestStatus('✕ Notification permission was not granted.');
    }
  };

  const handleSendTestNotification = async (type: 'instant' | 'delayed' | 'task_assignment') => {
    if (permission !== 'granted') {
      const res = await reminderManager.requestPermission();
      setPermission(res);
      if (res !== 'granted') {
        setTestStatus('✕ Please allow browser notifications first.');
        return;
      }
    }

    if (type === 'instant') {
      shioriAudio.playFocusChime();
      triggerEInkRefresh();
      await reminderManager.showNotification('SHIORI Real Notification Test 🔔', {
        body: 'Real OS notification delivered to your lock screen & notification panel.',
        tag: `shiori-test-${Date.now()}`,
      });
      setTestStatus('✓ Test notification delivered to your device!');
      setTimeout(() => setTestStatus(null), 4000);
    } else if (type === 'delayed') {
      setDelayedCountdown(5);
      setTestStatus('⏱ Lock your phone now! Notification will pop up in 5 seconds...');
      
      let count = 5;
      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setDelayedCountdown(count);
        } else {
          clearInterval(interval);
          setDelayedCountdown(null);
          shioriAudio.playFocusChime();
          reminderManager.showNotification('SHIORI Lock Screen Alert ⏳', {
            body: 'Focus alert delivered to your locked phone screen!',
            tag: `shiori-delayed-${Date.now()}`,
          });
          setTestStatus('✓ 5-second test alert fired to lock screen!');
          setTimeout(() => setTestStatus(null), 4000);
        }
      }, 1000);
    } else if (type === 'task_assignment') {
      shioriAudio.playSoftClick(0.18);
      triggerEInkRefresh();
      await reminderManager.showNotification('New Task Assigned: SHR-0068', {
        body: 'Alex assigned task "Mobile Notification Verification" to you.',
        tag: `shiori-assigned-test-${Date.now()}`,
      });
      setTestStatus('✓ Simulated task assignment notification dispatched!');
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  return (
    <div className="space-y-6 select-none font-sans max-w-3xl pb-12">
      {/* Header */}
      <div className="border-b border-eink-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-technical text-xl sm:text-2xl font-bold tracking-tight text-eink-text uppercase">
            NOTIFICATIONS & NOTICES
          </h1>
          <p className="text-xs text-eink-textSecondary font-technical">
            Real device push alerts, development notices, and task assignments
          </p>
        </div>

        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllAsRead}
            className="px-3 py-1.5 border border-eink-border hover:bg-eink-surface text-xs font-technical font-bold text-eink-text rounded-sm cursor-pointer self-start sm:self-auto"
          >
            MARK ALL AS READ
          </button>
        )}
      </div>

      {/* Browser & OS Notification Diagnostic Panel */}
      <div className="p-4 bg-eink-surface border-2 border-eink-border rounded-sm space-y-3 font-technical text-xs shadow-eink-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-eink-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center font-bold text-xs shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-eink-text uppercase text-sm block">
                DEVICE NOTIFICATIONS DIAGNOSTIC
              </span>
              <span className="text-[11px] text-eink-textSecondary font-sans">
                Status:{' '}
                <strong className="font-mono text-eink-text font-bold uppercase">
                  {permission === 'granted'
                    ? 'Active / Allowed on Device ✓'
                    : permission === 'denied'
                    ? 'Blocked in Browser Settings ✕'
                    : 'Permission Pending (Click to Enable)'}
                </strong>
              </span>
            </div>
          </div>

          {permission !== 'granted' && permission !== 'unsupported' && (
            <button
              onClick={handleRequestPermission}
              className="px-3.5 py-2 bg-eink-text text-eink-bg font-bold rounded-sm text-xs shadow-eink-sm hover:opacity-90 active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>ENABLE PHONE ALERTS</span>
            </button>
          )}
        </div>

        {/* Test Notification Action Buttons */}
        <div className="space-y-2 pt-1">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider block">
            TEST REAL PHONE NOTIFICATIONS
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSendTestNotification('instant')}
              className="px-3 py-2 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-xs font-bold text-eink-text flex items-center gap-1.5 shadow-eink-sm hover:border-eink-text active:scale-95 transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>TEST NOTIFICATION (NOW)</span>
            </button>

            <button
              type="button"
              disabled={delayedCountdown !== null}
              onClick={() => handleSendTestNotification('delayed')}
              className="px-3 py-2 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-xs font-bold text-eink-text flex items-center gap-1.5 shadow-eink-sm hover:border-eink-text active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                {delayedCountdown !== null ? `ALERT IN ${delayedCountdown}S (LOCK PHONE!)` : '5S DELAYED TEST (LOCK PHONE)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSendTestNotification('task_assignment')}
              className="px-3 py-2 bg-eink-bg hover:bg-eink-surface border border-eink-border rounded-sm text-xs font-bold text-eink-text flex items-center gap-1.5 shadow-eink-sm hover:border-eink-text active:scale-95 transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>TEST TASK ASSIGNED ALERT</span>
            </button>
          </div>

          {testStatus && (
            <div className="p-2.5 bg-eink-bg border border-eink-text rounded-sm text-xs font-mono font-bold text-eink-text animate-fade-in flex items-center gap-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{testStatus}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notifications History List */}
      <div className="space-y-3 font-technical text-xs">
        {notifications.map((n) => {
          const isFailed = n.type === 'BUILD_FAILED';
          const isRecovered = n.type === 'BUILD_RECOVERED';
          const isReview = n.type === 'PR_REVIEW';
          const isAssignment = n.type === 'TASK_ASSIGNMENT';
          const isInvite = n.type === 'PROJECT_INVITATION';

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
                        : isAssignment
                        ? 'bg-eink-text text-eink-bg'
                        : isInvite
                        ? 'bg-eink-darkSurface text-eink-darkText'
                        : 'bg-eink-surface border border-eink-border text-eink-text'
                    }`}
                  >
                    {isFailed ? '✕' : isRecovered ? '✓' : isAssignment ? '📋' : isInvite ? '✉' : '→'}
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
            No notifications recorded yet. Use the test options above to verify real device notifications.
          </div>
        )}
      </div>
    </div>
  );
};
