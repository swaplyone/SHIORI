import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Notification } from '../types';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { shioriAudio } from '../utils/shioriAudio';
import { reminderManager } from '../utils/reminderManager';

interface ToastNotice {
  id: string;
  type: 'BUILD_FAILED' | 'BUILD_PASSED' | 'BUILD_RECOVERED' | 'INFO';
  title: string;
  message: string;
  taskId?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  activeNotice: ToastNotice | null;
  triggerEInkRefresh: () => void;
  isRefreshing: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissNotice: () => void;
  fetchNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeNotice, setActiveNotice] = useState<ToastNotice | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const triggerEInkRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 350);
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      if (token && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        reminderManager.subscribeToWebPush(token);
      }
    }
  }, [isAuthenticated, token]);

  // Realtime events
  useEffect(() => {
    if (!socket) return;

    const handleCIUpdated = (data: any) => {
      triggerEInkRefresh();
      if (data.isRecovery) {
        setActiveNotice({
          id: Date.now().toString(),
          type: 'BUILD_RECOVERED',
          title: '✓ BUILD RECOVERED',
          message: `Fixed by commit ${data.commitHash}. All checks passed!`,
          taskId: data.taskId,
        });
      } else if (data.ciStatus === 'FAILED') {
        setActiveNotice({
          id: Date.now().toString(),
          type: 'BUILD_FAILED',
          title: '✕ BUILD FAILED',
          message: `CI failed (${data.testsFailed || 3} tests failed).`,
          taskId: data.taskId,
        });
      } else if (data.ciStatus === 'PASSED') {
        setActiveNotice({
          id: Date.now().toString(),
          type: 'BUILD_PASSED',
          title: '✓ BUILD PASSED',
          message: `Commit ${data.commitHash} passed all checks.`,
          taskId: data.taskId,
        });
      }
      fetchNotifications();
    };

    const handleNewNotification = (data: any) => {
      triggerEInkRefresh();
      shioriAudio.playSoftClick(0.15);
      fetchNotifications();

      if (data.title) {
        reminderManager.showNotification(data.title, {
          body: data.message || 'You have a new update in SHIORI.',
          tag: `shiori-notif-${data.id || Date.now()}`,
        });
      }
    };

    const handleTaskAssigned = (data: any) => {
      triggerEInkRefresh();
      shioriAudio.playSoftClick(0.18);
      fetchNotifications();

      setActiveNotice({
        id: Date.now().toString(),
        type: 'INFO',
        title: `📋 TASK ASSIGNED: ${data.taskCode || ''}`,
        message: `${data.assignerName || 'A teammate'} assigned "${data.title}" to you.`,
        taskId: data.taskId,
      });

      reminderManager.showNotification(`New Task Assigned: ${data.taskCode}`, {
        body: `${data.assignerName} assigned task "${data.title}" to you.`,
        tag: `shiori-assigned-${data.taskId}`,
      });
    };

    const handleInviteReceived = (data: any) => {
      triggerEInkRefresh();
      shioriAudio.playSoftClick(0.15);
      fetchNotifications();

      setActiveNotice({
        id: Date.now().toString(),
        type: 'INFO',
        title: `✉️ PROJECT INVITATION`,
        message: `${data.inviterName} invited you to join "${data.projectName}".`,
      });
    };

    socket.on('ci:updated', handleCIUpdated);
    socket.on('notification:new', handleNewNotification);
    socket.on('task:assigned', handleTaskAssigned);
    socket.on('project:invite_received', handleInviteReceived);
    socket.on('task:updated', () => {
      triggerEInkRefresh();
    });

    return () => {
      socket.off('ci:updated', handleCIUpdated);
      socket.off('notification:new', handleNewNotification);
      socket.off('task:assigned', handleTaskAssigned);
      socket.off('project:invite_received', handleInviteReceived);
      socket.off('task:updated');
    };
  }, [socket]);

  const markAsRead = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: 1 } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const dismissNotice = () => setActiveNotice(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        activeNotice,
        triggerEInkRefresh,
        isRefreshing,
        markAsRead,
        markAllAsRead,
        dismissNotice,
        fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider');
  return context;
};
