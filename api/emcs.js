import { getSession, getHmrcToken } from './lib/auth.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

function getBaseUrl() {
  const env = process.env.HMRC_ENVIRONMENT || 'test';
  return env === 'production' ? 'https://api.service.hmrc.gov.uk' : 'https://test-api.service.hmrc.gov.uk';
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Dashboard session expired' });

  const hmrcToken = await getHmrcToken(session.id);
  if (!hmrcToken) return res.status(401).json({ error: 'HMRC_NOT_AUTHENTICATED' });

  const endpoint = req.query.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint parameter required' });

  const url = `${getBaseUrl()}${endpoint}`;

  // Use query param ?accept=xml for reliable XML format detection
  // This is more reliable than forwarding Accept headers through Vercel
  let acceptHeader = 'application/vnd.hmrc.1.0+json';
  if (req.query.accept === 'xml' || req.headers['accept']?.includes('xml')) {
    acceptHeader = 'application/vnd.hmrc.1.0+xml';
  }

  const headers = {
    'Authorization': `Bearer ${hmrcToken}`,
    'Accept': acceptHeader,
    'User-Agent': 'EMCS-Dashboard/2.0',
    'x-correlation-id': crypto.randomUUID()
  };

  let requestBody = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (typeof req.body === 'string') {
      requestBody = req.body;
      headers['Content-Type'] = req.headers['content-type']?.includes('xml') ? 'application/xml' : 'application/json';
    } else if (req.body instanceof Buffer) {
      requestBody = req.body.toString('utf8');
      headers['Content-Type'] = 'application/xml';
    } else if (req.body && typeof req.body === 'object') {
      requestBody = JSON.stringify(req.body);
      headers['Content-Type'] = 'application/json';
    }
  }

  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  if (isTest) headers['x-client-ip'] = '127.0.0.1';
  else if (req.headers['x-client-ip']) headers['x-client-ip'] = req.headers['x-client-ip'];

  await logAudit(session.id, 'HMRC_API_CALL', { method: req.method, endpoint: endpoint.split('?')[0] });

  try {
    const startTime = Date.now();
    const fetchOptions = { method: req.method, headers };
    if (requestBody !== undefined) fetchOptions.body = requestBody;

    const hmrcRes = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const responseText = await hmrcRes.text();

    if (hmrcRes.status === 400) {
      console.error('HMRC 400 DETAILS:', responseText);
    }

    await logAudit(session.id, 'HMRC_API_RESPONSE', { status: hmrcRes.status, duration, endpoint: endpoint.split('?')[0] });

    res.status(hmrcRes.status);
    const contentType = hmrcRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    return res.send(responseText);
  } catch (e) {
    await logAudit(session.id, 'HMRC_NETWORK_ERROR', { endpoint: endpoint.split('?')[0], error: e.message });
    return res.status(502).json({ error: 'Failed to reach HMRC', details: e.message });
  }
}
