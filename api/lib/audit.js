import { getDb, ensureSchema } from './db.js';
import crypto from 'crypto';

// Lazy schema initialization
let schemaReady = false;
async function initSchema() {
  if (schemaReady) return;
  await ensureSchema();
  schemaReady = true;
}

export async function logAudit(sessionId, action, details = {}) {
  if (process.env.AUDIT_ENABLED === 'false') return;
  
  try {
    await initSchema();
    const db = getDb();
    const entry = {
      id: crypto.randomUUID(),
      sessionId: sessionId || 'anonymous',
      action,
      details: JSON.stringify(details),
      timestamp: new Date().toISOString(),
      createdAt: Date.now()
    };

    await db.execute({
      sql: 'INSERT INTO audit_logs (id, session_id, action, details, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [entry.id, entry.sessionId, entry.action, entry.details, entry.timestamp, entry.createdAt]
    });
  } catch (e) {
    // Don't let audit failures break the app
    console.error('Audit log failed:', e.message);
  }
}

export async function getAuditLog(sessionId, limit = 100, offset = 0) {
  await initSchema();
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM audit_logs WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    args: [sessionId, limit, offset]
  });
  return result.rows.map(r => ({
    ...r,
    details: safeJsonParse(r.details)
  }));
}

export async function getGlobalAuditLog(limit = 1000) {
  await initSchema();
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?',
    args: [limit]
  });
  return result.rows.map(r => ({
    ...r,
    details: safeJsonParse(r.details)
  }));
}

export async function getAuditSummary(days = 30) {
  await initSchema();
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  const result = await db.execute({
    sql: 'SELECT action, COUNT(*) as count FROM audit_logs WHERE timestamp > ? GROUP BY action ORDER BY count DESC',
    args: [cutoff.toISOString()]
  });
  return result.rows;
}

function safeJsonParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return {};
  }
}
