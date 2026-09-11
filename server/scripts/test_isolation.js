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
  console.log('TEST SUITE: SHIORI JOURNAL & ACTIVITY DATA ISOLATION REGRESSION');
  console.log('================================================================');

  const { queryAll, queryOne, runQuery } = await import('../dist/db/index.js');
  const { journalRouter } = await import('../dist/routes/journal.routes.js');
  const { activityRouter } = await import('../dist/routes/activity.routes.js');
  const { reportsRouter } = await import('../dist/routes/reports.routes.js');
  const { tasksRouter } = await import('../dist/routes/tasks.routes.js');
  const { extractDayString, normalizeDate } = await import('../dist/utils/dateRange.js');

  // Test 1: PostgreSQL Date & Timestamp normalization regression
  console.log('\n[1] Testing PostgreSQL Date/Timestamp type handling:');
  const dateObj = new Date();
  const isoStr = '2026-09-12T01:30:00.000Z';
  const nullVal = null;
  const undefinedVal = undefined;

  const day1 = extractDayString(dateObj);
  const day2 = extractDayString(isoStr);
  const day3 = extractDayString(nullVal);
  const day4 = extractDayString(undefinedVal);

  console.log(`- Date obj extracted: "${day1}"`);
  console.log(`- ISO string extracted: "${day2}"`);
  console.log(`- Null extracted: "${day3}"`);
  console.log(`- Undefined extracted: "${day4}"`);

  if (!day1 || !day2 || day3 !== '' || day4 !== '') {
    throw new Error('Date extraction regression test failed!');
  }
  console.log('✓ PASS: Date extraction handles Date objects, strings, and null safely without throwing .split TypeError.');

  // Spin up test Express app
  const app = express();
  app.use(express.json());
  app.use('/api/journal', journalRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/tasks', tasksRouter);

  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = testServer.address().port;
  console.log(`- Test server listening on port ${testPort}`);

  try {
    // Create test users
    const userAId = uuidv4();
    const userBId = uuidv4();
    const userCId = uuidv4(); // Unrelated third user

    await runQuery(`INSERT INTO users (id, email, name, username, shiori_id, password_hash) VALUES (?, ?, ?, ?, ?, 'hash')`,
      [userAId, `userA_${Date.now()}@shiori.test`, 'User A', `userA_${Date.now()}`, `SHIORI-${Math.floor(Math.random()*9000+1000)}`]);
    await runQuery(`INSERT INTO users (id, email, name, username, shiori_id, password_hash) VALUES (?, ?, ?, ?, ?, 'hash')`,
      [userBId, `userB_${Date.now()}@shiori.test`, 'User B', `userB_${Date.now()}`, `SHIORI-${Math.floor(Math.random()*9000+1000)}`]);
    await runQuery(`INSERT INTO users (id, email, name, username, shiori_id, password_hash) VALUES (?, ?, ?, ?, ?, 'hash')`,
      [userCId, `userC_${Date.now()}@shiori.test`, 'User C', `userC_${Date.now()}`, `SHIORI-${Math.floor(Math.random()*9000+1000)}`]);

    const tokenA = createToken(userAId, 'usera@test.com', 'usera');
    const tokenB = createToken(userBId, 'userb@test.com', 'userb');
    const tokenC = createToken(userCId, 'userc@test.com', 'userc');

    // User A creates Project "SHIORI Core" with github_repo_name "SHIORI"
    const projAId = uuidv4();
    const wsAId = uuidv4();
    await runQuery(`INSERT INTO workspaces (id, name, slug, creator_id) VALUES (?, 'WS A', ?, ?)`, [wsAId, `ws-a-${Date.now()}`, userAId]);
    await runQuery(`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, 'owner')`, [uuidv4(), wsAId, userAId]);
    await runQuery(`INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, created_by) VALUES (?, ?, 'SHIORI Core', ?, 'SHIORI', ?)`, [projAId, wsAId, `shiori-core-${Date.now()}`, userAId]);

    // User A creates task TASK-A01 and commits to SHIORI
    const taskAId = uuidv4();
    await runQuery(`INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, created_by, github_repo) VALUES (?, 1, 'TASK-A01', ?, ?, 'Build Parser', 'DONE', ?, 'SHIORI')`, [taskAId, projAId, wsAId, userAId]);
    await runQuery(`INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name) VALUES (?, ?, 'SHIORI', 'main', 'sha_a_1', 'feat: parser', 'User A')`, [uuidv4(), taskAId]);
    await runQuery(`INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text) VALUES (?, ?, ?, ?, ?, 'TASK', '✓', 'Task completed: TASK-A01', 'Build Parser')`, [uuidv4(), userAId, wsAId, projAId, taskAId]);

    // User B creates Project "Compiler SO" with github_repo_name "compiler-SO"
    const projBId = uuidv4();
    const wsBId = uuidv4();
    await runQuery(`INSERT INTO workspaces (id, name, slug, creator_id) VALUES (?, 'WS B', ?, ?)`, [wsBId, `ws-b-${Date.now()}`, userBId]);
    await runQuery(`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES (?, ?, ?, 'owner')`, [uuidv4(), wsBId, userBId]);
    await runQuery(`INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, created_by) VALUES (?, ?, 'Compiler SO', ?, 'compiler-SO', ?)`, [projBId, wsBId, `compiler-so-${Date.now()}`, userBId]);

    // User B creates task TASK-B01 and commits to compiler-SO
    const taskBId = uuidv4();
    await runQuery(`INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, created_by, github_repo) VALUES (?, 1, 'TASK-B01', ?, ?, 'Optimize LLVM', 'DONE', ?, 'compiler-SO')`, [taskBId, projBId, wsBId, userBId]);
    await runQuery(`INSERT INTO github_commits (id, task_id, repo_name, branch_name, commit_hash, message, author_name) VALUES (?, ?, 'compiler-SO', 'main', 'sha_b_1', 'feat: llvm pass', 'User B')`, [uuidv4(), taskBId]);
    await runQuery(`INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text) VALUES (?, ?, ?, ?, ?, 'TASK', '✓', 'Task completed: TASK-B01', 'Optimize LLVM')`, [uuidv4(), userBId, wsBId, projBId, taskBId]);

    console.log('\n[2] Testing User B Daily Journal Isolation (/api/journal/today):');
    const journalTodayB = await makeRequest(testPort, {
      path: '/api/journal/today',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    console.log(`- Status: ${journalTodayB.status}`);
    console.log(`- Commits count: ${journalTodayB.body?.development?.commits}`);
    console.log(`- Tasks count: ${journalTodayB.body?.todayTasks?.length}`);
    console.log(`- Today tasks:`, journalTodayB.body?.todayTasks?.map(t => `${t.task_code} (${t.project_name})`));
    console.log(`- Last activity items:`, journalTodayB.body?.lastActivity?.map(a => a.label));

    if (journalTodayB.status !== 200) throw new Error('Failed to get User B daily journal');
    if (journalTodayB.body.todayTasks.some(t => t.project_name === 'SHIORI Core' || t.task_code === 'TASK-A01')) {
      throw new Error('LEAK DETECTED: User B sees User A tasks in Daily Journal!');
    }
    if (journalTodayB.body.lastActivity.some(a => a.label?.includes('parser'))) {
      throw new Error('LEAK DETECTED: User B sees User A commits in Daily Journal!');
    }
    console.log('✓ PASS: User B Daily Journal contains 0 leaked tasks or commits from User A.');

    console.log('\n[3] Testing User B Weekly Summary Isolation (/api/journal/weekly):');
    const journalWeeklyB = await makeRequest(testPort, {
      path: '/api/journal/weekly',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    console.log(`- Status: ${journalWeeklyB.status}`);
    console.log(`- Projects distribution:`, journalWeeklyB.body?.projectsDistribution);
    
    if (journalWeeklyB.status !== 200) throw new Error('Failed to get User B weekly summary');
    const leakedProjects = journalWeeklyB.body.projectsDistribution?.filter(p => p.name === 'SHIORI Core' || p.name === 'SHIORI');
    if (leakedProjects?.length > 0) {
      throw new Error('LEAK DETECTED: User B Weekly Summary contains User A projects!');
    }
    console.log('✓ PASS: User B Weekly Summary contains ONLY authorized projects (Compiler SO).');

    console.log('\n[4] Testing User B Activity / Audit Isolation (/api/activity):');
    const activityB = await makeRequest(testPort, {
      path: '/api/activity',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    console.log(`- Status: ${activityB.status}`);
    console.log(`- Total activities returned: ${activityB.body?.activities?.length}`);
    console.log(`- Activities:`, activityB.body?.activities?.map(a => a.title));

    if (activityB.status !== 200) throw new Error('Failed to get User B activity');
    if (activityB.body.activities.some(a => a.title?.includes('TASK-A01') || a.user_id === userAId)) {
      throw new Error('LEAK DETECTED: User B sees User A activity in Activity Log!');
    }
    if (activityB.body.projects.some(p => p.name === 'SHIORI Core')) {
      throw new Error('LEAK DETECTED: User B sees User A projects in activity dropdown!');
    }
    console.log('✓ PASS: User B Activity Log returns ONLY User B activities and projects.');

    console.log('\n[5] Testing User B Reports Summary Isolation (/api/reports/summary):');
    const reportB = await makeRequest(testPort, {
      path: '/api/reports/summary?timeframe=this_week',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    console.log(`- Status: ${reportB.status}`);
    console.log(`- Completed count: ${reportB.body?.metrics?.completedCount}`);
    console.log(`- Project breakdown:`, reportB.body?.projectBreakdown?.map(p => p.projectName));
    console.log(`- Repository breakdown:`, reportB.body?.repositoryBreakdown?.map(r => r.repoName));

    if (reportB.status !== 200) throw new Error('Failed to get User B report summary');
    if (reportB.body.projectBreakdown?.some(p => p.projectName === 'SHIORI Core')) {
      throw new Error('LEAK DETECTED: User B Report Breakdown contains SHIORI Core!');
    }
    if (reportB.body.repositoryBreakdown?.some(r => r.repoName === 'SHIORI')) {
      throw new Error('LEAK DETECTED: User B Repository Breakdown contains SHIORI repo!');
    }
    console.log('✓ PASS: User B Report Summary contains ONLY Compiler SO / compiler-SO.');

    console.log('\n[6] Testing Shared Project Membership Authorization:');
    // User A creates shared project "Team Shared Alpha" and adds User B as member
    const sharedProjId = uuidv4();
    await runQuery(`INSERT INTO projects (id, workspace_id, name, slug, github_repo_name, created_by) VALUES (?, ?, 'Team Shared Alpha', ?, 'team-alpha', ?)`, [sharedProjId, wsAId, `team-alpha-${Date.now()}`, userAId]);
    await runQuery(`INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'member')`, [uuidv4(), sharedProjId, userBId]);

    // User A creates task on shared project
    const sharedTaskId = uuidv4();
    await runQuery(`INSERT INTO tasks (id, task_number, task_code, project_id, workspace_id, title, status, created_by, github_repo) VALUES (?, 2, 'TASK-S01', ?, ?, 'Shared Feature', 'DONE', ?, 'team-alpha')`, [sharedTaskId, sharedProjId, wsAId, userAId]);
    await runQuery(`INSERT INTO global_activities (id, user_id, workspace_id, project_id, task_id, category, icon_symbol, title, meta_text) VALUES (?, ?, ?, ?, ?, 'TASK', '✓', 'Task completed: TASK-S01', 'Shared Feature')`, [uuidv4(), userAId, wsAId, sharedProjId, sharedTaskId]);

    // User B queries activity -> should see TASK-S01 because User B is a member of Team Shared Alpha
    const activityBShared = await makeRequest(testPort, {
      path: '/api/activity',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    const seesShared = activityBShared.body.activities?.some(a => a.title?.includes('TASK-S01'));
    console.log(`- User B sees shared project activity: ${seesShared}`);
    if (!seesShared) throw new Error('Authorized team member User B could NOT see shared project activity!');

    // User C (unrelated) queries activity -> must NOT see TASK-S01
    const activityC = await makeRequest(testPort, {
      path: '/api/activity',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenC}` }
    });
    const userCSeesShared = activityC.body.activities?.some(a => a.title?.includes('TASK-S01') || a.title?.includes('TASK-A01') || a.title?.includes('TASK-B01'));
    console.log(`- Unrelated User C sees private/unauthorized activity: ${userCSeesShared}`);
    if (userCSeesShared) throw new Error('LEAK DETECTED: Unrelated User C sees unauthorized activity!');

    console.log('✓ PASS: Shared projects are visible to members and blocked for non-members.');

    console.log('\n[7] Testing Task Detail Endpoint Authorization (/api/tasks/:id):');
    // User B tries to fetch User A's private task TASK-A01
    const privateTaskRes = await makeRequest(testPort, {
      path: `/api/tasks/${taskAId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    console.log(`- User B fetching User A private task status: ${privateTaskRes.status}`);
    if (privateTaskRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${privateTaskRes.status}`);
    }
    console.log('✓ PASS: Unauthorized task access returns 403 Forbidden.');

    console.log('\n================================================================');
    console.log('ALL REGRESSION TESTS PASSED PERFECTLY (100% DATA ISOLATION)');
    console.log('================================================================');
  } finally {
    testServer.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
