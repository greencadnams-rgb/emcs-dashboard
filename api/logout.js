import { getSession, destroySession, clearHmrcToken } from './lib/auth.js';
import { logAudit } from './lib/audit.js';

export default async function handler(req, res) {
  const session = await getSession(req);
  
  if (session) {
    await logAudit(session.id, 'LOGOUT', {});
    await clearHmrcToken(session.id);
  }
  
  await destroySession(req, res);
  return res.status(200).json({ success: true });
}
