const crypto = require('node:crypto');
const { reply, method, database, requireUser, text, audit } = require('./_lib/http');

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST'], res)) return;
  const sql = database();
  try {
    if (req.method === 'GET') {
      const reviews = await sql`SELECT r.id, r.rating, r.title, r.content, r.created_at, u.name AS author, a.service FROM patient_reviews r JOIN clinic_users u ON u.id = r.patient_id JOIN appointments a ON a.id = r.appointment_id WHERE r.visibility = 'published' ORDER BY r.created_at DESC LIMIT 200`;
      return reply(res, 200, { reviews });
    }
    if (user.role !== 'patient') return reply(res, 403, { error: 'Only patients may submit a review.' });
    const appointmentId = text(req.body?.appointmentId, 100);
    const rating = Number(req.body?.rating);
    const title = text(req.body?.title, 160);
    const content = text(req.body?.content, 3000);
    if (!appointmentId || !Number.isInteger(rating) || rating < 1 || rating > 5 || title.length < 3 || content.length < 10) {
      return reply(res, 400, { error: 'Choose a completed visit, rate it from 1 to 5, and provide a short title and review.' });
    }
    const eligible = await sql`SELECT id FROM appointments WHERE id = ${appointmentId} AND patient_id = ${user.sub} AND status = 'completed' LIMIT 1`;
    if (!eligible.length) return reply(res, 403, { error: 'Reviews are available after your completed appointments.' });
    const id = crypto.randomUUID();
    const rows = await sql`INSERT INTO patient_reviews (id, patient_id, appointment_id, rating, title, content) VALUES (${id}, ${user.sub}, ${appointmentId}, ${rating}, ${title}, ${content}) RETURNING id, rating, title, content, created_at`;
    await audit(sql, user.sub, 'review.created', 'review', id, { appointmentId, rating });
    return reply(res, 201, { review: rows[0] });
  } catch (error) {
    if (error.code === '23505') return reply(res, 409, { error: 'A review was already submitted for that visit.' });
    console.error('Review API error', error);
    return reply(res, 500, { error: 'Could not submit the review.' });
  }
};
