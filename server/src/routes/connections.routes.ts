import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { emitToUser } from '../services/socket.service.js';
import { sendPushToUser } from '../services/push.service.js';

export const connectionsRouter = Router();

// GET My SHIORI ID & Connection profile
connectionsRouter.get('/my-id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await queryOne('SELECT shiori_id, name, username, email FROM users WHERE id = ?', [req.user!.id]);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({
    shioriId: user.shiori_id,
    name: user.name,
    username: user.username,
    email: user.email
  });
});

// Search & Lookup user by SHIORI ID, Username, or Email
connectionsRouter.post('/lookup', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { shioriId, query } = req.body;
  const searchTerm = (shioriId || query || '').trim();

  if (!searchTerm) {
    res.status(400).json({ error: 'Please enter a SHIORI ID, username, or email.' });
    return;
  }

  const cleanTerm = searchTerm.toUpperCase();
  const rawTerm = searchTerm.toLowerCase();

  // Check if searching for self
  const current = await queryOne('SELECT shiori_id, username, email FROM users WHERE id = ?', [req.user!.id]);
  if (
    current &&
    (current.shiori_id?.toUpperCase() === cleanTerm ||
      current.username?.toLowerCase() === rawTerm ||
      current.email?.toLowerCase() === rawTerm)
  ) {
    res.status(400).json({ error: 'You cannot connect with your own account.' });
    return;
  }

  // Lookup target user
  const target = await queryOne(`
    SELECT id, shiori_id, name, username, bio, avatar_url, email
    FROM users
    WHERE UPPER(shiori_id) = ? OR LOWER(username) = ? OR LOWER(email) = ?
  `, [cleanTerm, rawTerm, rawTerm]);

  if (!target) {
    res.status(404).json({ error: `No user found for "${searchTerm}".` });
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
      AND status IN ('REQUESTED', 'PENDING')
    ORDER BY created_at DESC LIMIT 1
  `, [req.user!.id, target.id, target.id, req.user!.id]);

  res.json({
    person: {
      userId: target.id,
      shioriId: target.shiori_id,
      name: target.name,
      username: target.username,
      avatarUrl: target.avatar_url,
      bio: target.bio,
      isConnected: !!existingConn,
      pendingRequest: existingReq ? { id: existingReq.id, status: existingReq.status, isOutgoing: existingReq.sender_id === req.user!.id } : null
    }
  });
});

// Send Connection Request (Asynchronous, no OTPs)
connectionsRouter.post('/request', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetShioriId, targetUserId, query } = req.body;
  const searchTerm = (targetShioriId || query || '').trim();

  let target: any = null;
  if (targetUserId) {
    target = await queryOne('SELECT id, name, username, shiori_id FROM users WHERE id = ?', [targetUserId]);
  } else if (searchTerm) {
    const cleanTerm = searchTerm.toUpperCase();
    const rawTerm = searchTerm.toLowerCase();
    target = await queryOne(`
      SELECT id, name, username, shiori_id FROM users 
      WHERE UPPER(shiori_id) = ? OR LOWER(username) = ? OR LOWER(email) = ?
    `, [cleanTerm, rawTerm, rawTerm]);
  }

  if (!target) {
    res.status(404).json({ error: 'Target user not found.' });
    return;
  }

  if (target.id === req.user!.id) {
    res.status(400).json({ error: 'Cannot send connection request to yourself.' });
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

  // Check if a pending request already exists
  const existingReq = await queryOne(`
    SELECT id, status FROM connection_requests
    WHERE sender_id = ? AND recipient_id = ? AND status IN ('REQUESTED', 'PENDING')
  `, [req.user!.id, target.id]);

  if (existingReq) {
    res.json({ success: true, requestId: existingReq.id, message: 'Connection request already sent.' });
    return;
  }

  // Create request
  const reqId = uuidv4();
  await runQuery(`
    INSERT INTO connection_requests (id, sender_id, recipient_id, status)
    VALUES (?, ?, ?, 'PENDING')
  `, [reqId, req.user!.id, target.id]);

  // Create notification for recipient
  const notifId = uuidv4();
  const senderShioriId = (await queryOne('SELECT shiori_id FROM users WHERE id = ?', [req.user!.id]))?.shiori_id;
  await runQuery(`
    INSERT INTO notifications (id, user_id, type, title, message, read, is_read)
    VALUES (?, ?, 'CONNECTION_REQUEST', 'CONNECTION REQUEST', ?, 0, 0)
  `, [notifId, target.id, `${req.user!.name} (@${req.user!.username || senderShioriId}) wants to connect with you.`]);

  // Send real-time Web Push notification to recipient
  sendPushToUser(target.id, {
    title: '🤝 Connection Request',
    body: `${req.user!.name} wants to connect with you on SHIORI.`,
    url: '/connections'
  });

  emitToUser(target.id, 'connection:request_received', {
    requestId: reqId,
    senderName: req.user!.name,
    senderUsername: req.user!.username,
    senderShioriId
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
           u.shiori_id, u.name, u.username, u.bio, u.avatar_url
    FROM connection_requests cr
    JOIN users u ON cr.sender_id = u.id
    WHERE cr.recipient_id = ? AND cr.status IN ('REQUESTED', 'PENDING')
    ORDER BY cr.created_at DESC
  `, [req.user!.id]);

  const outgoing = await queryAll(`
    SELECT cr.id, cr.status, cr.created_at, cr.recipient_id,
           u.shiori_id, u.name, u.username, u.bio, u.avatar_url
    FROM connection_requests cr
    JOIN users u ON cr.recipient_id = u.id
    WHERE cr.sender_id = ? AND cr.status IN ('REQUESTED', 'PENDING')
    ORDER BY cr.created_at DESC
  `, [req.user!.id]);

  res.json({ incoming, outgoing });
});

// Respond to Connection Request: ACCEPT or DECLINE (1-Click, No OTP)
connectionsRouter.post('/respond', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { requestId, action } = req.body;
  const normalizedAction = (action || '').toUpperCase();

  if (!requestId || !['ACCEPT', 'DECLINE', 'REJECT'].includes(normalizedAction)) {
    res.status(400).json({ error: 'requestId and valid action (ACCEPT or DECLINE) are required.' });
    return;
  }

  const connectionReq = await queryOne('SELECT * FROM connection_requests WHERE id = ?', [requestId]);
  if (!connectionReq) {
    res.status(404).json({ error: 'Connection request not found.' });
    return;
  }

  if (connectionReq.recipient_id !== req.user!.id && connectionReq.sender_id !== req.user!.id) {
    res.status(403).json({ error: 'Unauthorized to respond to this request.' });
    return;
  }

  if (normalizedAction === 'DECLINE' || normalizedAction === 'REJECT') {
    await runQuery(`UPDATE connection_requests SET status = 'DECLINED', responded_at = NOW() WHERE id = ?`, [requestId]);
    
    // Mark associated notification as read
    await runQuery(`UPDATE notifications SET read = 1, is_read = 1 WHERE user_id = ? AND type = 'CONNECTION_REQUEST'`, [req.user!.id]);

    emitToUser(connectionReq.sender_id, 'connection:request_responded', {
      requestId,
      action: 'DECLINED'
    });

    res.json({ success: true, status: 'DECLINED' });
    return;
  }

  if (normalizedAction === 'ACCEPT') {
    // 1. Mark request as accepted
    await runQuery(`UPDATE connection_requests SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ?`, [requestId]);

    // 2. Establish mutual connection records
    const connAId = uuidv4();
    const connBId = uuidv4();

    await runQuery(`
      INSERT INTO connections (id, user_a_id, user_b_id)
      VALUES (?, ?, ?)
      ON CONFLICT (user_a_id, user_b_id) DO NOTHING
    `, [connAId, connectionReq.sender_id, connectionReq.recipient_id]);

    await runQuery(`
      INSERT INTO connections (id, user_a_id, user_b_id)
      VALUES (?, ?, ?)
      ON CONFLICT (user_a_id, user_b_id) DO NOTHING
    `, [connBId, connectionReq.recipient_id, connectionReq.sender_id]);

    // 3. Mark recipient's connection notification as read
    await runQuery(`UPDATE notifications SET read = 1, is_read = 1 WHERE user_id = ? AND type = 'CONNECTION_REQUEST'`, [req.user!.id]);

    // 4. Notify sender that request was accepted
    const acceptNotifId = uuidv4();
    await runQuery(`
      INSERT INTO notifications (id, user_id, type, title, message, read, is_read)
      VALUES (?, ?, 'CONNECTION_ACCEPTED', 'CONNECTION ACCEPTED', ?, 0, 0)
    `, [acceptNotifId, connectionReq.sender_id, `${req.user!.name} accepted your connection request.`]);

    // Send Web Push notification to sender
    sendPushToUser(connectionReq.sender_id, {
      title: '🤝 Connection Accepted',
      body: `${req.user!.name} accepted your connection request on SHIORI.`,
      url: '/connections'
    });

    emitToUser(connectionReq.sender_id, 'connection:accepted', {
      requestId,
      peerId: req.user!.id,
      peerName: req.user!.name
    });

    emitToUser(connectionReq.recipient_id, 'connection:accepted', {
      requestId,
      peerId: connectionReq.sender_id
    });

    res.json({ success: true, status: 'ACCEPTED' });
  }
});

// GET Connections List (supports / and /list)
connectionsRouter.get(['/', '/list'], authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
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

  // Enrich with accountability stats
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
        totalTasks: totalTasks?.count || 0,
        completedTasks: completedTasks?.count || 0,
        commitsToday: commitsCount?.count || 0,
        prsToday: 0,
        activeTaskTitle: activeTask?.title || null,
        activeTaskCode: activeTask?.task_code || null,
        activeTaskCiStatus: activeTask?.github_ci_status || 'PASSED',
        lastActivity: 'Active on SHIORI'
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

  res.json({ success: true, message: 'Connection removed.' });
});
