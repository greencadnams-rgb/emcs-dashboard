import { getSession, getHmrcToken } from './lib/auth.js';

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) {
    return res.status(200).json({ 
      authenticated: false, 
      hmrcAuthenticated: false 
    });
  }
  
  const hmrcToken = await getHmrcToken(session.id);
  return res.status(200).json({
    authenticated: true,
    hmrcAuthenticated: !!hmrcToken,
    sessionId: session.id
  });
}
