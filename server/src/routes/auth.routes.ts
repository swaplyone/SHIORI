import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, runQuery } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

function generateToken(user: { id: string; email: string; username: string; name: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, name: user.name },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}

// Register
authRouter.post('/register', async (req, res): Promise<void> => {
  const { email, password, username, name } = req.body;

  if (!email || !password || !username || !name) {
    res.status(400).json({ error: 'All fields (email, password, username, name) are required.' });
    return;
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
  if (existing) {
    res.status(400).json({ error: 'User with this email or username already exists.' });
    return;
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  // Generate unique 6-character SHIORI ID
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomId = '';
  for (let i = 0; i < 6; i++) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const shioriId = `SHI-${randomId}`;

  await runQuery(`
    INSERT INTO users (id, shiori_id, email, password_hash, username, name, points, theme)
    VALUES (?, ?, ?, ?, ?, ?, 120, 'light')
  `, [id, shioriId, email, passwordHash, username, name]);

  await runQuery(`
    INSERT INTO user_settings (user_id) VALUES (?)
  `, [id]);

  // Create default personal workspace
  const workspaceId = uuidv4();
  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, 'Personal Workspace', ?, 'My personal workspace', ?)
  `, [workspaceId, `ws-${username}`, id]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `, [uuidv4(), workspaceId, id]);

  const user = { id, email, username, name };
  const token = generateToken(user);

  res.status(201).json({
    token,
    user: {
      id,
      shiori_id: shioriId,
      email,
      username,
      name,
      theme: 'light',
      points: 120,
      github_connected: 0
    }
  });
});

// Login
authRouter.post('/login', async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      shiori_id: user.shiori_id,
      email: user.email,
      username: user.username,
      name: user.name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      theme: user.theme || 'light',
      points: user.points ?? 120,
      github_connected: user.github_connected,
      github_username: user.github_username
    }
  });
});

// Demo Login (Instant access as Lijith)
authRouter.post('/demo-login', async (req, res): Promise<void> => {
  let user = await queryOne('SELECT * FROM users WHERE email = ?', ['lijith@swaplyone.com']);
  if (!user) {
    user = await queryOne('SELECT * FROM users LIMIT 1');
  }

  if (!user) {
    res.status(500).json({ error: 'Demo user not seeded.' });
    return;
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      shiori_id: user.shiori_id,
      email: user.email,
      username: user.username,
      name: user.name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      theme: user.theme || 'light',
      points: user.points ?? 120,
      github_connected: user.github_connected,
      github_username: user.github_username
    }
  });
});

// Get Current User Profile
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await queryOne('SELECT id, shiori_id, email, username, name, bio, avatar_url, theme, points, github_connected, github_username FROM users WHERE id = ?', [req.user!.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const settings = await queryOne('SELECT * FROM user_settings WHERE user_id = ?', [req.user!.id]);
  res.json({ user, settings: settings || {} });
});

// Update Profile
authRouter.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, bio, theme } = req.body;
  await runQuery(`
    UPDATE users SET
      name = COALESCE(?, name),
      bio = COALESCE(?, bio),
      theme = COALESCE(?, theme),
      updated_at = datetime('now')
    WHERE id = ?
  `, [name, bio, theme, req.user!.id]);

  const user = await queryOne('SELECT id, shiori_id, email, username, name, bio, avatar_url, theme, points, github_connected, github_username FROM users WHERE id = ?', [req.user!.id]);
  res.json({ user });
});

// Update Settings
authRouter.patch('/settings', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    eink_refresh_effect,
    sound_effects,
    web_push_enabled,
    privacy_github,
    privacy_tasks,
    privacy_projects,
    privacy_stats,
    notify_build_failed,
    notify_build_passed,
    notify_pr_review,
    notify_task_assigned
  } = req.body;

  await runQuery(`
    UPDATE user_settings SET
      eink_refresh_effect = COALESCE(?, eink_refresh_effect),
      sound_effects = COALESCE(?, sound_effects),
      web_push_enabled = COALESCE(?, web_push_enabled),
      privacy_github = COALESCE(?, privacy_github),
      privacy_tasks = COALESCE(?, privacy_tasks),
      privacy_projects = COALESCE(?, privacy_projects),
      privacy_stats = COALESCE(?, privacy_stats),
      notify_build_failed = COALESCE(?, notify_build_failed),
      notify_build_passed = COALESCE(?, notify_build_passed),
      notify_pr_review = COALESCE(?, notify_pr_review),
      notify_task_assigned = COALESCE(?, notify_task_assigned)
    WHERE user_id = ?
  `, [
    eink_refresh_effect,
    sound_effects,
    web_push_enabled,
    privacy_github,
    privacy_tasks,
    privacy_projects,
    privacy_stats,
    notify_build_failed,
    notify_build_passed,
    notify_pr_review,
    notify_task_assigned,
    req.user!.id
  ]);

  const settings = await queryOne('SELECT * FROM user_settings WHERE user_id = ?', [req.user!.id]);
  res.json({ settings });
});
