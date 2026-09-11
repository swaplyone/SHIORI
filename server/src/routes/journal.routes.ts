import { Router, Response } from 'express';
import { queryAll, queryOne, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const journalRouter = Router();

// GET Today's Journal & Summary
journalRouter.get('/today', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const totalTasks = await queryOne(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE (is_deleted = 0 OR is_deleted IS NULL)
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
  `, [userId, userId, userId, userId]);

  const completedTasks = await queryOne(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE (is_deleted = 0 OR is_deleted IS NULL) 
      AND (status = 'DONE' OR user_status = 'COMPLETED')
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
  `, [userId, userId, userId, userId]);

  const attentionTasks = await queryOne(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE (is_deleted = 0 OR is_deleted IS NULL) 
      AND (has_ci_discrepancy = 1 OR github_ci_status = 'FAILED')
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
  `, [userId, userId, userId, userId]);
  
  const remainingCount = Math.max(0, (totalTasks?.count || 0) - (completedTasks?.count || 0));

  // Commits count scoped to user's authorized projects / repos / tasks
  const commitsCount = await queryOne(`
    SELECT COUNT(*) as count 
    FROM github_commits gc
    WHERE (
      LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(github_repo_name) 
        FROM projects 
        WHERE (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) 
          AND github_repo_name IS NOT NULL AND github_repo_name != ''
      )
      OR LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(repo_name) 
        FROM user_repositories 
        WHERE user_id = ? AND is_active = 1
      )
      OR gc.task_id IN (
        SELECT id FROM tasks 
        WHERE created_by = ? 
           OR assignee_id = ? 
           OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    )
  `, [userId, userId, userId, userId, userId, userId, userId]);

  // PRs count scoped to authorized tasks
  const prsCount = await queryOne(`
    SELECT COUNT(DISTINCT github_pr_number) as count 
    FROM tasks 
    WHERE github_pr_number IS NOT NULL 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
  `, [userId, userId, userId, userId]);

  // Workflow tests scoped to authorized repos / tasks
  const checksStats = await queryOne(`
    SELECT SUM(tests_passed) as passed, SUM(tests_failed) as failed 
    FROM github_workflow_runs gwr
    WHERE (
      LOWER(gwr.repo_name) IN (
        SELECT DISTINCT LOWER(github_repo_name) 
        FROM projects 
        WHERE (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) 
          AND github_repo_name IS NOT NULL AND github_repo_name != ''
      )
      OR LOWER(gwr.repo_name) IN (
        SELECT DISTINCT LOWER(repo_name) 
        FROM user_repositories 
        WHERE user_id = ? AND is_active = 1
      )
      OR gwr.task_id IN (
        SELECT id FROM tasks 
        WHERE created_by = ? 
           OR assignee_id = ? 
           OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    )
  `, [userId, userId, userId, userId, userId, userId, userId]);

  const checksPassed = checksStats?.passed || 0;
  const checksFailed = checksStats?.failed || 0;

  const todayTasks = await queryAll(`
    SELECT t.*, p.name as project_name, p.slug as project_slug
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
      AND (
        t.created_by = ? 
        OR t.assignee_id = ? 
        OR t.project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    ORDER BY t.has_ci_discrepancy DESC, t.updated_at DESC
  `, [userId, userId, userId, userId]);

  // Fetch recent commits for dynamic activity feed (strictly scoped)
  const recentCommits = await queryAll(`
    SELECT gc.message, gc.commit_hash, gc.author_name, gc.pushed_at
    FROM github_commits gc
    WHERE (
      LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(github_repo_name) 
        FROM projects 
        WHERE (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) 
          AND github_repo_name IS NOT NULL AND github_repo_name != ''
      )
      OR LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(repo_name) 
        FROM user_repositories 
        WHERE user_id = ? AND is_active = 1
      )
      OR gc.task_id IN (
        SELECT id FROM tasks 
        WHERE created_by = ? 
           OR assignee_id = ? 
           OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    )
    ORDER BY gc.pushed_at DESC
    LIMIT 6
  `, [userId, userId, userId, userId, userId, userId, userId]);

  const lastActivity = recentCommits.map((c: any) => ({
    time: c.pushed_at ? new Date(c.pushed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '12:00',
    label: c.message ? c.message.substring(0, 32) : 'commit pushed',
    code: c.commit_hash ? c.commit_hash.substring(0, 7) : 'commit',
    icon: '⎇'
  }));

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).toUpperCase();

  res.json({
    dateFormatted,
    summary: {
      tasksRemaining: remainingCount,
      tasksCompleted: completedTasks?.count || 0,
      needsAttention: attentionTasks?.count || 0
    },
    development: {
      commits: commitsCount?.count || 0,
      pullRequests: prsCount?.count || 0,
      checksTotal: checksPassed + checksFailed,
      checksPassed,
      checksFailed
    },
    todayTasks,
    lastActivity
  });
});

// GET Weekly Summary
journalRouter.get('/weekly', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const now = new Date();

  // Calculate current week number
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now.getTime() - startOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

  // Calculate week date range (Monday - Sunday)
  const dayOfWeek = now.getDay();
  const diffToMonday = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  const monday = new Date(now);
  monday.setDate(diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayIso = monday.toISOString();
  const sundayIso = sunday.toISOString();

  const formatShort = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const dateRange = `${formatShort(monday)} - ${formatShort(sunday)} ${sunday.getFullYear()}`;

  const completedTasks = await queryOne(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE (is_deleted = 0 OR is_deleted IS NULL) 
      AND (status = 'DONE' OR user_status = 'COMPLETED')
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
      AND (
        (completed_at IS NOT NULL AND completed_at >= ? AND completed_at <= ?)
        OR (completed_at IS NULL AND updated_at >= ? AND updated_at <= ?)
      )
  `, [userId, userId, userId, userId, mondayIso, sundayIso, mondayIso, sundayIso]);

  // Scoped weekly commits count
  const commitsCount = await queryOne(`
    SELECT COUNT(*) as count 
    FROM github_commits gc
    WHERE (
      LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(github_repo_name) 
        FROM projects 
        WHERE (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) 
          AND github_repo_name IS NOT NULL AND github_repo_name != ''
      )
      OR LOWER(gc.repo_name) IN (
        SELECT DISTINCT LOWER(repo_name) 
        FROM user_repositories 
        WHERE user_id = ? AND is_active = 1
      )
      OR gc.task_id IN (
        SELECT id FROM tasks 
        WHERE created_by = ? 
           OR assignee_id = ? 
           OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    )
    AND gc.pushed_at >= ? AND gc.pushed_at <= ?
  `, [userId, userId, userId, userId, userId, userId, userId, mondayIso, sundayIso]);

  // Scoped weekly PRs count
  const prsCount = await queryOne(`
    SELECT COUNT(DISTINCT github_pr_number) as count 
    FROM tasks 
    WHERE github_pr_number IS NOT NULL 
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND (
        created_by = ? 
        OR assignee_id = ? 
        OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
      AND updated_at >= ? AND updated_at <= ?
  `, [userId, userId, userId, userId, mondayIso, sundayIso]);
  
  // Scoped workflow stats
  const workflowStats = await queryOne(`
    SELECT SUM(tests_passed) as passed, SUM(tests_failed) as failed 
    FROM github_workflow_runs gwr
    WHERE (
      LOWER(gwr.repo_name) IN (
        SELECT DISTINCT LOWER(github_repo_name) 
        FROM projects 
        WHERE (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) 
          AND github_repo_name IS NOT NULL AND github_repo_name != ''
      )
      OR LOWER(gwr.repo_name) IN (
        SELECT DISTINCT LOWER(repo_name) 
        FROM user_repositories 
        WHERE user_id = ? AND is_active = 1
      )
      OR gwr.task_id IN (
        SELECT id FROM tasks 
        WHERE created_by = ? 
           OR assignee_id = ? 
           OR project_id IN (SELECT id FROM projects WHERE created_by = ? UNION SELECT project_id FROM project_members WHERE user_id = ?)
      )
    )
  `, [userId, userId, userId, userId, userId, userId, userId]);

  const passed = workflowStats?.passed || 0;
  const failed = workflowStats?.failed || 0;
  const total = passed + failed;
  const buildSuccessRate = total > 0 ? Math.round((passed / total) * 100) : 100;

  // Projects Distribution (strictly scoped to user's authorized projects)
  const projects = await queryAll(`
    SELECT p.id, p.name, COUNT(t.id) as task_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
    WHERE p.created_by = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    GROUP BY p.id, p.name
    ORDER BY task_count DESC
    LIMIT 4
  `, [userId, userId]);

  const totalProjectTasks = projects.reduce((acc: number, p: any) => acc + (Number(p.task_count) || 0), 0) || 1;
  const projectsDistribution = projects.map((p: any) => {
    const count = Number(p.task_count) || 0;
    const percentage = Math.round((count / totalProjectTasks) * 100);
    const blocksCount = Math.max(1, Math.round(percentage / 10));
    return {
      name: p.name || 'Workspace Project',
      commits: count,
      percentage,
      bar: '█'.repeat(blocksCount)
    };
  });

  res.json({
    weekNumber,
    dateRange,
    tasksCompleted: completedTasks?.count || 0,
    commitsCount: commitsCount?.count || 0,
    pullRequestsCount: prsCount?.count || 0,
    buildSuccessRate,
    projectsDistribution
  });
});

// GET Daily Note
journalRouter.get('/notes/:date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { date } = req.params;
  const note = await queryOne('SELECT * FROM daily_notes WHERE user_id = ? AND note_date = ?', [req.user!.id, date]);
  res.json({ note: note || { note_date: date, content: '' } });
});

// POST Save Daily Note
journalRouter.post('/notes/:date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { date } = req.params;
  const { content } = req.body;
  const noteId = `${req.user!.id}_${date}`;

  const existing = await queryOne('SELECT id FROM daily_notes WHERE user_id = ? AND note_date = ?', [req.user!.id, date]);
  if (existing) {
    await runQuery(`
      UPDATE daily_notes SET content = ?, updated_at = datetime('now')
      WHERE user_id = ? AND note_date = ?
    `, [content || '', req.user!.id, date]);
  } else {
    await runQuery(`
      INSERT INTO daily_notes (id, user_id, note_date, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [noteId, req.user!.id, date, content || '']);
  }

  const saved = await queryOne('SELECT * FROM daily_notes WHERE user_id = ? AND note_date = ?', [req.user!.id, date]);
  res.json({ note: saved });
});
