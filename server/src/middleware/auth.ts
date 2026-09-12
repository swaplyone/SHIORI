import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { queryOne, runQuery } from '../db/index.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    name: string;
  };
  sessionId?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | null = null;

  // 1. Check HttpOnly cookie first
  if (req.cookies && req.cookies.shiori_session) {
    token = req.cookies.shiori_session;
  }

  // 2. Fall back to Authorization: Bearer <token>
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized. No active session or token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;

    // Check session validity if a sessionId is encoded
    if (decoded.sessionId) {
      const session = await queryOne(
        'SELECT * FROM user_sessions WHERE id = ? AND user_id = ?',
        [decoded.sessionId, decoded.id]
      );
      if (!session) {
        res.status(401).json({ error: 'Session has been revoked or logged out.' });
        return;
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        await runQuery('DELETE FROM user_sessions WHERE id = ?', [decoded.sessionId]);
        res.status(401).json({ error: 'Session has expired. Please log in again.' });
        return;
      }
      req.sessionId = decoded.sessionId;
    }

    const user = await queryOne('SELECT id, email, username, name FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      res.status(401).json({ error: 'User not found or account removed.' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
  }
}
