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

  // HMRC API Spec Compliance:
  // - POST submissions (IE815, IE818, etc.) MUST expect JSON responses.
  // - GET single message MUST expect XML responses.
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

  // Forward Content-Type from browser (application/xml for movements, application/json for pre-validate)
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  } else if (req.method === 'POST' || req.method === 'PUT') {
    // Default to XML for movement submissions if not explicitly set
    headers['Content-Type'] = 'application/xml';
  }

  // HMRC sandbox strictly requires x-client-ip
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  if (isTest) {
    headers['x-client-ip'] = '127.0.0.1';
  } else if (req.headers['x-client-ip']) {
    headers['x-client-ip'] = req.headers['x-client-ip'];
  }

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

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else if (req.body && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
        headers['Content-Type'] = 'application/json';
      }
    }

    const hmrcRes = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const responseText = await hmrcRes.text();

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
