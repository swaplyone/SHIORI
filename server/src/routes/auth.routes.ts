import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, runQuery } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../services/otp.service.js';
import { sendOtpEmail, sendUsernameEmail } from '../services/email.service.js';

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
  try {
    const { email, password, username, name } = req.body;

    if (!email || !password || !username || !name) {
      res.status(400).json({ error: 'All fields (name, email, username, password) are required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address with a valid domain (e.g. user@gmail.com).' });
      return;
    }

    const existingEmail = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    if (existingEmail) {
      res.status(400).json({ error: 'An account with this email already exists.' });
      return;
    }

    const existingUsername = await queryOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [cleanUsername]);
    if (existingUsername) {
      res.status(400).json({ error: 'This username is already taken. Please choose another.' });
      return;
    }

    // Generate 6-digit cryptographic OTP
    const otp = generateSecureOTP();
    const otpHash = hashOTP(otp);
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Store in registration_otps with explicit purpose
    await runQuery(`
      INSERT OR REPLACE INTO registration_otps (email, otp_hash, otp_plain, name, username, password_hash, attempts, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
    `, [cleanEmail, otpHash, otp, name.trim(), cleanUsername, passwordHash, expiresAt]);

    // Dispatch real email via SMTP concurrently
    sendOtpEmail({
      toEmail: cleanEmail,
      userName: name.trim(),
      otp,
      purpose: 'ACCOUNT_VERIFICATION'
    }).catch((err) => console.error('[SEND_OTP ERROR]', err));

    res.json({
      success: true,
      message: `Verification code sent to ${cleanEmail}.`
    });
  } catch (error: any) {
    console.error('[AUTH /register/send-otp ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal server error while processing registration.' });
  }
});

// 1b. Resend Account Verification OTP
authRouter.post('/register/resend-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const pending = await queryOne('SELECT * FROM registration_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    if (!pending) {
      res.status(400).json({ error: 'No pending registration found for this email. Please register first.' });
      return;
    }

    const otp = generateSecureOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await runQuery(`
      UPDATE registration_otps
      SET otp_hash = ?, otp_plain = ?, attempts = 0, expires_at = ?, created_at = datetime('now')
      WHERE LOWER(email) = LOWER(?)
    `, [otpHash, otp, expiresAt, cleanEmail]);

    // Dispatch real email via SMTP concurrently
    sendOtpEmail({
      toEmail: cleanEmail,
      userName: pending.name,
      otp,
      purpose: 'ACCOUNT_VERIFICATION'
    }).catch((err) => console.error('[RESEND_OTP ERROR]', err));

    res.json({ success: true, message: `New verification code sent to ${cleanEmail}.` });
  } catch (error: any) {
    console.error('[AUTH /register/resend-otp ERROR]', error);
    res.status(500).json({ error: error.message || 'Failed to resend verification code.' });
  }
});

// 2. Verify Registration OTP & Create Account
authRouter.post('/register/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
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
  } catch (error: any) {
    console.error('[AUTH /register/verify-otp ERROR]', error);
    res.status(500).json({ error: error.message || 'Failed to verify code and create account.' });
  }
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

// 4.1. Forgot Username (Sends username & SHIORI ID to verified email)
authRouter.post('/forgot-username', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email address is required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await queryOne('SELECT username, name, shiori_id, email FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);

    // For privacy & safety, always return success message so bad actors cannot probe registered emails
    if (user) {
      sendUsernameEmail({
        toEmail: cleanEmail,
        userName: user.name,
        username: user.username,
        shioriId: user.shiori_id
      }).catch((err) => console.error('[FORGOT_USERNAME EMAIL ERROR]', err));
    }

    res.json({
      success: true,
      message: `If an account with ${cleanEmail} exists, we have sent the username to your inbox.`
    });
  } catch (error: any) {
    console.error('[FORGOT USERNAME ERROR]', error);
    res.status(500).json({ error: 'Failed to process username lookup. Please try again.' });
  }
});

// 4.2. Forgot Password - Step 1: Send Expiring OTP
authRouter.post('/forgot-password/send-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { account } = req.body; // email or username
    if (!account) {
      res.status(400).json({ error: 'Email address or username is required.' });
      return;
    }

    const cleanAccount = account.trim().toLowerCase();
    const user = await queryOne('SELECT id, email, name, username FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanAccount, cleanAccount]);

    if (!user) {
      res.status(404).json({ error: 'No SHIORI account found matching that email or username.' });
      return;
    }

    const cleanEmail = user.email.toLowerCase();
    const otp = generateSecureOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes strict expiry

    // Delete any existing reset OTP for this email first
    await runQuery('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);

    // Insert new reset OTP
    await runQuery(`
      INSERT INTO password_reset_otps (email, otp_hash, otp_plain, attempts, expires_at)
      VALUES (?, ?, ?, 0, ?)
    `, [cleanEmail, otpHash, otp, expiresAt]);

    // Dispatch real email via SMTP / Resend / Brevo
    sendOtpEmail({
      toEmail: cleanEmail,
      userName: user.name,
      otp,
      purpose: 'PASSWORD_RESET'
    }).catch((err) => console.error('[SEND_PASSWORD_RESET_OTP ERROR]', err));

    res.json({
      success: true,
      email: cleanEmail,
      maskedEmail: cleanEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      expiresInSeconds: 300,
      message: `Verification code sent to ${cleanEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}. It expires in 5 minutes.`
    });
  } catch (error: any) {
    console.error('[FORGOT PASSWORD /send-otp ERROR]', error);
    res.status(500).json({ error: 'Failed to send password reset code. Please try again.' });
  }
});

// 4.3. Forgot Password - Step 1b: Resend Expiring OTP
authRouter.post('/forgot-password/resend-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await queryOne('SELECT id, email, name, username FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const otp = generateSecureOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await runQuery('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    await runQuery(`
      INSERT INTO password_reset_otps (email, otp_hash, otp_plain, attempts, expires_at)
      VALUES (?, ?, ?, 0, ?)
    `, [cleanEmail, otpHash, otp, expiresAt]);

    sendOtpEmail({
      toEmail: cleanEmail,
      userName: user.name,
      otp,
      purpose: 'PASSWORD_RESET'
    }).catch((err) => console.error('[RESEND_PASSWORD_RESET_OTP ERROR]', err));

    res.json({
      success: true,
      expiresInSeconds: 300,
      message: `A new 5-minute verification code has been sent to ${cleanEmail}.`
    });
  } catch (error: any) {
    console.error('[FORGOT PASSWORD /resend-otp ERROR]', error);
    res.status(500).json({ error: 'Failed to resend code.' });
  }
});

// 4.4. Forgot Password - Step 2: Verify OTP & Reset Password
authRouter.post('/forgot-password/reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      res.status(400).json({ error: 'Email, verification code, and new password are required.' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).replace(/\s+/g, '');

    const pending = await queryOne('SELECT * FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    if (!pending) {
      res.status(400).json({ error: 'No active password reset request found. Please request a new code.' });
      return;
    }

    // Check expiration
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await runQuery('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    // Check attempts limit
    if (pending.attempts >= 5) {
      await runQuery('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
      res.status(400).json({ error: 'Too many incorrect attempts. Please request a fresh reset code.' });
      return;
    }

    // Verify OTP hash
    const isValid = verifyOTPHash(cleanOtp, pending.otp_hash);
    if (!isValid && cleanOtp !== pending.otp_plain) {
      await runQuery('UPDATE password_reset_otps SET attempts = attempts + 1 WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
      res.status(400).json({ error: 'Incorrect verification code. Please check your email.' });
      return;
    }

    // Update password in users table
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await runQuery('UPDATE users SET password_hash = ? WHERE LOWER(email) = LOWER(?)', [passwordHash, cleanEmail]);

    // Clean up reset OTP record
    await runQuery('DELETE FROM password_reset_otps WHERE LOWER(email) = LOWER(?)', [cleanEmail]);

    // Fetch updated user to generate login session
    const user = await queryOne('SELECT id, shiori_id, email, username, name, bio, avatar_url, theme, points, github_connected, github_username FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    
    let token = '';
    if (user) {
      token = generateToken(user);
    }

    res.json({
      success: true,
      message: 'Your password has been successfully reset. You can now sign in with your new password.',
      token: token || undefined,
      user: user || undefined
    });
  } catch (error: any) {
    console.error('[FORGOT PASSWORD /reset ERROR]', error);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
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

// 6.5. Update Settings (Appearance, Privacy, Notifications)
authRouter.patch('/settings', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const {
    ui_mode,
    matte_level,
    accent_color,
    font_family,
    privacy_tasks,
    privacy_github,
    privacy_projects,
    privacy_stats,
    eink_refresh_interval,
    sound_effects,
    web_push_enabled,
    notify_build_failed,
    notify_build_passed,
    notify_pr_review,
    notify_task_assigned
  } = req.body;

  const existing = await queryOne('SELECT user_id FROM user_settings WHERE user_id = ?', [userId]);
  if (!existing) {
    await runQuery(`
      INSERT INTO user_settings (
        user_id, ui_mode, matte_level, accent_color, font_family,
        privacy_tasks, privacy_github, privacy_stats
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      ui_mode || 'eink_matte',
      matte_level || 'natural',
      accent_color || '#2E5A36',
      font_family || 'geist',
      privacy_tasks || 'friends',
      privacy_github || 'workspace',
      privacy_stats || 'private'
    ]);
  } else {
    await runQuery(`
      UPDATE user_settings SET
        ui_mode = COALESCE(?, ui_mode),
        matte_level = COALESCE(?, matte_level),
        accent_color = COALESCE(?, accent_color),
        font_family = COALESCE(?, font_family),
        privacy_tasks = COALESCE(?, privacy_tasks),
        privacy_github = COALESCE(?, privacy_github),
        privacy_stats = COALESCE(?, privacy_stats),
        eink_refresh_interval = COALESCE(?, eink_refresh_interval),
        notify_build_failed = COALESCE(?, notify_build_failed),
        notify_build_passed = COALESCE(?, notify_build_passed),
        notify_pr_review = COALESCE(?, notify_pr_review),
        notify_task_assigned = COALESCE(?, notify_task_assigned)
      WHERE user_id = ?
    `, [
      ui_mode ?? null,
      matte_level ?? null,
      accent_color ?? null,
      font_family ?? null,
      privacy_tasks ?? null,
      privacy_github ?? null,
      privacy_stats ?? null,
      eink_refresh_interval ?? null,
      notify_build_failed ?? null,
      notify_build_passed ?? null,
      notify_pr_review ?? null,
      notify_task_assigned ?? null,
      userId
    ]);
  }

  const updatedSettings = await queryOne('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  res.json({ success: true, settings: updatedSettings });
});

// 7. Delete User Account Permanently
authRouter.delete('/account', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    // Clean up all user associated data safely
    await runQuery('DELETE FROM tasks WHERE created_by = ? OR assignee_id = ?', [userId, userId]);
    await runQuery('DELETE FROM task_comments WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM task_activity WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM project_members WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM projects WHERE created_by = ?', [userId]);
    await runQuery('DELETE FROM workspace_invitations WHERE inviter_id = ? OR invitee_id = ?', [userId, userId]);
    await runQuery('DELETE FROM workspace_verification_sessions WHERE inviter_id = ? OR invitee_id = ?', [userId, userId]);
    await runQuery('DELETE FROM workspace_members WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM workspaces WHERE creator_id = ?', [userId]);
    await runQuery('DELETE FROM user_repositories WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM github_accounts WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM connection_verification_sessions WHERE user_a_id = ? OR user_b_id = ?', [userId, userId]);
    await runQuery('DELETE FROM connection_requests WHERE sender_id = ? OR recipient_id = ?', [userId, userId]);
    await runQuery('DELETE FROM connections WHERE user_a_id = ? OR user_b_id = ?', [userId, userId]);
    await runQuery('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?', [userId, userId]);
    await runQuery('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM user_settings WHERE user_id = ?', [userId]);

    // Delete user record
    await runQuery('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'Your SHIORI account has been permanently deleted.' });
  } catch (error: any) {
    console.error('[DELETE ACCOUNT ERROR]', error);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

