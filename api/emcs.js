// api/emcs.js
export default async function handler(req, res) {
  const endpoint = req.query.endpoint;
  
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint parameter' });
  }

  // Get auth token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: No Bearer token' });
  }

  // Determine content type from incoming request
  const contentType = req.headers['content-type'] || 'application/xml';
  
  // Read raw body to preserve exact JSON structure
  let body = '';
  if (req.method === 'POST' || req.method === 'PUT') {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  console.log(`[EMCS Proxy] ${req.method} ${endpoint}`);
  console.log(`[EMCS Proxy] Content-Type: ${contentType}`);
  console.log(`[EMCS Proxy] Body Length: ${body.length}`);

  try {
    const response = await fetch(`https://test-api.service.hmrc.gov.uk${endpoint}`, {
      method: req.method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': contentType,
        'Accept': 'application/json',
        'User-Agent': 'EMCS-Dashboard/1.0'
      },
      body: body.length > 0 ? body : undefined
    });

    const responseBody = await response.text();
    
    // Forward HMRC's status and content-type exactly
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status).send(responseBody);

  } catch (error) {
    console.error('[EMCS Proxy] Fetch Error:', error);
    res.status(500).json({ 
      error: { 
        code: '500', 
        message: 'Proxy fetch failed: ' + error.message 
      } 
    });
  }
}
