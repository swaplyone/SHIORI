// Shiori Calm Reminder & Real Web Push Notification System

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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

  public async subscribeToWebPush(token: string): Promise<boolean> {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return false;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg || !reg.pushManager) return false;

      // 1. Fetch public VAPID key from backend
      const keyRes = await fetch('/api/notifications/vapid-public-key');
      if (!keyRes.ok) return false;
      const { publicKey } = await keyRes.json();
      if (!publicKey) return false;

      // 2. Subscribe via PushManager
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource
        });
      }

      // 3. Register subscription with backend for locked-screen push
      const subJson = subscription.toJSON();
      if (subJson && subJson.endpoint && subJson.keys) {
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: subJson.keys
            }
          })
        });
      }

      return true;
    } catch (err) {
      console.warn('[PUSH SUBSCRIBE ERROR]', err);
      return false;
    }
  }

  public async showNotification(title: string, options?: NotificationOptions) {
    if (!this.isNotificationSupported() || Notification.permission !== 'granted') {
      return;
    }

    const payload: any = {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      ...options,
    };

    // 1. Try ServiceWorkerRegistration (Required for Android & iPhone iOS 16.4+ lock screen)
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

  private armTimer(reminder: ScheduledReminder) {
    const targetTime = new Date(reminder.reminderAt).getTime();
    const now = Date.now();
    const delay = targetTime - now;

    if (delay <= 0) {
      // Time already passed
      return;
    }

    const timerId = window.setTimeout(() => {
      this.showNotification(`Task Reminder: ${reminder.taskCode}`, {
        body: reminder.taskTitle,
        tag: `shiori-reminder-${reminder.taskId}`,
        requireInteraction: true,
      });

      // Clear from scheduled list once fired
      this.clearReminder(reminder.taskId);
    }, delay);

    this.activeTimers.set(reminder.taskId, timerId);
  }

  private rearmAll() {
    const now = Date.now();
    this.scheduledList = this.scheduledList.filter((r) => {
      const targetTime = new Date(r.reminderAt).getTime();
      return targetTime > now;
    });
    this.saveToStorage();

    this.scheduledList.forEach((reminder) => {
      this.armTimer(reminder);
    });
  }
}

export const reminderManager = new ReminderManager();
