import { queryAll, queryOne } from '../db/index.js';
import { syncRepoLiveFromGitHub } from '../routes/github.routes.js';

let pollingIntervalTimer: NodeJS.Timeout | null = null;
let isPolling = false;

/**
 * Polls active GitHub repositories across projects and verifies tasks against recent commits.
 * Runs non-destructively and idempotently.
 */
export async function pollActiveRepositories(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    // 1. Find all active projects linked to a GitHub repository
    const activeProjects = await queryAll(`
      SELECT p.id, p.name, p.github_repo_name, p.created_by, p.default_branch,
             ga.auth_status, ga.access_token
      FROM projects p
      LEFT JOIN github_accounts ga ON p.created_by = ga.user_id
      WHERE p.github_repo_name IS NOT NULL 
        AND p.github_repo_name != ''
        AND (ga.auth_status IS NULL OR ga.auth_status = 'CONNECTED')
      ORDER BY p.updated_at DESC
      LIMIT 20
    `);

    if (!activeProjects || activeProjects.length === 0) {
      return;
    }

    const processedRepos = new Set<string>();

    for (const project of activeProjects) {
      const repoName = (project.github_repo_name || project.name).trim();
      const repoKey = `${project.created_by}:${repoName.toLowerCase()}`;
      if (processedRepos.has(repoKey)) continue;
      processedRepos.add(repoKey);

      try {
        await syncRepoLiveFromGitHub(project.created_by, repoName);
      } catch (err: any) {
        // Safe skip on individual repo error without crashing polling loop
      }
    }
  } catch (err: any) {
    console.warn('[GITHUB POLLER ERROR]', err?.message || err);
  } finally {
    isPolling = false;
  }
}

/**
 * Starts automated background commit polling interval (default: every 60 seconds).
 */
export function startGithubPolling(intervalMs: number = 60000): void {
  if (pollingIntervalTimer) {
    clearInterval(pollingIntervalTimer);
  }

  // Initial immediate run after 5s startup delay
  setTimeout(() => {
    pollActiveRepositories().catch(() => {});
  }, 5000);

  // Periodic recurring background sync
  pollingIntervalTimer = setInterval(() => {
    pollActiveRepositories().catch(() => {});
  }, intervalMs);

  console.log(`[GITHUB POLLER] Background auto-sync active (interval: ${Math.round(intervalMs / 1000)}s)`);
}

/**
 * Stops background polling.
 */
export function stopGithubPolling(): void {
  if (pollingIntervalTimer) {
    clearInterval(pollingIntervalTimer);
    pollingIntervalTimer = null;
  }
}
