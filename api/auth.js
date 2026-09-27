import { getSession, createSession, setSessionCookie, storeHmrcToken } from './lib/auth.js';
import crypto from 'crypto';

function getOAuthUrl(state) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  
  // The exact scope from your working code
  const scope = 'excise-movement-control-system';
  
  // HMRC uses a different domain for the OAuth UI than the API
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  const baseUrl = isTest 
    ? 'https://test-www.tax.service.gov.uk' 
    : 'https://www.tax.service.gov.uk';
    
  return `${baseUrl}/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

async function exchangeCode(code) {
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  const baseUrl = isTest 
    ? 'https://test-api.service.hmrc.gov.uk' 
    : 'https://api.service.hmrc.gov.uk';
    
  try {
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
      console.error('OAuth token exchange failed:', res.status, text);
      throw new Error('OAuth token exchange failed: ' + text);
    }
    
    return await res.json();
  } catch (e) {
    console.error('OAuth exchange error:', e);
    throw e;
  }
}

function setCookie(res, name, value, maxAgeSec) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax', // Lax is required for OAuth redirects
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
  try {
    // OAuth callback - HMRC sent us back with a code
    if (req.query.code) {
      const stateCookie = req.cookies?.emcs_oauth_state;
      const stateParam = req.query.state;
      
      if (!stateCookie || stateCookie !== stateParam) {
        console.error('OAuth state mismatch. Cookie:', stateCookie, 'Param:', stateParam);
        return res.status(400).send('Invalid OAuth state. Please try logging in again.');
      }

      const tokenData = await exchangeCode(req.query.code);
      
      // Get or create dashboard session
      let session = await getSession(req);
      if (!session) {
        session = await createSession('dashboard-user');
        await setSessionCookie(res, session);
      }
      
      // Store HMRC token in Turso (server-side, not in browser!)
      await storeHmrcToken(session.id, tokenData.access_token, tokenData.expires_in || 14400);

      // Clear state cookie
      setCookie(res, 'emcs_oauth_state', '', 0);

      // Redirect to dashboard
      return res.redirect('/?authenticated=1');
    }

    // Start OAuth flow
    const session = await getSession(req);
    if (!session) {
      return res.redirect('/?error=not_logged_in');
    }

    const state = crypto.randomUUID();
    const url = getOAuthUrl(state);

    // Store state in cookie for validation (10 minutes)
    setCookie(res, 'emcs_oauth_state', state, 600);
    return res.redirect(url);
  } catch (e) {
    console.error('Auth handler error:', e);
    return res.status(500).send('Authentication failed: ' + e.message);
  }
}
