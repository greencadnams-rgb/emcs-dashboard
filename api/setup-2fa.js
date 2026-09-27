import crypto from 'crypto';
import { verifyTotp } from './lib/totp.js';

// 2FA enrollment — works BEFORE the user has a dashboard session.
//
// Flow:
//   POST { password }        -> server generates a secret, stores it in memory
//                              as "pending", returns QR code + otpauth URL
//   PUT  { password, token } -> verifies the authenticator code against the
//                              pending secret and confirms enrollment
//
// NOTE: Vercel's serverless functions cannot write to their own environment
// variables. After verification succeeds, the secret MUST be saved as the
// TOTP_SECRET env var in the Vercel dashboard for login 2FA to use it.
// The pending secret is kept in module memory (best-effort across warm
// instances) so the confirm step usually lands on the same instance that
// started enrollment.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map(g => BASE32[parseInt(g, 2)]).join('');
}

let pendingSecret = null; // set during POST, checked during PUT

function checkPassword(req) {
  const masterPassword = process.env.MASTER_PASSWORD || process.env.APP_PASSWORD;
  if (!masterPassword) {
    return { ok: false, status: 500, error: 'Server misconfiguration: MASTER_PASSWORD missing' };
  }
  const given = String((req.body || {}).password ?? '');
  const a = Buffer.from(given.padEnd(256).slice(0, 256));
  const b = Buffer.from(String(masterPassword).padEnd(256).slice(0, 256));
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: 'Invalid password' };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    const auth = checkPassword(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const secret = generateBase32Secret();
    pendingSecret = secret;

    const issuer = 'EMCS-Dashboard';
    const account = 'admin';
    const otpauth = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;

    return res.status(200).json({ secret, otpauth, qrCode });
  }

  if (req.method === 'PUT') {
    const auth = checkPassword(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const body = req.body || {};
    // Prefer the server-side pending secret; fall back to a client-supplied
    // one (e.g. if the confirm request hit a different serverless instance).
    const secret = body.secret || pendingSecret;
    if (!secret) {
      return res.status(400).json({ error: 'No pending 2FA setup found. Click "Setup 2FA" again.' });
    }

    const token = String(body.token ?? '');
    if (!verifyTotp(secret, token)) {
      return res.status(401).json({ error: 'Invalid code. Check your authenticator app and try again (codes rotate every 30 seconds).' });
    }

    pendingSecret = null;
    return res.status(200).json({
      success: true,
      secret,
      message: 'Code verified! Save this value as the TOTP_SECRET environment variable in Vercel (Settings → Environment Variables), then redeploy.'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
