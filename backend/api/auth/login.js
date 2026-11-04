const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {
  reply, method, database, issueSession, sessionCookie, normalizeEmail, guardMutation, clientIp, audit
} = require('../_lib/http');

module.exports = async function handler(req, res) {
  if (!method(req, ['POST'], res)) return;
  if (!guardMutation(req, res)) return;
  if (!process.env.JWT_SECRET) return reply(res, 503, { error: 'Authentication is not configured.' });
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!email || !password) return reply(res, 400, { error: 'Email and password are required.' });

  try {
    const sql = database();
    const rateKey = crypto.createHash('sha256').update(`${email}|${clientIp(req)}|${process.env.JWT_SECRET}`).digest('hex');
    const locked = await sql`SELECT locked_until FROM auth_login_limits WHERE rate_key = ${rateKey} AND locked_until > now() LIMIT 1`;
    if (locked.length) return reply(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });

    const rows = await sql`SELECT id, name, email, phone, role, password_hash, active FROM clinic_users WHERE email = ${email} LIMIT 1`;
    const user = rows[0];
    const valid = user && user.active && await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await sql`INSERT INTO auth_login_limits (rate_key, failed_attempts, window_started_at) VALUES (${rateKey}, 1, now())
        ON CONFLICT (rate_key) DO UPDATE SET
          locked_until = CASE
            WHEN auth_login_limits.window_started_at < now() - interval '15 minutes' THEN NULL
            WHEN auth_login_limits.failed_attempts >= 4 THEN now() + interval '15 minutes'
            ELSE auth_login_limits.locked_until END,
          failed_attempts = CASE WHEN auth_login_limits.window_started_at < now() - interval '15 minutes' THEN 1 ELSE auth_login_limits.failed_attempts + 1 END,
          window_started_at = CASE WHEN auth_login_limits.window_started_at < now() - interval '15 minutes' THEN now() ELSE auth_login_limits.window_started_at END`;
      return reply(res, 401, { error: 'Email or password is incorrect.' });
    }

    await sql`DELETE FROM auth_login_limits WHERE rate_key = ${rateKey}`;
    await sql`UPDATE clinic_users SET last_login_at = now() WHERE id = ${user.id}`;
    delete user.password_hash;
    delete user.active;
    res.setHeader('Set-Cookie', sessionCookie(issueSession(user)));
    try {
      await audit(sql, user.id, 'auth.signed_in', 'clinic_user', user.id, { role: user.role });
    } catch (error) {
      console.error('Could not record sign-in audit event', error);
    }
    return reply(res, 200, { user });
  } catch (error) {
    console.error('Sign in failed', error);
    return reply(res, 500, { error: 'Could not sign in.' });
  }
};
