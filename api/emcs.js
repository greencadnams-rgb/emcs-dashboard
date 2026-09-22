export default async function handler(req, res) {
  // Check that user is logged in to HMRC
  const cookies = req.headers.cookie || '';
  const tokenMatch = cookies.match(/hmrc_token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return res.status(401).json({ error: "Not logged in to HMRC. Click 'Login to HMRC' first." });
  }

  // Collect Fraud Prevention data from the frontend
  const clientIp = req.headers['x-client-ip'] || '127.0.0.1';
  const userAgent = req.headers['x-client-ua'] || 'Unknown';
  const deviceId = req.headers['x-device-id'] || 'unknown';
  const fingerprint = req.headers['x-fingerprint'] || 'unknown';
  const timezone = req.headers['x-timezone'] || 'Europe/London';
  const windowWidth = req.headers['x-window-width'] || '1920';
  const windowHeight = req.headers['x-window-height'] || '1080';

  // Build the HMRC API URL
  const endpoint = req.query.endpoint || '/customs/excise/movements';
  const url = `https://test-api.service.hmrc.gov.uk${endpoint}`;

  // Build headers including Fraud Prevention Headers
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': req.headers['accept'] || 'application/vnd.hmrc.1.0+json',
    // --- Fraud Prevention Headers (Required for Production) ---
    'CLIENT_PUBLIC_IP': clientIp,
    'USER_AGENT': userAgent,
    'DEVICE_ID': deviceId,
    'DEVICE_FINGERPRINT': fingerprint,
    'CLIENT_TIMEZONE': timezone,
    'WINDOW_WIDTH': String(windowWidth),
    'WINDOW_HEIGHT': String(windowHeight),
    'MULTI_FACTOR': 'true',
    'VENDOR_ID': 'emcs-dashboard-v1'
  };

  // Add Content-Type for POST/PUT requests
  if (req.method === 'POST' || req.method === 'PUT') {
    headers['Content-Type'] = req.headers['content-type'] || 'application/xml';
  }

  // Add x-correlation-id for pre-validate endpoint
  if (endpoint.includes('pre-validate')) {
    headers['x-correlation-id'] = req.headers['x-correlation-id'] || crypto.randomUUID();
  }

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined
    });

    const data = await response.text();
    res.status(response.status).send(data);

  } catch (error) {
    console.error('HMRC API Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
