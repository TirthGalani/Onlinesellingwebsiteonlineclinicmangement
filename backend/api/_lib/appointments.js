// Appointment availability, conflict and access helpers.
// Availability rules are stored as clinic-local wall-clock times. The API converts
// them to UTC using CLINIC_TIMEZONE (default America/New_York).

const { clinicianSurname } = require('./http');

const DEFAULT_TIMEZONE = 'America/New_York';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AHEAD = 730;

const formatterCache = new Map();

function clinicTimeZone() {
  return process.env.CLINIC_TIMEZONE || DEFAULT_TIMEZONE;
}

function formatterFor(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function zonedParts(date, timeZone) {
  const result = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateOnlyInZone(date, timeZone = clinicTimeZone()) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatTimeInZone(date, timeZone = clinicTimeZone()) {
  const parts = zonedParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function weekdayForDateOnly(dateOnly) {
  return new Date(`${dateOnly}T00:00:00Z`).getUTCDay();
}

function addDays(dateOnly, days) {
  const base = new Date(`${dateOnly}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function zonedTimeToUtc(dateOnly, timeOnly, timeZone = clinicTimeZone()) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hour, minute] = timeOnly.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desiredUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const observedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const difference = desiredUtc - observedUtc;
    if (difference === 0) break;
    utc += difference;
  }
  return new Date(utc);
}

function parseAppointmentDate(value) {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return null;
  const now = Date.now();
  if (date.getTime() < now - 60 * 1000) return null;
  if (date.getTime() > now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) return null;
  return date;
}

function slotLabel(iso, timeZone = clinicTimeZone()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

async function rulesFor(sql, clinicianId, weekday = null) {
  if (weekday === null) {
    return sql`SELECT id, clinician_id, weekday, start_time, end_time, slot_minutes, room, active FROM doctor_availability WHERE clinician_id = ${clinicianId} ORDER BY weekday, start_time`;
  }
  return sql`SELECT id, clinician_id, weekday, start_time, end_time, slot_minutes, room, active FROM doctor_availability WHERE clinician_id = ${clinicianId} AND weekday = ${weekday} ORDER BY start_time`;
}

function ruleSlotStarts(rule, dateOnly, timeZone) {
  const start = String(rule.start_time).slice(0, 5);
  const end = String(rule.end_time).slice(0, 5);
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return [];
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const slotMinutes = Math.min(Math.max(Number(rule.slot_minutes) || 60, 15), 240);
  const starts = [];
  for (let minutes = startHour * 60 + startMinute; minutes + slotMinutes <= endHour * 60 + endMinute; minutes += slotMinutes) {
    const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    starts.push({ time, date: zonedTimeToUtc(dateOnly, time, timeZone), slotMinutes });
  }
  return starts;
}

async function resolveClinician(sql, { clinicianId, dentist } = {}) {
  if (clinicianId) {
    const rows = await sql`SELECT id, name, email, phone FROM clinic_users WHERE id = ${String(clinicianId)} AND role = 'doctor' AND active = true LIMIT 1`;
    if (rows[0]) return rows[0];
    // Fall through to name matching for legacy forms that send a display name.
  }
  const surname = clinicianSurname(dentist);
  if (!surname) return null;
  const rows = await sql`SELECT id, name, email, phone FROM clinic_users WHERE role = 'doctor' AND active = true AND lower(name) LIKE ${`%${surname}%`} ORDER BY created_at LIMIT 1`;
  return rows[0] || null;
}

async function bookedIntervals(sql, { clinician, dateOnly, timeZone }) {
  const dayStart = zonedTimeToUtc(dateOnly, '00:00', timeZone);
  const dayEnd = zonedTimeToUtc(addDays(dateOnly, 1), '00:00', timeZone);
  const rows = await sql`SELECT id, appointment_at, COALESCE(duration_minutes, 60) AS duration_minutes FROM appointments
    WHERE status IN ('requested', 'confirmed')
      AND (clinician_id = ${clinician.id} OR (clinician_id IS NULL AND lower(dentist) LIKE ${`%${clinicianSurname(clinician.name)}%`}))
      AND appointment_at >= ${dayStart.toISOString()} AND appointment_at < ${dayEnd.toISOString()}`;
  return rows.map(row => {
    const start = new Date(row.appointment_at);
    return { start, end: new Date(start.getTime() + (Number(row.duration_minutes) || 60) * 60000) };
  });
}

function overlaps(start, end, intervals) {
  return intervals.some(interval => start < interval.end && end > interval.start);
}

async function slotsForDate(sql, { clinician, dateOnly, timeZone = clinicTimeZone() }) {
  if (!DATE_RE.test(String(dateOnly))) throw new Error('Use a date in YYYY-MM-DD format.');
  const ruleList = (await rulesFor(sql, clinician.id, weekdayForDateOnly(dateOnly))).filter(rule => rule.active);
  const intervals = await bookedIntervals(sql, { clinician, dateOnly, timeZone });
  const byStart = new Map();
  const now = Date.now();
  for (const rule of ruleList) {
    for (const slot of ruleSlotStarts(rule, dateOnly, timeZone)) {
      const end = new Date(slot.date.getTime() + slot.slotMinutes * 60000);
      const key = slot.date.toISOString();
      if (byStart.has(key)) continue;
      byStart.set(key, {
        start: key,
        end: end.toISOString(),
        label: slotLabel(key, timeZone),
        available: slot.date.getTime() > now && !overlaps(slot.date, end, intervals),
        room: rule.room || ''
      });
    }
  }
  return Array.from(byStart.values()).sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Validate a requested instant against weekly availability and existing bookings.
 * If a clinician has no availability rows yet, booking is allowed (legacy/manual mode).
 */
async function availabilityForBooking(sql, { clinician, date, timeZone = clinicTimeZone() }) {
  const dateOnly = formatDateOnlyInZone(date, timeZone);
  const requestedTime = formatTimeInZone(date, timeZone);
  // One published rule means the clinician's week is managed by this schedule.
  // Days without a rule are then closed rather than falling back to manual booking.
  const allRules = (await rulesFor(sql, clinician.id)).filter(rule => rule.active);
  const configured = allRules.length > 0;
  const ruleList = configured ? allRules.filter(rule => rule.weekday === weekdayForDateOnly(dateOnly)) : [];

  if (configured && !ruleList.length) {
    return {
      allowed: false,
      configured: true,
      reason: 'The clinician is not available on that day.',
      availableSlots: [],
      durationMinutes: 60,
      room: ''
    };
  }

  let matched = null;
  if (ruleList.length) {
    for (const rule of ruleList) {
      const slot = ruleSlotStarts(rule, dateOnly, timeZone).find(item => item.time === requestedTime);
      if (slot) { matched = { rule, slot }; break; }
    }
  }

  if (ruleList.length && !matched) {
    const slots = await slotsForDate(sql, { clinician, dateOnly, timeZone });
    return {
      allowed: false,
      configured: true,
      reason: 'That time is outside the clinician’s published availability.',
      availableSlots: slots.filter(slot => slot.available).map(slot => slot.start),
      durationMinutes: 60,
      room: ''
    };
  }

  const durationMinutes = matched ? matched.slot.slotMinutes : 60;
  const start = matched ? matched.slot.date : date;
  const intervals = await bookedIntervals(sql, { clinician, dateOnly, timeZone });
  const end = new Date(start.getTime() + durationMinutes * 60000);
  if (overlaps(start, end, intervals)) {
    const slots = await slotsForDate(sql, { clinician, dateOnly, timeZone });
    return {
      allowed: false,
      configured,
      reason: 'That clinician already has an appointment in this time range.',
      availableSlots: slots.filter(slot => slot.available).map(slot => slot.start),
      durationMinutes,
      room: matched ? matched.rule.room || '' : ''
    };
  }

  return {
    allowed: true,
    configured,
    reason: '',
    availableSlots: [],
    durationMinutes,
    room: matched ? matched.rule.room || '' : ''
  };
}

async function findConflict(sql, { clinicianId, dentist, start, durationMinutes = 60, excludeId = null }) {
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const excluded = excludeId ? String(excludeId) : '';
  if (clinicianId) {
    const rows = await sql`SELECT id FROM appointments
      WHERE status IN ('requested', 'confirmed') AND clinician_id = ${clinicianId} AND id <> ${excluded}
        AND appointment_at < ${end.toISOString()}
        AND appointment_at + (${durationMinutes} * interval '1 minute') > ${start.toISOString()}
      LIMIT 1`;
    return rows[0] || null;
  }
  const surname = clinicianSurname(dentist);
  if (!surname) return null;
  const rows = await sql`SELECT id FROM appointments
    WHERE status IN ('requested', 'confirmed') AND clinician_id IS NULL AND lower(dentist) LIKE ${`%${surname}%`} AND id <> ${excluded}
      AND appointment_at < ${end.toISOString()}
      AND appointment_at + (${durationMinutes} * interval '1 minute') > ${start.toISOString()}
    LIMIT 1`;
  return rows[0] || null;
}

function canAccessAppointment(appointment, user) {
  if (!appointment || !user) return false;
  if (user.role === 'management') return true;
  if (user.role === 'patient') return appointment.patient_id === user.sub;
  if (appointment.clinician_id) return appointment.clinician_id === user.sub;
  return String(appointment.dentist || '').toLowerCase().includes(clinicianSurname(user.name));
}

async function fetchAppointment(sql, id) {
  const rows = await sql`SELECT a.*, COALESCE(u.email, a.contact_email) AS patient_email,
      COALESCE(u.phone, a.contact_phone) AS patient_phone, c.name AS clinician_name
    FROM appointments a
    LEFT JOIN clinic_users u ON u.id = a.patient_id
    LEFT JOIN clinic_users c ON c.id = a.clinician_id
    WHERE a.id = ${String(id)}
    LIMIT 1`;
  return rows[0] || null;
}

module.exports = {
  clinicTimeZone,
  DEFAULT_DAYS_AHEAD: MAX_DAYS_AHEAD,
  formatDateOnlyInZone,
  formatTimeInZone,
  weekdayForDateOnly,
  addDays,
  zonedTimeToUtc,
  parseAppointmentDate,
  slotLabel,
  rulesFor,
  ruleSlotStarts,
  overlaps,
  bookedIntervals,
  slotsForDate,
  availabilityForBooking,
  findConflict,
  resolveClinician,
  canAccessAppointment,
  fetchAppointment
};
