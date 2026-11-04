const crypto = require('node:crypto');
const { reply, method, database, requireUser, text, audit } = require('./_lib/http');

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST', 'PATCH'], res)) return;
  const sql = database();
  try {
    if (req.method === 'GET') {
      const plans = user.role === 'patient'
        ? await sql`SELECT p.*, d.name AS clinician_name FROM treatment_plans p JOIN clinic_users d ON d.id = p.clinician_id WHERE p.patient_id = ${user.sub} ORDER BY p.updated_at DESC`
        : await sql`SELECT p.*, u.name AS patient_name, d.name AS clinician_name FROM treatment_plans p JOIN clinic_users u ON u.id = p.patient_id JOIN clinic_users d ON d.id = p.clinician_id ORDER BY p.updated_at DESC`;
      return reply(res, 200, { treatments: plans });
    }
    if (!['doctor', 'management'].includes(user.role)) return reply(res, 403, { error: 'Only clinic staff may update treatment plans.' });
    if (req.method === 'POST') {
      if (user.role !== 'doctor') return reply(res, 403, { error: 'A clinician must author treatment plans.' });
      const patientId = text(req.body?.patientId, 100);
      const title = text(req.body?.title, 180);
      const description = text(req.body?.description, 4000);
      if (!patientId || !title) return reply(res, 400, { error: 'Choose a patient and enter a treatment title.' });
      const patient = await sql`SELECT id FROM clinic_users WHERE id = ${patientId} AND role = 'patient' LIMIT 1`;
      if (!patient.length) return reply(res, 404, { error: 'Patient account not found.' });
      const milestones = Array.isArray(req.body?.milestones) ? req.body.milestones.slice(0, 30).map(item => ({ label: text(item?.label, 180), completed: !!item?.completed, date: text(item?.date, 80) })) : [];
      const id = crypto.randomUUID();
      const rows = await sql`INSERT INTO treatment_plans (id, patient_id, clinician_id, title, description, milestones) VALUES (${id}, ${patientId}, ${user.sub}, ${title}, ${description}, ${JSON.stringify(milestones)}::jsonb) RETURNING *`;
      await audit(sql, user.sub, 'treatment.created', 'treatment', id, { patientId });
      return reply(res, 201, { treatment: rows[0] });
    }
    const { id } = req.body || {};
    const progress = Number(req.body?.progress);
    const status = ['planned', 'in_progress', 'completed', 'cancelled'].includes(req.body?.status) ? req.body.status : null;
    if (!id || !Number.isInteger(progress) || progress < 0 || progress > 100 || !status) return reply(res, 400, { error: 'Provide a treatment id, status, and progress from 0 to 100.' });
    const rows = user.role === 'management'
      ? await sql`UPDATE treatment_plans SET progress = ${progress}, status = ${status}, updated_at = now() WHERE id = ${String(id)} RETURNING *`
      : await sql`UPDATE treatment_plans SET progress = ${progress}, status = ${status}, updated_at = now() WHERE id = ${String(id)} AND clinician_id = ${user.sub} RETURNING *`;
    if (!rows.length) return reply(res, 404, { error: 'Treatment plan not found.' });
    await audit(sql, user.sub, 'treatment.updated', 'treatment', id, { progress, status });
    return reply(res, 200, { treatment: rows[0] });
  } catch (error) {
    console.error('Treatment API error', error);
    return reply(res, 500, { error: 'Could not process the treatment plan.' });
  }
};
