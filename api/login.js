import crypto from 'crypto';
import { createSession, setSessionCookie } from './lib/auth.js';
import { verifyTotp } from './lib/totp.js';
import { logAudit } from './lib/audit.js';

// Simple in-memory rate limiter (per serverless instance).
// Limits each IP to MAX_ATTEMPTS failed logins per WINDOW_MS.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function clientKey(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
}

function tooManyAttempts(req) {
  const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clearAttempts(req) {
  attempts.delete(clientKey(req));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, totpCode } = req.body || {};

  // Accept either MASTER_PASSWORD or APP_PASSWORD so login stays compatible
  // with the rest of the app / existing Vercel env configuration.
  const masterPassword = process.env.MASTER_PASSWORD || process.env.APP_PASSWORD;
  const totpSecret = process.env.TOTP_SECRET;

  if (!masterPassword) {
    return res.status(500).json({ error: 'Server misconfiguration: MASTER_PASSWORD missing' });
  }

  if (!totpSecret) {
    // Fail closed: never allow a login that skips 2FA because the secret
    // was misconfigured or removed.
    console.error('Login blocked: TOTP_SECRET is not configured');
    return res.status(500).json({ error: 'Server misconfiguration: 2FA is not set up. Run Setup 2FA and add TOTP_SECRET to your environment variables.' });
  }

  if (tooManyAttempts(req)) {
    await logAudit(null, 'LOGIN_THROTTLED', {});
    return res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes and try again.' });
  }

  // Validate Master Password (constant-time)
  const pwOk = crypto.timingSafeEqual(
    Buffer.from(String(password ?? '').padEnd(256).slice(0, 256)),
    Buffer.from(String(masterPassword).padEnd(256).slice(0, 256))
  );
  if (!pwOk) {
    await logAudit(null, 'LOGIN_FAILED', { reason: 'bad_password' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Validate 2FA Code against the shared TOTP_SECRET (real HMAC-SHA1 check)
  if (!totpCode || !verifyTotp(totpSecret, String(totpCode))) {
    await logAudit(null, 'LOGIN_FAILED', { reason: 'bad_2fa' });
    return res.status(401).json({ error: 'Invalid 2FA code. Check your authenticator app (codes rotate every 30 seconds).' });
  }

  try {
    // Create the dashboard session ONLY after password and 2FA are verified
    const session = await createSession('dashboard-user');
    await setSessionCookie(res, session);
    clearAttempts(req);
    await logAudit(session.id, 'LOGIN_SUCCESS', {});

    return res.status(200).json({
      success: true,
      authenticated: true,
      hmrcAuthenticated: false // HMRC login happens separately
    });
  } catch (e) {
    console.error('Login session error:', e);
    return res.status(500).json({ error: 'Failed to initialize session' });
  }
}
