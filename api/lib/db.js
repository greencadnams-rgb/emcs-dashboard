import { createClient } from '@libsql/client';

let db = null;

export function getDb() {
  if (!db) {
    // FIX: .trim() automatically strips out any hidden newlines or spaces!
    const rawUrl = process.env.TURSO_DATABASE_URL;
    const rawToken = process.env.TURSO_AUTH_TOKEN;
    
    const url = rawUrl ? rawUrl.trim() : undefined;
    const token = rawToken ? rawToken.trim() : undefined;
    
    if (!url || !token) {
      console.error('❌ TURSO ERROR: Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
      throw new Error('Turso credentials not configured');
    }
    
    try {
      db = createClient({ url, authToken: token });
    } catch (e) {
      console.error('❌ TURSO ERROR: Failed to initialize client:', e.message);
      throw e;
    }
  }
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hmrc_tokens (
  session_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  ern TEXT NOT NULL,
  trader_name TEXT,
  street TEXT,
  postcode TEXT,
  city TEXT,
  office TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
`;

let initialized = false;
export async function ensureSchema() {
  if (initialized) return;
  try {
    const db = getDb();
    const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try { await db.execute(stmt); }
      catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
          console.error('Schema init error:', e.message);
        }
      }
    }
    initialized = true;
  } catch (e) {
    console.error('Schema initialization failed:', e.message);
    throw e;
  }
}
