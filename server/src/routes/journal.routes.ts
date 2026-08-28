import { Router, Response } from 'express';
import { queryAll, queryOne } from '../db/index.js';
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

// GET Weekly Work Summary
journalRouter.get('/weekly', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    weekNumber: 35,
    dateRange: '24 Aug - 30 Aug 2026',
    tasksCompleted: 31,
    commitsCount: 74,
    pullRequestsCount: 12,
    buildSuccessRate: 94, // 94%
    projectsDistribution: [
      { name: 'SwaplyOne Compiler', commits: 42, percentage: 56, bar: '██████████' },
      { name: 'Swaply Backend', commits: 22, percentage: 30, bar: '███████' },
      { name: 'AI Artisan Marketplace', commits: 10, percentage: 14, bar: '████' }
    ],
    dailyVelocity: [
      { day: 'Mon', commits: 12, tasks: 6, ciRate: 100 },
      { day: 'Tue', commits: 18, tasks: 8, ciRate: 92 },
      { day: 'Wed', commits: 14, tasks: 5, ciRate: 95 },
      { day: 'Thu', commits: 16, tasks: 7, ciRate: 88 },
      { day: 'Fri', commits: 14, tasks: 5, ciRate: 95 }
    ]
  });
});
