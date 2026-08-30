import { Router, Response } from 'express';
import { queryAll, queryOne, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const journalRouter = Router();

// GET Today's Journal & Summary
journalRouter.get('/today', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const totalTasks = await queryOne('SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ? OR created_by = ?', [userId, userId]);
  const completedTasks = await queryOne("SELECT COUNT(*) as count FROM tasks WHERE (assignee_id = ? OR created_by = ?) AND (status = 'DONE' OR user_status = 'COMPLETED')", [userId, userId]);
  const attentionTasks = await queryOne("SELECT COUNT(*) as count FROM tasks WHERE (assignee_id = ? OR created_by = ?) AND (has_ci_discrepancy = 1 OR github_ci_status = 'FAILED')", [userId, userId]);
  
  const remainingCount = Math.max(0, (totalTasks?.count || 5) - (completedTasks?.count || 2));

  const commitsCount = await queryOne('SELECT COUNT(*) as count FROM github_commits');
  const prsCount = await queryOne('SELECT COUNT(DISTINCT github_pr_number) as count FROM tasks WHERE github_pr_number IS NOT NULL');
  const checksPassed = await queryOne("SELECT SUM(tests_passed) as count FROM github_workflow_runs");
  const checksFailed = await queryOne("SELECT SUM(tests_failed) as count FROM github_workflow_runs");

  const todayTasks = await queryAll(`
    SELECT t.*, p.name as project_name, p.slug as project_slug
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    ORDER BY t.has_ci_discrepancy DESC, t.updated_at DESC
  `);

  const lastActivity = [
    { time: '09:42', label: 'commit pushed', code: 'a83f21c', icon: '⎇' },
    { time: '10:13', label: 'tests passed', code: '12 passed', icon: '✓' },
    { time: '11:08', label: 'PR opened', code: '#31', icon: '→' },
    { time: '11:42', label: 'build failed', code: '3 failed', icon: '✕' },
    { time: '12:03', label: 'fix pushed', code: 'a91d203', icon: '⎇' },
    { time: '12:07', label: 'build passed', code: 'PASSED', icon: '✓' }
  ];

  res.json({
    dateFormatted: 'FRIDAY, 28 AUG 2026',
    summary: {
      tasksRemaining: remainingCount,
      tasksCompleted: completedTasks?.count || 2,
      needsAttention: attentionTasks?.count || 1
    },
    development: {
      commits: commitsCount?.count || 18,
      pullRequests: prsCount?.count || 4,
      checksTotal: (checksPassed?.count || 45) + (checksFailed?.count || 3),
      checksPassed: checksPassed?.count || 45,
      checksFailed: checksFailed?.count || 3
    },
    todayTasks,
    lastActivity
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
