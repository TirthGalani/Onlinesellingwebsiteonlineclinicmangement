// Public review feed for the clinic website.
// Only reviews written by signed-in patients after a completed visit exist in
// patient_reviews, so every row here is a verified visit. Names are reduced to
// "First L." unless the clinic explicitly opts into full names.
const { reply, method, database, clientIp, text } = require('../_lib/http');
const { rateLimited, lookupLimit, maskedAuthor } = require('../_lib/public');

module.exports = async function handler(req, res) {
  if (!method(req, ['GET'], res)) return;
  const sql = database();

  if (rateLimited(`reviews:${clientIp(req)}`, lookupLimit(), 60 * 1000)) {
    return reply(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
  }

  try {
    const limit = Math.min(24, Math.max(1, Number(req.query?.limit) || 12));
    const showFullNames = String(process.env.PUBLIC_REVIEWS_NAMES || 'masked').toLowerCase() === 'full';

    const rows = await sql`SELECT r.id, r.rating, r.title, r.content, r.created_at, u.name AS author, a.service
      FROM patient_reviews r
      JOIN clinic_users u ON u.id = r.patient_id
      JOIN appointments a ON a.id = r.appointment_id
      WHERE r.visibility = 'published'
      ORDER BY r.created_at DESC
      LIMIT ${limit}`;

    const totals = await sql`SELECT count(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(4,2) AS average
      FROM patient_reviews WHERE visibility = 'published'`;

    return reply(res, 200, {
      reviews: rows.map(row => ({
        id: row.id,
        rating: Number(row.rating),
        title: row.title,
        content: row.content,
        author: showFullNames ? row.author : maskedAuthor(row.author),
        service: row.service,
        verified: true,
        date: row.created_at
      })),
      summary: {
        average: Number(Number(totals[0]?.average || 0)).toFixed(1),
        count: Number(totals[0]?.count || 0),
        source: 'verified-visit'
      }
    });
  } catch (error) {
    console.error('Public reviews error', error);
    return reply(res, 500, { error: 'Reviews could not be loaded right now.' });
  }
};
