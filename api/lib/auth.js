import { getDb, ensureSchema } from './db.js';
import crypto from 'crypto';

const SESSION_TTL = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30') * 60 * 1000;
const COOKIE_NAME = 'emcs_session';

// Schema initialization happens lazily, not at module load
let schemaReady = false;
async function initSchema() {
  if (schemaReady) return;
  await ensureSchema();
  schemaReady = true;
}

function signPayload(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(data).toString('base64url') + '.' + hmac;
}

function verifySignedPayload(signed) {
  try {
    const [b64, hmac] = signed.split('.');
    const data = JSON.parse(Buffer.from(b64, 'base64url').toString());
    const secret = process.env.SESSION_SECRET;
    const expected = crypto.createHmac('sha256', secret)
      .update(JSON.stringify(data)).digest('hex');
    if (hmac.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

function setCookie(res, name, value, maxAgeMs) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
    'HttpOnly',
    'Secure',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing];
  arr.push(attrs.join('; '));
  res.setHeader('Set-Cookie', arr);
}

function clearCookie(res, name) {
  const attrs = [
    `${name}=`,
    'Path=/',
    'SameSite=Strict',
    'HttpOnly',
    'Secure',
    'Max-Age=0'
  ];
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing];
  arr.push(attrs.join('; '));
  res.setHeader('Set-Cookie', arr);
}

export async function createSession(userId) {
  await initSchema();
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  
  await db.execute({
    sql: 'INSERT INTO sessions (id, user_id, created_at, last_activity) VALUES (?, ?, ?, ?)',
    args: [sessionId, userId, now, now]
  });
  
  return { id: sessionId, userId, createdAt: now, lastActivity: now };
}

export async function getSession(req) {
  await initSchema();
  const cookies = parseCookies(req);
  const signed = cookies[COOKIE_NAME];
  if (!signed) return null;
  
  const payload = verifySignedPayload(signed);
  if (!payload || !payload.sessionId) return null;
  
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM sessions WHERE id = ?',
    args: [payload.sessionId]
  });
  
  if (result.rows.length === 0) return null;
  const session = result.rows[0];
  
  if (Date.now() - session.last_activity > SESSION_TTL) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [session.id] });
    return null;
  }
  
  const now = Date.now();
  await db.execute({
    sql: 'UPDATE sessions SET last_activity = ? WHERE id = ?',
    args: [now, session.id]
  });
  
  return {
    id: session.id,
    userId: session.user_id,
    createdAt: session.created_at,
    lastActivity: now
  };
}

export async function setSessionCookie(res, session) {
  const signed = signPayload({ sessionId: session.id });
  setCookie(res, COOKIE_NAME, signed, SESSION_TTL);
}

export async function destroySession(req, res) {
  await initSchema();
  const cookies = parseCookies(req);
  const signed = cookies[COOKIE_NAME];
  if (signed) {
    const payload = verifySignedPayload(signed);
    if (payload && payload.sessionId) {
      const db = getDb();
      await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [payload.sessionId] });
    }
  }
  clearCookie(res, COOKIE_NAME);
}

export async function storeHmrcToken(sessionId, token, expiresInSec = 14400) {
  await initSchema();
  const db = getDb();
  const expiresAt = Date.now() + (expiresInSec * 1000);
  
  const existing = await db.execute({
    sql: 'SELECT session_id FROM hmrc_tokens WHERE session_id = ?',
    args: [sessionId]
  });
  
  if (existing.rows.length > 0) {
    await db.execute({
      sql: 'UPDATE hmrc_tokens SET access_token = ?, expires_at = ? WHERE session_id = ?',
      args: [token, expiresAt, sessionId]
    });
  } else {
    await db.execute({
      sql: 'INSERT INTO hmrc_tokens (session_id, access_token, expires_at, created_at) VALUES (?, ?, ?, ?)',
      args: [sessionId, token, expiresAt, Date.now()]
    });
  }
}

export async function getHmrcToken(sessionId) {
  await initSchema();
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT access_token, expires_at FROM hmrc_tokens WHERE session_id = ?',
    args: [sessionId]
  });
  
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.expires_at < Date.now()) {
    await db.execute({ sql: 'DELETE FROM hmrc_tokens WHERE session_id = ?', args: [sessionId] });
    return null;
  }
  return row.access_token;
}

export async function clearHmrcToken(sessionId) {
  await initSchema();
  const db = getDb();
  try {
    await db.execute({ sql: 'DELETE FROM hmrc_tokens WHERE session_id = ?', args: [sessionId] });
  } catch (e) {}
}
