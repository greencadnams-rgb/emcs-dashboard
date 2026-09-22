import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export default async function handler(req, res) {
  // Must be logged in with password first
  const cookies = req.headers.cookie || '';
  if (!cookies.includes('app_auth=authenticated')) {
    return res.status(401).json({ error: "Login with password first" });
  }

  if (req.method === 'POST') {
    // Generate a new TOTP secret
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri('EMCS-Dashboard', 'HMRC-EMCS', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    res.json({
      secret: secret,
      qrCode: qrCode,
      message: "Scan this QR code with your authenticator app, then enter the 6-digit code to verify."
    });

  } else if (req.method === 'PUT') {
    // Verify the code the user entered
    const { secret, token } = req.body;

    const isValid = authenticator.verify({
      token: token,
      secret: secret
    });

    if (isValid) {
      res.json({
        success: true,
        message: "2FA verified successfully!",
        secret: secret
      });
    } else {
      res.status(400).json({ error: "Invalid code. Please try again." });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
