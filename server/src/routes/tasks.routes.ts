import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { recalculateTaskEvidence } from '../services/evidence.service.js';
import { emitToWorkspace, emitToTask } from '../services/socket.service.js';

export const tasksRouter = Router();

// GET all tasks (filtered by workspace, project, status, search, repo)
tasksRouter.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { workspaceId, projectId, status, search, repo } = req.query;

    // Trigger live GitHub sync if repo is requested or project is connected
    try {
      const syncRepo = (repo as string) || 'SHIORI';
      const { syncRepoLiveFromGitHub } = await import('./github.routes.js');
      await syncRepoLiveFromGitHub(req.user!.id, syncRepo);
    } catch {}

    let sql = `
      SELECT t.*, 
             p.name as project_name, p.slug as project_slug,
             u.name as assignee_name, u.avatar_url as assignee_avatar,
             (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id) as subtasks_count,
             (SELECT COUNT(*) FROM task_subtasks WHERE task_id = t.id AND completed = 1) as subtasks_completed,
             (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) as comments_count
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assignee_id = u.id
      WHERE (
        t.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = ?)
        OR t.created_by = ?
        OR t.assignee_id = ?
      )
    `;
    const params: any[] = [req.user!.id, req.user!.id, req.user!.id];

    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }

    if (projectId) {
      sql += ' AND t.project_id = ?';
      params.push(projectId);
    }

    if (repo) {
      sql += ' AND (t.github_repo = ? OR p.github_repo_name = ?)';
      params.push(repo, repo);
    }

    if (status) {
      sql += ' AND t.status = ?';
      params.push(status);
    }

    if (search) {
      sql += ' AND (t.title LIKE ? OR t.task_code LIKE ? OR t.description LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ' ORDER BY t.task_number DESC';

    const tasks = await queryAll(sql, params);
    res.json({ tasks: tasks || [] });
  } catch (err: any) {
    console.error('[TASKS GET ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch tasks', tasks: [] });
  }
});

// GET single task details
tasksRouter.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const task = await queryOne(`
    SELECT t.*, 
           p.name as project_name, p.slug as project_slug, p.github_repo_name as project_github_repo,
           u.name as assignee_name, u.avatar_url as assignee_avatar,
           creator.name as creator_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN users creator ON t.created_by = creator.id
    WHERE t.id = ? OR t.task_code = ?
  `, [id, id.toUpperCase()]);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const subtasks = await queryAll('SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY position ASC', [task.id]);
  
  const comments = await queryAll(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.username
    FROM task_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `, [task.id]);

  const activity = await queryAll('SELECT * FROM task_activity WHERE task_id = ? ORDER BY created_at DESC', [task.id]);
  const commits = await queryAll('SELECT * FROM github_commits WHERE task_id = ? ORDER BY pushed_at DESC', [task.id]);
  const workflowRuns = await queryAll('SELECT * FROM github_workflow_runs WHERE task_id = ? ORDER BY started_at DESC', [task.id]);

  // Recalculate latest evidence summary
  const evidence = await recalculateTaskEvidence(task.id);

  res.json({
    task,
    subtasks,
    comments,
    activity,
    commits,
    workflowRuns,
    evidence
  });
});

// POST Create task
tasksRouter.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    projectId,
    workspaceId,
    title,
    description,
    status = 'TODO',
    priority = 'MEDIUM',
    assigneeId,
    dueDate,
    githubRepo,
    githubBranch
  } = req.body;

  if (!title || !projectId) {
    res.status(400).json({ error: 'Title and Project are required.' });
    return;
  }

  // Find workspace and repo name if not given
  let finalWorkspaceId = workspaceId;
  let finalGithubRepo = githubRepo;
  const project = await queryOne('SELECT workspace_id, github_repo_name, name FROM projects WHERE id = ?', [projectId]);
  if (project) {
    if (!finalWorkspaceId) finalWorkspaceId = project.workspace_id;
    if (!finalGithubRepo) finalGithubRepo = project.github_repo_name || project.name;
  }

  // Get next task number (starts from 1, format SHR-0001, SHR-0042)
  const maxRow = await queryOne('SELECT MAX(task_number) as max_num FROM tasks');
  const countRow = await queryOne('SELECT COUNT(*) as total FROM tasks');
  const nextNum = Math.max(Number(maxRow?.max_num || 0), Number(countRow?.total || 0)) + 1;
  const taskCode = `SHR-${String(nextNum).padStart(4, '0')}`;
  const taskId = uuidv4();

  await runQuery(`
    INSERT INTO tasks (
      id, task_number, task_code, project_id, workspace_id, title, description,
      status, priority, user_status, assignee_id, created_by, due_date,
      github_repo, github_branch, github_ci_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, 'TODO', ?, ?, ?,
      ?, ?, 'UNKNOWN', datetime('now'), datetime('now')
    )
  `, [
    taskId, nextNum, taskCode, projectId, finalWorkspaceId, title, description || '',
    status, priority, assigneeId || req.user!.id, req.user!.id, dueDate || 'Tomorrow',
    finalGithubRepo || null, githubBranch || null
  ]);

  // Add creation activity
  await runQuery(`
    INSERT INTO task_activity (id, task_id, user_id, action_type, summary, created_at)
    VALUES (?, ?, ?, 'CREATED', ?, datetime('now'))
  `, [uuidv4(), taskId, req.user!.id, `Task created by ${req.user!.name}`]);

  await runQuery(`
    INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text, created_at)
    VALUES (?, ?, ?, ?, ?, 'TASK', '○', ?, ?, datetime('now'))
  `, [uuidv4(), req.user!.id, finalWorkspaceId, projectId, taskId, `Task created: ${title}`, taskCode]);

  const createdTask = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  emitToWorkspace(finalWorkspaceId, 'task:created', { task: createdTask });

  res.status(201).json({ task: createdTask });
});

// GET task commit history
tasksRouter.get('/:id/commits', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await queryOne(`
      SELECT t.*, p.github_repo_name as project_github_repo
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ? OR t.task_code = ?
    `, [id, id.toUpperCase()]);

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // 1. Direct task_commits
    const directCommits = await queryAll(`
      SELECT tc.*, 
             tc.commit_sha as commit_hash,
             tc.commit_message as message,
             tc.author as author_name,
             tc.committed_at as pushed_at
      FROM task_commits tc
      WHERE tc.task_id = ?
      ORDER BY tc.committed_at DESC
    `, [task.id]);

    // 2. Linked github_commits matching task ID or SHR-XXXX code in commit message
    const repoCommits = await queryAll(`
      SELECT gc.*,
             gc.commit_hash as commit_sha,
             gc.message as commit_message,
             gc.author_name as author,
             gc.pushed_at as committed_at,
             'success' as status,
             'passed' as tests_status,
             0 as error_count
      FROM github_commits gc
      WHERE gc.task_id = ? 
         OR gc.message LIKE ? 
         OR gc.message LIKE ?
      ORDER BY gc.pushed_at DESC
    `, [task.id, `%${task.task_code}%`, `%${task.id}%`]);

    // Merge and deduplicate by SHA/hash
    const seenShas = new Set<string>();
    const allCommits: any[] = [];

    for (const c of [...directCommits, ...repoCommits]) {
      const sha = (c.commit_sha || c.commit_hash || '').toLowerCase();
      if (sha && !seenShas.has(sha)) {
        seenShas.add(sha);
        allCommits.push({
          id: c.id,
          task_id: task.id,
          commit_sha: c.commit_sha || c.commit_hash,
          commit_message: c.commit_message || c.message,
          author: c.author || c.author_name || 'Developer',
          author_username: c.author_username || null,
          author_avatar: c.author_avatar || null,
          branch: c.branch || c.branch_name || 'main',
          files_changed: Number(c.files_changed || 1),
          insertions: Number(c.insertions || 0),
          deletions: Number(c.deletions || 0),
          status: c.status || 'success',
          tests_status: c.tests_status || 'passed',
          error_count: Number(c.error_count || 0),
          error_details: c.error_details || null,
          warnings: c.warnings || null,
          ai_source: c.ai_source || null,
          committed_at: c.committed_at || c.pushed_at || new Date().toISOString(),
          created_at: c.created_at || c.pushed_at || new Date().toISOString()
        });
      }
    }

    // Sort newest first
    allCommits.sort((a, b) => new Date(b.committed_at).getTime() - new Date(a.committed_at).getTime());

    res.json({ commits: allCommits });
  } catch (err: any) {
    console.error('[TASK COMMITS ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch task commits', commits: [] });
  }
});

// POST record a commit for a task
tasksRouter.post('/:id/commits', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      commit_sha,
      commit_message,
      author,
      author_username,
      author_avatar,
      branch = 'main',
      files_changed = 1,
      insertions = 0,
      deletions = 0,
      status = 'success',
      tests_status = 'passed',
      error_count = 0,
      error_details,
      warnings,
      ai_source
    } = req.body;

    if (!commit_sha || !commit_message) {
      res.status(400).json({ error: 'commit_sha and commit_message are required' });
      return;
    }

    const task = await queryOne('SELECT * FROM tasks WHERE id = ? OR task_code = ?', [id, id.toUpperCase()]);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const commitId = uuidv4();
    await runQuery(`
      INSERT INTO task_commits (
        id, task_id, commit_sha, commit_message, author, author_username, author_avatar,
        branch, files_changed, insertions, deletions, status, tests_status,
        error_count, error_details, warnings, ai_source, committed_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, datetime('now'), datetime('now')
      )
    `, [
      commitId, task.id, commit_sha, commit_message, author || req.user!.name, author_username || req.user!.username,
      author_avatar || (req.user as any)?.avatar_url || null, branch, files_changed, insertions, deletions, status, tests_status,
      error_count, error_details || null, warnings || null, ai_source || null
    ]);

    // Update task's latest commit info
    await runQuery(`
      UPDATE tasks SET
        github_last_commit_hash = ?,
        github_last_commit_msg = ?,
        github_last_commit_author = ?,
        github_last_commit_time = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `, [commit_sha.slice(0, 7), commit_message, author || req.user!.name, task.id]);

    const createdCommit = await queryOne('SELECT * FROM task_commits WHERE id = ?', [commitId]);
    await recalculateTaskEvidence(task.id);
    emitToTask(task.id, 'task:commit_added', { commit: createdCommit });

    res.status(201).json({ commit: createdCommit });
  } catch (err: any) {
    console.error('[POST TASK COMMIT ERROR]', err);
    res.status(500).json({ error: 'Failed to record commit' });
  }
});

// PATCH Update task
tasksRouter.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const title = req.body.title;
  const description = req.body.description;
  const status = req.body.status;
  const priority = req.body.priority;
  const userStatus = req.body.userStatus || req.body.user_status || (status === 'DONE' ? 'COMPLETED' : (status ? 'IN_PROGRESS' : undefined));
  const assigneeId = req.body.assigneeId || req.body.assignee_id;
  const dueDate = req.body.dueDate || req.body.due_date;
  const githubRepo = req.body.githubRepo || req.body.github_repo;
  const githubBranch = req.body.githubBranch || req.body.github_branch;
  const githubPrNumber = req.body.githubPrNumber || req.body.github_pr_number;
  const githubPrState = req.body.githubPrState || req.body.github_pr_state;
  const githubCiStatus = req.body.githubCiStatus || req.body.github_ci_status;

  const current = await queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!current) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Detect status change
  if (status && status !== current.status) {
    await runQuery(`
      INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
      VALUES (?, ?, ?, 'STATUS_CHANGE', ?, ?, datetime('now'))
    `, [uuidv4(), id, req.user!.id, `Status changed from ${current.status} to ${status}`, `${req.user!.name} updated status`]);
  }

  const completedAtValue = status === 'DONE' ? new Date().toISOString() : (status === 'IN_PROGRESS' || status === 'TODO' ? null : current.completed_at);

  await runQuery(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      user_status = COALESCE(?, user_status),
      assignee_id = COALESCE(?, assignee_id),
      due_date = COALESCE(?, due_date),
      github_repo = COALESCE(?, github_repo),
      github_branch = COALESCE(?, github_branch),
      github_pr_number = COALESCE(?, github_pr_number),
      github_pr_state = COALESCE(?, github_pr_state),
      github_ci_status = COALESCE(?, github_ci_status),
      completed_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `, [
    title, description, status, priority, userStatus, assigneeId, dueDate,
    githubRepo, githubBranch, githubPrNumber, githubPrState, githubCiStatus,
    completedAtValue,
    id
  ]);

  const evidence = await recalculateTaskEvidence(id);
  const updated = await queryOne('SELECT * FROM tasks WHERE id = ?', [id]);

  emitToTask(id, 'task:updated', { task: updated, evidence });
  emitToWorkspace(current.workspace_id, 'task:updated', { task: updated });

  res.json({ task: updated, evidence });
});

// DELETE Task
tasksRouter.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const current = await queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!current) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  await runQuery('DELETE FROM tasks WHERE id = ?', [id]);
  emitToWorkspace(current.workspace_id, 'task:deleted', { taskId: id });
  res.json({ success: true, message: 'Task deleted' });
});

// Subtask management
tasksRouter.post('/:id/subtasks', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: 'Subtask title is required' });
    return;
  }
  const subtaskId = uuidv4();
  await runQuery(`
    INSERT INTO task_subtasks (id, task_id, title, completed, position)
    VALUES (?, ?, ?, 0, 100)
  `, [subtaskId, id, title]);

  const subtasks = await queryAll('SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY position ASC', [id]);
  res.status(201).json({ subtasks });
});

tasksRouter.patch('/:id/subtasks/:subtaskId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, subtaskId } = req.params;
  const { completed, title } = req.body;

  await runQuery(`
    UPDATE task_subtasks SET
      completed = COALESCE(?, completed),
      title = COALESCE(?, title)
    WHERE id = ? AND task_id = ?
  `, [completed !== undefined ? (completed ? 1 : 0) : null, title, subtaskId, id]);

  const subtasks = await queryAll('SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY position ASC', [id]);
  res.json({ subtasks });
});

// Comments
tasksRouter.post('/:id/comments', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Comment content is required' });
    return;
  }

  const commentId = uuidv4();
  await runQuery(`
    INSERT INTO task_comments (id, task_id, user_id, content, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `, [commentId, id, req.user!.id, content]);

  await runQuery(`
    INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
    VALUES (?, ?, ?, 'COMMENT_ADDED', ?, ?, datetime('now'))
  `, [uuidv4(), id, req.user!.id, `Comment added by ${req.user!.name}`, content]);

  const comments = await queryAll(`
    SELECT c.*, u.name as user_name, u.avatar_url as user_avatar, u.username
    FROM task_comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `, [id]);

  emitToTask(id, 'task:comment', { comments });
  res.status(201).json({ comments });
});
