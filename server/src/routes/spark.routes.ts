import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const sparkRouter = Router();

// Witty, varied off-topic responses
const OFF_TOPIC_RESPONSES = [
  "Nice try. Spark works for SHIORI, not for escaping your project. 😌",
  "Focus on the project first. You can test my intelligence later. ☕",
  "That's outside my desk. Bring me something from SHIORI.",
  "I could tell a joke, but your unfinished tasks are already doing comedy. 🎭",
  "The weather can wait. That project can't. Back to SHIORI. ⏱️",
  "My calculator is on vacation. SHIORI tasks and projects only.",
  "Maybe later. Your project called first. 📚",
  "Your curiosity is impressive. Your unfinished tasks are even more impressive. ✦",
  "Spark is on project protection duty today. Let's build something."
];

// Re-sequence project tasks helper for deletions
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

// POST /api/spark/command — Natural Language Intent Router & Tool Execution
sparkRouter.post('/command', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { command, context = {}, confirmed = false, confirmationPayload } = req.body;

  if (!command || typeof command !== 'string') {
    res.status(400).json({ error: 'Command text is required' });
    return;
  }

  const rawText = command.trim();
  const lower = rawText.toLowerCase();

  // 1. Strict Security Probe Check (Never leak secrets, tokens, env, keys, passwords)
  const securityKeywords = [
    'supabase service', 'service_role', 'service key', 'api key', 'github token', 
    'access token', 'oauth secret', 'client secret', 'client_secret', 'jwt_secret', 
    'password', 'env variable', 'environment variable', 'database_url', '.env', 
    'connection string', 'private key', 'secret key', 'other user', "another user's"
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

  // Handle Confirmed Destructive Actions
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

  // 2. FOCUS TIMER INTENTS
  if (lower.includes('focus') || lower.includes('timer') || lower.includes('pomodoro')) {
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

    // Parse minutes e.g. "start 25 minute focus", "start a 45 min focus session", "start focus"
    const minMatch = lower.match(/(\d+)\s*(min|minute|minutes|m\b)/i);
    const minutes = minMatch ? parseInt(minMatch[1], 10) : 25;

    res.json({
      success: true,
      intent: 'FOCUS_START',
      speakText: `${minutes} minutes. Let's get this done.`,
      displayText: `Focus session started (${minutes} mins). Go build something.`,
      focusAction: 'start',
      focusMinutes: minutes,
      actionTaken: true
    });
    return;
  }

  // 3. TASK CREATION INTENT
  // Examples: "Create a task called Finish authentication", "Add task to fix layout", "Create a task: Refactor routes"
  if (lower.includes('create task') || lower.includes('add task') || lower.includes('new task') || lower.startsWith('create a task') || lower.startsWith('add a task')) {
    let title = rawText
      .replace(/^(spark,?\s*)?(please\s*)?(create|add|new)\s+(a\s+)?task\s+(called|to|named|for|:)?\s*/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    if (!title || title.length < 2) {
      title = 'New Task';
    }

    // Determine target project
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
      // Create a default project if user has none
      projectId = uuidv4();
      await runQuery(`
        INSERT INTO projects (id, name, description, created_by, created_at, updated_at)
        VALUES (?, 'Main Workspace', 'Default SHIORI workspace', ?, datetime('now'), datetime('now'))
      `, [projectId, userId]);
      project = { id: projectId, name: 'Main Workspace', github_repo_name: null };
    }

    // Calculate next sequence & task number
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

    // Log Activity
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

  // 4. TASK COMPLETION / MARK DONE INTENT
  if (lower.includes('complete task') || lower.includes('mark task') || lower.includes('finish task') || lower.includes('done with task')) {
    // Check if task code or title mentioned e.g. "complete task 1", "mark TASK-02 complete"
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
      // Find oldest active TODO task
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

  // 5. TASK DELETION INTENT (Requires Confirmation)
  if (lower.includes('delete task') || lower.includes('remove task')) {
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

  // 6. TASK LIST / STATUS INTENT
  if (lower.includes('tasks') || lower.includes('todo') || lower.includes('what am i working on') || lower.includes('pending') || lower.includes('what’s left') || lower.includes("what's left")) {
    const activeTasks = await queryAll(
      `SELECT t.id, t.task_code, t.title, t.priority, t.status, p.name as project_name 
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.status != 'DONE' AND (t.is_deleted = 0 OR t.is_deleted IS NULL)
       ORDER BY t.sequence_order ASC, t.created_at ASC
       LIMIT 5`
    );

    const totalCount = await queryOne(
      `SELECT COUNT(*) as count FROM tasks WHERE status != 'DONE' AND (is_deleted = 0 OR is_deleted IS NULL)`
    );

    const count = totalCount?.count || 0;

    if (count === 0) {
      res.json({
        success: true,
        intent: 'TASK_LIST_EMPTY',
        speakText: 'No pending tasks. Suspiciously peaceful.',
        displayText: 'No pending tasks on the board. Suspiciously peaceful. ✨',
        actionTaken: true,
        navigate: '/todos'
      });
      return;
    }

    const taskLines = (activeTasks || []).map((t: any) => `• **${t.task_code}**: ${t.title} [${t.priority}]`).join('\n');
    res.json({
      success: true,
      intent: 'TASK_LIST',
      speakText: `${count} pending task${count === 1 ? '' : 's'}.`,
      displayText: `You have **${count}** active task${count === 1 ? '' : 's'}:\n\n${taskLines}`,
      actionTaken: true,
      navigate: '/todos'
    });
    return;
  }

  // 7. GITHUB REPOSITORY CREATION INTENT (Requires Confirmation)
  if (lower.includes('create repository') || lower.includes('create repo') || lower.includes('create a repository') || lower.includes('create a repo') || lower.includes('create a github repository')) {
    let repoName = rawText
      .replace(/^(spark,?\s*)?(please\s*)?(create|make)\s+(a\s+)?(private|public)?\s*(github\s+)?(repository|repo)\s+(called|named|for|:)?\s*/i, '')
      .replace(/^[\s:"']+|[\s:"']+$/g, '');

    const isPrivate = !lower.includes('public');

    if (!repoName || repoName.length < 2) {
      repoName = `shiori-project-${Date.now().toString(36)}`;
    }

    // Clean valid git repo name
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

  // 8. GIT / COMMITS / REPO STATUS INTENT
  if (lower.includes('git') || lower.includes('commit') || lower.includes('branch') || lower.includes('repository status')) {
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

  // 9. PROJECT LIST / CREATION INTENTS
  if (lower.includes('project') || lower.includes('repositories') || lower.includes('workspace')) {
    if (lower.includes('create') || lower.includes('add') || lower.includes('new')) {
      let pName = rawText
        .replace(/^(spark,?\s*)?(please\s*)?(create|add|new)\s+(a\s+)?project\s+(called|named|for|:)?\s*/i, '')
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

    // List projects
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

  // 10. ACTIVITY / PROGRESS INTENT
  if (lower.includes('activity') || lower.includes('progress') || lower.includes('what did i do') || lower.includes('journal') || lower.includes('history')) {
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

  // 11. SHIORI NAVIGATION INTENTS
  if (lower.includes('open') || lower.includes('go to') || lower.includes('navigate to') || lower.includes('show')) {
    if (lower.includes('home') || lower.includes('dashboard')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Home.', displayText: 'Opening SHIORI Home.', navigate: '/home', actionTaken: true });
      return;
    }
    if (lower.includes('todo') || lower.includes('tasks')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Todos.', displayText: 'Opening My Todos.', navigate: '/todos', actionTaken: true });
      return;
    }
    if (lower.includes('repositories') || lower.includes('projects') || lower.includes('repos')) {
      res.json({ success: true, intent: 'NAVIGATE', speakText: 'Opening Repositories.', displayText: 'Opening Repositories.', navigate: '/repositories', actionTaken: true });
      return;
    }
    if (lower.includes('connection') || lower.includes('friends') || lower.includes('id')) {
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

  // 12. OFF-TOPIC / GENERAL KNOWLEDGE QUERIES (Safe & Playful SHIORI Refusal)
  const isGeneralKnowledge = 
    lower.includes('who is') || lower.includes('what is the capital') || lower.includes('weather') || 
    lower.includes('joke') || lower.includes('poem') || lower.includes('write a python') || 
    lower.includes('solve') || lower.includes('physics') || lower.includes('math') || 
    lower.includes('president') || lower.includes('country') || lower.includes('recipe') ||
    lower.includes('who made you') || lower.includes('chatgpt') || lower.includes('meaning of life');

  if (isGeneralKnowledge) {
    const randomResponse = OFF_TOPIC_RESPONSES[Math.floor(Math.random() * OFF_TOPIC_RESPONSES.length)];
    res.json({
      success: true,
      intent: 'OFF_TOPIC',
      speakText: randomResponse.replace(/[^\w\s.,!'-]/g, ''),
      displayText: randomResponse,
      actionTaken: false
    });
    return;
  }

  // 13. UNKNOWN / AMBIGUOUS INTENT
  res.json({
    success: true,
    intent: 'UNKNOWN',
    speakText: "I'm not quite sure what you want me to do in SHIORI.",
    displayText: "I'm not quite sure what you want me to do in SHIORI. Try asking me to create a task, start a focus session, check Git status, or open a project.",
    actionTaken: false
  });
});
