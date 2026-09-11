import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { queryOne, runQuery } from '../db/index.js';

export const patchNotesRouter = Router();

const DEFAULT_PATCH_VERSION = '2026.09.12-github-task-workflow';

// GET /api/patch-notes/status — Check if user has acknowledged the patch version
patchNotesRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const version = (req.query.version as string) || DEFAULT_PATCH_VERSION;

    const row = await queryOne(
      'SELECT seen_at FROM user_patch_notes WHERE user_id = ? AND patch_version = ?',
      [userId, version]
    );

    res.json({
      success: true,
      patch_version: version,
      seen: !!row,
      seen_at: row?.seen_at || null
    });
  } catch (err: any) {
    console.error('[PATCH NOTES STATUS ERROR]', err);
    res.status(500).json({ error: 'Failed to retrieve patch notes status' });
  }
});

// POST /api/patch-notes/ack — Acknowledge viewing a patch version
patchNotesRouter.post('/ack', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const version = (req.body.version as string) || DEFAULT_PATCH_VERSION;

    await runQuery(
      'INSERT OR REPLACE INTO user_patch_notes (id, user_id, patch_version, seen_at) VALUES (?, ?, ?, datetime(\'now\'))',
      [uuidv4(), userId, version]
    );

    res.json({
      success: true,
      patch_version: version,
      seen: true,
      seen_at: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[PATCH NOTES ACK ERROR]', err);
    res.status(500).json({ error: 'Failed to record patch notes acknowledgement' });
  }
});
