import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, runQuery } from '../db/index.js';
import { recalculateTaskEvidence } from './evidence.service.js';
import { emitToWorkspace, emitToTask, emitToUser, broadcastEvent } from './socket.service.js';

export interface IncomingCommit {
  sha: string;
  message: string;
  authorName?: string;
  authorUsername?: string;
  authorAvatar?: string;
  branch?: string;
  filesChanged?: number;
  addedFiles?: string[];
  modifiedFiles?: string[];
  removedFiles?: string[];
  url?: string;
  timestamp?: string;
}

export interface VerificationContext {
  repoName: string;
  branchName: string;
  sender?: string;
  source: 'WEBHOOK' | 'POLLING' | 'MANUAL';
  userId?: string;
}

export interface VerificationResult {
  processedCommits: number;
  completedTasks: any[];
  needsVerificationTasks: any[];
  evidenceAttachedTasks: any[];
}

/**
 * Extracts candidate task codes/numbers from a commit message.
 * Recognizes: [TASK-001], TASK-001, task-001, SHIORI:TASK-001, #001, #1
 */
export function extractTaskIdentifiers(message: string): { rawMatch: string; taskCode: string; taskNumber?: number }[] {
  if (!message) return [];
  const results: { rawMatch: string; taskCode: string; taskNumber?: number }[] = [];
  const seenCodes = new Set<string>();

  // Pattern 1: [TASK-001], TASK-001, task-001, SHIORI:TASK-001, [TASK-1]
  const codeRegex = /(?:\[|\b)(?:SHIORI:)?TASK-(\d+)(?:\]|\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(message)) !== null) {
    const rawNum = parseInt(match[1], 10);
    if (!isNaN(rawNum)) {
      const code = `TASK-${String(rawNum).padStart(3, '0')}`;
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        results.push({ rawMatch: match[0], taskCode: code, taskNumber: rawNum });
      }
    }
  }

  // Pattern 2: #001, #12, #1 (only if preceded by whitespace/start and followed by whitespace/punct)
  const hashRegex = /(?:^|\s)#(\d{1,4})\b/g;
  while ((match = hashRegex.exec(message)) !== null) {
    const rawNum = parseInt(match[1], 10);
    if (!isNaN(rawNum)) {
      const code = `TASK-${String(rawNum).padStart(3, '0')}`;
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        results.push({ rawMatch: match[0].trim(), taskCode: code, taskNumber: rawNum });
      }
    }
  }

  return results;
}

/**
 * Checks if a commit represents trivial/non-functional work (e.g. typos, readme only, formatting)
 */
export function isTrivialCommit(commit: IncomingCommit): boolean {
  let msg = (commit.message || '').trim().toLowerCase();
  // Strip leading task tags like [TASK-001], TASK-001, #001
  msg = msg.replace(/^(\[|\b)(?:shiori:)?task-\d+(\]|\b)?\s*[:\-\s]*/i, '').trim();
  msg = msg.replace(/^#\d+\s*[:\-\s]*/i, '').trim();

  const filesChanged = commit.filesChanged || (commit.addedFiles?.length || 0) + (commit.modifiedFiles?.length || 0) + (commit.removedFiles?.length || 0);

  // Exact or leading trivial patterns
  const trivialPatterns = [
    /^fix\s+typo/i,
    /^typo\b/i,
    /^formatting\b/i,
    /^lint(ing)?\b/i,
    /^whitespace\b/i,
    /^wip\b/i,
    /^temp\b/i,
    /^temporary\b/i,
    /^readme\s+only/i,
    /^update\s+readme(\.md)?$/i,
    /^minor\s+doc(s|umentation)?/i,
    /^chore:\s*(typo|format|lint|whitespace)/i
  ];

  const matchesTrivialPattern = trivialPatterns.some((pattern) => pattern.test(msg));
  if (!matchesTrivialPattern) return false;

  // If message says "typo" and <= 1 file changed, treat as trivial
  if (filesChanged <= 1) {
    return true;
  }

  const allFiles = [...(commit.addedFiles || []), ...(commit.modifiedFiles || []), ...(commit.removedFiles || [])];
  if (allFiles.length > 0) {
    const isDocOnly = allFiles.every((f) => /\.(md|txt|markdown|rst)$/i.test(f));
    if (isDocOnly) return true;
  }

  return false;
}

/**
 * Compute semantic/token similarity between commit message and a task
 */
export function computeSemanticMatch(commitMessage: string, taskTitle: string, taskDesc?: string): number {
  if (!commitMessage || !taskTitle) return 0;
  const clean = (str: string) =>
    str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with', 'from', 'this', 'that', 'implement', 'create', 'update', 'fix', 'added'].includes(w));

  const msgTokens = new Set(clean(commitMessage));
  const titleTokens = clean(taskTitle);
  const descTokens = clean(taskDesc || '');

  if (titleTokens.length === 0) return 0;

  let titleMatches = 0;
  for (const token of titleTokens) {
    if (msgTokens.has(token)) titleMatches++;
  }

  let descMatches = 0;
  for (const token of descTokens) {
    if (msgTokens.has(token)) descMatches++;
  }

  const titleRatio = titleMatches / titleTokens.length;
  const descBonus = descTokens.length > 0 ? (descMatches / descTokens.length) * 0.2 : 0;

  let score = titleRatio * 0.85 + descBonus;

  // If all meaningful title words matched
  if (titleMatches >= 2 && titleMatches === titleTokens.length) {
    score = Math.max(score, 0.88);
  } else if (titleMatches >= 2 && titleRatio >= 0.6) {
    score = Math.max(score, 0.78);
  }

  return Math.min(score, 0.95);
}

/**
 * Main unified commit verification pipeline
 */
export async function verifyAndProcessCommits(
  commits: IncomingCommit[],
  ctx: VerificationContext
): Promise<VerificationResult> {
  const result: VerificationResult = {
    processedCommits: 0,
    completedTasks: [],
    needsVerificationTasks: [],
    evidenceAttachedTasks: []
  };

  if (!commits || commits.length === 0) return result;

  const cleanRepo = (ctx.repoName || '').trim();
  const shortRepoName = cleanRepo.includes('/') ? cleanRepo.split('/')[1] : cleanRepo;

  // 1. Resolve author/user
  let matchedUser: any = null;
  if (ctx.userId) {
    matchedUser = await queryOne('SELECT id, name, username, email FROM users WHERE id = ?', [ctx.userId]);
  }
  if (!matchedUser && ctx.sender) {
    matchedUser = await queryOne('SELECT id, name, username, email FROM users WHERE github_username = ? OR username = ?', [ctx.sender, ctx.sender]);
  }
  if (!matchedUser) {
    matchedUser = await queryOne('SELECT id, name, username, email FROM users LIMIT 1');
  }

  for (const commit of commits) {
    const rawSha = (commit.sha || '').trim();
    if (!rawSha) continue;
    const shortSha = rawSha.substring(0, 7);
    const commitUrl = commit.url || `https://github.com/${cleanRepo}/commit/${rawSha}`;
    const authorName = commit.authorName || commit.authorUsername || ctx.sender || 'Developer';
    const authorUsername = commit.authorUsername || ctx.sender || null;
    const authorAvatar = commit.authorAvatar || null;
    const branchName = commit.branch || ctx.branchName || 'main';
    const filesChanged = commit.filesChanged || (commit.addedFiles?.length || 0) + (commit.modifiedFiles?.length || 0) + (commit.removedFiles?.length || 0) || 1;
    const commitMsg = commit.message || '';

    // Idempotency check: Have we processed this commit SHA before?
    const existingCommit = await queryOne(
      'SELECT id, task_id FROM github_commits WHERE commit_hash = ? OR commit_hash = ? LIMIT 1',
      [rawSha, shortSha]
    );

    if (existingCommit) {
      if (existingCommit.task_id) {
        continue;
      }
    } else {
      // Save into github_commits if not existing
      await runQuery(`
        INSERT INTO github_commits (
          id, repo_name, branch_name, commit_hash, message,
          author_name, author_username, author_avatar, files_changed, pushed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        uuidv4(), cleanRepo, branchName, rawSha, commitMsg,
        authorName, authorUsername, authorAvatar, filesChanged
      ]);
      result.processedCommits++;
    }

    // Find candidate projects for this repository
    const candidateProjects = await queryAll(`
      SELECT p.id, p.workspace_id, p.name, p.github_repo_name 
      FROM projects p
      WHERE LOWER(p.github_repo_name) = LOWER(?)
         OR LOWER(p.github_repo_name) = LOWER(?)
         OR LOWER(p.name) = LOWER(?)
         OR LOWER(p.name) = LOWER(?)
    `, [cleanRepo, shortRepoName, cleanRepo, shortRepoName]);

    const projectIds = candidateProjects.map((p: any) => p.id);
    const workspaceIds = Array.from(new Set(candidateProjects.map((p: any) => p.workspace_id)));

    // Extract explicit task IDs from commit message
    const explicitIds = extractTaskIdentifiers(commitMsg);

    let matchedTask: any = null;
    let matchType: 'EXPLICIT' | 'AI_HIGH' | 'AI_MEDIUM' | 'NONE' = 'NONE';
    let confidenceScore = 0;
    let matchReason = '';

    // --- PHASE 1: DETERMINISTIC EXPLICIT MATCHING ---
    if (explicitIds.length > 0) {
      // RULE 3 & 7: If a commit contains multiple task IDs (e.g. [TASK-005] [TASK-006]),
      // do NOT automatically complete. Route all referenced pending tasks to NEEDS_VERIFICATION for safe review.
      const hasMultipleExplicitTasks = explicitIds.length > 1;

      if (hasMultipleExplicitTasks) {
        const multiTasks: any[] = [];
        const seenTaskIds = new Set<string>();

        for (const idInfo of explicitIds) {
          const codePadded = idInfo.taskCode; // TASK-001
          const codeShort = `TASK-${String(idInfo.taskNumber || 0).padStart(2, '0')}`;
          const codeRaw = `TASK-${idInfo.taskNumber || 0}`;

          let tasksForId: any[] = [];
          if (projectIds.length > 0 || cleanRepo) {
            const params: any[] = [
              codePadded, codeShort, codeRaw, idInfo.taskNumber || -1, idInfo.rawMatch,
              cleanRepo, shortRepoName, cleanRepo, shortRepoName
            ];
            let projClause = '';
            if (projectIds.length > 0) {
              const placeholders = projectIds.map(() => '?').join(',');
              projClause = ` OR t.project_id IN (${placeholders})`;
              params.push(...projectIds);
            }

            tasksForId = await queryAll(`
              SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name,
                     p.working_mode, p.default_branch as proj_default_branch,
                     u.github_username as assignee_github_username, u.username as assignee_username,
                     pm.branch_name as member_branch_name
              FROM tasks t
              LEFT JOIN projects p ON t.project_id = p.id
              LEFT JOIN users u ON t.assignee_id = u.id
              LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = t.assignee_id
              WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
                AND (
                  t.task_code = ? 
                  OR t.task_code = ?
                  OR t.task_code = ?
                  OR t.task_number = ?
                  OR t.id = ?
                )
                AND (
                  LOWER(t.github_repo) = LOWER(?)
                  OR LOWER(t.github_repo) = LOWER(?)
                  OR LOWER(p.github_repo_name) = LOWER(?)
                  OR LOWER(p.github_repo_name) = LOWER(?)
                  ${projClause}
                )
              ORDER BY (CASE WHEN t.status != 'DONE' THEN 0 ELSE 1 END) ASC, t.created_at DESC
            `, params);
          }

          if (tasksForId.length === 0) {
            tasksForId = await queryAll(`
              SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name,
                     p.working_mode, p.default_branch as proj_default_branch,
                     u.github_username as assignee_github_username, u.username as assignee_username,
                     pm.branch_name as member_branch_name
              FROM tasks t
              LEFT JOIN projects p ON t.project_id = p.id
              LEFT JOIN users u ON t.assignee_id = u.id
              LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = t.assignee_id
              WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
                AND (
                  t.task_code = ? 
                  OR t.task_code = ?
                  OR t.task_code = ?
                  OR t.task_number = ?
                  OR t.id = ?
                )
              ORDER BY (CASE WHEN t.status != 'DONE' THEN 0 ELSE 1 END) ASC, t.created_at DESC
            `, [codePadded, codeShort, codeRaw, idInfo.taskNumber || -1, idInfo.rawMatch]);
          }

          for (const t of tasksForId) {
            if (!seenTaskIds.has(t.id)) {
              seenTaskIds.add(t.id);
              multiTasks.push(t);
            }
          }
        }

        const multiReason = `MULTIPLE_TASK_REFERENCES: Multiple task IDs referenced in commit (${explicitIds.map((e) => e.taskCode).join(', ')}). Manual verification required.`;

        // Process all matched tasks into NEEDS_VERIFICATION if not DONE
        for (const targetTask of multiTasks) {
          // Link commit to task
          await runQuery('UPDATE github_commits SET task_id = ? WHERE commit_hash = ?', [targetTask.id, rawSha]);

          if (targetTask.status !== 'DONE' && targetTask.user_status !== 'COMPLETED') {
            await runQuery(`
              UPDATE tasks SET
                status = 'NEEDS_VERIFICATION',
                dev_confidence_score = 75,
                completion_commit_sha = ?,
                completion_commit_url = ?,
                completion_reason = ?,
                completed_at = NULL,
                completion_source = NULL,
                github_last_commit_hash = ?,
                github_last_commit_msg = ?,
                github_last_commit_author = ?,
                github_last_commit_time = 'Just now',
                dev_evidence_commits_count = COALESCE(dev_evidence_commits_count, 0) + 1,
                dev_evidence_files_changed = COALESCE(dev_evidence_files_changed, 0) + ?,
                updated_at = datetime('now')
              WHERE id = ?
            `, [
              shortSha,
              commitUrl,
              multiReason,
              shortSha,
              commitMsg,
              authorName,
              filesChanged,
              targetTask.id
            ]);

            await runQuery(`
              INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
              VALUES (?, ?, ?, 'NEEDS_VERIFICATION', ?, ?, datetime('now'))
            `, [
              uuidv4(),
              targetTask.id,
              matchedUser?.id || null,
              `🟡 GitHub verification needed (75% match - multiple tasks referenced)`,
              `Commit "${commitMsg}" (${shortSha}) referenced multiple tasks.`
            ]);

            const evidence = await recalculateTaskEvidence(targetTask.id);
            const updatedTask = await queryOne('SELECT * FROM tasks WHERE id = ?', [targetTask.id]);
            const wsId = targetTask.workspace_id || targetTask.proj_workspace_id;

            if (wsId) {
              emitToWorkspace(wsId, 'task:updated', { task: updatedTask, evidence });
              emitToWorkspace(wsId, 'project:updated', { projectId: targetTask.project_id });
            }
            emitToTask(targetTask.id, 'task:updated', { task: updatedTask, evidence });

            result.needsVerificationTasks.push(updatedTask);
          }
        }

        // Continue to next commit
        continue;
      }

      for (const idInfo of explicitIds) {
        const codePadded = idInfo.taskCode; // TASK-001
        const codeShort = `TASK-${String(idInfo.taskNumber || 0).padStart(2, '0')}`; // TASK-01
        const codeRaw = `TASK-${idInfo.taskNumber || 0}`; // TASK-1

        // 1. Try matching within candidate projects or repository first
        let task: any = null;
        if (projectIds.length > 0 || cleanRepo) {
          const params: any[] = [
            codePadded, codeShort, codeRaw, idInfo.taskNumber || -1, idInfo.rawMatch,
            cleanRepo, shortRepoName, cleanRepo, shortRepoName
          ];
          let projClause = '';
          if (projectIds.length > 0) {
            const placeholders = projectIds.map(() => '?').join(',');
            projClause = ` OR t.project_id IN (${placeholders})`;
            params.push(...projectIds);
          }

          task = await queryOne(`
            SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name,
                   p.working_mode, p.default_branch as proj_default_branch,
                   u.github_username as assignee_github_username, u.username as assignee_username,
                   pm.github_username as member_github_username,
                   pm.branch_name as member_branch_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assignee_id = u.id
            LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = t.assignee_id
            WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
              AND (
                t.task_code = ? 
                OR t.task_code = ?
                OR t.task_code = ?
                OR t.task_number = ?
                OR t.id = ?
              )
              AND (
                LOWER(t.github_repo) = LOWER(?)
                OR LOWER(t.github_repo) = LOWER(?)
                OR LOWER(p.github_repo_name) = LOWER(?)
                OR LOWER(p.github_repo_name) = LOWER(?)
                ${projClause}
              )
            ORDER BY (CASE WHEN t.status != 'DONE' THEN 0 ELSE 1 END) ASC, t.created_at DESC
            LIMIT 1
          `, params);
        }

        // 2. Global fallback if not matched by project/repo
        if (!task) {
          task = await queryOne(`
            SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name,
                   p.working_mode, p.default_branch as proj_default_branch,
                   u.github_username as assignee_github_username, u.username as assignee_username,
                   pm.github_username as member_github_username,
                   pm.branch_name as member_branch_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assignee_id = u.id
            LEFT JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = t.assignee_id
            WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
              AND (
                t.task_code = ? 
                OR t.task_code = ?
                OR t.task_code = ?
                OR t.task_number = ?
                OR t.id = ?
              )
            ORDER BY (CASE WHEN t.status != 'DONE' THEN 0 ELSE 1 END) ASC, t.created_at DESC
            LIMIT 1
          `, [codePadded, codeShort, codeRaw, idInfo.taskNumber || -1, idInfo.rawMatch]);
        }

        if (task) {
          matchedTask = task;

          // Validate Author & Branch alignment
          const expectedAssigneeGithub = (task.member_github_username || task.assignee_github_username || task.assignee_username || '').toLowerCase();
          const commitAuthor = (authorUsername || authorName || '').toLowerCase();
          const isAuthorMismatch = Boolean(expectedAssigneeGithub && commitAuthor && commitAuthor !== expectedAssigneeGithub);
          
          const isTeamMode = task.working_mode === 'TEAM';
          const defaultBranch = (task.proj_default_branch || 'main').toLowerCase();
          
          let expectedBranch = (task.github_branch || task.member_branch_name || (expectedAssigneeGithub ? `feature/${expectedAssigneeGithub}` : defaultBranch)).toLowerCase();
          if (!isTeamMode && !task.github_branch) {
            expectedBranch = defaultBranch;
          }

          const commitBranch = (branchName || '').toLowerCase();
          let isBranchMismatch = false;
          if (isTeamMode) {
            // In TEAM mode, commits must be on the developer's assigned branch. Pushing to main or another developer's branch fails auto-complete.
            isBranchMismatch = Boolean(expectedBranch && commitBranch && commitBranch !== expectedBranch);
          } else {
            // In SOLO mode, default branch or configured branch is accepted
            isBranchMismatch = Boolean(expectedBranch && commitBranch && commitBranch !== expectedBranch && commitBranch !== defaultBranch && commitBranch !== 'main');
          }

          if (isAuthorMismatch) {
            matchType = 'AI_MEDIUM';
            confidenceScore = 70;
            matchReason = `AUTHOR_MISMATCH: Task assigned to @${expectedAssigneeGithub}, but commit author was @${commitAuthor}. Verification required.`;
          } else if (isBranchMismatch) {
            matchType = 'AI_MEDIUM';
            confidenceScore = 70;
            matchReason = `WRONG_BRANCH: Expected branch "${expectedBranch}", but commit was pushed to "${commitBranch}". Verification required.`;
          } else {
            matchType = 'EXPLICIT';
            confidenceScore = 100;
            matchReason = `Verified commit explicitly references ${task.task_code}: "${commitMsg}"`;
          }

          if (task.status !== 'DONE') {
            break;
          }
        }
      }
    }

    // --- PHASE 2: AI / NATURAL LANGUAGE FALLBACK (Only when no explicit task ID found) ---
    if (!matchedTask) {
      // Query pending tasks in related projects or across workspace
      let pendingTasks: any[] = [];
      if (projectIds.length > 0) {
        const placeholders = projectIds.map(() => '?').join(',');
        pendingTasks = await queryAll(`
          SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name
          FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
            AND t.status NOT IN ('DONE')
            AND (t.user_status IS NULL OR t.user_status != 'COMPLETED')
            AND t.project_id IN (${placeholders})
        `, projectIds);
      }

      // If no project-scoped tasks, check tasks matching repo name
      if (pendingTasks.length === 0) {
        pendingTasks = await queryAll(`
          SELECT t.*, p.workspace_id as proj_workspace_id, p.name as proj_name
          FROM tasks t
          LEFT JOIN projects p ON t.project_id = p.id
          WHERE (t.is_deleted = 0 OR t.is_deleted IS NULL)
            AND t.status NOT IN ('DONE')
            AND (t.user_status IS NULL OR t.user_status != 'COMPLETED')
            AND (
              LOWER(t.github_repo) = LOWER(?)
              OR LOWER(t.github_repo) = LOWER(?)
            )
        `, [cleanRepo, shortRepoName]);
      }

      let bestScore = 0;
      let bestTask: any = null;

      for (const t of pendingTasks) {
        const score = computeSemanticMatch(commitMsg, t.title, t.description);
        if (score > bestScore) {
          bestScore = score;
          bestTask = t;
        }
      }

      if (bestTask && bestScore >= 0.85) {
        matchedTask = bestTask;
        matchType = 'AI_HIGH';
        confidenceScore = Math.round(bestScore * 100);
        matchReason = `AI matched commit to ${bestTask.task_code} with ${confidenceScore}% confidence.`;
      } else if (bestTask && bestScore >= 0.70) {
        matchedTask = bestTask;
        matchType = 'AI_MEDIUM';
        confidenceScore = Math.round(bestScore * 100);
        matchReason = `GitHub activity detected. Verification needed: ${confidenceScore}% match.`;
      } else if (bestTask) {
        // Low confidence: store evidence on task without status change
        matchedTask = bestTask;
        matchType = 'NONE';
        confidenceScore = Math.round(bestScore * 100);
      }
    }

    // --- PHASE 3: EXECUTE VERIFICATION DECISION ---
    if (matchedTask) {
      // 1. Link commit record to task
      await runQuery('UPDATE github_commits SET task_id = ? WHERE commit_hash = ?', [matchedTask.id, rawSha]);

      const isTrivial = isTrivialCommit(commit);
      const isAlreadyDone = matchedTask.status === 'DONE' || matchedTask.user_status === 'COMPLETED';

      if (!isAlreadyDone && ((matchType === 'EXPLICIT' && !isTrivial) || matchType === 'AI_HIGH')) {
        // AUTO-COMPLETE TASK
        const completionSource = matchType === 'EXPLICIT' ? 'GITHUB_COMMIT' : 'GITHUB_AI_MATCH';
        const finalReason = matchType === 'EXPLICIT'
          ? `Verified because commit matched ${matchedTask.task_code} and contained meaningful changes.`
          : matchReason;

        await runQuery(`
          UPDATE tasks SET
            status = 'DONE',
            user_status = 'COMPLETED',
            auto_completed = 1,
            auto_completed_reason = ?,
            completed_at = COALESCE(completed_at, datetime('now')),
            completed_by = ?,
            completion_source = ?,
            completion_commit_sha = ?,
            completion_commit_url = ?,
            completion_reason = ?,
            dev_confidence_score = ?,
            github_last_commit_hash = ?,
            github_last_commit_msg = ?,
            github_last_commit_author = ?,
            github_last_commit_time = 'Just now',
            dev_evidence_commits_count = COALESCE(dev_evidence_commits_count, 0) + 1,
            dev_evidence_files_changed = COALESCE(dev_evidence_files_changed, 0) + ?,
            updated_at = datetime('now')
          WHERE id = ?
        `, [
          finalReason,
          matchedUser?.id || null,
          completionSource,
          shortSha,
          commitUrl,
          finalReason,
          confidenceScore,
          shortSha,
          commitMsg,
          authorName,
          filesChanged,
          matchedTask.id
        ]);

        // Record task activity
        await runQuery(`
          INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
          VALUES (?, ?, ?, 'AUTO_COMPLETE', ?, ?, datetime('now'))
        `, [
          uuidv4(),
          matchedTask.id,
          matchedUser?.id || null,
          `✓ Automatically completed via GitHub commit (${shortSha})`,
          finalReason
        ]);

        // Record global activity
        const wsId = matchedTask.workspace_id || matchedTask.proj_workspace_id;
        if (wsId) {
          await runQuery(`
            INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text, created_at)
            VALUES (?, ?, ?, ?, ?, 'TASK', '✓', ?, ?, datetime('now'))
          `, [
            uuidv4(),
            matchedUser?.id || 'system',
            wsId,
            matchedTask.project_id,
            matchedTask.id,
            `Task completed: ${matchedTask.task_code}`,
            `${matchedTask.title} (${shortSha})`
          ]);
        }

        const evidence = await recalculateTaskEvidence(matchedTask.id);
        const updatedTask = await queryOne('SELECT * FROM tasks WHERE id = ?', [matchedTask.id]);

        // Socket.IO emissions
        if (wsId) {
          emitToWorkspace(wsId, 'todo:completed', { task: updatedTask, evidence });
          emitToWorkspace(wsId, 'task:updated', { task: updatedTask, evidence });
          emitToWorkspace(wsId, 'project:updated', { projectId: matchedTask.project_id });
        }
        emitToTask(matchedTask.id, 'task:updated', { task: updatedTask, evidence });
        if (matchedUser?.id) {
          emitToUser(matchedUser.id, 'todo:completed', { task: updatedTask });
        }

        result.completedTasks.push(updatedTask);
      } else if (!isAlreadyDone && matchType === 'AI_MEDIUM') {
        // SET INTERMEDIATE STATE: NEEDS_VERIFICATION (Only for pending tasks)
        await runQuery(`
          UPDATE tasks SET
            status = 'NEEDS_VERIFICATION',
            dev_confidence_score = ?,
            completion_commit_sha = ?,
            completion_commit_url = ?,
            completion_reason = ?,
            completed_at = NULL,
            completion_source = NULL,
            github_last_commit_hash = ?,
            github_last_commit_msg = ?,
            github_last_commit_author = ?,
            github_last_commit_time = 'Just now',
            dev_evidence_commits_count = COALESCE(dev_evidence_commits_count, 0) + 1,
            dev_evidence_files_changed = COALESCE(dev_evidence_files_changed, 0) + ?,
            updated_at = datetime('now')
          WHERE id = ?
        `, [
          confidenceScore,
          shortSha,
          commitUrl,
          matchReason,
          shortSha,
          commitMsg,
          authorName,
          filesChanged,
          matchedTask.id
        ]);

        await runQuery(`
          INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
          VALUES (?, ?, ?, 'NEEDS_VERIFICATION', ?, ?, datetime('now'))
        `, [
          uuidv4(),
          matchedTask.id,
          matchedUser?.id || null,
          `🟡 GitHub verification needed (${confidenceScore}% match)`,
          `Commit "${commitMsg}" (${shortSha}) matched task.`
        ]);

        const evidence = await recalculateTaskEvidence(matchedTask.id);
        const updatedTask = await queryOne('SELECT * FROM tasks WHERE id = ?', [matchedTask.id]);
        const wsId = matchedTask.workspace_id || matchedTask.proj_workspace_id;

        if (wsId) {
          emitToWorkspace(wsId, 'task:updated', { task: updatedTask, evidence });
          emitToWorkspace(wsId, 'project:updated', { projectId: matchedTask.project_id });
        }
        emitToTask(matchedTask.id, 'task:updated', { task: updatedTask, evidence });

        result.needsVerificationTasks.push(updatedTask);
      } else {
        // Task is already DONE or commit is low confidence / trivial:
        // Record commit as additional development evidence/activity without modifying status or original completion evidence
        await runQuery(`
          UPDATE tasks SET
            github_last_commit_hash = ?,
            github_last_commit_msg = ?,
            github_last_commit_author = ?,
            github_last_commit_time = 'Just now',
            dev_evidence_commits_count = COALESCE(dev_evidence_commits_count, 0) + 1,
            dev_evidence_files_changed = COALESCE(dev_evidence_files_changed, 0) + ?,
            updated_at = datetime('now')
          WHERE id = ?
        `, [shortSha, commitMsg, authorName, filesChanged, matchedTask.id]);

        if (isAlreadyDone) {
          await runQuery(`
            INSERT INTO task_activity (id, task_id, user_id, action_type, summary, details, created_at)
            VALUES (?, ?, ?, 'COMMIT_ADDED', ?, ?, datetime('now'))
          `, [
            uuidv4(),
            matchedTask.id,
            matchedUser?.id || null,
            `Git commit (${shortSha}) recorded as later activity`,
            commitMsg
          ]);
        }

        const evidence = await recalculateTaskEvidence(matchedTask.id);
        const updatedTask = await queryOne('SELECT * FROM tasks WHERE id = ?', [matchedTask.id]);
        const wsId = matchedTask.workspace_id || matchedTask.proj_workspace_id;

        if (wsId) {
          emitToWorkspace(wsId, 'task:updated', { task: updatedTask, evidence });
        }
        emitToTask(matchedTask.id, 'task:updated', { task: updatedTask, evidence });

        result.evidenceAttachedTasks.push(updatedTask);
      }
    }
  }

  return result;
}
