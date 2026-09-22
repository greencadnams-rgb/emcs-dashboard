import crypto from 'crypto';

// Tell Vercel NOT to parse the body automatically
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to read raw body from request
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

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
    return res.status(401).json({ error: "Not logged in to HMRC." });
  }

  // 2. Read the raw body (CRITICAL FIX)
  let rawBody = '';
  if (req.method === 'POST' || req.method === 'PUT') {
    rawBody = await getRawBody(req);
    console.log('Raw body length:', rawBody.length);
    console.log('Raw body preview:', rawBody.substring(0, 300));
  }

  // 3. Build HMRC headers
  const endpoint = req.query.endpoint || '/customs/excise/movements';
  const url = `https://test-api.service.hmrc.gov.uk${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': req.headers['accept'] || 'application/vnd.hmrc.1.0+json',
    'CLIENT_PUBLIC_IP': req.headers['x-client-ip'] || '127.0.0.1',
    'USER_AGENT': req.headers['x-client-ua'] || 'Unknown',
    'DEVICE_ID': req.headers['x-device-id'] || 'unknown',
    'DEVICE_FINGERPRINT': req.headers['x-fingerprint'] || 'unknown',
    'CLIENT_TIMEZONE': req.headers['x-timezone'] || 'Europe/London',
    'WINDOW_WIDTH': String(req.headers['x-window-width'] || '1920'),
    'WINDOW_HEIGHT': String(req.headers['x-window-height'] || '1080'),
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
    console.log('Forwarding to HMRC:', url);
    
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? rawBody : undefined
    });

    const responseData = await response.text();
    console.log('HMRC Response Status:', response.status);
    
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status).send(responseData);
    
  } catch (error) {
    console.error('HMRC API Error:', error);
    res.status(500).json({ error: error.message });
  }
}
