import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb, runQuery, queryOne } from './index.js';

export async function seedDatabase() {
  console.log('Seeding SHIORI database...');
  await getDb();

  const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', ['lijith@swaplyone.com']);
  if (existingUser) {
    // Ensure SHIORI IDs are populated
    await runQuery(`UPDATE users SET shiori_id = 'SHI-3A91M' WHERE id = 'user-lijith-001' AND (shiori_id IS NULL OR shiori_id = '');`);
    await runQuery(`UPDATE users SET shiori_id = 'SHI-4M92KP' WHERE id = 'user-tejas-002' AND (shiori_id IS NULL OR shiori_id = '');`);
    await runQuery(`UPDATE users SET shiori_id = 'SHI-8F42K' WHERE id = 'user-rahul-003' AND (shiori_id IS NULL OR shiori_id = '');`);
    await runQuery(`UPDATE users SET shiori_id = 'SHI-7K4M92' WHERE id = 'user-arjun-004' AND (shiori_id IS NULL OR shiori_id = '');`);
    console.log('Database already has seeded data. SHIORI IDs verified.');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);
  
  // 1. Users with Unique SHIORI IDs
  const lijithId = 'user-lijith-001';
  const tejasId = 'user-tejas-002';
  const rahulId = 'user-rahul-003';
  const arjunId = 'user-arjun-004';

  await runQuery(`
    INSERT INTO users (id, shiori_id, email, password_hash, username, name, bio, avatar_url, theme, github_connected, github_username, github_avatar)
    VALUES 
    (?, 'SHI-3A91M', 'lijith@swaplyone.com', ?, 'lijith', 'Lijith', 'Systems engineer & SwaplyOne architect', '', 'light', 1, 'lijith-swaply', ''),
    (?, 'SHI-4M92KP', 'tejas@swaplyone.com', ?, 'tejas', 'Tejas', 'Compiler optimizations & AST specialist', '', 'light', 1, 'tejas-dev', ''),
    (?, 'SHI-8F42K', 'rahul@swaplyone.com', ?, 'rahul', 'Rahul', 'Core backend & distributed runtime', '', 'light', 1, 'rahul-builds', ''),
    (?, 'SHI-7K4M92', 'arjun@swaplyone.com', ?, 'arjun', 'Arjun', 'Verification engineer & test infrastructure', '', 'light', 0, '', '')
  `, [lijithId, passwordHash, tejasId, passwordHash, rahulId, passwordHash, arjunId, passwordHash]);

  // User Settings
  await runQuery(`
    INSERT INTO user_settings (user_id, eink_refresh_effect, sound_effects, web_push_enabled, privacy_github, privacy_tasks, privacy_projects, privacy_stats)
    VALUES 
    (?, 1, 0, 1, 'connections', 'connections', 'workspace', 'connections'),
    (?, 1, 0, 0, 'connections', 'connections', 'workspace', 'private'),
    (?, 1, 0, 0, 'connections', 'connections', 'workspace', 'connections'),
    (?, 1, 0, 0, 'connections', 'connections', 'workspace', 'private')
  `, [lijithId, tejasId, rahulId, arjunId]);

  // 2. Active Verified Connections
  await runQuery(`
    INSERT INTO connections (id, user_a_id, user_b_id, connected_at)
    VALUES 
    (?, ?, ?, datetime('now', '-2 days')),
    (?, ?, ?, datetime('now', '-2 days')),
    (?, ?, ?, datetime('now', '-1 day')),
    (?, ?, ?, datetime('now', '-1 day'))
  `, [
    uuidv4(), lijithId, rahulId,
    uuidv4(), rahulId, lijithId,
    uuidv4(), lijithId, tejasId,
    uuidv4(), tejasId, lijithId
  ]);

  // 3. Workspaces (Creator model)
  const workspaceId = 'ws-swaplyone-01';
  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, 'SwaplyOne Compiler', 'swaplyone', 'Engineering workspace for compiler, runtime & platform', ?)
  `, [workspaceId, lijithId]);

  // Workspace Members
  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES 
    (?, ?, ?, 'creator'),
    (?, ?, ?, 'member'),
    (?, ?, ?, 'member')
  `, [uuidv4(), workspaceId, lijithId, uuidv4(), workspaceId, tejasId, uuidv4(), workspaceId, rahulId]);

  // 4. Projects
  const projCompilerId = 'proj-compiler-01';
  const projBackendId = 'proj-backend-02';
  const projMarketplaceId = 'proj-marketplace-03';

  await runQuery(`
    INSERT INTO projects (id, workspace_id, name, slug, description, status, github_repo_name, github_repo_url, default_branch, created_by)
    VALUES 
    (?, ?, 'SwaplyOne Compiler', 'swaply-one-compiler', 'High-performance AOT bytecode compiler & optimizer', 'ACTIVE', 'swaply-one-compiler', 'https://github.com/swaplyone/swaply-one-compiler', 'main', ?),
    (?, ?, 'Swaply Backend', 'swaply-backend', 'Event-driven distributed backend API and storage engine', 'ACTIVE', 'swaply-backend', 'https://github.com/swaplyone/swaply-backend', 'main', ?),
    (?, ?, 'AI Artisan Marketplace', 'ai-artisan-marketplace', 'Intelligent developer tooling & artifact ecosystem', 'ACTIVE', 'ai-artisan-marketplace', 'https://github.com/swaplyone/ai-artisan-marketplace', 'main', ?)
  `, [projCompilerId, workspaceId, lijithId, projBackendId, workspaceId, lijithId, projMarketplaceId, workspaceId, lijithId]);

  // Project Members
  await runQuery(`
    INSERT INTO project_members (id, project_id, user_id, role)
    VALUES 
    (?, ?, ?, 'owner'),
    (?, ?, ?, 'member'),
    (?, ?, ?, 'member'),
    (?, ?, ?, 'owner'),
    (?, ?, ?, 'member')
  `, [
    uuidv4(), projCompilerId, lijithId,
    uuidv4(), projCompilerId, rahulId,
    uuidv4(), projCompilerId, tejasId,
    uuidv4(), projBackendId, lijithId,
    uuidv4(), projBackendId, rahulId
  ]);

  // 5. Tasks
  const task042Id = 'task-042-compiler';
  const task039Id = 'task-039-auth';
  const task018Id = 'task-018-gh';
  const task051Id = 'task-051-leak';
  const task027Id = 'task-027-theme';

  // Task 042: Marked completed by user, but latest CI failed!
  await runQuery(`
    INSERT INTO tasks (
      id, task_number, task_code, project_id, workspace_id, title, description,
      status, priority, user_status, assignee_id, created_by, due_date,
      github_repo, github_branch, github_pr_number, github_pr_title, github_pr_url, github_pr_state,
      github_ci_status, github_last_commit_hash, github_last_commit_msg, github_last_commit_author, github_last_commit_time,
      dev_evidence_commits_count, dev_evidence_prs_count, dev_evidence_files_changed,
      dev_evidence_checks_passed, dev_evidence_checks_failed, dev_evidence_pr_merged,
      dev_confidence_score, has_ci_discrepancy
    ) VALUES (
      ?, 42, 'TASK-042', ?, ?, 'Fix compiler error handling',
      'Improve compiler error handling and display meaningful error messages with exact token locations when nested syntax errors occur.',
      'IN_PROGRESS', 'HIGH', 'COMPLETED', ?, ?, 'Tomorrow',
      'swaply-one-compiler', 'feature/error-page', 31, 'Improve compiler error handling', 'https://github.com/swaplyone/swaply-one-compiler/pull/31', 'OPEN',
      'FAILED', 'a83f21c', 'fix: compiler error rendering', 'Lijith', '12 minutes ago',
      7, 1, 14, 12, 1, 0,
      86, 1
    )
  `, [task042Id, projCompilerId, workspaceId, lijithId, lijithId]);

  // Task 039: Implement authentication
  await runQuery(`
    INSERT INTO tasks (
      id, task_number, task_code, project_id, workspace_id, title, description,
      status, priority, user_status, assignee_id, created_by, due_date,
      github_repo, github_branch, github_pr_number, github_pr_title, github_pr_url, github_pr_state,
      github_ci_status, github_last_commit_hash, github_last_commit_msg, github_last_commit_author, github_last_commit_time,
      dev_evidence_commits_count, dev_evidence_prs_count, dev_evidence_files_changed,
      dev_evidence_checks_passed, dev_evidence_checks_failed, dev_evidence_pr_merged,
      dev_confidence_score, has_ci_discrepancy
    ) VALUES (
      ?, 39, 'TASK-039', ?, ?, 'Implement authentication',
      'Add JWT session token validation, refresh token rotation, and scoped OAuth role guards.',
      'IN_PROGRESS', 'MEDIUM', 'IN_PROGRESS', ?, ?, '28 Aug 2026',
      'swaply-backend', 'feature/auth', 42, 'Authentication API & Token Rotation', 'https://github.com/swaplyone/swaply-backend/pull/42', 'OPEN',
      'PASSED', 'c92fa01', 'feat: add JWT login and refresh token verification', 'Lijith', '3 hours ago',
      4, 1, 8, 8, 0, 0,
      94, 0
    )
  `, [task039Id, projBackendId, workspaceId, lijithId, lijithId]);

  // Task 018: Setup GitHub integration
  await runQuery(`
    INSERT INTO tasks (
      id, task_number, task_code, project_id, workspace_id, title, description,
      status, priority, user_status, assignee_id, created_by, due_date,
      github_repo, github_branch, github_pr_number, github_pr_title, github_pr_url, github_pr_state,
      github_ci_status, github_last_commit_hash, github_last_commit_msg, github_last_commit_author, github_last_commit_time,
      dev_evidence_commits_count, dev_evidence_prs_count, dev_evidence_files_changed,
      dev_evidence_checks_passed, dev_evidence_checks_failed, dev_evidence_pr_merged,
      dev_confidence_score, has_ci_discrepancy
    ) VALUES (
      ?, 18, 'TASK-018', ?, ?, 'Setup GitHub integration',
      'Configure GitHub Apps webhook delivery endpoints, OAuth 2.0 flow, and repository sync workers.',
      'DONE', 'HIGH', 'COMPLETED', ?, ?, 'Yesterday',
      'swaply-one-compiler', 'main', 28, 'Setup GitHub webhooks & signature verification', 'https://github.com/swaplyone/swaply-one-compiler/pull/28', 'MERGED',
      'PASSED', 'b149ee0', 'feat: complete webhook HMAC validation', 'Lijith', 'Yesterday 17:40',
      12, 1, 19, 16, 0, 1,
      100, 0
    )
  `, [task018Id, projCompilerId, workspaceId, lijithId, lijithId]);

  // Subtasks for TASK-042
  await runQuery(`
    INSERT INTO task_subtasks (id, task_id, title, completed, position)
    VALUES 
    (?, ?, 'Add token coordinate tracking in Lexer', 1, 1),
    (?, ?, 'Construct formatted Diagnostic message generator', 1, 2),
    (?, ?, 'Handle nested expression parser crashes', 0, 3),
    (?, ?, 'Write unit tests for malformed syntax input', 0, 4)
  `, [uuidv4(), task042Id, uuidv4(), task042Id, uuidv4(), task042Id, uuidv4(), task042Id]);

  // Comments on TASK-042
  await runQuery(`
    INSERT INTO task_comments (id, task_id, user_id, content, created_at)
    VALUES 
    (?, ?, ?, 'The parser error is still happening on nested expressions when brackets are mismatched in macro expansion.', datetime('now', '-45 minutes')),
    (?, ?, ?, 'I''ll fix this in the next commit. Pushing a fix for parser token recovery.', datetime('now', '-25 minutes'))
  `, [uuidv4(), task042Id, tejasId, uuidv4(), task042Id, lijithId]);

  // Commits for TASK-042
  await runQuery(`
    INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name, files_changed, pushed_at)
    VALUES 
    (?, ?, 'swaply-one-compiler', 'feature/error-page', 'a83f21c', 'fix: compiler error rendering and caret pointer', 'Lijith', 3, datetime('now', '-12 minutes')),
    (?, ?, 'swaply-one-compiler', 'feature/error-page', '91bc832', 'feat: add error state diagnostic payload', 'Lijith', 6, datetime('now', '-42 minutes')),
    (?, ?, 'swaply-one-compiler', 'feature/error-page', '8c92a11', 'refactor: parser errors into unified enum', 'Lijith', 5, datetime('now', '-68 minutes'))
  `, [uuidv4(), task042Id, uuidv4(), task042Id, uuidv4(), task042Id]);

  // Workflow Run for TASK-042
  const failedWorkflowLogs = `[09:41:02] Run compiler test suite
[09:41:15] PASS tests/lexer_test.rs (12 tests)
[09:41:28] PASS tests/ast_test.rs (24 tests)
[09:41:40] FAIL tests/parser_nested_test.rs
           -> test_nested_macro_unclosed_bracket ... FAILED
           -> test_nested_ternary_recovery ... FAILED
           -> test_deep_recursion_panic ... FAILED
[09:41:42] Error: Process completed with exit code 1.
3 tests failed out of 48 total assertions.`;

  await runQuery(`
    INSERT INTO github_workflow_runs (
      id, task_id, repo_name, branch_name, commit_hash, workflow_name,
      status, conclusion, duration_seconds, tests_total, tests_passed, tests_failed, logs, started_at, completed_at
    ) VALUES (
      ?, ?, 'swaply-one-compiler', 'feature/error-page', 'a83f21c', 'CI / Rust & TypeScript Tests',
      'completed', 'failure', 102, 48, 45, 3, ?, datetime('now', '-12 minutes'), datetime('now', '-10 minutes')
    )
  `, [uuidv4(), task042Id, failedWorkflowLogs]);

  // Task Activity
  await runQuery(`
    INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
    VALUES 
    (?, ?, ?, 'CREATED', 'Task created by Lijith', NULL, datetime('now', '-3 hours')),
    (?, ?, ?, 'COMMIT_PUSHED', 'Commit a83f21c pushed to feature/error-page', 'fix: compiler error rendering', datetime('now', '-12 minutes')),
    (?, ?, ?, 'CI_FAILED', 'CI build failed on commit a83f21c', '3 tests failed in tests/parser_nested_test.rs', datetime('now', '-10 minutes'))
  `, [uuidv4(), task042Id, lijithId, uuidv4(), task042Id, lijithId, uuidv4(), task042Id, lijithId]);

  // Notifications
  await runQuery(`
    INSERT INTO notifications (id, user_id, type, title, message, task_id, read)
    VALUES 
    (?, ?, 'BUILD_FAILED', '✕ BUILD FAILED', 'Your branch feature/error-page failed CI on commit a83f21c (3 tests failed).', ?, 0),
    (?, ?, 'PR_REVIEW', '→ PR REVIEW', 'Tejas commented on TASK-042.', ?, 0)
  `, [uuidv4(), lijithId, task042Id, uuidv4(), lijithId, task042Id]);

  // Global Activities
  await runQuery(`
    INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text, created_at)
    VALUES 
    (?, ?, ?, ?, ?, 'TASK', '○', 'Task created: Fix compiler error handling', 'TASK-042', datetime('now', '-3 hours')),
    (?, ?, ?, ?, ?, 'COMMIT', '⎇', 'Commit pushed a83f21c', 'fix: compiler error rendering', datetime('now', '-12 minutes')),
    (?, ?, ?, ?, ?, 'PR', '→', 'Pull request opened #31', 'Improve compiler error handling', datetime('now', '-35 minutes')),
    (?, ?, ?, ?, ?, 'CI', '✕', 'CI failed on branch feature/error-page', '3 tests failed', datetime('now', '-10 minutes'))
  `, [
    uuidv4(), lijithId, workspaceId, projCompilerId, task042Id,
    uuidv4(), lijithId, workspaceId, projCompilerId, task042Id,
    uuidv4(), lijithId, workspaceId, projCompilerId, task042Id,
    uuidv4(), lijithId, workspaceId, projCompilerId, task042Id
  ]);

  console.log('SHIORI database seeded successfully with intentional connections and SHIORI IDs.');
}
