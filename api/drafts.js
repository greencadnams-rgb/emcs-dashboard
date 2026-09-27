import { getSession } from './lib/auth.js';
import { getDb, ensureSchema } from './lib/db.js';
import { logAudit } from './lib/audit.js';
import crypto from 'crypto';

await ensureSchema();

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const result = await db.execute({
        sql: 'SELECT id, name, data, created_at, modified_at FROM drafts WHERE session_id = ? ORDER BY modified_at DESC LIMIT 50',
        args: [session.id]
      });
      const drafts = result.rows.map(r => ({
        id: r.id,
        name: r.name,
        created: r.created_at,
        modified: r.modified_at,
        data: safeJsonParse(r.data)
      }));
      return res.status(200).json(drafts);
    }

    if (req.method === 'POST') {
      const { name, data, id: existingId } = req.body;
      if (!name || !data) return res.status(400).json({ error: 'Name and data required' });

      let draftId;
      const now = new Date().toISOString();
      const dataStr = JSON.stringify(data);

      if (existingId) {
        await db.execute({
          sql: 'UPDATE drafts SET name = ?, data = ?, modified_at = ? WHERE id = ? AND session_id = ?',
          args: [name, dataStr, now, existingId, session.id]
        });
        draftId = existingId;
      } else {
        draftId = crypto.randomUUID();
        await db.execute({
          sql: 'INSERT INTO drafts (id, session_id, name, data, created_at, modified_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [draftId, session.id, name, dataStr, now, now]
        });
      }

      await logAudit(session.id, 'DRAFT_SAVED', { draftId, name });
      return res.status(201).json({ id: draftId, name });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Draft ID required' });
      
      await db.execute({
        sql: 'DELETE FROM drafts WHERE id = ? AND session_id = ?',
        args: [id, session.id]
      });
      
      await logAudit(session.id, 'DRAFT_DELETED', { draftId: id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Drafts error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}

function safeJsonParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch {
    return {};
  }
}
