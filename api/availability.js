const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit } = require('./_lib/http');
const { clinicTimeZone, formatDateOnlyInZone, slotsForDate } = require('./_lib/appointments');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function normalizeTime(value) {
  const raw = String(value || '').trim().slice(0, 5);
  return TIME_RE.test(raw) ? raw : null;
}

module.exports = async function handler(req, res) {
  const user = requireUser(req, res);
  if (!user) return;
  if (!method(req, ['GET', 'POST', 'DELETE'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  try {
    if (req.method === 'GET') {
      if (text(req.query?.clinicians, 10) === '1') {
        const rows = await sql`SELECT id, name, email FROM clinic_users WHERE role = 'doctor' AND active = true ORDER BY name`;
        return reply(res, 200, { clinicians: rows });
      }

      const clinicianId = text(req.query?.clinicianId, 100);
      if (!clinicianId) return reply(res, 400, { error: 'Choose a clinician.' });
      const clinicians = await sql`SELECT id, name FROM clinic_users WHERE id = ${clinicianId} AND role = 'doctor' AND active = true LIMIT 1`;
      const clinician = clinicians[0];
      if (!clinician) return reply(res, 404, { error: 'Clinician account not found.' });

      const date = text(req.query?.date, 10);
      if (date) {
        if (!DATE_RE.test(date)) return reply(res, 400, { error: 'Use a date in YYYY-MM-DD format.' });
        const slots = await slotsForDate(sql, { clinician, dateOnly: date });
        const ruleRows = await sql`SELECT count(*)::int AS count FROM doctor_availability WHERE clinician_id = ${clinicianId} AND active = true`;
        return reply(res, 200, {
          clinician,
          date,
          timezone: clinicTimeZone(),
          slots,
          availabilityConfigured: Number(ruleRows[0]?.count) > 0
        });
      }

      if (!['doctor', 'management'].includes(user.role)) {
        return reply(res, 403, { error: 'Only clinic staff may view availability rules.' });
      }
      if (user.role === 'doctor' && clinicianId !== user.sub) {
        return reply(res, 403, { error: 'You may only view your own availability.' });
      }
      const rules = await sql`SELECT id, clinician_id, weekday, start_time, end_time, slot_minutes, room, active
        FROM doctor_availability WHERE clinician_id = ${clinicianId} ORDER BY weekday, start_time`;
      return reply(res, 200, { clinician, rules, timezone: clinicTimeZone() });
    }

    if (!['doctor', 'management'].includes(user.role)) {
      return reply(res, 403, { error: 'Only clinic staff may change availability.' });
    }

    if (req.method === 'DELETE') {
      const id = text(req.query?.id || req.body?.id, 100);
      if (!id) return reply(res, 400, { error: 'Provide an availability rule id.' });
      const rows = await sql`SELECT id, clinician_id FROM doctor_availability WHERE id = ${id} LIMIT 1`;
      if (!rows.length) return reply(res, 404, { error: 'Availability rule not found.' });
      if (user.role === 'doctor' && rows[0].clinician_id !== user.sub) {
        return reply(res, 403, { error: 'You may only remove your own availability.' });
      }
      await sql`DELETE FROM doctor_availability WHERE id = ${id}`;
      await audit(sql, user.sub, 'availability.removed', 'doctor_availability', id, { clinicianId: rows[0].clinician_id });
      return reply(res, 200, { ok: true });
    }

    const clinicianId = text(req.body?.clinicianId, 100) || user.sub;
    if (user.role === 'doctor' && clinicianId !== user.sub) {
      return reply(res, 403, { error: 'You may only change your own availability.' });
    }
    const weekday = Number(req.body?.weekday);
    const startTime = normalizeTime(req.body?.startTime);
    const endTime = normalizeTime(req.body?.endTime);
    const slotMinutes = Number(req.body?.slotMinutes || 60);
    const room = text(req.body?.room, 120);

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !startTime || !endTime) {
      return reply(res, 400, { error: 'Provide a weekday (0–6), start time and end time.' });
    }
    if (startTime >= endTime) return reply(res, 400, { error: 'End time must be after start time.' });
    if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) {
      return reply(res, 400, { error: 'Slot length must be between 15 and 240 minutes.' });
    }
    const clinician = await sql`SELECT id, name FROM clinic_users WHERE id = ${clinicianId} AND role = 'doctor' AND active = true LIMIT 1`;
    if (!clinician.length) return reply(res, 404, { error: 'Clinician account not found.' });

    const overlapping = await sql`SELECT id FROM doctor_availability
      WHERE clinician_id = ${clinicianId} AND weekday = ${weekday} AND active = true
        AND start_time < ${`${endTime}:00`}::time AND end_time > ${`${startTime}:00`}::time
      LIMIT 1`;
    if (overlapping.length) return reply(res, 409, { error: 'This rule overlaps existing availability for that day.' });

    const existing = await sql`SELECT id FROM doctor_availability
      WHERE clinician_id = ${clinicianId} AND weekday = ${weekday} AND start_time = ${`${startTime}:00`}::time AND end_time = ${`${endTime}:00`}::time
      LIMIT 1`;
    const id = existing[0]?.id || crypto.randomUUID();
    const rows = existing.length
      ? await sql`UPDATE doctor_availability SET slot_minutes = ${slotMinutes}, room = ${room}, active = true WHERE id = ${id} RETURNING *`
      : await sql`INSERT INTO doctor_availability (id, clinician_id, weekday, start_time, end_time, slot_minutes, room) VALUES (${id}, ${clinicianId}, ${weekday}, ${`${startTime}:00`}::time, ${`${endTime}:00`}::time, ${slotMinutes}, ${room}) RETURNING *`;

    await audit(sql, user.sub, 'availability.saved', 'doctor_availability', id, { clinicianId, weekday, startTime, endTime, slotMinutes });
    return reply(res, existing.length ? 200 : 201, { rule: rows[0] });
  } catch (error) {
    console.error('Availability API error', error);
    return reply(res, 500, { error: 'Could not load or save availability.' });
  }
};
