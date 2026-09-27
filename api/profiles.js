import { getSession } from './lib/auth.js';
import { getDb, ensureSchema } from './lib/db.js';
import { logAudit } from './lib/audit.js';

let schemaReady = false;
async function initSchema() {
  if (schemaReady) return;
  await ensureSchema();
  schemaReady = true;
}

export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  await initSchema();
  const db = getDb();
  const userId = session.userId;

  try {
    if (req.method === 'GET') {
      let result = await db.execute({
        sql: 'SELECT * FROM profiles WHERE user_id = ? ORDER BY id',
        args: [userId]
      });
      
      let profiles = result.rows;
      
      if (profiles.length === 0) {
        const defaults = [
          { name: 'Consignor Profile', type: 'consignor', ern: '', trader_name: '', street: '', postcode: '', city: '', office: 'GB004098' },
          { name: 'Consignee Profile', type: 'consignee', ern: '', trader_name: '', street: '', postcode: '', city: '', office: 'GB004098' }
        ];
        const now = new Date().toISOString();
        for (const p of defaults) {
          await db.execute({
            sql: 'INSERT INTO profiles (user_id, name, type, ern, trader_name, street, postcode, city, office, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [userId, p.name, p.type, p.ern, p.trader_name, p.street, p.postcode, p.city, p.office, now]
          });
        }
        result = await db.execute({
          sql: 'SELECT * FROM profiles WHERE user_id = ? ORDER BY id',
          args: [userId]
        });
        profiles = result.rows;
      }
      
      return res.status(200).json(profiles.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        ern: p.ern,
        traderName: p.trader_name,
        street: p.street,
        postcode: p.postcode,
        city: p.city,
        office: p.office
      })));
    }

    if (req.method === 'POST') {
      const { name, type, ern, traderName, street, postcode, city, office } = req.body;
      if (!name || !ern) return res.status(400).json({ error: 'Name and ERN required' });
      if (!/^[A-Z]{2}[A-Z0-9]{11}$/.test(ern)) return res.status(400).json({ error: 'Invalid ERN format' });

      const result = await db.execute({
        sql: 'INSERT INTO profiles (user_id, name, type, ern, trader_name, street, postcode, city, office, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [userId, name, type || 'consignor', ern, traderName || '', street || '', postcode || '', city || '', office || 'GB004098', new Date().toISOString()]
      });
      
      await logAudit(session.id, 'PROFILE_CREATED', { ern });
      return res.status(201).json({ id: result.lastInsertRowid, name, ern });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Profile ID required' });
      
      const countResult = await db.execute({
        sql: 'SELECT COUNT(*) as c FROM profiles WHERE user_id = ?',
        args: [userId]
      });
      if (countResult.rows[0].c <= 1) {
        return res.status(400).json({ error: 'Must have at least one profile' });
      }
      
      await db.execute({
        sql: 'DELETE FROM profiles WHERE id = ? AND user_id = ?',
        args: [parseInt(id), userId]
      });
      
      await logAudit(session.id, 'PROFILE_DELETED', { profileId: id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Profiles error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
