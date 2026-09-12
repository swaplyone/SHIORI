import { Task } from '../types';

export type TodoLifecycleState =
  | 'COMPLETED_ON_TIME'
  | 'COMPLETED_LATE'
  | 'NEEDS_VERIFICATION'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_TOMORROW'
  | 'DUE_DATE'
  | 'PENDING';

export interface TaskLifecycleInfo {
  state: TodoLifecycleState;
  displayText: string;
  label: string;
  badgeClass: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isVerificationNeeded: boolean;
  daysLate?: number;
  daysOverdue?: number;
}

/**
 * Parses any date/deadline string safely in local timezone, supporting Date objects, timestamps, and ISO strings
 */
function parseDateSafe(dateVal?: string | Date | number | null): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal !== 'string') return null;
  const s = dateVal.trim();
  if (!s || s.toLowerCase() === 'today' || s.toLowerCase() === 'tomorrow' || s.toLowerCase() === 'next occurrence') {
    return null;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date into human friendly string (e.g., "Sep 12")
 */
function formatShortDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Centralized lifecycle status calculator for SHIORI TODOs
 */
export function getTodoLifecycleStatus(task: Task | any, now: Date = new Date()): TaskLifecycleInfo {
  const isDone = task.status === 'DONE' || task.user_status === 'COMPLETED';
  const isNeedsVerification = task.status === 'NEEDS_VERIFICATION';

  // 1. COMPLETED LIFECYCLE (Priority 1: NEVER show "Tomorrow" or deadline when completed)
  if (isDone) {
    const completedAtDate = parseDateSafe(task.completed_at) || parseDateSafe(task.updated_at) || now;
    const deadlineDate = parseDateSafe(task.deadline) || parseDateSafe(task.due_at) || parseDateSafe(task.due_date);
    const dateFormatted = formatShortDate(completedAtDate);

    if (deadlineDate) {
      // Calculate start of day for comparison
      const compDay = new Date(completedAtDate.getFullYear(), completedAtDate.getMonth(), completedAtDate.getDate()).getTime();
      const deadDay = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate()).getTime();
      const diffDays = Math.round((compDay - deadDay) / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        const text = `✓ Completed ${dateFormatted} · Completed ${diffDays} day${diffDays > 1 ? 's' : ''} late`;
        return {
          state: 'COMPLETED_LATE',
          displayText: text,
          label: text,
          badgeClass: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
          isCompleted: true,
          isOverdue: false,
          isVerificationNeeded: false,
          daysLate: diffDays
        };
      }
    }

    const completedText = `✓ Completed ${dateFormatted} · On time`;
    return {
      state: 'COMPLETED_ON_TIME',
      displayText: completedText,
      label: completedText,
      badgeClass: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400',
      isCompleted: true,
      isOverdue: false,
      isVerificationNeeded: false
    };
  }

  // 2. NEEDS VERIFICATION (Intermediate State)
  if (isNeedsVerification) {
    const score = task.dev_confidence_score || 75;
    const verifyText = `🟡 Verification Needed · ${score}% match`;
    return {
      state: 'NEEDS_VERIFICATION',
      displayText: verifyText,
      label: verifyText,
      badgeClass: 'text-amber-700 bg-amber-50 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      isCompleted: false,
      isOverdue: false,
      isVerificationNeeded: true
    };
  }

  // 3. PENDING / DEADLINE LIFECYCLE
  const rawDue = (task.due_date || '').trim();
  const deadlineDate = parseDateSafe(task.deadline) || parseDateSafe(task.due_at) || parseDateSafe(task.due_date);

  if (deadlineDate) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      const odText = `OVERDUE · ${overdueDays} day${overdueDays > 1 ? 's' : ''}`;
      return {
        state: 'OVERDUE',
        displayText: odText,
        label: odText,
        badgeClass: 'text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-400 font-semibold',
        isCompleted: false,
        isOverdue: true,
        isVerificationNeeded: false,
        daysOverdue: overdueDays
      };
    } else if (diffDays === 0) {
      return {
        state: 'DUE_TODAY',
        displayText: 'Due today',
        label: 'Due today',
        badgeClass: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
        isCompleted: false,
        isOverdue: false,
        isVerificationNeeded: false
      };
    } else if (diffDays === 1) {
      return {
        state: 'DUE_TOMORROW',
        displayText: 'Due tomorrow',
        label: 'Due tomorrow',
        badgeClass: 'text-stone-700 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
        isCompleted: false,
        isOverdue: false,
        isVerificationNeeded: false
      };
    } else {
      const formatted = formatShortDate(deadlineDate);
      const dtText = `Due ${formatted}`;
      return {
        state: 'DUE_DATE',
        displayText: dtText,
        label: dtText,
        badgeClass: 'text-stone-600 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
        isCompleted: false,
        isOverdue: false,
        isVerificationNeeded: false
      };
    }
  }

  // Fallback for custom string values
  if (rawDue.toLowerCase() === 'tomorrow') {
    return {
      state: 'DUE_TOMORROW',
      displayText: 'Due tomorrow',
      label: 'Due tomorrow',
      badgeClass: 'text-stone-700 bg-stone-100 dark:bg-stone-800 dark:text-stone-300',
      isCompleted: false,
      isOverdue: false,
      isVerificationNeeded: false
    };
  } else if (rawDue.toLowerCase() === 'today') {
    return {
      state: 'DUE_TODAY',
      displayText: 'Due today',
      label: 'Due today',
      badgeClass: 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300',
      isCompleted: false,
      isOverdue: false,
      isVerificationNeeded: false
    };
  }

  const pendingText = rawDue ? `Due ${rawDue}` : 'Pending';
  return {
    state: 'PENDING',
    displayText: pendingText,
    label: pendingText,
    badgeClass: 'text-stone-500 bg-stone-50 dark:bg-stone-800 dark:text-stone-400',
    isCompleted: false,
    isOverdue: false,
    isVerificationNeeded: false
  };
}
