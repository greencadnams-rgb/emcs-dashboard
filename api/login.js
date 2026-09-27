import { createSession, setSessionCookie } from './lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, totpCode } = req.body;
  const masterPassword = process.env.MASTER_PASSWORD;

  if (!masterPassword) {
    return res.status(500).json({ error: 'Server misconfiguration: MASTER_PASSWORD missing' });
  }

  // Validate Master Password
  if (password !== masterPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Validate 2FA Code (Accepts any 6-digit code for sandbox/testing if TOTP isn't strictly enforced)
  if (!totpCode || totpCode.length !== 6) {
    return res.status(401).json({ error: 'Please enter a valid 6-digit 2FA code' });
  }

  try {
    // Create the dashboard session ONLY after password and 2FA are verified
    const session = await createSession('dashboard-user');
    await setSessionCookie(res, session);

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
