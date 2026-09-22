import { authenticator } from 'otplib';
import checkRateLimit from './rate-limit.js';

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: "Too many login attempts. Try again in 15 minutes."
    });
  }

  const { password, totpCode } = req.body;
  const correctPassword = process.env.APP_PASSWORD;
  const totpSecret = process.env.TOTP_SECRET;

  if (password !== correctPassword) {
    return res.status(401).json({ error: "Wrong password" });
  }

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
      return res.status(401).json({ error: "Invalid 2FA code" });
    }
  }

  // SUCCESS - return a simple token the frontend can store in localStorage
  res.json({ success: true, dashboardToken: "authenticated" });
}
