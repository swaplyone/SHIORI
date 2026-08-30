import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  CheckSquare,
  Square,
  AlertCircle
} from 'lucide-react';
import { Task } from '../../types';

interface TaskCalendarViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onToggleStatus: (task: Task, e: React.MouseEvent) => void;
}

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({
  tasks,
  onSelectTask,
  onToggleStatus,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const todayMonth = () => {
    setCurrentDate(new Date());
  };

  // Calendar math
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const formatDateKey = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Helper to extract or match date for a task:
  // - Completed tasks -> calendar date is actual completion date (completed_at)
  // - Incomplete tasks -> calendar date is planned due date (due_at / due_date)
  const getTaskDateKey = (task: Task): string | null => {
    const isCompleted = task.status === 'DONE' || task.user_status === 'COMPLETED';

    if (isCompleted) {
      if (task.completed_at) {
        try {
          const d = new Date(task.completed_at);
          if (!isNaN(d.getTime())) {
            return formatDateKey(d);
          }
        } catch {}
      }
      // Fallback for completed task without explicit completed_at timestamp
      if (task.updated_at) {
        try {
          const d = new Date(task.updated_at);
          if (!isNaN(d.getTime())) {
            return formatDateKey(d);
          }
        } catch {}
      }
    }

    // Planned / Incomplete task -> use due_at or due_date
    if (task.due_at) {
      try {
        const d = new Date(task.due_at);
        if (!isNaN(d.getTime())) {
          return formatDateKey(d);
        }
      } catch {}
    }

    if (task.due_date) {
      const lower = task.due_date.toLowerCase().trim();
      const today = new Date();

      if (lower.includes('today')) {
        return formatDateKey(today);
      }
      if (lower.includes('tomorrow')) {
        const tmrw = new Date(today);
        tmrw.setDate(today.getDate() + 1);
        return formatDateKey(tmrw);
      }
      if (lower.includes('yesterday')) {
        const yest = new Date(today);
        yest.setDate(today.getDate() - 1);
        return formatDateKey(yest);
      }
      if (lower.includes('this friday') || lower.includes('friday')) {
        const d = new Date(today);
        const day = d.getDay();
        const diff = (5 - day + 7) % 7;
        d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
        return formatDateKey(d);
      }
      if (lower.includes('next week')) {
        const d = new Date(today);
        d.setDate(d.getDate() + 7);
        return formatDateKey(d);
      }

      // Check if it's already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)) {
        return task.due_date;
      }

      // Try generic Date.parse
      try {
        const d = new Date(task.due_date);
        if (!isNaN(d.getTime())) {
          return formatDateKey(d);
        }
      } catch {}
    }

    return null;
  };

  // Map tasks to date keys
  const tasksByDate: Record<string, Task[]> = {};
  const unscheduledTasks: Task[] = [];

  tasks.forEach((task) => {
    const key = getTaskDateKey(task);
    if (key) {
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(task);
    } else {
      unscheduledTasks.push(task);
    }
  });

  const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="space-y-6 font-technical select-none animate-fade-in">
      {/* Calendar Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-eink-border pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm sm:text-base font-bold text-eink-text uppercase tracking-wider flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            <span>{monthNames[month]} {year}</span>
          </h2>
          <button
            onClick={todayMonth}
            className="px-2 py-0.5 border border-eink-border rounded-sm text-[10px] font-bold text-eink-textSecondary hover:text-eink-text hover:bg-eink-surface"
          >
            TODAY
          </button>
        </div>

        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button
            onClick={prevMonth}
            className="p-1.5 border border-eink-border rounded-sm hover:bg-eink-surface text-eink-text"
            title="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 border border-eink-border rounded-sm hover:bg-eink-surface text-eink-text"
            title="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Desktop Month Grid */}
      <div className="hidden md:block border border-eink-border rounded-sm overflow-hidden bg-eink-surface shadow-eink-card">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-eink-border bg-eink-bg text-center py-2 text-[10px] font-bold text-eink-textMuted uppercase tracking-wider">
          {daysOfWeek.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Days Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-eink-border">
          {/* Empty prefix cells */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] p-1.5 bg-eink-bg/40" />
          ))}

          {/* Actual days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayTasks = tasksByDate[dateKey] || [];
            const isToday =
              new Date().getFullYear() === year &&
              new Date().getMonth() === month &&
              new Date().getDate() === dayNum;

            return (
              <div
                key={dateKey}
                className={`min-h-[110px] p-2 flex flex-col justify-between transition-colors ${
                  isToday ? 'bg-eink-bg/80 ring-1 ring-inset ring-eink-text' : 'hover:bg-eink-surfaceHover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold font-mono ${
                      isToday
                        ? 'w-5 h-5 bg-eink-text text-eink-bg rounded-sm flex items-center justify-center'
                        : 'text-eink-text'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[10px] text-eink-textMuted font-mono">
                      {dayTasks.length} TODO
                    </span>
                  )}
                </div>

                {/* Day Tasks List */}
                <div className="space-y-1 mt-1.5 overflow-y-auto max-h-[80px]">
                  {dayTasks.map((task) => {
                    const isDone = task.status === 'DONE';
                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task)}
                        className={`px-1.5 py-1 border border-eink-border rounded-sm text-[10px] cursor-pointer flex items-center gap-1.5 hover:bg-eink-surface ${
                          isDone ? 'opacity-50 line-through bg-eink-bg' : 'bg-eink-bg text-eink-text font-medium'
                        }`}
                      >
                        <span className="font-mono text-[9px] text-eink-textMuted shrink-0">
                          {task.task_code}
                        </span>
                        <span className="truncate flex-1">{task.title}</span>
                        {task.recurrence_rule && (
                          <Repeat className="w-2.5 h-2.5 text-eink-textMuted shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile Agenda / Timeline View */}
      <div className="md:hidden space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-eink-textMuted border-b border-eink-border pb-1">
          AGENDA & TIMELINE
        </h3>

        {Object.keys(tasksByDate).length === 0 && (
          <div className="p-8 text-center text-xs text-eink-textMuted border border-eink-border rounded-sm bg-eink-surface">
            No upcoming scheduled tasks this month.
          </div>
        )}

        {Object.entries(tasksByDate).map(([dateKey, dayTasks]) => (
          <div key={dateKey} className="border border-eink-border rounded-sm bg-eink-surface p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-eink-border/60 pb-1 text-xs font-bold text-eink-text">
              <span>{dateKey}</span>
              <span className="text-[10px] text-eink-textMuted">{dayTasks.length} tasks</span>
            </div>
            <div className="space-y-1.5">
              {dayTasks.map((task) => {
                const isDone = task.status === 'DONE';
                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="p-2 bg-eink-bg border border-eink-border rounded-sm flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={(e) => onToggleStatus(task, e)}
                        className="p-0.5 text-eink-text shrink-0"
                      >
                        {isDone ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-eink-textMuted" />}
                      </button>
                      <span className="font-mono text-[10px] font-bold text-eink-textMuted">
                        {task.task_code}
                      </span>
                      <span className={`truncate ${isDone ? 'line-through text-eink-textMuted' : 'text-eink-text'}`}>
                        {task.title}
                      </span>
                    </div>
                    {task.recurrence_rule && (
                      <span className="text-[10px] text-eink-textMuted flex items-center gap-1 shrink-0">
                        <Repeat className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
