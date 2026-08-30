export type EInkTheme = 'light' | 'dark' | 'monochrome';
export type UIMode = 'eink_matte' | 'color_matte';
export type FontOption = 'geist' | 'inter' | 'plex_sans' | 'plex_mono' | 'serif' | 'abask';

export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type CIStatus = 'UNKNOWN' | 'RUNNING' | 'PASSED' | 'FAILED';

export interface User {
  id: string;
  shiori_id?: string;
  email: string;
  username: string;
  name: string;
  bio?: string;
  avatar_url?: string;
  theme?: EInkTheme;
  points?: number;
  github_connected?: number | boolean;
  github_username?: string;
}

export interface UserSettings {
  user_id: string;
  ui_mode?: UIMode;
  accent_color?: string;
  font_family?: FontOption;
  eink_refresh_effect?: number;
  sound_effects?: number;
  web_push_enabled?: number;
  privacy_github?: 'connections' | 'workspace' | 'private';
  privacy_tasks?: 'connections' | 'workspace' | 'private';
  privacy_projects?: 'workspace' | 'private';
  privacy_stats?: 'connections' | 'workspace' | 'private';
  notify_build_failed?: number;
  notify_build_passed?: number;
  notify_pr_review?: number;
  notify_task_assigned?: number;
}

export interface Connection {
  connectionId: string;
  userId: string;
  shioriId: string;
  name: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  connectedAt: string;
  stats?: {
    totalTasks: number;
    completedTasks: number;
    commitsToday: number;
    prsToday: number;
    activeTaskTitle: string;
    activeTaskCode: string;
    activeTaskCiStatus: CIStatus;
    lastActivity: string;
  };
}

export type FriendProgress = any;

export interface ConnectionRequest {
  id: string;
  status: 'REQUESTED' | 'ACCEPTED' | 'VERIFICATION_PENDING' | 'ACTIVE' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  created_at: string;
  sender_id?: string;
  recipient_id?: string;
  shiori_id: string;
  name: string;
  username: string;
  bio?: string;
  active_session_id?: string;
}

export interface VerificationSession {
  sessionId: string;
  requestId: string;
  status: 'VERIFICATION_PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
  expiresAt: string;
  myCodeFormatted: string;
  myCodeRaw: string;
  mySideVerified: boolean;
  otherSideVerified: boolean;
  myAttempts: number;
  maxAttempts: number;
  otherUser: {
    id: string;
    shioriId: string;
    name: string;
    username: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  creator_id: string;
  user_role?: string;
  members_count?: number;
  projects_count?: number;
  tasks_count?: number;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'PAUSED';
  github_repo_name?: string;
  github_repo_url?: string;
  default_branch: string;
  total_tasks?: number;
  completed_tasks?: number;
  in_progress_tasks?: number;
  review_tasks?: number;
  failed_ci_tasks?: number;
  members_count?: number;
  membersCount?: number;
  members?: any[];
}

export interface Task {
  id: string;
  task_number: number;
  task_code: string;
  project_id: string;
  workspace_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  user_status: string;
  assignment_status?: string;
  assignee_id?: string;
  assignee_name?: string;
  assignee_avatar?: string;
  created_by: string;
  creator_name?: string;
  due_date?: string;
  due_at?: string;
  reminder_at?: string;
  is_reminder_sent?: number | boolean;
  recurrence_rule?: string;
  parent_task_id?: string;
  tags?: string;
  is_archived?: number | boolean;
  archived_at?: string;
  is_deleted?: number | boolean;
  deleted_at?: string;
  
  // GitHub Linking
  github_repo?: string;
  github_branch?: string;
  github_pr_number?: number;
  github_pr_title?: string;
  github_pr_url?: string;
  github_pr_state?: 'OPEN' | 'MERGED' | 'CLOSED';
  github_ci_status?: CIStatus;
  github_last_commit_hash?: string;
  github_last_commit_msg?: string;
  github_last_commit_author?: string;
  github_last_commit_time?: string;

  // Development Evidence & Auto-Completion
  auto_completed?: number | boolean;
  auto_completed_reason?: string;
  completed_at?: string;
  dev_evidence_commits_count?: number;
  dev_evidence_prs_count?: number;
  dev_evidence_files_changed?: number;
  dev_evidence_checks_passed?: number;
  dev_evidence_checks_failed?: number;
  dev_evidence_pr_merged?: number | boolean;
  dev_confidence_score?: number;
  has_ci_discrepancy?: number | boolean;

  project_name?: string;
  project_slug?: string;
  subtasks_count?: number;
  subtasks_completed?: number;
  comments_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: number | boolean;
  position: number;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  username: string;
  user_avatar?: string;
  content: string;
  created_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id?: string;
  action_type: string;
  summary: string;
  details?: string;
  created_at: string;
}

export interface GitHubCommit {
  id: string;
  task_id?: string;
  repo_name: string;
  branch_name: string;
  commit_hash: string;
  message: string;
  author_name: string;
  files_changed: number;
  pushed_at: string;
}

export interface TaskCommit {
  id: string;
  task_id: string;
  commit_sha: string;
  commit_message: string;
  author: string;
  author_username?: string;
  author_avatar?: string;
  branch: string;
  files_changed: number;
  insertions: number;
  deletions: number;
  status: 'success' | 'failed' | 'warning';
  tests_status: 'passed' | 'failed' | 'not run';
  error_count: number;
  error_details?: string;
  warnings?: string;
  ai_source?: string;
  committed_at: string;
  created_at: string;
}

export interface GitHubWorkflowRun {
  id: string;
  task_id?: string;
  repo_name: string;
  branch_name: string;
  commit_hash: string;
  workflow_name: string;
  status: string;
  conclusion?: 'success' | 'failure' | 'cancelled' | null;
  duration_seconds: number;
  tests_total: number;
  tests_passed: number;
  tests_failed: number;
  logs?: string;
  started_at: string;
  completed_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  task_id?: string;
  task_code?: string;
  read: number | boolean;
  created_at: string;
}

export interface GlobalActivity {
  id: string;
  user_id: string;
  category: 'TASK' | 'COMMIT' | 'PR' | 'CI' | 'COLLAB';
  icon_symbol: string;
  title: string;
  meta_text?: string;
  task_code?: string;
  task_title?: string;
  project_name?: string;
  created_at: string;
}
