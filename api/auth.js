import { getSession, createSession, setSessionCookie, storeHmrcToken } from './lib/auth.js';
import crypto from 'crypto';

function getOAuthUrl(state) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  const scope = 'excise-movement-control-system';
  
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
    'SameSite=Lax',
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
  if (req.query.code) {
    const stateCookie = req.cookies?.emcs_oauth_state;
    const stateParam = req.query.state;
    
    if (!stateCookie || stateCookie !== stateParam) {
      return res.status(400).send('Invalid OAuth state');
    }

    try {
      const tokenData = await exchangeCode(req.query.code);
      
      let session = await getSession(req);
      if (!session) {
        session = await createSession('dashboard-user');
        await setSessionCookie(res, session);
      }
      
      await storeHmrcToken(session.id, tokenData.access_token, tokenData.expires_in || 14400);
      setCookie(res, 'emcs_oauth_state', '', 0);

      return res.redirect('/?authenticated=1');
    } catch (e) {
      console.error('HMRC OAuth Error:', e.message);
      return res.status(500).send('Authentication failed: ' + e.message);
    }
  }

  const session = await getSession(req);
  if (!session) {
    return res.redirect('/?error=not_logged_in');
  }

  const state = crypto.randomUUID();
  const url = getOAuthUrl(state);
  setCookie(res, 'emcs_oauth_state', state, 600);
  return res.redirect(url);
}
