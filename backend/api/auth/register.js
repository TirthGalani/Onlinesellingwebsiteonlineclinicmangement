const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {
  reply, method, database, issueSession, sessionCookie, normalizeEmail, text,
  isValidEmail, passwordProblem, guardMutation, audit
} = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (!method(req, ['POST'], res)) return;
  if (!guardMutation(req, res)) return;
  if (!process.env.JWT_SECRET) return reply(res, 503, { error: 'Authentication is not configured.' });

  const name = text(req.body?.name, 120);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const phone = text(req.body?.phone, 40);
  if (name.length < 2 || !isValidEmail(email)) {
    return reply(res, 400, { error: 'Enter your full name and a valid email address.' });
  }
  const problem = passwordProblem(password);
  if (problem) return reply(res, 400, { error: problem });

  try {
    const sql = database();
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`INSERT INTO clinic_users (id, name, email, phone, password_hash, role)
      VALUES (${id}, ${name}, ${email}, ${phone}, ${passwordHash}, 'patient')
      RETURNING id, name, email, phone, role, created_at`;
    const user = rows[0];
    res.setHeader('Set-Cookie', sessionCookie(issueSession(user)));
    try {
      await audit(sql, user.id, 'auth.registered', 'clinic_user', user.id, { role: 'patient' });
    } catch (error) {
      console.error('Could not record registration audit event', error);
    }
    return reply(res, 201, { user });
  } catch (error) {
    if (error.code === '23505') return reply(res, 409, { error: 'An account already exists for that email.' });
    console.error('Patient registration failed', error);
    return reply(res, 500, { error: 'Could not create the account.' });
  }
};
