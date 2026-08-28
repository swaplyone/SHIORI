import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
let pgPool: pg.Pool | null = null;
let sqliteDb: SqlJsDatabase | null = null;
const dbFilePath = config.dbPath;

if (databaseUrl) {
  console.log('[DATABASE] Initializing Supabase / PostgreSQL cloud connection...');
  pgPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pgPool.on('error', (err) => {
    console.error('[DATABASE POOL ERROR]', err.message);
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
      task_number INTEGER,
      task_code TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'TODO',
      priority TEXT DEFAULT 'MEDIUM',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      github_repo TEXT,
      github_branch TEXT,
      github_pr_number INTEGER,
      github_commit_hash TEXT,
      auto_completed INTEGER DEFAULT 0,
      auto_completed_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
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
      github_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT,
      access_token TEXT,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, github_id)
    );

    CREATE TABLE IF NOT EXISTS github_commits (
      id TEXT PRIMARY KEY,
      repo_name TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      message TEXT NOT NULL,
      author_name TEXT,
      author_username TEXT,
      author_avatar TEXT,
      branch TEXT DEFAULT 'main',
      files_changed INTEGER DEFAULT 1,
      pushed_at TIMESTAMPTZ DEFAULT NOW()
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
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    await pool.query(schemaSql);
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
    .replace(/datetime\('now',\s*'\+7 days'\)/gi, "(NOW() + INTERVAL '7 days')")
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO');

  // Handle SQLite INSERT OR IGNORE / REPLACE for PostgreSQL
  if (sql.includes('INSERT OR IGNORE INTO')) {
    if (!translatedSql.toLowerCase().includes('on conflict')) {
      translatedSql += ' ON CONFLICT DO NOTHING';
    }
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
    const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
    const result = await pgPool.query(pgSql, pgParams);
    return result.rows as T[];
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
    const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
    const result = await pgPool.query(pgSql, pgParams);
    return (result.rows[0] as T) || null;
  }

  const database = await getDb();
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
    const { sql: pgSql, params: pgParams } = translateSqlForPostgres(sql, params);
    await pgPool.query(pgSql, pgParams);
    return;
  }

  const database = await getDb();
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  database.run(sql, sanitizedParams);
  saveDb();
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
