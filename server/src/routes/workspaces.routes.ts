import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../services/otp.service.js';
import { emitToUser, emitToWorkspace } from '../services/socket.service.js';

export const workspacesRouter = Router();

// GET all workspaces
workspacesRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaces = await queryAll(`
    SELECT w.*, wm.role as user_role,
           (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as members_count,
           (SELECT COUNT(*) FROM projects WHERE workspace_id = w.id) as projects_count,
           (SELECT COUNT(*) FROM tasks WHERE workspace_id = w.id) as tasks_count
    FROM workspaces w
    JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE wm.user_id = ?
    ORDER BY w.created_at ASC
  `, [req.user!.id]);

  res.json({ workspaces });
});

// GET workspace members
workspacesRouter.get('/:id/members', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const members = await queryAll(`
    SELECT wm.id as membership_id, wm.role, wm.joined_at,
           u.id as user_id, u.shiori_id, u.name, u.email, u.username, u.avatar_url, u.github_username
    FROM workspace_members wm
    JOIN users u ON wm.user_id = u.id
    WHERE wm.workspace_id = ?
    ORDER BY wm.role DESC, wm.joined_at ASC
  `, [id]);

  const invitations = await queryAll(`
    SELECT wi.*, u.name as invitee_name, u.shiori_id as invitee_shiori_id,
           wvs.id as active_session_id
    FROM workspace_invitations wi
    JOIN users u ON wi.invitee_id = u.id
    LEFT JOIN workspace_verification_sessions wvs ON wvs.invitation_id = wi.id AND wvs.status = 'VERIFICATION_PENDING'
    WHERE wi.workspace_id = ? AND wi.status IN ('PENDING', 'VERIFICATION_PENDING')
  `, [id]);

  res.json({ members, invitations });
});

// POST Create workspace
workspacesRouter.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Workspace name is required.' });
    return;
  }

  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  await runQuery(`
    INSERT INTO workspaces (id, name, slug, description, creator_id)
    VALUES (?, ?, ?, ?, ?)
  `, [id, name, slug, description || '', req.user!.id]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'creator')
  `, [uuidv4(), id, req.user!.id]);

  const created = await queryOne('SELECT * FROM workspaces WHERE id = ?', [id]);
  res.status(201).json({ workspace: created });
});

// Step 1: Send Workspace Invitation by Exact SHIORI ID
workspacesRouter.post('/:id/invite', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { shioriId } = req.body;

  if (!shioriId) {
    res.status(400).json({ error: 'Please enter the exact SHIORI ID (e.g. SHI-8F42K).' });
    return;
  }

  const cleanId = shioriId.trim().toUpperCase();
  const targetUser = await queryOne('SELECT id, name, shiori_id FROM users WHERE UPPER(shiori_id) = ?', [cleanId]);

  if (!targetUser) {
    res.status(404).json({ error: `No account found with exact SHIORI ID "${cleanId}".` });
    return;
  }

  const existingMember = await queryOne('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [id, targetUser.id]);
  if (existingMember) {
    res.status(400).json({ error: 'This user is already a member of this workspace.' });
    return;
  }

  const workspace = await queryOne('SELECT name FROM workspaces WHERE id = ?', [id]);

  const inviteId = uuidv4();
  await runQuery(`
    INSERT INTO workspace_invitations (id, workspace_id, inviter_id, invitee_id, status, created_at)
    VALUES (?, ?, ?, ?, 'PENDING', datetime('now'))
  `, [inviteId, id, req.user!.id, targetUser.id]);

  // Create notification
  await runQuery(`
    INSERT INTO notifications (id, user_id, type, title, message, read)
    VALUES (?, ?, 'WORKSPACE_INVITE', 'WORKSPACE INVITATION', ?, 0)
  `, [uuidv4(), targetUser.id, `${req.user!.name} invited you to join workspace "${workspace?.name}".`]);

  emitToUser(targetUser.id, 'workspace:invite_received', {
    inviteId,
    workspaceName: workspace?.name,
    inviterName: req.user!.name
  });

  res.status(201).json({
    success: true,
    inviteId,
    invitee: { name: targetUser.name, shioriId: targetUser.shiori_id }
  });
});

// Step 2: Accept/Decline Workspace Invitation -> Triggers Two-Sided OTP
workspacesRouter.post('/invites/:inviteId/respond', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { inviteId } = req.params;
  const { action } = req.body; // 'ACCEPT' or 'DECLINE'

  const invite = await queryOne('SELECT * FROM workspace_invitations WHERE id = ?', [inviteId]);
  if (!invite) {
    res.status(404).json({ error: 'Invitation not found.' });
    return;
  }

  if (invite.invitee_id !== req.user!.id && invite.inviter_id !== req.user!.id) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  if (action === 'DECLINE') {
    await runQuery(`UPDATE workspace_invitations SET status = 'DECLINED' WHERE id = ?`, [inviteId]);
    res.json({ success: true, status: 'DECLINED' });
    return;
  }

  if (action === 'ACCEPT') {
    // Generate two separate OTPs for Workspace Creator / Inviter and Invitee
    const otpInviter = generateSecureOTP();
    const otpInvitee = generateSecureOTP();

    const otpInviterHash = hashOTP(otpInviter);
    const otpInviteeHash = hashOTP(otpInvitee);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await runQuery(`
      UPDATE workspace_invitations SET status = 'VERIFICATION_PENDING' WHERE id = ?
    `, [inviteId]);

    await runQuery(`
      INSERT INTO workspace_verification_sessions (
        id, invitation_id, workspace_id, inviter_id, invitee_id,
        otp_inviter_hash, otp_invitee_hash, otp_inviter_plain, otp_invitee_plain,
        verified_inviter, verified_invitee, attempts_inviter, attempts_invitee,
        status, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'VERIFICATION_PENDING', ?, datetime('now'))
    `, [
      sessionId, inviteId, invite.workspace_id, invite.inviter_id, invite.invitee_id,
      otpInviterHash, otpInviteeHash, otpInviter, otpInvitee, expiresAt
    ]);

    emitToUser(invite.inviter_id, 'workspace:verification_ready', { sessionId, inviteId });
    emitToUser(invite.invitee_id, 'workspace:verification_ready', { sessionId, inviteId });

    res.json({
      success: true,
      status: 'VERIFICATION_PENDING',
      sessionId
    });
  }
});

// Step 3: Get Workspace Verification Session (Returns only caller's OTP)
workspacesRouter.get('/invites/session/:sessionId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const session = await queryOne('SELECT * FROM workspace_verification_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  const isInviter = session.inviter_id === req.user!.id;
  const isInvitee = session.invitee_id === req.user!.id;

  if (!isInviter && !isInvitee) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const workspace = await queryOne('SELECT name FROM workspaces WHERE id = ?', [session.workspace_id]);
  const otherUserId = isInviter ? session.invitee_id : session.inviter_id;
  const otherUser = await queryOne('SELECT id, shiori_id, name, username FROM users WHERE id = ?', [otherUserId]);

  const myCode = isInviter ? session.otp_inviter_plain : session.otp_invitee_plain;
  const mySideVerified = Boolean(isInviter ? session.verified_inviter : session.verified_invitee);
  const otherSideVerified = Boolean(isInviter ? session.verified_invitee : session.verified_inviter);

  res.json({
    sessionId: session.id,
    workspaceName: workspace?.name,
    myCodeFormatted: `${myCode.substring(0, 3)} ${myCode.substring(3)}`,
    myCodeRaw: myCode,
    mySideVerified,
    otherSideVerified,
    isInviter,
    otherUser
  });
});

// Step 4: Verify Workspace OTP
workspacesRouter.post('/invites/session/:sessionId/verify', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { otp } = req.body;

  const cleanOtp = (otp || '').replace(/\s+/g, '');
  const session = await queryOne('SELECT * FROM workspace_verification_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  const isInviter = session.inviter_id === req.user!.id;
  const isInvitee = session.invitee_id === req.user!.id;

  if (!isInviter && !isInvitee) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const storedHash = isInviter ? session.otp_inviter_hash : session.otp_invitee_hash;
  const isValid = verifyOTPHash(cleanOtp, storedHash);

  if (!isValid) {
    res.status(400).json({ error: 'Invalid verification code.' });
    return;
  }

  if (isInviter) {
    await runQuery('UPDATE workspace_verification_sessions SET verified_inviter = 1 WHERE id = ?', [sessionId]);
  } else {
    await runQuery('UPDATE workspace_verification_sessions SET verified_invitee = 1 WHERE id = ?', [sessionId]);
  }

  const updatedSession = await queryOne('SELECT * FROM workspace_verification_sessions WHERE id = ?', [sessionId]);
  const bothVerified = updatedSession.verified_inviter && updatedSession.verified_invitee;

  if (bothVerified) {
    await runQuery(`
      UPDATE workspace_verification_sessions 
      SET status = 'VERIFIED', completed_at = datetime('now') 
      WHERE id = ?
    `, [sessionId]);

    await runQuery(`
      UPDATE workspace_invitations 
      SET status = 'VERIFIED' 
      WHERE id = ?
    `, [session.invitation_id]);

    // Officially add user as workspace member
    await runQuery(`
      INSERT OR IGNORE INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES (?, ?, ?, 'member', datetime('now'))
    `, [uuidv4(), session.workspace_id, session.invitee_id]);

    emitToUser(session.inviter_id, 'workspace:member_joined', { workspaceId: session.workspace_id });
    emitToUser(session.invitee_id, 'workspace:member_joined', { workspaceId: session.workspace_id });
  }

  res.json({
    success: true,
    mySideVerified: true,
    otherSideVerified: Boolean(isInviter ? updatedSession.verified_invitee : updatedSession.verified_inviter),
    isComplete: Boolean(bothVerified)
  });
});
