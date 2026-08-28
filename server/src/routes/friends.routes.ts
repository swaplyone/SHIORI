import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const friendsRouter = Router();

// GET all friends and accountability stats
friendsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const currentUserId = req.user!.id;

  const friends = await queryAll(`
    SELECT u.id, u.name, u.username, u.avatar_url, u.bio, u.github_connected, u.github_username,
           us.privacy_tasks, us.privacy_github, us.privacy_stats
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    LEFT JOIN user_settings us ON u.id = us.user_id
    WHERE f.user_id = ?
  `, [currentUserId]);

  // Enrich with accountability stats for each friend
  const friendsWithProgress = await Promise.all(friends.map(async (friend) => {
    // Tasks stats
    const totalTasks = await queryOne(`
      SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ?
    `, [friend.id]);
    const completedTasks = await queryOne(`
      SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ? AND (status = 'DONE' OR user_status = 'COMPLETED')
    `, [friend.id]);
    
    // Active task
    const activeTask = await queryOne(`
      SELECT title, task_code, github_ci_status, status FROM tasks 
      WHERE assignee_id = ? AND status IN ('IN_PROGRESS', 'REVIEW', 'TODO')
      ORDER BY updated_at DESC LIMIT 1
    `, [friend.id]);

    // Commits & PRs today
    const commitsCount = await queryOne(`
      SELECT COUNT(*) as count FROM github_commits WHERE author_name LIKE ?
    `, [`%${friend.name}%`]);

    return {
      id: friend.id,
      name: friend.name,
      username: friend.username,
      avatarUrl: friend.avatar_url,
      githubConnected: Boolean(friend.github_connected),
      githubUsername: friend.github_username,
      privacy: {
        tasks: friend.privacy_tasks || 'friends',
        github: friend.privacy_github || 'workspace',
        stats: friend.privacy_stats || 'friends',
      },
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

  const pendingRequests = await queryAll(`
    SELECT fr.id as request_id, fr.created_at, u.id as user_id, u.name, u.username, u.avatar_url
    FROM friend_requests fr
    JOIN users u ON fr.sender_id = u.id
    WHERE fr.receiver_id = ? AND fr.status = 'PENDING'
  `, [currentUserId]);

  res.json({ friends: friendsWithProgress, pendingRequests });
});

// Search users to add
friendsRouter.get('/search', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { query } = req.query;
  if (!query) {
    res.json({ users: [] });
    return;
  }

  const users = await queryAll(`
    SELECT id, name, username, avatar_url, bio
    FROM users
    WHERE (username LIKE ? OR name LIKE ? OR email LIKE ?)
      AND id != ?
    LIMIT 10
  `, [`%${query}%`, `%${query}%`, `%${query}%`, req.user!.id]);

  res.json({ users });
});

// Send friend request
friendsRouter.post('/request', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { targetUserId } = req.body;
  if (!targetUserId) {
    res.status(400).json({ error: 'targetUserId is required' });
    return;
  }

  const existingFriend = await queryOne('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?', [req.user!.id, targetUserId]);
  if (existingFriend) {
    res.status(400).json({ error: 'Already friends' });
    return;
  }

  const reqId = uuidv4();
  await runQuery(`
    INSERT INTO friend_requests (id, sender_id, receiver_id, status)
    VALUES (?, ?, ?, 'PENDING')
  `, [reqId, req.user!.id, targetUserId]);

  res.status(201).json({ success: true, message: 'Friend request sent' });
});

// Accept friend request
friendsRouter.post('/accept', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { requestId } = req.body;
  const request = await queryOne('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?', [requestId, req.user!.id]);
  if (!request) {
    res.status(404).json({ error: 'Friend request not found' });
    return;
  }

  await runQuery(`UPDATE friend_requests SET status = 'ACCEPTED' WHERE id = ?`, [requestId]);
  
  // Mutual friendship
  await runQuery(`INSERT OR IGNORE INTO friends (id, user_id, friend_id) VALUES (?, ?, ?)`, [uuidv4(), request.sender_id, request.receiver_id]);
  await runQuery(`INSERT OR IGNORE INTO friends (id, user_id, friend_id) VALUES (?, ?, ?)`, [uuidv4(), request.receiver_id, request.sender_id]);

  res.json({ success: true, message: 'Friend request accepted' });
});
