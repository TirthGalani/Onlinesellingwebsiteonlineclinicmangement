const { neon } = require('@neondatabase/serverless');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) return res.status(503).json({ error: 'API not configured. Set DATABASE_URL and JWT_SECRET in Vercel.' });
  const auth = req.headers.authorization || '';
  let user;
  try { user = jwt.verify(auth.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Sign in required' }); }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS appointments (id text PRIMARY KEY, patient_id text NOT NULL, patient_name text NOT NULL, service text NOT NULL, dentist text NOT NULL, appointment_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'requested', notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`;
    if (req.method === 'GET') {
      const rows = user.role === 'management' || user.role === 'doctor'
        ? await sql`SELECT * FROM appointments ORDER BY appointment_at`
        : await sql`SELECT * FROM appointments WHERE patient_id = ${user.sub} ORDER BY appointment_at`;
      return res.status(200).json({ appointments: rows });
    }
    if (req.method === 'POST') {
      const { service, dentist, date, notes = '' } = req.body || {};
      const when = new Date(date);
      if (!service || !dentist || !Number.isFinite(when.getTime()) || when <= new Date()) return res.status(400).json({ error: 'Provide a service, dentist, and future date.' });
      const conflict = await sql`SELECT id FROM appointments WHERE dentist = ${dentist} AND appointment_at = ${when.toISOString()} AND status <> 'cancelled' LIMIT 1`;
      if (conflict.length) return res.status(409).json({ error: 'That appointment time is no longer available.' });
      const id = crypto.randomUUID();
      const rows = await sql`INSERT INTO appointments (id, patient_id, patient_name, service, dentist, appointment_at, notes) VALUES (${id}, ${user.sub}, ${user.name}, ${service}, ${dentist}, ${when.toISOString()}, ${String(notes).slice(0, 2000)}) RETURNING *`;
      return res.status(201).json({ appointment: rows[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Appointment API error', error);
    return res.status(500).json({ error: 'Could not process appointment request.' });
  }
};
