import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;

// Auto-convert direct Supabase domain to IPv4 compatible connection pooler
if (databaseUrl && databaseUrl.includes('db.kwfbcwqdblmapdnhptfx.supabase.co')) {
  databaseUrl = 'postgresql://postgres.kwfbcwqdblmapdnhptfx:aBxB8qEKK7aLjeYq@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
}

let pgPool: pg.Pool | null = null;
let sqliteDb: SqlJsDatabase | null = null;
const dbFilePath = config.dbPath;

if (databaseUrl) {
  console.log('[DATABASE] Initializing Supabase IPv4 Pooler cloud connection...');
  pgPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
  });

  pgPool.on('error', (err: any) => {
    console.error('[DATABASE POOL ERROR]', err?.message || err);
  });
}

/**
 * Initializes tables on Supabase PostgreSQL
 */
async function initPgSchema(pool: pg.Pool) {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      shiori_id TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      points INTEGER DEFAULT 120,
      theme TEXT DEFAULT 'light',
      github_connected INTEGER DEFAULT 0,
      github_username TEXT,
      github_avatar TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      eink_refresh_interval INTEGER DEFAULT 10,
      privacy_tasks TEXT DEFAULT 'friends',
      privacy_github TEXT DEFAULT 'workspace',
      privacy_stats TEXT DEFAULT 'private',
      notify_build_failed INTEGER DEFAULT 1,
      notify_build_passed INTEGER DEFAULT 1,
      notify_pr_review INTEGER DEFAULT 1,
      notify_task_assigned INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'ACTIVE',
      UNIQUE (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'ACTIVE',
      github_repo_name TEXT,
      github_repo_url TEXT,
      default_branch TEXT DEFAULT 'main',
      created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      task_number INTEGER NOT NULL,
      task_code TEXT UNIQUE NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'TODO',
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      user_status TEXT DEFAULT 'PENDING',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      due_date TEXT,
      github_repo TEXT,
      github_branch TEXT,
      github_pr_number INTEGER,
      github_pr_title TEXT,
      github_pr_url TEXT,
      github_pr_state TEXT,
      github_ci_status TEXT DEFAULT 'UNKNOWN',
      github_last_commit_hash TEXT,
      github_last_commit_msg TEXT,
      github_last_commit_author TEXT,
      github_last_commit_time TEXT,
      auto_completed INTEGER DEFAULT 0,
      auto_completed_reason TEXT,
      completed_at TEXT,
      dev_evidence_commits_count INTEGER DEFAULT 0,
      dev_evidence_prs_count INTEGER DEFAULT 0,
      dev_evidence_files_changed INTEGER DEFAULT 0,
      dev_evidence_checks_passed INTEGER DEFAULT 0,
      dev_evidence_checks_failed INTEGER DEFAULT 0,
      dev_evidence_pr_merged INTEGER DEFAULT 0,
      dev_confidence_score INTEGER DEFAULT 0,
      has_ci_discrepancy INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_activity (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_repositories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      repo_name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      default_branch TEXT DEFAULT 'main',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, repo_name)
    );

    CREATE TABLE IF NOT EXISTS github_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      github_id TEXT,
      username TEXT NOT NULL,
      avatar_url TEXT,
      access_token TEXT,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, github_id)
    );

    CREATE TABLE IF NOT EXISTS task_commits (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      commit_sha TEXT NOT NULL,
      commit_message TEXT NOT NULL,
      author TEXT,
      author_username TEXT,
      author_avatar TEXT,
      branch TEXT DEFAULT 'main',
      files_changed INTEGER DEFAULT 1,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      tests_status TEXT DEFAULT 'passed',
      error_count INTEGER DEFAULT 0,
      error_details TEXT,
      warnings TEXT,
      ai_source TEXT,
      committed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS github_commits (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      repo_name TEXT NOT NULL,
      branch_name TEXT DEFAULT 'main',
      commit_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      author_name TEXT,
      author_username TEXT,
      author_avatar TEXT,
      files_changed INTEGER DEFAULT 1,
      pushed_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS github_workflow_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      repo_name TEXT NOT NULL,
      branch_name TEXT DEFAULT 'main',
      commit_hash TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL,
      conclusion TEXT,
      duration_seconds INTEGER DEFAULT 0,
      tests_total INTEGER DEFAULT 0,
      tests_passed INTEGER DEFAULT 0,
      tests_failed INTEGER DEFAULT 0,
      logs TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS registration_otps (
      email TEXT PRIMARY KEY,
      otp_hash TEXT NOT NULL,
      otp_plain TEXT NOT NULL,
      name TEXT,
      username TEXT,
      password_hash TEXT,
      attempts INTEGER DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS connection_requests (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'REQUESTED',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
      responded_at TIMESTAMPTZ,
      UNIQUE (sender_id, recipient_id)
    );

    CREATE TABLE IF NOT EXISTS connection_verification_sessions (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_a_hash TEXT NOT NULL,
      otp_b_hash TEXT NOT NULL,
      otp_a_plain TEXT NOT NULL,
      otp_b_plain TEXT NOT NULL,
      verified_a INTEGER DEFAULT 0,
      verified_b INTEGER DEFAULT 0,
      attempts_a INTEGER DEFAULT 0,
      attempts_b INTEGER DEFAULT 0,
      status TEXT DEFAULT 'VERIFICATION_PENDING',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_a_id, user_b_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      read INTEGER DEFAULT 0,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_invitations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
    );

    CREATE TABLE IF NOT EXISTS workspace_verification_sessions (
      id TEXT PRIMARY KEY,
      invitation_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_inviter_hash TEXT,
      otp_invitee_hash TEXT,
      otp_inviter_plain TEXT,
      otp_invitee_plain TEXT,
      verified_inviter INTEGER DEFAULT 0,
      verified_invitee INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS daily_journals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      content TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, entry_date)
    );

    CREATE TABLE IF NOT EXISTS global_activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT,
      project_id TEXT,
      task_id TEXT,
      category TEXT NOT NULL,
      icon_symbol TEXT NOT NULL,
      title TEXT NOT NULL,
      meta_text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    await pool.query(schemaSql);
    // Auto-migrate any missing columns on existing Supabase tables
    const migrations = [
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_status TEXT DEFAULT 'PENDING';`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_pr_title TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_pr_url TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_pr_state TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_ci_status TEXT DEFAULT 'UNKNOWN';`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_last_commit_hash TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_last_commit_msg TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_last_commit_author TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS github_last_commit_time TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_completed INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_completed_reason TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TEXT;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_commits_count INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_prs_count INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_files_changed INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_checks_passed INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_checks_failed INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_evidence_pr_merged INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dev_confidence_score INTEGER DEFAULT 0;`,
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS has_ci_discrepancy INTEGER DEFAULT 0;`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE SET NULL;`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'ACTION';`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS summary TEXT;`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS details TEXT;`,
      `ALTER TABLE task_activity ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS workspace_id TEXT;`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS project_id TEXT;`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS task_id TEXT;`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'TASK';`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS icon_symbol TEXT DEFAULT '○';`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS title TEXT;`,
      `ALTER TABLE global_activities ADD COLUMN IF NOT EXISTS meta_text TEXT;`,
      `ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;`,
      `ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS title TEXT;`,
      `ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS completed INTEGER DEFAULT 0;`,
      `ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;`,
      `ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;`,
      `ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`,
      `ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS content TEXT;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read INTEGER DEFAULT 0;`,
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read INTEGER DEFAULT 0;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS branch_name TEXT DEFAULT 'main';`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS author_name TEXT;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS author_username TEXT;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS author_avatar TEXT;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS files_changed INTEGER DEFAULT 1;`,
      `ALTER TABLE github_commits ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ DEFAULT NOW();`,
      `ALTER TABLE github_workflow_runs ADD COLUMN IF NOT EXISTS branch_name TEXT DEFAULT 'main';`,
      `ALTER TABLE github_workflow_runs ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0;`,
      `ALTER TABLE github_workflow_runs ADD COLUMN IF NOT EXISTS tests_total INTEGER DEFAULT 0;`,
      `ALTER TABLE github_workflow_runs ADD COLUMN IF NOT EXISTS tests_passed INTEGER DEFAULT 0;`,
      `ALTER TABLE github_workflow_runs ADD COLUMN IF NOT EXISTS tests_failed INTEGER DEFAULT 0;`
    ];

    for (const migration of migrations) {
      try {
        await pool.query(migration);
      } catch {}
    }

    console.log('[DATABASE] ✓ Supabase PostgreSQL schema initialized successfully.');
  } catch (err: any) {
    console.warn('[DATABASE SCHEMA NOTICE]', err.message);
  }
}

/**
 * Transforms SQLite queries to PostgreSQL syntax when running against Supabase
 */
function translateSqlForPostgres(sql: string, params: any[]): { sql: string; params: any[] } {
  let paramIndex = 1;
  let translatedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

  translatedSql = translatedSql
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/datetime\('now',\s*'\+7 days'\)/gi, "(NOW() + INTERVAL '7 days')");

  // Handle specific INSERT OR REPLACE / IGNORE queries for PostgreSQL
  if (/INSERT OR REPLACE INTO registration_otps/i.test(sql)) {
    translatedSql = translatedSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
    if (!translatedSql.toLowerCase().includes('on conflict')) {
      translatedSql += ` ON CONFLICT (email) DO UPDATE SET 
        otp_hash = EXCLUDED.otp_hash,
        otp_plain = EXCLUDED.otp_plain,
        name = EXCLUDED.name,
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        attempts = EXCLUDED.attempts,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()`;
    }
  } else if (/INSERT OR REPLACE INTO github_accounts/i.test(sql)) {
    translatedSql = translatedSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
    if (!translatedSql.toLowerCase().includes('on conflict')) {
      translatedSql += ` ON CONFLICT (user_id, github_id) DO UPDATE SET 
        username = EXCLUDED.username,
        avatar_url = EXCLUDED.avatar_url,
        access_token = EXCLUDED.access_token,
        connected_at = NOW()`;
    }
  } else if (/INSERT OR REPLACE INTO user_settings/i.test(sql)) {
    translatedSql = translatedSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
    if (!translatedSql.toLowerCase().includes('on conflict')) {
      translatedSql += ` ON CONFLICT (user_id) DO NOTHING`;
    }
  } else if (/INSERT OR IGNORE INTO/i.test(sql)) {
    translatedSql = translatedSql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    if (!translatedSql.toLowerCase().includes('on conflict')) {
      translatedSql += ' ON CONFLICT DO NOTHING';
    }
  } else if (/INSERT OR REPLACE INTO/i.test(sql)) {
    translatedSql = translatedSql.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');
  }

  return { sql: translatedSql, params };
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (pgPool) {
    // Already in PostgreSQL mode
    return null as any;
  }

  if (sqliteDb) return sqliteDb;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    sqliteDb = new SQL.Database(fileBuffer);
  } else {
    sqliteDb = new SQL.Database();
  }

  // Initialize SQLite schema
  const candidatePaths = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../src/db/schema.sql'),
    path.resolve(process.cwd(), 'src/db/schema.sql'),
    path.resolve(process.cwd(), 'server/src/db/schema.sql'),
  ];
  const schemaPath = candidatePaths.find((p) => fs.existsSync(p));
  if (schemaPath) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    try {
      sqliteDb.run(schemaSql);
    } catch (e) {
      console.warn('Schema run notice:', e);
    }
    saveDb();
  }

  return sqliteDb;
}

export function saveDb(): void {
  if (pgPool || !sqliteDb) return;
  try {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  } catch (error) {
    console.error('Failed to persist database to disk:', error);
  }
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (pgPool) {
    try {
      const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
      const result = await pgPool.query(pgSql, pgParams);
      return result.rows as T[];
    } catch (err: any) {
      console.error('[DATABASE PG ERROR queryAll]', err.message);
      // Graceful fallback to SQLite
    }
  }

  const database = await getDb();
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  const stmt = database.prepare(sql);
  stmt.bind(sanitizedParams);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  if (pgPool) {
    try {
      const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
      const res = await pgPool.query(pgSql, pgParams);
      return (res.rows[0] as T) || null;
    } catch (err: any) {
      console.error('[DATABASE PG ERROR queryOne]', err.message);
      return null;
    }
  }

  const database = await getDb();
  if (!database) return null;
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  const stmt = database.prepare(sql);
  stmt.bind(sanitizedParams);
  let result: T | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject() as T;
  }
  stmt.free();
  return result;
}

export async function runQuery(sql: string, params: any[] = []): Promise<void> {
  if (pgPool) {
    try {
      const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
      await pgPool.query(pgSql, pgParams);
      return;
    } catch (err: any) {
      console.error('[DATABASE PG ERROR runQuery]', err.message);
      return;
    }
  }

  const database = await getDb();
  if (database) {
    const sanitizedParams = params.map((p) => (p === undefined ? null : p));
    database.run(sql, sanitizedParams);
    saveDb();
  }
}

/**
 * Initializes the database connection on server start
 */
export async function initDatabaseConnection(): Promise<void> {
  if (pgPool) {
    try {
      await initPgSchema(pgPool);
      console.log('[DATABASE STATUS] ✓ Connected to permanent Supabase PostgreSQL cloud database.');
    } catch (err: any) {
      console.error('[DATABASE CONNECT ERROR]', err.message);
    }
  } else {
    await getDb();
    console.log(`[DATABASE STATUS] ✓ Using local SQLite database at: ${dbFilePath}`);
  }
}
