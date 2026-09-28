import { getSession } from './lib/auth.js';
import { getDb, ensureSchema } from './lib/db.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  try { await ensureSchema(); } catch(e) {
    return res.status(500).json({ error: 'Schema init failed: ' + e.message });
  }
  
  const db = getDb();
  const userId = 'dashboard-user';

  try {
    if (req.method === 'GET') {
      const result = await db.execute({
        sql: 'SELECT * FROM templates WHERE user_id = ? ORDER BY name',
        args: [userId]
      });
      const templates = result.rows.map(t => ({
        id: t.id,
        name: t.name,
        data: safeJsonParse(t.data),
        created: t.created_at
      }));
      console.log('Returning', templates.length, 'templates');
      return res.status(200).json(templates);
    }

    if (req.method === 'POST') {
      const { name, data } = req.body;
      if (!name || !data) return res.status(400).json({ error: 'Name and data required' });

      const id = crypto.randomUUID();
      await db.execute({
        sql: 'INSERT INTO templates (id, user_id, name, data, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [id, userId, name, JSON.stringify(data), new Date().toISOString()]
      });
      
      await logAudit(session.id, 'TEMPLATE_CREATED', { name });
      console.log('Template created:', name, 'ID:', id);
      return res.status(201).json({ id, name });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Template ID required' });
      
      await db.execute({
        sql: 'DELETE FROM templates WHERE id = ? AND user_id = ?',
        args: [id, userId]
      });
      await logAudit(session.id, 'TEMPLATE_DELETED', { id });
      console.log('Template deleted:', id);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Templates error:', e);
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
}

function safeJsonParse(str) {
  try { return typeof str === 'string' ? JSON.parse(str) : str; }
  catch { return {}; }
}
