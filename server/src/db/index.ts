import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

let db: Database | null = null;
const dbFilePath = config.dbPath;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema if needed
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
      db.run(schemaSql);
    } catch (e) {
      console.warn('Schema run notice:', e);
    }

    // Auto-migrate columns and tables if missing
    try {
      db.run(`ALTER TABLE users ADD COLUMN shiori_id TEXT;`);
    } catch {}
    try {
      db.run(`ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 120;`);
    } catch {}
    try {
      db.run(`ALTER TABLE tasks ADD COLUMN auto_completed INTEGER DEFAULT 0;`);
    } catch {}
    try {
      db.run(`ALTER TABLE tasks ADD COLUMN auto_completed_reason TEXT;`);
    } catch {}
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS user_repositories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          repo_name TEXT NOT NULL,
          full_name TEXT NOT NULL,
          default_branch TEXT DEFAULT 'main',
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE (user_id, repo_name)
        );
      `);
    } catch {}
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS project_members (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT DEFAULT 'member',
          joined_at TEXT DEFAULT (datetime('now')),
          UNIQUE (project_id, user_id)
        );
      `);
    } catch {}
    try {
      db.run(`
        CREATE TABLE IF NOT EXISTS registration_otps (
          email TEXT PRIMARY KEY,
          otp_hash TEXT NOT NULL,
          otp_plain TEXT NOT NULL,
          name TEXT,
          username TEXT,
          password_hash TEXT,
          attempts INTEGER DEFAULT 0,
          expires_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
    } catch {}

    saveDb();
  } else {
    console.warn('Could not locate schema.sql at candidate paths:', candidatePaths);
  }

  return db;
}

export function saveDb(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  } catch (error) {
    console.error('Failed to persist database to disk:', error);
  }
}

export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
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
  const database = await getDb();
  const sanitizedParams = params.map((p) => (p === undefined ? null : p));
  database.run(sql, sanitizedParams);
  saveDb();
}
