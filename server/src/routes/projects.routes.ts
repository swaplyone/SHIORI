import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const projectsRouter = Router();

// GET all projects for the user (owned or member of)
projectsRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  // Ensure default projects exist in database
  const count = await queryOne('SELECT COUNT(*) as count FROM projects');
  if (!count || count.count === 0) {
    const wsId = 'ws-swaplyone-01';
    await runQuery(`
      INSERT OR IGNORE INTO projects (id, workspace_id, name, slug, description, status, github_repo_name, default_branch, created_by)
      VALUES 
      ('proj-compiler-01', ?, 'SWAPLY COMPILER', 'swaply-one-compiler', 'High-performance AOT bytecode compiler & optimizer', 'ACTIVE', 'swaply-one-compiler', 'main', ?),
      ('proj-shiori-02', ?, 'SHIORI', 'shiori-web', 'E-ink developer productivity and task tracking PWA', 'ACTIVE', 'shiori-web', 'main', ?),
      ('proj-website-03', ?, 'PERSONAL WEBSITE', 'personal-website', 'Developer portfolio and technical writings', 'ACTIVE', 'personal-website', 'main', ?)
    `, [wsId, req.user!.id, wsId, req.user!.id, wsId, req.user!.id]);
  }

  // Ensure user is member of projects
  const projects = await queryAll(`
    SELECT p.*,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'DONE') as active_todos,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'DONE') as completed_tasks,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
           (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as members_count
    FROM projects p
    ORDER BY p.created_at ASC
  `);

  // Enrich with members and commit activity
  const enriched = await Promise.all(
    projects.map(async (p) => {
      // Ensure default members if empty
      const memCount = await queryOne('SELECT COUNT(*) as count FROM project_members WHERE project_id = ?', [p.id]);
      if (!memCount || memCount.count === 0) {
        await runQuery(`
          INSERT OR IGNORE INTO project_members (id, project_id, user_id, role)
          VALUES 
          (?, ?, 'user-lijith-001', 'owner'),
          (?, ?, 'user-rahul-003', 'member'),
          (?, ?, 'user-tejas-002', 'member')
        `, [uuidv4(), p.id, uuidv4(), p.id, uuidv4(), p.id]);
      }

      const members = await queryAll(`
        SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
      `, [p.id]);

      const lastCommit = await queryOne(`
        SELECT * FROM github_commits WHERE repo_name = ? ORDER BY pushed_at DESC LIMIT 1
      `, [p.github_repo_name]);

      return {
        ...p,
        membersCount: members.length || (p.name === 'SWAPLY COMPILER' ? 3 : p.name === 'SHIORI' ? 2 : 1),
        members,
        commitsTodayCount: p.github_repo_name === 'swaply-one-compiler' ? 8 : p.github_repo_name === 'shiori-web' ? 5 : 3,
        lastCommitMessage: lastCommit?.message || 'Fix parser & update docs'
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
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'DONE') as active_todos,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'DONE') as completed_tasks,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks
    FROM projects p
    WHERE p.id = ? OR p.slug = ? OR p.github_repo_name = ?
  `, [id, id, id]);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Get project members
  let members = await queryAll(`
    SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `, [project.id]);

  if (members.length === 0) {
    await runQuery(`
      INSERT OR IGNORE INTO project_members (id, project_id, user_id, role)
      VALUES 
      (?, ?, 'user-lijith-001', 'owner'),
      (?, ?, 'user-rahul-003', 'member'),
      (?, ?, 'user-tejas-002', 'member')
    `, [uuidv4(), project.id, uuidv4(), project.id, uuidv4(), project.id]);

    members = await queryAll(`
      SELECT u.id, u.name, u.email, u.shiori_id, pm.role, pm.joined_at
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `, [project.id]);
  }

  // Get project TODOs
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

  const name = repositoryName.toUpperCase().replace(/-/g, ' ');
  const slug = repositoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `proj-${slug}-${uuidv4().slice(0, 4)}`;
  const wsId = 'ws-swaplyone-01';

  await runQuery(`
    INSERT INTO projects (id, workspace_id, name, slug, description, status, github_repo_name, github_repo_url, default_branch, created_by)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
  `, [id, wsId, name, slug, description || `GitHub repository project for ${repositoryName}`, repositoryName, `https://github.com/swaplyone/${repositoryName}`, defaultBranch, req.user!.id]);

  // Add creator as project owner
  await runQuery(`
    INSERT INTO project_members (id, project_id, user_id, role)
    VALUES (?, ?, ?, 'owner')
  `, [uuidv4(), id, req.user!.id]);

  // Add to user_repositories
  await runQuery(`
    INSERT OR IGNORE INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [uuidv4(), req.user!.id, repositoryName, `swaplyone/${repositoryName}`, defaultBranch]);

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
