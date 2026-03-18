import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function createDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'alfred.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_processes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      dossier_id TEXT,
      pid INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      exit_code INTEGER,
      output_path TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      message TEXT NOT NULL,
      link TEXT NOT NULL,
      dossier_id TEXT
    );

    CREATE TABLE IF NOT EXISTS dedup_hashes (
      content_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      dossier_id TEXT PRIMARY KEY,
      session_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'tmux',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      claude_session_id TEXT,
      pid INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_claude_processes_type ON claude_processes(type);
    CREATE INDEX IF NOT EXISTS idx_claude_processes_status ON claude_processes(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
  `);

  // Migrations: add columns if missing (existing databases)
  const columns = db.prepare("PRAGMA table_info(claude_processes)").all() as Array<{ name: string }>;
  if (!columns.some(c => c.name === 'output_path')) {
    db.exec('ALTER TABLE claude_processes ADD COLUMN output_path TEXT');
    console.log('[db] Migrated claude_processes: added output_path column');
  }
  if (!columns.some(c => c.name === 'description')) {
    db.exec('ALTER TABLE claude_processes ADD COLUMN description TEXT');
    console.log('[db] Migrated claude_processes: added description column');
  }

  console.log('[db] SQLite database ready at', dbPath);
  return db;
}
