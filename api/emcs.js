import { getSession, getHmrcToken } from './lib/auth.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

function getBaseUrl() {
  const env = process.env.HMRC_ENVIRONMENT || 'test';
  return env === 'production'
    ? 'https://api.service.hmrc.gov.uk'
    : 'https://test-api.service.hmrc.gov.uk';
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Dashboard session expired' });
  }

  const hmrcToken = await getHmrcToken(session.id);
  if (!hmrcToken) {
    return res.status(401).json({ error: 'HMRC_NOT_AUTHENTICATED' });
  }

  const endpoint = req.query.endpoint;
  if (!endpoint) {
    return res.status(400).json({ error: 'endpoint parameter required' });
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // HMRC Spec: POST submissions expect JSON response, GET single message expects XML
  let acceptHeader = 'application/vnd.hmrc.1.0+json';
  if (req.headers['accept'] && req.headers['accept'].includes('xml')) {
    acceptHeader = 'application/vnd.hmrc.1.0+xml';
  }

  const headers = {
    'Authorization': `Bearer ${hmrcToken}`,
    'Accept': acceptHeader,
    'User-Agent': 'EMCS-Dashboard/2.0',
    'x-correlation-id': crypto.randomUUID()
  };

  // CRITICAL FIX: Safely extract the body as a string, handling Vercel Buffer parsing
  let requestBody = '';
  if (typeof req.body === 'string') {
    requestBody = req.body;
  } else if (req.body instanceof Buffer) {
    requestBody = req.body.toString('utf8');
  } else if (req.body && typeof req.body === 'object') {
    requestBody = JSON.stringify(req.body);
  }

  // Force correct Content-Type based on what the browser sent
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (req.headers['content-type'] && req.headers['content-type'].includes('xml')) {
      headers['Content-Type'] = 'application/xml';
    } else {
      headers['Content-Type'] = 'application/json';
    }
  }

  // Sandbox requirement
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  if (isTest) {
    headers['x-client-ip'] = '127.0.0.1';
  } else if (req.headers['x-client-ip']) {
    headers['x-client-ip'] = req.headers['x-client-ip'];
  }

  await logAudit(session.id, 'HMRC_API_CALL', {
    method: req.method,
    endpoint: endpoint.split('?')[0],
    hasBody: !!requestBody
  });

  try {
    const startTime = Date.now();
    const fetchOptions = { method: req.method, headers };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && requestBody) {
      fetchOptions.body = requestBody;
      
      // DEBUG LOG: Verify we are sending actual XML, not a Buffer or JSON
      if (requestBody.includes('<urn:IE815')) {
        console.log('✅ HMRC XML Request Preview:', requestBody.substring(0, 150) + '...');
      }
    }

    const hmrcRes = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const responseText = await hmrcRes.text();

    // DEBUG LOG: Capture the exact HMRC error if it's a 400
    if (hmrcRes.status === 400) {
      console.error('❌ HMRC 400 BAD REQUEST DETAILS:', responseText);
    }

    await logAudit(session.id, 'HMRC_API_RESPONSE', {
      status: hmrcRes.status,
      duration,
      endpoint: endpoint.split('?')[0]
    });

    res.status(hmrcRes.status);
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
