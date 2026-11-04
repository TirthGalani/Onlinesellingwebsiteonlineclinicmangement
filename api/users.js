const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const {
  reply, method, database, requireUser, guardMutation, normalizeEmail, text,
  isValidEmail, passwordProblem, audit, clinicianSurname
} = require('./_lib/http');

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'GET') {
      if (!['doctor', 'management'].includes(user.role)) {
        return reply(res, 403, { error: 'Only clinic staff may search the patient directory.' });
      }
      const q = text(req.query?.q, 120);
      const like = q ? `%${q}%` : null;
      const requestedLimit = Number(req.query?.limit || 100);
      const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 100, 1), 200);
      const doctorSurname = clinicianSurname(user.name);
      const rows = await sql`SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
          (SELECT count(*)::int FROM appointments a WHERE a.patient_id = u.id) AS appointment_count,
          (SELECT max(a.appointment_at) FROM appointments a WHERE a.patient_id = u.id AND a.status = 'completed') AS last_visit
        FROM clinic_users u
        WHERE u.role = 'patient' AND u.active = true
          AND (${like}::text IS NULL OR u.name ILIKE ${like} OR u.email ILIKE ${like} OR u.phone ILIKE ${like})
          AND (${user.role} <> 'doctor' OR EXISTS (
            SELECT 1 FROM appointments a WHERE a.patient_id = u.id
              AND (a.clinician_id = ${user.sub} OR (a.clinician_id IS NULL AND lower(a.dentist) LIKE ${`%${doctorSurname}%`}))
          ))
        ORDER BY u.name ASC
        LIMIT ${limit}`;
      return reply(res, 200, { users: rows, query: q, scope: user.role === 'doctor' ? 'caseload' : 'clinic' });
    }

    if (user.role !== 'management') {
      return reply(res, 403, { error: 'Only management may provision staff accounts.' });
    }
    const name = text(req.body?.name, 120);
    const email = normalizeEmail(req.body?.email);
    const phone = text(req.body?.phone, 40);
    const password = String(req.body?.password || '');
    const role = ['doctor', 'management'].includes(req.body?.role) ? req.body.role : null;
    const problem = passwordProblem(password);
    if (name.length < 2 || !isValidEmail(email) || !role) {
      return reply(res, 400, { error: 'Provide a name, valid email and staff role.' });
    }
    if (problem) return reply(res, 400, { error: problem });

    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`INSERT INTO clinic_users (id, name, email, phone, password_hash, role)
      VALUES (${id}, ${name}, ${email}, ${phone}, ${passwordHash}, ${role})
      RETURNING id, name, email, phone, role, created_at`;
    await audit(sql, user.sub, 'staff.created', 'clinic_user', id, { role });
    return reply(res, 201, { user: rows[0] });
  } catch (error) {
    if (error.code === '23505') return reply(res, 409, { error: 'An account already uses that email.' });
    console.error('User API error', error);
    return reply(res, 500, { error: 'Could not process the directory request.' });
  }
};
