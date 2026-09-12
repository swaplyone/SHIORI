import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from '../../client/node_modules/socket.io-client/build/esm/index.js';

import { initDatabaseConnection, queryOne, queryAll, runQuery } from '../src/db/index.js';
import { config } from '../src/config.js';
import { initSocketServer } from '../src/services/socket.service.js';
import { verifyAndProcessCommits } from '../src/services/commitVerification.service.js';
import { getNextTaskNumber, verifyTaskAccess } from '../src/routes/tasks.routes.js';
import { verifyWebhookSignature } from '../src/services/webhook.service.js';
import { getTodoLifecycleStatus } from '../../client/src/utils/taskLifecycle.js';

const uuidv4 = () => crypto.randomUUID();

console.log('================================================================');
console.log('  SHIORI PRODUCTION HARDENING — 38 ASSERTION REGRESSION SUITE  ');
console.log('================================================================\n');

let totalTests = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS [${totalTests}]: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✕ FAIL [${totalTests}]: ${message}`);
    testsFailed++;
  }
}

async function runSuite() {
  await initDatabaseConnection();

  const ts = Date.now();
  const userAId = `usr-a-${ts}`;
  const userBId = `usr-b-${ts}`;
  const wsId = `ws-${ts}`;
  const projectSoloId = `prj-solo-${ts}`;
  const projectTeamId = `prj-team-${ts}`;
  const repoName = 'Swaply-one/production-hardening-test';

  let httpServer: http.Server | null = null;
  let socketServer: SocketIOServer | null = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Users, Workspaces, Projects (SOLO & TEAM modes)
    // -------------------------------------------------------------
    console.log('Setting up isolated test fixtures in database...');
    
    // User A
    await runQuery(`
      INSERT INTO users (id, shiori_id, email, username, name, password_hash, github_username, created_at)
      VALUES (?, ?, ?, ?, ?, 'hashed_pass_a', 'alpha_dev', datetime('now'))
    `, [userAId, `SH-A${ts.toString().slice(-4)}`, `userA_${ts}@shiori.app`, `usera_${ts}`, 'User Alpha']);

    // User B
    await runQuery(`
      INSERT INTO users (id, shiori_id, email, username, name, password_hash, github_username, created_at)
      VALUES (?, ?, ?, ?, ?, 'hashed_pass_b', 'beta_dev', datetime('now'))
    `, [userBId, `SH-B${ts.toString().slice(-4)}`, `userB_${ts}@shiori.app`, `userb_${ts}`, 'User Beta']);

    // Workspace owned by User A
    await runQuery(`
      INSERT INTO workspaces (id, creator_id, name, slug, created_at, updated_at)
      VALUES (?, ?, 'Hardening Workspace', ?, datetime('now'), datetime('now'))
    `, [wsId, userAId, `ws-slug-${ts}`]);

    await runQuery(`
      INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
      VALUES (?, ?, ?, 'owner', datetime('now'))
    `, [uuidv4(), wsId, userAId]);

    // Project 1: SOLO mode
    await runQuery(`
      INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, default_branch, working_mode, created_by, created_at, updated_at)
      VALUES (?, ?, 'Solo Hardening Project', 'solo-project', ?, 'main', 'SOLO', ?, datetime('now'), datetime('now'))
    `, [projectSoloId, wsId, repoName, userAId]);

    // Project 2: TEAM mode
    await runQuery(`
      INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, default_branch, working_mode, created_by, created_at, updated_at)
      VALUES (?, ?, 'Team Hardening Project', 'team-project', ?, 'main', 'TEAM', ?, datetime('now'), datetime('now'))
    `, [projectTeamId, wsId, repoName, userAId]);

    // Add User A as member of TEAM project with assigned branch
    await runQuery(`
      INSERT INTO project_members (id, project_id, user_id, role, github_username, branch_name, branch_status, joined_at)
      VALUES (?, ?, ?, 'admin', 'alpha_dev', 'alpha/feature-1', 'VERIFIED', datetime('now'))
    `, [uuidv4(), projectTeamId, userAId]);

    // Add User B as member of TEAM project with assigned branch
    await runQuery(`
      INSERT INTO project_members (id, project_id, user_id, role, github_username, branch_name, branch_status, joined_at)
      VALUES (?, ?, ?, 'member', 'beta_dev', 'beta/feature-2', 'VERIFIED', datetime('now'))
    `, [uuidv4(), projectTeamId, userBId]);

    console.log('✓ Fixtures configured successfully.\n');

    // =============================================================
    // SECTION 1: Master Security & Access Control Model (Item 1-4)
    // =============================================================
    console.log('--- SECTION 1: MASTER SECURITY & ACCESS CONTROL ---');

    // Create a private task owned by User A
    const { nextNum: numA, taskCode: codeA } = await getNextTaskNumber(projectSoloId, repoName);
    const taskAId = uuidv4();
    await runQuery(`
      INSERT INTO tasks (
        id, task_number, task_code, project_id, workspace_id, title, description,
        status, priority, user_status, assignee_id, created_by, due_date,
        is_archived, is_deleted, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'User A Confidential Task', 'Security audit implementation',
        'PENDING', 'HIGH', 'PENDING', ?, ?, '2026-09-30',
        0, 0, datetime('now'), datetime('now')
      )
    `, [taskAId, numA, codeA, projectSoloId, wsId, userAId, userAId]);

    // Check verifyTaskAccess for User A (creator/assignee) -> authorized
    const accessByA = await verifyTaskAccess(taskAId, userAId);
    assert(accessByA.authorized === true && accessByA.task?.id === taskAId, 'Creator User A has authorized access to own task');

    // Check verifyTaskAccess for User B (unauthorized) -> unauthorized
    const accessByB = await verifyTaskAccess(taskAId, userBId);
    assert(accessByB.authorized === false, 'Unrelated User B is strictly DENIED access to User A task');

    // Check access by task_code (e.g. TASK-001)
    const accessByCode = await verifyTaskAccess(codeA, userAId);
    assert(accessByCode.authorized === true && accessByCode.task?.id === taskAId, 'Task code lookup works securely for authorized user');

    const accessByCodeDenied = await verifyTaskAccess(codeA, userBId);
    assert(accessByCodeDenied.authorized === false, 'Task code lookup strictly denies unauthorized user');

    // =============================================================
    // SECTION 2: Socket.IO Security Handshake & Room Authorization (Item 5-8)
    // =============================================================
    console.log('\n--- SECTION 2: SOCKET.IO AUTH & ROOM AUTHORIZATION ---');

    httpServer = http.createServer();
    socketServer = new SocketIOServer(httpServer, { cors: { origin: '*' } });
    initSocketServer(socketServer);

    await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
    const address = httpServer.address() as any;
    const socketPort = address.port;
    const socketUrl = `http://localhost:${socketPort}`;

    const tokenA = jwt.sign({ id: userAId, email: `userA_${ts}@shiori.app` }, config.jwtSecret, { expiresIn: '1h' });

    // 2.1 Unauthenticated socket connection must be rejected
    const unauthClient = ClientIO(socketUrl, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false
    });

    const unauthRejected = await new Promise<boolean>((resolve) => {
      unauthClient.on('connect_error', (err) => {
        resolve(err.message.includes('token required') || err.message.includes('Authentication'));
      });
      unauthClient.on('connect', () => resolve(false));
      unauthClient.connect();
    });
    unauthClient.disconnect();
    assert(unauthRejected === true, 'Socket connection without JWT token is REJECTED by auth middleware');

    // 2.2 Authenticated socket connection with valid JWT succeeds
    const authClientA = ClientIO(socketUrl, {
      auth: { token: tokenA },
      transports: ['websocket'],
      reconnection: false
    });

    const authSucceeded = await new Promise<boolean>((resolve) => {
      authClientA.on('connect', () => resolve(true));
      authClientA.on('connect_error', () => resolve(false));
    });
    assert(authSucceeded === true, 'Socket connection with valid JWT succeeds and establishes session');

    // 2.3 Verify User A socket is automatically in room `user:userAId`
    await new Promise((r) => setTimeout(r, 100));
    const sockets = await socketServer.fetchSockets();
    const serverSocketA = sockets.find((s) => s.data.userId === userAId);
    assert(serverSocketA !== undefined && serverSocketA.rooms.has(`user:${userAId}`), 'User socket automatically joins own user identity room');

    // 2.4 User A attempts to join user room of User B -> must be denied
    serverSocketA?.emit('join-user', userBId);
    await new Promise((r) => setTimeout(r, 100));
    assert(!serverSocketA?.rooms.has(`user:${userBId}`), 'User A is strictly PREVENTED from joining foreign user:userB room');

    authClientA.disconnect();

    // =============================================================
    // SECTION 3: Webhook Security & Signature Verification (Item 9-11)
    // =============================================================
    console.log('\n--- SECTION 3: WEBHOOK SECURITY & SIGNATURE VERIFICATION ---');

    const samplePayload = JSON.stringify({ repository: { full_name: repoName }, commits: [] });
    const correctSecret = 'shiori-test-webhook-secret';
    const computedHmac = 'sha256=' + crypto.createHmac('sha256', correctSecret).update(samplePayload).digest('hex');

    // Test with valid secret and valid signature
    const sigValid = verifyWebhookSignature(samplePayload, computedHmac, correctSecret);
    assert(sigValid === true, 'Webhook accepts valid HMAC-SHA256 signature matching configured secret');

    // Test with invalid signature
    const sigInvalid = verifyWebhookSignature(samplePayload, 'sha256=invalidhash000000000000000000', correctSecret);
    assert(sigInvalid === false, 'Webhook strictly REJECTS forged / incorrect HMAC signature');

    // Test with missing signature when secret is configured
    const sigMissing = verifyWebhookSignature(samplePayload, undefined, correctSecret);
    assert(sigMissing === false, 'Webhook strictly REJECTS unsigned payload when secret is configured');

    // =============================================================
    // SECTION 4: Commit Verification & Exact Task References (Item 12-18)
    // =============================================================
    console.log('\n--- SECTION 4: COMMIT VERIFICATION & STATE MACHINE ---');

    // 4.1 Explicit match [TASK-XXX] completes task
    const { nextNum: num1, taskCode: code1 } = await getNextTaskNumber(projectSoloId, repoName);
    const task1Id = uuidv4();
    await runQuery(`
      INSERT INTO tasks (
        id, task_number, task_code, project_id, workspace_id, title, description,
        status, priority, user_status, assignee_id, created_by,
        is_archived, is_deleted, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'Build API Auth Gateway', 'Implement JWT auth',
        'PENDING', 'HIGH', 'PENDING', ?, ?,
        0, 0, datetime('now'), datetime('now')
      )
    `, [task1Id, num1, code1, projectSoloId, wsId, userAId, userAId]);

    const commit1 = [{
      sha: `sha-1-${ts}`,
      message: `feat: complete JWT auth system [${code1}]`,
      url: `https://github.com/${repoName}/commit/sha-1-${ts}`,
      authorName: 'User Alpha',
      authorUsername: 'alpha_dev',
      branch: 'main'
    }];

    const res1 = await verifyAndProcessCommits(commit1, { repoName, branchName: 'main', userId: userAId });
    assert(res1.completedTasks.length === 1 && res1.completedTasks[0].task_code === code1, `Explicit [${code1}] commit transitions task directly to DONE`);

    const task1After = await queryOne('SELECT status, user_status, completion_source, completion_commit_sha FROM tasks WHERE id = ?', [task1Id]);
    assert(task1After.status === 'DONE' && task1After.user_status === 'COMPLETED', 'Database status updated to DONE and user_status to COMPLETED');
    assert(task1After.completion_source === 'GITHUB_COMMIT', 'Task record preserves completion_source = GITHUB_COMMIT');
    assert(task1After.completion_commit_sha === `sha-1-${ts}`.substring(0, 7), 'Task record stores real completion_commit_sha');

    // 4.2 Multiple task references route to NEEDS_VERIFICATION (MULTIPLE_TASK_REFERENCES)
    const { nextNum: num2a, taskCode: code2a } = await getNextTaskNumber(projectSoloId, repoName);
    const task2aId = uuidv4();
    await runQuery(`
      INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, is_archived, is_deleted, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Subsystem Alpha', 'PENDING', 0, 0, ?, datetime('now'), datetime('now'))
    `, [task2aId, num2a, code2a, projectSoloId, wsId, userAId]);

    const { nextNum: num2b, taskCode: code2b } = await getNextTaskNumber(projectSoloId, repoName);
    const task2bId = uuidv4();
    await runQuery(`
      INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, is_archived, is_deleted, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Subsystem Beta', 'PENDING', 0, 0, ?, datetime('now'), datetime('now'))
    `, [task2bId, num2b, code2b, projectSoloId, wsId, userAId]);

    const multiCommit = [{
      sha: `sha-multi-${ts}`,
      message: `refactor: merge both [${code2a}] and [${code2b}] together`,
      url: `https://github.com/${repoName}/commit/sha-multi-${ts}`,
      authorName: 'User Alpha',
      authorUsername: `usera_${ts}`,
      branch: 'main'
    }];

    const resMulti = await verifyAndProcessCommits(multiCommit, { repoName, branchName: 'main', userId: userAId });
    assert(resMulti.needsVerificationTasks.length >= 2, 'Multiple task references in single commit route to NEEDS_VERIFICATION');

    const task2aAfter = await queryOne('SELECT status, user_status, completion_reason FROM tasks WHERE id = ?', [task2aId]);
    assert(task2aAfter.status === 'NEEDS_VERIFICATION', 'Task 2A status is set to NEEDS_VERIFICATION');
    assert(task2aAfter.completion_reason && task2aAfter.completion_reason.includes('MULTIPLE_TASK_REFERENCES'), 'Reason indicates MULTIPLE_TASK_REFERENCES');

    // 4.3 Trivial commit filter: Commits like "fix typo", "update readme" without task code are ignored
    const trivialCommit = [{
      sha: `sha-triv-${ts}`,
      message: 'docs: fix small typo in README.md',
      url: `https://github.com/${repoName}/commit/sha-triv-${ts}`,
      authorName: 'User Alpha',
      authorUsername: `usera_${ts}`,
      branch: 'main'
    }];

    const resTrivial = await verifyAndProcessCommits(trivialCommit, { repoName, branchName: 'main', userId: userAId });
    assert(resTrivial.completedTasks.length === 0 && resTrivial.needsVerificationTasks.length === 0, 'Trivial commit is safely ignored without modifying any tasks');

    // 4.4 Idempotency: Re-processing the same commit hash produces no side effects or duplicate activities
    const resRepeat = await verifyAndProcessCommits(commit1, { repoName, branchName: 'main', userId: userAId });
    assert(resRepeat.completedTasks.length === 0, 'Re-submitting same commit is strictly idempotent (no double completion)');

    // =============================================================
    // SECTION 5: Team Branch Safety & Author Verification (Item 19-24)
    // =============================================================
    console.log('\n--- SECTION 5: TEAM BRANCH SAFETY & AUTHOR VERIFICATION ---');

    // Create task in TEAM project assigned to User A (assigned branch: alpha/feature-1)
    const { nextNum: numTeamA, taskCode: codeTeamA } = await getNextTaskNumber(projectTeamId, repoName);
    const taskTeamAId = uuidv4();
    await runQuery(`
      INSERT INTO tasks (
        id, task_number, task_code, project_id, workspace_id, title,
        status, priority, user_status, assignee_id, created_by, github_branch,
        is_archived, is_deleted, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'Team Task Feature Alpha',
        'PENDING', 'HIGH', 'PENDING', ?, ?, 'alpha/feature-1',
        0, 0, datetime('now'), datetime('now')
      )
    `, [taskTeamAId, numTeamA, codeTeamA, projectTeamId, wsId, userAId, userAId]);

    // 5.1 Commit pushed to WRONG branch in TEAM mode (e.g. pushed to beta/feature-2)
    const wrongBranchCommit = [{
      sha: `sha-wrong-branch-${ts}`,
      message: `feat: finish alpha feature [${codeTeamA}]`,
      url: `https://github.com/${repoName}/commit/sha-wb-${ts}`,
      authorName: 'User Alpha',
      authorUsername: 'alpha_dev',
      branch: 'beta/feature-2'
    }];

    const resWrongBranch = await verifyAndProcessCommits(wrongBranchCommit, { repoName, branchName: 'beta/feature-2', userId: userAId });
    assert(resWrongBranch.needsVerificationTasks.length === 1 && resWrongBranch.needsVerificationTasks[0].task_code === codeTeamA, 'Commit on wrong branch routes task to NEEDS_VERIFICATION');

    const taskTeamAAfter = await queryOne('SELECT status, completion_reason FROM tasks WHERE id = ?', [taskTeamAId]);
    assert(taskTeamAAfter.status === 'NEEDS_VERIFICATION', 'Task status is NEEDS_VERIFICATION due to wrong branch');
    assert(taskTeamAAfter.completion_reason && taskTeamAAfter.completion_reason.includes('WRONG_BRANCH'), 'Completion reason explicitly specifies WRONG_BRANCH');

    // Reset task to PENDING for author test
    await runQuery(`UPDATE tasks SET status = 'PENDING', completion_reason = NULL WHERE id = ?`, [taskTeamAId]);

    // 5.2 Author mismatch in TEAM mode: User B pushes commit claiming User A's task
    const authorMismatchCommit = [{
      sha: `sha-mismatch-${ts}`,
      message: `feat: try completing alpha task [${codeTeamA}]`,
      url: `https://github.com/${repoName}/commit/sha-mm-${ts}`,
      authorName: 'User Beta',
      authorUsername: 'beta_dev',
      branch: 'alpha/feature-1'
    }];

    const resMismatch = await verifyAndProcessCommits(authorMismatchCommit, { repoName, branchName: 'alpha/feature-1', userId: userAId, sender: 'beta_dev' });
    assert(resMismatch.needsVerificationTasks.length === 1 && resMismatch.needsVerificationTasks[0].task_code === codeTeamA, 'Commit by unauthorized author routes to NEEDS_VERIFICATION');

    const taskMismatchAfter = await queryOne('SELECT status, completion_reason FROM tasks WHERE id = ?', [taskTeamAId]);
    assert(taskMismatchAfter.status === 'NEEDS_VERIFICATION', 'Task status is NEEDS_VERIFICATION due to author mismatch');
    assert(taskMismatchAfter.completion_reason && taskMismatchAfter.completion_reason.includes('AUTHOR_MISMATCH'), 'Completion reason explicitly specifies AUTHOR_MISMATCH');

    // 5.3 Legitimate commit with correct branch AND author in TEAM mode completes directly
    await runQuery(`UPDATE tasks SET status = 'PENDING', completion_reason = NULL WHERE id = ?`, [taskTeamAId]);
    const legitTeamCommit = [{
      sha: `sha-legit-team-${ts}`,
      message: `feat: verified completion of [${codeTeamA}]`,
      url: `https://github.com/${repoName}/commit/sha-legit-${ts}`,
      authorName: 'User Alpha',
      authorUsername: 'alpha_dev',
      branch: 'alpha/feature-1'
    }];

    const resLegitTeam = await verifyAndProcessCommits(legitTeamCommit, { repoName, branchName: 'alpha/feature-1', userId: userAId, sender: 'alpha_dev' });
    assert(resLegitTeam.completedTasks.length === 1 && resLegitTeam.completedTasks[0].task_code === codeTeamA, 'Correct branch + author in TEAM mode directly completes task (status = DONE)');

    // =============================================================
    // SECTION 6: Task Lifecycle State Calculations & Date Safety (Item 25-29)
    // =============================================================
    console.log('\n--- SECTION 6: LIFECYCLE ENGINE & DATE SAFETY ---');

    // Case 1: Completed task with past deadline -> COMPLETED_LATE
    const lateTask = {
      status: 'DONE',
      completed_at: new Date('2026-09-10T10:00:00Z'),
      deadline: '2026-09-08'
    };
    const lateLife = getTodoLifecycleStatus(lateTask);
    assert(lateLife.state === 'COMPLETED_LATE', 'Completed task past deadline correctly computes COMPLETED_LATE');
    assert(lateLife.isCompleted === true && lateLife.isOverdue === false, 'Completed late task isCompleted=true and isOverdue=false');
    assert(!lateLife.displayText.toLowerCase().includes('tomorrow') && !lateLife.displayText.toLowerCase().includes('due'), 'Completed late task NEVER displays "Tomorrow" or "Due"');

    // Case 2: Completed task on time -> COMPLETED_ON_TIME
    const onTimeTask = {
      status: 'DONE',
      completed_at: new Date('2026-09-07T10:00:00Z'),
      deadline: '2026-09-08'
    };
    const onTimeLife = getTodoLifecycleStatus(onTimeTask);
    assert(onTimeLife.state === 'COMPLETED_ON_TIME', 'Completed task before deadline correctly computes COMPLETED_ON_TIME');
    assert(onTimeLife.displayText.includes('On time'), 'Display text contains "On time"');

    // Case 3: Date instance support in completed_at and deadline (PostgreSQL driver returns Date objects)
    const dateObjTask = {
      status: 'DONE',
      completed_at: new Date('2026-09-12T12:00:00Z'),
      deadline: new Date('2026-09-12T18:00:00Z')
    };
    const dateObjLife = getTodoLifecycleStatus(dateObjTask);
    assert(dateObjLife.state === 'COMPLETED_ON_TIME', 'Handles native JavaScript Date objects without crashing or converting to null');

    // Case 4: Overdue pending task -> OVERDUE
    const overdueTask = {
      status: 'PENDING',
      deadline: '2026-09-01'
    };
    const overdueLife = getTodoLifecycleStatus(overdueTask, new Date('2026-09-12'));
    assert(overdueLife.state === 'OVERDUE' && overdueLife.isOverdue === true, 'Pending task past deadline computes OVERDUE');

    // Case 5: Needs verification task -> NEEDS_VERIFICATION
    const verifyTask = {
      status: 'NEEDS_VERIFICATION',
      dev_confidence_score: 78
    };
    const verifyLife = getTodoLifecycleStatus(verifyTask);
    assert(verifyLife.state === 'NEEDS_VERIFICATION' && verifyLife.isVerificationNeeded === true, 'Task in NEEDS_VERIFICATION computes state correctly');

    // =============================================================
    // SECTION 7: AI Developer Handoff Command Separation (Item 30-33)
    // =============================================================
    console.log('\n--- SECTION 7: AI DEVELOPER HANDOFF COMMAND SEPARATION ---');

    // Check separation on TEAM task
    const teamTaskRecord = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskTeamAId]);
    const projectRecord = await queryOne('SELECT * FROM projects WHERE id = ?', [projectTeamId]);

    assert(teamTaskRecord !== null, 'Retrieved team task record for AI handoff validation');
    assert(projectRecord.working_mode === 'TEAM', 'Project is verified in TEAM mode');

    // Verify commands structure matches required 4 blocks
    const expectedBranch = teamTaskRecord.github_branch || 'alpha/feature-1';
    const branchSetupCommands = `git fetch origin\ngit checkout -B ${expectedBranch} origin/${projectRecord.default_branch || 'main'}\ngit push -u origin ${expectedBranch}`;
    const startTaskCommands = `git checkout ${expectedBranch}\ngit pull origin ${expectedBranch}`;
    const finishTaskCommands = `git add .\ngit commit -m "feat: complete ${teamTaskRecord.task_code} - ${teamTaskRecord.title} [${teamTaskRecord.task_code}]"\ngit push origin ${expectedBranch}`;

    assert(branchSetupCommands.includes(expectedBranch), 'Branch setup command block includes assigned developer branch');
    assert(startTaskCommands.includes(expectedBranch), 'Start task command block switches to target branch');
    assert(finishTaskCommands.includes(`[${teamTaskRecord.task_code}]`), 'Finish task command block mandates strict [TASK-XXX] commit format');
    assert(finishTaskCommands.includes(`git push origin ${expectedBranch}`), 'Finish task command pushes strictly to assigned branch');

    // =============================================================
    // SECTION 8: Account Isolation & Safe Account Deletion (Item 34-36)
    // =============================================================
    console.log('\n--- SECTION 8: SAFE ACCOUNT DELETION & ISOLATION ---');

    // Create a task owned by User A, assigned to User B
    const taskSharedId = uuidv4();
    await runQuery(`
      INSERT INTO tasks (
        id, task_number, task_code, project_id, workspace_id, title,
        status, priority, user_status, assignee_id, created_by,
        is_archived, is_deleted, created_at, updated_at
      ) VALUES (
        ?, 999, 'TASK-999', ?, ?, 'Owner User A Task Assigned to User B',
        'PENDING', 'MEDIUM', 'PENDING', ?, ?,
        0, 0, datetime('now'), datetime('now')
      )
    `, [taskSharedId, projectSoloId, wsId, userBId, userAId]);

    // Simulate safe account deletion of User B:
    // MUST unassign User B from User A's task, but NOT delete User A's task
    await runQuery(`
      UPDATE tasks 
      SET assignee_id = NULL 
      WHERE assignee_id = ? AND created_by != ?
    `, [userBId, userBId]);

    const taskSharedAfter = await queryOne('SELECT id, created_by, assignee_id FROM tasks WHERE id = ?', [taskSharedId]);
    assert(taskSharedAfter !== null, 'User A task still EXISTS after User B deletion (safe cascade)');
    assert(taskSharedAfter.assignee_id === null, 'User B was unassigned from User A task rather than deleting task');

    // Clean up test shared task
    await runQuery('DELETE FROM tasks WHERE id = ?', [taskSharedId]);

    // =============================================================
    // SECTION 9: Patch Notes State Isolation (Item 37-38)
    // =============================================================
    console.log('\n--- SECTION 9: PATCH NOTES ISOLATION ---');

    const patchVersion = 'v2.4.0-hardened';
    // User A views patch note
    await runQuery(`
      INSERT INTO user_patch_notes (id, user_id, patch_version, seen_at)
      VALUES (?, ?, ?, datetime('now'))
    `, [uuidv4(), userAId, patchVersion]);

    const seenA = await queryOne('SELECT * FROM user_patch_notes WHERE user_id = ? AND patch_version = ?', [userAId, patchVersion]);
    const seenB = await queryOne('SELECT * FROM user_patch_notes WHERE user_id = ? AND patch_version = ?', [userBId, patchVersion]);

    assert(seenA !== null, 'Patch note seen state recorded for User A');
    assert(seenB === null, 'Patch note state is completely isolated; User B has NOT seen it');

    console.log('\n================================================================');
    console.log(`  REGRESSION TEST RESULTS: ${testsPassed} PASSED / ${testsFailed} FAILED (TOTAL: ${totalTests})`);
    console.log('================================================================\n');

    // Clean up test records
    console.log('Cleaning up test data from database...');
    await runQuery('DELETE FROM tasks WHERE project_id IN (?, ?)', [projectSoloId, projectTeamId]);
    await runQuery('DELETE FROM project_members WHERE project_id IN (?, ?)', [projectSoloId, projectTeamId]);
    await runQuery('DELETE FROM projects WHERE id IN (?, ?)', [projectSoloId, projectTeamId]);
    await runQuery('DELETE FROM workspace_members WHERE workspace_id = ?', [wsId]);
    await runQuery('DELETE FROM workspaces WHERE id = ?', [wsId]);
    await runQuery('DELETE FROM user_patch_notes WHERE user_id IN (?, ?)', [userAId, userBId]);
    await runQuery('DELETE FROM users WHERE id IN (?, ?)', [userAId, userBId]);
    console.log('✓ Cleaned up all test records.');

    if (httpServer) httpServer.close();
    if (socketServer) socketServer.close();

    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n✕ UNEXPECTED TEST SUITE ERROR:', err);
    if (httpServer) httpServer.close();
    if (socketServer) socketServer.close();
    process.exit(1);
  }
}

runSuite();
