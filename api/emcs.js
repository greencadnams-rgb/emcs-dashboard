import { getSession, getHmrcToken } from './lib/auth.js';
import { logAudit } from './lib/audit.js';

function getBaseUrl() {
  const env = process.env.HMRC_ENVIRONMENT || 'test';
  return env === 'production'
    ? 'https://api.service.hmrc.gov.uk'
    : 'https://test-api.service.hmrc.gov.uk';
}

export default async function handler(req, res) {
  // Check dashboard session
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Dashboard session expired' });
  }

  // Get HMRC token from database
  const hmrcToken = await getHmrcToken(session.id);
  if (!hmrcToken) {
    return res.status(401).json({ error: 'HMRC_NOT_AUTHENTICATED' });
  }

  // Build the HMRC endpoint URL
  const endpoint = req.query.endpoint;
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint parameter required' });
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // Build headers for HMRC
  // HMRC EMCS API requires specific Accept headers
  const headers = {
    'Authorization': `Bearer ${hmrcToken}`,
    'Accept': 'application/vnd.hmrc.1.0+json',
    'User-Agent': 'EMCS-Dashboard/2.0'
  };

  // Forward specific headers from the browser
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }
  if (req.headers['x-correlation-id']) {
    headers['x-correlation-id'] = req.headers['x-correlation-id'];
  }
  
  // HMRC sandbox requires x-client-ip header
  // Always set it to 127.0.0.1 for sandbox, or use real IP in production
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  if (isTest) {
    headers['x-client-ip'] = '127.0.0.1';
  } else if (req.headers['x-client-ip']) {
    headers['x-client-ip'] = req.headers['x-client-ip'];
  }

  // Log the request (redact sensitive data)
  await logAudit(session.id, 'HMRC_API_CALL', {
    method: req.method,
    endpoint: endpoint.split('?')[0],
    hasBody: !!req.body
  });

  try {
    const startTime = Date.now();
    
    const fetchOptions = {
      method: req.method,
      headers
    };

    // Only include body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else if (req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const hmrcRes = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const responseText = await hmrcRes.text();

    // Log response (only status, not body — may contain sensitive data)
    await logAudit(session.id, 'HMRC_API_RESPONSE', {
      status: hmrcRes.status,
      duration,
      endpoint: endpoint.split('?')[0]
    });

    // Forward the response
    res.status(hmrcRes.status);
    
    // Copy relevant headers from HMRC response
    const contentType = hmrcRes.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    return res.send(responseText);
  } catch (e) {
    await logAudit(session.id, 'HMRC_NETWORK_ERROR', {
      endpoint: endpoint.split('?')[0],
      error: e.message
    });
    return res.status(502).json({ error: 'Failed to reach HMRC', details: e.message });
  }
}
