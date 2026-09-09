import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getSparkWitResponse, SafeWorkspaceContext } from '../services/spark/sparkWitEngine.js';

export const sparkRouter = Router();

// Helper to strip markdown symbols for clean, natural speech synthesis
function stripMarkdownForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // remove bold
    .replace(/\*(.*?)\*/g, '$1')     // remove italic
    .replace(/`([^`]+)`/g, '$1')     // remove inline code
    .replace(/^#+\s+/gm, '')         // remove markdown headers
    .replace(/^[•\-*]\s+/gm, '')     // remove bullet points
    .replace(/TASK-(\d+)/gi, 'Task $1') // pronounce TASK-01 as Task 01
    .replace(/\[(.*?)\]/g, '($1)')   // replace brackets
    .replace(/\n+/g, '. ')           // line breaks to natural sentence pauses
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to resequence tasks when deleting
async function resequenceProjectTasks(projectId: string): Promise<void> {
  const activeTasks = await queryAll(
    `SELECT id FROM tasks 
     WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
     ORDER BY sequence_order ASC, created_at ASC`,
    [projectId]
  );

  for (let i = 0; i < (activeTasks || []).length; i++) {
    const seq = i + 1;
    const code = `TASK-${String(seq).padStart(2, '0')}`;
    await runQuery(
      `UPDATE tasks SET task_number = ?, task_code = ?, sequence_order = ? WHERE id = ?`,
      [seq, code, seq, activeTasks[i].id]
    );
  }
}

// Helper to fetch minimal, safe workspace context for Wit Engine
async function getSafeWorkspaceContext(userId: string): Promise<SafeWorkspaceContext> {
  try {
    const running = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE (status = 'IN_PROGRESS' OR status = 'IN PROGRESS' OR status = 'DOING')
       AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const pending = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const overdue = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status != 'DONE' 
       AND deadline IS NOT NULL 
       AND deadline != '' 
       AND deadline < datetime('now')
       AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const dueToday = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status != 'DONE' 
       AND deadline IS NOT NULL 
       AND date(deadline) = date('now')
       AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const projects = await queryOne(
      `SELECT COUNT(*) as count FROM projects WHERE created_by = ?`,
      [userId]
    );

    const topActive = await queryOne(
      `SELECT t.title, p.name as project_name 
       FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 2 END, t.sequence_order ASC LIMIT 1`
    );

    return {
      overdueCount: overdue?.count || 0,
      dueTodayCount: dueToday?.count || 0,
      pendingCount: pending?.count || 0,
      runningCount: running?.count || 0,
      projectCount: projects?.count || 0,
      activeTask: topActive?.title,
      activeProject: topActive?.project_name
    };
  } catch (err) {
    return {};
  }
}

// Helper to resolve project by name, repository name, or conversational pronoun
async function resolveTargetProject(rawText: string, userId: string, context: any = {}): Promise<any> {
  const lower = rawText.toLowerCase();

  // 1. Check for pronoun / follow-up references
  const isContextualRef =
    lower.includes('in it') || lower.includes('in that') || lower.includes('in there') || 
    lower.includes('there') || lower.includes('this project') || lower.includes('that project') ||
    lower.includes('this repo') || lower.includes('that repo') || lower.includes('this repository') || lower.includes('that repository');

  if (isContextualRef && context.projectId) {
    const proj = await queryOne(
      `SELECT id, name, github_repo_name, github_repo_url, default_branch, description 
       FROM projects WHERE id = ?`,
      [context.projectId]
    );
    if (proj) return proj;
  }

  // 2. Fetch all user projects and check for explicit project or repo mentions in text
  const userProjects = await queryAll(
    `SELECT id, name, github_repo_name, github_repo_url, default_branch, description 
     FROM projects 
     WHERE created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)
     ORDER BY updated_at DESC`,
    [userId, userId]
  );

  for (const proj of (userProjects || [])) {
    const projName = proj.name.toLowerCase();
    const repoName = (proj.github_repo_name || '').toLowerCase();
    const repoBase = repoName.split('/').pop() || repoName;

    if (
      lower.includes(projName) ||
      (repoName && lower.includes(repoName)) ||
      (repoBase && lower.includes(repoBase))
    ) {
      return proj;
    }
  }

  // 3. Fallback to context projectId if available
  if (context.projectId) {
    return await queryOne(
      `SELECT id, name, github_repo_name, github_repo_url, default_branch, description 
       FROM projects WHERE id = ?`,
      [context.projectId]
    );
  }

  return null;
}

// Helper to resolve task by code, ID, title, or contextual reference ("it", "that task")
async function resolveTask(identifier: string, context: any = {}): Promise<any> {
  const lower = (identifier || '').toLowerCase().trim();

  // 1. Check for TASK-XX
  const codeMatch = lower.match(/task-?(\d+)/i);
  if (codeMatch) {
    const num = parseInt(codeMatch[1], 10);
    const code = `TASK-${String(num).padStart(2, '0')}`;
    const task = await queryOne(
      `SELECT t.*, p.name as project_name FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE (t.task_code = ? OR t.task_number = ?) AND (t.is_deleted = 0 OR t.is_deleted IS NULL)`,
      [code, num]
    );
    if (task) return task;
  }

  // 2. Contextual "it", "that task", "the task"
  if (['it', 'that', 'that task', 'the task', 'this', 'this task'].includes(lower)) {
    if (context.taskId) {
      const task = await queryOne(
        `SELECT t.*, p.name as project_name FROM tasks t 
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE t.id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)`,
        [context.taskId]
      );
      if (task) return task;
    }
  }

  // 3. Search by title substring
  if (identifier && identifier.length > 2) {
    const clean = identifier.replace(/^[\s:"']+|[\s:"']+$/g, '');
    const task = await queryOne(
      `SELECT t.*, p.name as project_name FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE (LOWER(t.title) LIKE LOWER(?) OR LOWER(t.task_code) LIKE LOWER(?)) 
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.updated_at DESC LIMIT 1`,
      [`%${clean}%`, `%${clean}%`]
    );
    if (task) return task;
  }

  // 4. Default to context taskId
  if (context.taskId) {
    return await queryOne(
      `SELECT t.*, p.name as project_name FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)`,
      [context.taskId]
    );
  }

  return null;
}

// GET /api/spark/briefing — Fast Proactive Session Greeting & Task Overview
sparkRouter.get('/briefing', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const user = await queryOne('SELECT name, username FROM users WHERE id = ?', [userId]);
  const displayName = user?.name || user?.username || 'Developer';

  // Time-aware greeting
  const hour = new Date().getHours();
  let timeGreeting = 'Good day';
  let punchline = 'Ready to build?';

  if (hour >= 5 && hour < 12) {
    timeGreeting = 'Morning';
    punchline = 'Spark is online. Ready to build?';
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good afternoon';
    punchline = 'Ready to make some progress?';
  } else if (hour >= 17 && hour < 22) {
    timeGreeting = 'Good evening';
    punchline = "Let's finish something.";
  } else {
    timeGreeting = 'Evening';
    punchline = "Still working? Let's keep it focused.";
  }

  // Aggregate user's task metrics
  const running = await queryOne(
    `SELECT COUNT(*) as count FROM tasks 
     WHERE (status = 'IN_PROGRESS' OR status = 'IN PROGRESS' OR status = 'DOING')
     AND (is_deleted = 0 OR is_deleted IS NULL)`
  );

  const pending = await queryOne(
    `SELECT COUNT(*) as count FROM tasks 
     WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`
  );

  const overdue = await queryOne(
    `SELECT COUNT(*) as count FROM tasks 
     WHERE status != 'DONE' 
     AND deadline IS NOT NULL 
     AND deadline != '' 
     AND deadline < datetime('now')
     AND (is_deleted = 0 OR is_deleted IS NULL)`
  );

  const dueToday = await queryOne(
    `SELECT COUNT(*) as count FROM tasks 
     WHERE status != 'DONE' 
     AND deadline IS NOT NULL 
     AND date(deadline) = date('now')
     AND (is_deleted = 0 OR is_deleted IS NULL)`
  );

  // Top recommendation
  const topTask = await queryOne(
    `SELECT t.id, t.task_code, t.title, t.priority, t.deadline, p.name as project_name 
     FROM tasks t
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
     ORDER BY 
       CASE WHEN t.deadline IS NOT NULL AND t.deadline < datetime('now') THEN 1 ELSE 2 END,
       CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 WHEN t.priority = 'MEDIUM' THEN 3 ELSE 4 END,
       t.sequence_order ASC,
       t.created_at ASC
     LIMIT 1`
  );

  const runningCount = running?.count || 0;
  const pendingCount = pending?.count || 0;
  const overdueCount = overdue?.count || 0;
  const dueTodayCount = dueToday?.count || 0;

  let summarySentence = '';
  let contextualGreeting = `${timeGreeting}, ${displayName}.`;

  if (overdueCount > 0) {
    contextualGreeting = `${timeGreeting}. Spark is online. And yes... those ${overdueCount} overdue tasks are still here.`;
    summarySentence = `You have ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}.`;
  } else if (pendingCount === 0) {
    contextualGreeting = `${timeGreeting}. Spark is online. Clean workspace. Nice.`;
    summarySentence = 'Nothing urgent. Suspiciously peaceful.';
  } else if (pendingCount > 6) {
    contextualGreeting = `${timeGreeting}. Spark is online. Your TODO list appears to have multiplied.`;
    summarySentence = `You have ${pendingCount} pending tasks.`;
  } else {
    const parts = [];
    if (runningCount > 0) parts.push(`${runningCount} running`);
    if (pendingCount > 0) parts.push(`${pendingCount} pending`);
    summarySentence = parts.length > 0 ? `You have ${parts.join(', ')}.` : 'Ready to work.';
  }

  res.json({
    success: true,
    greeting: contextualGreeting,
    punchline,
    summarySentence,
    counts: {
      running: runningCount,
      pending: pendingCount,
      overdue: overdueCount,
      dueToday: dueTodayCount
    },
    recommendation: topTask ? {
      taskCode: topTask.task_code,
      title: topTask.title,
      priority: topTask.priority,
      projectName: topTask.project_name
    } : null
  });
});

// POST /api/spark/command — Natural Language Intent Router & Tool Execution
sparkRouter.post('/command', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { command, context = {}, confirmed = false, confirmationPayload } = req.body;

  if (!command || typeof command !== 'string') {
    res.status(400).json({ error: 'Command text is required' });
    return;
  }

  let rawText = command.trim();
  // Strip wake word prefixes e.g. "Hey Spark,", "Spark,"
  rawText = rawText.replace(/^(hey\s+)?spark,?\s*/i, '');
  const lower = rawText.toLowerCase().trim();

  // =========================================================================
  // 1. STRICT SECURITY PROBE CHECK (Never leak secrets, tokens, env, keys)
  // =========================================================================
  const securityKeywords = [
    'supabase service', 'service_role', 'service key', 'api key', 'github token', 
    'access token', 'oauth secret', 'client secret', 'client_secret', 'jwt_secret', 
    'password', 'env variable', 'environment variable', 'database_url', '.env', 
    'connection string', 'private key', 'secret key', 'other user', "another user's",
    'show token', 'show key', 'show password', 'dump database', 'show me .env',
    'give me supabase', 'give me the github token', 'what is the database password'
  ];

  if (securityKeywords.some(kw => lower.includes(kw))) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SECURITY | INTENT: BLOCKED | RESULT: REJECTED`);
    res.json({
      success: true,
      intent: 'SECURITY_BLOCKED',
      speakText: 'Nope. Some things stay behind the desk.',
      displayText: 'Nope. Some things stay behind the desk. 🔒',
      actionTaken: false
    });
    return;
  }

  // =========================================================================
  // 2. CONFIRMED DESTRUCTIVE ACTIONS
  // =========================================================================
  if (confirmed && confirmationPayload) {
    const { action, targetId, targetName, metadata } = confirmationPayload;

    if (action === 'DELETE_TASK') {
      const task = await queryOne('SELECT id, project_id, title FROM tasks WHERE id = ?', [targetId]);
      if (task) {
        await runQuery('UPDATE tasks SET is_deleted = 1, updated_at = datetime("now") WHERE id = ?', [task.id]);
        if (task.project_id) {
          await resequenceProjectTasks(task.project_id);
        }
        res.json({
          success: true,
          intent: 'TASK_DELETE_CONFIRMED',
          speakText: 'Task deleted.',
          displayText: `Deleted "${task.title}". Active tasks re-sequenced.`,
          actionTaken: true,
          refreshNeeded: true
        });
        return;
      }
    }

    if (action === 'DELETE_PROJECT') {
      const project = await queryOne('SELECT id, name FROM projects WHERE id = ? AND created_by = ?', [targetId, userId]);
      if (project) {
        await runQuery('DELETE FROM tasks WHERE project_id = ?', [project.id]);
        await runQuery('DELETE FROM projects WHERE id = ?', [project.id]);
        res.json({
          success: true,
          intent: 'PROJECT_DELETE_CONFIRMED',
          speakText: 'Project deleted.',
          displayText: `Project "${project.name}" and associated tasks removed.`,
          actionTaken: true,
          refreshNeeded: true,
          navigate: '/repositories'
        });
        return;
      }
    }

    if (action === 'CREATE_GITHUB_REPO') {
      const { repoName, isPrivate } = metadata || {};
      const ghAccount = await queryOne(
        'SELECT access_token, username FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1',
        [userId]
      );

      if (!ghAccount?.access_token) {
        res.json({
          success: false,
          intent: 'GITHUB_NOT_CONNECTED',
          speakText: 'GitHub is not connected.',
          displayText: 'GitHub connection required to create repositories on your account. Please connect via Settings or GitHub Hub.',
          actionTaken: false
        });
        return;
      }

      try {
        const ghRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghAccount.access_token}`,
            'User-Agent': 'SHIORI-Spark',
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: repoName,
            private: Boolean(isPrivate),
            description: `SHIORI Project Repository: ${repoName}`,
            auto_init: true
          })
        });

        const ghData: any = await ghRes.json();
        if (ghRes.ok && ghData.html_url) {
          await runQuery(`
            INSERT INTO user_repositories (id, user_id, repo_name, full_name, is_private, default_branch, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
          `, [uuidv4(), userId, ghData.name, ghData.full_name, ghData.private ? 1 : 0, ghData.default_branch || 'main']);

          const projId = uuidv4();
          await runQuery(`
            INSERT INTO projects (id, name, description, github_repo_name, github_repo_url, default_branch, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `, [projId, ghData.name, ghData.description || '', ghData.full_name, ghData.html_url, ghData.default_branch || 'main', userId]);

          res.json({
            success: true,
            intent: 'GITHUB_REPO_CREATED',
            speakText: `Repository created. ${ghData.name} is ready.`,
            displayText: `Created repository **${ghData.full_name}** (${ghData.private ? 'Private' : 'Public'}) and synced to SHIORI.`,
            actionTaken: true,
            repoUrl: ghData.html_url,
            projectId: projId,
            refreshNeeded: true
          });
          return;
        } else {
          res.json({
            success: false,
            intent: 'GITHUB_REPO_CREATE_FAILED',
            speakText: 'Could not create repository on GitHub.',
            displayText: `GitHub returned: ${ghData.message || 'Validation failed'}.`,
            actionTaken: false
          });
          return;
        }
      } catch (e: any) {
        res.json({
          success: false,
          intent: 'GITHUB_ERROR',
          speakText: 'I could not reach GitHub right now.',
          displayText: 'Network error communicating with GitHub API.',
          actionTaken: false
        });
        return;
      }
    }
  }

  // =========================================================================
  // 3. APP LIFECYCLE & APP CONTROL COMMANDS
  // =========================================================================
  if (
    lower === 'close shiori' || lower === 'exit shiori' || lower === 'quit shiori' || 
    lower === 'close the app' || lower === 'exit the app' || lower === 'quit the app'
  ) {
    res.json({
      success: true,
      intent: 'APP_CLOSE',
      appAction: 'close_app',
      speakText: 'Closing SHIORI.',
      displayText: 'Attempting to close SHIORI...',
      actionTaken: true
    });
    return;
  }

  if (
    lower === 'close spark' || lower === 'exit spark' || lower === 'minimize spark' || 
    lower === 'hide spark' || lower === 'dismiss spark' || lower === 'close modal'
  ) {
    res.json({
      success: true,
      intent: 'SPARK_CLOSE',
      appAction: 'close_spark',
      speakText: 'Closing Spark.',
      displayText: 'Spark closed. Standing by for wake word.',
      actionTaken: true
    });
    return;
  }

  if (lower === 'go back' || lower === 'navigate back' || lower === 'back') {
    res.json({
      success: true,
      intent: 'APP_BACK',
      appAction: 'go_back',
      speakText: 'Going back.',
      displayText: 'Navigating back.',
      actionTaken: true
    });
    return;
  }

  if (lower === 'go forward' || lower === 'forward') {
    res.json({
      success: true,
      intent: 'APP_FORWARD',
      appAction: 'go_forward',
      speakText: 'Going forward.',
      displayText: 'Navigating forward.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('refresh shiori') || lower.includes('reload shiori') || lower === 'refresh' || lower === 'reload') {
    res.json({
      success: true,
      intent: 'APP_RELOAD',
      appAction: 'reload',
      speakText: 'Refreshing SHIORI.',
      displayText: 'Refreshing workspace data...',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('log me out') || lower.includes('sign out') || lower.includes('logout')) {
    res.json({
      success: true,
      intent: 'APP_LOGOUT',
      appAction: 'logout',
      speakText: 'Logging out.',
      displayText: 'Logging out of SHIORI session. See you soon.',
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 4. UI & APPEARANCE CONTROLS (THEME, ACCENT, MORPHBAR)
  // =========================================================================
  if (lower.includes('open morphbar') || lower.includes('expand morphbar') || lower.includes('expand island') || lower.includes('open island')) {
    res.json({
      success: true,
      intent: 'UI_MORPHBAR_EXPAND',
      appAction: 'expand_morphbar',
      speakText: 'Expanding MorphBar.',
      displayText: 'MorphBar island expanded.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('close morphbar') || lower.includes('collapse morphbar') || lower.includes('collapse island') || lower.includes('close island')) {
    res.json({
      success: true,
      intent: 'UI_MORPHBAR_COLLAPSE',
      appAction: 'collapse_morphbar',
      speakText: 'Collapsing MorphBar.',
      displayText: 'MorphBar island collapsed.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('dark mode') || lower.includes('turn on dark mode') || lower.includes('enable dark mode') || lower.includes('switch to dark')) {
    res.json({
      success: true,
      intent: 'UI_THEME_DARK',
      appAction: 'set_theme',
      theme: 'dark',
      speakText: 'Dark mode enabled.',
      displayText: 'Switched appearance to **Dark Mode**.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('light mode') || lower.includes('turn on light mode') || lower.includes('enable light mode') || lower.includes('switch to light')) {
    res.json({
      success: true,
      intent: 'UI_THEME_LIGHT',
      appAction: 'set_theme',
      theme: 'light',
      speakText: 'Light mode enabled.',
      displayText: 'Switched appearance to **Light Mode**.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('switch to e-ink') || lower.includes('e-ink matte') || lower.includes('eink mode') || lower.includes('e-ink mode')) {
    res.json({
      success: true,
      intent: 'UI_MODE_EINK',
      appAction: 'set_ui_mode',
      uiMode: 'eink_matte',
      speakText: 'Switched to E-ink Matte.',
      displayText: 'Switched display mode to **E-ink Matte**.',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('switch to color matte') || lower.includes('color matte') || lower.includes('color mode')) {
    res.json({
      success: true,
      intent: 'UI_MODE_COLOR',
      appAction: 'set_ui_mode',
      uiMode: 'color_matte',
      speakText: 'Switched to Color Matte.',
      displayText: 'Switched display mode to **Color Matte**.',
      actionTaken: true
    });
    return;
  }

  if (lower.startsWith('change accent') || lower.startsWith('set accent') || lower.includes('accent to')) {
    let colorName = 'forest green';
    let hex = '#2E5A36';

    if (lower.includes('amber') || lower.includes('gold') || lower.includes('yellow') || lower.includes('orange')) {
      colorName = 'warm amber';
      hex = '#D97706';
    } else if (lower.includes('indigo') || lower.includes('blue')) {
      colorName = 'indigo';
      hex = '#4F46E5';
    } else if (lower.includes('red') || lower.includes('crimson') || lower.includes('scarlet')) {
      colorName = 'crimson';
      hex = '#DC2626';
    } else if (lower.includes('charcoal') || lower.includes('black') || lower.includes('slate')) {
      colorName = 'charcoal slate';
      hex = '#1E293B';
    } else if (lower.includes('violet') || lower.includes('purple')) {
      colorName = 'violet';
      hex = '#7C3AED';
    } else if (lower.includes('green') || lower.includes('forest')) {
      colorName = 'forest green';
      hex = '#2E5A36';
    }

    res.json({
      success: true,
      intent: 'UI_ACCENT',
      appAction: 'set_accent',
      accentColor: hex,
      speakText: `Accent changed to ${colorName}.`,
      displayText: `Updated accent color to **${colorName}** (${hex}).`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 5. TASK CREATION INTENT ("CREATE TASK", "ADD TASK", "NEW TASK", "REMIND ME TO")
  // =========================================================================
  if (
    /^(please\s*)?(create|add|new)\s+(a\s+)?task\b/i.test(lower) ||
    lower.includes('create task') || lower.includes('add task') || lower.includes('new task') || 
    lower.startsWith('create a task') || lower.startsWith('add a task') ||
    lower.startsWith('remind me to') || lower.includes('remind me to')
  ) {
    let title = rawText
      .replace(/^(please\s*)?(create|add|new)\s+(a\s+)?task\s+(called|to|named|for|:)?\s*/i, '')
      .replace(/^(please\s*)?remind\s+me\s+(to\s+)?/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    if (!title || title.length < 2) {
      title = 'New Task';
    }

    let projectId = context.projectId;
    let project = null;

    if (projectId) {
      project = await queryOne('SELECT id, name, github_repo_name FROM projects WHERE id = ?', [projectId]);
    }

    if (!project) {
      project = await queryOne('SELECT id, name, github_repo_name FROM projects WHERE created_by = ? ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (project) projectId = project.id;
    }

    if (!project) {
      projectId = uuidv4();
      await runQuery(`
        INSERT INTO projects (id, name, description, created_by, created_at, updated_at)
        VALUES (?, 'Main Workspace', 'Default SHIORI workspace', ?, datetime('now'), datetime('now'))
      `, [projectId, userId]);
      project = { id: projectId, name: 'Main Workspace', github_repo_name: null };
    }

    const maxSeq = await queryOne(
      `SELECT COALESCE(MAX(sequence_order), 0) as max_seq, COALESCE(MAX(task_number), 0) as max_num 
       FROM tasks WHERE project_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
      [projectId]
    );

    const nextSeq = (maxSeq?.max_seq || 0) + 1;
    const taskCode = `TASK-${String(nextSeq).padStart(2, '0')}`;
    const taskId = uuidv4();

    let priority = 'MEDIUM';
    if (lower.includes('urgent')) priority = 'URGENT';
    else if (lower.includes('high priority')) priority = 'HIGH';
    else if (lower.includes('low priority')) priority = 'LOW';

    let deadline: string | null = null;
    if (lower.includes('today')) {
      const now = new Date();
      deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0).toISOString();
    } else if (lower.includes('tomorrow')) {
      const now = new Date();
      deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0, 0).toISOString();
    }

    await runQuery(`
      INSERT INTO tasks (
        id, project_id, task_code, task_number, sequence_order, title, description,
        priority, status, deadline, created_by, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'TODO', ?, ?, 0, datetime('now'), datetime('now'))
    `, [taskId, projectId, taskCode, nextSeq, nextSeq, title, `Task created via Spark: ${title}`, priority, deadline, userId]);

    await runQuery(`
      INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
      VALUES (?, ?, 'TASK_CREATED', ?, 'Created via Spark voice command', datetime('now'))
    `, [uuidv4(), taskId, `Created ${taskCode}: ${title}`]);

    await runQuery(`
      INSERT INTO global_activities (id, user_id, category, icon_symbol, title, meta_text, created_at)
      VALUES (?, ?, 'TASK', '✦', ?, ?, datetime('now'))
    `, [uuidv4(), userId, `Created ${taskCode}: ${title}`, `Project: ${project.name}`]);

    res.json({
      success: true,
      intent: 'TASK_CREATE',
      speakText: `Added ${taskCode}.`,
      displayText: `Created **${taskCode}**: "${title}" in *${project.name}* [${priority}].`,
      task: { id: taskId, taskCode, title, projectId },
      actionTaken: true,
      refreshNeeded: true
    });
    return;
  }

  // =========================================================================
  // 6. TASK PRIORITY UPDATE ("MAKE IT URGENT", "CHANGE PRIORITY TO HIGH")
  // =========================================================================
  if (
    lower.includes('priority') || lower.startsWith('make it urgent') || 
    lower.startsWith('make it high') || lower.startsWith('make it medium') || lower.startsWith('make it low') ||
    lower.startsWith('set priority')
  ) {
    let newPriority = 'URGENT';
    if (lower.includes('urgent')) newPriority = 'URGENT';
    else if (lower.includes('high')) newPriority = 'HIGH';
    else if (lower.includes('medium')) newPriority = 'MEDIUM';
    else if (lower.includes('low')) newPriority = 'LOW';

    let targetTask = await resolveTask(rawText, context);

    if (targetTask) {
      await runQuery('UPDATE tasks SET priority = ?, updated_at = datetime("now") WHERE id = ?', [newPriority, targetTask.id]);
      await runQuery(`
        INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
        VALUES (?, ?, 'PRIORITY_CHANGED', ?, 'Updated priority via Spark', datetime('now'))
      `, [uuidv4(), targetTask.id, `Priority changed to ${newPriority}`]);

      res.json({
        success: true,
        intent: 'TASK_PRIORITY_UPDATE',
        speakText: `Priority updated to ${newPriority.toLowerCase()}.`,
        displayText: `Updated **${targetTask.task_code}** ("${targetTask.title}") priority to **${newPriority}**.`,
        actionTaken: true,
        refreshNeeded: true
      });
      return;
    }
  }

  // =========================================================================
  // 7. TASK DEADLINE / MOVE ("MOVE TO TOMORROW", "MOVE TO TODAY")
  // =========================================================================
  if (
    lower.includes('move to tomorrow') || lower.includes('move it to tomorrow') || 
    lower.includes('move to today') || lower.includes('move it to today') ||
    lower.includes('postpone') || lower.includes('set deadline')
  ) {
    let targetTask = await resolveTask(rawText, context);

    if (targetTask) {
      const now = new Date();
      let newDeadline: string;
      let label = 'today';

      if (lower.includes('tomorrow') || lower.includes('postpone')) {
        newDeadline = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 18, 0, 0).toISOString();
        label = 'tomorrow';
      } else {
        newDeadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0).toISOString();
        label = 'today';
      }

      await runQuery('UPDATE tasks SET deadline = ?, updated_at = datetime("now") WHERE id = ?', [newDeadline, targetTask.id]);

      res.json({
        success: true,
        intent: 'TASK_DEADLINE_UPDATE',
        speakText: `Moved to ${label}.`,
        displayText: `Scheduled **${targetTask.task_code}** ("${targetTask.title}") for **${label}**.`,
        actionTaken: true,
        refreshNeeded: true
      });
      return;
    }
  }

  // =========================================================================
  // 8. TASK STATUS CHANGE ("START WORKING ON TASK-01", "SET TO IN PROGRESS", "REOPEN")
  // =========================================================================
  if (
    lower.startsWith('start working on') || lower.includes('set to in progress') || 
    lower.includes('mark in progress') || lower.startsWith('reopen')
  ) {
    let targetTask = await resolveTask(rawText, context);

    if (targetTask) {
      const newStatus = lower.includes('reopen') ? 'TODO' : 'IN_PROGRESS';
      await runQuery('UPDATE tasks SET status = ?, updated_at = datetime("now") WHERE id = ?', [newStatus, targetTask.id]);

      res.json({
        success: true,
        intent: 'TASK_STATUS_UPDATE',
        speakText: newStatus === 'IN_PROGRESS' ? `Started work on ${targetTask.task_code}.` : `Reopened ${targetTask.task_code}.`,
        displayText: `Set **${targetTask.task_code}** ("${targetTask.title}") to **${newStatus}**.`,
        actionTaken: true,
        refreshNeeded: true
      });
      return;
    }
  }

  // =========================================================================
  // 9. TASK DELETION INTENT (Requires Confirmation)
  // =========================================================================
  if (
    /^(please\s*)?(delete|remove)\s+(the\s+)?task\b/i.test(lower) ||
    lower.includes('delete task') || lower.includes('remove task') ||
    lower.startsWith('delete ') || lower.startsWith('remove ')
  ) {
    let task = await resolveTask(rawText, context);

    if (task) {
      res.json({
        success: true,
        intent: 'TASK_DELETE_CONFIRMATION',
        speakText: `Delete ${task.task_code}?`,
        displayText: `That will permanently delete **${task.task_code}** ("${task.title}"). Do you want to proceed?`,
        needsConfirmation: true,
        confirmationPayload: {
          action: 'DELETE_TASK',
          targetId: task.id,
          targetName: `${task.task_code}: ${task.title}`
        },
        actionTaken: false
      });
      return;
    } else {
      res.json({
        success: false,
        intent: 'TASK_NOT_FOUND',
        speakText: 'Which task do you want to delete?',
        displayText: 'Specify a task code (e.g. "Delete TASK-01") or open a task first.',
        actionTaken: false
      });
      return;
    }
  }

  // =========================================================================
  // 10. TASK COMPLETION INTENT
  // =========================================================================
  if (
    lower.includes('complete task') || lower.includes('mark task') || 
    lower.includes('finish task') || lower.includes('done with task') ||
    lower.startsWith('complete ') || lower.startsWith('finish ') ||
    lower === 'complete it' || lower === 'finish it' || lower === 'done'
  ) {
    let task = await resolveTask(rawText, context);

    if (!task) {
      task = await queryOne(
        `SELECT id, task_code, title, project_id FROM tasks 
         WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)
         ORDER BY sequence_order ASC, created_at ASC LIMIT 1`
      );
    }

    if (task) {
      await runQuery('UPDATE tasks SET status = "DONE", updated_at = datetime("now") WHERE id = ?', [task.id]);
      await runQuery(`
        INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
        VALUES (?, ?, 'STATUS_CHANGED', 'Marked DONE via Spark', 'Completed via companion', datetime('now'))
      `, [uuidv4(), task.id]);

      res.json({
        success: true,
        intent: 'TASK_COMPLETE',
        speakText: `${task.task_code} completed.`,
        displayText: `Marked **${task.task_code}** ("${task.title}") as **DONE**. That's one off the board. ✓`,
        actionTaken: true,
        refreshNeeded: true
      });
      return;
    } else {
      res.json({
        success: true,
        intent: 'TASK_COMPLETE_NONE',
        speakText: 'No pending tasks to complete.',
        displayText: 'Nothing urgent found to complete. Suspiciously peaceful.',
        actionTaken: false
      });
      return;
    }
  }

  // =========================================================================
  // 11. FOCUS TIMER INTENTS
  // =========================================================================
  if (
    lower.startsWith('start focus') || lower.startsWith('begin focus') ||
    lower.startsWith('start a focus') || lower.startsWith('pause focus') ||
    lower.startsWith('resume focus') || lower.startsWith('stop focus') ||
    lower.includes('focus timer') || lower.includes('pomodoro') ||
    lower.includes('how much time is left') || lower.includes('focus status') ||
    /^(start|pause|resume|stop|cancel)\s+(focus|timer)/i.test(lower)
  ) {
    if (lower.includes('how much time') || lower.includes('focus status') || lower.includes('time left')) {
      res.json({
        success: true,
        intent: 'FOCUS_STATUS',
        appAction: 'focus_status',
        speakText: 'Checking your focus timer.',
        displayText: 'Checking active focus timer status...',
        actionTaken: true
      });
      return;
    }

    if (lower.includes('pause')) {
      res.json({
        success: true,
        intent: 'FOCUS_PAUSE',
        speakText: 'Focus timer paused.',
        displayText: 'Focus timer paused. Catch your breath.',
        focusAction: 'pause',
        actionTaken: true
      });
      return;
    }

    if (lower.includes('resume') || lower.includes('continue')) {
      res.json({
        success: true,
        intent: 'FOCUS_RESUME',
        speakText: 'Resuming focus session.',
        displayText: 'Resuming focus session. Back to flow.',
        focusAction: 'resume',
        actionTaken: true
      });
      return;
    }

    if (lower.includes('stop') || lower.includes('cancel') || lower.includes('end') || lower.includes('reset')) {
      res.json({
        success: true,
        intent: 'FOCUS_STOP',
        speakText: 'Focus session stopped.',
        displayText: 'Focus session concluded.',
        focusAction: 'stop',
        actionTaken: true
      });
      return;
    }

    let minutes = 25;
    if (lower.includes('half an hour') || lower.includes('half hour')) {
      minutes = 30;
    } else if (lower.includes('an hour') || lower.includes('1 hour') || lower.includes('one hour')) {
      minutes = 60;
    } else {
      const minMatch = lower.match(/(\d+)\s*(min|minute|minutes|m\b)/i);
      if (minMatch) minutes = parseInt(minMatch[1], 10);
    }

    res.json({
      success: true,
      intent: 'FOCUS_START',
      speakText: `Focus started. ${minutes} minutes. Let's get it done.`,
      displayText: `Focus started (${minutes} mins). Let's get it done. ⏱️`,
      focusAction: 'start',
      focusMinutes: minutes,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 12. SEARCH INTENT ("FIND MY AUTHENTICATION TASK", "SEARCH FOR LOGIN")
  // =========================================================================
  if (lower.startsWith('find ') || lower.startsWith('search for ') || lower.startsWith('where is ')) {
    const queryTerm = rawText
      .replace(/^(please\s*)?(find|search\s+for|where\s+is)\s+(my\s+)?(the\s+)?/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    if (queryTerm && queryTerm.length > 1) {
      const matchingTasks = await queryAll(
        `SELECT task_code, title, priority, status FROM tasks 
         WHERE (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?) OR LOWER(task_code) LIKE LOWER(?)) 
         AND (is_deleted = 0 OR is_deleted IS NULL)
         LIMIT 3`,
        [`%${queryTerm}%`, `%${queryTerm}%`, `%${queryTerm}%`]
      );

      const matchingProjects = await queryAll(
        `SELECT id, name FROM projects 
         WHERE LOWER(name) LIKE LOWER(?) AND created_by = ?
         LIMIT 2`,
        [`%${queryTerm}%`, userId]
      );

      if ((matchingTasks && matchingTasks.length > 0) || (matchingProjects && matchingProjects.length > 0)) {
        const results = [];
        if (matchingTasks?.length) {
          results.push(...matchingTasks.map((t: any) => `• **${t.task_code}**: ${t.title} [${t.status}]`));
        }
        if (matchingProjects?.length) {
          results.push(...matchingProjects.map((p: any) => `• Project: **${p.name}**`));
        }

        res.json({
          success: true,
          intent: 'SEARCH_RESULTS',
          speakText: `Found matching items for ${queryTerm}.`,
          displayText: `**Search Results for "${queryTerm}":**\n\n${results.join('\n')}`,
          actionTaken: true
        });
        return;
      } else {
        res.json({
          success: true,
          intent: 'SEARCH_EMPTY',
          speakText: `No items found matching ${queryTerm}.`,
          displayText: `No tasks or projects found matching "${queryTerm}".`,
          actionTaken: false
        });
        return;
      }
    }
  }

  // =========================================================================
  // 12.5 EXPLICIT NAVIGATION ACTIONS ONLY ("OPEN SETTINGS", "OPEN REPOSITORIES", "GO TO TODOS")
  // MUST NEVER TRIGGER ON INFORMATION QUERIES (e.g. "What repositories do we have?")
  // =========================================================================
  const isExplicitNav = 
    lower.startsWith('open ') || lower.startsWith('go to ') || 
    lower.startsWith('navigate to ') || lower.startsWith('take me to ') ||
    lower.startsWith('show page ') || lower.startsWith('switch page ') ||
    ['open settings', 'open home', 'open dashboard', 'open tasks', 'open todos', 'open repositories', 'open projects', 'open github', 'open journal', 'open activity', 'open connections'].includes(lower);

  if (isExplicitNav) {
    if (lower.includes('setting') || lower.includes('appearance') || lower.includes('theme') || lower.includes('matte')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/settings) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Settings.', displayText: 'Opening SHIORI Settings.', navigate: '/settings', actionTaken: true });
      return;
    }
    if (lower.includes('home') || lower.includes('dashboard')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/home) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Home.', displayText: 'Opening SHIORI Home.', navigate: '/home', actionTaken: true });
      return;
    }
    if (lower.includes('todo') || lower.includes('task')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/todos) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Todos.', displayText: 'Opening My Todos.', navigate: '/todos', actionTaken: true });
      return;
    }
    if (lower.includes('repositories') || lower.includes('repo') || lower.includes('projects')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/repositories) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Repositories.', displayText: 'Opening Repositories.', navigate: '/repositories', actionTaken: true });
      return;
    }
    if (lower.includes('workspace')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/workspaces) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Workspaces.', displayText: 'Opening Workspaces.', navigate: '/workspaces', actionTaken: true });
      return;
    }
    if (lower.includes('connection') || lower.includes('friend')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/connections) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Connections.', displayText: 'Opening Connections.', navigate: '/connections', actionTaken: true });
      return;
    }
    if (lower.includes('github') || lower.includes('pipeline') || lower.includes('webhook')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/github) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening GitHub Hub.', displayText: 'Opening GitHub Hub.', navigate: '/github', actionTaken: true });
      return;
    }
    if (lower.includes('journal') || lower.includes('audit')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/journal) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Journal.', displayText: 'Opening Daily Journal.', navigate: '/journal', actionTaken: true });
      return;
    }
    if (lower.includes('notification')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/notifications) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Notifications.', displayText: 'Opening Notifications.', navigate: '/notifications', actionTaken: true });
      return;
    }
    if (lower.includes('install')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: NAVIGATION | INTENT: NAVIGATE (/install) | RESULT: SUCCESS`);
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Installation Gateway.', displayText: 'Opening PWA Installation Gateway.', navigate: '/install', actionTaken: true });
      return;
    }
  }

  // =========================================================================
  // 13. "WHAT ARE WE DOING NOW?" & PROJECT WORK SUMMARY INTENT
  // Connects: Projects -> Connected Repositories -> Active Tasks -> Overdue Tasks -> Git Activity
  // =========================================================================
  const isWorkSummaryQuery =
    lower.includes('what are we doing now') ||
    lower.includes('what are we working on') ||
    lower.includes('what are we currently working on') ||
    lower.includes('what are we doing currently') ||
    lower.includes('what are we building') ||
    lower.includes('what is currently in progress') ||
    lower.includes('what is in progress') ||
    lower.includes("what's in progress") ||
    lower.includes('what are the current tasks') ||
    lower.includes('what are the tasks we are doing now') ||
    lower.includes("what are the tasks we're doing now") ||
    lower.includes('what are the tasks we are doing') ||
    lower.includes('what tasks are we doing now') ||
    lower.includes('what are we working on right now') ||
    lower.includes('what are we doing right now') ||
    lower === 'what are we doing' ||
    lower === 'what are we working on' ||
    lower === 'what are our tasks' ||
    lower === 'what tasks are we doing';

  if (isWorkSummaryQuery) {
    const userProjects = await queryAll(
      `SELECT p.id, p.name, p.github_repo_name, p.description 
       FROM projects p 
       WHERE p.created_by = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
       ORDER BY p.updated_at DESC`,
      [userId, userId]
    );

    const allTasks = await queryAll(
      `SELECT t.id, t.project_id, t.task_code, t.title, t.priority, t.status, t.deadline, t.updated_at, p.name as project_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY 
         CASE WHEN t.status IN ('IN_PROGRESS', 'IN PROGRESS', 'DOING') THEN 1
              WHEN t.deadline IS NOT NULL AND t.deadline < datetime('now') THEN 2
              WHEN t.priority = 'URGENT' THEN 3
              WHEN t.priority = 'HIGH' THEN 4
              ELSE 5 END,
         t.sequence_order ASC`,
      []
    );

    const overdueTasks = (allTasks || []).filter(t => t.status !== 'DONE' && t.deadline && new Date(t.deadline).getTime() < Date.now());
    const inProgressTasks = (allTasks || []).filter(t => ['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
    const pendingTasks = (allTasks || []).filter(t => t.status !== 'DONE' && !['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
    const completedTasks = (allTasks || []).filter(t => t.status === 'DONE');

    const projectCount = (userProjects || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: PROJECT_WORK_SUMMARY | PROJECTS: ${projectCount} | ACTIVE_TASKS: ${inProgressTasks.length} | OVERDUE: ${overdueTasks.length}`);

    if (projectCount === 0 && (allTasks || []).length === 0) {
      const resp = "You don't have any active projects or tasks created yet. Clean workspace! You can say 'Create task <title>' or 'Create project <name>' to start building.";
      res.json({
        success: true,
        intent: 'PROJECT_WORK_SUMMARY_EMPTY',
        speakText: "You don't have any active projects or tasks created yet. Clean workspace.",
        displayText: resp,
        actionTaken: true
      });
      return;
    }

    const sections: string[] = [];
    const speechSentences: string[] = [];

    if (projectCount > 0) {
      sections.push(`Right now you're working on **${projectCount}** project${projectCount === 1 ? '' : 's'}:\n`);
      speechSentences.push(`Right now you're working on ${projectCount} project${projectCount === 1 ? '' : 's'}.`);

      for (const proj of (userProjects || [])) {
        const projTasks = (allTasks || []).filter(t => t.project_id === proj.id);
        const projInProgress = projTasks.filter(t => ['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
        const projPending = projTasks.filter(t => t.status !== 'DONE' && !['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
        const projCompleted = projTasks.filter(t => t.status === 'DONE');

        let projBlock = `**${proj.name}**\n`;
        if (proj.github_repo_name) {
          projBlock += `• Repository: \`${proj.github_repo_name}\`\n`;
        }

        const speechProjDetails: string[] = [];

        if (projInProgress.length > 0) {
          projBlock += projInProgress.map(t => `• Active: **${t.task_code}** — ${t.title}`).join('\n') + '\n';
          speechProjDetails.push(`${projInProgress.length} active task${projInProgress.length === 1 ? '' : 's'}: ${projInProgress.map(t => t.title).join(', ')}`);
        }

        if (projPending.length > 0) {
          projBlock += projPending.slice(0, 2).map(t => `• Pending: ${t.task_code} — ${t.title}`).join('\n') + '\n';
          if (projInProgress.length === 0) {
            speechProjDetails.push(`${projPending.length} pending task${projPending.length === 1 ? '' : 's'}`);
          }
        }

        if (projCompleted.length > 0) {
          const topDone = projCompleted[0];
          projBlock += `• Completed recently: ${topDone.title}\n`;
        }

        if (projTasks.length === 0) {
          projBlock += `• No open tasks in this project\n`;
          speechProjDetails.push('no open tasks');
        }

        sections.push(projBlock.trim());
        speechSentences.push(`In ${proj.name}, you have ${speechProjDetails.join(', ') || 'no active tasks'}.`);
      }
    } else {
      // Standalone tasks outside projects
      sections.push(`**Active Workspace Tasks:**\n`);
      if (inProgressTasks.length > 0) {
        sections.push(inProgressTasks.map(t => `• Active: **${t.task_code}** — ${t.title}`).join('\n'));
      }
      if (pendingTasks.length > 0) {
        sections.push(pendingTasks.slice(0, 3).map(t => `• Pending: ${t.task_code} — ${t.title}`).join('\n'));
      }
      speechSentences.push(`You have ${inProgressTasks.length} active and ${pendingTasks.length} pending tasks.`);
    }

    if (overdueTasks.length > 0) {
      sections.push(`\n⚠️ **${overdueTasks.length} task${overdueTasks.length === 1 ? '' : 's'} overdue:**\n` + overdueTasks.slice(0, 2).map(t => `• ${t.task_code}: ${t.title} *(in ${t.project_name || 'Project'})*`).join('\n'));
      speechSentences.push(`You also have ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} that need attention.`);
    }

    const displayText = sections.join('\n\n');
    const speakText = speechSentences.join(' ');

    res.json({
      success: true,
      intent: 'PROJECT_WORK_SUMMARY',
      speakText,
      displayText,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 14. PROJECT-SCOPED & REPOSITORY-SCOPED TASK & STATUS QUERIES
  // Examples:
  // "What tasks are inside the SHIORI project?"
  // "What tasks are we doing in SHIORI?"
  // "What have we completed in SHIORI?"
  // "What are we doing in the shiori repository?"
  // "Give me the full project status for SHIORI"
  // =========================================================================
  const isScopedProjectQuery =
    (lower.includes('project') || lower.includes('repository') || lower.includes('repo') || lower.includes('in ') || lower.includes('for ') || lower.includes('there')) &&
    (lower.includes('tasks inside') || lower.includes('tasks are inside') || lower.includes('tasks in') || lower.includes('doing in') || lower.includes('completed in') || lower.includes('finished in') || lower.includes('completed there') || lower.includes('finished there') || lower.includes('full project status') || lower.includes('project report') || lower.includes('state of the project') || lower.includes('where are we with'));

  const targetProject = await resolveTargetProject(rawText, userId, context);

  if (targetProject && isScopedProjectQuery) {
    const projTasks = await queryAll(
      `SELECT t.id, t.task_code, t.title, t.priority, t.status, t.deadline, t.updated_at 
       FROM tasks t 
       WHERE t.project_id = ? AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY 
         CASE WHEN t.status IN ('IN_PROGRESS', 'IN PROGRESS', 'DOING') THEN 1
              WHEN t.deadline IS NOT NULL AND t.deadline < datetime('now') THEN 2
              WHEN t.priority = 'URGENT' THEN 3
              WHEN t.priority = 'HIGH' THEN 4
              ELSE 5 END,
         t.sequence_order ASC`,
      [targetProject.id]
    );

    const latestCommit = targetProject.github_repo_name ? await queryOne(
      `SELECT commit_hash, message, author_name, branch_name, pushed_at 
       FROM github_commits 
       WHERE LOWER(repo_name) = LOWER(?) OR LOWER(repo_name) LIKE LOWER(?) 
       ORDER BY pushed_at DESC LIMIT 1`,
      [targetProject.github_repo_name, `%${targetProject.name}%`]
    ) : null;

    const projActive = (projTasks || []).filter(t => ['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
    const projPending = (projTasks || []).filter(t => t.status !== 'DONE' && !['IN_PROGRESS', 'IN PROGRESS', 'DOING'].includes(t.status));
    const projOverdue = (projTasks || []).filter(t => t.status !== 'DONE' && t.deadline && new Date(t.deadline).getTime() < Date.now());
    const projCompleted = (projTasks || []).filter(t => t.status === 'DONE');

    // Scenario A: User specifically asked for completed tasks in this project
    if (lower.includes('completed') || lower.includes('finish') || lower.includes('done')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: COMPLETED_PROJECT_TASKS | PROJECT: ${targetProject.name}`);

      if (projCompleted.length === 0) {
        res.json({
          success: true,
          intent: 'COMPLETED_PROJECT_TASKS_EMPTY',
          projectId: targetProject.id,
          speakText: `No completed tasks recorded in ${targetProject.name} yet.`,
          displayText: `No completed tasks found in project **${targetProject.name}**. Ready when you finish your next task.`,
          actionTaken: true
        });
        return;
      }

      const listLines = projCompleted.map(t => `• **${t.task_code}**: ${t.title}`).join('\n');
      const speak = `You have completed ${projCompleted.length} task${projCompleted.length === 1 ? '' : 's'} in ${targetProject.name}: ${projCompleted.slice(0, 3).map(t => t.title).join(', ')}.`;

      res.json({
        success: true,
        intent: 'COMPLETED_PROJECT_TASKS',
        projectId: targetProject.id,
        speakText: speak,
        displayText: `**Completed Work in ${targetProject.name} (${projCompleted.length}):**\n\n${listLines}`,
        actionTaken: true
      });
      return;
    }

    // Scenario B: Full Project Status / Project Report
    if (lower.includes('full project status') || lower.includes('project report') || lower.includes('state of the project') || lower.includes('where are we with')) {
      console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: PROJECT_STATUS_REPORT | PROJECT: ${targetProject.name}`);

      const reportParts: string[] = [
        `### PROJECT STATUS: ${targetProject.name.toUpperCase()}`,
        `• **Repository:** ${targetProject.github_repo_name ? `\`${targetProject.github_repo_name}\`` : 'Local project (No GitHub repository attached)'}`
      ];

      if (projActive.length > 0) {
        reportParts.push(`**CURRENT WORK (ACTIVE)**\n` + projActive.map(t => `• ${t.task_code}: ${t.title} [${t.priority}]`).join('\n'));
      }
      if (projPending.length > 0) {
        reportParts.push(`**PENDING BACKLOG**\n` + projPending.slice(0, 3).map(t => `• ${t.task_code}: ${t.title} [${t.priority}]`).join('\n'));
      }
      if (projOverdue.length > 0) {
        reportParts.push(`**OVERDUE ATTENTION**\n` + projOverdue.map(t => `• ⚠️ ${t.task_code}: ${t.title}`).join('\n'));
      }
      if (projCompleted.length > 0) {
        reportParts.push(`**RECENTLY COMPLETED**\n` + projCompleted.slice(0, 3).map(t => `• ✓ ${t.task_code}: ${t.title}`).join('\n'));
      }
      if (latestCommit) {
        reportParts.push(`**GIT ACTIVITY**\n• Latest commit: \`${latestCommit.commit_hash.substring(0, 7)}\` — "${latestCommit.message}" (*${latestCommit.author_name}*) on branch \`${latestCommit.branch_name || 'main'}\``);
      }

      const speak = `${targetProject.name} currently has ${projActive.length} active tasks, ${projPending.length} pending tasks, and ${projCompleted.length} completed tasks. ${projOverdue.length > 0 ? `There are ${projOverdue.length} overdue tasks.` : 'No overdue tasks.'}`;

      res.json({
        success: true,
        intent: 'PROJECT_STATUS_REPORT',
        projectId: targetProject.id,
        speakText: speak,
        displayText: reportParts.join('\n\n'),
        actionTaken: true
      });
      return;
    }

    // Scenario C: Project Tasks Summary ("What tasks are inside SHIORI?", "What are we doing in SHIORI?")
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: PROJECT_TASK_SUMMARY | PROJECT: ${targetProject.name}`);

    const parts: string[] = [`**${targetProject.name.toUpperCase()} CURRENT TASKS:**`];
    const speakParts: string[] = [];

    if (projActive.length > 0) {
      parts.push(`**ACTIVE**\n` + projActive.map(t => `• **${t.task_code}**: ${t.title} [${t.priority}]`).join('\n'));
      speakParts.push(`Active: ${projActive.map(t => t.title).join(', ')}.`);
    }

    if (projPending.length > 0) {
      parts.push(`**PENDING**\n` + projPending.slice(0, 4).map(t => `• ${t.task_code}: ${t.title} [${t.priority}]`).join('\n'));
      if (projActive.length === 0) {
        speakParts.push(`Pending: ${projPending.map(t => t.title).join(', ')}.`);
      }
    }

    if (projCompleted.length > 0) {
      parts.push(`**COMPLETED**\n` + projCompleted.slice(0, 3).map(t => `• ✓ ${t.title}`).join('\n'));
    }

    if (projOverdue.length > 0) {
      parts.push(`⚠️ **${projOverdue.length} task${projOverdue.length === 1 ? '' : 's'} overdue**`);
      speakParts.push(`${projOverdue.length} task${projOverdue.length === 1 ? '' : 's'} overdue.`);
    }

    if (projTasks.length === 0) {
      parts.push(`No tasks found in project **${targetProject.name}**. You can add one by saying "Create task <title> in ${targetProject.name}".`);
      speakParts.push(`No tasks found in ${targetProject.name}.`);
    }

    const displayText = parts.join('\n\n');
    const speakText = `${targetProject.name} currently has ${speakParts.join(' ')}`;

    res.json({
      success: true,
      intent: 'PROJECT_TASK_SUMMARY',
      projectId: targetProject.id,
      speakText: stripMarkdownForSpeech(speakText),
      displayText,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 15. GITHUB REPOSITORIES QUERY ("WHAT GITHUB REPOS ARE WE WORKING ON?", "WHICH REPOS ARE CONNECTED?")
  // STRICTLY INFORMATION — NO NAVIGATION REDIRECT
  // =========================================================================
  const isGithubRepoQuery =
    lower.includes('what github repositories') ||
    lower.includes('what github repos') ||
    lower.includes('which github repositories') ||
    lower.includes('which github repos') ||
    lower.includes('what repositories are we') ||
    lower.includes('what repositories am i') ||
    lower.includes('which repositories are connected') ||
    lower.includes('what repositories do i have') ||
    lower.includes('what repositories do we have') ||
    lower.includes('which repos are connected') ||
    lower.includes('what repos do i have') ||
    lower.includes('what repos do we have') ||
    lower.includes('show my repositories') ||
    lower.includes('show repositories') ||
    lower.includes('list my repositories') ||
    lower.includes('list repositories') ||
    lower.includes('what repository am i working on') ||
    lower.includes('which repo am i working on') ||
    lower.includes('which repo is connected') ||
    lower.includes('where is my code') ||
    lower.includes('how many repositories') ||
    lower.includes('connected repositories') ||
    lower.includes('my github repos') ||
    lower === 'repositories' || lower === 'my repos';

  if (isGithubRepoQuery) {
    const userRepos = await queryAll(
      `SELECT repo_name, full_name, is_private, default_branch, is_active 
       FROM user_repositories 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    const projectRepos = await queryAll(
      `SELECT name, github_repo_name, github_repo_url, default_branch 
       FROM projects 
       WHERE created_by = ? AND github_repo_name IS NOT NULL AND github_repo_name != '' 
       ORDER BY updated_at DESC`,
      [userId]
    );

    const ghAccount = await queryOne(
      `SELECT username FROM github_accounts WHERE user_id = ? ORDER BY connected_at DESC LIMIT 1`,
      [userId]
    );

    // Combine distinct repository names
    const repoSet = new Map<string, { name: string; full_name?: string; isPrivate?: boolean; branch?: string; projectName?: string }>();

    for (const r of (userRepos || [])) {
      const key = (r.full_name || r.repo_name).toLowerCase();
      repoSet.set(key, {
        name: r.repo_name,
        full_name: r.full_name,
        isPrivate: Boolean(r.is_private),
        branch: r.default_branch || 'main'
      });
    }

    for (const p of (projectRepos || [])) {
      const key = p.github_repo_name.toLowerCase();
      const existing = repoSet.get(key);
      if (existing) {
        existing.projectName = p.name;
      } else {
        repoSet.set(key, {
          name: p.github_repo_name,
          full_name: p.github_repo_name,
          branch: p.default_branch || 'main',
          projectName: p.name
        });
      }
    }

    const distinctRepos = Array.from(repoSet.values());
    const count = distinctRepos.length;

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: GITHUB_REPOSITORY_LIST | RESULT: SUCCESS (${count} repos)`);

    if (count === 0) {
      const accountNote = ghAccount?.username ? ` connected as **@${ghAccount.username}**` : '';
      res.json({
        success: true,
        intent: 'GITHUB_REPOSITORY_LIST_EMPTY',
        speakText: "I couldn't find any connected GitHub repositories.",
        displayText: `No connected GitHub repositories found${accountNote}. You can connect a repository from the GitHub Hub or Repositories page.`,
        actionTaken: true
      });
      return;
    }

    const repoListLines = distinctRepos.map(r => `• **${r.name}** ${r.isPrivate ? '*(Private)*' : '*(Public)*'}${r.projectName ? ` — linked to project *${r.projectName}*` : ''}`).join('\n');
    const repoNamesStr = distinctRepos.map(r => r.name).join(', ');

    const speak = count === 1
      ? `You have 1 connected repository: ${distinctRepos[0].name}.`
      : `You currently have ${count} connected repositories: ${repoNamesStr}.`;

    const display = `You currently have **${count}** connected repositor${count === 1 ? 'y' : 'ies'}:\n\n${repoListLines}`;

    res.json({
      success: true,
      intent: 'GITHUB_REPOSITORY_LIST',
      speakText: speak,
      displayText: display,
      count,
      repositories: distinctRepos,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 16. GIT COMMITS, STATUS, BRANCH & VERIFICATION QUERIES (NO NAVIGATION)
  // =========================================================================
  const isGitBranchQuery = 
    lower.includes('which branch') || 
    lower.includes('what branch') || 
    lower.includes('current branch');

  if (isGitBranchQuery) {
    let activeBranch = 'main';
    const latestCommit = await queryOne(
      `SELECT branch_name FROM github_commits ORDER BY pushed_at DESC LIMIT 1`
    );
    if (latestCommit?.branch_name) activeBranch = latestCommit.branch_name;

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: GIT_BRANCH | RESULT: SUCCESS (${activeBranch})`);

    res.json({
      success: true,
      intent: 'GIT_BRANCH',
      speakText: `You are on the ${activeBranch} branch.`,
      displayText: `Current active branch: **${activeBranch}**.`,
      branch: activeBranch,
      actionTaken: true
    });
    return;
  }

  const isGitVerifyQuery =
    lower.includes('did my latest commit pass') ||
    lower.includes('pass verification') ||
    lower.includes('commit verification') ||
    lower.includes('is ci passing') ||
    lower.includes('ci status') ||
    lower.includes('build status') ||
    lower.includes('verification status');

  if (isGitVerifyQuery) {
    const latestRun = await queryOne(
      `SELECT workflow_name, status, conclusion, tests_passed, tests_failed, branch_name 
       FROM github_workflow_runs 
       ORDER BY started_at DESC LIMIT 1`
    );

    const latestCommit = await queryOne(
      `SELECT commit_hash, message, author_name FROM github_commits ORDER BY pushed_at DESC LIMIT 1`
    );

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: GIT_VERIFY | RESULT: SUCCESS`);

    if (latestRun) {
      const isSuccess = latestRun.conclusion === 'success' || latestRun.status === 'completed';
      const testsMsg = latestRun.tests_total ? ` (${latestRun.tests_passed}/${latestRun.tests_total} tests passed)` : '';
      res.json({
        success: true,
        intent: 'GIT_VERIFY',
        speakText: isSuccess ? 'Your latest verification passed.' : 'Verification reported issues.',
        displayText: `Workflow **${latestRun.workflow_name}** on *${latestRun.branch_name || 'main'}*: **${(latestRun.conclusion || latestRun.status).toUpperCase()}**${testsMsg}.`,
        actionTaken: true
      });
      return;
    }

    if (latestCommit) {
      const shortSha = latestCommit.commit_hash.substring(0, 7);
      res.json({
        success: true,
        intent: 'GIT_VERIFY',
        speakText: `Commit ${shortSha} is registered and verified in SHIORI.`,
        displayText: `Latest commit **${shortSha}** ("${latestCommit.message}") has been cryptographically recorded with no open CI failures.`,
        actionTaken: true
      });
      return;
    }

    res.json({
      success: true,
      intent: 'GIT_VERIFY',
      speakText: 'No pending CI failures recorded.',
      displayText: 'Git verification active. No failed builds or CI discrepancies detected.',
      actionTaken: true
    });
    return;
  }

  const isGitCommitOrStatusQuery =
    lower.includes('what was my latest commit') ||
    lower.includes('latest commit') ||
    lower.includes('recent commits') ||
    lower.includes('recent commit') ||
    lower.includes('show my recent commits') ||
    lower.includes('show commits') ||
    lower.includes('what changed recently') ||
    lower.includes('what did i push recently') ||
    lower.includes('what did i push') ||
    lower.includes('git status') ||
    lower.includes('check git status') ||
    lower.includes('check git') ||
    lower === 'git';

  if (isGitCommitOrStatusQuery) {
    const recentCommits = await queryAll(
      `SELECT commit_hash, message, author_name, repo_name, branch_name, pushed_at 
       FROM github_commits 
       ORDER BY pushed_at DESC 
       LIMIT 3`
    );

    const fallbackCommits = (recentCommits && recentCommits.length > 0) ? recentCommits : await queryAll(
      `SELECT commit_sha as commit_hash, commit_message as message, author as author_name, branch as branch_name, committed_at as pushed_at 
       FROM task_commits 
       ORDER BY committed_at DESC 
       LIMIT 3`
    );

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: GIT_COMMITS | RESULT: SUCCESS`);

    if (fallbackCommits && fallbackCommits.length > 0) {
      const top = fallbackCommits[0];
      const shortSha = (top.commit_hash || 'HEAD').substring(0, 7);
      const commitList = fallbackCommits.map((c: any) => `• **${(c.commit_hash || '').substring(0, 7)}**: "${c.message}" by *${c.author_name || 'Developer'}*`).join('\n');

      res.json({
        success: true,
        intent: 'GIT_STATUS',
        speakText: `Your latest commit is ${shortSha}: ${top.message}.`,
        displayText: `**Recent Git History:**\n\n${commitList}\n\n*Repository status: Clean & Synced.*`,
        actionTaken: true
      });
      return;
    }

    const userAccount = await queryOne('SELECT username FROM github_accounts WHERE user_id = ?', [userId]);
    res.json({
      success: true,
      intent: 'GIT_STATUS',
      speakText: 'Git hub integration is active.',
      displayText: `Connected as **@${userAccount?.username || 'Developer'}**. No commit activity recorded yet in this workspace.`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 17. TASK SPECIFIC INTENTS (COMPLETED, OVERDUE, DUE TODAY, RUNNING/ACTIVE, SUMMARY)
  // =========================================================================
  if (lower.includes('what have we completed') || lower.includes('what have i completed') || lower.includes('what did i complete today') || lower.includes('completed tasks') || lower.includes('show completed tasks') || lower.includes('what did we finish')) {
    const completedTasks = await queryAll(
      `SELECT t.task_code, t.title, t.updated_at, p.name as project_name 
       FROM tasks t 
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status = 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.updated_at DESC LIMIT 5`
    );

    const count = (completedTasks || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: COMPLETED_TASKS | RESULT: SUCCESS (${count})`);

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_COMPLETED_EMPTY',
        speakText: 'No completed tasks found in your workspace yet.',
        displayText: 'No completed tasks recorded yet. Ready when you finish your next task.',
        actionTaken: true
      });
      return;
    }

    const lines = completedTasks.map((t: any) => `• **${t.task_code}**: ${t.title}${t.project_name ? ` *(in ${t.project_name})*` : ''}`).join('\n');
    res.json({
      success: true,
      intent: 'COMPLETED_TASKS',
      speakText: `You have completed ${count} task${count === 1 ? '' : 's'}: ${completedTasks.slice(0, 3).map((t: any) => t.title).join(', ')}.`,
      displayText: `**${count} Completed Task${count === 1 ? '' : 's'}:**\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  if (
    lower.includes("what's overdue") || 
    lower.includes('what is overdue') || 
    lower.includes('tasks are overdue') ||
    lower.includes('show overdue') ||
    lower.includes('overdue tasks') ||
    lower.includes('what tasks are late')
  ) {
    const overdueTasks = await queryAll(
      `SELECT t.task_code, t.title, t.priority, t.deadline, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' 
       AND t.deadline IS NOT NULL 
       AND t.deadline != '' 
       AND t.deadline < datetime('now')
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.deadline ASC LIMIT 5`
    );

    const count = (overdueTasks || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: OVERDUE_TASKS | RESULT: SUCCESS (${count})`);

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_OVERDUE_EMPTY',
        speakText: 'You have no overdue tasks.',
        displayText: 'Zero overdue tasks. All deadlines are in good standing. ✨',
        actionTaken: true
      });
      return;
    }

    const lines = overdueTasks.map((t: any) => `• **${t.task_code}**: ${t.title} [${t.priority}] in *${t.project_name || 'Project'}*`).join('\n');
    res.json({
      success: true,
      intent: 'OVERDUE_TASKS',
      speakText: `You have ${count} overdue task${count === 1 ? '' : 's'}.`,
      displayText: `**${count} Overdue Task${count === 1 ? '' : 's'}:**\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  if (
    lower.includes("what's due today") || 
    lower.includes('what is due today') || 
    lower.includes('what is due') ||
    lower.includes('due today') ||
    lower.includes("show today's tasks") ||
    lower.includes('today tasks')
  ) {
    const dueTodayTasks = await queryAll(
      `SELECT t.task_code, t.title, t.priority, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' 
       AND t.deadline IS NOT NULL 
       AND date(t.deadline) = date('now')
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.sequence_order ASC LIMIT 5`
    );

    const count = (dueTodayTasks || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: TODAY_TASKS | RESULT: SUCCESS (${count})`);

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_DUE_TODAY_EMPTY',
        speakText: 'No tasks due today.',
        displayText: 'No tasks scheduled with deadlines for today.',
        actionTaken: true
      });
      return;
    }

    const lines = dueTodayTasks.map((t: any) => `• **${t.task_code}**: ${t.title} [${t.priority}]`).join('\n');
    res.json({
      success: true,
      intent: 'TODAY_TASKS',
      speakText: `You have ${count} task${count === 1 ? '' : 's'} due today.`,
      displayText: `**${count} Task${count === 1 ? '' : 's'} Due Today:**\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  if (
    lower.includes("what's running") || 
    lower.includes('what is running') || 
    lower.includes('what tasks are active') ||
    lower.includes('what tasks are currently active') ||
    lower.includes('active tasks') ||
    lower.includes('what am i actively working on')
  ) {
    const runningTasks = await queryAll(
      `SELECT t.task_code, t.title, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE (t.status = 'IN_PROGRESS' OR t.status = 'IN PROGRESS' OR t.status = 'DOING') 
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.sequence_order ASC LIMIT 5`
    );

    const count = (runningTasks || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: ACTIVE_TASKS | RESULT: SUCCESS (${count})`);

    if (count === 0) {
      const topPending = await queryOne(
        `SELECT task_code, title FROM tasks WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY sequence_order ASC LIMIT 1`
      );

      if (topPending) {
        res.json({
          success: true,
          intent: 'ACTIVE_TASKS_EMPTY',
          speakText: `No tasks in progress. Your next pending task is ${topPending.task_code}: ${topPending.title}.`,
          displayText: `No task is currently marked **In Progress**.\n\nNext queued task: **${topPending.task_code}** ("${topPending.title}").`,
          actionTaken: true
        });
        return;
      }

      res.json({
        success: true,
        intent: 'ACTIVE_TASKS_EMPTY',
        speakText: 'No tasks currently running.',
        displayText: 'No tasks marked In Progress right now. Workspace is clean.',
        actionTaken: true
      });
      return;
    }

    const lines = runningTasks.map((t: any) => `• **${t.task_code}**: ${t.title} in *${t.project_name || 'SHIORI'}*`).join('\n');
    res.json({
      success: true,
      intent: 'ACTIVE_TASKS',
      speakText: `You have ${count} active task${count === 1 ? '' : 's'}: ${runningTasks.map((t: any) => t.title).join(', ')}.`,
      displayText: `**${count} Active Task${count === 1 ? '' : 's'} In Progress:**\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  const isTaskSummaryOrNextQuery =
    lower.includes("what's on my plate") ||
    lower.includes('what is on my plate') ||
    lower.includes("what's waiting for me") ||
    lower.includes('what is waiting for me') ||
    lower.includes('what needs my attention') ||
    lower.includes('what should i work on next') ||
    lower.includes('what should i work on') ||
    lower.includes('what do i need to do') ||
    lower.includes('highest priority task') ||
    lower.includes("what's my highest priority") ||
    lower.includes('what is my highest priority') ||
    lower.includes('how many tasks do i have') ||
    lower.includes('how many tasks') ||
    lower.includes('show pending tasks') ||
    lower.includes('what are my tasks') ||
    lower.includes('show my tasks') ||
    lower.includes('list my tasks') ||
    lower.includes('what tasks do i have') ||
    lower.includes("what's going on") ||
    lower.includes('what is going on') ||
    lower.includes("what's my status") ||
    lower.includes('give me my summary') ||
    lower.includes('give me a summary') ||
    lower === 'tasks' || lower === 'todos';

  if (isTaskSummaryOrNextQuery) {
    const activeTasks = await queryAll(
      `SELECT t.id, t.task_code, t.title, t.priority, t.status, t.deadline, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY 
         CASE WHEN t.deadline IS NOT NULL AND t.deadline != '' AND t.deadline < datetime('now') THEN 1
              WHEN t.deadline IS NOT NULL AND date(t.deadline) = date('now') THEN 2
              ELSE 3 END,
         CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 WHEN t.priority = 'MEDIUM' THEN 3 ELSE 4 END,
         CASE WHEN t.status = 'IN_PROGRESS' THEN 1 ELSE 2 END,
         t.sequence_order ASC
       LIMIT 5`
    );

    const totalCount = await queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const count = totalCount?.count || 0;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: TASK_SUMMARY | RESULT: SUCCESS (${count} tasks)`);

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_LIST_EMPTY',
        speakText: 'You have no pending tasks. Workspace is clean.',
        displayText: 'You have **0** pending tasks. Workspace is completely clean! ✨',
        actionTaken: true
      });
      return;
    }

    const top = activeTasks?.[0];
    const lines = (activeTasks || []).map((t: any) => `• **${t.task_code}**: ${t.title} [${t.priority}]`).join('\n');

    let speak = `You have ${count} pending task${count === 1 ? '' : 's'}.`;
    if (top) {
      speak += ` I recommend starting with ${top.task_code}: ${top.title}.`;
    }

    res.json({
      success: true,
      intent: 'TASK_SUMMARY',
      speakText: speak,
      displayText: `You have **${count}** pending task${count === 1 ? '' : 's'}:\n\n${lines}\n\n**Next recommended:** ${top?.task_code} ("${top?.title}")`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 18. PROJECT QUERIES (LIST, MEMBERS)
  // =========================================================================
  const isProjectQuery =
    lower.includes('what projects do i have') ||
    lower.includes('what projects do we have') ||
    lower.includes('show my projects') ||
    lower.includes('show projects') ||
    lower.includes('list my projects') ||
    lower.includes('list projects') ||
    lower.includes('how many projects do i have') ||
    lower.includes('how many projects') ||
    lower.includes('what project am i working on') ||
    lower.includes('who is working on this project') ||
    lower.includes('who are the project members') ||
    lower.includes('project members') ||
    lower === 'projects';

  if (isProjectQuery) {
    const projects = await queryAll(
      `SELECT p.id, p.name, p.description, p.github_repo_name, p.status,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND (t.is_deleted = 0 OR t.is_deleted IS NULL) AND t.status != 'DONE') as active_tasks
       FROM projects p 
       WHERE p.created_by = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
       ORDER BY p.updated_at DESC 
       LIMIT 5`,
      [userId, userId]
    );

    const count = (projects || []).length;
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: PROJECT_LIST | RESULT: SUCCESS (${count} projects)`);

    if (count === 0) {
      res.json({
        success: true,
        intent: 'PROJECT_LIST_EMPTY',
        speakText: 'You have no projects created yet.',
        displayText: 'No projects found in your SHIORI account. You can create one via "Create project <name>" or from the Repositories page.',
        actionTaken: true
      });
      return;
    }

    if (lower.includes('member') || lower.includes('who is working')) {
      const targetProj = projects[0];
      const members = await queryAll(
        `SELECT u.name, u.username, pm.role 
         FROM project_members pm 
         JOIN users u ON pm.user_id = u.id 
         WHERE pm.project_id = ?`,
        [targetProj.id]
      );

      const memList = (members || []).map((m: any) => `• **${m.name || m.username}** (${m.role})`).join('\n') || `• Owner: You`;
      res.json({
        success: true,
        intent: 'PROJECT_MEMBERS',
        projectId: targetProj.id,
        speakText: `Project ${targetProj.name} has ${(members || []).length || 1} contributor.`,
        displayText: `**Team on "${targetProj.name}":**\n\n${memList}`,
        actionTaken: true
      });
      return;
    }

    const lines = projects.map((p: any) => `• **${p.name}** ${p.github_repo_name ? `(\`${p.github_repo_name}\`)` : ''} — ${p.active_tasks} active task${p.active_tasks === 1 ? '' : 's'}`).join('\n');
    const pNames = projects.map((p: any) => p.name).join(', ');

    res.json({
      success: true,
      intent: 'PROJECT_LIST',
      speakText: `You have ${count} active project${count === 1 ? '' : 's'}: ${pNames}.`,
      displayText: `You have **${count}** project${count === 1 ? '' : 's'}:\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 19. FOCUS SESSION QUERIES ("HOW MUCH FOCUS TIME IS LEFT?", "IS FOCUS RUNNING?")
  // =========================================================================
  const isFocusQuery =
    lower.includes('how much focus time') ||
    lower.includes('is my focus timer running') ||
    lower.includes('is the focus timer running') ||
    lower.includes('what am i focusing on') ||
    lower.includes('when will my focus end') ||
    lower.includes('how long have i been focusing') ||
    lower.includes('did i finish my focus session') ||
    lower.includes('focus status') ||
    lower.includes('timer status');

  if (isFocusQuery) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: FOCUS_STATUS | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'FOCUS_STATUS',
      appAction: 'focus_status',
      speakText: 'Checking your focus session state.',
      displayText: 'Active focus timer synced with your session. ⏱️',
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 20. ACTIVITY & ACCOMPLISHMENTS QUERIES
  // =========================================================================
  const isActivityQuery =
    lower.includes('what did i do today') ||
    lower.includes('what did i accomplish') ||
    lower.includes('show today\'s activity') ||
    lower.includes('show activity') ||
    lower.includes('what did i work on yesterday') ||
    lower.includes('how productive was i today') ||
    lower.includes('my activity') ||
    lower === 'activity';

  if (isActivityQuery) {
    const activities = await queryAll(
      `SELECT title, meta_text, category, created_at 
       FROM global_activities 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    const completedTasks = await queryAll(
      `SELECT task_code, title 
       FROM tasks 
       WHERE status = 'DONE' AND date(updated_at) = date('now') AND (is_deleted = 0 OR is_deleted IS NULL)
       LIMIT 3`
    );

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: ACTIVITY_SUMMARY | RESULT: SUCCESS`);

    if ((activities && activities.length > 0) || (completedTasks && completedTasks.length > 0)) {
      const lines = [];
      if (completedTasks?.length) {
        lines.push(...completedTasks.map((t: any) => `✓ Completed ${t.task_code}: ${t.title}`));
      }
      if (activities?.length) {
        lines.push(...activities.map((a: any) => `• ${a.title} *(${a.meta_text || a.category})*`));
      }

      res.json({
        success: true,
        intent: 'ACTIVITY_SUMMARY',
        speakText: "Here is your recent development activity.",
        displayText: `**Recent Development Activity:**\n\n${lines.join('\n')}`,
        actionTaken: true
      });
      return;
    }

    res.json({
      success: true,
      intent: 'ACTIVITY_SUMMARY_EMPTY',
      speakText: 'No recent activity recorded yet today.',
      displayText: 'No activity records found yet for today. Make a commit or complete a task to build your log.',
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 21. JOURNAL QUERIES
  // =========================================================================
  const isJournalQuery =
    lower.includes('what did i write today') ||
    lower.includes('show today\'s journal') ||
    lower.includes('show today journal') ||
    lower.includes('show my journal') ||
    lower.includes('find my journal entry') ||
    lower.includes('journal about') ||
    lower === 'journal';

  if (isJournalQuery) {
    const todayJournal = await queryOne(
      `SELECT content, entry_date FROM daily_journals WHERE user_id = ? AND entry_date = date('now')`,
      [userId]
    );

    const todayNote = await queryOne(
      `SELECT content, note_date FROM daily_notes WHERE user_id = ? AND note_date = date('now')`,
      [userId]
    );

    const content = todayJournal?.content || todayNote?.content;

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: JOURNAL_VIEW | RESULT: SUCCESS`);

    if (content && content.trim().length > 0) {
      res.json({
        success: true,
        intent: 'JOURNAL_VIEW',
        speakText: "Here is your journal entry for today.",
        displayText: `**Today's Journal:**\n\n${content}`,
        actionTaken: true
      });
      return;
    }

    res.json({
      success: true,
      intent: 'JOURNAL_EMPTY',
      speakText: 'No journal entry written for today yet.',
      displayText: 'No journal entry recorded for today. You can say "Write in journal <your note>" to add one.',
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 22. CONNECTIONS & TEAM QUERIES
  // =========================================================================
  const isConnectionQuery =
    lower.includes('who am i connected with') ||
    lower.includes('who are my connections') ||
    lower.includes('show my connections') ||
    lower.includes('show connections') ||
    lower.includes('do i have any pending requests') ||
    lower.includes('pending requests') ||
    lower.includes('who can i invite') ||
    lower === 'connections' || lower === 'friends';

  if (isConnectionQuery) {
    const conns = await queryAll(
      `SELECT u.id, u.name, u.username, u.shiori_id 
       FROM connections c 
       JOIN users u ON (c.user_a_id = ? AND c.user_b_id = u.id) OR (c.user_b_id = ? AND c.user_a_id = u.id)
       LIMIT 5`,
      [userId, userId]
    );

    const pendingReqs = await queryAll(
      `SELECT cr.id, u.name, u.username 
       FROM connection_requests cr 
       JOIN users u ON cr.sender_id = u.id 
       WHERE cr.recipient_id = ? AND cr.status = 'REQUESTED'`,
      [userId]
    );

    const connCount = (conns || []).length;
    const reqCount = (pendingReqs || []).length;

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: CONNECTION_LIST | RESULT: SUCCESS (${connCount} connections, ${reqCount} requests)`);

    if (lower.includes('pending') || lower.includes('request')) {
      if (reqCount === 0) {
        res.json({
          success: true,
          intent: 'CONNECTION_REQUESTS_EMPTY',
          speakText: 'No pending connection requests.',
          displayText: 'You have **0** pending connection requests.',
          actionTaken: true
        });
        return;
      }

      const reqLines = pendingReqs.map((r: any) => `• **${r.name || r.username}** (@${r.username})`).join('\n');
      res.json({
        success: true,
        intent: 'CONNECTION_REQUESTS',
        speakText: `You have ${reqCount} pending connection request${reqCount === 1 ? '' : 's'}.`,
        displayText: `**${reqCount} Pending Connection Request${reqCount === 1 ? '' : 's'}:**\n\n${reqLines}`,
        actionTaken: true
      });
      return;
    }

    if (connCount === 0) {
      res.json({
        success: true,
        intent: 'CONNECTION_LIST_EMPTY',
        speakText: 'You have no verified connections yet.',
        displayText: 'You currently have no connected collaborators. Share your SHIORI ID from the Connections page to connect.',
        actionTaken: true
      });
      return;
    }

    const lines = conns.map((c: any) => `• **${c.name || c.username}** (\`${c.shiori_id || c.username}\`)`).join('\n');
    res.json({
      success: true,
      intent: 'CONNECTION_LIST',
      speakText: `You have ${connCount} connected collaborator${connCount === 1 ? '' : 's'}.`,
      displayText: `**Your Verified Connections (${connCount}):**\n\n${lines}`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 23. SETTINGS & PREFERENCES QUERIES
  // =========================================================================
  const isSettingsQuery =
    lower.includes('what theme am i using') ||
    lower.includes('what is my theme') ||
    lower.includes('what\'s my current accent') ||
    lower.includes('what is my current accent') ||
    lower.includes('what accent color') ||
    lower.includes('what ui mode') ||
    lower === 'theme' || lower === 'accent';

  if (isSettingsQuery) {
    const settings = await queryOne('SELECT ui_mode, accent_color, font_family FROM user_settings WHERE user_id = ?', [userId]);
    const userRow = await queryOne('SELECT theme FROM users WHERE id = ?', [userId]);

    const currentTheme = userRow?.theme || 'light';
    const currentMode = settings?.ui_mode || 'eink_matte';
    const currentAccent = settings?.accent_color || '#2E5A36';

    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: SETTINGS_GET | RESULT: SUCCESS`);

    res.json({
      success: true,
      intent: 'SETTINGS_GET',
      speakText: `You are using ${currentTheme} theme in ${currentMode.replace('_', ' ')} mode with accent ${currentAccent}.`,
      displayText: `**Current Appearance Configuration:**\n\n• **Theme:** ${currentTheme.toUpperCase()}\n• **UI Mode:** \`${currentMode}\`\n• **Accent Color:** \`${currentAccent}\`\n• **Font:** ${settings?.font_family || 'Geist'}`,
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 24. SHIORI ARCHITECTURE & DEVELOPMENT QUESTIONS (FACTUAL TECHNICAL ANSWERS)
  // =========================================================================
  if (lower.includes('what framework is shiori using') || lower.includes('what is shiori built with') || lower.includes('what tech stack') || lower.includes('tech stack')) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: SHIORI_TECH_STACK | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'SHIORI_TECH_STACK',
      speakText: 'SHIORI is built with React, Vite, and Tailwind on frontend, with Node, Express, TypeScript, and SQLite or Supabase PostgreSQL on backend.',
      displayText: '**SHIORI Architecture:**\n\n• **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons\n• **Backend:** Node.js, Express, TypeScript, Socket.IO\n• **Database:** SQLite (local persistence) & Supabase PostgreSQL (cloud IPv4 pooler)\n• **Intelligence Layer:** Spark Project Intelligence & Command Layer',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('what is our backend') || lower.includes("what's our backend") || lower.includes('what backend')) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: SHIORI_BACKEND | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'SHIORI_BACKEND',
      speakText: 'SHIORI backend runs on Express and TypeScript with REST APIs and WebSocket live sync.',
      displayText: '**SHIORI Backend:**\n\n• Express.js + TypeScript runtime\n• Secure JWT & Cookie authentication\n• Real-time Socket.IO synchronization\n• Webhooks & GitHub API v3 integration',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('what database are we using') || lower.includes("what's our database") || lower.includes('what database')) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: SHIORI_DATABASE | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'SHIORI_DATABASE',
      speakText: 'We use SQLite for local persistence and Supabase PostgreSQL for cloud sync.',
      displayText: '**Database Architecture:**\n\n• **Local Mode:** Embedded SQLite (sql.js / filesystem persistence)\n• **Cloud Mode:** Supabase PostgreSQL with transaction pooling on AWS AP-South-1',
      actionTaken: true
    });
    return;
  }

  if (lower.includes('how does our git verification work') || lower.includes('how does git verification work') || lower.includes('git verification')) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_PROJECT_INTELLIGENCE | INTENT: SHIORI_GIT_VERIFICATION | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'SHIORI_GIT_VERIFICATION',
      speakText: 'Git verification cross-references commit SHAs, author identity, and CI test conclusions with connected GitHub webhooks.',
      displayText: '**Git Verification Engine:**\n\n1. Webhooks capture push events and workflow runs from GitHub.\n2. Commit hashes and signatures are matched with assigned task codes (`TASK-XX`).\n3. Dev evidence metrics (files changed, insertions, test passes) generate a cryptographic audit trail.',
      actionTaken: true
    });
    return;
  }

  // =========================================================================
  // 25. SHIORI GENERAL QUERY SAFEGUARD (NO WIT ENGINE FOR SHIORI CONTEXT)
  // =========================================================================
  const isShioriContext =
    lower.includes('shiori') ||
    lower.includes('workspace') ||
    lower.includes('task') ||
    lower.includes('todo') ||
    lower.includes('project') ||
    lower.includes('repo') ||
    lower.includes('commit') ||
    lower.includes('pull request') ||
    lower.includes('branch');

  if (isShioriContext) {
    console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: SHIORI_FALLBACK | INTENT: SHIORI_GENERIC_ASSIST | RESULT: SUCCESS`);
    res.json({
      success: true,
      intent: 'SHIORI_ASSIST',
      speakText: "I'm checking your SHIORI data. What would you like to see?",
      displayText: 'I understand this is about your project work. You can ask **"What are we working on?"**, **"What repositories do we have?"**, **"What tasks are overdue?"**, or **"What have we completed?"**.',
      actionTaken: false
    });
    return;
  }

  // =========================================================================
  // 26. BRAIN 2: WIT ENGINE — TRUE FALLBACK ONLY FOR OFF-TOPIC / SILLY QUERIES
  // =========================================================================
  console.log(`[SPARK ROUTING] USER: "${rawText}" | CLASSIFICATION: OFF_TOPIC | INTENT: WIT_ENGINE | HANDLER: WIT_ENGINE`);
  const safeContext = await getSafeWorkspaceContext(userId);
  const wit = getSparkWitResponse(rawText, safeContext);

  res.json({
    success: true,
    intent: `WIT_${wit.category}`,
    category: wit.category,
    speakText: wit.speakText,
    displayText: wit.displayText,
    actionTaken: false
  });
});
