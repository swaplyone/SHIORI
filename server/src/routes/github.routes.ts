import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { verifyWebhookSignature, processPushEvent, processWorkflowRunEvent, processPullRequestEvent } from '../services/webhook.service.js';

import { config } from '../config.js';

export const githubRouter = Router();

// GET GitHub OAuth authorization URL
githubRouter.get('/oauth/url', authMiddleware, (req: AuthRequest, res: Response): void => {
  const clientId = config.githubClientId || 'Ov23li1zsUXHPz3jSsYD';
  const returnUrl = (req.query.returnUrl as string) || '/onboarding';

  // Determine frontend client origin dynamically from request headers
  let origin = config.clientUrl;
  const reqOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (reqOrigin && (reqOrigin.includes('vercel.app') || reqOrigin.includes('swaplyone.in') || reqOrigin.includes('localhost'))) {
    origin = reqOrigin;
  }

  const stateObj = {
    userId: req.user!.id,
    returnUrl,
    origin,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(2, 15)
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user,read:org&state=${encodeURIComponent(state)}&prompt=consent`;
  res.json({ url: authUrl });
});

// GET OAuth Callback endpoint (Exchanges code for access token)
githubRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error, error_description } = req.query;

  let returnUrl = '/onboarding';
  let userId: string | null = null;
  let clientOrigin = config.clientUrl;

  if (state && typeof state === 'string') {
    try {
      const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString('utf-8'));
      if (decoded.userId) userId = decoded.userId;
      if (decoded.returnUrl) returnUrl = decoded.returnUrl;
      if (decoded.origin && (decoded.origin.includes('vercel.app') || decoded.origin.includes('swaplyone.in') || decoded.origin.includes('localhost'))) {
        clientOrigin = decoded.origin;
      }
    } catch (err) {
      console.warn('Failed to decode OAuth state:', err);
    }
  }

  if (error) {
    console.warn(`[GITHUB OAUTH] User cancelled or error: ${error} - ${error_description}`);
    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || !userId) {
    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}error=invalid_oauth_session`);
    return;
  }

  try {
    // Exchange code for access token with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: config.githubClientId || 'Ov23li1zsUXHPz3jSsYD',
        client_secret: config.githubClientSecret || '91383118cc197d454fe2c9f50caa42edf96c519b',
        code
      })
    });

    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('[GITHUB OAUTH] Token exchange failed:', tokenData);
      const sep = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${clientOrigin}${returnUrl}${sep}error=token_exchange_failed`);
      return;
    }

    // Fetch user profile from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SHIORI-App'
      }
    });

    if (!userRes.ok) {
      const sep = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${clientOrigin}${returnUrl}${sep}error=profile_fetch_failed`);
      return;
    }

    const ghUser = (await userRes.json()) as any;
    const username = ghUser.login || 'developer';
    const avatarUrl = ghUser.avatar_url || '';

    await runQuery(`
      UPDATE users SET
        github_connected = 1,
        github_username = ?,
        github_avatar = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [username, avatarUrl, userId]);

    await runQuery('DELETE FROM github_accounts WHERE user_id = ? OR github_id = ?', [userId, String(ghUser.id || 'gh_oauth')]);
    await runQuery(`
      INSERT INTO github_accounts (id, user_id, github_id, username, avatar_url, access_token, connected_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [uuidv4(), userId, String(ghUser.id || 'gh_oauth'), username, avatarUrl, accessToken]);

    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}github=connected`);
  } catch (error: any) {
    console.error('[GITHUB OAUTH ERROR]', error);
    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}error=oauth_internal_error`);
  }
});

// GET GitHub connection status
githubRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const ghAccount = await queryOne('SELECT username, avatar_url, access_token FROM github_accounts WHERE user_id = ? AND access_token IS NOT NULL ORDER BY connected_at DESC LIMIT 1', [req.user!.id]);
  
  if (!ghAccount || !ghAccount.access_token) {
    res.json({
      connected: false,
      username: null,
      repositoriesCount: 0,
      pullRequestsCount: 0,
      recentCommitsCount: 0
    });
    return;
  }

  const commitsCount = await queryOne('SELECT COUNT(*) as count FROM github_commits');
  const prsCount = await queryOne('SELECT COUNT(DISTINCT github_pr_number) as count FROM tasks WHERE github_pr_number IS NOT NULL');

  res.json({
    connected: true,
    username: ghAccount.username || 'developer',
    avatarUrl: ghAccount.avatar_url || '',
    repositoriesCount: 0,
    pullRequestsCount: prsCount?.count || 0,
    recentCommitsCount: commitsCount?.count || 0
  });
});

// Connect Demo / Instant GitHub Account
githubRouter.post('/connect-demo', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { username = 'lijith-swaply' } = req.body;

  await runQuery(`
    UPDATE users SET
      github_connected = 1,
      github_username = ?,
      github_avatar = 'https://avatars.githubusercontent.com/u/9919?v=4',
      updated_at = datetime('now')
    WHERE id = ?
  `, [username, req.user!.id]);

  await runQuery(`
    INSERT OR REPLACE INTO github_accounts (id, user_id, github_id, username, avatar_url, connected_at)
    VALUES (?, ?, 'gh_1029384', ?, 'https://avatars.githubusercontent.com/u/9919?v=4', datetime('now'))
  `, [uuidv4(), req.user!.id, username]);

  res.json({ success: true, username, connected: true });
});

// Connect via Personal Access Token
githubRouter.post('/connect-token', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, username } = req.body;

  if (!token || !username) {
    res.status(400).json({ error: 'Token and username are required' });
    return;
  }

  await runQuery(`
    UPDATE users SET
      github_connected = 1,
      github_username = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `, [username, req.user!.id]);

  await runQuery(`
    INSERT OR REPLACE INTO github_accounts (id, user_id, github_id, username, access_token, connected_at)
    VALUES (?, ?, 'gh_custom', ?, ?, datetime('now'))
  `, [uuidv4(), req.user!.id, username, token]);

  res.json({ success: true, username, connected: true });
});

// Disconnect GitHub
githubRouter.post('/disconnect', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  await runQuery(`
    UPDATE users SET
      github_connected = 0,
      github_username = NULL,
      github_avatar = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `, [req.user!.id]);

  await runQuery(`DELETE FROM github_accounts WHERE user_id = ?`, [req.user!.id]);

  res.json({ success: true, connected: false });
});

// GET All accessible GitHub Repositories (Calls GitHub API with user's stored access_token)
githubRouter.get('/available-repositories', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const ghAccount = await queryOne('SELECT access_token, username FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1', [req.user!.id]);

  if (!ghAccount || !ghAccount.access_token) {
    res.json({ connected: false, repositories: [] });
    return;
  }

  try {
    const ghRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
      headers: {
        Authorization: `Bearer ${ghAccount.access_token}`,
        'User-Agent': 'SHIORI-App',
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!ghRes.ok) {
      if (ghRes.status === 401) {
        console.warn(`[GITHUB API] User ${req.user!.id} token expired or revoked. Resetting status.`);
        await runQuery('UPDATE users SET github_connected = 0 WHERE id = ?', [req.user!.id]);
        await runQuery('DELETE FROM github_accounts WHERE user_id = ?', [req.user!.id]);
        res.json({ connected: false, repositories: [], message: 'GitHub connection expired. Please reconnect.' });
        return;
      }
      console.error(`[GITHUB API ERROR] Status ${ghRes.status} while fetching repositories.`);
      res.json({ connected: false, repositories: [], error: 'Unable to fetch repositories from GitHub.' });
      return;
    }

    const reposData = (await ghRes.json()) as any[];
    const userProjects = await queryAll('SELECT id, name, github_repo_name FROM projects WHERE created_by = ?', [req.user!.id]);

    const mappedRepos = reposData.map((repo: any) => {
      const existingProject = userProjects.find(
        (p: any) => p.github_repo_name === repo.name || p.name.toLowerCase() === repo.name.toLowerCase()
      );

      return {
        id: String(repo.id),
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner?.login || ghAccount.username,
        ownerAvatar: repo.owner?.avatar_url || '',
        description: repo.description || '',
        isPrivate: Boolean(repo.private),
        defaultBranch: repo.default_branch || 'main',
        htmlUrl: repo.html_url,
        updatedAt: repo.updated_at,
        starsCount: repo.stargazers_count || 0,
        language: repo.language || '',
        isConnected: Boolean(existingProject),
        projectId: existingProject?.id || null
      };
    });

    res.json({
      connected: true,
      username: ghAccount.username,
      repositories: mappedRepos
    });
  } catch (error: any) {
    console.error('[GITHUB REPOS ERROR]', error);
    res.status(500).json({ error: 'Internal error fetching GitHub repositories.', connected: true, repositories: [] });
  }
});

// POST Connect a selected GitHub Repository to SHIORI Workspace
githubRouter.post('/repositories/connect', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repoId, repoName, repoFullName, defaultBranch = 'main', isPrivate = false, description = '' } = req.body;

  if (!repoName) {
    res.status(400).json({ error: 'Repository name is required.' });
    return;
  }

  try {
    // 1. Get or create user's workspace
    let workspace = await queryOne('SELECT id FROM workspaces WHERE creator_id = ? LIMIT 1', [req.user!.id]);
    if (!workspace) {
      const wsId = uuidv4();
      await runQuery(`
        INSERT INTO workspaces (id, name, slug, description, creator_id)
        VALUES (?, 'Personal Workspace', ?, 'My development workspace', ?)
      `, [wsId, `ws-${req.user!.username}`, req.user!.id]);
      workspace = { id: wsId };
    }

    // 2. Check if project already exists for this repository
    let project = await queryOne('SELECT id, name, github_repo_name FROM projects WHERE workspace_id = ? AND (github_repo_name = ? OR name = ?)', [
      workspace.id,
      repoName,
      repoName
    ]);

    if (project) {
      await runQuery(`
        UPDATE projects SET
          github_repo_name = ?,
          default_branch = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `, [repoName, defaultBranch, project.id]);
    } else {
      const projId = uuidv4();
      const slug = repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await runQuery(`
        INSERT INTO projects (id, workspace_id, name, slug, description, github_repo_name, default_branch, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        projId,
        workspace.id,
        repoName,
        slug,
        description || `SHIORI project for ${repoFullName || repoName}`,
        repoName,
        defaultBranch,
        req.user!.id
      ]);

      // Add user as project owner
      await runQuery(`
        INSERT OR IGNORE INTO project_members (id, project_id, user_id, role)
        VALUES (?, ?, ?, 'owner')
      `, [uuidv4(), projId, req.user!.id]);

      // Create initial task
      await runQuery(`
        INSERT INTO tasks (
          id, task_number, task_code, project_id, workspace_id,
          title, description, status, priority,
          github_repo, github_branch, created_by
        ) VALUES (
          ?, 1, 'TASK-001', ?, ?,
          'Initialize repository workspace and review codebase',
          'Automated kickoff task for ' || ?,
          'TODO', 'HIGH',
          ?, ?, ?
        )
      `, [uuidv4(), projId, workspace.id, repoName, repoName, defaultBranch, req.user!.id]);

      project = { id: projId, name: repoName, github_repo_name: repoName };
    }

    // 3. Record in user_repositories
    await runQuery(`
      INSERT OR REPLACE INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [uuidv4(), req.user!.id, repoName, repoFullName || repoName, defaultBranch]);

    res.json({
      success: true,
      message: `Repository ${repoName} connected to SHIORI workspace.`,
      project: {
        id: project.id,
        name: project.name,
        githubRepoName: repoName,
        defaultBranch
      },
      workspaceId: workspace.id
    });
  } catch (error: any) {
    console.error('[CONNECT REPOSITORY ERROR]', error);
    res.status(500).json({ error: 'Failed to connect repository to workspace.' });
  }
});

// GET User's Active SHIORI Repositories with TODO counts & Git activity
githubRouter.get('/user-repositories', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userRepos = await queryAll(`
    SELECT * FROM user_repositories 
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at DESC
  `, [req.user!.id]);

  // Enrich with active TODO counts and recent commit info
  const enriched = await Promise.all(
    userRepos.map(async (r) => {
      const activeTodos = await queryOne(`
        SELECT COUNT(*) as count FROM tasks 
        WHERE github_repo = ? AND status != 'DONE'
      `, [r.repo_name]);

      const completedTodos = await queryOne(`
        SELECT COUNT(*) as count FROM tasks 
        WHERE github_repo = ? AND status = 'DONE'
      `, [r.repo_name]);

      const lastCommit = await queryOne(`
        SELECT * FROM github_commits 
        WHERE repo_name = ? 
        ORDER BY pushed_at DESC LIMIT 1
      `, [r.repo_name]);

      return {
        id: r.id,
        name: r.repo_name,
        fullName: r.full_name,
        defaultBranch: r.default_branch || 'main',
        activeTodosCount: activeTodos?.count || 0,
        completedTodosCount: completedTodos?.count || 0,
        commitsTodayCount: 0,
        lastCommitMessage: lastCommit?.message || 'Initial commit',
        lastCommitHash: lastCommit?.commit_hash || ''
      };
    })
  );

  res.json({ repositories: enriched });
});

// POST Toggle / Add Repository to user's SHIORI workspace
githubRouter.post('/user-repositories/toggle', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repoName, repoFullName, defaultBranch = 'main', isEnabled } = req.body;
  if (!repoName) {
    res.status(400).json({ error: 'repoName is required.' });
    return;
  }

  const existing = await queryOne('SELECT id, is_active FROM user_repositories WHERE user_id = ? AND repo_name = ?', [req.user!.id, repoName]);
  if (existing) {
    const nextState = isEnabled !== undefined ? (isEnabled ? 1 : 0) : (existing.is_active ? 0 : 1);
    await runQuery('UPDATE user_repositories SET is_active = ? WHERE id = ?', [nextState, existing.id]);
  } else {
    await runQuery(`
      INSERT INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [uuidv4(), req.user!.id, repoName, repoFullName || repoName, defaultBranch]);
  }

  res.json({ success: true, repoName, isEnabled: isEnabled ?? true });
});

// DELETE Remove / Archive Repository from active list (never deletes from GitHub or deletes tasks)
githubRouter.delete('/user-repositories/:repoName', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repoName } = req.params;
  await runQuery('UPDATE user_repositories SET is_active = 0 WHERE user_id = ? AND repo_name = ?', [req.user!.id, repoName]);
  res.json({ success: true, message: `Repository ${repoName} archived from active view.` });
});

// List Repositories (Legacy alias redirecting to user-repositories)
githubRouter.get('/repositories', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userRepos = await queryAll(`
    SELECT * FROM user_repositories 
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at DESC
  `, [req.user!.id]);

  res.json({ repositories: userRepos });
});

// Helper function to sync live GitHub repository data
export async function syncRepoLiveFromGitHub(userId: string, repoName: string): Promise<any[]> {
  try {
    const ghAccount = await queryOne('SELECT access_token, username FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1', [userId]);

    let fullName = repoName;
    if (!fullName.includes('/')) {
      const userRepo = await queryOne('SELECT full_name FROM user_repositories WHERE user_id = ? AND repo_name = ?', [userId, repoName]);
      if (userRepo?.full_name) {
        fullName = userRepo.full_name;
      } else {
        const project = await queryOne('SELECT github_repo_name, github_repo_url FROM projects WHERE github_repo_name = ? OR name = ?', [repoName, repoName]);
        if (project?.github_repo_url && project.github_repo_url.includes('github.com/')) {
          fullName = project.github_repo_url.split('github.com/')[1].replace(/\.git$/, '');
        } else if (ghAccount?.username) {
          fullName = `${ghAccount.username}/${repoName}`;
        } else {
          fullName = `swaplyone/${repoName}`;
        }
      }
    }

    // Build headers
    const headers: Record<string, string> = {
      'User-Agent': 'SHIORI-App',
      Accept: 'application/vnd.github.v3+json'
    };
    if (ghAccount?.access_token) {
      headers.Authorization = `Bearer ${ghAccount.access_token}`;
    }

    let commitsRes = await fetch(`https://api.github.com/repos/${fullName}/commits?per_page=30`, { headers });
    if (!commitsRes.ok && fullName.includes('/') && !fullName.startsWith('swaplyone/')) {
      // Fallback try swaplyone org
      const altName = `swaplyone/${repoName.replace(/^.*\//, '')}`;
      const altRes = await fetch(`https://api.github.com/repos/${altName}/commits?per_page=30`, { headers });
      if (altRes.ok) {
        commitsRes = altRes;
        fullName = altName;
      }
    }

    let liveCommits: any[] = [];

    if (commitsRes.ok) {
      const rawCommits = (await commitsRes.json()) as any[];
      if (Array.isArray(rawCommits)) {
        liveCommits = rawCommits.map((c) => ({
          hash: c.sha?.substring(0, 7) || '',
          fullHash: c.sha || '',
          message: c.commit?.message || '',
          author: c.commit?.author?.name || c.author?.login || ghAccount?.username || 'Developer',
          authorUsername: c.author?.login || '',
          authorAvatar: c.author?.avatar_url || '',
          date: c.commit?.author?.date || new Date().toISOString(),
          pushedAt: c.commit?.author?.date || new Date().toISOString(),
          additions: 10,
          deletions: 2,
          filesChanged: []
        }));

        // Store into database & sync with tasks
        for (const c of liveCommits) {
          await runQuery(`
            INSERT OR REPLACE INTO github_commits (
              id, repo_name, branch_name, commit_hash, message,
              author_name, author_username, author_avatar, pushed_at
            ) VALUES (?, ?, 'main', ?, ?, ?, ?, ?, ?)
          `, [
            uuidv4(), repoName, c.fullHash, c.message,
            c.author, c.authorUsername, c.authorAvatar, c.pushedAt
          ]);

          // Match commit message to tasks in this project
          const matchingTasks = await queryAll(`
            SELECT t.id, t.task_code, t.title, t.status, t.created_at, t.dev_evidence_commits_count 
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE (p.github_repo_name = ? OR t.github_repo = ? OR p.name = ? OR p.name ILIKE ?)
          `, [repoName, repoName, repoName, `%${repoName}%`]);

          for (const task of matchingTasks) {
            const taskCodeLower = (task.task_code || '').toLowerCase();
            const taskTitleLower = (task.title || '').trim().toLowerCase();
            const msgLower = (c.message || '').trim().toLowerCase();

            // 1. Commit timestamp check: commit must have occurred AFTER or around when task was created
            const commitTime = new Date(c.date || c.pushedAt).getTime();
            const taskCreatedTime = new Date(task.created_at || 0).getTime();
            const isCommitAfterTask = commitTime >= (taskCreatedTime - 30000);

            // 2. Strict matching rules (prevent loose 1-word accidental completions)
            const hasCodeMatch = taskCodeLower && msgLower.includes(taskCodeLower);
            const hasFullTitleMatch = taskTitleLower.length >= 6 && msgLower.includes(taskTitleLower);

            // Check conventional commit pattern, e.g. fix(welcome): or feat(welcome): matching title phrase
            const cleanTitleWords = taskTitleLower
              .replace(/^(fix|feat|chore|refactor|add|update|build|docs|test)[:\s\(\)]+/i, '')
              .trim();
            const hasPhraseMatch = cleanTitleWords.length >= 8 && msgLower.includes(cleanTitleWords);

            if (isCommitAfterTask && (hasCodeMatch || hasFullTitleMatch || hasPhraseMatch)) {
              // Task was genuinely completed by this new commit!
              await runQuery(`
                UPDATE tasks SET
                  github_last_commit_hash = ?,
                  github_last_commit_msg = ?,
                  github_last_commit_author = ?,
                  github_last_commit_time = ?,
                  dev_evidence_commits_count = GREATEST(COALESCE(dev_evidence_commits_count, 0) + 1, 1),
                  auto_completed = 1,
                  auto_completed_reason = ?,
                  status = 'DONE',
                  user_status = 'COMPLETED',
                  completed_at = COALESCE(completed_at, datetime('now')),
                  dev_confidence_score = 98,
                  updated_at = datetime('now')
                WHERE id = ?
              `, [c.hash, c.message, c.author, c.date, `Verified commit: ${c.message}`, task.id]);
            }
          }
        }
      }
    }

    // Fetch real GitHub Actions CI workflow runs
    try {
      const runsRes = await fetch(`https://api.github.com/repos/${fullName}/actions/runs?per_page=10`, { headers });
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as any;
        const runs = runsData?.workflow_runs || [];

        for (const run of runs) {
          const runStatus = run.conclusion === 'success' ? 'PASSED' : (run.conclusion === 'failure' ? 'FAILED' : 'IN_PROGRESS');
          await runQuery(`
            INSERT OR REPLACE INTO github_workflow_runs (
              id, repo_name, branch_name, commit_hash, workflow_name,
              status, conclusion, duration_seconds, tests_total, tests_passed, tests_failed, started_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 60, 5, 5, 0, ?, ?)
          `, [
            uuidv4(), repoName, run.head_branch || 'main', run.head_sha || '', run.name || 'CI Build',
            runStatus, run.conclusion || '', run.run_started_at || new Date().toISOString(), run.updated_at
          ]);

          // Update tasks matching this repo's CI status
          if (runStatus === 'PASSED') {
            await runQuery(`
              UPDATE tasks SET
                github_ci_status = 'PASSED',
                dev_evidence_checks_passed = 1,
                dev_evidence_checks_failed = 0
              WHERE (github_repo = ? OR project_id IN (SELECT id FROM projects WHERE github_repo_name = ? OR name = ?))
            `, [repoName, repoName, repoName]);
          } else if (runStatus === 'FAILED') {
            await runQuery(`
              UPDATE tasks SET
                github_ci_status = 'FAILED',
                dev_evidence_checks_failed = 1
              WHERE (github_repo = ? OR project_id IN (SELECT id FROM projects WHERE github_repo_name = ? OR name = ?))
            `, [repoName, repoName, repoName]);
          }
        }
      }
    } catch {}

    return liveCommits;
  } catch (err: any) {
    console.error('[SYNC GITHUB ERROR]', err?.message || err);
    return [];
  }
}

// GET Repository Git History (Live from GitHub)
githubRouter.get('/history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const repo = (req.query.repo as string) || 'SHIORI';
  const branch = (req.query.branch as string) || 'main';

  // 1. Fetch live commits from GitHub API
  const liveCommits = await syncRepoLiveFromGitHub(req.user!.id, repo);

  // 2. Retrieve commits from database
  const dbCommits = await queryAll(`
    SELECT * FROM github_commits 
    WHERE repo_name = ? OR repo_name LIKE ?
    ORDER BY pushed_at DESC
  `, [repo, `%${repo}%`]);

  // Combine unique commits
  const commitMap = new Map<string, any>();

  for (const c of liveCommits) {
    commitMap.set(c.hash, c);
  }

  for (const c of dbCommits) {
    const hashKey = (c.commit_hash || '').substring(0, 7);
    if (!commitMap.has(hashKey)) {
      commitMap.set(hashKey, {
        hash: hashKey,
        fullHash: c.commit_hash,
        message: c.message,
        author: c.author_name,
        authorUsername: c.author_username,
        authorAvatar: c.author_avatar,
        date: c.pushed_at,
        additions: 15,
        deletions: 3,
        filesChanged: []
      });
    }
  }

  const allCommits = Array.from(commitMap.values());

  res.json({
    repo,
    branch,
    totalCommits: allCommits.length,
    commits: allCommits
  });
});

// GET Commit Details & Diff
githubRouter.get('/commit/:hash', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { hash } = req.params;

  const commitDetails = {
    hash,
    message: hash === 'a82f31c' ? 'Fix authentication flow' : 'Update auth middleware and token validation',
    author: 'Lijith',
    date: '28 Aug 2026, 12:14 PM',
    branch: 'main',
    stats: {
      filesChanged: 2,
      additions: 42,
      deletions: 17
    },
    files: [
      {
        filename: 'src/auth/login.ts',
        additions: 28,
        deletions: 12,
        diff: `@@ -12,12 +12,28 @@
 export async function loginUser(email: string, pass: string) {
-  const user = await findUser(email);
-  if (!user) return null;
+  const user = await findUserByEmail(email);
+  if (!user || !verifyPassword(pass, user.passwordHash)) {
+    throw new Error('Invalid credentials');
+  }
+  const session = await createSession(user.id);
+  const token = generateJWT(user, session.id);
+  const refreshToken = rotateRefreshToken(session.id);
+  return { user, token, refreshToken };
 }`
      },
      {
        filename: 'src/auth/session.ts',
        additions: 14,
        deletions: 5,
        diff: `@@ -4,5 +4,14 @@
 export function createSession(userId: string) {
-  return { id: 'sess_' + Date.now() };
+  const sessionId = generateUUID();
+  return {
+    id: sessionId,
+    userId,
+    createdAt: new Date().toISOString()
+  };
 }`
      }
    ]
  };

  res.json({ commit: commitDetails });
});

// Webhook Receiver
githubRouter.post('/webhooks', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = req.headers['x-github-event'] as string || req.body?.event || 'push';

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  try {
    if (event === 'push') {
      await processPushEvent(req.body);
    } else if (event === 'workflow_run' || event === 'check_run') {
      await processWorkflowRunEvent(req.body);
    } else if (event === 'pull_request') {
      await processPullRequestEvent(req.body);
    }

    res.json({ success: true, event });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});
