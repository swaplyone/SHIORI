import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const projectsRouter = Router();

// GET all projects for the user (owned or member of)
projectsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const projects = await queryAll(`
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
           ) as total_tasks,
           (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as members_count
    FROM projects p
    WHERE p.created_by = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    ORDER BY p.created_at DESC
  `, [req.user!.id, req.user!.id]);

  // Enrich with members and commit activity
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const members = await queryAll(`
        SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
      `, [p.id]);

      const lastCommit = await queryOne(`
        SELECT * FROM github_commits WHERE repo_name = ? OR repo_name LIKE ? ORDER BY pushed_at DESC LIMIT 1
      `, [p.github_repo_name, `%${p.github_repo_name}%`]);

      const commitsCountRow = await queryOne(`
        SELECT COUNT(*) as cnt FROM github_commits 
        WHERE repo_name = ? OR repo_name LIKE ?
      `, [p.github_repo_name, `%${p.github_repo_name}%`]);

      return {
        ...p,
        active_todos: Number(p.active_todos || 0),
        completed_tasks: Number(p.completed_tasks || 0),
        total_tasks: Number(p.total_tasks || 0),
        membersCount: members.length,
        members,
        commitsTodayCount: Number(commitsCountRow?.cnt || 0),
        lastCommitMessage: lastCommit?.message || 'Workspace repository initialized'
      };
    })
  );

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

// GET Project members
projectsRouter.get('/:id/members', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const members = await queryAll(`
    SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [id]);

  res.json({ members });
});

// POST Add Member to project by SHIORI ID
projectsRouter.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { shioriId, userId } = req.body;

  let targetUser = null;
  if (shioriId) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id FROM users WHERE UPPER(shiori_id) = UPPER(?)', [shioriId.trim()]);
  } else if (userId) {
    targetUser = await queryOne('SELECT id, name, email, shiori_id FROM users WHERE id = ?', [userId]);
  }

  if (!targetUser) {
    res.status(404).json({ error: 'User with the specified SHIORI ID was not found.' });
    return;
  }

  // Check if already a member
  const existing = await queryOne('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [id, targetUser.id]);
  if (existing) {
    res.status(400).json({ error: 'User is already a member of this project.' });
    return;
  }

  await runQuery(`
    INSERT INTO project_members (id, project_id, user_id, role)
    VALUES (?, ?, ?, 'member')
  `, [uuidv4(), id, targetUser.id]);

  res.status(201).json({
    success: true,
    message: `${targetUser.name} added as project member.`,
    user: targetUser
  });
});

// DELETE Member from project
projectsRouter.delete('/:id/members/:userId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, userId } = req.params;

  await runQuery('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [id, userId]);
  res.json({ success: true, message: 'Member removed from project.' });
});
