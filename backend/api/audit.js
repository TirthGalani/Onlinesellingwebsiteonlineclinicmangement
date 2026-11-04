const { reply, method, database, requireUser, text } = require('./_lib/http');

module.exports = async function handler(req, res) {
  const user = requireUser(req, res, ['management']);
  if (!user) return;
  if (!method(req, ['GET'], res)) return;
  const sql = database();
  try {
    const action = text(req.query?.action, 120) || null;
    const entityType = text(req.query?.entityType, 80) || null;
    const q = text(req.query?.q, 120) || null;
    const like = q ? `%${q}%` : null;
    const fromDate = req.query?.from ? new Date(String(req.query.from)) : null;
    const toDate = req.query?.to ? new Date(String(req.query.to)) : null;
    const fromISO = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate.toISOString() : null;
    const toISO = toDate && Number.isFinite(toDate.getTime()) ? toDate.toISOString() : null;
    const requestedLimit = Number(req.query?.limit || 100);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100, 1), 200);

    const rows = await sql`SELECT e.id, e.actor_id, u.name AS actor_name, u.role AS actor_role,
        e.action, e.entity_type, e.entity_id, e.details, e.created_at
      FROM audit_events e
      LEFT JOIN clinic_users u ON u.id = e.actor_id
      WHERE (${action}::text IS NULL OR e.action = ${action}::text)
        AND (${entityType}::text IS NULL OR e.entity_type = ${entityType}::text)
        AND (${fromISO}::timestamptz IS NULL OR e.created_at >= ${fromISO}::timestamptz)
        AND (${toISO}::timestamptz IS NULL OR e.created_at <= ${toISO}::timestamptz)
        AND (${like}::text IS NULL OR e.action ILIKE ${like} OR e.entity_id ILIKE ${like} OR u.name ILIKE ${like} OR u.email ILIKE ${like})
      ORDER BY e.created_at DESC
      LIMIT ${limit}`;
    return reply(res, 200, { events: rows });
  } catch (error) {
    console.error('Audit API error', error);
    return reply(res, 500, { error: 'Could not load the audit trail.' });
  }
};
