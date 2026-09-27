// Public (unauthenticated) endpoint the login screen polls to find out
// whether 2FA is configured on the server, so it can show/hide the
// 6-digit code input. Exposes no secrets — only a boolean.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ enabled: !!process.env.TOTP_SECRET });
}
