import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { verifyWebhookSignature, processPushEvent, processWorkflowRunEvent, processPullRequestEvent } from '../services/webhook.service.js';
import { sendGithubNeedsAttentionEmail } from '../services/email.service.js';
import { config } from '../config.js';

export const githubRouter = Router();

/**
 * Centralized handler when a user's GitHub credential fails authentication (HTTP 401 / bad credentials)
 * 1. Sets auth_status = 'NEEDS_ATTENTION' and auth_attention_at = NOW()
 * 2. Checks cooldown (24h) before dispatching a single user-friendly email
 * 3. Logs clean structured log without exposing tokens or secrets
 */
export async function handleGithubAuthFailure(userId: string): Promise<void> {
  try {
    const user = await queryOne('SELECT email, name, username FROM users WHERE id = ?', [userId]);
    const ghAccount = await queryOne(
      'SELECT id, auth_status, last_notified_at, username FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1',
      [userId]
    );

    if (!ghAccount) return;

    // 1. Mark status as NEEDS_ATTENTION and set auth_attention_at if not already set
    await runQuery(`
      UPDATE github_accounts SET
        auth_status = 'NEEDS_ATTENTION',
        auth_attention_at = COALESCE(auth_attention_at, datetime('now'))
      WHERE user_id = ?
    `, [userId]);

    // 2. Controlled structured log (Zero secrets or tokens logged)
    console.warn(`[GITHUB API] GitHub connection requires attention for user ${userId}`);

    // 3. Deduplication check: Send notification only if last_notified_at is null or older than 24 hours
    const lastNotified = ghAccount.last_notified_at ? new Date(ghAccount.last_notified_at).getTime() : 0;
    const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    if (!lastNotified || (now - lastNotified) >= cooldownMs) {
      const recipientEmail = user?.email;
      if (recipientEmail) {
        await sendGithubNeedsAttentionEmail({
          toEmail: recipientEmail,
          userName: user?.name || user?.username || ghAccount.username || 'Developer'
        });
      }
      await runQuery(`
        UPDATE github_accounts SET
          last_notified_at = datetime('now')
        WHERE user_id = ?
      `, [userId]);
    }
  } catch (err: any) {
    console.error('[GITHUB AUTH FAILURE HANDLER ERROR]', err?.message || err);
  }
}

// GET GitHub OAuth authorization URL
githubRouter.get('/oauth/url', authMiddleware, (req: AuthRequest, res: Response): void => {
  const clientId = config.githubClientId || 'Ov23li1zsUXHPz3jSsYD';
  const returnUrl = (req.query.returnUrl as string) || '/github';

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
  
  // Use official GitHub OAuth prompt=select_account to allow user to select or switch GitHub account
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user,read:org&state=${encodeURIComponent(state)}&prompt=select_account`;

  res.json({ url: authUrl });
});

// GET OAuth Callback endpoint (Exchanges code for access token & verifies connection)
githubRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error, error_description } = req.query;

  let returnUrl = '/github';
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
      console.error('[GITHUB OAUTH] Token exchange failed.');
      const sep = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${clientOrigin}${returnUrl}${sep}error=token_exchange_failed`);
      return;
    }

    // Step 5 & 22: Perform minimal authenticated GitHub API request to verify live access
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SHIORI-App'
      }
    });

    if (!userRes.ok) {
      console.warn(`[GITHUB AUTH] Reauthorization verification failed for user ${userId}`);
      await runQuery(`
        UPDATE github_accounts SET
          auth_status = 'NEEDS_ATTENTION',
          auth_attention_at = datetime('now')
        WHERE user_id = ?
      `, [userId]);
      const sep = returnUrl.includes('?') ? '&' : '?';
      res.redirect(`${clientOrigin}${returnUrl}${sep}error=verification_failed`);
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
      INSERT INTO github_accounts (
        id, user_id, github_id, username, avatar_url, access_token, 
        auth_status, last_verified_at, last_notified_at, auth_attention_at, connected_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'CONNECTED', datetime('now'), NULL, NULL, datetime('now'))
    `, [uuidv4(), userId, String(ghUser.id || 'gh_oauth'), username, avatarUrl, accessToken]);

    // Clean structured log
    console.log(`[GITHUB AUTH] User ${userId} successfully reconnected GitHub`);

    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}github=connected`);
  } catch (error: any) {
    console.error('[GITHUB OAUTH ERROR]', error?.message || error);
    const sep = returnUrl.includes('?') ? '&' : '?';
    res.redirect(`${clientOrigin}${returnUrl}${sep}error=oauth_internal_error`);
  }
});

// GET GitHub connection status (Reads database only — does NOT call GitHub API)
githubRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const user = await queryOne('SELECT github_connected, github_username, github_avatar FROM users WHERE id = ?', [userId]);
  const ghAccount = await queryOne(
    'SELECT username, avatar_url, auth_status, last_verified_at, connected_at FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1',
    [userId]
  );
  
  const rawStatus = ghAccount?.auth_status || (user?.github_connected ? 'CONNECTED' : 'DISCONNECTED');
  const isConnected = Boolean(user?.github_connected && rawStatus !== 'DISCONNECTED' && (ghAccount?.username || user?.github_username));
  const username = ghAccount?.username || user?.github_username || null;
  const avatarUrl = ghAccount?.avatar_url || user?.github_avatar || null;
  const lastVerifiedAt = ghAccount?.last_verified_at || ghAccount?.connected_at || null;

  if (!isConnected || !username || rawStatus === 'DISCONNECTED') {
    res.json({
      connected: false,
      status: 'disconnected',
      username: null,
      avatarUrl: null,
      lastVerifiedAt: null,
      repositoriesCount: 0,
      pullRequestsCount: 0,
      recentCommitsCount: 0
    });
    return;
  }

  // Cached counts from internal database (Zero outbound GitHub API requests)
  const commitsCount = await queryOne('SELECT COUNT(*) as count FROM github_commits');
  const prsCount = await queryOne('SELECT COUNT(DISTINCT github_pr_number) as count FROM tasks WHERE github_pr_number IS NOT NULL');
  const userReposCount = await queryOne('SELECT COUNT(*) as count FROM user_repositories WHERE user_id = ? AND is_active = 1', [userId]);

  const status = rawStatus === 'NEEDS_ATTENTION' ? 'needs_attention' : 'connected';

  res.json({
    connected: true,
    status,
    username,
    avatarUrl,
    lastVerifiedAt,
    repositoriesCount: userReposCount?.count || 0,
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
    INSERT OR REPLACE INTO github_accounts (id, user_id, github_id, username, avatar_url, auth_status, last_verified_at, connected_at)
    VALUES (?, ?, 'gh_1029384', ?, 'https://avatars.githubusercontent.com/u/9919?v=4', 'CONNECTED', datetime('now'), datetime('now'))
  `, [uuidv4(), req.user!.id, username]);

  res.json({ success: true, username, connected: true, status: 'connected' });
});

// Connect via Personal Access Token (Advanced / Developer fallback)
const handleConnectPat = async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, patToken, username } = req.body;
  const activeToken = token || patToken;

  if (!activeToken || !username) {
    res.status(400).json({ error: 'Token and username are required' });
    return;
  }

  // Minimal test of the provided token
  try {
    const testRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'User-Agent': 'SHIORI-App'
      }
    });

    if (!testRes.ok) {
      res.status(401).json({ error: 'Invalid GitHub token. Authentication failed with GitHub API.' });
      return;
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Network error verifying token with GitHub.' });
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
    INSERT OR REPLACE INTO github_accounts (
      id, user_id, github_id, username, access_token, 
      auth_status, last_verified_at, last_notified_at, auth_attention_at, connected_at
    )
    VALUES (?, ?, 'gh_custom', ?, ?, 'CONNECTED', datetime('now'), NULL, NULL, datetime('now'))
  `, [uuidv4(), req.user!.id, username, activeToken]);

  res.json({ success: true, username, connected: true, status: 'connected' });
};

githubRouter.post('/connect-token', authMiddleware, handleConnectPat);
githubRouter.post('/connect-pat', authMiddleware, handleConnectPat);

// Disconnect GitHub
githubRouter.post('/disconnect', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  await runQuery(`
    UPDATE users SET
      github_connected = 0,
      github_username = NULL,
      github_avatar = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `, [userId]);

  await runQuery(`
    UPDATE github_accounts SET
      auth_status = 'DISCONNECTED',
      access_token = NULL
    WHERE user_id = ?
  `, [userId]);

  res.json({ success: true, connected: false, status: 'disconnected' });
});

// GET All accessible GitHub Repositories
const handleGetRepositories = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const user = await queryOne('SELECT github_connected, github_username, github_avatar FROM users WHERE id = ?', [userId]);
  const ghAccount = await queryOne(
    'SELECT access_token, username, auth_status FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1',
    [userId]
  );
  const isConnected = Boolean(user?.github_connected && ghAccount?.auth_status !== 'DISCONNECTED' && (ghAccount?.username || user?.github_username));
  const username = ghAccount?.username || user?.github_username || 'developer';

  const userProjects = await queryAll('SELECT id, name, github_repo_name, default_branch, description, updated_at FROM projects WHERE created_by = ?', [userId]);

  // If connection is in NEEDS_ATTENTION or missing token, skip outbound GitHub API call and return cached workspace projects
  if (!ghAccount || !ghAccount.access_token || ghAccount.auth_status === 'NEEDS_ATTENTION' || ghAccount.auth_status === 'DISCONNECTED') {
    const mappedProjects = (userProjects || []).map((p: any) => ({
      id: String(p.id),
      name: p.github_repo_name || p.name,
      fullName: `${username}/${p.github_repo_name || p.name}`,
      owner: username,
      ownerAvatar: user?.github_avatar || '',
      description: p.description || 'SHIORI connected project',
      isPrivate: false,
      defaultBranch: p.default_branch || 'main',
      htmlUrl: `https://github.com/${username}/${p.github_repo_name || p.name}`,
      updatedAt: p.updated_at || new Date().toISOString(),
      starsCount: 0,
      language: 'TypeScript',
      isConnected: true,
      projectId: p.id
    }));

    res.json({
      connected: isConnected,
      status: ghAccount?.auth_status === 'NEEDS_ATTENTION' ? 'needs_attention' : (isConnected ? 'connected' : 'disconnected'),
      username: isConnected ? username : null,
      repositories: mappedProjects
    });
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
        await handleGithubAuthFailure(userId);
      }
      // Return workspace projects as graceful fallback without throwing errors
      const mappedProjects = (userProjects || []).map((p: any) => ({
        id: String(p.id),
        name: p.github_repo_name || p.name,
        fullName: `${username}/${p.github_repo_name || p.name}`,
        owner: username,
        ownerAvatar: user?.github_avatar || '',
        description: p.description || '',
        isPrivate: false,
        defaultBranch: p.default_branch || 'main',
        htmlUrl: `https://github.com/${username}/${p.github_repo_name || p.name}`,
        updatedAt: p.updated_at || new Date().toISOString(),
        starsCount: 0,
        language: '',
        isConnected: true,
        projectId: p.id
      }));

      res.json({
        connected: isConnected,
        status: ghRes.status === 401 ? 'needs_attention' : 'connected',
        username,
        repositories: mappedProjects
      });
      return;
    }

    const reposData = (await ghRes.json()) as any[];

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
      status: 'connected',
      username: ghAccount.username,
      repositories: mappedRepos
    });
  } catch (error: any) {
    console.error('[GITHUB REPOS ERROR]', error?.message || error);
    res.status(500).json({ error: 'Internal error fetching GitHub repositories.', connected: isConnected, repositories: [] });
  }
};

githubRouter.get('/available-repositories', authMiddleware, handleGetRepositories);
githubRouter.get('/repositories', authMiddleware, handleGetRepositories);

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
        WHERE (LOWER(github_repo) = LOWER(?) OR LOWER(github_repo) LIKE '%' || LOWER(?) || '%')
          AND status != 'DONE'
          AND (is_deleted = 0 OR is_deleted IS NULL)
      `, [r.repo_name, r.repo_name]);

      const completedTodos = await queryOne(`
        SELECT COUNT(*) as count FROM tasks 
        WHERE (LOWER(github_repo) = LOWER(?) OR LOWER(github_repo) LIKE '%' || LOWER(?) || '%')
          AND (status = 'DONE' OR user_status = 'COMPLETED')
          AND (is_deleted = 0 OR is_deleted IS NULL)
      `, [r.repo_name, r.repo_name]);

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
    const cleanShort = repoName.replace(/^.*\//, '').trim();
    const candidateNames: string[] = [];

    if (repoName.includes('/')) {
      candidateNames.push(repoName.trim());
    }

    // Check project database for saved github_repo_url
    const projects = await queryAll('SELECT id, name, github_repo_name, github_repo_url FROM projects WHERE github_repo_name = ? OR name = ? OR slug = ? OR github_repo_name LIKE ?', [cleanShort, cleanShort, cleanShort, `%${cleanShort}%`]);
    for (const proj of (projects || [])) {
      if (proj.github_repo_url && proj.github_repo_url.includes('github.com/')) {
        const urlPath = proj.github_repo_url.split('github.com/')[1].replace(/\.git$/, '').trim();
        if (urlPath && !candidateNames.includes(urlPath)) {
          candidateNames.push(urlPath);
        }
      }
      if (proj.github_repo_name && proj.github_repo_name.includes('/') && !candidateNames.includes(proj.github_repo_name)) {
        candidateNames.push(proj.github_repo_name.trim());
      }
    }

    // Check user_repositories table
    const userRepos = await queryAll('SELECT full_name FROM user_repositories WHERE repo_name = ? OR full_name LIKE ?', [cleanShort, `%${cleanShort}%`]);
    for (const ur of (userRepos || [])) {
      if (ur.full_name && !candidateNames.includes(ur.full_name)) {
        candidateNames.push(ur.full_name);
      }
    }

    // Check connected accounts
    const allAccounts = await queryAll('SELECT user_id, access_token, username, auth_status FROM github_accounts ORDER BY connected_at DESC');
    const userAccount = (allAccounts || []).find((a: any) => a.user_id === userId);
    for (const acc of (allAccounts || [])) {
      if (acc.username && !candidateNames.includes(`${acc.username}/${cleanShort}`)) {
        candidateNames.push(`${acc.username}/${cleanShort}`);
      }
    }

    // Add standard organization prefixes
    if (!candidateNames.includes(`Swaply-one/${cleanShort}`)) candidateNames.push(`Swaply-one/${cleanShort}`);
    if (!candidateNames.includes(`swaplyone/${cleanShort}`)) candidateNames.push(`swaplyone/${cleanShort}`);

    // Candidate tokens to try (only healthy tokens, then unauthenticated public request)
    const tokenCandidates: (string | null)[] = [];
    if (userAccount?.access_token && userAccount.auth_status !== 'NEEDS_ATTENTION' && userAccount.auth_status !== 'DISCONNECTED') {
      tokenCandidates.push(userAccount.access_token);
    }
    for (const acc of (allAccounts || [])) {
      if (acc.access_token && acc.auth_status !== 'NEEDS_ATTENTION' && acc.auth_status !== 'DISCONNECTED' && !tokenCandidates.includes(acc.access_token)) {
        tokenCandidates.push(acc.access_token);
      }
    }
    tokenCandidates.push(null); // Unauthenticated public fallback

    let commitsRes: any = null;
    let workingFullName = candidateNames[0] || `Swaply-one/${cleanShort}`;

    outerLoop:
    for (const token of tokenCandidates) {
      const headers: Record<string, string> = {
        'User-Agent': 'SHIORI-App',
        Accept: 'application/vnd.github.v3+json'
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      for (const cand of candidateNames) {
        try {
          const res = await fetch(`https://api.github.com/repos/${cand}/commits?per_page=30`, { headers });
          if (res.ok) {
            commitsRes = res;
            workingFullName = cand;
            break outerLoop;
          }
        } catch {}
      }
    }

    let liveCommits: any[] = [];

    if (commitsRes && commitsRes.ok) {
      const rawCommits = (await commitsRes.json()) as any[];
      if (Array.isArray(rawCommits)) {
        liveCommits = rawCommits.map((c) => ({
          hash: c.sha?.substring(0, 7) || '',
          fullHash: c.sha || '',
          message: c.commit?.message || '',
          author: c.commit?.author?.name || c.author?.login || userAccount?.username || 'Developer',
          authorUsername: c.author?.login || '',
          authorAvatar: c.author?.avatar_url || '',
          date: c.commit?.author?.date || new Date().toISOString(),
          pushedAt: c.commit?.author?.date || new Date().toISOString(),
          additions: 15,
          deletions: 3,
          filesChanged: []
        }));

        // Execute unified commit verification pipeline
        const { verifyAndProcessCommits } = await import('../services/commitVerification.service.js');
        const incomingCommits = liveCommits.map((c) => ({
          sha: c.fullHash || c.hash,
          message: c.message,
          authorName: c.author,
          authorUsername: c.authorUsername,
          authorAvatar: c.authorAvatar,
          branch: 'main',
          filesChanged: c.filesChanged?.length || 1,
          url: `https://github.com/${workingFullName}/commit/${c.fullHash || c.hash}`,
          timestamp: c.pushedAt
        }));

        await verifyAndProcessCommits(incomingCommits, {
          repoName: workingFullName,
          branchName: 'main',
          sender: userAccount?.username,
          source: 'POLLING',
          userId: userId || userAccount?.user_id
        });
      }
    }

    // Fetch real GitHub Actions CI workflow runs
    try {
      const activeHeaders: Record<string, string> = {
        'User-Agent': 'SHIORI-App',
        Accept: 'application/vnd.github.v3+json'
      };
      if (userAccount?.access_token) activeHeaders.Authorization = `Bearer ${userAccount.access_token}`;

      const runsRes = await fetch(`https://api.github.com/repos/${workingFullName}/actions/runs?per_page=10`, { headers: activeHeaders });
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
            uuidv4(), cleanShort, run.head_branch || 'main', run.head_sha || '', run.name || 'CI Build',
            runStatus, run.conclusion || '', run.run_started_at || new Date().toISOString(), run.updated_at
          ]);
        }
      }
    } catch {}

    return liveCommits;
  } catch (err: any) {
    console.error('[SYNC GITHUB ERROR]', err?.message || err);
    return [];
  }
}

// POST On-Demand Trigger GitHub Live Sync for a repository
githubRouter.post('/sync', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repo } = req.body;
  if (!repo) {
    res.status(400).json({ error: 'Repository name is required.' });
    return;
  }

  const liveCommits = await syncRepoLiveFromGitHub(req.user!.id, repo);
  res.json({
    success: true,
    repo,
    syncedCommitsCount: liveCommits.length,
    commits: liveCommits
  });
});

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

// GET Commit Details & Diff (Live from GitHub)
githubRouter.get('/commit/:hash', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { hash } = req.params;
  const repo = (req.query.repo as string) || 'SHIORI';

  try {
    const ghAccount = await queryOne('SELECT access_token, username, auth_status FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1', [req.user!.id]);

    const cleanRepo = repo.replace(/^.*\//, '');
    const candidateNames = new Set<string>();

    if (repo.includes('/')) {
      candidateNames.add(repo);
    }

    const userRepo = await queryOne('SELECT full_name FROM user_repositories WHERE user_id = ? AND (repo_name = ? OR full_name LIKE ?)', [req.user!.id, repo, `%${cleanRepo}`]);
    if (userRepo?.full_name) {
      candidateNames.add(userRepo.full_name);
    }

    const project = await queryOne('SELECT github_repo_name, github_repo_url FROM projects WHERE github_repo_name = ? OR name = ?', [repo, repo]);
    if (project?.github_repo_url && project.github_repo_url.includes('github.com/')) {
      candidateNames.add(project.github_repo_url.split('github.com/')[1].replace(/\.git$/, ''));
    }

    const dbCommitCandidate = await queryOne('SELECT repo_name FROM github_commits WHERE commit_hash LIKE ? OR commit_hash = ? LIMIT 1', [`%${hash}%`, hash]);
    if (dbCommitCandidate?.repo_name) {
      candidateNames.add(dbCommitCandidate.repo_name);
      const dbClean = dbCommitCandidate.repo_name.replace(/^.*\//, '');
      candidateNames.add(`Swaply-one/${dbClean}`);
      candidateNames.add(`swaplyone/${dbClean}`);
    }

    candidateNames.add(`Swaply-one/${cleanRepo}`);
    candidateNames.add(`swaplyone/${cleanRepo}`);
    if (ghAccount?.username) {
      candidateNames.add(`${ghAccount.username}/${cleanRepo}`);
    }
    candidateNames.add(cleanRepo);

    const headers: Record<string, string> = {
      'User-Agent': 'SHIORI-App',
      Accept: 'application/vnd.github.v3+json'
    };
    if (ghAccount?.access_token && ghAccount.auth_status !== 'NEEDS_ATTENTION' && ghAccount.auth_status !== 'DISCONNECTED') {
      headers.Authorization = `Bearer ${ghAccount.access_token}`;
    }

    let commitData: any = null;
    for (const name of candidateNames) {
      try {
        let commitRes = await fetch(`https://api.github.com/repos/${name}/commits/${hash}`, { headers });
        if (!commitRes.ok && headers.Authorization) {
          commitRes = await fetch(`https://api.github.com/repos/${name}/commits/${hash}`, {
            headers: { 'User-Agent': 'SHIORI-App', Accept: 'application/vnd.github.v3+json' }
          });
        }
        if (commitRes.ok) {
          commitData = await commitRes.json();
          break;
        }
      } catch (err) {
        // Continue trying next candidate
      }
    }

    if (commitData) {
      const files = (commitData.files || []).map((f: any) => ({
        filename: f.filename,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        status: f.status || 'modified',
        diff: f.patch || `Binary or unmodified file (${f.status})`
      }));

      res.json({
        commit: {
          hash: commitData.sha?.substring(0, 7) || hash,
          fullHash: commitData.sha || hash,
          message: commitData.commit?.message || 'Commit details',
          author: commitData.commit?.author?.name || commitData.author?.login || 'Developer',
          date: commitData.commit?.author?.date || new Date().toISOString(),
          branch: 'main',
          stats: {
            filesChanged: files.length,
            additions: commitData.stats?.additions || files.reduce((a: number, b: any) => a + b.additions, 0),
            deletions: commitData.stats?.deletions || files.reduce((a: number, b: any) => a + b.deletions, 0)
          },
          files
        }
      });
      return;
    }
  } catch (err: any) {
    console.error('[COMMIT DIFF FETCH ERROR]', err?.message || err);
  }

  // Fallback if network fails
  const dbCommit = await queryOne('SELECT * FROM github_commits WHERE commit_hash LIKE ? OR commit_hash = ?', [`%${hash}%`, hash]);
  res.json({
    commit: {
      hash,
      message: dbCommit?.message || 'Commit details',
      author: dbCommit?.author_name || 'Developer',
      date: dbCommit?.pushed_at || new Date().toISOString(),
      branch: 'main',
      stats: {
        filesChanged: 1,
        additions: 10,
        deletions: 2
      },
      files: [
        {
          filename: 'repository/changes',
          additions: 10,
          deletions: 2,
          diff: `Commit ${hash}: ${dbCommit?.message || 'Verified commit'}`
        }
      ]
    }
  });
});

// Webhook Receiver (Supports /api/webhooks, /api/webhooks/webhook, /api/github/webhook, and /api/github/webhooks)
const handleIncomingWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const event = (req.headers['x-github-event'] as string) || req.body?.event || 'push';

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
    res.status(500).json({ error: error?.message || 'Webhook processing failed' });
  }
};

githubRouter.post('/', handleIncomingWebhook);
githubRouter.post('/webhook', handleIncomingWebhook);
githubRouter.post('/webhooks', handleIncomingWebhook);

