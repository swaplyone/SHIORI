import { Router, Response } from 'express';
import { queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendPushToUser
} from '../services/push.service.js';

export const notificationsRouter = Router();

// GET VAPID public key for Web Push subscription
notificationsRouter.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// POST Subscribe browser for locked-screen push notifications
notificationsRouter.post('/subscribe', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint) {
    res.status(400).json({ error: 'Valid push subscription is required.' });
    return;
  }

  const userAgent = req.headers['user-agent'] as string | undefined;
  await savePushSubscription(req.user!.id, subscription, userAgent);

  res.json({ success: true, message: 'Web Push subscription registered.' });
});

// POST Unsubscribe from Web Push
notificationsRouter.post('/unsubscribe', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { endpoint } = req.body;
  if (endpoint) {
    await removePushSubscription(endpoint);
  }
  res.json({ success: true });
});

// POST Send test push notification to user's registered devices (including locked mobile screen)
notificationsRouter.post('/test-push', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const delaySeconds = Number(req.body.delaySeconds) || 0;

  const dispatch = async () => {
    await sendPushToUser(req.user!.id, {
      title: 'SHIORI Lock Screen Notification 🔔',
      body: 'Real Web Push delivered to your locked mobile device!',
      url: '/notifications',
      tag: `shiori-test-${Date.now()}`
    });
  };

  if (delaySeconds > 0) {
    setTimeout(dispatch, delaySeconds * 1000);
    res.json({ success: true, message: `Push scheduled to fire in ${delaySeconds}s (lock your screen now!)` });
  } else {
    await dispatch();
    res.json({ success: true, message: 'Push notification sent to all user devices.' });
  }
});

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
