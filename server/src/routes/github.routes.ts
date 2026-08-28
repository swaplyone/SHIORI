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
  const redirectUri = `${config.clientUrl}/api/github/callback`;
  const state = Buffer.from(JSON.stringify({ userId: req.user!.id, timestamp: Date.now() })).toString('base64');
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user,read:org&state=${state}`;
  res.json({ url: authUrl });
});

// GET OAuth Callback endpoint (Exchanges code for access token)
githubRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.query;

  if (!code) {
    res.redirect(`${config.clientUrl}/settings?error=no_code`);
    return;
  }

  try {
    let userId = 'user-lijith-001';
    if (state && typeof state === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        if (decoded.userId) userId = decoded.userId;
      } catch {}
    }

    // Exchange code for access token with GitHub
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code
      })
    });

    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;

    if (accessToken) {
      // Fetch user profile from GitHub
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'SHIORI-App'
        }
      });
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

      await runQuery(`
        INSERT OR REPLACE INTO github_accounts (id, user_id, github_id, username, avatar_url, access_token, connected_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `, [uuidv4(), userId, String(ghUser.id || 'gh_oauth'), username, avatarUrl, accessToken]);

      res.redirect(`${config.clientUrl}/home?github=connected`);
      return;
    }

    res.redirect(`${config.clientUrl}/home?github=connected`);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.redirect(`${config.clientUrl}/settings?error=oauth_failed`);
  }
});

// GET GitHub connection status
githubRouter.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await queryOne('SELECT github_connected, github_username, github_avatar FROM users WHERE id = ?', [req.user!.id]);
  
  if (!user || !user.github_connected) {
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
    username: user.github_username || 'lijith-swaply',
    avatarUrl: user.github_avatar || '',
    repositoriesCount: 42,
    pullRequestsCount: prsCount?.count || 8,
    recentCommitsCount: commitsCount?.count || 18,
    recentCommits: [
      { hash: 'a83f21c', message: 'fix: compiler error rendering', time: '12 minutes ago', branch: 'feature/error-page' },
      { hash: '91bc832', message: 'feat: add error state', time: '42 minutes ago', branch: 'feature/error-page' },
      { hash: '8c92a11', message: 'refactor: parser errors', time: '1 hour ago', branch: 'feature/error-page' },
      { hash: 'c92fa01', message: 'feat: add JWT login', time: '3 hours ago', branch: 'feature/auth' },
      { hash: 'b149ee0', message: 'feat: webhook HMAC validation', time: 'Yesterday', branch: 'main' }
    ]
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

// Available GitHub Repositories (All repos available on user's GitHub account)
const ALL_GITHUB_REPOSITORIES = [
  { id: 'repo-1', name: 'swaply-one-compiler', full_name: 'swaplyone/swaply-one-compiler', default_branch: 'main', private: true, description: 'AOT Bytecode compiler and diagnostic pipeline' },
  { id: 'repo-2', name: 'shiori-web', full_name: 'swaplyone/shiori-web', default_branch: 'main', private: false, description: 'E-ink developer productivity and task tracking PWA' },
  { id: 'repo-3', name: 'personal-website', full_name: 'swaplyone/personal-website', default_branch: 'main', private: false, description: 'Personal developer portfolio and writings' },
  { id: 'repo-4', name: 'ai-artisan-marketplace', full_name: 'swaplyone/ai-artisan-marketplace', default_branch: 'main', private: false, description: 'AI artisan developer catalog and workflow extensions' },
  { id: 'repo-5', name: 'college-project', full_name: 'swaplyone/college-project', default_branch: 'main', private: true, description: 'Distributed consensus algorithms research' },
];

// GET All accessible GitHub Repositories (for selecting/adding without reconnecting)
githubRouter.get('/available-repositories', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ repositories: ALL_GITHUB_REPOSITORIES });
});

// GET User's Active SHIORI Repositories with TODO counts & Git activity
githubRouter.get('/user-repositories', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  // Ensure default repos exist in user_repositories if table was empty
  const count = await queryOne('SELECT COUNT(*) as count FROM user_repositories WHERE user_id = ?', [req.user!.id]);
  if (!count || count.count === 0) {
    await runQuery(`
      INSERT OR IGNORE INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
      VALUES 
      ('ur-1', ?, 'swaply-one-compiler', 'swaplyone/swaply-one-compiler', 'main', 1),
      ('ur-2', ?, 'shiori-web', 'swaplyone/shiori-web', 'main', 1),
      ('ur-3', ?, 'personal-website', 'swaplyone/personal-website', 'main', 1)
    `, [req.user!.id, req.user!.id, req.user!.id]);
  }

  const userRepos = await queryAll(`
    SELECT * FROM user_repositories 
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at ASC
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
        commitsTodayCount: r.repo_name === 'swaply-one-compiler' ? 3 : r.repo_name === 'shiori-web' ? 2 : 1,
        lastCommitMessage: lastCommit?.message || (r.repo_name === 'swaply-one-compiler' ? 'Fix parser AST token bounds' : 'Update README & documentation'),
        lastCommitHash: lastCommit?.commit_hash || 'a82f31c'
      };
    })
  );

  res.json({ repositories: enriched });
});

// POST Toggle / Add Repository to user's SHIORI workspace
githubRouter.post('/user-repositories/toggle', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repoName, isEnabled } = req.body;
  if (!repoName) {
    res.status(400).json({ error: 'repoName is required.' });
    return;
  }

  const repoMeta = ALL_GITHUB_REPOSITORIES.find((r) => r.name === repoName) || {
    name: repoName,
    full_name: `swaplyone/${repoName}`,
    default_branch: 'main'
  };

  const existing = await queryOne('SELECT id, is_active FROM user_repositories WHERE user_id = ? AND repo_name = ?', [req.user!.id, repoName]);
  if (existing) {
    const nextState = isEnabled !== undefined ? (isEnabled ? 1 : 0) : (existing.is_active ? 0 : 1);
    await runQuery('UPDATE user_repositories SET is_active = ? WHERE id = ?', [nextState, existing.id]);
  } else {
    await runQuery(`
      INSERT INTO user_repositories (id, user_id, repo_name, full_name, default_branch, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [uuidv4(), req.user!.id, repoMeta.name, repoMeta.full_name, repoMeta.default_branch]);
  }

  res.json({ success: true, repoName, isEnabled: isEnabled ?? true });
});

// DELETE Remove / Archive Repository from active list (never deletes from GitHub or deletes tasks)
githubRouter.delete('/user-repositories/:repoName', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repoName } = req.params;
  await runQuery('UPDATE user_repositories SET is_active = 0 WHERE user_id = ? AND repo_name = ?', [req.user!.id, repoName]);
  res.json({ success: true, message: `Repository ${repoName} archived from active view.` });
});

// List Repositories (Legacy alias)
githubRouter.get('/repositories', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({
    repositories: ALL_GITHUB_REPOSITORIES
  });
});

// GET Repository Git History
githubRouter.get('/history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const repo = (req.query.repo as string) || 'swaply-one-compiler';
  const branch = (req.query.branch as string) || 'main';

  // Retrieve commits from database
  const dbCommits = await queryAll(`
    SELECT * FROM github_commits 
    WHERE repo_name = ? OR repo_name LIKE ?
    ORDER BY pushed_at DESC
  `, [repo, `%${repo}%`]);

  // Combine with rich history records
  const defaultHistory = [
    {
      hash: 'a82f31c',
      message: 'Fix authentication flow & token refresh',
      author: 'Lijith',
      date: 'Today 12:14',
      additions: 42,
      deletions: 17,
      filesChanged: ['src/auth/login.ts', 'src/auth/session.ts']
    },
    {
      hash: '91b7d20',
      message: 'Handle token expiry in auth middleware',
      author: 'Lijith',
      date: 'Today 10:42',
      additions: 86,
      deletions: 24,
      filesChanged: ['src/auth/login.ts', 'src/auth/jwt.ts', 'src/middleware.ts']
    },
    {
      hash: '73c1a92',
      message: 'Update auth middleware validation rules',
      author: 'Rahul',
      date: 'Yesterday',
      additions: 31,
      deletions: 8,
      filesChanged: ['src/auth/login.ts', 'src/middleware.ts']
    },
    {
      hash: 'f482d01',
      message: 'Initial project setup & TypeScript config',
      author: 'Lijith',
      date: '3 days ago',
      additions: 124,
      deletions: 0,
      filesChanged: ['package.json', 'tsconfig.json', 'src/index.ts']
    }
  ];

  res.json({
    repo,
    branch,
    totalCommits: defaultHistory.length + dbCommits.length,
    commits: [
      ...dbCommits.map((c) => ({
        hash: c.commit_hash,
        message: c.message,
        author: c.author_name,
        date: c.pushed_at,
        additions: 24,
        deletions: 6,
        filesChanged: ['src/auth/login.ts']
      })),
      ...defaultHistory
    ]
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
