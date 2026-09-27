import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;
  const expectedPassword = process.env.APP_PASSWORD;

  if (!expectedPassword) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  if (password !== expectedPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const secret = crypto.randomBytes(20).toString('hex').toUpperCase();
  const issuer = 'EMCS-Dashboard';
  const account = 'admin';
  const qrCode = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}`;
  
  return res.status(200).json({ 
    secret, 
    qrCode,
    message: 'Add this secret as TOTP_SECRET in your Vercel environment variables.'
  });
}
