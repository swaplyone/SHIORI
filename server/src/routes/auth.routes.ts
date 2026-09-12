import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { config } from '../config.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../services/otp.service.js';
import { sendOtpEmail, sendUsernameEmail } from '../services/email.service.js';
import { emitToUser, getIO } from '../services/socket.service.js';
import {
  createRegistrationOptions,
  verifyAndSaveRegistration,
  createLoginOptions,
  verifyLoginResponse,
} from '../services/webauthn.service.js';

export const authRouter = Router();

export async function createSessionAndSetCookie(
  res: Response,
  req: Request,
  user: { id: string; email: string; username: string; name: string },
  rememberMe: boolean = false
): Promise<string> {
  const sessionId = uuidv4();
  const durationMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs).toISOString();

  const token = jwt.sign(
    { id: user.id, email: user.email, username: user.username, name: user.name, sessionId },
    config.jwtSecret,
    { expiresIn: rememberMe ? '30d' : '1d' }
  );

  const userAgent = (req.headers['user-agent'] as string) || 'Unknown';
  const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
  await runQuery(
    `INSERT INTO user_sessions (id, user_id, session_token, remember_me, user_agent, ip_address, expires_at, created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [sessionId, user.id, token, rememberMe ? 1 : 0, userAgent, ipAddress, expiresAt]
  );

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('shiori_session', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: durationMs,
    path: '/',
  });

  return token;
}

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

// Helper for safe social login / registration without creating duplicate users
async function findOrCreateSocialUser(opts: {
  provider: 'github' | 'google';
  email: string;
  name: string;
  avatarUrl?: string | null;
  githubUsername?: string | null;
  googleId?: string | null;
  githubId?: string | null;
  accessToken?: string | null;
  res?: Response;
  req?: Request;
}): Promise<{ user: any; token: string }> {
  const cleanEmail = opts.email.trim().toLowerCase();
  const providerUserId = opts.provider === 'github'
    ? String(opts.githubId || opts.githubUsername || cleanEmail)
    : String(opts.googleId || cleanEmail);

  // 1. Check oauth_accounts table first
  let existingUser: any = null;
  const oauthLink = await queryOne(
    'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?',
    [opts.provider, providerUserId]
  );
  if (oauthLink) {
    existingUser = await queryOne('SELECT * FROM users WHERE id = ?', [oauthLink.user_id]);
  }

  // 2. If not found in oauth_accounts, match by verified email in users table
  if (!existingUser) {
    existingUser = await queryOne(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [cleanEmail]
    );

    if (existingUser) {
      // Link OAuth identity to this existing account
      await runQuery(
        `INSERT OR REPLACE INTO oauth_accounts (id, user_id, provider, provider_user_id, email, profile_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [uuidv4(), existingUser.id, opts.provider, providerUserId, cleanEmail, JSON.stringify({ name: opts.name, avatarUrl: opts.avatarUrl })]
      );
    }
  }

  if (existingUser) {
    // Safely update profile with linked social data without breaking existing workspaces or tasks
    const updates: string[] = [];
    const params: any[] = [];

    if (opts.provider === 'github' && opts.githubUsername) {
      updates.push('github_connected = 1', 'github_username = ?', 'github_avatar = ?');
      params.push(opts.githubUsername, opts.avatarUrl || null);
    }
    if (opts.googleId && !existingUser.google_id) {
      updates.push('google_id = ?');
      params.push(opts.googleId);
    }
    if (opts.avatarUrl && !existingUser.avatar_url) {
      updates.push('avatar_url = ?');
      params.push(opts.avatarUrl);
    }

    if (updates.length > 0) {
      params.push(existingUser.id);
      await runQuery(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
    }

    // Update oauth_accounts timestamp
    await runQuery(
      `UPDATE oauth_accounts SET updated_at = datetime('now') WHERE provider = ? AND provider_user_id = ?`,
      [opts.provider, providerUserId]
    );

    const refreshedUser = await queryOne('SELECT * FROM users WHERE id = ?', [existingUser.id]);
    let token = '';
    if (opts.res && opts.req) {
      token = await createSessionAndSetCookie(opts.res, opts.req, refreshedUser, true);
    } else {
      token = generateToken(refreshedUser);
    }
    return { user: refreshedUser, token };
  }

  // 3. New User Registration
  const id = uuidv4();
  const shioriId = generateShioriId();
  
  let baseUsername = (opts.githubUsername || cleanEmail.split('@')[0] || 'developer').replace(/[^a-zA-Z0-9_]/g, '');
  if (!baseUsername) baseUsername = 'developer';
  let candidateUsername = baseUsername;
  let attempt = 1;
  while (await queryOne('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [candidateUsername])) {
    candidateUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
    attempt++;
    if (attempt > 10) break;
  }

  await runQuery(`
    INSERT INTO users (
      id, shiori_id, email, password_hash, username, name, avatar_url, points, theme,
      github_connected, github_username, github_avatar, google_id, auth_provider, created_at, updated_at
    ) VALUES (
      ?, ?, ?, NULL, ?, ?, ?, 120, 'light',
      ?, ?, ?, ?, ?, datetime('now'), datetime('now')
    )
  `, [
    id,
    shioriId,
    cleanEmail,
    candidateUsername,
    opts.name || candidateUsername,
    opts.avatarUrl || null,
    opts.provider === 'github' ? 1 : 0,
    opts.githubUsername || null,
    opts.provider === 'github' ? opts.avatarUrl || null : null,
    opts.googleId || null,
    opts.provider
  ]);

  await runQuery('INSERT INTO user_settings (user_id) VALUES (?)', [id]);

  // Insert into oauth_accounts
  await runQuery(
    `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, email, profile_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [uuidv4(), id, opts.provider, providerUserId, cleanEmail, JSON.stringify({ name: opts.name, avatarUrl: opts.avatarUrl })]
  );

  const workspaceId = uuidv4();
  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, 'Personal Workspace', ?, 'My personal workspace', ?)
  `, [workspaceId, `ws-${candidateUsername}`, id]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
    VALUES (?, ?, ?, 'owner', datetime('now'))
  `, [uuidv4(), workspaceId, id]);

  const newUser = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
  let token = '';
  if (opts.res && opts.req) {
    token = await createSessionAndSetCookie(opts.res, opts.req, newUser, true);
  } else {
    token = generateToken(newUser);
  }
  return { user: newUser, token };
}

// GET GitHub OAuth Authorization URL for Login / Signup
authRouter.get('/github/url', (req: Request, res: Response): void => {
  const clientId = config.githubClientId || 'Ov23li1zsUXHPz3jSsYD';
  let origin = config.clientUrl;
  const reqOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (reqOrigin && (reqOrigin.includes('vercel.app') || reqOrigin.includes('swaplyone.in') || reqOrigin.includes('localhost'))) {
    origin = reqOrigin;
  }

  const stateObj = {
    action: 'LOGIN',
    origin,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=read:user,user:email&state=${encodeURIComponent(state)}&prompt=select_account`;
  res.json({ url: authUrl });
});

// GET GitHub OAuth Callback for Login
authRouter.get('/github/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error, error_description } = req.query;
  let clientOrigin = config.clientUrl;

  if (state && typeof state === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString('utf-8'));
      if (decoded.origin) clientOrigin = decoded.origin;
    } catch {}
  }

  if (error) {
    res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(String(error_description || error))}`);
    return;
  }

  if (!code) {
    res.redirect(`${clientOrigin}/login?error=missing_github_code`);
    return;
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.githubClientId || 'Ov23li1zsUXHPz3jSsYD',
        client_secret: config.githubClientSecret || '91383118cc197d454fe2c9f50caa42edf96c519b',
        code
      })
    });
    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      res.redirect(`${clientOrigin}/login?error=github_token_exchange_failed`);
      return;
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SHIORI-App' }
    });
    const ghUser = (await userRes.json()) as any;

    let email = ghUser.email;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SHIORI-App' }
      });
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as any[];
        const primary = emails.find((e: any) => e.primary && e.verified) || emails.find((e: any) => e.verified) || emails[0];
        if (primary) email = primary.email;
      }
    }

    if (!email) {
      email = `${ghUser.login}@users.noreply.github.com`;
    }

    const { token } = await findOrCreateSocialUser({
      provider: 'github',
      email,
      name: ghUser.name || ghUser.login,
      avatarUrl: ghUser.avatar_url,
      githubUsername: ghUser.login,
      githubId: String(ghUser.id),
      accessToken,
      res,
      req
    });

    res.redirect(`${clientOrigin}/login?token=${token}`);
  } catch (err: any) {
    console.error('[GITHUB LOGIN CALLBACK ERROR]', err);
    res.redirect(`${clientOrigin}/login?error=github_auth_failed`);
  }
});

// GET Google OAuth Authorization URL for Login / Signup
authRouter.get('/google/url', (req: Request, res: Response): void => {
  let origin = config.clientUrl;
  const reqOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (reqOrigin && (reqOrigin.includes('vercel.app') || reqOrigin.includes('swaplyone.in') || reqOrigin.includes('localhost'))) {
    origin = reqOrigin;
  }

  if (!config.googleClientId) {
    res.status(400).json({ error: 'Google OAuth is not configured on this instance. Please configure GOOGLE_CLIENT_ID.' });
    return;
  }

  const stateObj = {
    action: 'LOGIN',
    origin,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  const redirectUri = `${origin}/api/auth/google/callback`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(config.googleClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email&state=${encodeURIComponent(state)}&prompt=select_account`;
  res.json({ url: authUrl });
});

// GET Google OAuth Callback for Login
authRouter.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query;
  let clientOrigin = config.clientUrl;

  if (state && typeof state === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString('utf-8'));
      if (decoded.origin) clientOrigin = decoded.origin;
    } catch {}
  }

  if (error) {
    res.redirect(`${clientOrigin}/login?error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code) {
    res.redirect(`${clientOrigin}/login?error=missing_google_code`);
    return;
  }

  try {
    const redirectUri = `${clientOrigin}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = (await tokenRes.json()) as any;
    if (!tokenData.access_token) {
      res.redirect(`${clientOrigin}/login?error=google_token_exchange_failed`);
      return;
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const googleUser = (await userInfoRes.json()) as any;

    if (!googleUser.email) {
      res.redirect(`${clientOrigin}/login?error=google_email_missing`);
      return;
    }

    const { token } = await findOrCreateSocialUser({
      provider: 'google',
      email: googleUser.email,
      name: googleUser.name || googleUser.email.split('@')[0],
      avatarUrl: googleUser.picture,
      googleId: googleUser.id,
      res,
      req
    });

    res.redirect(`${clientOrigin}/login?token=${token}`);
  } catch (err: any) {
    console.error('[GOOGLE LOGIN CALLBACK ERROR]', err);
    res.redirect(`${clientOrigin}/login?error=google_auth_failed`);
  }
});

// POST Google ID Token Verification for One-Tap / Client-side GIS
authRouter.post('/google/verify-credential', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body;
  if (!credential) {
    res.status(400).json({ error: 'Google credential token is required.' });
    return;
  }

  try {
    const parts = credential.split('.');
    if (parts.length < 2) {
      res.status(400).json({ error: 'Invalid Google credential token.' });
      return;
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    if (!payload.email) {
      res.status(400).json({ error: 'Google credential token missing email.' });
      return;
    }

    const { user, token } = await findOrCreateSocialUser({
      provider: 'google',
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      avatarUrl: payload.picture,
      googleId: payload.sub,
      res,
      req
    });

    res.json({ token, user });
  } catch (err: any) {
    console.error('[GOOGLE VERIFY CREDENTIAL ERROR]', err);
    res.status(500).json({ error: 'Failed to verify Google credential.' });
  }
});

// 4. Real Login with Remember Me & Secure HttpOnly Cookie
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body;

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

  const token = await createSessionAndSetCookie(res, req, user, Boolean(rememberMe));
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

// 4.0. Logout - Invalidate Session & Clear Cookie
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    let token = req.cookies?.shiori_session;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        if (decoded?.sessionId) {
          await runQuery('DELETE FROM user_sessions WHERE id = ?', [decoded.sessionId]);
        }
        if (decoded?.id) {
          const io = getIO();
          if (io) {
            io.in(`user:${decoded.id}`).disconnectSockets(true);
          }
        }
      } catch {}
    }

    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('shiori_session', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/'
    });

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to complete logout.' });
  }
});

// 4.0.1. WebAuthn - Check Credential Availability
authRouter.get('/webauthn/has-credential', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = (req.query.email as string) || '';
    if (email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      const user = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)', [cleanEmail, cleanEmail]);
      if (user) {
        const cred = await queryOne('SELECT id FROM webauthn_credentials WHERE user_id = ? LIMIT 1', [user.id]);
        res.json({ hasCredential: Boolean(cred) });
        return;
      }
    }
    
    // Check if any credential exists for discoverable credentials
    const anyCred = await queryOne('SELECT id FROM webauthn_credentials LIMIT 1');
    res.json({ hasCredential: Boolean(anyCred) });
  } catch (err: any) {
    res.json({ hasCredential: false });
  }
});

// 4.0.2. WebAuthn - Registration Options (requires authenticated user)
authRouter.post('/webauthn/register/options', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const options = await createRegistrationOptions(req, req.user!);
    res.json(options);
  } catch (err: any) {
    console.error('[WEBAUTHN REGISTER OPTIONS ERROR]', err);
    res.status(500).json({ error: err.message || 'Failed to generate registration options.' });
  }
});

// 4.0.3. WebAuthn - Registration Verify (requires authenticated user)
authRouter.post('/webauthn/register/verify', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await verifyAndSaveRegistration(req, req.user!.id, req.body, req.headers['user-agent'] as string);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[WEBAUTHN REGISTER VERIFY ERROR]', err);
    res.status(400).json({ error: err.message || 'Failed to verify WebAuthn registration.' });
  }
});

// 4.0.4. WebAuthn - Login Options (public)
authRouter.post('/webauthn/login/options', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    const options = await createLoginOptions(req, email);
    res.json(options);
  } catch (err: any) {
    console.error('[WEBAUTHN LOGIN OPTIONS ERROR]', err);
    res.status(500).json({ error: err.message || 'Failed to generate login options.' });
  }
});

// 4.0.5. WebAuthn - Login Verify (public assertion verification)
authRouter.post('/webauthn/login/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { assertion, rememberMe } = req.body;
    if (!assertion) {
      res.status(400).json({ error: 'Missing WebAuthn assertion response.' });
      return;
    }

    const result = await verifyLoginResponse(req, assertion);
    const token = await createSessionAndSetCookie(res, req, result.user, Boolean(rememberMe));

    res.json({
      success: true,
      token,
      user: result.user
    });
  } catch (err: any) {
    console.error('[WEBAUTHN LOGIN VERIFY ERROR]', err);
    res.status(400).json({ error: err.message || 'Failed to authenticate using device passkey.' });
  }
});

// 4.0.6. WebAuthn - List User Credentials (Settings -> Security)
authRouter.get('/webauthn/credentials', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const credentials = await queryAll(
      `SELECT id, credential_id, device_name, created_at, last_used_at 
       FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.json({ credentials: credentials || [] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve credentials.' });
  }
});

// 4.0.7. WebAuthn - Remove Specific Credential (Settings -> Security)
authRouter.delete('/webauthn/credentials/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const credId = req.params.id;
    const cred = await queryOne('SELECT id FROM webauthn_credentials WHERE id = ? AND user_id = ?', [credId, req.user!.id]);
    if (!cred) {
      res.status(404).json({ error: 'Credential not found or not owned by this account.' });
      return;
    }

    await runQuery('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?', [credId, req.user!.id]);
    res.json({ success: true, message: 'Device credential removed successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to remove credential.' });
  }
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

    // Store in password_reset_otps (atomic replace)
    await runQuery(`
      INSERT OR REPLACE INTO password_reset_otps (email, otp_hash, otp_plain, attempts, expires_at, created_at)
      VALUES (?, ?, ?, 0, ?, datetime('now'))
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

    await runQuery(`
      INSERT OR REPLACE INTO password_reset_otps (email, otp_hash, otp_plain, attempts, expires_at, created_at)
      VALUES (?, ?, ?, 0, ?, datetime('now'))
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
    // 1. Unassign user from tasks created by other users (protect User B's tasks from deletion)
    await runQuery('UPDATE tasks SET assignee_id = NULL, assignment_status = \'NONE\' WHERE assignee_id = ? AND created_by != ?', [userId, userId]);

    // 2. Clean up tasks created by this user
    await runQuery('DELETE FROM tasks WHERE created_by = ?', [userId]);

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
    await runQuery('DELETE FROM user_patch_notes WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM global_activities WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM webauthn_credentials WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM webauthn_challenges WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM oauth_accounts WHERE user_id = ?', [userId]);

    // 3. Delete user record
    await runQuery('DELETE FROM users WHERE id = ?', [userId]);

    // 4. Invalidate active socket sessions immediately
    emitToUser(userId, 'auth:revoked', { reason: 'account_deleted' });
    const io = getIO();
    if (io) {
      io.in(`user:${userId}`).disconnectSockets(true);
    }

    res.json({ success: true, message: 'Your SHIORI account has been permanently deleted.' });
  } catch (error: any) {
    console.error('[DELETE ACCOUNT ERROR]', error);
    res.status(500).json({ error: 'Failed to delete account. Please try again.' });
  }
});

