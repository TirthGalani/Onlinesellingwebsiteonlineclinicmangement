const { reply, method, database, requireUser, guardMutation, audit } = require('./_lib/http');

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'PATCH', 'DELETE'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT n.id, n.title, n.body AS message, n.notification_type AS type, n.read_at, n.created_at,
          n.link_url, n.delivery_summary,
          COALESCE(json_agg(json_build_object(
            'channel', d.channel, 'status', d.status, 'provider', d.provider,
            'error', d.error, 'updated_at', d.updated_at
          )) FILTER (WHERE d.id IS NOT NULL), '[]') AS deliveries
        FROM user_notifications n
        LEFT JOIN notification_deliveries d ON d.notification_id = n.id
        WHERE n.user_id = ${user.sub}
        GROUP BY n.id
        ORDER BY n.created_at DESC
        LIMIT 100`;
      return reply(res, 200, { notifications: rows });
    }

    const id = String(req.body?.id || req.query?.id || '');
    if (req.method === 'DELETE') {
      if (id) {
        const deleted = await sql`DELETE FROM user_notifications WHERE id = ${id} AND user_id = ${user.sub} RETURNING id`;
        if (!deleted.length) return reply(res, 404, { error: 'Notification not found.' });
      } else {
        await sql`DELETE FROM user_notifications WHERE user_id = ${user.sub}`;
      }
      await audit(sql, user.sub, 'notifications.dismissed', 'notification', id || 'all');
      return reply(res, 200, { ok: true });
    }

    if (id) {
      const rows = await sql`UPDATE user_notifications SET read_at = now() WHERE id = ${id} AND user_id = ${user.sub} RETURNING id`;
      if (!rows.length) return reply(res, 404, { error: 'Notification not found.' });
    } else {
      await sql`UPDATE user_notifications SET read_at = now() WHERE user_id = ${user.sub} AND read_at IS NULL`;
    }
    await audit(sql, user.sub, 'notifications.read', 'notification', id || 'all');
    return reply(res, 200, { ok: true });
  } catch (error) {
    console.error('Notification API error', error);
    return reply(res, 500, { error: 'Could not update notifications.' });
  }
};
