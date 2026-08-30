import { queryOne, queryAll, runQuery } from '../db/index.js';

export interface DevelopmentEvidence {
  commitsCount: number;
  prsCount: number;
  filesChanged: number;
  checksPassed: number;
  checksFailed: number;
  prMerged: boolean;
  confidenceScore: number;
  hasDiscrepancy: boolean;
  statusNotice?: string;
}

export async function recalculateTaskEvidence(taskId: string): Promise<DevelopmentEvidence> {
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) {
    throw new Error('Task not found');
  }

  // Get commits for this task
  let commits = await queryAll('SELECT * FROM github_commits WHERE task_id = ?', [taskId]);
  if (commits.length === 0 && task.github_last_commit_hash) {
    commits = await queryAll('SELECT * FROM github_commits WHERE commit_hash LIKE ?', [`%${task.github_last_commit_hash}%`]);
  }
  const commitsCount = Math.max(commits.length, task.dev_evidence_commits_count || 0);
  const filesChanged = Math.max(
    commits.reduce((acc, c) => acc + (c.files_changed || 2), 0),
    task.dev_evidence_files_changed || (commitsCount > 0 ? commitsCount * 2 : 0)
  );

  // Get workflow runs (task specific or repository level)
  let runs = await queryAll('SELECT * FROM github_workflow_runs WHERE task_id = ? ORDER BY started_at DESC', [taskId]);
  if (runs.length === 0 && task.github_repo) {
    runs = await queryAll('SELECT * FROM github_workflow_runs WHERE repo_name = ? OR repo_name LIKE ? ORDER BY started_at DESC LIMIT 5', [task.github_repo, `%${task.github_repo}%`]);
  }
  
  let checksPassed = task.dev_evidence_checks_passed || 0;
  let checksFailed = task.dev_evidence_checks_failed || 0;
  let latestCIStatus = task.github_ci_status || 'UNKNOWN';

  if (runs.length > 0) {
    const latestRun = runs[0];
    if (latestRun.conclusion === 'success' || latestRun.status === 'PASSED') {
      latestCIStatus = 'PASSED';
      checksPassed = Math.max(checksPassed, 3);
    } else if (latestRun.conclusion === 'failure' || latestRun.status === 'FAILED') {
      latestCIStatus = 'FAILED';
      checksFailed = Math.max(checksFailed, 1);
    } else if (latestRun.status === 'in_progress' || latestRun.status === 'RUNNING') {
      latestCIStatus = 'RUNNING';
    }

    runs.forEach(r => {
      checksPassed += (r.tests_passed || 0);
      checksFailed += (r.tests_failed || 0);
    });
  } else if (latestCIStatus === 'PASSED' && checksPassed === 0) {
    checksPassed = 3;
  }

  const prsCount = task.github_pr_number ? 1 : (task.dev_evidence_prs_count || 0);
  const prMerged = task.github_pr_state === 'MERGED' || task.dev_evidence_pr_merged === 1;

  // Compute confidence score (0 - 100%)
  let score = task.dev_confidence_score || 0;
  if (commitsCount > 0) score = Math.max(score, 60);
  if (commitsCount >= 2) score = Math.max(score, 75);
  if (prsCount > 0) score = Math.max(score, 85);
  if (latestCIStatus === 'PASSED') score = Math.max(score, commitsCount > 0 ? 95 : 70);
  if (prMerged) score = Math.max(score, 98);

  // Penalties
  if (latestCIStatus === 'FAILED') {
    score = Math.max(10, score - 35);
  }

  // Check discrepancy: user marked complete / done, but CI failed or no evidence
  const isUserCompleted = task.user_status === 'COMPLETED' || task.status === 'DONE';
  const hasDiscrepancy = isUserCompleted && latestCIStatus === 'FAILED';

  let statusNotice: string | undefined;
  if (hasDiscrepancy) {
    statusNotice = 'Marked complete, but the latest development check is failing.';
  }

  // Update DB cache on task
  await runQuery(`
    UPDATE tasks SET
      github_ci_status = ?,
      dev_evidence_commits_count = ?,
      dev_evidence_prs_count = ?,
      dev_evidence_files_changed = ?,
      dev_evidence_checks_passed = ?,
      dev_evidence_checks_failed = ?,
      dev_evidence_pr_merged = ?,
      dev_confidence_score = ?,
      has_ci_discrepancy = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `, [
    latestCIStatus,
    commitsCount,
    prsCount,
    filesChanged,
    checksPassed,
    checksFailed,
    prMerged ? 1 : 0,
    score,
    hasDiscrepancy ? 1 : 0,
    taskId
  ]);

  return {
    commitsCount,
    prsCount,
    filesChanged,
    checksPassed,
    checksFailed,
    prMerged,
    confidenceScore: score,
    hasDiscrepancy,
    statusNotice
  };
}
