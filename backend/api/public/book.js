// Public booking endpoint for the clinic website.
// A successful call reserves a real slot and returns status "confirmed"; the row is
// written with source 'website' and no portal account, so the clinic can see and
// adjust it in the management queue before the visit.
const crypto = require('node:crypto');
const { reply, method, database, clientIp, text, normalizeEmail, isValidEmail, guardMutation } = require('../_lib/http');
const { clinicTimeZone, formatDateOnlyInZone, zonedTimeToUtc, formatTimeInZone, slotLabel } = require('../_lib/appointments');
const { createNotification } = require('../_lib/notifications');
const {
  DATE_RE,
  TIME_RE,
  rateLimited,
  bookingLimit,
  bookingWindowMs,
  daysAhead,
  leadMinutes,
  normalizeService,
  normalizePhone,
  referenceFor,
  activeClinicians,
  openSlots
} = require('../_lib/public');

function invalid(message) {
  return { error: message };
}

function whenLabel(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: clinicTimeZone(),
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(iso));
}

async function notifyClinic(sql, { clinicianId, title, body, dedupeKey }) {
  const recipients = new Set();
  if (clinicianId) recipients.add(clinicianId);
  const management = await sql`SELECT id FROM clinic_users WHERE role = 'management' AND active = true`;
  for (const row of management) recipients.add(row.id);
  for (const userId of recipients) {
    await createNotification(sql, {
      userId,
      title,
      body,
      type: 'info',
      link: '/',
      channels: ['in_app'],
      dedupeKey: dedupeKey ? `${dedupeKey}:${userId}` : null
    });
  }
}

module.exports = async function handler(req, res) {
  if (!method(req, ['POST'], res)) return;
  if (!guardMutation(req, res)) return;
  const sql = database();

  // Hidden field that only a bot filling every input would complete.
  if (text(req.body?.companyWebsite, 200) || text(req.body?.confirmEmail, 200)) {
    return reply(res, 400, { error: 'The booking request could not be completed.' });
  }

  const ip = clientIp(req);
  if (rateLimited(`book-ip:${ip}`, bookingLimit(), bookingWindowMs())) {
    return reply(res, 429, { error: 'Too many booking attempts from this connection. Please call the clinic or try again shortly.' });
  }

  try {
    const name = text(req.body?.name, 80);
    const phone = normalizePhone(req.body?.phone);
    const email = normalizeEmail(req.body?.email);
    const notes = text(req.body?.notes, 1200);
    const service = normalizeService(req.body?.service);
    const dateOnly = text(req.body?.date, 10);
    const timeOnly = text(req.body?.time, 5);
    const consent = req.body?.consent === true || String(req.body?.consent) === 'true';
    const requestedClinicianId = text(req.body?.clinicianId, 100);

    if (name.length < 2) return reply(res, 400, invalid('Please enter your full name.'));
    if (!phone) return reply(res, 400, invalid('Enter a phone number we can reach you on.'));
    if (email && !isValidEmail(email)) return reply(res, 400, invalid('Enter a valid email address.'));
    if (!service) return reply(res, 400, invalid('Choose the treatment you need.'));
    if (!DATE_RE.test(dateOnly) || !TIME_RE.test(timeOnly)) return reply(res, 400, invalid('Choose a preferred day and time.'));
    if (!consent) return reply(res, 400, invalid('Please confirm the clinic may contact you about this appointment.'));

    const timeZone = clinicTimeZone();
    const today = formatDateOnlyInZone(new Date(), timeZone);
    const lastDay = formatDateOnlyInZone(new Date(Date.now() + daysAhead() * 86400000), timeZone);
    if (dateOnly < today) return reply(res, 400, invalid('Please choose today or a future date.'));
    if (dateOnly > lastDay) return reply(res, 400, invalid(`Online booking opens ${daysAhead()} days ahead.`));

    const clinicians = await activeClinicians(sql);
    if (!clinicians.length) return reply(res, 503, { error: 'Online booking is not available yet. Please call the clinic.' });

    if (rateLimited(`book-contact:${phone.replace(/\+/g, '')}`, bookingLimit(), bookingWindowMs())) {
      return reply(res, 429, { error: 'Too many booking attempts for this number. Please call the clinic instead.' });
    }

    const slots = await openSlots(sql, {
      dateOnly,
      clinicians: requestedClinicianId ? clinicians.filter(clinician => clinician.id === requestedClinicianId) : clinicians
    });
    const slot = slots.find(item => item.time === timeOnly);
    if (!slot) {
      return reply(res, 409, {
        error: 'That time was just taken. Please pick another open slot.',
        code: 'slot_taken',
        availableSlots: slots.map(item => ({ start: item.start, time: item.time, label: item.label, clinician: item.clinician, clinicianId: item.clinicianId }))
      });
    }

    const start = zonedTimeToUtc(dateOnly, timeOnly, timeZone);
    if (start.getTime() < Date.now() + leadMinutes() * 60000) {
      return reply(res, 409, { error: 'That time is too soon to book online. Please call the clinic.', code: 'too_soon' });
    }

    const clinician = clinicians.find(item => item.id === slot.clinicianId);
    const id = crypto.randomUUID();
    let reference = '';
    for (let attempt = 0; attempt < 5 && !reference; attempt += 1) {
      const candidate = referenceFor(dateOnly);
      const taken = await sql`SELECT id FROM appointments WHERE reference = ${candidate} LIMIT 1`;
      if (!taken.length) reference = candidate;
    }
    if (!reference) return reply(res, 500, { error: 'The appointment could not be referenced. Please call the clinic.' });

    try {
      await sql`INSERT INTO appointments
        (id, patient_id, patient_name, service, dentist, clinician_id, appointment_at, status, notes, room, duration_minutes,
         reference, source, contact_email, contact_phone, consent_accepted)
        VALUES (${id}, NULL, ${name}, ${service}, ${clinician.name}, ${clinician.id}, ${start.toISOString()}, 'confirmed', ${notes},
         ${slot.room || 'Clinic suite'}, ${slot.durationMinutes}, ${reference}, 'website', ${email}, ${phone}, true)`;
    } catch (error) {
      if (error && error.code === '23505') {
        const fresh = await openSlots(sql, { dateOnly, clinicians });
        return reply(res, 409, {
          error: 'That time was just taken. Please pick another open slot.',
          code: 'slot_taken',
          availableSlots: fresh.map(item => ({ start: item.start, time: item.time, label: item.label, clinician: item.clinician, clinicianId: item.clinicianId }))
        });
      }
      throw error;
    }

    const summary = [
      `Appointment confirmed: ${reference}`,
      `${service} with ${clinician.name}`,
      `${whenLabel(start.toISOString())} (${formatTimeInZone(start, timeZone)} local, ${slot.durationMinutes} minutes)`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      email ? `Email: ${email}` : '',
      notes ? `Notes: ${notes}` : ''
    ].filter(Boolean).join('\n');

    await notifyClinic(sql, {
      clinicianId: clinician.id,
      title: 'Website appointment confirmed',
      body: `${name} · ${service} · ${slotLabel(start.toISOString(), timeZone)} with ${clinician.name}. Reference ${reference}.`,
      dedupeKey: `website-booked:${id}`
    });

    return reply(res, 201, {
      appointment: {
        reference,
        status: 'confirmed',
        service,
        clinician: clinician.name,
        clinicianId: clinician.id,
        date: dateOnly,
        time: formatTimeInZone(start, timeZone),
        startsAt: start.toISOString(),
        durationMinutes: slot.durationMinutes,
        timezone: timeZone,
        when: whenLabel(start.toISOString())
      },
      summary
    });
  } catch (error) {
    console.error('Public booking error', error);
    return reply(res, 500, { error: 'The appointment could not be confirmed right now. Please call the clinic.' });
  }
};
