import { authenticator } from 'otplib';
import checkRateLimit from './rate-limit.js';

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Block brute-force attacks
  if (!checkRateLimit(ip)) {
    console.log(`RATE LIMITED: ${ip} at ${new Date().toISOString()}`);
    return res.status(429).json({
      error: "Too many login attempts. Please try again in 15 minutes."
    });
  }

  const { password, totpCode } = req.body;
  const correctPassword = process.env.APP_PASSWORD;
  const totpSecret = process.env.TOTP_SECRET;

  // Step 1: Check password
  if (password !== correctPassword) {
    console.log(`FAILED login from IP: ${ip} at ${new Date().toISOString()}`);
    return res.status(401).json({ error: "Wrong password" });
  }

  // Step 2: Check 2FA (if enabled)
  if (totpSecret) {
    if (!totpCode) {
      return res.status(401).json({
        error: "2FA code required",
        requires2FA: true
      });
    }

    const isValid = authenticator.verify({
      token: totpCode,
      secret: totpSecret
    });

    if (!isValid) {
      console.log(`FAILED 2FA from IP: ${ip} at ${new Date().toISOString()}`);
      return res.status(401).json({ error: "Invalid 2FA code" });
    }
  }

  // Success — set authentication cookie (24 hours)
  console.log(`SUCCESSFUL login from IP: ${ip} at ${new Date().toISOString()}`);
  res.setHeader('Set-Cookie',
    `app_auth=authenticated; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
  );
  res.json({ success: true });
}
