const { reply, method, database, requireUser } = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (!method(req, ['GET'], res)) return;
  const session = requireUser(req, res);
  if (!session) return;
  try {
    const sql = database();
    const rows = await sql`SELECT id, name, email, phone, role, last_login_at, created_at
      FROM clinic_users WHERE id = ${session.sub} AND role = ${session.role} AND active = true LIMIT 1`;
    if (!rows.length) return reply(res, 401, { error: 'Account is no longer available.' });
    return reply(res, 200, { user: rows[0] });
  } catch (error) {
    console.error('Session lookup failed', error);
    return reply(res, 500, { error: 'Could not load the account.' });
  }
};
