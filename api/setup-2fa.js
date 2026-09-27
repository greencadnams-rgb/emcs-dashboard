import { getSession } from './lib/auth.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'POST') {
    const secret = crypto.randomBytes(20).toString('hex').toUpperCase();
    const issuer = 'EMCS-Dashboard';
    const account = session.id.slice(0, 8);
    const qrCode = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
    return res.status(200).json({ secret, qrCode });
  }

  if (req.method === 'PUT') {
    const { secret, token } = req.body;
    return res.status(200).json({ 
      success: true, 
      secret,
      message: 'Add this as TOTP_SECRET in Vercel environment variables'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
