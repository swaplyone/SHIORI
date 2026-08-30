import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { emitToUser } from '../services/socket.service.js';

export const focusRouter = Router();

// In-memory active focus sessions store per user
interface FocusSessionData {
  sessionId: string;
  userId: string;
  taskTitle: string;
  projectName: string;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  duration: number; // seconds
  state: 'RUNNING' | 'PAUSED' | 'COMPLETED';
  pausedAt?: number | null;
  elapsedBeforePause: number; // seconds
}

const activeSessionsByUser = new Map<string, FocusSessionData>();

// GET Active Focus Session (API contract for Native iOS Live Activity & Web Sync)
focusRouter.get('/session/active', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const session = activeSessionsByUser.get(userId);

  if (!session) {
    res.json({ session: null });
    return;
  }

  const now = Date.now();
  let remainingTime = 0;
  if (session.state === 'RUNNING') {
    const elapsed = session.elapsedBeforePause + Math.floor((now - session.startTime) / 1000);
    remainingTime = Math.max(0, session.duration - elapsed);
  } else if (session.state === 'PAUSED') {
    remainingTime = Math.max(0, session.duration - session.elapsedBeforePause);
  }

  res.json({
    session: {
      ...session,
      remainingTime,
    }
  });
});

// POST Start Focus Session
focusRouter.post('/session/start', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { taskTitle = 'Focus Session', projectName = 'SHIORI', durationMinutes = 25 } = req.body;

  const durationSec = Math.max(1, durationMinutes) * 60;
  const now = Date.now();
  const endTime = now + durationSec * 1000;
  const sessionId = uuidv4();

  const session: FocusSessionData = {
    sessionId,
    userId,
    taskTitle,
    projectName,
    startTime: now,
    endTime,
    duration: durationSec,
    state: 'RUNNING',
    pausedAt: null,
    elapsedBeforePause: 0,
  };

  activeSessionsByUser.set(userId, session);

  emitToUser(userId, 'focus:started', {
    sessionId,
    taskTitle,
    projectName,
    startTime: now,
    endTime,
    duration: durationSec,
    state: 'RUNNING',
  });

  res.status(201).json({ session });
});

// POST Pause Focus Session
focusRouter.post('/session/pause', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const session = activeSessionsByUser.get(userId);

  if (!session || session.state !== 'RUNNING') {
    res.status(400).json({ error: 'No active running focus session.' });
    return;
  }

  const now = Date.now();
  const additionalElapsed = Math.max(0, Math.floor((now - session.startTime) / 1000));
  session.elapsedBeforePause += additionalElapsed;
  session.pausedAt = now;
  session.state = 'PAUSED';

  emitToUser(userId, 'focus:paused', {
    sessionId: session.sessionId,
    elapsedBeforePause: session.elapsedBeforePause,
    remainingTime: Math.max(0, session.duration - session.elapsedBeforePause),
    state: 'PAUSED',
  });

  res.json({ session });
});

// POST Resume Focus Session
focusRouter.post('/session/resume', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const session = activeSessionsByUser.get(userId);

  if (!session || session.state !== 'PAUSED') {
    res.status(400).json({ error: 'No paused focus session to resume.' });
    return;
  }

  const now = Date.now();
  const remainingSec = Math.max(0, session.duration - session.elapsedBeforePause);
  session.startTime = now;
  session.endTime = now + remainingSec * 1000;
  session.pausedAt = null;
  session.state = 'RUNNING';

  emitToUser(userId, 'focus:resumed', {
    sessionId: session.sessionId,
    startTime: session.startTime,
    endTime: session.endTime,
    remainingTime: remainingSec,
    state: 'RUNNING',
  });

  res.json({ session });
});

// POST Stop Focus Session
focusRouter.post('/session/stop', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const session = activeSessionsByUser.get(userId);

  if (session) {
    activeSessionsByUser.delete(userId);
    emitToUser(userId, 'focus:stopped', { sessionId: session.sessionId });
  }

  res.json({ success: true });
});

// POST Complete Focus Session
focusRouter.post('/session/complete', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const session = activeSessionsByUser.get(userId);

  if (session) {
    session.state = 'COMPLETED';
    activeSessionsByUser.delete(userId);
    emitToUser(userId, 'focus:completed', {
      sessionId: session.sessionId,
      taskTitle: session.taskTitle,
    });
  }

  res.json({ success: true });
});
