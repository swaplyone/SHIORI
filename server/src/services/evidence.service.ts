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
  const commits = await queryAll('SELECT * FROM github_commits WHERE task_id = ?', [taskId]);
  const commitsCount = commits.length;
  const filesChanged = commits.reduce((acc, c) => acc + (c.files_changed || 1), 0);

  // Get workflow runs
  const runs = await queryAll('SELECT * FROM github_workflow_runs WHERE task_id = ? ORDER BY started_at DESC', [taskId]);
  
  let checksPassed = 0;
  let checksFailed = 0;
  let latestCIStatus = task.github_ci_status || 'UNKNOWN';

  if (runs.length > 0) {
    const latestRun = runs[0];
    if (latestRun.conclusion === 'success') {
      latestCIStatus = 'PASSED';
    } else if (latestRun.conclusion === 'failure') {
      latestCIStatus = 'FAILED';
    } else if (latestRun.status === 'in_progress') {
      latestCIStatus = 'RUNNING';
    }

    runs.forEach(r => {
      checksPassed += (r.tests_passed || 0);
      checksFailed += (r.tests_failed || 0);
    });
  }

  const prsCount = task.github_pr_number ? 1 : 0;
  const prMerged = task.github_pr_state === 'MERGED';

  // Compute confidence score (0 - 100%)
  let score = 0;
  if (commitsCount > 0) score += 20;
  if (commitsCount >= 3) score += 10;
  if (prsCount > 0) score += 20;
  if (latestCIStatus === 'PASSED') score += 30;
  if (prMerged) score += 20;

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
