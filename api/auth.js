import { getSession, createSession, setSessionCookie, storeHmrcToken } from './lib/auth.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

function getBaseUrl() {
  const env = process.env.HMRC_ENVIRONMENT || 'test';
  return env === 'production'
    ? 'https://api.service.hmrc.gov.uk'
    : 'https://test-api.service.hmrc.gov.uk';
}

function getOAuthUrl(state) {
  const baseUrl = getBaseUrl();
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  const scope = 'read:excise-movements write:excise-movements';
  return `${baseUrl}/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

async function exchangeCode(code) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      client_id: process.env.HMRC_CLIENT_ID,
      client_secret: process.env.HMRC_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.HMRC_REDIRECT_URI
    })
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error('OAuth token exchange failed: ' + text);
  }
  
  return await res.json();
}

function setCookie(res, name, value, maxAgeSec) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Strict',
    'HttpOnly',
    'Secure',
    `Max-Age=${maxAgeSec}`
  ];
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : [existing];
  arr.push(attrs.join('; '));
  res.setHeader('Set-Cookie', arr);
}

export default async function handler(req, res) {
  // OAuth callback - HMRC sent us back with a code
  if (req.query.code) {
    const stateCookie = req.cookies?.emcs_oauth_state;
    const stateParam = req.query.state;
    
    if (!stateCookie || stateCookie !== stateParam) {
      await logAudit(null, 'OAUTH_FAILED', { reason: 'invalid_state' });
      return res.status(400).send('Invalid OAuth state. Please try logging in again.');
    }

    try {
      const tokenData = await exchangeCode(req.query.code);
      
      // Get or create dashboard session
      let session = await getSession(req);
      if (!session) {
        session = await createSession('dashboard-user');
        await setSessionCookie(res, session);
      }
      
      // Store HMRC token in Turso (server-side, not in browser!)
      await storeHmrcToken(session.id, tokenData.access_token, tokenData.expires_in || 14400);
      
      await logAudit(session.id, 'HMRC_LOGIN_SUCCESS', { 
        expiresIn: tokenData.expires_in 
      });

      // Clear state cookie
      setCookie(res, 'emcs_oauth_state', '', 0);

      // Redirect to dashboard
      return res.redirect('/?authenticated=1');
    } catch (e) {
      await logAudit(null, 'HMRC_LOGIN_FAILED', { error: e.message });
      return res.status(500).send('HMRC authentication failed: ' + e.message);
    }
  }

  // Start OAuth flow
  const session = await getSession(req);
  if (!session) {
    return res.redirect('/?error=not_logged_in');
  }

  const state = crypto.randomUUID();
  const url = getOAuthUrl(state);

  // Store state in cookie for validation
  setCookie(res, 'emcs_oauth_state', state, 600);
  return res.redirect(url);
}
