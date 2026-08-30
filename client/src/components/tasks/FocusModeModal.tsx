import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Check, X, CheckSquare, Square, Clock, Sparkles, Bell, Coffee, AlertCircle } from 'lucide-react';
import { Task, Subtask } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { shioriAudio } from '../../utils/shioriAudio';
import { reminderManager } from '../../utils/reminderManager';

interface FocusModeModalProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onTaskCompleted: (taskId: string) => void;
}

export const FocusModeModal: React.FC<FocusModeModalProps> = ({
  isOpen,
  task,
  onClose,
  onTaskCompleted,
}) => {
  const { token } = useAuth();
  const [selectedMinutes, setSelectedMinutes] = useState<number>(25);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasWarnedEnding, setHasWarnedEnding] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [customInputOpen, setCustomInputOpen] = useState(false);
  const [customInputVal, setCustomInputVal] = useState('10');

  const openedTaskIdRef = useRef<string | null>(null);
  const DURATION_PRESETS = [5, 15, 25, 45, 60];

  useEffect(() => {
    if (isOpen && task && token) {
      // Only reset timer state if this is a newly opened task
      if (openedTaskIdRef.current !== task.id) {
        openedTaskIdRef.current = task.id;
        setSelectedMinutes(25);
        setSecondsRemaining(25 * 60);
        setIsActive(false);
        setIsFinished(false);
        setHasWarnedEnding(false);
      }
      
      fetch(`/api/tasks/${task.id}/subtasks`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((r) => r.json())
        .then((data) => setSubtasks(data.subtasks || []))
        .catch((err) => console.error(err));
    } else if (!isOpen) {
      openedTaskIdRef.current = null;
      setIsActive(false);
    }
  }, [isOpen, task?.id, token]);

  const handleSelectDuration = (minutes: number) => {
    setSelectedMinutes(minutes);
    setSecondsRemaining(minutes * 60);
    setIsActive(false);
    setIsFinished(false);
    setHasWarnedEnding(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customInputVal, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 240) {
      handleSelectDuration(mins);
      setCustomInputOpen(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isActive && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          const nextSec = prev - 1;

          // Warning alert when 1 minute (or 30s for 5m timer) is remaining
          const warnThreshold = selectedMinutes <= 5 ? 30 : 60;
          if (nextSec === warnThreshold && !hasWarnedEnding && task) {
            setHasWarnedEnding(true);
            shioriAudio.playSoftClick(0.12);
            reminderManager.showNotification('Focus Session Ending Soon ⏳', {
              body: `${warnThreshold === 60 ? '1 minute' : '30 seconds'} left on ${task.task_code}: ${task.title}. Prepare to wrap up.`,
              tag: `shiori-focus-warning-${task.id}`,
            });
            window.dispatchEvent(
              new CustomEvent('shiori-inapp-reminder', {
                detail: {
                  taskId: task.id,
                  taskCode: task.task_code,
                  taskTitle: `Focus session ending in ${warnThreshold === 60 ? '1 minute' : '30 seconds'} ⏳`,
                },
              })
            );
          }

          return nextSec;
        });
      }, 1000);
    } else if (secondsRemaining === 0 && isActive) {
      setIsActive(false);
      setIsFinished(true);

      // 1. Play soothing Japanese focus chime
      shioriAudio.playFocusChime();

      // 2. Trigger native browser / PWA notification
      if (task) {
        reminderManager.showNotification('Focus Session Completed! 🔔', {
          body: `Completed ${selectedMinutes}m focus on ${task.task_code}: ${task.title}. Take a break or mark as complete.`,
          tag: `shiori-focus-completed-${task.id}`,
        });
      }

      // 3. Dispatch in-app notification event for fallback and banner display
      window.dispatchEvent(
        new CustomEvent('shiori-inapp-reminder', {
          detail: {
            taskId: task?.id,
            taskCode: task?.task_code,
            taskTitle: `Focus Session Completed (${selectedMinutes} min)`,
          },
        })
      );
    }
    return () => clearInterval(interval);
  }, [isActive, secondsRemaining, task, selectedMinutes, hasWarnedEnding]);

  if (!isOpen || !task) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const toggleSubtask = async (sub: Subtask) => {
    if (!token) return;
    const newCompleted = !Boolean(sub.completed);
    setSubtasks((prev) =>
      prev.map((s) => (s.id === sub.id ? { ...s, completed: newCompleted ? 1 : 0 } : s))
    );
    try {
      await fetch(`/api/tasks/${task.id}/subtasks/${sub.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ completed: newCompleted }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteTask = () => {
    onTaskCompleted(task.id);
    onClose();
  };

  const handleStartBreak = () => {
    setSelectedMinutes(5);
    setSecondsRemaining(5 * 60);
    setIsFinished(false);
    setIsActive(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-eink-bg flex flex-col justify-between p-6 sm:p-12 select-none font-technical animate-fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-eink-border pb-4 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 bg-eink-darkSurface text-eink-darkText font-mono font-bold text-xs rounded-sm">
            {task.task_code}
          </span>
          <span className="text-xs text-eink-textMuted uppercase font-bold tracking-widest">
            FOCUS SESSION
          </span>
        </div>

        <button
          onClick={onClose}
          className="px-3 py-1.5 border border-eink-border rounded-sm text-xs text-eink-textSecondary hover:text-eink-text hover:bg-eink-surface flex items-center gap-1.5 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>EXIT FOCUS</span>
        </button>
      </div>

      {/* Main Focus Card */}
      <div className="max-w-2xl mx-auto w-full text-center space-y-6 my-auto py-4">
        {/* Task Title & Specs */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-eink-text tracking-tight font-sans">
            {task.title}
          </h1>
          {task.description && (
            <p className="text-xs sm:text-sm text-eink-textSecondary font-technical max-w-lg mx-auto line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        {/* Duration Preset Selector Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <span className="text-[10px] text-eink-textMuted uppercase font-bold tracking-wider mr-1">
            DURATION:
          </span>
          {DURATION_PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => handleSelectDuration(m)}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-sm border transition-all cursor-pointer ${
                selectedMinutes === m && !customInputOpen
                  ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface shadow-eink-sm'
                  : 'bg-eink-surface text-eink-text border-eink-border hover:bg-eink-surfaceHover'
              }`}
            >
              {m} MIN
            </button>
          ))}
          <button
            onClick={() => setCustomInputOpen(!customInputOpen)}
            className={`px-2.5 py-1 text-xs font-mono rounded-sm border transition-all cursor-pointer ${
              customInputOpen
                ? 'bg-eink-darkSurface text-eink-darkText border-eink-darkSurface'
                : 'bg-eink-surface text-eink-textSecondary border-eink-border hover:bg-eink-surfaceHover'
            }`}
          >
            CUSTOM...
          </button>
        </div>

        {/* Custom duration input */}
        {customInputOpen && (
          <form onSubmit={handleCustomSubmit} className="flex items-center justify-center gap-2 max-w-xs mx-auto animate-fade-in">
            <input
              type="number"
              min="1"
              max="240"
              value={customInputVal}
              onChange={(e) => setCustomInputVal(e.target.value)}
              placeholder="Minutes..."
              className="w-24 px-2.5 py-1 bg-eink-surface border border-eink-border rounded-sm text-xs font-mono text-center outline-none text-eink-text"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1 bg-eink-text text-eink-bg text-xs font-bold rounded-sm shadow-eink-sm"
            >
              SET
            </button>
          </form>
        )}

        {/* Large Minimal Timer */}
        <div className="py-4">
          {isFinished ? (
            <div className="space-y-2 p-6 bg-eink-surface border-2 border-eink-text rounded-sm animate-fade-in max-w-md mx-auto">
              <div className="flex items-center justify-center gap-2 text-eink-text font-bold text-sm uppercase tracking-wider">
                <Bell className="w-4 h-4 animate-bounce" />
                <span>SESSION COMPLETED!</span>
              </div>
              <p className="text-xs text-eink-textSecondary font-sans">
                {selectedMinutes} minutes focused on {task.task_code}. Great work!
              </p>
              <div className="flex items-center justify-center gap-2 pt-3">
                <button
                  onClick={handleStartBreak}
                  className="px-3.5 py-1.5 bg-eink-surface border border-eink-border rounded-sm text-xs font-bold text-eink-text flex items-center gap-1.5 hover:bg-eink-surfaceHover cursor-pointer"
                >
                  <Coffee className="w-3.5 h-3.5" />
                  <span>5M BREAK</span>
                </button>
                <button
                  onClick={() => handleSelectDuration(selectedMinutes)}
                  className="px-3.5 py-1.5 border border-eink-border rounded-sm text-xs font-bold text-eink-text hover:bg-eink-surface cursor-pointer"
                >
                  RESTART
                </button>
                <button
                  onClick={handleCompleteTask}
                  className="px-3.5 py-1.5 bg-eink-text text-eink-bg rounded-sm text-xs font-bold flex items-center gap-1.5 shadow-eink-sm hover:opacity-90 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>DONE</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="font-mono text-6xl sm:text-8xl font-bold tracking-tighter text-eink-text">
                {timeFormatted}
              </div>
              <div className="text-[11px] text-eink-textMuted uppercase tracking-widest mt-2 flex items-center justify-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>{isActive ? `FOCUSING (${selectedMinutes} MIN)` : 'READY TO START'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Timer Controls */}
        {!isFinished && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setIsActive(!isActive)}
              className="px-6 py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-card flex items-center gap-2 text-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isActive ? 'PAUSE' : `START ${selectedMinutes}M FOCUS`}</span>
            </button>

            <button
              onClick={() => {
                setIsActive(false);
                setSecondsRemaining(selectedMinutes * 60);
              }}
              className="p-2.5 border border-eink-border rounded-sm text-eink-textSecondary hover:text-eink-text hover:bg-eink-surface active:scale-95 cursor-pointer"
              title={`Reset timer to ${selectedMinutes}:00`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handleCompleteTask}
              className="px-5 py-2.5 border border-eink-border bg-eink-surface text-eink-text font-bold rounded-sm flex items-center gap-2 text-xs hover:bg-eink-surfaceHover active:scale-95 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>COMPLETE TODO</span>
            </button>
          </div>
        )}

        {/* Subtasks Checklist */}
        {subtasks.length > 0 && (
          <div className="max-w-md mx-auto text-left pt-6 border-t border-eink-border/70 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-eink-textMuted flex items-center justify-between">
              <span>SUBTASKS</span>
              <span>
                {subtasks.filter((s) => Boolean(s.completed)).length} / {subtasks.length}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {subtasks.map((sub) => {
                const isDone = Boolean(sub.completed);
                return (
                  <div
                    key={sub.id}
                    onClick={() => toggleSubtask(sub)}
                    className="p-2 bg-eink-surface border border-eink-border rounded-sm flex items-center gap-2.5 cursor-pointer hover:bg-eink-surfaceHover"
                  >
                    {isDone ? (
                      <CheckSquare className="w-3.5 h-3.5 text-eink-text shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-eink-textMuted shrink-0" />
                    )}
                    <span className={`truncate ${isDone ? 'line-through text-eink-textMuted' : 'text-eink-text'}`}>
                      {sub.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Minimal Status */}
      <div className="text-center text-[10px] text-eink-textMuted uppercase tracking-widest">
        Shiori Focus Mode · Single Task Clarity · Notification alert on complete
      </div>
    </div>
  );
};
