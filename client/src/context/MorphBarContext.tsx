import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from './SocketContext';
import { reminderManager } from '../utils/reminderManager';
import { shioriAudio } from '../utils/shioriAudio';
import { iosLockScreenTimer } from '../utils/iosLockScreenTimer';

export type MorphBarStateType =
  | 'IDLE'
  | 'NAVIGATION'
  | 'FOCUS_TIMER'
  | 'GITHUB_COMMIT'
  | 'BUILD_ERROR'
  | 'BUILD_SUCCESS'
  | 'TASK_VERIFICATION'
  | 'CONNECTION_REQUEST'
  | 'OTP_VERIFICATION'
  | 'WORKSPACE_INVITATION';

export interface MorphBarEvent {
  id: string;
  type: MorphBarStateType;
  priority: number; // Higher number = higher priority
  title?: string;
  subtitle?: string;
  data?: any;
  autoCollapseMs?: number;
  timestamp: number;
}

// Priority scale
const PRIORITY_MAP: Record<MorphBarStateType, number> = {
  BUILD_ERROR: 100,
  OTP_VERIFICATION: 90,
  CONNECTION_REQUEST: 80,
  WORKSPACE_INVITATION: 70,
  BUILD_SUCCESS: 65,
  GITHUB_COMMIT: 60,
  TASK_VERIFICATION: 50,
  FOCUS_TIMER: 40,
  NAVIGATION: 20,
  IDLE: 10,
};

interface FocusTimerState {
  isActive: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  startTime: number;
  elapsedSeconds: number;
  taskTitle: string;
  projectName: string;
}

interface MorphBarContextType {
  currentEvent: MorphBarEvent;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  expandMorphBar: () => void;
  collapseMorphBar: () => void;
  toggleExpand: () => void;
  dispatchEvent: (type: MorphBarStateType, data?: any, autoCollapseMs?: number) => void;
  dismissCurrentEvent: () => void;
  barPosition: 'center' | 'top';
  setBarPosition: (pos: 'center' | 'top') => void;
  isBarVisible: boolean;
  setIsBarVisible: (visible: boolean) => void;
  focusTimer: FocusTimerState;
  startFocusTimer: (taskTitle?: string, projectName?: string, durationMinutes?: number) => void;
  adjustFocusTimer: (deltaMinutes: number) => void;
  setFocusTimerDuration: (durationMinutes: number) => void;
  pauseFocusTimer: () => void;
  resumeFocusTimer: () => void;
  stopFocusTimer: () => void;
}

const DEFAULT_IDLE_EVENT: MorphBarEvent = {
  id: 'idle',
  type: 'IDLE',
  priority: PRIORITY_MAP.IDLE,
  title: 'SHIORI',
  subtitle: 'Plan. Build. Verify.',
  timestamp: Date.now(),
};

const MorphBarContext = createContext<MorphBarContextType | undefined>(undefined);

export const MorphBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [eventQueue, setEventQueue] = useState<MorphBarEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<MorphBarEvent>(DEFAULT_IDLE_EVENT);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [barPosition, setBarPosition] = useState<'center' | 'top'>('top');
  const [isBarVisible, setIsBarVisible] = useState<boolean>(true);

  // Timestamp-based Focus Timer state
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>({
    isActive: false,
    isPaused: false,
    isCompleted: false,
    secondsRemaining: 25 * 60,
    totalSeconds: 25 * 60,
    startTime: 0,
    elapsedSeconds: 0,
    taskTitle: 'Focus Session',
    projectName: 'SHIORI',
  });

  const hasPlayedCompletionSoundRef = useRef<boolean>(false);
  const { socket } = useSocket();

  const dispatchEvent = useCallback(
    (type: MorphBarStateType, data?: any, autoCollapseMs?: number) => {
      const newEvent: MorphBarEvent = {
        id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type,
        priority: PRIORITY_MAP[type] || 10,
        data,
        autoCollapseMs,
        timestamp: Date.now(),
      };

      setEventQueue((prev) => {
        // Filter out duplicate identical pending types
        const filtered = prev.filter((e) => e.type !== type || e.type === 'FOCUS_TIMER');
        const nextQueue = [...filtered, newEvent].sort((a, b) => b.priority - a.priority);
        return nextQueue;
      });
    },
    []
  );

  const dismissCurrentEvent = useCallback(() => {
    setIsExpanded(false);
    setEventQueue((prev) => {
      if (prev.length <= 1) {
        setCurrentEvent(DEFAULT_IDLE_EVENT);
        return [];
      }
      const [, ...remaining] = prev;
      setCurrentEvent(remaining[0] || DEFAULT_IDLE_EVENT);
      return remaining;
    });
  }, []);

  // Sync highest priority event to currentEvent
  useEffect(() => {
    if (eventQueue.length > 0) {
      const topEvent = eventQueue[0];
      setCurrentEvent(topEvent);

      if (topEvent.autoCollapseMs && topEvent.autoCollapseMs > 0) {
        const timer = setTimeout(() => {
          dismissCurrentEvent();
        }, topEvent.autoCollapseMs);
        return () => clearTimeout(timer);
      }
    } else {
      if (focusTimer.isActive || focusTimer.isCompleted) {
        setCurrentEvent({
          id: 'focus-active',
          type: 'FOCUS_TIMER',
          priority: PRIORITY_MAP.FOCUS_TIMER,
          timestamp: Date.now(),
        });
      } else {
        setCurrentEvent(DEFAULT_IDLE_EVENT);
      }
    }
  }, [eventQueue, dismissCurrentEvent, focusTimer.isActive, focusTimer.isCompleted]);

  // Timestamp-based Countdown & Background/Lock-Screen Accuracy Sync
  useEffect(() => {
    if (!focusTimer.isActive || focusTimer.isPaused) {
      if (focusTimer.isPaused) {
        iosLockScreenTimer.update(
          focusTimer.secondsRemaining,
          focusTimer.totalSeconds,
          true,
          focusTimer.taskTitle,
          focusTimer.projectName
        );
      }
      return;
    }

    const updateTimerFromTimestamp = () => {
      setFocusTimer((prev) => {
        if (!prev.isActive || prev.isPaused) return prev;

        const currentSegmentSeconds = Math.max(0, Math.floor((Date.now() - prev.startTime) / 1000));
        const totalElapsed = prev.elapsedSeconds + currentSegmentSeconds;
        const remaining = Math.max(0, prev.totalSeconds - totalElapsed);

        iosLockScreenTimer.update(remaining, prev.totalSeconds, false, prev.taskTitle, prev.projectName);

        if (remaining === 0) {
          iosLockScreenTimer.stop();
          if (!hasPlayedCompletionSoundRef.current) {
            hasPlayedCompletionSoundRef.current = true;
            shioriAudio.playFocusChime();
            reminderManager.showNotification('SHIORI Focus Mode', {
              body: `Focus session complete: ${prev.taskTitle}`,
              tag: 'shiori-focus-complete',
            });
          }
          return {
            ...prev,
            isActive: false,
            isCompleted: true,
            secondsRemaining: 0,
          };
        }

        return {
          ...prev,
          secondsRemaining: remaining,
        };
      });
    };

    const interval = setInterval(updateTimerFromTimestamp, 500);

    const handleVisibility = () => {
      if (!document.hidden) {
        updateTimerFromTimestamp();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [focusTimer.isActive, focusTimer.isPaused]);

  // Start / pause / stop focus timer helpers with useCallback
  const startFocusTimer = useCallback(
    (
      taskTitle = 'Focus Session',
      projectName = 'SHIORI',
      durationMinutes = 25
    ) => {
      if (reminderManager.getPermission() === 'default') {
        reminderManager.requestPermission().catch(() => {});
      }

      hasPlayedCompletionSoundRef.current = false;
      const totalSec = Math.max(1, durationMinutes) * 60;

      setFocusTimer({
        isActive: true,
        isPaused: false,
        isCompleted: false,
        secondsRemaining: totalSec,
        totalSeconds: totalSec,
        startTime: Date.now(),
        elapsedSeconds: 0,
        taskTitle,
        projectName,
      });

      iosLockScreenTimer.start({
        taskTitle,
        projectName,
        secondsRemaining: totalSec,
        totalSeconds: totalSec,
        onPause: () => pauseFocusTimer(),
        onResume: () => resumeFocusTimer(),
        onStop: () => stopFocusTimer(),
      });

      dispatchEvent('FOCUS_TIMER', { taskTitle, projectName });
    },
    [dispatchEvent]
  );

  const adjustFocusTimer = useCallback((deltaMinutes: number) => {
    setFocusTimer((prev) => {
      const deltaSec = deltaMinutes * 60;
      const newTotal = Math.max(60, prev.totalSeconds + deltaSec);
      const newRemaining = Math.max(1, prev.secondsRemaining + deltaSec);
      iosLockScreenTimer.update(newRemaining, newTotal, prev.isPaused, prev.taskTitle, prev.projectName);
      return {
        ...prev,
        totalSeconds: newTotal,
        secondsRemaining: newRemaining,
      };
    });
  }, []);

  const setFocusTimerDuration = useCallback((durationMinutes: number) => {
    hasPlayedCompletionSoundRef.current = false;
    const totalSec = Math.max(1, durationMinutes) * 60;
    iosLockScreenTimer.update(totalSec, totalSec, false, focusTimer.taskTitle, focusTimer.projectName);
    setFocusTimer((prev) => ({
      ...prev,
      totalSeconds: totalSec,
      secondsRemaining: totalSec,
      elapsedSeconds: 0,
      startTime: Date.now(),
      isPaused: false,
      isCompleted: false,
    }));
  }, [focusTimer.taskTitle, focusTimer.projectName]);

  const pauseFocusTimer = useCallback(() => {
    setFocusTimer((prev) => {
      if (!prev.isActive || prev.isPaused) return prev;
      const currentSegment = Math.max(0, Math.floor((Date.now() - prev.startTime) / 1000));
      const totalElapsed = prev.elapsedSeconds + currentSegment;
      const remaining = Math.max(0, prev.totalSeconds - totalElapsed);
      iosLockScreenTimer.pause(remaining, prev.totalSeconds, prev.taskTitle, prev.projectName);
      return {
        ...prev,
        isPaused: true,
        elapsedSeconds: totalElapsed,
        secondsRemaining: remaining,
      };
    });
  }, []);

  const resumeFocusTimer = useCallback(() => {
    setFocusTimer((prev) => {
      if (!prev.isActive || !prev.isPaused) return prev;
      iosLockScreenTimer.resume(prev.secondsRemaining, prev.totalSeconds, prev.taskTitle, prev.projectName);
      return {
        ...prev,
        isPaused: false,
        startTime: Date.now(),
      };
    });
  }, []);

  const stopFocusTimer = useCallback(() => {
    hasPlayedCompletionSoundRef.current = false;
    iosLockScreenTimer.stop();
    setFocusTimer((prev) => ({
      ...prev,
      isActive: false,
      isPaused: false,
      isCompleted: false,
      secondsRemaining: prev.totalSeconds,
      elapsedSeconds: 0,
    }));
    dismissCurrentEvent();
  }, [dismissCurrentEvent]);

  // Stable expand/collapse callbacks
  const expandMorphBar = useCallback(() => setIsExpanded(true), []);
  const collapseMorphBar = useCallback(() => setIsExpanded(false), []);
  const toggleExpand = useCallback(() => setIsExpanded((prev) => !prev), []);

  // Listen to live Socket.IO events to automatically feed the Morph Bar
  useEffect(() => {
    if (!socket) return;

    const handleCiUpdated = (data: any) => {
      if (data.status === 'FAILED') {
        dispatchEvent(
          'BUILD_ERROR',
          {
            projectName: data.repoName || 'SHIORI',
            branchName: data.branchName || 'main',
            errorsCount: data.testsFailed || 3,
            errors: [
              'Undefined reference in AST parser',
              'Macro bracket mismatch in lexer_nested_test.rs',
              'Process exited with code 1',
            ],
            taskCode: data.taskCode || 'TASK-042',
          },
          0
        );
      } else if (data.status === 'PASSED' || data.isRecovered) {
        dispatchEvent(
          'BUILD_SUCCESS',
          {
            message: data.isRecovered ? '✓ BUILD RECOVERED' : '✓ CI PASSED',
            branchName: data.branchName || 'main',
            filesChanged: data.filesChanged || 4,
          },
          4000
        );
      }
    };

    const handleTaskUpdated = (data: any) => {
      dispatchEvent(
        'TASK_VERIFICATION',
        {
          title: data.title || 'Compiler error handling',
          taskCode: data.taskCode || 'TASK-042',
          latestCommit: 'a83f21c',
          filesChanged: 4,
          timeAgo: 'Just now',
        },
        5000
      );
    };

    const handleConnectionReq = (data: any) => {
      dispatchEvent(
        'CONNECTION_REQUEST',
        {
          requestId: data.requestId,
          senderName: data.senderName || 'Team Member',
          senderShioriId: data.senderShioriId || 'SHI-COLLAB',
        },
        0
      );
    };

    const handleVerificationReady = (data: any) => {
      dispatchEvent(
        'OTP_VERIFICATION',
        {
          sessionId: data.sessionId,
          requestId: data.requestId,
          otherUserName: data.otherUserName || 'Collaborator',
          otherShioriId: data.otherShioriId || 'SHI-COLLAB',
          myCodeFormatted: data.myCodeFormatted,
        },
        0
      );
    };

    const handleWorkspaceInvite = (data: any) => {
      dispatchEvent(
        'WORKSPACE_INVITATION',
        {
          inviteId: data.inviteId,
          workspaceName: data.workspaceName || 'SHIORI Workspace',
          inviterName: data.inviterName || 'Workspace Owner',
        },
        0
      );
    };

    socket.on('ci:updated', handleCiUpdated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('connection:request_received', handleConnectionReq);
    socket.on('connection:verification_ready', handleVerificationReady);
    socket.on('workspace:invite_received', handleWorkspaceInvite);

    return () => {
      socket.off('ci:updated', handleCiUpdated);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('connection:request_received', handleConnectionReq);
      socket.off('connection:verification_ready', handleVerificationReady);
      socket.off('workspace:invite_received', handleWorkspaceInvite);
    };
  }, [socket, dispatchEvent]);

  return (
    <MorphBarContext.Provider
      value={{
        currentEvent,
        isExpanded,
        setIsExpanded,
        expandMorphBar,
        collapseMorphBar,
        toggleExpand,
        dispatchEvent,
        dismissCurrentEvent,
        barPosition,
        setBarPosition,
        isBarVisible,
        setIsBarVisible,
        focusTimer,
        startFocusTimer,
        adjustFocusTimer,
        setFocusTimerDuration,
        pauseFocusTimer,
        resumeFocusTimer,
        stopFocusTimer,
      }}
    >
      {children}
    </MorphBarContext.Provider>
  );
};

export const useMorphBar = () => {
  const context = useContext(MorphBarContext);
  if (!context) {
    throw new Error('useMorphBar must be used within a MorphBarProvider');
  }
  return context;
};
