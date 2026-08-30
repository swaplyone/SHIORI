import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { emitToUser } from '../services/socket.service.js';

export const projectsRouter = Router();

// GET all projects for the user (owned or member of)
projectsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const projects = await queryAll(`
    SELECT p.*,
           (SELECT COUNT(*) FROM tasks t 
            WHERE (t.project_id = p.id OR LOWER(t.github_repo) = LOWER(p.github_repo_name) OR LOWER(t.github_repo) = LOWER(p.name) OR LOWER(t.github_repo) LIKE '%' || LOWER(p.name) || '%') 
              AND (t.status != 'DONE' AND (t.user_status != 'COMPLETED' OR t.user_status IS NULL))
              AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
           ) as active_todos,
           (SELECT COUNT(*) FROM tasks t 
            WHERE (t.project_id = p.id OR LOWER(t.github_repo) = LOWER(p.github_repo_name) OR LOWER(t.github_repo) = LOWER(p.name) OR LOWER(t.github_repo) LIKE '%' || LOWER(p.name) || '%') 
              AND (t.status = 'DONE' OR t.user_status = 'COMPLETED')
              AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
           ) as completed_tasks,
           (SELECT COUNT(*) FROM tasks t 
            WHERE (t.project_id = p.id OR LOWER(t.github_repo) = LOWER(p.github_repo_name) OR LOWER(t.github_repo) = LOWER(p.name) OR LOWER(t.github_repo) LIKE '%' || LOWER(p.name) || '%')
              AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
           ) as total_tasks,
           (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as members_count
    FROM projects p
    WHERE p.created_by = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    ORDER BY p.created_at DESC
  `, [req.user!.id, req.user!.id]);

  if (projects.length === 0) {
    res.json({ projects: [] });
    return;
  }

  const projectIds = projects.map((p) => p.id);
  const placeholders = projectIds.map(() => '?').join(',');

  const allMembers = await queryAll(`
    SELECT pm.project_id, u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id IN (${placeholders})
  `, projectIds);

  const membersByProj = new Map<string, any[]>();
  for (const m of allMembers) {
    if (!membersByProj.has(m.project_id)) {
      membersByProj.set(m.project_id, []);
    }
    membersByProj.get(m.project_id)!.push(m);
  }

  const enriched = projects.map((p) => {
    const members = membersByProj.get(p.id) || [];
    return {
      ...p,
      active_todos: Number(p.active_todos || 0),
      completed_tasks: Number(p.completed_tasks || 0),
      total_tasks: Number(p.total_tasks || 0),
      membersCount: Number(p.members_count || members.length || 1),
      members,
      commitsTodayCount: 0,
      lastCommitMessage: 'Workspace repository active'
    };
  });

  res.json({ projects: enriched });
});

// GET single project with TODOs, members, and Git info
projectsRouter.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const project = await queryOne(`
    SELECT p.*,
           (SELECT COUNT(*) FROM tasks t 
            WHERE (t.project_id = p.id OR t.github_repo = p.github_repo_name OR t.github_repo = p.name OR t.github_repo LIKE '%' || p.name || '%') 
              AND (t.status != 'DONE' AND (t.user_status != 'COMPLETED' OR t.user_status IS NULL))
           ) as active_todos,
           (SELECT COUNT(*) FROM tasks t 
            WHERE (t.project_id = p.id OR t.github_repo = p.github_repo_name OR t.github_repo = p.name OR t.github_repo LIKE '%' || p.name || '%') 
              AND (t.status = 'DONE' OR t.user_status = 'COMPLETED')
           ) as completed_tasks,
           (SELECT COUNT(*) FROM tasks t 
            WHERE t.project_id = p.id OR t.github_repo = p.github_repo_name OR t.github_repo = p.name OR t.github_repo LIKE '%' || p.name || '%'
           ) as total_tasks
    FROM projects p
    WHERE p.id = ? OR p.slug = ? OR p.github_repo_name = ?
  `, [id, id, id]);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Get project members
  const members = await queryAll(`
    SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [project.id]);

  // Sync real GitHub commits and actions if repository is connected
  if (project.github_repo_name) {
    try {
      const { syncRepoLiveFromGitHub } = await import('./github.routes.js');
      await syncRepoLiveFromGitHub(req.user!.id, project.github_repo_name);
    } catch {}
  }

  // Get project TODOs (with updated evidence and commit counts)
  const todos = await queryAll(`
    SELECT t.*, u.name as assignee_name, u2.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    WHERE t.project_id = ? OR t.github_repo = ?
    ORDER BY t.created_at DESC
  `, [project.id, project.github_repo_name]);

  res.json({
    project: {
      ...project,
      members,
      membersCount: members.length
    },
    todos
  });
});

// POST Create project from a GitHub repository
projectsRouter.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repositoryName, description, defaultBranch = 'main' } = req.body;

  if (!repositoryName) {
    res.status(400).json({ error: 'GitHub repository name is required.' });
    return;
  }

  // Get user workspace
  let workspace = await queryOne('SELECT id FROM workspaces WHERE creator_id = ? LIMIT 1', [req.user!.id]);
  if (!workspace) {
    const wsId = uuidv4();
    await runQuery(`
      INSERT INTO workspaces (id, name, slug, description, creator_id)
      VALUES (?, 'Personal Workspace', ?, 'My workspace', ?)
    `, [wsId, `ws-${req.user!.username}`, req.user!.id]);
    workspace = { id: wsId };
  }

  const name = repositoryName.toUpperCase().replace(/-/g, ' ');
  const slug = repositoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `proj-${slug}-${uuidv4().slice(0, 4)}`;

  await runQuery(`
    INSERT INTO projects (id, workspace_id, name, slug, description, status, github_repo_name, github_repo_url, default_branch, created_by)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
  `, [id, workspace.id, name, slug, description || `GitHub repository project for ${repositoryName}`, repositoryName, `https://github.com/${repositoryName}`, defaultBranch, req.user!.id]);

  // Add creator as project owner
  await runQuery(`
    INSERT INTO project_members (id, project_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `, [uuidv4(), id, req.user!.id]);

  // Add to user_repositories
  await runQuery(`
    INSERT OR REPLACE INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [uuidv4(), req.user!.id, repositoryName, repositoryName, defaultBranch]);

  const created = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);
  res.status(201).json({ project: created });
});

// GET Pending project invitations for logged-in user
projectsRouter.get('/invitations/pending', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invitations = await queryAll(`
      SELECT pi.*, 
             p.name as project_name, p.slug as project_slug, p.description as project_description,
             p.github_repo_name,
             u.name as inviter_name, u.email as inviter_email, u.shiori_id as inviter_shiori_id
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      JOIN users u ON pi.inviter_id = u.id
      WHERE pi.invitee_id = ? AND pi.status = 'PENDING'
      ORDER BY pi.created_at DESC
    `, [req.user!.id]);

    res.json({ invitations: invitations || [] });
  } catch (err: any) {
    console.error('[PROJECT INVITATIONS GET ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch project invitations', invitations: [] });
  }
});

// POST Respond to project invitation (ACCEPT or DECLINE)
projectsRouter.post('/invitations/:inviteId/respond', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { inviteId } = req.params;
    const { action } = req.body; // 'ACCEPT' | 'DECLINE'

    if (!['ACCEPT', 'DECLINE'].includes(action)) {
      res.status(400).json({ error: 'Invalid action. Must be ACCEPT or DECLINE.' });
      return;
    }

    const invitation = await queryOne(`
      SELECT pi.*, p.name as project_name, p.workspace_id, u.name as inviter_name
      FROM project_invitations pi
      JOIN projects p ON pi.project_id = p.id
      JOIN users u ON pi.inviter_id = u.id
      WHERE pi.id = ? AND pi.invitee_id = ?
    `, [inviteId, req.user!.id]);

    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found or not authorized.' });
      return;
    }

    if (action === 'ACCEPT') {
      // 1. Update invitation status
      await runQuery(`
        UPDATE project_invitations 
        SET status = 'ACCEPTED', updated_at = datetime('now') 
        WHERE id = ?
      `, [inviteId]);

      // 2. Add to project_members
      const existingMember = await queryOne('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [invitation.project_id, req.user!.id]);
      if (!existingMember) {
        await runQuery(`
          INSERT INTO project_members (id, project_id, user_id, role, joined_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `, [uuidv4(), invitation.project_id, req.user!.id, invitation.role || 'member']);
      }

      // 3. Notify inviter
      const notifId = uuidv4();
      await runQuery(`
        INSERT INTO notifications (id, user_id, title, message, type, is_read, read, created_at)
        VALUES (?, ?, ?, ?, 'PROJECT_INVITATION_ACCEPTED', 0, 0, datetime('now'))
      `, [
        notifId,
        invitation.inviter_id,
        `Project Invitation Accepted ✓`,
        `${req.user!.name} accepted your invitation and joined "${invitation.project_name}".`
      ]);

      emitToUser(invitation.inviter_id, 'notification:new', {
        id: notifId,
        title: `Project Invitation Accepted ✓`,
        message: `${req.user!.name} accepted your invitation and joined "${invitation.project_name}".`,
        type: 'PROJECT_INVITATION_ACCEPTED'
      });

      res.json({
        success: true,
        message: `Accepted! You are now a member of ${invitation.project_name}.`
      });
    } else {
      // DECLINE
      await runQuery(`
        UPDATE project_invitations 
        SET status = 'DECLINED', updated_at = datetime('now') 
        WHERE id = ?
      `, [inviteId]);

      // Notify inviter of decline
      const notifId = uuidv4();
      await runQuery(`
        INSERT INTO notifications (id, user_id, title, message, type, is_read, read, created_at)
        VALUES (?, ?, ?, ?, 'PROJECT_INVITATION_DECLINED', 0, 0, datetime('now'))
      `, [
        notifId,
        invitation.inviter_id,
        `Project Invitation Declined`,
        `${req.user!.name} declined the invitation to join "${invitation.project_name}".`
      ]);

      emitToUser(invitation.inviter_id, 'notification:new', {
        id: notifId,
        title: `Project Invitation Declined`,
        message: `${req.user!.name} declined the invitation to join "${invitation.project_name}".`,
        type: 'PROJECT_INVITATION_DECLINED'
      });

      res.json({
        success: true,
        message: `Invitation to join ${invitation.project_name} declined.`
      });
    }
  } catch (err: any) {
    console.error('[PROJECT INVITATION RESPOND ERROR]', err);
    res.status(500).json({ error: 'Failed to process invitation response' });
  }
});

// GET Project members and pending invites
projectsRouter.get('/:id/members', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const members = await queryAll(`
    SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at, 'ACTIVE' as member_status
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [id]);

  const pendingInvitations = await queryAll(`
    SELECT pi.id as invitation_id, u.id, u.name, u.email, u.shiori_id, pi.role, pi.created_at, 'PENDING' as member_status
    FROM project_invitations pi
    JOIN users u ON pi.invitee_id = u.id
    WHERE pi.project_id = ? AND pi.status = 'PENDING'
  `, [id]);

  res.json({
    members: members || [],
    pendingInvitations: pendingInvitations || []
  });
});

// POST Invite Member to project by SHIORI ID / username / email
projectsRouter.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { shioriId, userId, username, email, role = 'member' } = req.body;

  const project = await queryOne('SELECT * FROM projects WHERE id = ?', [id]);
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  let targetUser = null;
  if (shioriId) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id, username FROM users WHERE UPPER(shiori_id) = UPPER(?)', [shioriId.trim()]);
  } else if (userId) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id, username FROM users WHERE id = ?', [userId]);
  } else if (username) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id, username FROM users WHERE LOWER(username) = LOWER(?)', [username.trim()]);
  } else if (email) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id, username FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  }

  if (!targetUser) {
    res.status(404).json({ error: 'User was not found. Please verify the SHIORI ID or username.' });
    return;
  }

  if (targetUser.id === req.user!.id) {
    res.status(400).json({ error: 'You are already the creator/owner of this project.' });
    return;
  }

  // Check if already an active member
  const existing = await queryOne('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [id, targetUser.id]);
  if (existing) {
    res.status(400).json({ error: `${targetUser.name} is already an active member of this project.` });
    return;
  }

  // Check if there is already a pending invitation
  const existingInvite = await queryOne('SELECT id FROM project_invitations WHERE project_id = ? AND invitee_id = ? AND status = "PENDING"', [id, targetUser.id]);
  if (existingInvite) {
    res.status(400).json({ error: `An invitation is already pending for ${targetUser.name}.` });
    return;
  }

  const inviteId = uuidv4();
  await runQuery(`
    INSERT INTO project_invitations (id, project_id, inviter_id, invitee_id, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))
  `, [inviteId, id, req.user!.id, targetUser.id, role]);

  // Create notification for target member
  const notifId = uuidv4();
  await runQuery(`
    INSERT INTO notifications (id, user_id, title, message, type, is_read, read, created_at)
    VALUES (?, ?, ?, ?, 'PROJECT_INVITATION', 0, 0, datetime('now'))
  `, [
    notifId,
    targetUser.id,
    `Project Invitation 📂`,
    `${req.user!.name} invited you to join project "${project.name}".`
  ]);

  // Emit real-time socket events
  emitToUser(targetUser.id, 'notification:new', {
    id: notifId,
    title: `Project Invitation 📂`,
    message: `${req.user!.name} invited you to join project "${project.name}".`,
    type: 'PROJECT_INVITATION',
    project_id: project.id,
    invite_id: inviteId
  });

  emitToUser(targetUser.id, 'project:invite_received', {
    inviteId,
    projectId: project.id,
    projectName: project.name,
    inviterName: req.user!.name,
    role
  });

  res.status(201).json({
    success: true,
    message: `Invitation sent to ${targetUser.name}. They will be added to the project once they accept.`,
    invitation: {
      id: inviteId,
      user: targetUser,
      status: 'PENDING'
    }
  });
});

// DELETE Member or Cancel Invitation from project
projectsRouter.delete('/:id/members/:userId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, userId } = req.params;

  await runQuery('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [id, userId]);
  await runQuery('DELETE FROM project_invitations WHERE project_id = ? AND invitee_id = ?', [id, userId]);
  
  res.json({ success: true, message: 'Member or invitation removed from project.' });
});
