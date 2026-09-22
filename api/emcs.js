export default async function handler(req, res) {
  // Get token from Authorization header (sent by frontend)
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  console.log('=== EMCS API CALL ===');
  console.log('Token present:', !!token);
  console.log('Endpoint:', req.query.endpoint);

  if (!token) {
    console.error('No token provided');
    return res.status(401).json({ error: "Not logged in to HMRC. Click 'Login to HMRC' first." });
  }

  // Get fraud prevention data
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
    'Accept': req.headers['accept'] || 'application/vnd.hmrc.1.0+json',
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
    console.log('Calling HMRC:', url);
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined
    });

    const data = await response.text();
    console.log('HMRC response status:', response.status);
    res.status(response.status).send(data);
  } catch (error) {
    console.error('HMRC API error:', error);
    res.status(500).json({ error: error.message });
  }
}
