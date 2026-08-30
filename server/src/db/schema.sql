-- SHIORI Database Schema - Core To-Do, Auto-Completion, Points & Intentional Connections

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  shiori_id TEXT UNIQUE NOT NULL, -- e.g. 'SHI-3A91M', 'SHI-8F42K'
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  theme TEXT DEFAULT 'light',
  points INTEGER DEFAULT 120, -- SHIORI Points earned through GitHub work
  github_connected INTEGER DEFAULT 0,
  github_username TEXT,
  github_avatar TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  eink_refresh_effect INTEGER DEFAULT 1,
  sound_effects INTEGER DEFAULT 0,
  web_push_enabled INTEGER DEFAULT 0,
  privacy_github TEXT DEFAULT 'connections',
  privacy_tasks TEXT DEFAULT 'connections',
  privacy_projects TEXT DEFAULT 'workspace',
  privacy_stats TEXT DEFAULT 'private',
  notify_build_failed INTEGER DEFAULT 1,
  notify_build_passed INTEGER DEFAULT 1,
  notify_pr_review INTEGER DEFAULT 1,
  notify_task_assigned INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Connections (Intentional, Verified Connections)
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL,
  user_b_id TEXT NOT NULL,
  connected_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_a_id, user_b_id),
  FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Connection Requests
CREATE TABLE IF NOT EXISTS connection_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT DEFAULT 'REQUESTED', -- 'REQUESTED', 'ACCEPTED', 'VERIFICATION_PENDING', 'ACTIVE', 'DECLINED', 'CANCELLED', 'EXPIRED'
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+7 days')),
  responded_at TEXT,
  UNIQUE (sender_id, recipient_id),
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Two-Sided OTP Connection Verification Sessions with SMTP Email delivery
CREATE TABLE IF NOT EXISTS connection_verification_sessions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_a_id TEXT NOT NULL,
  user_b_id TEXT NOT NULL,
  otp_a_hash TEXT NOT NULL,
  otp_b_hash TEXT NOT NULL,
  otp_a_plain TEXT NOT NULL, -- accessible only by User A in authenticated session
  otp_b_plain TEXT NOT NULL, -- accessible only by User B in authenticated session
  verified_a INTEGER DEFAULT 0,
  verified_b INTEGER DEFAULT 0,
  attempts_a INTEGER DEFAULT 0,
  attempts_b INTEGER DEFAULT 0,
  status TEXT DEFAULT 'VERIFICATION_PENDING', -- 'VERIFICATION_PENDING', 'VERIFIED', 'EXPIRED', 'FAILED'
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (request_id) REFERENCES connection_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Blocks
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  creator_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'ACTIVE',
  UNIQUE (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT DEFAULT (datetime('now', '+7 days')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_verification_sessions (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  otp_inviter_hash TEXT NOT NULL,
  otp_invitee_hash TEXT NOT NULL,
  otp_inviter_plain TEXT NOT NULL,
  otp_invitee_plain TEXT NOT NULL,
  verified_inviter INTEGER DEFAULT 0,
  verified_invitee INTEGER DEFAULT 0,
  attempts_inviter INTEGER DEFAULT 0,
  attempts_invitee INTEGER DEFAULT 0,
  status TEXT DEFAULT 'VERIFICATION_PENDING',
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (invitation_id) REFERENCES workspace_invitations(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'ACTIVE',
  github_repo_name TEXT,
  github_repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_invitations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'PENDING',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (project_id, invitee_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Core To-Do / Task Model with Automatic Completion & GitHub Linking
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task_number INTEGER NOT NULL,
  task_code TEXT UNIQUE NOT NULL,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TODO', -- 'TODO', 'IN_PROGRESS', 'DONE'
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  user_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'COMPLETED'
  assignee_id TEXT,
  created_by TEXT NOT NULL,
  due_date TEXT,
  
  -- GitHub Linking
  github_repo TEXT,
  github_branch TEXT,
  github_pr_number INTEGER,
  github_pr_title TEXT,
  github_pr_url TEXT,
  github_pr_state TEXT,
  github_ci_status TEXT DEFAULT 'UNKNOWN',
  github_last_commit_hash TEXT,
  github_last_commit_msg TEXT,
  github_last_commit_author TEXT,
  github_last_commit_time TEXT,
  
  -- Automatic Completion Engine
  auto_completed INTEGER DEFAULT 0,
  auto_completed_reason TEXT,
  completed_at TEXT,
  
  -- Development Evidence
  dev_evidence_commits_count INTEGER DEFAULT 0,
  dev_evidence_prs_count INTEGER DEFAULT 0,
  dev_evidence_files_changed INTEGER DEFAULT 0,
  dev_evidence_checks_passed INTEGER DEFAULT 0,
  dev_evidence_checks_failed INTEGER DEFAULT 0,
  dev_evidence_pr_merged INTEGER DEFAULT 0,
  dev_confidence_score INTEGER DEFAULT 0,
  has_ci_discrepancy INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_activity (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- GitHub Events & Abuse Prevention Table
CREATE TABLE IF NOT EXISTS github_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  repository TEXT NOT NULL,
  event_id TEXT UNIQUE, -- Unique GitHub event delivery ID to prevent point replay abuse
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  files_changed INTEGER DEFAULT 1,
  points_awarded INTEGER DEFAULT 10,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  github_id TEXT,
  username TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT,
  connected_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_commits (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  repo_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  message TEXT NOT NULL,
  author_name TEXT NOT NULL,
  files_changed INTEGER DEFAULT 1,
  pushed_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS github_workflow_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  repo_name TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL,
  conclusion TEXT,
  duration_seconds INTEGER DEFAULT 0,
  tests_total INTEGER DEFAULT 0,
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  logs TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  task_id TEXT,
  link_url TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS global_activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  project_id TEXT,
  task_id TEXT,
  category TEXT NOT NULL,
  icon_symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  meta_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
