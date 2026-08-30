// Shiori Calm Reminder & Notification System

export interface ScheduledReminder {
  taskId: string;
  taskTitle: string;
  taskCode: string;
  reminderAt: string;
}

class ReminderManager {
  private activeTimers: Map<string, number> = new Map();
  private scheduledList: ScheduledReminder[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem('shiori_scheduled_reminders');
      if (data) {
        this.scheduledList = JSON.parse(data);
        this.rearmAll();
      }
    } catch {}
  }

  private saveToStorage() {
    try {
      localStorage.setItem('shiori_scheduled_reminders', JSON.stringify(this.scheduledList));
    } catch {}
  }

  public isNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermission | 'unsupported' {
    if (!this.isNotificationSupported()) return 'unsupported';
    return Notification.permission;
  }

  public async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.isNotificationSupported()) return 'unsupported';
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch {
      return 'denied';
    }
  }

  public async showNotification(title: string, options?: NotificationOptions) {
    if (!this.isNotificationSupported() || Notification.permission !== 'granted') {
      return;
    }

    const payload: any = {
      icon: '/favicon-shiori.png',
      badge: '/favicon-shiori.png',
      vibrate: [200, 100, 200],
      ...options,
    };

    // 1. Try ServiceWorkerRegistration (Required for iPhone iOS 16.4+ lock screen & Android PWA)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, payload);
          return;
        }
      } catch (e) {
        console.warn('[NOTIF] SW notification fallback:', e);
      }
    }

    // 2. Fallback to standard window Notification constructor
    try {
      new Notification(title, payload);
    } catch (err) {
      console.warn('[NOTIF] Standard notification fallback:', err);
    }
  }

  public scheduleReminder(reminder: ScheduledReminder) {
    // Remove any existing timer for this task
    this.clearReminder(reminder.taskId);

    this.scheduledList = this.scheduledList.filter((r) => r.taskId !== reminder.taskId);
    this.scheduledList.push(reminder);
    this.saveToStorage();

    this.armTimer(reminder);
  }

  public clearReminder(taskId: string) {
    if (this.activeTimers.has(taskId)) {
      window.clearTimeout(this.activeTimers.get(taskId));
      this.activeTimers.delete(taskId);
    }
    this.scheduledList = this.scheduledList.filter((r) => r.taskId !== taskId);
    this.saveToStorage();
  }

  private rearmAll() {
    this.scheduledList.forEach((r) => this.armTimer(r));
  }

  private armTimer(reminder: ScheduledReminder) {
    const reminderTime = new Date(reminder.reminderAt).getTime();
    const now = Date.now();
    const delay = reminderTime - now;

    if (delay <= 0) {
      // Overdue or immediate
      return;
    }

    // Limit to 24-day max timeout delay
    if (delay > 2000000000) return;

    const timerId = window.setTimeout(() => {
      this.triggerReminder(reminder);
      this.clearReminder(reminder.taskId);
    }, delay);

    this.activeTimers.set(reminder.taskId, timerId);
  }

  private triggerReminder(reminder: ScheduledReminder) {
    const title = `Reminder: ${reminder.taskCode} ${reminder.taskTitle}`;
    const options: NotificationOptions = {
      body: 'Time to focus on this todo.',
      icon: '/favicon-shiori.png',
      badge: '/favicon-shiori.png',
      tag: `shiori-reminder-${reminder.taskId}`,
    };

    if (this.isNotificationSupported() && Notification.permission === 'granted') {
      try {
        new Notification(title, options);
      } catch (err) {
        console.warn('Native notification failed, falling back to in-app event', err);
      }
    }

    // Always dispatch in-app notification event for fallback and banner display
    window.dispatchEvent(
      new CustomEvent('shiori-inapp-reminder', {
        detail: {
          taskId: reminder.taskId,
          taskCode: reminder.taskCode,
          taskTitle: reminder.taskTitle,
        },
      })
    );
  }
}

export const reminderManager = new ReminderManager();
