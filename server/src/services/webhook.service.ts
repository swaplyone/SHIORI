import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { recalculateTaskEvidence } from './evidence.service.js';
import { emitToWorkspace, emitToTask, emitToUser, broadcastEvent } from './socket.service.js';
import { config } from '../config.js';

export function verifyWebhookSignature(payload: string, signatureHeader?: string): boolean {
  if (!signatureHeader || !config.githubWebhookSecret) return true;
  try {
    const hmac = crypto.createHmac('sha256', config.githubWebhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

// Extract keywords from task title for intelligent, simple relevance matching
function getTaskKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !['the', 'and', 'for', 'with', 'from'].includes(word));
}

export async function processPushEvent(payload: any) {
  const repoName = payload.repository?.name || payload.repository?.full_name || 'unknown-repo';
  const ref = payload.ref || '';
  const branchName = ref.replace('refs/heads/', '');
  const commits = payload.commits || [];
  const sender = payload.sender?.login || payload.pusher?.name || 'Developer';
  const eventId = payload.head_commit?.id || payload.after || (commits[0]?.id ? String(commits[0].id) : null);

  console.log(`[Webhook] Push event received: ${repoName} (branch: ${branchName}), ${commits.length} commits.`);

  // 1. Abuse Prevention & Deduplication
  if (commits.length === 0) {
    console.log('[Webhook] Empty push ignored.');
    return { status: 'ignored_empty' };
  }

  const primaryCommit = commits[commits.length - 1] || commits[0];
  const primarySha = (primaryCommit.id || primaryCommit.hash || uuidv4().substring(0, 7)).substring(0, 7);

  if (eventId) {
    const existingEvent = await queryOne('SELECT id FROM github_events WHERE event_id = ? OR (commit_sha = ? AND repository = ?)', [eventId, primarySha, repoName]);
    if (existingEvent) {
      console.log(`[Webhook] Duplicate event ${eventId} / ${primarySha} ignored to prevent point abuse.`);
      return { status: 'duplicate_ignored' };
    }
  }

  // Find user associated with this push
  let matchedUser = await queryOne('SELECT * FROM users WHERE github_username = ? OR username = ?', [sender, sender]);
  if (!matchedUser) {
    matchedUser = await queryOne('SELECT * FROM users WHERE email = ?', ['lijith@swaplyone.com']) || await queryOne('SELECT * FROM users LIMIT 1');
  }

  const userId = matchedUser?.id || 'user-lijith-001';

  // 2. Award +10 SHIORI Points for meaningful Git push
  const filesChanged = (primaryCommit.added?.length || 0) + (primaryCommit.modified?.length || 0) + (primaryCommit.removed?.length || 0) || 1;
  const commitMessage = primaryCommit.message || 'commit';

  await runQuery(`
    INSERT INTO github_events (id, user_id, repository, event_id, commit_sha, branch, commit_message, files_changed, points_awarded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, datetime('now'))
  `, [uuidv4(), userId, repoName, eventId || uuidv4(), primarySha, branchName, commitMessage, filesChanged]);

  await runQuery(`UPDATE users SET points = points + 10 WHERE id = ?`, [userId]);
  const userAfterPush = await queryOne('SELECT points FROM users WHERE id = ?', [userId]);

  emitToUser(userId, 'points:updated', {
    points: userAfterPush?.points || 130,
    added: 10,
    reason: `Git push: ${repoName} (${branchName})`
  });

  // 3. Relevance Analysis for Automatic To-Do Completion
  const pendingTasks = await queryAll(`
    SELECT * FROM tasks 
    WHERE status != 'DONE' AND user_status != 'COMPLETED'
  `);

  let autoCompletedTasks: any[] = [];

  for (const task of pendingTasks) {
    let confidence = 0;
    let matchReason = '';

    // Check A: Explicit task code in commit message (e.g. TASK-039 or #39) -> HIGH CONFIDENCE (0.95)
    const taskCodeRegex = new RegExp(`(${task.task_code}|#${task.task_number})`, 'i');
    if (taskCodeRegex.test(commitMessage)) {
      confidence = 0.95;
      matchReason = `Commit explicitly references ${task.task_code}`;
    }

    // Check B: Repository and specific branch match with implementation verbs -> HIGH CONFIDENCE (0.90)
    if (confidence === 0 && task.github_repo && repoName.toLowerCase().includes(task.github_repo.toLowerCase())) {
      const isFeatureBranch = task.github_branch && task.github_branch.toLowerCase() === branchName.toLowerCase() && branchName.toLowerCase() !== 'main';
      const actionVerbRegex = /\b(fix|fixed|implement|implemented|resolve|resolved|close|closed|finish|completed|add|added)\b/i;
      
      if (isFeatureBranch && actionVerbRegex.test(commitMessage)) {
        confidence = 0.90;
        matchReason = `Direct work on feature branch ${branchName} with implementation commit`;
      } else {
        // Check C: Title keyword overlap without explicit task reference -> MEDIUM CONFIDENCE (0.65)
        const keywords = getTaskKeywords(task.title);
        const msgLower = commitMessage.toLowerCase();
        const matchedKeywords = keywords.filter((kw) => msgLower.includes(kw));
        
        if (matchedKeywords.length >= 2 || (matchedKeywords.length === 1 && keywords.length === 1)) {
          confidence = 0.65;
          matchReason = `Related commits matching task keywords: [${matchedKeywords.join(', ')}]`;
        }
      }
    }

    // HIGH CONFIDENCE -> Automatically complete task
    if (confidence >= 0.85) {
      // Record commit on task
      await runQuery(`
        INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name, files_changed, pushed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [uuidv4(), task.id, repoName, branchName, primarySha, commitMessage, sender, filesChanged]);

      // Automatically complete task
      await runQuery(`
        UPDATE tasks SET 
          status = 'DONE',
          user_status = 'COMPLETED',
          auto_completed = 1,
          auto_completed_reason = ?,
          dev_confidence_score = ?,
          github_last_commit_hash = ?,
          github_last_commit_msg = ?,
          github_last_commit_author = ?,
          github_last_commit_time = 'Just now',
          completed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `, [matchReason, confidence, primarySha, commitMessage, sender, task.id]);

      // Log task activity
      await runQuery(`
        INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
        VALUES (?, ?, 'AUTO_COMPLETED', ?, ?, datetime('now'))
      `, [uuidv4(), task.id, `Task automatically completed`, matchReason]);

      // Award +25 Bonus Points for automatically completed task!
      await runQuery(`UPDATE users SET points = points + 25 WHERE id = ?`, [userId]);
      const userAfterBonus = await queryOne('SELECT points FROM users WHERE id = ?', [userId]);

      emitToUser(userId, 'points:updated', {
        points: userAfterBonus?.points || 155,
        added: 25,
        reason: `Auto-completed ${task.task_code}: ${task.title}`
      });

      emitToTask(task.id, 'task:auto_completed', {
        taskId: task.id,
        taskCode: task.task_code,
        title: task.title,
        reason: matchReason,
        commitHash: primarySha,
        commitMessage,
        author: sender
      });

      autoCompletedTasks.push({ ...task, matchReason, commitHash: primarySha });
    } else if (confidence >= 0.50) {
      // MEDIUM CONFIDENCE -> Log evidence & activity, but DO NOT automatically complete
      await runQuery(`
        INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name, files_changed, pushed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [uuidv4(), task.id, repoName, branchName, primarySha, commitMessage, sender, filesChanged]);

      await runQuery(`
        UPDATE tasks SET 
          dev_confidence_score = ?,
          dev_evidence_commits_count = dev_evidence_commits_count + 1,
          github_last_commit_hash = ?,
          github_last_commit_msg = ?,
          github_last_commit_author = ?,
          github_last_commit_time = 'Just now',
          updated_at = datetime('now')
        WHERE id = ?
      `, [confidence, primarySha, commitMessage, sender, task.id]);

      await recalculateTaskEvidence(task.id);
      emitToWorkspace(task.workspace_id, 'task:updated', { taskId: task.id });
    }
  }

  // Global activity audit
  await runQuery(`
    INSERT INTO global_activities (id, user_id, category, icon_symbol, title, meta_text, created_at)
    VALUES (?, ?, 'COMMIT', '⎇', ?, ?, datetime('now'))
  `, [uuidv4(), userId, `Push to ${repoName}: ${primarySha}`, `${commitMessage} (${branchName})`]);

  broadcastEvent('activity:new', {
    type: 'COMMIT',
    repoName,
    branchName,
    commitsCount: commits.length,
    autoCompleted: autoCompletedTasks
  });

  return {
    pointsAwarded: 10 + (autoCompletedTasks.length * 25),
    autoCompletedTasks
  };
}

export async function processPullRequestEvent(payload: any) {
  const pr = payload.pull_request;
  if (!pr) return;

  const repoName = payload.repository?.name || 'unknown-repo';
  const prNumber = pr.number;
  const prTitle = pr.title;
  const prUrl = pr.html_url || '';
  const prState = pr.merged ? 'MERGED' : (pr.state || 'OPEN').toUpperCase();
  const branchName = pr.head?.ref || '';

  console.log(`[Webhook] Pull Request #${prNumber} "${prTitle}" state: ${prState} on ${repoName}`);

  const matchingTasks = await queryAll(`
    SELECT * FROM tasks 
    WHERE (github_repo = ? AND github_branch = ?) OR github_branch = ? OR title LIKE ?
  `, [repoName, branchName, branchName, `%${prTitle}%`]);

  for (const task of matchingTasks) {
    await runQuery(`
      UPDATE tasks SET
        github_pr_number = ?,
        github_pr_title = ?,
        github_pr_url = ?,
        github_pr_state = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [prNumber, prTitle, prUrl, prState, task.id]);

    await runQuery(`
      INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
      VALUES (?, ?, 'PR_UPDATED', ?, ?, datetime('now'))
    `, [uuidv4(), task.id, `PR #${prNumber} updated: ${prState}`, prTitle]);

    await recalculateTaskEvidence(task.id);
    emitToTask(task.id, 'task:updated', { taskId: task.id, prNumber, prState });
  }
}

export async function processWorkflowRunEvent(payload: any) {
  const workflowRun = payload.workflow_run;
  if (!workflowRun) return;

  const repoName = payload.repository?.name || 'unknown-repo';
  const branchName = workflowRun.head_branch || '';
  const commitHash = (workflowRun.head_sha || '').substring(0, 7);
  const status = workflowRun.status;
  const conclusion = workflowRun.conclusion; // 'success', 'failure'
  const workflowName = workflowRun.name || 'CI';

  console.log(`[Webhook] Workflow run: ${workflowName}, conclusion: ${conclusion}, branch: ${branchName}`);

  const matchingTasks = await queryAll(`
    SELECT * FROM tasks WHERE github_branch = ? OR github_last_commit_hash = ?
  `, [branchName, commitHash]);

  const ciStatus = conclusion === 'success' ? 'PASSED' : conclusion === 'failure' ? 'FAILED' : 'RUNNING';

  for (const task of matchingTasks) {
    const wasFailing = task.github_ci_status === 'FAILED';
    const isRecovered = wasFailing && ciStatus === 'PASSED';

    await runQuery(`
      UPDATE tasks SET
        github_ci_status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [ciStatus, task.id]);

    await runQuery(`
      INSERT INTO github_workflow_runs (
        id, task_id, repo_name, branch_name, commit_hash, workflow_name,
        status, conclusion, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [uuidv4(), task.id, repoName, branchName, commitHash, workflowName, status, conclusion, workflowRun.created_at || new Date().toISOString()]);

    await runQuery(`
      INSERT INTO task_activity (id, task_id, action_type, summary, details, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [
      uuidv4(),
      task.id,
      ciStatus === 'PASSED' ? (isRecovered ? 'CI_RECOVERED' : 'CI_PASSED') : 'CI_FAILED',
      isRecovered ? `✓ CI Build Recovered on ${commitHash}` : `CI check ${ciStatus.toLowerCase()}`,
      `Workflow: ${workflowName}`
    ]);

    await recalculateTaskEvidence(task.id);

    emitToTask(task.id, 'ci:updated', {
      taskId: task.id,
      status: ciStatus,
      isRecovered,
      branchName,
      commitHash,
      repoName
    });

    emitToWorkspace(task.workspace_id, 'ci:updated', {
      taskId: task.id,
      status: ciStatus,
      isRecovered,
      branchName
    });
  }
}
