import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const recoveryRouter = Router();

// Simulated rich code snapshots for repository files across commits
const FILE_SNAPSHOTS: Record<string, Record<string, { content: string; date: string; message: string; author: string }>> = {
  'src/auth/login.ts': {
    'CURRENT': {
      content: `// src/auth/login.ts - Current Version
import { createSession, verifyPassword } from './session';
import { generateJWT, rotateRefreshToken } from './jwt';

export async function loginUser(email: string, pass: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(pass, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  const session = await createSession(user.id);
  const token = generateJWT(user, session.id);
  const refreshToken = rotateRefreshToken(session.id);
  return { user, token, refreshToken };
}`,
      date: 'Just now',
      message: 'fix(auth): rotate refresh token on successful login',
      author: 'Lijith'
    },
    'a82f31c': {
      content: `// src/auth/login.ts - Commit a82f31c
import { createSession, verifyPassword } from './session';
import { generateJWT } from './jwt';

export async function loginUser(email: string, pass: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(pass, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  const session = await createSession(user.id);
  const token = generateJWT(user, session.id);
  return { user, token };
}`,
      date: '2 hours ago',
      message: 'feat: finish authentication flow and session creation',
      author: 'Lijith'
    },
    '91b7d20': {
      content: `// src/auth/login.ts - Commit 91b7d20
import { verifyPassword } from './session';

export async function loginUser(email: string, pass: string) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(pass, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }
  return { user, token: 'temp-token-xyz' };
}`,
      date: 'Yesterday 14:20',
      message: 'handle token expiry and user verification',
      author: 'Lijith'
    },
    '73c1a92': {
      content: `// src/auth/login.ts - Commit 73c1a92
export async function loginUser(email: string, pass: string) {
  // Initial authentication skeleton
  return { email, status: 'pending' };
}`,
      date: '3 days ago',
      message: 'Initial authentication skeleton',
      author: 'Lijith'
    }
  },
  'src/parser/ast.rs': {
    'CURRENT': {
      content: `// src/parser/ast.rs - Current Version
pub struct ASTNode {
    pub node_type: String,
    pub span: (usize, usize),
    pub children: Vec<ASTNode>,
}

impl ASTNode {
    pub fn new(node_type: &str, start: usize, end: usize) -> Self {
        Self {
            node_type: node_type.to_string(),
            span: (start, end),
            children: Vec::new(),
        }
    }
}`,
      date: 'Just now',
      message: 'fix: parser AST token bounds validation',
      author: 'Lijith'
    },
    'f31b89a': {
      content: `// src/parser/ast.rs - Commit f31b89a
pub struct ASTNode {
    pub node_type: String,
    pub children: Vec<ASTNode>,
}

impl ASTNode {
    pub fn new(node_type: &str) -> Self {
        Self {
            node_type: node_type.to_string(),
            children: Vec::new(),
        }
    }
}`,
      date: 'Yesterday',
      message: 'feat: add AST recursive tree parser',
      author: 'Tejas'
    }
  }
};

// GET Available files in repository
recoveryRouter.get('/files', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const repo = (req.query.repo as string) || 'swaply-one-compiler';

  const files = [
    { path: 'src/auth/login.ts', versionsCount: 4, lastModified: '2 hours ago', lines: 18 },
    { path: 'src/auth/session.ts', versionsCount: 3, lastModified: '3 hours ago', lines: 42 },
    { path: 'src/auth/jwt.ts', versionsCount: 3, lastModified: 'Yesterday', lines: 35 },
    { path: 'src/parser/ast.rs', versionsCount: 2, lastModified: '12m ago', lines: 16 },
    { path: 'src/parser/lexer.rs', versionsCount: 3, lastModified: '1 hour ago', lines: 68 },
    { path: 'src/compiler/driver.rs', versionsCount: 5, lastModified: '2 days ago', lines: 120 },
  ];

  res.json({ repo, files });
});

// GET File Version History
recoveryRouter.get('/file-history', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const filePath = (req.query.filePath as string) || 'src/auth/login.ts';
  const repo = (req.query.repo as string) || 'SHIORI';

  const snapshots = FILE_SNAPSHOTS[filePath] || FILE_SNAPSHOTS['src/auth/login.ts'];
  const versionKeys = Object.keys(snapshots);

  const versions = versionKeys.map((key) => {
    const data = snapshots[key];
    return {
      commitSha: key,
      isCurrent: key === 'CURRENT',
      date: data.date,
      message: data.message,
      author: data.author,
      content: data.content,
      linesCount: data.content.split('\n').length
    };
  });

  res.json({
    repo,
    filePath,
    currentVersion: 'CURRENT',
    versions
  });
});

// POST Safe Code Restoration
recoveryRouter.post('/restore', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { repo = 'SHIORI', filePath = 'src/auth/login.ts', commitSha = 'a82f31c', taskId } = req.body;

  const recoveryBranch = `recovery/${commitSha}-${Date.now().toString(36)}`;

  // Log recovery activity safely without overwriting current uncommitted files destructively
  if (taskId) {
    await runQuery(`
      INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
      VALUES (?, ?, 'CODE_RECOVERED', ?, ?, datetime('now'))
    `, [
      uuidv4(),
      taskId,
      `Code restored from commit ${commitSha}`,
      `Created safe recovery branch: ${recoveryBranch} for file ${filePath}`
    ]);
  }

  await runQuery(`
    INSERT INTO global_activities (id, user_id, category, icon_symbol, title, meta_text, created_at)
    VALUES (?, ?, 'RECOVERY', '↺', ?, ?, datetime('now'))
  `, [
    uuidv4(),
    req.user!.id,
    `Recovered ${filePath} from ${commitSha}`,
    `Repository: ${repo} • Branch created: ${recoveryBranch}`
  ]);

  res.json({
    success: true,
    message: `Version ${commitSha} safely prepared for ${filePath}.`,
    recoveryBranch,
    restoredCommit: commitSha,
    filePath,
    repo
  });
});
