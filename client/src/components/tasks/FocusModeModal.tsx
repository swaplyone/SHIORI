import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Check, X, CheckSquare, Square, Maximize2, Minimize2 } from 'lucide-react';
import { Task, Subtask } from '../../types';
import { useAuth } from '../../context/AuthContext';

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
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60); // 25 min default
  const [isActive, setIsActive] = useState(false);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loadingSubtasks, setLoadingSubtasks] = useState(false);

  useEffect(() => {
    if (isOpen && task && token) {
      setSecondsRemaining(25 * 60);
      setIsActive(false);
      setLoadingSubtasks(true);
      fetch(`/api/tasks/${task.id}/subtasks`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((r) => r.json())
        .then((data) => setSubtasks(data.subtasks || []))
        .catch((err) => console.error(err))
        .finally(() => setLoadingSubtasks(false));
    }
  }, [isOpen, task, token]);

  useEffect(() => {
    let interval: any = null;
    if (isActive && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => prev - 1);
      }, 1000);
    } else if (secondsRemaining === 0 && isActive) {
      setIsActive(false);
      // Play subtle chime or trigger notification
      window.dispatchEvent(
        new CustomEvent('shiori-inapp-reminder', {
          detail: {
            taskId: task?.id,
            taskCode: task?.task_code,
            taskTitle: 'Focus Session Completed!',
          },
        })
      );
    }
    return () => clearInterval(interval);
  }, [isActive, secondsRemaining, task]);

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
          className="px-3 py-1.5 border border-eink-border rounded-sm text-xs text-eink-textSecondary hover:text-eink-text hover:bg-eink-surface flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          <span>EXIT FOCUS</span>
        </button>
      </div>

      {/* Main Focus Card */}
      <div className="max-w-2xl mx-auto w-full text-center space-y-8 my-auto py-8">
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-eink-text tracking-tight font-sans">
            {task.title}
          </h1>
          {task.description && (
            <p className="text-xs sm:text-sm text-eink-textSecondary font-technical max-w-lg mx-auto line-clamp-3">
              {task.description}
            </p>
          )}
        </div>

        {/* Large Minimal Timer */}
        <div className="py-6">
          <div className="font-mono text-6xl sm:text-8xl font-bold tracking-tighter text-eink-text">
            {timeFormatted}
          </div>
          <div className="text-[11px] text-eink-textMuted uppercase tracking-widest mt-2">
            {isActive ? 'SESSION IN PROGRESS' : 'PAUSED'}
          </div>
        </div>

        {/* Timer Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setIsActive(!isActive)}
            className="px-6 py-2.5 bg-eink-text text-eink-bg font-bold rounded-sm shadow-eink-card flex items-center gap-2 text-xs hover:opacity-90 active:scale-95 transition-all"
          >
            {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isActive ? 'PAUSE' : 'START FOCUS'}</span>
          </button>

          <button
            onClick={() => {
              setIsActive(false);
              setSecondsRemaining(25 * 60);
            }}
            className="p-2.5 border border-eink-border rounded-sm text-eink-textSecondary hover:text-eink-text hover:bg-eink-surface active:scale-95"
            title="Reset timer to 25:00"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleCompleteTask}
            className="px-5 py-2.5 border border-eink-border bg-eink-surface text-eink-text font-bold rounded-sm flex items-center gap-2 text-xs hover:bg-eink-surfaceHover active:scale-95 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>COMPLETE TODO</span>
          </button>
        </div>

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
        Shiori Focus Mode · Single Task Clarity
      </div>
    </div>
  );
};
