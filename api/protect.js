import { createSession, setSessionCookie, getSession } from './lib/auth.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

function verifyTotp(secret, token) {
  if (!secret || !token) return false;
  const time = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    const expected = generateTotp(secret, time + i);
    if (expected === token) return true;
  }
  return false;
}

function generateTotp(secret, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(counter, 4);
  
  // Convert base32 secret to buffer
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/\s/g, '').toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const secretBytes = Buffer.from(bits.match(/.{1,8}/g).map(b => parseInt(b, 2)));
  
  const hmac = crypto.createHmac('sha1', secretBytes).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, totpCode } = req.body;
  const expectedPassword = process.env.APP_PASSWORD;
  const totpSecret = process.env.TOTP_SECRET;

  if (!expectedPassword) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  // Check password
  if (password !== expectedPassword) {
    await logAudit(null, 'LOGIN_FAILED', { reason: 'bad_password' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check 2FA if configured
  if (totpSecret) {
    if (!totpCode) {
      return res.status(200).json({ requires2FA: true, error: '2FA code required' });
    }
    if (!verifyTotp(totpSecret, totpCode)) {
      await logAudit(null, 'LOGIN_FAILED', { reason: 'bad_2fa' });
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }
  }

  // Create session
  const session = await createSession('dashboard-user');
  await setSessionCookie(res, session);
  await logAudit(session.id, 'LOGIN_SUCCESS', {});

  return res.status(200).json({ success: true });
}
