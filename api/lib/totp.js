import crypto from 'crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Convert a base32 secret (with optional spaces/padding) to a Buffer.
// Supports both RFC 4648 base32 and the hex-encoded secrets previously
// produced by /api/setup-2fa (uppercase hex is a valid base32 subset).
export function base32ToBuffer(secret) {
  const clean = String(secret).replace(/\s/g, '').replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) return null; // invalid character -> invalid secret
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{1,8}/g) || [];
  return Buffer.from(bytes.map(b => parseInt(b, 2)));
}

function generateTotp(secretBuffer, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 4294967296), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secretBuffer).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, '0');
}

// Constant-time comparison of two short numeric strings.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a 6-digit TOTP code against a base32 secret.
 * Allows +/- 1 time step (30s) clock drift by default.
 */
export function verifyTotp(secret, token, window = 1) {
  if (!secret || !token) return false;
  const normalized = String(token).trim();
  if (!/^\d{6}$/.test(normalized)) return false;

  const secretBuffer = base32ToBuffer(secret);
  if (!secretBuffer || secretBuffer.length === 0) return false;

  const time = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    if (safeEqual(generateTotp(secretBuffer, time + i), normalized)) return true;
  }
  return false;
}

/**
 * Generate the current TOTP code (used for testing/enrollment confirmation).
 */
export function generateCurrentTotp(secret) {
  const secretBuffer = base32ToBuffer(secret);
  if (!secretBuffer) return null;
  const time = Math.floor(Date.now() / 1000 / 30);
  return generateTotp(secretBuffer, time);
}
