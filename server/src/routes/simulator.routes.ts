import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { processPushEvent, processWorkflowRunEvent, processPullRequestEvent } from '../services/webhook.service.js';
import { runQuery, getDb } from '../db/index.js';
import { seedDatabase } from '../db/seed.js';

export const simulatorRouter = Router();

// Simulate a Git Commit Push
simulatorRouter.post('/push-commit', async (req: Request, res: Response): Promise<void> => {
  const {
    repoName = 'swaply-one-compiler',
    branchName = 'feature/error-page',
    message = 'fix: parser AST token bounds validation',
    authorName = 'Lijith',
    filesChanged = 4
  } = req.body;

  const commitHash = uuidv4().substring(0, 7);

  const result = await processPushEvent({
    repository: { name: repoName },
    ref: `refs/heads/${branchName}`,
    sender: { login: authorName },
    commits: [
      {
        id: commitHash,
        message,
        added: ['src/parser/ast.rs', 'src/lexer/mod.rs'],
        modified: ['tests/parser_nested_test.rs'],
        removed: []
      }
    ]
  });

  res.json({
    success: true,
    message: `Pushed commit ${commitHash} to ${branchName}`,
    commit: { hash: commitHash, message, branch: branchName, author: authorName },
    result
  });
});

// Simulate CI Failure
simulatorRouter.post('/ci-fail', async (req: Request, res: Response): Promise<void> => {
  const {
    repoName = 'swaply-one-compiler',
    branchName = 'feature/error-page',
    commitHash = 'a83f21c',
    testsFailed = 3
  } = req.body;

  const logs = `[09:41:02] Run compiler test suite on ${branchName}
[09:41:15] PASS tests/lexer_test.rs (12 tests)
[09:41:28] PASS tests/ast_test.rs (24 tests)
[09:41:40] FAIL tests/parser_nested_test.rs
           -> test_nested_macro_unclosed_bracket ... FAILED
           -> test_nested_ternary_recovery ... FAILED
           -> test_deep_recursion_panic ... FAILED
[09:41:42] Error: Process completed with exit code 1.
${testsFailed} tests failed out of 48 total assertions.`;

  await processWorkflowRunEvent({
    repository: { name: repoName },
    workflow_run: {
      name: 'CI / Rust & TypeScript Tests',
      head_branch: branchName,
      head_sha: commitHash,
      status: 'completed',
      conclusion: 'failure',
      tests_passed: 45,
      tests_failed: testsFailed,
      logs
    }
  });

  res.json({
    success: true,
    notice: '✕ BUILD FAILED triggered',
    branch: branchName,
    commit: commitHash,
    testsFailed
  });
});

// Simulate CI Pass / Build Recovery
simulatorRouter.post('/ci-pass', async (req: Request, res: Response): Promise<void> => {
  const {
    repoName = 'swaply-one-compiler',
    branchName = 'feature/error-page',
    commitHash = 'a91d203'
  } = req.body;

  const logs = `[12:07:01] Run test suite on ${branchName} (Commit: ${commitHash})
[12:07:10] PASS tests/lexer_test.rs (12 tests)
[12:07:18] PASS tests/ast_test.rs (24 tests)
[12:07:29] PASS tests/parser_nested_test.rs (12 tests)
[12:07:35] ✓ 48 passed, 0 failed.
Duration: 1m 06s. All checks passed.`;

  await processWorkflowRunEvent({
    repository: { name: repoName },
    workflow_run: {
      name: 'CI / Rust & TypeScript Tests',
      head_branch: branchName,
      head_sha: commitHash,
      status: 'completed',
      conclusion: 'success',
      tests_passed: 48,
      tests_failed: 0,
      logs
    }
  });

  res.json({
    success: true,
    notice: '✓ BUILD PASSED / RECOVERED triggered',
    branch: branchName,
    commit: commitHash,
    testsPassed: 48
  });
});

// Simulate PR Merge
simulatorRouter.post('/pr-merge', async (req: Request, res: Response): Promise<void> => {
  const {
    repoName = 'swaply-one-compiler',
    branchName = 'feature/error-page',
    prNumber = 31
  } = req.body;

  await processPullRequestEvent({
    action: 'closed',
    merged: true,
    repository: { name: repoName },
    pull_request: {
      number: prNumber,
      title: 'Improve compiler error handling',
      head: { ref: branchName },
      merged: true
    }
  });

  res.json({
    success: true,
    message: `PR #${prNumber} merged into main`,
    prNumber
  });
});

// Reset Demo Data
simulatorRouter.post('/reset-demo', async (_req: Request, res: Response): Promise<void> => {
  const db = await getDb();
  // Clear tables
  const tables = [
    'task_activity', 'task_comments', 'task_subtasks', 'task_labels',
    'github_workflow_runs', 'github_commits', 'global_activities', 'notifications',
    'tasks', 'projects', 'workspace_members', 'workspaces', 'friends', 'friend_requests',
    'user_settings', 'users'
  ];
  for (const t of tables) {
    db.run(`DELETE FROM ${t}`);
  }
  await seedDatabase();
  res.json({ success: true, message: 'Database reset to initial demo state' });
});
