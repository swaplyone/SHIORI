import { Router, Response } from 'express';
import { queryAll, queryOne } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const activityRouter = Router();

// GET all activities with categories and project list
activityRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const activities = await queryAll(`
    SELECT a.*, t.task_code, t.title as task_title, p.name as project_name
    FROM global_activities a
    LEFT JOIN tasks t ON a.task_id = t.id
    LEFT JOIN projects p ON a.project_id = p.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);

  // Count by categories
  const categoryStats = await queryAll(`
    SELECT category, COUNT(*) as count
    FROM global_activities
    GROUP BY category
    ORDER BY count DESC
  `);

  // User projects for burndown filter
  const projects = await queryAll(`
    SELECT id, name, slug, created_at
    FROM projects
    ORDER BY name ASC
  `);

  res.json({ activities, categoryStats, projects });
});

// GET Project Burndown Chart Data
activityRouter.get('/burndown', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const projectId = req.query.projectId as string | undefined;

  let querySql = `
    SELECT id, title, task_code, status, user_status, due_date, due_at, completed_at, created_at, updated_at
    FROM tasks
    WHERE (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const queryParams: any[] = [];

  if (projectId && projectId !== 'ALL') {
    querySql += ' AND project_id = ?';
    queryParams.push(projectId);
  }

  querySql += ' ORDER BY created_at ASC';

  const tasks = await queryAll(querySql, queryParams);

  if (!tasks || tasks.length === 0) {
    res.json({
      points: [],
      totalTasks: 0,
      completedTasks: 0,
      remainingTasks: 0,
      startDate: null,
      targetDate: null,
      hasTasks: false
    });
    return;
  }

  const now = new Date();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === 'DONE' || t.user_status === 'COMPLETED').length;
  const remainingTasks = Math.max(0, totalTasks - completedTasks);

  // Find start date (earliest created_at)
  let earliest = new Date(tasks[0].created_at || now);
  if (isNaN(earliest.getTime())) earliest = new Date(Date.now() - 7 * 86400000);

  // Set start of earliest day
  earliest.setHours(0, 0, 0, 0);

  // Find target/end date: latest due date or today
  let latestDue = new Date(now);
  tasks.forEach((t: any) => {
    if (t.due_at) {
      const d = new Date(t.due_at);
      if (!isNaN(d.getTime()) && d > latestDue) latestDue = d;
    }
    if (t.completed_at) {
      const d = new Date(t.completed_at);
      if (!isNaN(d.getTime()) && d > latestDue) latestDue = d;
    }
  });

  // Ensure minimum range of 7 days for clear chart visualization
  const minEnd = new Date(earliest.getTime() + 6 * 86400000);
  const chartEnd = latestDue > minEnd ? latestDue : minEnd;
  chartEnd.setHours(23, 59, 59, 999);

  // Generate day-by-day burndown points
  const points = [];
  const curr = new Date(earliest);
  const totalDurationDays = Math.max(1, Math.round((chartEnd.getTime() - earliest.getTime()) / 86400000));
  let dayIndex = 0;

  while (curr <= chartEnd && dayIndex <= 30) {
    const endOfDay = new Date(curr);
    endOfDay.setHours(23, 59, 59, 999);

    // Cumulative tasks created up to end of this day
    const createdByDay = tasks.filter((t: any) => {
      const cDate = t.created_at ? new Date(t.created_at) : earliest;
      return cDate <= endOfDay;
    }).length;

    // Cumulative tasks completed up to end of this day (respecting actual completion date)
    const completedByDay = tasks.filter((t: any) => {
      if (t.status !== 'DONE' && t.user_status !== 'COMPLETED') return false;
      const compDate = t.completed_at ? new Date(t.completed_at) : (t.updated_at ? new Date(t.updated_at) : endOfDay);
      return compDate <= endOfDay;
    }).length;

    const remaining = Math.max(0, createdByDay - completedByDay);

    // Linear ideal burndown from total tasks to 0 by chartEnd
    const idealProgress = Math.min(1, dayIndex / totalDurationDays);
    const idealRemaining = Math.max(0, Math.round(totalTasks * (1 - idealProgress)));

    const isFuture = curr > now && (curr.toDateString() !== now.toDateString());

    points.push({
      dateLabel: curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: curr.toISOString().split('T')[0],
      remaining: isFuture ? null : remaining,
      ideal: idealRemaining,
      completed: isFuture ? null : completedByDay,
      total: createdByDay,
      isToday: curr.toDateString() === now.toDateString(),
      isFuture
    });

    // Advance 1 day
    curr.setDate(curr.getDate() + 1);
    dayIndex++;
  }

  res.json({
    points,
    totalTasks,
    completedTasks,
    remainingTasks,
    startDate: earliest.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    targetDate: chartEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    hasTasks: true
  });
});
