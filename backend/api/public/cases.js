// Public before/after smile cases.
// A case is only served when it is published, both photographs exist and a written
// consent date is recorded, so the website cannot accidentally show an image the
// patient has not approved.
const { reply, method, database, clientIp, text } = require('../_lib/http');
const { rateLimited, lookupLimit } = require('../_lib/public');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (!method(req, ['GET'], res)) return;
  const sql = database();

  if (rateLimited(`cases:${clientIp(req)}`, lookupLimit(), 60 * 1000)) {
    return reply(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
  }

  try {
    const id = text(req.query?.id, 64);
    const view = text(req.query?.view, 10) === 'after' ? 'after' : 'before';

    if (id) {
      if (!ID_RE.test(id)) return reply(res, 400, { error: 'Provide a valid case id.' });
      const column = view === 'after' ? 'after_data' : 'before_data';
      const typeColumn = view === 'after' ? 'after_type' : 'before_type';
      const rows = await sql`SELECT encode(before_data, 'base64') AS before_data, encode(after_data, 'base64') AS after_data,
          before_type, after_type
        FROM smile_cases
        WHERE id = ${id} AND published = true AND consent_confirmed_at IS NOT NULL LIMIT 1`;
      const record = rows[0];
      const data = record ? record[column] : null;
      const contentType = record ? record[typeColumn] : null;
      if (!data || !IMAGE_TYPES.includes(contentType)) return reply(res, 404, { error: 'Photograph not available.' });

      const buffer = Buffer.from(data, 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `inline; filename="smile-${view}.jpg"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      return res.end(buffer);
    }

    const limit = Math.min(24, Math.max(1, Number(req.query?.limit) || 12));
    const rows = await sql`SELECT c.id, c.title, c.treatment, c.summary, c.consent_confirmed_at, c.created_at,
        (c.before_data IS NOT NULL) AS has_before, (c.after_data IS NOT NULL) AS has_after,
        u.name AS clinician
      FROM smile_cases c
      LEFT JOIN clinic_users u ON u.id = c.clinician_id
      WHERE c.published = true AND c.consent_confirmed_at IS NOT NULL
        AND c.before_data IS NOT NULL AND c.after_data IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT ${limit}`;

    return reply(res, 200, {
      cases: rows.map(row => ({
        id: row.id,
        title: row.title,
        treatment: row.treatment,
        summary: row.summary,
        clinician: row.clinician || 'Our clinical team',
        consentConfirmedAt: row.consent_confirmed_at,
        date: row.created_at,
        beforeUrl: `/api/public/cases?id=${encodeURIComponent(row.id)}&view=before`,
        afterUrl: `/api/public/cases?id=${encodeURIComponent(row.id)}&view=after`
      }))
    });
  } catch (error) {
    console.error('Public smile cases error', error);
    return reply(res, 500, { error: 'Smile cases could not be loaded right now.' });
  }
};
