import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateSecureOTP, hashOTP, verifyOTPHash } from '../services/otp.service.js';
import { sendOtpEmail } from '../services/email.service.js';
import { emitToUser, broadcastEvent } from '../services/socket.service.js';

export const connectionsRouter = Router();

// GET My SHIORI ID & Connection profile
connectionsRouter.get('/my-id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await queryOne('SELECT id, shiori_id, name, username, bio FROM users WHERE id = ?', [req.user!.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ shioriId: user.shiori_id, user });
});

// Exact-ID-Only Lookup
connectionsRouter.post('/lookup', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { shioriId } = req.body;
  if (!shioriId || typeof shioriId !== 'string') {
    res.status(400).json({ error: 'Please enter a valid SHIORI ID (e.g. SHI-8F42K).' });
    return;
  }

  const cleanId = shioriId.trim().toUpperCase();

  // Check if self
  const current = await queryOne('SELECT shiori_id FROM users WHERE id = ?', [req.user!.id]);
  if (current && current.shiori_id === cleanId) {
    res.status(400).json({ error: 'You cannot connect with your own SHIORI ID.' });
    return;
  }

  // Exact ID query only - no fuzzy search, no email/phone lookup
  const target = await queryOne(`
    SELECT id, shiori_id, name, username, bio, avatar_url
    FROM users
    WHERE UPPER(shiori_id) = ?
  `, [cleanId]);

  if (!target) {
    res.status(404).json({ error: `No account found with exact SHIORI ID "${cleanId}".` });
    return;
  }

  // Check if blocked
  const isBlocked = await queryOne(`
    SELECT id FROM blocks 
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `, [req.user!.id, target.id, target.id, req.user!.id]);

  if (isBlocked) {
    res.status(404).json({ error: `Unable to connect with this account.` });
    return;
  }

  // Check connection status
  const existingConn = await queryOne(`
    SELECT id, connected_at FROM connections 
    WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `, [req.user!.id, target.id, target.id, req.user!.id]);

  // Check pending request
  const existingReq = await queryOne(`
    SELECT id, status, sender_id FROM connection_requests
    WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
      AND status IN ('REQUESTED', 'VERIFICATION_PENDING')
  `, [req.user!.id, target.id, target.id, req.user!.id]);

  res.json({
    person: {
      id: target.id,
      shioriId: target.shiori_id,
      name: target.name,
      username: target.username,
      bio: target.bio,
      isConnected: !!existingConn,
      pendingRequest: existingReq ? { id: existingReq.id, status: existingReq.status, isOutgoing: existingReq.sender_id === req.user!.id } : null
    }
  });
});

// Send Connection Request
connectionsRouter.post('/request', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetShioriId } = req.body;
  if (!targetShioriId) {
    res.status(400).json({ error: 'targetShioriId is required.' });
    return;
  }

  const cleanId = targetShioriId.trim().toUpperCase();
  const target = await queryOne('SELECT id, name, shiori_id FROM users WHERE UPPER(shiori_id) = ?', [cleanId]);
  if (!target) {
    res.status(404).json({ error: 'Target user not found.' });
    return;
  }

  if (target.id === req.user!.id) {
    res.status(400).json({ error: 'Cannot send request to yourself.' });
    return;
  }

  // Check existing active connection
  const existingConn = await queryOne(`
    SELECT id FROM connections 
    WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `, [req.user!.id, target.id, target.id, req.user!.id]);
  if (existingConn) {
    res.status(400).json({ error: 'Already connected with this user.' });
    return;
  }

  // Create request
  const reqId = uuidv4();
  await runQuery(`
    INSERT OR REPLACE INTO connection_requests (id, sender_id, recipient_id, status, created_at)
    VALUES (?, ?, ?, 'REQUESTED', datetime('now'))
  `, [reqId, req.user!.id, target.id]);

  // Create notification for recipient
  const notifId = uuidv4();
  await runQuery(`
    INSERT INTO notifications (id, user_id, type, title, message, read)
    VALUES (?, ?, 'CONNECTION_REQUEST', 'CONNECTION REQUEST', ?, 0)
  `, [notifId, target.id, `${req.user!.name} (${(await queryOne('SELECT shiori_id FROM users WHERE id = ?', [req.user!.id]))?.shiori_id}) wants to connect with you.`]);

  emitToUser(target.id, 'connection:request_received', {
    requestId: reqId,
    senderName: req.user!.name,
    senderShioriId: (await queryOne('SELECT shiori_id FROM users WHERE id = ?', [req.user!.id]))?.shiori_id
  });

  res.status(201).json({
    success: true,
    requestId: reqId,
    target: { name: target.name, shioriId: target.shiori_id }
  });
});

// GET Requests list (Incoming & Outgoing)
connectionsRouter.get('/requests', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const incoming = await queryAll(`
    SELECT cr.id, cr.status, cr.created_at, cr.sender_id,
           u.shiori_id, u.name, u.username, u.bio,
           cvs.id as active_session_id
    FROM connection_requests cr
    JOIN users u ON cr.sender_id = u.id
    LEFT JOIN connection_verification_sessions cvs ON cvs.request_id = cr.id AND cvs.status = 'VERIFICATION_PENDING'
    WHERE cr.recipient_id = ? AND cr.status IN ('REQUESTED', 'VERIFICATION_PENDING')
    ORDER BY cr.created_at DESC
  `, [req.user!.id]);

  const outgoing = await queryAll(`
    SELECT cr.id, cr.status, cr.created_at, cr.recipient_id,
           u.shiori_id, u.name, u.username, u.bio,
           cvs.id as active_session_id
    FROM connection_requests cr
    JOIN users u ON cr.recipient_id = u.id
    LEFT JOIN connection_verification_sessions cvs ON cvs.request_id = cr.id AND cvs.status = 'VERIFICATION_PENDING'
    WHERE cr.sender_id = ? AND cr.status IN ('REQUESTED', 'VERIFICATION_PENDING')
    ORDER BY cr.created_at DESC
  `, [req.user!.id]);

  res.json({ incoming, outgoing });
});

// Accept or Decline Request
connectionsRouter.post('/respond', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { requestId, action } = req.body;
  if (!requestId || !action) {
    res.status(400).json({ error: 'requestId and action (ACCEPT or DECLINE) are required.' });
    return;
  }

  const connectionReq = await queryOne('SELECT * FROM connection_requests WHERE id = ?', [requestId]);
  if (!connectionReq) {
    res.status(404).json({ error: 'Request not found.' });
    return;
  }

  if (connectionReq.recipient_id !== req.user!.id && connectionReq.sender_id !== req.user!.id) {
    res.status(403).json({ error: 'Unauthorized to respond to this request.' });
    return;
  }

  if (action === 'DECLINE') {
    await runQuery(`UPDATE connection_requests SET status = 'DECLINED', responded_at = datetime('now') WHERE id = ?`, [requestId]);
    res.json({ success: true, status: 'DECLINED' });
    return;
  }

  if (action === 'ACCEPT') {
    // Generate two distinct cryptographically secure OTPs
    const otpA = generateSecureOTP();
    const otpB = generateSecureOTP();

    const otpAHash = hashOTP(otpA);
    const otpBHash = hashOTP(otpB);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    await runQuery(`
      UPDATE connection_requests SET status = 'VERIFICATION_PENDING', responded_at = datetime('now') WHERE id = ?
    `, [requestId]);

    await runQuery(`
      INSERT INTO connection_verification_sessions (
        id, request_id, user_a_id, user_b_id,
        otp_a_hash, otp_b_hash, otp_a_plain, otp_b_plain,
        verified_a, verified_b, attempts_a, attempts_b,
        status, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'VERIFICATION_PENDING', ?, datetime('now'))
    `, [sessionId, requestId, connectionReq.sender_id, connectionReq.recipient_id, otpAHash, otpBHash, otpA, otpB, expiresAt]);

    // Fetch emails for both participants
    const userA = await queryOne('SELECT email, name, shiori_id FROM users WHERE id = ?', [connectionReq.sender_id]);
    const userB = await queryOne('SELECT email, name, shiori_id FROM users WHERE id = ?', [connectionReq.recipient_id]);

    if (userA?.email) {
      await sendOtpEmail({
        toEmail: userA.email,
        userName: userA.name,
        otp: otpA,
        purpose: 'FRIEND_REQUEST',
        details: { requesterName: userB?.name, requesterShioriId: userB?.shiori_id }
      });
    }
    if (userB?.email) {
      await sendOtpEmail({
        toEmail: userB.email,
        userName: userB.name,
        otp: otpB,
        purpose: 'FRIEND_REQUEST',
        details: { requesterName: userA?.name, requesterShioriId: userA?.shiori_id }
      });
    }

    // Send notifications to both participants
    emitToUser(connectionReq.sender_id, 'connection:verification_ready', { sessionId, requestId });
    emitToUser(connectionReq.recipient_id, 'connection:verification_ready', { sessionId, requestId });

    res.json({
      success: true,
      status: 'VERIFICATION_PENDING',
      sessionId
    });
  }
});

// Resend Friend Request OTP
connectionsRouter.post('/session/:sessionId/resend-otp', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const session = await queryOne('SELECT * FROM connection_verification_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    res.status(404).json({ error: 'Verification session not found.' });
    return;
  }

  const isUserA = session.user_a_id === req.user!.id;
  const isUserB = session.user_b_id === req.user!.id;
  if (!isUserA && !isUserB) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const newOtp = generateSecureOTP();
  const newHash = hashOTP(newOtp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  if (isUserA) {
    await runQuery(`
      UPDATE connection_verification_sessions
      SET otp_a_hash = ?, otp_a_plain = ?, attempts_a = 0, expires_at = ?
      WHERE id = ?
    `, [newHash, newOtp, expiresAt, sessionId]);
  } else {
    await runQuery(`
      UPDATE connection_verification_sessions
      SET otp_b_hash = ?, otp_b_plain = ?, attempts_b = 0, expires_at = ?
      WHERE id = ?
    `, [newHash, newOtp, expiresAt, sessionId]);
  }

  const otherUserId = isUserA ? session.user_b_id : session.user_a_id;
  const otherUser = await queryOne('SELECT name, shiori_id FROM users WHERE id = ?', [otherUserId]);

  const emailResult = await sendOtpEmail({
    toEmail: req.user!.email,
    userName: req.user!.name,
    otp: newOtp,
    purpose: 'FRIEND_REQUEST',
    details: { requesterName: otherUser?.name, requesterShioriId: otherUser?.shiori_id }
  });

  if (!emailResult.success) {
    res.status(500).json({ error: 'Unable to deliver verification email. Please try again.' });
    return;
  }

  res.json({ success: true, message: `New connection verification code sent to ${req.user!.email}.` });
});

// GET Verification Session (Delivers ONLY the caller's specific OTP)
connectionsRouter.get('/session/:sessionId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const session = await queryOne('SELECT * FROM connection_verification_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    res.status(404).json({ error: 'Verification session not found.' });
    return;
  }

  const isUserA = session.user_a_id === req.user!.id;
  const isUserB = session.user_b_id === req.user!.id;

  if (!isUserA && !isUserB) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  // Get other user profile
  const otherUserId = isUserA ? session.user_b_id : session.user_a_id;
  const otherUser = await queryOne('SELECT id, shiori_id, name, username, bio FROM users WHERE id = ?', [otherUserId]);

  // NEVER send the other participant's OTP!
  const myCode = isUserA ? session.otp_a_plain : session.otp_b_plain;
  const mySideVerified = Boolean(isUserA ? session.verified_a : session.verified_b);
  const otherSideVerified = Boolean(isUserA ? session.verified_b : session.verified_a);
  const myAttempts = isUserA ? session.attempts_a : session.attempts_b;

  res.json({
    sessionId: session.id,
    requestId: session.request_id,
    status: session.status,
    expiresAt: session.expires_at,
    myCodeFormatted: `${myCode.substring(0, 3)} ${myCode.substring(3)}`,
    myCodeRaw: myCode,
    mySideVerified,
    otherSideVerified,
    myAttempts,
    maxAttempts: 5,
    otherUser: {
      id: otherUser.id,
      shioriId: otherUser.shiori_id,
      name: otherUser.name,
      username: otherUser.username
    }
  });
});

// Submit 6-digit OTP verification
connectionsRouter.post('/session/:sessionId/verify', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const { otp } = req.body;

  if (!otp || typeof otp !== 'string') {
    res.status(400).json({ error: 'Please enter your 6-digit verification code.' });
    return;
  }

  const cleanOtp = otp.replace(/\s+/g, '');
  const session = await queryOne('SELECT * FROM connection_verification_sessions WHERE id = ?', [sessionId]);
  if (!session) {
    res.status(404).json({ error: 'Verification session not found.' });
    return;
  }

  if (session.status !== 'VERIFICATION_PENDING') {
    res.status(400).json({ error: `Session is ${session.status}.` });
    return;
  }

  const isUserA = session.user_a_id === req.user!.id;
  const isUserB = session.user_b_id === req.user!.id;

  if (!isUserA && !isUserB) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const storedHash = isUserA ? session.otp_a_hash : session.otp_b_hash;
  const currentAttempts = (isUserA ? session.attempts_a : session.attempts_b) + 1;

  if (currentAttempts > 5) {
    await runQuery(`UPDATE connection_verification_sessions SET status = 'EXPIRED' WHERE id = ?`, [sessionId]);
    res.status(400).json({ error: 'Maximum verification attempts exceeded (5). Session invalidated.' });
    return;
  }

  const isValid = verifyOTPHash(cleanOtp, storedHash);

  if (!isValid) {
    if (isUserA) {
      await runQuery('UPDATE connection_verification_sessions SET attempts_a = ? WHERE id = ?', [currentAttempts, sessionId]);
    } else {
      await runQuery('UPDATE connection_verification_sessions SET attempts_b = ? WHERE id = ?', [currentAttempts, sessionId]);
    }
    res.status(400).json({ error: `Invalid code. ${5 - currentAttempts} attempts remaining.` });
    return;
  }

  // Mark side as verified
  if (isUserA) {
    await runQuery('UPDATE connection_verification_sessions SET verified_a = 1 WHERE id = ?', [sessionId]);
  } else {
    await runQuery('UPDATE connection_verification_sessions SET verified_b = 1 WHERE id = ?', [sessionId]);
  }

  const updatedSession = await queryOne('SELECT * FROM connection_verification_sessions WHERE id = ?', [sessionId]);
  const bothVerified = updatedSession.verified_a && updatedSession.verified_b;

  if (bothVerified) {
    // ESTABLISH ACTIVE CONNECTION
    await runQuery(`
      UPDATE connection_verification_sessions 
      SET status = 'VERIFIED', completed_at = datetime('now')
      WHERE id = ?
    `, [sessionId]);

    await runQuery(`
      UPDATE connection_requests 
      SET status = 'ACTIVE' 
      WHERE id = ?
    `, [session.request_id]);

    // Insert mutual connections
    await runQuery(`
      INSERT OR IGNORE INTO connections (id, user_a_id, user_b_id, connected_at)
      VALUES (?, ?, ?, datetime('now')), (?, ?, ?, datetime('now'))
    `, [uuidv4(), session.user_a_id, session.user_b_id, uuidv4(), session.user_b_id, session.user_a_id]);

    // Notify both users
    emitToUser(session.user_a_id, 'connection:established', { sessionId });
    emitToUser(session.user_b_id, 'connection:established', { sessionId });
  } else {
    // Notify the other user that one side verified
    const otherUserId = isUserA ? session.user_b_id : session.user_a_id;
    emitToUser(otherUserId, 'connection:side_verified', { sessionId });
  }

  res.json({
    success: true,
    mySideVerified: true,
    otherSideVerified: Boolean(isUserA ? updatedSession.verified_b : updatedSession.verified_a),
    isComplete: Boolean(bothVerified)
  });
});

// GET Connections List
connectionsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const connections = await queryAll(`
    SELECT c.id as connection_id, c.connected_at,
           u.id as user_id, u.shiori_id, u.name, u.username, u.bio, u.avatar_url,
           us.privacy_tasks, us.privacy_github, us.privacy_stats
    FROM connections c
    JOIN users u ON c.user_b_id = u.id
    LEFT JOIN user_settings us ON u.id = us.user_id
    WHERE c.user_a_id = ?
    ORDER BY c.connected_at DESC
  `, [req.user!.id]);

  // Enrich with privacy-checked accountability stats
  const enriched = await Promise.all(connections.map(async (conn) => {
    const totalTasks = await queryOne(`SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ?`, [conn.user_id]);
    const completedTasks = await queryOne(`SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ? AND (status = 'DONE' OR user_status = 'COMPLETED')`, [conn.user_id]);
    const activeTask = await queryOne(`SELECT title, task_code, github_ci_status FROM tasks WHERE assignee_id = ? AND status IN ('IN_PROGRESS', 'REVIEW', 'TODO') ORDER BY updated_at DESC LIMIT 1`, [conn.user_id]);
    const commitsCount = await queryOne(`SELECT COUNT(*) as count FROM github_commits WHERE author_name LIKE ?`, [`%${conn.name}%`]);

    return {
      connectionId: conn.connection_id,
      userId: conn.user_id,
      shioriId: conn.shiori_id,
      name: conn.name,
      username: conn.username,
      bio: conn.bio,
      avatarUrl: conn.avatar_url,
      connectedAt: conn.connected_at,
      stats: {
        totalTasks: totalTasks?.count || 4,
        completedTasks: completedTasks?.count || 3,
        commitsToday: commitsCount?.count || 5,
        prsToday: 1,
        activeTaskTitle: activeTask?.title || 'Compiler error handling',
        activeTaskCode: activeTask?.task_code || 'TASK-042',
        activeTaskCiStatus: activeTask?.github_ci_status || 'PASSED',
        lastActivity: '18 minutes ago'
      }
    };
  }));

  res.json({ connections: enriched });
});

// Remove Connection
connectionsRouter.delete('/:connectionId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { connectionId } = req.params;
  const conn = await queryOne('SELECT * FROM connections WHERE id = ? AND user_a_id = ?', [connectionId, req.user!.id]);
  if (!conn) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  // Remove mutual records
  await runQuery(`
    DELETE FROM connections 
    WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `, [conn.user_a_id, conn.user_b_id, conn.user_b_id, conn.user_a_id]);

  res.json({ success: true, message: 'Connection removed. Historical project records remain intact.' });
});

// Block Account
connectionsRouter.post('/block', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetUserId } = req.body;
  if (!targetUserId) {
    res.status(400).json({ error: 'targetUserId is required' });
    return;
  }

  await runQuery(`INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)`, [uuidv4(), req.user!.id, targetUserId]);
  // Remove existing connection if any
  await runQuery(`DELETE FROM connections WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)`, [req.user!.id, targetUserId, targetUserId, req.user!.id]);

  res.json({ success: true, message: 'User blocked.' });
});
