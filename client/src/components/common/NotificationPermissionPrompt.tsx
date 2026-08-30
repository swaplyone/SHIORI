import React, { useState, useEffect } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { reminderManager } from '../../utils/reminderManager';

export const NotificationPermissionPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    // Check if notifications are supported and in 'default' unprompted state
    if (!reminderManager.isNotificationSupported()) return;

    const currentPermission = reminderManager.getPermission();
    const isDismissed = localStorage.getItem('shiori_notifications_prompt_dismissed');

    if (currentPermission === 'default' && !isDismissed) {
      // Delay slightly (1.5s) so the user experiences the calm opening first
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleEnable = async () => {
    const result = await reminderManager.requestPermission();
    if (result === 'granted') {
      setGranted(true);
      reminderManager.showNotification('SHIORI Notifications Enabled', {
        body: 'You will receive calm reminders for scheduled tasks and development alerts.',
      });
      setTimeout(() => {
        setShowPrompt(false);
      }, 1500);
    } else {
      setShowPrompt(false);
    }
    localStorage.setItem('shiori_notifications_prompt_dismissed', 'true');
  };

  const handleDismiss = () => {
    localStorage.setItem('shiori_notifications_prompt_dismissed', 'true');
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-16 md:bottom-6 left-4 md:left-6 z-40 max-w-sm w-[calc(100vw-2rem)] bg-eink-bg border-2 border-eink-border shadow-2xl p-4 rounded-sm font-technical select-none animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-eink-text text-eink-bg flex items-center justify-center font-bold text-xs rounded-sm">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <h4 className="font-bold text-xs uppercase text-eink-text tracking-wider">
            ENABLE NOTIFICATIONS
          </h4>
        </div>
        <button
          onClick={handleDismiss}
          className="text-eink-textMuted hover:text-eink-text p-0.5"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2 text-xs text-eink-textSecondary space-y-1 font-sans">
        <p className="font-medium text-eink-text">Stay on top of your development tasks.</p>
        <p className="text-[11px] text-eink-textMuted leading-relaxed">
          Allow Shiori to send quiet alerts for scheduled todo reminders, focus timers, and CI build verification.
        </p>
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        {granted ? (
          <div className="flex-1 py-1.5 px-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>NOTIFICATIONS ENABLED</span>
          </div>
        ) : (
          <>
            <button
              onClick={handleEnable}
              className="flex-1 py-1.5 px-3 bg-eink-text text-eink-bg text-xs font-bold rounded-sm flex items-center justify-center gap-1.5 shadow-eink-sm hover:opacity-90 active:scale-[0.99] cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>ALLOW NOTIFICATIONS</span>
            </button>
            <button
              onClick={handleDismiss}
              className="py-1.5 px-3 border border-eink-border text-xs text-eink-textMuted hover:text-eink-text rounded-sm cursor-pointer"
            >
              LATER
            </button>
          </>
        )}
      </div>
    </div>
  );
};
