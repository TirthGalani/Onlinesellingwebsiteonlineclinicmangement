// Public open-slot lookup for the clinic website. Returns times only: no patient
// names, no contact details and no clinician email addresses.
const { reply, method, database, clientIp, text } = require('../_lib/http');
const { clinicTimeZone, formatDateOnlyInZone } = require('../_lib/appointments');
const { DATE_RE, rateLimited, lookupLimit, daysAhead, activeClinicians, openSlots, openCalendar, PUBLIC_SERVICES } = require('../_lib/public');

module.exports = async function handler(req, res) {
  if (!method(req, ['GET'], res)) return;
  const sql = database();

  if (rateLimited(`availability:${clientIp(req)}`, lookupLimit(), 60 * 1000)) {
    return reply(res, 429, { error: 'Too many requests. Please wait a minute and try again.' });
  }

  try {
    const clinicians = await activeClinicians(sql);
    const window = daysAhead();
    const today = formatDateOnlyInZone(new Date(), clinicTimeZone());

    if (text(req.query?.clinicians, 4) === '1') {
      return reply(res, 200, {
        clinicians: clinicians.map(clinician => ({ id: clinician.id, name: clinician.name })),
        services: PUBLIC_SERVICES,
        timezone: clinicTimeZone(),
        today,
        daysAhead: window
      });
    }

    const rawDate = text(req.query?.date, 10);
    if (!DATE_RE.test(rawDate)) return reply(res, 400, { error: 'Use a date in YYYY-MM-DD format.' });
    if (rawDate < today) return reply(res, 400, { error: 'Please choose today or a future date.' });
    if (rawDate > formatDateOnlyInZone(new Date(Date.now() + window * 86400000), clinicTimeZone())) {
      return reply(res, 400, { error: `Online booking opens ${window} days ahead.` });
    }

    const scoped = text(req.query?.clinicianId, 100)
      ? clinicians.filter(clinician => clinician.id === text(req.query.clinicianId, 100))
      : clinicians;
    if (!scoped.length) return reply(res, 404, { error: 'That clinician is not accepting online bookings.' });

    if (text(req.query?.calendar, 4) === '1') {
      const days = await openCalendar(sql, { clinicians: scoped, fromDateOnly: rawDate, days: Math.min(31, Number(req.query?.span) || 14) });
      return reply(res, 200, { date: rawDate, timezone: clinicTimeZone(), days });
    }

    const slots = await openSlots(sql, { dateOnly: rawDate, clinicians: scoped });
    return reply(res, 200, {
      date: rawDate,
      timezone: clinicTimeZone(),
      slots: slots.map(slot => ({
        start: slot.start,
        time: slot.time,
        label: slot.label,
        durationMinutes: slot.durationMinutes,
        clinician: slot.clinician,
        clinicianId: slot.clinicianId
      }))
    });
  } catch (error) {
    console.error('Public availability error', error);
    return reply(res, 500, { error: 'Open times could not be loaded right now.' });
  }
};
