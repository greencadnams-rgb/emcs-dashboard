import { createClient } from '@libsql/client';

let db = null;

export function getDb() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;
    if (!url || !token) {
      throw new Error('Turso credentials not configured');
    }
    db = createClient({ url, authToken: token });
  }
  return db;
}

let initialized = false;
export async function ensureSchema() {
  if (initialized) return;
  const db = getDb();
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const schemaPath = path.join(process.cwd(), 'api', 'lib', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');
  
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('Schema init error:', e.message);
      }
    }
  }
  initialized = true;
}

export async function cleanupOldAuditLogs(daysToKeep = 90) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  await db.execute({
    sql: 'DELETE FROM audit_logs WHERE timestamp < ?',
    args: [cutoff.toISOString()]
  });
}

export async function cleanupExpiredSessions() {
  const db = getDb();
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  await db.execute({
    sql: 'DELETE FROM sessions WHERE last_activity < ?',
    args: [cutoff]
  });
}
