import crypto from 'crypto';

export default async function handler(req, res) {
  console.log('--- API EMCS CALLED ---');
  console.log('Method:', req.method);
  console.log('Endpoint:', req.query.endpoint);

  // 1. Check Authentication
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  if (!token) {
    console.error('❌ No token found in Authorization header');
    return res.status(401).json({ error: "Not logged in to HMRC. Click 'Login to HMRC' first." });
  }

  // 2. Collect Fraud Prevention Headers
  const clientIp = req.headers['x-client-ip'] || '127.0.0.1';
  const userAgent = req.headers['x-client-ua'] || 'Unknown';
  const deviceId = req.headers['x-device-id'] || 'unknown';
  const fingerprint = req.headers['x-fingerprint'] || 'unknown';
  const timezone = req.headers['x-timezone'] || 'Europe/London';
  const windowWidth = req.headers['x-window-width'] || '1920';
  const windowHeight = req.headers['x-window-height'] || '1080';

  const endpoint = req.query.endpoint || '/customs/excise/movements';
  const url = `https://test-api.service.hmrc.gov.uk${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.hmrc.1.0+json',
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
    headers['Content-Type'] = 'application/xml';
  }

  if (endpoint.includes('pre-validate')) {
    headers['x-correlation-id'] = req.headers['x-correlation-id'] || crypto.randomUUID();
    headers['Content-Type'] = 'application/json';
    headers['Accept'] = 'application/json';
  }

  try {
    // 3. FOOLPROOF BODY PARSING FOR VERCEL
    let rawBody = req.body;
    
    if (rawBody === undefined || rawBody === null) {
      console.error('❌ Request body is completely empty!');
      return res.status(400).json({ error: 'Request body is empty. Check frontend fetch call.' });
    }

    if (Buffer.isBuffer(rawBody)) {
      rawBody = rawBody.toString('utf8');
    } else if (rawBody && typeof rawBody.on === 'function') {
      // It's a stream
      rawBody = await new Promise((resolve, reject) => {
        let data = '';
        rawBody.on('data', chunk => data += chunk);
        rawBody.on('end', () => resolve(data));
        rawBody.on('error', reject);
      });
    } else if (typeof rawBody === 'object') {
      rawBody = JSON.stringify(rawBody);
    } else if (typeof rawBody !== 'string') {
      rawBody = String(rawBody);
    }

    console.log('✅ Final rawBody length:', rawBody.length);
    console.log('✅ Final rawBody preview:', rawBody.substring(0, 300) + '...');

    // 4. Forward the request to HMRC
    console.log('🚀 Forwarding to HMRC:', url);
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? rawBody : undefined
    });

    const responseData = await response.text();
    console.log('📥 HMRC Response Status:', response.status);
    console.log('📥 HMRC Response Body:', responseData);

    const contentType = response.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    res.status(response.status).send(responseData);
    
  } catch (error) {
    console.error('❌ HMRC API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
