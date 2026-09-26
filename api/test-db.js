import { getDb, ensureSchema } from './lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const db = getDb();
    const result = await db.execute('SELECT 1 as test');
    return res.status(200).json({ 
      success: true, 
      message: 'Turso database connected successfully!',
      result: result.rows 
    });
  } catch (e) {
    return res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
}
