import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getSparkWitResponse, SafeWorkspaceContext } from '../services/spark/sparkWitEngine.js';

export const sparkRouter = Router();

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
          // Register in user_repositories
          await runQuery(`
            INSERT INTO user_repositories (id, user_id, repo_name, full_name, is_private, default_branch, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
          `, [uuidv4(), userId, ghData.name, ghData.full_name, ghData.private ? 1 : 0, ghData.default_branch || 'main']);

          // Also create matching SHIORI project
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
  // 3. TASK CREATION INTENT ("CREATE TASK", "ADD TASK", "NEW TASK", "REMIND ME TO")
  // Priority check: "Create a task called tell me a joke" must create the task!
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

    await runQuery(`
      INSERT INTO tasks (
        id, project_id, task_code, task_number, sequence_order, title, description,
        priority, status, created_by, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MEDIUM', 'TODO', ?, 0, datetime('now'), datetime('now'))
    `, [taskId, projectId, taskCode, nextSeq, nextSeq, title, `Task created via Spark: ${title}`, userId]);

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
      displayText: `Created **${taskCode}**: "${title}" in *${project.name}*. One less thing living rent-free in your head.`,
      task: { id: taskId, taskCode, title, projectId },
      actionTaken: true,
      refreshNeeded: true
    });
    return;
  }

  // =========================================================================
  // 4. TASK DELETION INTENT (Requires Confirmation)
  // Priority check: "Delete the task called weather" must delete the task!
  // =========================================================================
  if (
    /^(please\s*)?(delete|remove)\s+(the\s+)?task\b/i.test(lower) ||
    lower.includes('delete task') || lower.includes('remove task')
  ) {
    const codeMatch = lower.match(/task-?(\d+)/i);
    let task = null;

    if (codeMatch) {
      const num = parseInt(codeMatch[1], 10);
      const code = `TASK-${String(num).padStart(2, '0')}`;
      task = await queryOne('SELECT id, task_code, title FROM tasks WHERE (task_code = ? OR task_number = ?) AND (is_deleted = 0 OR is_deleted IS NULL)', [code, num]);
    }

    if (!task && context.taskId) {
      task = await queryOne('SELECT id, task_code, title FROM tasks WHERE id = ?', [context.taskId]);
    }

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
  // 5. TASK COMPLETION INTENT
  // =========================================================================
  if (
    lower.includes('complete task') || lower.includes('mark task') || 
    lower.includes('finish task') || lower.includes('done with task') ||
    lower.startsWith('complete ') || lower.startsWith('finish ')
  ) {
    const codeMatch = lower.match(/task-?(\d+)/i);
    let task = null;

    if (codeMatch) {
      const num = parseInt(codeMatch[1], 10);
      const code = `TASK-${String(num).padStart(2, '0')}`;
      task = await queryOne(
        `SELECT id, task_code, title, project_id FROM tasks 
         WHERE (task_code = ? OR task_number = ?) AND (is_deleted = 0 OR is_deleted IS NULL)
         ORDER BY updated_at DESC LIMIT 1`,
        [code, num]
      );
    }

    if (!task && context.taskId) {
      task = await queryOne('SELECT id, task_code, title, project_id FROM tasks WHERE id = ?', [context.taskId]);
    }

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
  // 6. FOCUS TIMER INTENTS
  // =========================================================================
  if (
    lower.startsWith('start focus') || lower.startsWith('begin focus') ||
    lower.startsWith('start a focus') || lower.startsWith('pause focus') ||
    lower.startsWith('resume focus') || lower.startsWith('stop focus') ||
    lower.includes('focus timer') || lower.includes('pomodoro') ||
    /^(start|pause|resume|stop|cancel)\s+(focus|timer)/i.test(lower)
  ) {
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
  // 7. WORKSPACE_SUMMARY & PRIORITIZATION INTENTS ("WHAT SHOULD I WORK ON?", "WHAT'S OVERDUE?")
  // =========================================================================
  const isWorkspaceSummaryQuery = 
    lower.includes('what should i work on') || 
    lower.includes('what do i have to do') || 
    lower.includes("what's pending") || 
    lower.includes('what is pending') || 
    lower.includes('what is overdue') || 
    lower.includes("what's overdue") || 
    lower.includes('how am i doing') || 
    lower.includes('how is my project doing');

  if (isWorkspaceSummaryQuery) {
    const running = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE (status = 'IN_PROGRESS' OR status = 'IN PROGRESS' OR status = 'DOING')
       AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const pending = await queryOne(
      `SELECT COUNT(*) as count FROM tasks 
       WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const overdueTasks = await queryAll(
      `SELECT id, task_code, title, priority, deadline, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' 
       AND t.deadline IS NOT NULL 
       AND t.deadline != '' 
       AND t.deadline < datetime('now')
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.deadline ASC LIMIT 3`
    );

    const dueTodayTasks = await queryAll(
      `SELECT id, task_code, title, priority, deadline, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' 
       AND t.deadline IS NOT NULL 
       AND date(t.deadline) = date('now')
       AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.sequence_order ASC LIMIT 3`
    );

    // Smart Prioritized Next Task: Overdue -> Due Today -> Urgent/High -> In Progress -> Sequence Order
    const prioritizedTask = await queryOne(
      `SELECT t.id, t.task_code, t.title, t.priority, t.deadline, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY 
         CASE WHEN t.deadline IS NOT NULL AND t.deadline != '' AND t.deadline < datetime('now') THEN 1
              WHEN t.deadline IS NOT NULL AND date(t.deadline) = date('now') THEN 2
              ELSE 3 END,
         CASE WHEN t.priority = 'URGENT' THEN 1 WHEN t.priority = 'HIGH' THEN 2 WHEN t.priority = 'MEDIUM' THEN 3 ELSE 4 END,
         CASE WHEN t.status = 'IN_PROGRESS' OR t.status = 'DOING' THEN 1 ELSE 2 END,
         t.sequence_order ASC,
         t.created_at ASC
       LIMIT 1`
    );

    const runningCount = running?.count || 0;
    const pendingCount = pending?.count || 0;
    const overdueCount = (overdueTasks || []).length;
    const dueTodayCount = (dueTodayTasks || []).length;

    if (pendingCount === 0) {
      res.json({
        success: true,
        intent: 'WORKSPACE_SUMMARY_EMPTY',
        speakText: 'Clean slate. You have no pending tasks.',
        displayText: 'Clean slate! You have no pending tasks right now. Suspiciously peaceful. ✨',
        actionTaken: true
      });
      return;
    }

    let speakSummary = '';
    let displaySummary = '';

    if (overdueCount > 0) {
      speakSummary = `You have ${overdueCount} overdue task and ${dueTodayCount} due today. I'd start with ${prioritizedTask?.title || 'the overdue one'}. It's been waiting patiently. Well... increasingly less patiently.`;
      displaySummary = `You have **${overdueCount}** overdue task and **${dueTodayCount}** due today.\n\n` +
        `I'd start with **${prioritizedTask?.task_code}** ("${prioritizedTask?.title}") in *${prioritizedTask?.project_name || 'SHIORI'}*.\n\n` +
        `*It's been waiting patiently. Well... increasingly less patiently.*`;
    } else if (dueTodayCount > 0) {
      speakSummary = `Clean slate on overdue work. You have ${pendingCount} pending tasks, with ${dueTodayCount} due today.`;
      displaySummary = `Clean slate on overdue work. You have **${pendingCount}** pending tasks, with **${dueTodayCount}** due today.\n\n` +
        `Recommended focus: **${prioritizedTask?.task_code}** ("${prioritizedTask?.title}").`;
    } else {
      speakSummary = `You have ${pendingCount} active task${pendingCount === 1 ? '' : 's'}. I'd tackle ${prioritizedTask?.task_code || 'your highest priority task'} first.`;
      displaySummary = `You have **${pendingCount}** active task${pendingCount === 1 ? '' : 's'}.\n\n` +
        `Recommended focus: **${prioritizedTask?.task_code}** ("${prioritizedTask?.title}") [${prioritizedTask?.priority}].`;
    }

    res.json({
      success: true,
      intent: 'WORKSPACE_SUMMARY',
      speakText: speakSummary,
      displayText: displaySummary,
      actionTaken: true,
      taskId: prioritizedTask?.id,
      counts: {
        running: runningCount,
        pending: pendingCount,
        overdue: overdueCount,
        dueToday: dueTodayCount
      }
    });
    return;
  }

  // =========================================================================
  // 8. TASK CATEGORY SPECIFIC QUERIES ("WHAT'S RUNNING", "WHAT'S DUE TODAY", "SHOW MY TASKS")
  // =========================================================================
  if (lower.includes("what's running") || lower.includes('what is running') || lower.includes('what am i working on')) {
    const runningTasks = await queryAll(
      `SELECT task_code, title FROM tasks 
       WHERE (status = 'IN_PROGRESS' OR status = 'IN PROGRESS' OR status = 'DOING') 
       AND (is_deleted = 0 OR is_deleted IS NULL)
       ORDER BY sequence_order ASC LIMIT 5`
    );
    const count = (runningTasks || []).length;
    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_RUNNING_EMPTY',
        speakText: 'No tasks currently running.',
        displayText: 'No tasks marked In Progress right now.',
        actionTaken: true
      });
      return;
    }
    const lines = runningTasks.map((t: any) => `• **${t.task_code}**: ${t.title}`).join('\n');
    res.json({
      success: true,
      intent: 'TASK_RUNNING',
      speakText: `You have ${count} task${count === 1 ? '' : 's'} in progress.`,
      displayText: `**${count} Running Task${count === 1 ? '' : 's'}:**\n\n${lines}`,
      actionTaken: true,
      navigate: '/todos'
    });
    return;
  }

  if (lower.includes("what's due today") || lower.includes('what is due today') || lower.includes('due today')) {
    const dueTodayTasks = await queryAll(
      `SELECT task_code, title FROM tasks 
       WHERE status != 'DONE' 
       AND deadline IS NOT NULL 
       AND date(deadline) = date('now')
       AND (is_deleted = 0 OR is_deleted IS NULL)
       ORDER BY sequence_order ASC LIMIT 5`
    );
    const count = (dueTodayTasks || []).length;
    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_DUE_TODAY_EMPTY',
        speakText: 'No tasks due today.',
        displayText: 'No tasks with deadlines set for today.',
        actionTaken: true
      });
      return;
    }
    const lines = dueTodayTasks.map((t: any) => `• **${t.task_code}**: ${t.title}`).join('\n');
    res.json({
      success: true,
      intent: 'TASK_DUE_TODAY',
      speakText: `You have ${count} task${count === 1 ? '' : 's'} due today.`,
      displayText: `**${count} Task${count === 1 ? '' : 's'} Due Today:**\n\n${lines}`,
      actionTaken: true,
      navigate: '/todos'
    });
    return;
  }

  // Precise Task List intent (e.g. "show my tasks", "list tasks", "my todos")
  if (
    lower.includes('show my tasks') || lower.includes('show tasks') || 
    lower.includes('list my tasks') || lower.includes('list tasks') || 
    lower.includes('what are my tasks') || lower.includes('give me my tasks') ||
    /^(show|list|get)\s+(the\s+)?(tasks|todos|todo)/i.test(lower)
  ) {
    let projectScope = null;
    if (context.projectId) {
      projectScope = await queryOne('SELECT name FROM projects WHERE id = ?', [context.projectId]);
    }

    const whereClause = projectScope ? 'project_id = ? AND' : '';
    const params = projectScope ? [context.projectId] : [];

    const activeTasks = await queryAll(
      `SELECT t.id, t.task_code, t.title, t.priority, t.status, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE ${whereClause} t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.sequence_order ASC, t.created_at ASC
       LIMIT 5`,
      params
    );

    const totalCount = await queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE ${whereClause} status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`,
      params
    );

    const count = totalCount?.count || 0;
    const prefix = projectScope ? `In ${projectScope.name}, you have` : 'You have';

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_LIST_EMPTY',
        speakText: projectScope ? `No pending tasks in ${projectScope.name}.` : 'No pending tasks.',
        displayText: `${prefix} **0** pending tasks. Suspiciously peaceful. ✨`,
        actionTaken: true,
        navigate: '/todos'
      });
      return;
    }

    const taskLines = (activeTasks || []).map((t: any) => `• **${t.task_code}**: ${t.title} [${t.priority}]`).join('\n');
    res.json({
      success: true,
      intent: 'TASK_LIST',
      speakText: `${prefix} ${count} pending task${count === 1 ? '' : 's'}.`,
      displayText: `${prefix} **${count}** active task${count === 1 ? '' : 's'}:\n\n${taskLines}`,
      actionTaken: true,
      navigate: '/todos'
    });
    return;
  }

  // =========================================================================
  // 9. GITHUB REPOSITORY CREATION INTENT (Requires Confirmation)
  // =========================================================================
  if (
    lower.includes('create repository') || lower.includes('create repo') || 
    lower.includes('create a repository') || lower.includes('create a repo') || 
    lower.includes('create a github repository')
  ) {
    let repoName = rawText
      .replace(/^(please\s*)?(create|make)\s+(a\s+)?(private|public)?\s*(github\s+)?(repository|repo)\s+(called|named|for|:)?\s*/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    const isPrivate = !lower.includes('public');

    if (!repoName || repoName.length < 2) {
      repoName = `shiori-project-${Date.now().toString(36)}`;
    }

    repoName = repoName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    res.json({
      success: true,
      intent: 'GITHUB_REPO_CREATE_CONFIRMATION',
      speakText: `Create ${isPrivate ? 'private' : 'public'} repository ${repoName}?`,
      displayText: `Create **${isPrivate ? 'Private' : 'Public'}** repository **"${repoName}"** on GitHub?`,
      needsConfirmation: true,
      confirmationPayload: {
        action: 'CREATE_GITHUB_REPO',
        targetName: repoName,
        metadata: { repoName, isPrivate }
      },
      actionTaken: false
    });
    return;
  }

  // =========================================================================
  // 10. GIT / COMMITS STATUS QUERY ("CHECK GIT STATUS", "LATEST COMMIT")
  // =========================================================================
  if (
    lower.includes('check git') || lower.includes('git status') || 
    lower.includes('latest commit') || lower.includes('show commits') || 
    lower.includes('recent commit') || lower === 'git'
  ) {
    const recentCommits = await queryAll(
      `SELECT commit_sha, commit_message, author_name, created_at 
       FROM github_commits 
       ORDER BY created_at DESC 
       LIMIT 3`
    );

    const userRepo = await queryOne('SELECT github_username FROM users WHERE id = ?', [userId]);

    if (recentCommits && recentCommits.length > 0) {
      const top = recentCommits[0];
      const shortSha = (top.commit_sha || 'head').substring(0, 7);
      res.json({
        success: true,
        intent: 'GIT_STATUS',
        speakText: `Latest commit: ${top.commit_message || shortSha}.`,
        displayText: `Latest commit **${shortSha}**: "${top.commit_message}" by *${top.author_name}*. Git history verified.`,
        actionTaken: true,
        navigate: '/github'
      });
      return;
    }

    res.json({
      success: true,
      intent: 'GIT_STATUS',
      speakText: 'Git hub is active.',
      displayText: `Connected as **${userRepo?.github_username || 'Developer'}**. Webhooks and audit stream ready.`,
      actionTaken: true,
      navigate: '/github'
    });
    return;
  }

  // =========================================================================
  // 11. PROJECT LIST / CREATION INTENTS
  // =========================================================================
  if (
    /^(please\s*)?(create|add|new)\s+(a\s+)?project\b/i.test(lower) ||
    lower.startsWith('create project') || lower.startsWith('new project')
  ) {
    let pName = rawText
      .replace(/^(please\s*)?(create|add|new)\s+(a\s+)?project\s+(called|named|for|:)?\s*/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    if (!pName || pName.length < 2) pName = `Project ${Date.now().toString(36).toUpperCase()}`;

    const newProjId = uuidv4();
    await runQuery(`
      INSERT INTO projects (id, name, description, created_by, created_at, updated_at)
      VALUES (?, ?, 'Created via Spark companion', ?, datetime('now'), datetime('now'))
    `, [newProjId, pName, userId]);

    res.json({
      success: true,
      intent: 'PROJECT_CREATE',
      speakText: `Created project ${pName}.`,
      displayText: `Created project **"${pName}"**. You can now add tasks and link a GitHub repository.`,
      projectId: newProjId,
      actionTaken: true,
      refreshNeeded: true,
      navigate: `/projects/${newProjId}`
    });
    return;
  }

  if (lower.includes('show projects') || lower.includes('list projects') || lower.includes('my repositories')) {
    const projects = await queryAll('SELECT id, name, github_repo_name FROM projects WHERE created_by = ? ORDER BY updated_at DESC LIMIT 5', [userId]);
    const pCount = (projects || []).length;
    const lines = (projects || []).map((p: any) => `• **${p.name}** ${p.github_repo_name ? `(${p.github_repo_name})` : ''}`).join('\n');

    res.json({
      success: true,
      intent: 'PROJECT_LIST',
      speakText: `Found ${pCount} active project${pCount === 1 ? '' : 's'}.`,
      displayText: `You have **${pCount}** project${pCount === 1 ? '' : 's'}:\n\n${lines}`,
      actionTaken: true,
      navigate: '/repositories'
    });
    return;
  }

  // =========================================================================
  // 12. ACTIVITY / PROGRESS INTENT
  // =========================================================================
  if (lower.includes('activity') || lower.includes('what did i do today') || lower.includes('show activity') || lower.includes('my history')) {
    const activities = await queryAll(
      `SELECT title, meta_text, created_at FROM global_activities WHERE user_id = ? ORDER BY created_at DESC LIMIT 3`,
      [userId]
    );

    if (activities && activities.length > 0) {
      const actLines = activities.map((a: any) => `• ${a.title} *(${a.meta_text || 'Recent'})*`).join('\n');
      res.json({
        success: true,
        intent: 'ACTIVITY_VIEW',
        speakText: "Here is today's progress.",
        displayText: `**Recent Development Activity:**\n\n${actLines}`,
        actionTaken: true,
        navigate: '/activity'
      });
      return;
    }

    res.json({
      success: true,
      intent: 'ACTIVITY_VIEW',
      speakText: 'No recent activity recorded yet.',
      displayText: 'No activity recorded yet for today. Ready when you make your next move.',
      actionTaken: true,
      navigate: '/activity'
    });
    return;
  }

  // =========================================================================
  // 13. SHIORI NAVIGATION INTENTS ("OPEN SETTINGS", "GO TO ACTIVITY", ETC.)
  // =========================================================================
  if (lower.startsWith('open ') || lower.startsWith('go to ') || lower.startsWith('navigate to ') || lower.startsWith('show ')) {
    if (lower.includes('home') || lower.includes('dashboard')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Home.', displayText: 'Opening SHIORI Home.', navigate: '/home', actionTaken: true });
      return;
    }
    if (lower.includes('todo') || lower.includes('task')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Todos.', displayText: 'Opening My Todos.', navigate: '/todos', actionTaken: true });
      return;
    }
    if (lower.includes('repositories') || lower.includes('repo') || lower.includes('project')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Repositories.', displayText: 'Opening Repositories.', navigate: '/repositories', actionTaken: true });
      return;
    }
    if (lower.includes('connection') || lower.includes('friend') || lower.includes('id')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Connections.', displayText: 'Opening SHIORI Connections.', navigate: '/connections', actionTaken: true });
      return;
    }
    if (lower.includes('github') || lower.includes('pipeline') || lower.includes('webhook')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening GitHub Hub.', displayText: 'Opening GitHub Hub.', navigate: '/github', actionTaken: true });
      return;
    }
    if (lower.includes('journal') || lower.includes('audit')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Journal.', displayText: 'Opening Daily Journal.', navigate: '/journal', actionTaken: true });
      return;
    }
    if (lower.includes('setting') || lower.includes('appearance') || lower.includes('theme') || lower.includes('matte')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Settings.', displayText: 'Opening SHIORI Settings.', navigate: '/settings', actionTaken: true });
      return;
    }
  }

  // =========================================================================
  // 14. SPARK WIT ENGINE — CONTEXT-AWARE PERSONALITY RESOLUTION
  // Route all casual, silly, off-topic, procrastination, git humor, etc.
  // =========================================================================
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
