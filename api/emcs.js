import crypto from 'crypto';

export default async function handler(req, res) {
  console.log('--- API EMCS CALLED ---');
  console.log('Method:', req.method);
  console.log('Endpoint:', req.query.endpoint);

  // 1. Check Authentication from the Authorization Header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  if (!token) {
    console.log('No token found');
    return res.status(401).json({ error: "Not logged in to HMRC. Click 'Login to HMRC' first." });
  }

  // 2. Collect Fraud Prevention Headers from the frontend
  const clientIp = req.headers['x-client-ip'] || '127.0.0.1';
  const userAgent = req.headers['x-client-ua'] || 'Unknown';
  const deviceId = req.headers['x-device-id'] || 'unknown';
  const fingerprint = req.headers['x-fingerprint'] || 'unknown';
  const timezone = req.headers['x-timezone'] || 'Europe/London';
  const windowWidth = req.headers['x-window-width'] || '1920';
  const windowHeight = req.headers['x-window-height'] || '1080';

  const endpoint = req.query.endpoint || '/customs/excise/movements';
  const url = `https://test-api.service.hmrc.gov.uk${endpoint}`;
  
  // 3. Build the headers for HMRC
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': req.headers['accept']?.includes('xml') ? 'application/vnd.hmrc.1.0+xml' : 'application/vnd.hmrc.1.0+json',
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

  if (req.method === 'POST' || req.method === 'PUT') {
    headers['Content-Type'] = req.headers['content-type'] || 'application/xml';
  }

  if (endpoint.includes('pre-validate')) {
    headers['x-correlation-id'] = req.headers['x-correlation-id'] || crypto.randomUUID();
  }

  try {
    // 4. Read the raw body stream for application/xml (Critical for Vercel)
    let rawBody = req.body;
    if (rawBody && typeof rawBody.on === 'function') {
      rawBody = await new Promise((resolve, reject) => {
        let data = '';
        rawBody.on('data', chunk => data += chunk);
        rawBody.on('end', () => {
          console.log('Raw body received, length:', data.length);
          resolve(data);
        });
        rawBody.on('error', reject);
      });
    } else if (typeof rawBody === 'string') {
      console.log('Raw body is string, length:', rawBody.length);
    }

    console.log('Forwarding to HMRC:', url);

    // 5. Forward the request to HMRC
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? rawBody : undefined
    });

    const data = await response.text();
    console.log('HMRC Response Status:', response.status);
    console.log('HMRC Response Body:', data);

    // Force the correct Content-Type so the browser doesn't show it as HTML
    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.status(response.status).send(data);
    
  } catch (error) {
    console.error('HMRC API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
