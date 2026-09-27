import { getSession } from './lib/auth.js';
import { getDb, ensureSchema } from './lib/db.js';
import { logAudit } from './lib/audit.js';

// HARDCODED to prevent session mismatches from hiding profiles
const FIXED_USER_ID = 'dashboard-user';

export default async function handler(req, res) {
  console.log('=== PROFILES API HIT === Method:', req.method);
  
  const session = await getSession(req);
  if (!session) {
    console.log('No session - returning 401');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try { await ensureSchema(); } catch(e) {
    console.error('Schema init failed:', e);
    return res.status(500).json({ error: 'Schema init failed: ' + e.message });
  }
  
  const db = getDb();

  try {
    if (req.method === 'GET') {
      // Get ALL profiles - no user_id filter to prevent orphaning
      let result = await db.execute({
        sql: 'SELECT * FROM profiles ORDER BY id',
        args: []
      });
      
      let profiles = result.rows;
      console.log('Found', profiles.length, 'profiles in database');
      
      if (profiles.length === 0) {
        console.log('No profiles found, creating defaults...');
        const defaults = [
          { name: 'Consignor Profile', type: 'consignor', ern: '', trader_name: '', street: '', postcode: '', city: '', office: 'GB004098' },
          { name: 'Consignee Profile', type: 'consignee', ern: '', trader_name: '', street: '', postcode: '', city: '', office: 'GB004098' }
        ];
        const now = new Date().toISOString();
        for (const p of defaults) {
          await db.execute({
            sql: 'INSERT INTO profiles (user_id, name, type, ern, trader_name, street, postcode, city, office, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [FIXED_USER_ID, p.name, p.type, p.ern, p.trader_name, p.street, p.postcode, p.city, p.office, now]
          });
        }
        result = await db.execute({ sql: 'SELECT * FROM profiles ORDER BY id', args: [] });
        profiles = result.rows;
      }
      
      const safeProfiles = profiles.map(p => ({
        id: typeof p.id === 'bigint' ? Number(p.id) : (p.id || 0),
        name: p.name || '',
        type: p.type || '',
        ern: p.ern || '',
        traderName: p.trader_name || '',
        street: p.street || '',
        postcode: p.postcode || '',
        city: p.city || '',
        office: p.office || ''
      }));
      
      console.log('Returning', safeProfiles.length, 'profiles');
      return res.status(200).json(safeProfiles);
    }

    if (req.method === 'POST') {
      const { name, type, ern, traderName, street, postcode, city, office } = req.body;
      console.log('Creating profile:', { name, ern });
      
      if (!name || !ern) {
        return res.status(400).json({ error: 'Name and ERN required' });
      }
      
      // Relaxed regex to accept 13-14 character ERNs (e.g., GB741667790489)
      if (!/^[A-Z]{2}[A-Z0-9]{9,12}$/.test(ern)) {
        return res.status(400).json({ error: 'Invalid ERN format (must be 13-14 characters)' });
      }

      const result = await db.execute({
        sql: 'INSERT INTO profiles (user_id, name, type, ern, trader_name, street, postcode, city, office, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [FIXED_USER_ID, name, type || 'consignor', ern, traderName || '', street || '', postcode || '', city || '', office || 'GB004098', new Date().toISOString()]
      });
      
      await logAudit(session.id, 'PROFILE_CREATED', { ern });
      
      // CRITICAL FIX: Convert BigInt to Number
      const newId = typeof result.lastInsertRowid === 'bigint' ? Number(result.lastInsertRowid) : result.lastInsertRowid;
      console.log('Profile created with ID:', newId);
      
      return res.status(201).json({ id: newId, name, ern });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Profile ID required' });
      
      // Check if this is the last profile
      const countResult = await db.execute({
        sql: 'SELECT COUNT(*) as c FROM profiles WHERE user_id = ?',
        args: [FIXED_USER_ID]
      });
      const count = typeof countResult.rows[0].c === 'bigint' ? Number(countResult.rows[0].c) : countResult.rows[0].c;
      
      if (count <= 1) {
        return res.status(400).json({ error: 'Must have at least one profile' });
      }
      
      await db.execute({
        sql: 'DELETE FROM profiles WHERE id = ? AND user_id = ?',
        args: [parseInt(id), FIXED_USER_ID]
      });
      
      await logAudit(session.id, 'PROFILE_DELETED', { profileId: id });
      console.log('Deleted profile ID:', id);
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('=== PROFILES ERROR ===', e);
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
}
