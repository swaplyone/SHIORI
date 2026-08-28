import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, runQuery } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../services/otp.service.js';
import { sendOtpEmail } from '../services/email.service.js';

export const authRouter = Router();

function generateToken(user: { id: string; email: string; username: string; name: string }) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, name: user.name },
    config.jwtSecret,
    { expiresIn: '30d' }
  );
}

function generateShioriId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomId = '';
  for (let i = 0; i < 6; i++) {
    randomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SHI-${randomId}`;
}

// 1. Send Registration OTP to Email
authRouter.post('/register/send-otp', async (req: Request, res: Response): Promise<void> => {
  const { email, password, username, name } = req.body;

  if (!email || !password || !username || !name) {
    res.status(400).json({ error: 'All fields (name, email, username, password) are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();

  const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanEmail, cleanUsername]);
  if (existing) {
    res.status(400).json({ error: 'An account with this email or username already exists.' });
    return;
  }

  // Generate 6-digit cryptographic OTP
  const otp = generateSecureOTP();
  const otpHash = hashOTP(otp);
  const passwordHash = await bcrypt.hash(password, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  // Store in registration_otps
  await runQuery(`
    INSERT OR REPLACE INTO registration_otps (email, otp_hash, otp_plain, name, username, password_hash, attempts, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
  `, [cleanEmail, otpHash, otp, name.trim(), cleanUsername, passwordHash, expiresAt]);

  // Dispatch real email via SMTP in background
  sendOtpEmail({
    toEmail: cleanEmail,
    userName: name.trim(),
    otp
  }).catch((err) => console.error('[SEND_OTP ERROR]', err));

  res.json({
    success: true,
    message: `Verification code sent to ${cleanEmail}.`
  });
});

// 2. Verify Registration OTP & Create Account
authRouter.post('/register/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({ error: 'Email and verification code are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp).replace(/\s+/g, '');

  const pending = await queryOne('SELECT * FROM registration_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
  if (!pending) {
    res.status(400).json({ error: 'No verification pending for this email. Please request a new code.' });
    return;
  }

  // Check expiration
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    return;
  }

  // Check attempts
  if (pending.attempts >= 5) {
    res.status(400).json({ error: 'Too many failed attempts. Please request a new verification code.' });
    return;
  }

  // Verify OTP hash
  const isValid = verifyOTPHash(cleanOtp, pending.otp_hash);
  if (!isValid && cleanOtp !== pending.otp_plain) {
    await runQuery('UPDATE registration_otps SET attempts = attempts + 1 WHERE email = ?', [cleanEmail]);
    res.status(400).json({ error: 'Incorrect verification code. Please try again.' });
    return;
  }

  // Create real account
  const id = uuidv4();
  const shioriId = generateShioriId();

  await runQuery(`
    INSERT INTO users (id, shiori_id, email, password_hash, username, name, points, theme)
    VALUES (?, ?, ?, ?, ?, ?, 120, 'light')
  `, [id, shioriId, cleanEmail, pending.password_hash, pending.username, pending.name]);

  await runQuery(`INSERT INTO user_settings (user_id) VALUES (?)`, [id]);

  // Create default workspace
  const workspaceId = uuidv4();
  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, 'Personal Workspace', ?, 'Personal workspace', ?)
  `, [workspaceId, `ws-${pending.username}`, id]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `, [uuidv4(), workspaceId, id]);

  // Cleanup pending registration
  await runQuery('DELETE FROM registration_otps WHERE email = ?', [cleanEmail]);

  const user = {
    id,
    shiori_id: shioriId,
    email: cleanEmail,
    username: pending.username,
    name: pending.name,
    theme: 'light',
    points: 120,
    github_connected: 0,
    github_username: null
  };

  const token = generateToken(user);

  res.status(201).json({
    token,
    user
  });
});

// 3. Direct Register (with auto-generated SHIORI ID)
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, username, name } = req.body;

  if (!email || !password || !username || !name) {
    res.status(400).json({ error: 'All fields (email, password, username, name) are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();

  const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanEmail, cleanUsername]);
  if (existing) {
    res.status(400).json({ error: 'User with this email or username already exists.' });
    return;
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const shioriId = generateShioriId();

  await runQuery(`
    INSERT INTO users (id, shiori_id, email, password_hash, username, name, points, theme)
    VALUES (?, ?, ?, ?, ?, ?, 120, 'light')
  `, [id, shioriId, cleanEmail, passwordHash, cleanUsername, name.trim()]);

  await runQuery(`INSERT INTO user_settings (user_id) VALUES (?)`, [id]);

  const workspaceId = uuidv4();
  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, 'Personal Workspace', ?, 'My personal workspace', ?)
  `, [workspaceId, `ws-${cleanUsername}`, id]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `, [uuidv4(), workspaceId, id]);

  const user = {
    id,
    shiori_id: shioriId,
    email: cleanEmail,
    username: cleanUsername,
    name: name.trim(),
    theme: 'light',
    points: 120,
    github_connected: 0,
    github_username: null
  };

  const token = generateToken(user);

  res.status(201).json({
    token,
    user
  });
});

// 4. Real Login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanEmail, cleanEmail]);
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

// 5. Get Current User Profile
authRouter.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await queryOne('SELECT id, shiori_id, email, username, name, bio, avatar_url, theme, points, github_connected, github_username FROM users WHERE id = ?', [req.user!.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const settings = await queryOne('SELECT * FROM user_settings WHERE user_id = ?', [req.user!.id]);
  res.json({ user, settings: settings || {} });
});

// 6. Update Profile
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
