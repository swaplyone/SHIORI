import { Router, Response } from 'express';
import { queryAll, queryOne } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const activityRouter = Router();

// GET all activities for developer journal timeline
activityRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const activities = await queryAll(`
    SELECT a.*, t.task_code, t.title as task_title, p.name as project_name
    FROM global_activities a
    LEFT JOIN tasks t ON a.task_id = t.id
    LEFT JOIN projects p ON a.project_id = p.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);

  res.json({ activities });
});
