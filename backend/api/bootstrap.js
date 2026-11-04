const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {
  reply, method, database, issueSession, sessionCookie, normalizeEmail, text,
  isValidEmail, passwordProblem, audit
} = require('./_lib/http');

module.exports = async function handler(req, res) {
  if (!method(req, ['POST'], res)) return;
  const providedKey = String(req.headers['x-bootstrap-key'] || '');
  const expectedKey = String(process.env.ADMIN_BOOTSTRAP_KEY || '');
  const providedBytes = Buffer.from(providedKey);
  const expectedBytes = Buffer.from(expectedKey);
  if (!expectedBytes.length || providedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(providedBytes, expectedBytes)) {
    return reply(res, 403, { error: 'Bootstrap is not enabled or the setup key is invalid.' });
  }
  const name = text(req.body?.name, 120);
  const email = normalizeEmail(req.body?.email);
  const phone = text(req.body?.phone, 40);
  const password = String(req.body?.password || '');
  if (name.length < 2 || !isValidEmail(email)) {
    return reply(res, 400, { error: 'Enter a name and valid email address.' });
  }
  const problem = passwordProblem(password);
  if (problem) return reply(res, 400, { error: problem });

  try {
    const sql = database();
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`WITH claim AS (
        UPDATE clinic_setup SET management_bootstrapped = true
        WHERE id = 1 AND management_bootstrapped = false
          AND NOT EXISTS (SELECT 1 FROM clinic_users WHERE role = 'management')
        RETURNING id
      )
      INSERT INTO clinic_users (id, name, email, phone, password_hash, role)
      SELECT ${id}, ${name}, ${email}, ${phone}, ${passwordHash}, 'management' FROM claim
      RETURNING id, name, email, phone, role, created_at`;
    if (!rows.length) return reply(res, 409, { error: 'A management account already exists. Bootstrap is permanently closed.' });
    await audit(sql, id, 'management.bootstrapped', 'clinic_user', id);
    res.setHeader('Set-Cookie', sessionCookie(issueSession(rows[0])));
    return reply(res, 201, {
      user: rows[0],
      message: 'Initial management account created. Remove ADMIN_BOOTSTRAP_KEY from deployment settings now.'
    });
  } catch (error) {
    if (error.code === '23505') return reply(res, 409, { error: 'An account already uses that email.' });
    console.error('Admin bootstrap failed', error);
    return reply(res, 500, { error: 'Could not create the initial management account.' });
  }
};
