import { Router, Response } from 'express';
import { queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const notificationsRouter = Router();

// GET notifications
notificationsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const notifications = await queryAll(`
    SELECT n.*, t.task_code
    FROM notifications n
    LEFT JOIN tasks t ON n.task_id = t.id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
  `, [req.user!.id]);

  res.json({ notifications });
});

// Mark single as read
notificationsRouter.patch('/:id/read', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  await runQuery('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', [id, req.user!.id]);
  res.json({ success: true });
});

// Mark all as read
notificationsRouter.post('/read-all', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await runQuery('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user!.id]);
  res.json({ success: true });
});
