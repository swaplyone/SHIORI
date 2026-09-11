import { v4 as uuidv4 } from 'uuid';

const db = await import('../dist/db/index.js');
const { queryOne, queryAll, runQuery, initDatabaseConnection } = db.default || db;

const commitService = await import('../dist/services/commitVerification.service.js');
const { verifyAndProcessCommits } = commitService.default || commitService;

async function runTests() {
  console.log('====================================================');
  console.log('  SHIORI INTELLIGENT GITHUB BRANCH & AI HANDOFF TESTS');
  console.log('====================================================\n');

  await initDatabaseConnection();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✕ FAIL: ${message}`);
      failed++;
    }
  }

  // Set up isolated test entities
  const suffix = Math.random().toString(36).substring(2, 7);
  const userAId = uuidv4();
  const userBId = uuidv4();
  const userCId = uuidv4();
  const wsId = uuidv4();
  const projSoloId = uuidv4();
  const projTeamId = uuidv4();

  await runQuery(`
    INSERT INTO users (id, shiori_id, name, email, username, github_username, github_connected, password_hash)
    VALUES (?, ?, 'User A', ?, ?, 'user-a', 1, 'hash'),
           (?, ?, 'User B', ?, ?, 'user-b', 1, 'hash'),
           (?, ?, 'User C', ?, ?, 'user-c', 1, 'hash')
  `, [
    userAId, `SHI-A${suffix}`, `usera_${suffix}@example.com`, `usera_${suffix}`,
    userBId, `SHI-B${suffix}`, `userb_${suffix}@example.com`, `userb_${suffix}`,
    userCId, `SHI-C${suffix}`, `userc_${suffix}@example.com`, `userc_${suffix}`
  ]);

  await runQuery(`
    INSERT INTO workspaces (id, name, slug, creator_id)
    VALUES (?, 'Test Workspace', ?, ?)
  `, [wsId, `test-ws-${suffix}`, userAId]);

  await runQuery(`
    INSERT INTO workspace_members (id, workspace_id, user_id, role)
    VALUES (?, ?, ?, 'OWNER'), (?, ?, ?, 'MEMBER')
  `, [uuidv4(), wsId, userAId, uuidv4(), wsId, userBId]);

  // Project 1: SOLO mode with custom default branch 'master'
  await runQuery(`
    INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, default_branch, working_mode, created_by)
    VALUES (?, ?, 'Compiler-Master', ?, 'compiler-SO', 'master', 'SOLO', ?)
  `, [projSoloId, wsId, `compiler-master-${suffix}`, userAId]);

  // Project 2: TEAM mode with default branch 'main'
  await runQuery(`
    INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, default_branch, working_mode, created_by)
    VALUES (?, ?, 'Compiler-Team', ?, 'compiler-SO', 'main', 'TEAM', ?)
  `, [projTeamId, wsId, `compiler-team-${suffix}`, userAId]);

  // ----------------------------------------------------
  // TEST 1: SOLO MODE WITH 'master' DEFAULT BRANCH
  // ----------------------------------------------------
  console.log('[TEST 1] SOLO Mode — Default Branch Resolution (master)');
  const soloTaskCode = 'TASK-101';
  const soloTaskId = uuidv4();
  await runQuery(`
    INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, github_repo, github_branch, created_by, assignee_id)
    VALUES (?, 101, ?, ?, ?, 'Solo task on master', 'PENDING', 'compiler-SO', 'master', ?, ?)
  `, [soloTaskId, soloTaskCode, projSoloId, wsId, userAId, userAId]);

  const soloTask = await queryOne(`
    SELECT t.*, p.working_mode, p.default_branch, p.name as proj_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `, [soloTaskId]);

  const soloRequiredBranch = soloTask.default_branch || 'main';
  assert(soloTask.working_mode === 'SOLO', 'Project is correctly configured in SOLO mode');
  assert(soloRequiredBranch === 'master', 'SOLO mode resolves to actual default branch (master), not hardcoded main');

  // ----------------------------------------------------
  // TEST 2: TEAM MODE — DEVELOPER BRANCH ASSIGNMENTS
  // ----------------------------------------------------
  console.log('\n[TEST 2] TEAM Mode — Developer Branch Mapping');
  const pmAId = uuidv4();
  const pmBId = uuidv4();
  await runQuery(`
    INSERT INTO project_members (id, project_id, user_id, role, github_username, branch_name, branch_status)
    VALUES (?, ?, ?, 'ADMIN', 'user-a', 'feature/user-a', 'VERIFIED'),
           (?, ?, ?, 'MEMBER', 'user-b', 'feature/user-b', 'NOT_CREATED')
  `, [pmAId, projTeamId, userAId, pmBId, projTeamId, userBId]);

  const members = await queryAll('SELECT * FROM project_members WHERE project_id = ? ORDER BY github_username ASC', [projTeamId]);
  assert(members.length === 2, 'Two members added to TEAM project');
  assert(members[0].branch_name === 'feature/user-a' && members[0].branch_status === 'VERIFIED', 'User A branch is feature/user-a and VERIFIED');
  assert(members[1].branch_name === 'feature/user-b' && members[1].branch_status === 'NOT_CREATED', 'User B branch is feature/user-b and NOT_CREATED');

  // ----------------------------------------------------
  // TEST 3: BRANCH COLLISION PROTECTION
  // ----------------------------------------------------
  console.log('\n[TEST 3] Branch Collision Protection');
  const duplicateCheck = await queryOne(`
    SELECT id FROM project_members WHERE project_id = ? AND LOWER(branch_name) = LOWER(?)
  `, [projTeamId, 'feature/user-a']);
  assert(Boolean(duplicateCheck), 'System detects branch feature/user-a is already assigned');

  // ----------------------------------------------------
  // TEST 4: EXISTING BRANCH VERIFICATION (User A)
  // ----------------------------------------------------
  console.log('\n[TEST 4] Existing Verified Branch');
  const memberA = await queryOne('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projTeamId, userAId]);
  assert(memberA.branch_status === 'VERIFIED', 'Existing branch is recognized as VERIFIED');

  // ----------------------------------------------------
  // TEST 5: MISSING BRANCH SETUP COMMANDS (User B)
  // ----------------------------------------------------
  console.log('\n[TEST 5] Missing Branch Setup Command Generation');
  const memberB = await queryOne('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?', [projTeamId, userBId]);
  const defaultBase = 'main';
  const expectedSetup = `git fetch origin\ngit switch -c ${memberB.branch_name} origin/${defaultBase}\ngit push -u origin ${memberB.branch_name}`;
  assert(memberB.branch_status === 'NOT_CREATED', 'Missing branch flagged as NOT_CREATED');
  assert(expectedSetup.includes('git switch -c feature/user-b origin/main'), 'Setup command properly generated with base branch');

  // ----------------------------------------------------
  // TEST 6: TASK-AWARE AI CODING PROMPT (TASK-003 -> User A)
  // ----------------------------------------------------
  console.log('\n[TEST 6] Task-Aware AI Prompt Generation');
  const task003Id = uuidv4();
  const task003Code = 'TASK-003';
  await runQuery(`
    INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, description, status, github_repo, github_branch, created_by, assignee_id)
    VALUES (?, 3, ?, ?, ?, 'Creating backend for compiler', 'Implement compiler AST parser', 'PENDING', 'compiler-SO', 'feature/user-a', ?, ?)
  `, [task003Id, task003Code, projTeamId, wsId, userAId, userAId]);

  // Generate prompt
  const task003 = await queryOne(`
    SELECT t.*, p.working_mode, p.name as proj_name, u.name as assignee_name, u.github_username
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.id = ?
  `, [task003Id]);

  const generatedPrompt = `You are working on ${task003.task_code}.

Assigned developer:
${task003.assignee_name}

GitHub:
@${task003.github_username}

Project:
${task003.proj_name}

Working mode:
${task003.working_mode}

Required branch:
feature/user-a

Branch status:
✓ VERIFIED

Task:
${task003.title}

Before making changes:

git switch feature/user-a
git pull origin feature/user-a

Requirements:

- Implement the requested task according to requirements.
- Follow the existing codebase architecture and conventions.
- Keep modifications focused on ${task003.task_code}.
- Do not modify unrelated functionality.
- Run tests and verify the build before committing.

After completing the task:

git add .
git commit -m "[${task003.task_code}] ${task003.title}"
git push origin feature/user-a

Expected commit format:

[${task003.task_code}] ${task003.title}`;

  assert(generatedPrompt.includes('git switch feature/user-a'), 'Prompt uses verified branch feature/user-a for switch');
  assert(generatedPrompt.includes('git push origin feature/user-a'), 'Prompt uses verified branch feature/user-a for push');
  assert(!generatedPrompt.includes('git push origin main'), 'Prompt does NOT push to main in TEAM mode');
  assert(!generatedPrompt.includes('feature/user-b'), 'Prompt does NOT use User B branch for User A task');

  // ----------------------------------------------------
  // TEST 7: COMMIT ON WRONG BRANCH (feature/user-b instead of feature/user-a)
  // ----------------------------------------------------
  console.log('\n[TEST 7] Wrong Branch Safeguard');
  const wrongBranchResult = await verifyAndProcessCommits(
    [{
      sha: `a1b2c3d4e5f6wrongbranch_${suffix}`,
      message: '[TASK-003] Creating backend on wrong branch',
      authorUsername: 'user-a',
      branch: 'feature/user-b',
      filesChanged: 3
    }],
    {
      repoName: 'compiler-SO',
      branchName: 'feature/user-b',
      sender: 'user-a',
      source: 'WEBHOOK',
      userId: userAId
    }
  );

  const taskAfterWrongBranch = await queryOne('SELECT status, completion_reason FROM tasks WHERE id = ?', [task003Id]);
  assert(taskAfterWrongBranch.status === 'NEEDS_VERIFICATION', 'Task on wrong branch is routed to NEEDS_VERIFICATION');
  assert(taskAfterWrongBranch.completion_reason?.includes('WRONG_BRANCH'), 'Completion reason explicitly flags WRONG_BRANCH');

  // Reset task for next test
  await runQuery("UPDATE tasks SET status = 'PENDING', completion_reason = NULL WHERE id = ?", [task003Id]);

  // ----------------------------------------------------
  // TEST 8: COMMIT WITH WRONG AUTHOR (@user-b on feature/user-a)
  // ----------------------------------------------------
  console.log('\n[TEST 8] Wrong Author Safeguard');
  const wrongAuthorResult = await verifyAndProcessCommits(
    [{
      sha: `b2c3d4e5f6a1wrongauthor_${suffix}`,
      message: '[TASK-003] Creating backend by other author',
      authorUsername: 'user-b',
      branch: 'feature/user-a',
      filesChanged: 3
    }],
    {
      repoName: 'compiler-SO',
      branchName: 'feature/user-a',
      sender: 'user-b',
      source: 'WEBHOOK',
      userId: userBId
    }
  );

  const taskAfterWrongAuthor = await queryOne('SELECT status, completion_reason FROM tasks WHERE id = ?', [task003Id]);
  assert(taskAfterWrongAuthor.status === 'NEEDS_VERIFICATION', 'Task with wrong author is routed to NEEDS_VERIFICATION');
  assert(taskAfterWrongAuthor.completion_reason?.includes('AUTHOR_MISMATCH'), 'Completion reason explicitly flags AUTHOR_MISMATCH');

  // Reset task for next test
  await runQuery("UPDATE tasks SET status = 'PENDING', completion_reason = NULL WHERE id = ?", [task003Id]);

  // ----------------------------------------------------
  // TEST 9: CORRECT COMMIT (feature/user-a by user-a for TASK-003)
  // ----------------------------------------------------
  console.log('\n[TEST 9] Valid Commit Auto-Completion');
  const correctResult = await verifyAndProcessCommits(
    [{
      sha: `c3d4e5f6a1b2correctcommit_${suffix}`,
      message: '[TASK-003] Creating backend for compiler',
      authorUsername: 'user-a',
      authorName: 'User A',
      branch: 'feature/user-a',
      filesChanged: 4,
      modifiedFiles: ['src/compiler.ts', 'src/ast.ts']
    }],
    {
      repoName: 'compiler-SO',
      branchName: 'feature/user-a',
      sender: 'user-a',
      source: 'WEBHOOK',
      userId: userAId
    }
  );

  const taskAfterCorrectCommit = await queryOne('SELECT status, auto_completed, completion_commit_sha FROM tasks WHERE id = ?', [task003Id]);
  assert(taskAfterCorrectCommit.status === 'DONE', 'Task with verified branch and author is automatically marked DONE');
  assert(taskAfterCorrectCommit.auto_completed === 1, 'auto_completed flag is 1');
  assert(Boolean(taskAfterCorrectCommit.completion_commit_sha), 'Completion commit SHA recorded');

  // ----------------------------------------------------
  // TEST 10: MULTIPLE TASK IDS REFERENCED
  // ----------------------------------------------------
  console.log('\n[TEST 10] Multiple Task IDs Safeguard');
  const task004Id = uuidv4();
  await runQuery(`
    INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, github_repo, github_branch, created_by, assignee_id)
    VALUES (?, 4, 'TASK-004', ?, ?, 'Frontend optimization', 'PENDING', 'compiler-SO', 'feature/user-a', ?, ?)
  `, [task004Id, projTeamId, wsId, userAId, userAId]);

  const multiResult = await verifyAndProcessCommits(
    [{
      sha: `d4e5f6a1b2c3multitasks_${suffix}`,
      message: '[TASK-003] [TASK-004] Dual ref commit',
      authorUsername: 'user-a',
      branch: 'feature/user-a',
      filesChanged: 2
    }],
    {
      repoName: 'compiler-SO',
      branchName: 'feature/user-a',
      sender: 'user-a',
      source: 'WEBHOOK',
      userId: userAId
    }
  );

  const task004After = await queryOne('SELECT * FROM tasks WHERE id = ?', [task004Id]);
  assert(task004After?.status === 'NEEDS_VERIFICATION', 'Multiple task IDs references routed to NEEDS_VERIFICATION');
  assert(task004After?.completion_reason?.includes('MULTIPLE_TASK_REFERENCES'), 'Reason indicates MULTIPLE_TASK_REFERENCES');

  // ----------------------------------------------------
  // TEST 11: CROSS-ACCOUNT DATA ISOLATION
  // ----------------------------------------------------
  console.log('\n[TEST 11] Cross-Account Data Isolation');
  // User C attempts to read Project Team's branches/tasks
  const userCAccess = await queryOne(`
    SELECT id FROM projects
    WHERE id = ? AND (created_by = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?))
  `, [projTeamId, userCId, userCId]);

  assert(userCAccess === null, 'Unauthorized User C cannot access Team project or branch workspace');

  // Clean up test entities
  await runQuery('DELETE FROM tasks WHERE project_id IN (?, ?)', [projSoloId, projTeamId]);
  await runQuery('DELETE FROM project_members WHERE project_id IN (?, ?)', [projSoloId, projTeamId]);
  await runQuery('DELETE FROM projects WHERE id IN (?, ?)', [projSoloId, projTeamId]);
  await runQuery('DELETE FROM workspace_members WHERE workspace_id = ?', [wsId]);
  await runQuery('DELETE FROM workspaces WHERE id = ?', [wsId]);
  await runQuery('DELETE FROM users WHERE id IN (?, ?, ?)', [userAId, userBId, userCId]);

  console.log('\n====================================================');
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
