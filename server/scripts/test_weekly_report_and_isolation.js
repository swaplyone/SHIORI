import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const { config } = await import('../dist/config.js');

function createToken(userId, email, username) {
  return jwt.sign({ id: userId, email, username }, config.jwtSecret, { expiresIn: '1h' });
}

function makeRequest(port, options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, hostname: '127.0.0.1', port }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: SHIORI WEEKLY REPORT & STRICT ISOLATION VALIDATION');
  console.log('================================================================');

  const { queryAll, queryOne, runQuery } = await import('../dist/db/index.js');
  const { reportsRouter } = await import('../dist/routes/reports.routes.js');
  const { extractDayString, normalizeDate, normalizeTimestamp } = await import('../dist/utils/dateRange.js');
  const { taskReportService } = await import('../dist/services/taskReport.service.js');

  // -------------------------------------------------------------
  // Test 1: PostgreSQL Date & Timestamp normalization regression
  // -------------------------------------------------------------
  console.log('\n[1] Testing timestamp normalization & safe parsing:');
  const dateObj = new Date('2026-09-07T10:00:00.000Z');
  const isoStr = '2026-09-08T14:30:00.000Z';
  const sqlTimestamp = '2026-09-09 08:15:00';
  const numTimestamp = 1788775200000;
  const nullVal = null;
  const undefinedVal = undefined;

  const t1 = normalizeTimestamp(dateObj);
  const t2 = normalizeTimestamp(isoStr);
  const t3 = normalizeTimestamp(sqlTimestamp);
  const t4 = normalizeTimestamp(numTimestamp);
  const t5 = normalizeTimestamp(nullVal);
  const t6 = normalizeTimestamp(undefinedVal);

  if (!t1 || !t2 || !t3 || !t4) {
    throw new Error('normalizeTimestamp failed to parse valid dates');
  }
  if (!t1.toISOString().includes('2026-09-07') || !t2.toISOString().includes('2026-09-08')) {
    throw new Error('normalizeTimestamp failed to correctly format dates');
  }
  if (t5 !== null || t6 !== null) {
    throw new Error('normalizeTimestamp failed for null/undefined');
  }

  const d1 = extractDayString(dateObj);
  const d2 = extractDayString(isoStr);
  const d3 = extractDayString(nullVal);
  const d4 = extractDayString(undefinedVal);

  if (d1 !== '2026-09-07' || d2 !== '2026-09-08' || d3 !== '' || d4 !== '') {
    throw new Error('extractDayString failed: ' + JSON.stringify({ d1, d2, d3, d4 }));
  }
  console.log('✓ Normalization handled Date, ISO, SQL, numbers, null, and undefined without throwing');

  // -------------------------------------------------------------
  // Test 2: Database Setup - Users, Projects, Repos, Commits, Tasks
  // -------------------------------------------------------------
  console.log('\n[2] Setting up isolated test fixture:');
  const userA_id = uuidv4();
  const userB_id = uuidv4();
  const wsA_id = uuidv4();
  const wsB_id = uuidv4();
  const projA_id = uuidv4();
  const projB_id = uuidv4();

  const aliceUsername = `alicedev_${Date.now()}`;
  const bobUsername = `bobdev_${Date.now()}`;

  // Insert Users
  await runQuery(
    `INSERT INTO users (id, email, name, username, shiori_id, password_hash)
     VALUES ($1, $2, 'Alice Dev', $3, $4, 'hash'),
            ($5, $6, 'Bob Dev', $7, $8, 'hash')`,
    [userA_id, `alice_${Date.now()}@example.com`, aliceUsername, `SHIORI-${Math.floor(Math.random()*9000+1000)}`,
     userB_id, `bob_${Date.now()}@example.com`, bobUsername, `SHIORI-${Math.floor(Math.random()*9000+1000)}`]
  );

  // Insert Workspaces & Members
  await runQuery(
    `INSERT INTO workspaces (id, name, slug, creator_id)
     VALUES ($1, 'WS A', $2, $3),
            ($4, 'WS B', $5, $6)`,
    [wsA_id, `ws-a-${Date.now()}`, userA_id, wsB_id, `ws-b-${Date.now()}`, userB_id]
  );
  await runQuery(
    `INSERT INTO workspace_members (id, workspace_id, user_id, role)
     VALUES ($1, $2, $3, 'owner'),
            ($4, $5, $6, 'owner')`,
    [uuidv4(), wsA_id, userA_id, uuidv4(), wsB_id, userB_id]
  );

  const repoA = `alice/alpha-${Date.now()}`;
  const repoB = `bob/beta-${Date.now()}`;

  // Insert Projects
  await runQuery(
    `INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, created_by, working_mode, default_branch)
     VALUES ($1, $2, 'Project Alpha', $3, $4, $5, 'SOLO', 'main'),
            ($6, $7, 'Project Beta', $8, $9, $10, 'SOLO', 'main')`,
    [projA_id, wsA_id, `proj-a-${Date.now()}`, repoA, userA_id, projB_id, wsB_id, `proj-b-${Date.now()}`, repoB, userB_id]
  );

  // Reference week: 2026-09-07 (Mon) to 2026-09-13 (Sun)
  const weekStart = '2026-09-07T00:00:00.000Z';
  const weekEnd = '2026-09-13T23:59:59.999Z';

  // Insert Tasks for Project A:
  // Task 1: Completed on Monday (2026-09-07), completed_at set to Monday, but updated_at set to Friday!
  // Task 2: Status NEEDS_VERIFICATION (not completed)
  // Task 3: Incomplete with deadline on Wednesday (overdue)
  // Task 4: Incomplete with deadline far in future
  const task1_id = uuidv4();
  const task2_id = uuidv4();
  const task3_id = uuidv4();
  const task4_id = uuidv4();

  await runQuery(
    `INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, completed_at, updated_at, deadline, created_by, github_repo)
     VALUES
       ($1, 1, 'ALPHA-1', $5, $6, 'Implement parser', 'DONE', '2026-09-07T14:00:00Z', '2026-09-11T18:00:00Z', '2026-09-09T23:59:59Z', $7, $8),
       ($2, 2, 'ALPHA-2', $5, $6, 'Review compiler AST', 'NEEDS_VERIFICATION', NULL, '2026-09-08T10:00:00Z', '2026-09-10T23:59:59Z', $7, $8),
       ($3, 3, 'ALPHA-3', $5, $6, 'Fix memory leak', 'PENDING', NULL, '2026-09-08T10:00:00Z', '2026-09-08T23:59:59Z', $7, $8),
       ($4, 4, 'ALPHA-4', $5, $6, 'Documentation', 'PENDING', NULL, '2026-09-08T10:00:00Z', '2026-10-01T23:59:59Z', $7, $8)`,
    [task1_id, task2_id, task3_id, task4_id, projA_id, wsA_id, userA_id, repoA]
  );

  // Insert Task for Project B:
  const taskB_id = uuidv4();
  await runQuery(
    `INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, completed_at, updated_at, deadline, created_by, github_repo)
     VALUES
       ($1, 1, 'BETA-1', $2, $3, 'Setup server', 'DONE', '2026-09-08T12:00:00Z', '2026-09-08T12:00:00Z', '2026-09-09T23:59:59Z', $4, $5)`,
    [taskB_id, projB_id, wsB_id, userB_id, repoB]
  );

  // Insert Commits:
  // - Commit 1 for Repo A: mentions task ALPHA-1
  // - Commit 2 for Repo A: unlinked commit
  // - Commit 3 for Repo B: mentions task BETA-1
  await runQuery(
    `INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name, pushed_at)
     VALUES 
       ($1, $2, $3, 'feature/parser', 'sha_alpha_1', 'fix(core): ALPHA-1 initial commit', 'Alice Dev', '2026-09-08 12:00:00'),
       ($4, NULL, $3, 'main', 'sha_alpha_2', 'chore: update readme', 'Alice Dev', '2026-09-09 15:00:00'),
       ($5, $6, $7, 'feature/server', 'sha_beta_1', 'feat(core): BETA-1 test commit', 'Bob Dev', '2026-09-08 14:00:00')`,
    [uuidv4(), task1_id, repoA, uuidv4(), uuidv4(), taskB_id, repoB]
  );

  console.log('✓ Test fixture created successfully');

  // -------------------------------------------------------------
  // Test 3: Account Isolation & Analytics Validation for User A
  // -------------------------------------------------------------
  console.log('\n[3] Testing Weekly Report generation for User A (Project Alpha):');
  const reportA = await taskReportService.getEngineeringWeeklyReport(userA_id, {
    startDate: weekStart,
    endDate: weekEnd
  });

  // Verify User A does NOT see Project Beta or Repo B
  const totalTasksA = reportA.taskStatus.done + reportA.taskStatus.pending + reportA.taskStatus.needsVerification;
  console.log(`- Total Tasks in Scope: ${totalTasksA}`);
  console.log(`- Tasks Completed: ${reportA.summary.tasksCompleted}`);
  console.log(`- Commits counted: ${reportA.summary.commits}`);

  if (totalTasksA !== 4) {
    throw new Error(`Expected User A to have 4 tasks, got ${totalTasksA}`);
  }
  if (reportA.summary.tasksCompleted !== 1) {
    throw new Error(`Expected User A to have 1 completed task, got ${reportA.summary.tasksCompleted}`);
  }
  if (reportA.summary.commits !== 2) {
    throw new Error(`Expected User A to have 2 commits from alice/alpha-repo, got ${reportA.summary.commits}`);
  }
  if (typeof reportA.github.activeBranches !== 'number' || reportA.github.activeBranches < 1) {
    throw new Error(`Expected activeBranches count >= 1, got ${reportA.github.activeBranches}`);
  }

  // Verify Daily Completion Chart uses completed_at ONLY
  // Task 1 was completed on Monday (2026-09-07), but updated on Friday (2026-09-11).
  const monCount = reportA.dailyCompletion.find((d) => d.day === 'Mon')?.completed || 0;
  const friCount = reportA.dailyCompletion.find((d) => d.day === 'Fri')?.completed || 0;
  console.log(`- Daily Completion Monday: ${monCount}, Friday: ${friCount}`);
  if (monCount !== 1) {
    throw new Error(`Expected Monday to have 1 completed task, got ${monCount}`);
  }
  if (friCount !== 0) {
    throw new Error(`Expected Friday to have 0 completed tasks (updated_at must NOT move completed_at), got ${friCount}`);
  }
  console.log('✓ Completed task anchored strictly to completed_at (not updated_at)');

  // Verify NEEDS_VERIFICATION is not counted as completed work
  if (reportA.taskStatus.needsVerification !== 1) {
    throw new Error(`Expected 1 needsVerification task, got ${reportA.taskStatus.needsVerification}`);
  }
  console.log('✓ NEEDS_VERIFICATION isolated into verification bucket');

  // Verify Deadline Performance
  console.log('- Deadline Performance:', reportA.deadlinePerformance);
  if (reportA.deadlinePerformance.onTime !== 1) {
    throw new Error(`Expected 1 on-time task, got ${reportA.deadlinePerformance.onTime}`);
  }
  if (reportA.deadlinePerformance.overdue < 1) {
    throw new Error(`Expected at least 1 overdue task, got ${reportA.deadlinePerformance.overdue}`);
  }
  console.log('✓ Deadline performance correctly categorized (onTime, overdue, pending)');

  // Verify Commit Verification
  console.log('- Commit Verification:', reportA.commitVerification);
  if (reportA.commitVerification.verified !== 1 || reportA.commitVerification.unmatched !== 1) {
    throw new Error(`Expected 1 verified and 1 unmatched commit, got ${JSON.stringify(reportA.commitVerification)}`);
  }
  if (reportA.commitVerification.verificationRate !== 50) {
    throw new Error(`Expected 50% verification rate, got ${reportA.commitVerification.verificationRate}%`);
  }
  console.log('✓ Commit verification rate correctly calculated (50%)');

  // -------------------------------------------------------------
  // Test 4: Account Isolation for User B
  // -------------------------------------------------------------
  console.log('\n[4] Testing Weekly Report generation for User B (Project Beta):');
  const reportB = await taskReportService.getEngineeringWeeklyReport(userB_id, {
    startDate: weekStart,
    endDate: weekEnd
  });

  const totalTasksB = reportB.taskStatus.done + reportB.taskStatus.pending + reportB.taskStatus.needsVerification;
  console.log(`- User B Total Tasks: ${totalTasksB}`);
  console.log(`- User B Commits: ${reportB.summary.commits}`);

  if (totalTasksB !== 1) {
    throw new Error(`Expected User B to have 1 task, got ${totalTasksB}`);
  }
  if (reportB.summary.commits !== 1) {
    throw new Error(`Expected User B to have 1 commit, got ${reportB.summary.commits}`);
  }
  console.log('✓ User B strictly isolated from User A data');

  // -------------------------------------------------------------
  // Test 5: HTTP Endpoint & Filtering Validation
  // -------------------------------------------------------------
  console.log('\n[5] Testing HTTP endpoint GET /api/reports/weekly:');
  const app = express();
  app.use(express.json());
  app.use('/api/reports', reportsRouter);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const tokenA = createToken(userA_id, 'alice@example.com', 'alicedev');
  const tokenB = createToken(userB_id, 'bob@example.com', 'bobdev');

  // Request as User A
  const resA = await makeRequest(port, {
    path: `/api/reports/weekly?startDate=${encodeURIComponent(weekStart)}&endDate=${encodeURIComponent(weekEnd)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });

  if (resA.status !== 200 || !resA.body.success) {
    throw new Error(`HTTP GET /api/reports/weekly failed with status ${resA.status}`);
  }
  if (resA.body.summary.tasksCompleted !== 1) {
    throw new Error(`Expected 1 completed task in HTTP response`);
  }
  console.log('✓ HTTP endpoint returned valid status 200 and accurate data');

  // Filter User A by project Alpha -> OK
  const resAFiltered = await makeRequest(port, {
    path: `/api/reports/weekly?projectId=${projA_id}&startDate=${encodeURIComponent(weekStart)}&endDate=${encodeURIComponent(weekEnd)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const filteredTotal = resAFiltered.body.taskStatus.done + resAFiltered.body.taskStatus.pending + resAFiltered.body.taskStatus.needsVerification;
  if (resAFiltered.status !== 200 || filteredTotal !== 4) {
    throw new Error('Project filter failed for authorized project');
  }

  // Filter User A by unauthorized project Beta -> Must return 0 tasks or empty report
  const resAForbidden = await makeRequest(port, {
    path: `/api/reports/weekly?projectId=${projB_id}&startDate=${encodeURIComponent(weekStart)}&endDate=${encodeURIComponent(weekEnd)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const forbiddenTotal = (resAForbidden.body?.taskStatus?.done || 0) + (resAForbidden.body?.taskStatus?.pending || 0);
  if (forbiddenTotal !== 0) {
    throw new Error('Unauthorized project filter returned unauthorized tasks!');
  }
  console.log('✓ Project filter authorization enforced');

  server.close();

  // Cleanup
  await runQuery(`DELETE FROM github_commits WHERE repo_name IN ($1, $2)`, [repoA, repoB]);
  await runQuery(`DELETE FROM tasks WHERE project_id IN ($1, $2)`, [projA_id, projB_id]);
  await runQuery(`DELETE FROM projects WHERE id IN ($1, $2)`, [projA_id, projB_id]);
  await runQuery(`DELETE FROM workspace_members WHERE workspace_id IN ($1, $2)`, [wsA_id, wsB_id]);
  await runQuery(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [wsA_id, wsB_id]);
  await runQuery(`DELETE FROM users WHERE id IN ($1, $2)`, [userA_id, userB_id]);

  console.log('\n================================================================');
  console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY (100%)');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
