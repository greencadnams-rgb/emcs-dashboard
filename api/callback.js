import crypto from 'crypto';

export default async function handler(req, res) {
  // HMRC sends a GET request with ?challenge=xxx to verify your URL
  if (req.method === 'GET' && req.query.challenge) {
    console.log('HMRC Challenge received:', req.query.challenge);
    return res.status(200).json({ challenge: req.query.challenge });
  }

  // Handle incoming push notifications from HMRC
  if (req.method === 'POST') {
    const isValid = verifyPushSignature(req);

    if (isValid) {
      const notification = req.body;
      console.log('Push Notification received:', JSON.stringify(notification));

      // IMPORTANT: Return 200 immediately or HMRC will retry and mark as FAILED
      return res.status(200).json({ received: true });
    } else {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}

function verifyPushSignature(req) {
  const pushSecret = process.env.HMRC_PUSH_SECRET;
  const signature = req.headers['x-hub-signature'];

  // In Sandbox, skip verification if no secret is set
  if (!pushSecret || pushSecret === 'sandbox-push-secret-placeholder') return true;
  if (!signature) return false;

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha1', pushSecret)
    .update(payload)
    .digest('hex');

  return signature === `sha1=${expectedSignature}`;
}
