const crypto = require('node:crypto');
const { reply, method, database, requireUser, guardMutation, text, audit } = require('./_lib/http');
const { clinicTimeZone, canAccessAppointment, fetchAppointment } = require('./_lib/appointments');
const { createNotification, retryFailedDeliveries, IN_APP, EMAIL, SMS } = require('./_lib/notifications');

const MAX_PER_RUN = 40;

function authorizedCron(req) {
  const secret = String(process.env.CRON_SECRET || '');
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  const provided = header.replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function formatWhen(value) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimeZone(),
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value));
}

async function recordReminderRows(sql, appointmentId, kind, deliveries) {
  for (const delivery of deliveries) {
    await sql`INSERT INTO appointment_reminders (id, appointment_id, reminder_kind, channel, status, provider, provider_message_id, error)
      VALUES (${crypto.randomUUID()}, ${appointmentId}, ${kind}, ${delivery.channel}, ${delivery.status}, ${delivery.provider || ''}, ${delivery.providerMessageId || null}, ${delivery.error || ''})`;
  }
}

async function sendAppointmentReminder(sql, appointment, kind) {
  const channels = [IN_APP, EMAIL, SMS];
  const result = await createNotification(sql, {
    userId: appointment.patient_id,
    title: 'Appointment reminder',
    body: `Reminder: ${appointment.service} with ${appointment.dentist} on ${formatWhen(appointment.appointment_at)}. Reply to the clinic if you need to reschedule.`,
    type: 'reminder',
    link: '/',
    channels,
    dedupeKey: kind === 'scheduled' ? `reminder:${appointment.id}:48h` : null
  });
  await recordReminderRows(sql, appointment.id, kind, result.deliveries);
  return result;
}

module.exports = async function handler(req, res) {
  if (!method(req, ['GET', 'POST'], res)) return;
  if (req.method === 'GET' && !authorizedCron(req)) {
    return reply(res, 401, { error: 'Scheduled reminder runs require the CRON_SECRET bearer token.' });
  }
  if (req.method === 'POST' && !guardMutation(req, res)) return;

  let user = null;
  if (req.method === 'POST') {
    user = requireUser(req, res, ['doctor', 'management']);
    if (!user) return;
  }

  const sql = database();
  try {
    if (req.method === 'GET') {
      const due = await sql`SELECT a.*, u.email AS patient_email, u.phone AS patient_phone
        FROM appointments a JOIN clinic_users u ON u.id = a.patient_id
        WHERE a.status IN ('requested', 'confirmed')
          AND a.appointment_at BETWEEN now() AND now() + interval '48 hours'
          AND a.reminder_sent_at IS NULL
        ORDER BY a.appointment_at ASC
        LIMIT ${MAX_PER_RUN}`;
      const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };
      for (const appointment of due) {
        const result = await sendAppointmentReminder(sql, appointment, 'scheduled');
        await sql`UPDATE appointments SET reminder_sent_at = now(), updated_at = now() WHERE id = ${appointment.id}`;
        summary.processed += 1;
        for (const delivery of result.deliveries) {
          if (delivery.status === 'sent') summary.sent += 1;
          else if (delivery.status === 'failed') summary.failed += 1;
          else summary.skipped += 1;
        }
      }
      const retries = await retryFailedDeliveries(sql);
      return reply(res, 200, { ok: true, ...summary, retries, ranAt: new Date().toISOString() });
    }

    const appointmentId = text(req.body?.appointmentId, 100);
    if (!appointmentId) return reply(res, 400, { error: 'Choose an appointment to remind.' });
    const appointment = await fetchAppointment(sql, appointmentId);
    if (!appointment) return reply(res, 404, { error: 'Appointment not found.' });
    if (!canAccessAppointment(appointment, user)) return reply(res, 403, { error: 'You do not have access to this appointment.' });
    if (!['requested', 'confirmed'].includes(appointment.status)) {
      return reply(res, 409, { error: 'Only requested or confirmed appointments can receive reminders.' });
    }
    if (new Date(appointment.appointment_at).getTime() <= Date.now()) {
      return reply(res, 409, { error: 'This appointment is already in the past.' });
    }
    const result = await sendAppointmentReminder(sql, appointment, 'manual');
    await audit(sql, user.sub, 'reminder.sent', 'appointment', appointmentId, {
      deliveries: result.deliveries.map(item => ({ channel: item.channel, status: item.status }))
    });
    return reply(res, 200, {
      ok: true,
      notification: result.notification,
      deliveries: result.deliveries.map(item => ({
        channel: item.channel, status: item.status, provider: item.provider, error: item.error
      }))
    });
  } catch (error) {
    console.error('Reminder API error', error);
    return reply(res, 500, { error: 'Could not send the reminder.' });
  }
};
