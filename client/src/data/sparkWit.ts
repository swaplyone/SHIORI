/**
 * SPARK Wit Engine Types & Client Definitions
 * SHIORI Personality System
 */

export type SparkWitCategory =
  | 'GREETING'
  | 'SMALL_TALK'
  | 'SILLY_QUESTION'
  | 'OFF_TOPIC'
  | 'PROCRASTINATION'
  | 'OVERDUE_TASK'
  | 'TOO_MANY_TASKS'
  | 'TOO_MANY_PROJECTS'
  | 'CODING_FRUSTRATION'
  | 'GIT_PROBLEM'
  | 'FOCUS'
  | 'SUCCESS'
  | 'FAILURE'
  | 'ERROR'
  | 'COMPLIMENT'
  | 'INSULT'
  | 'CONFUSION'
  | 'MOTIVATION'
  | 'TASK_AVOIDANCE'
  | 'RANDOM'
  | 'GOODBYE';

export interface SafeWorkspaceContext {
  overdueCount?: number;
  dueTodayCount?: number;
  pendingCount?: number;
  completedTodayCount?: number;
  activeTask?: string;
  activeProject?: string;
  activeFocusMinutesRemaining?: number;
  projectCount?: number;
}

export interface SparkWitResponse {
  category: SparkWitCategory;
  displayText: string;
  speakText: string;
}

/**
 * Clean text for browser Speech Synthesis (strips emojis, markdown, and formatting)
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[*_~`#\[\]\(\)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
