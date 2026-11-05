// Shared helpers for the unauthenticated website endpoints.
// These routes are reachable by anyone, so they expose the smallest possible amount
// of clinic data: open slot times, published reviews and consented case photography.
const crypto = require('node:crypto');
const {
  clinicTimeZone,
  formatDateOnlyInZone,
  weekdayForDateOnly,
  addDays,
  zonedTimeToUtc,
  ruleSlotStarts,
  overlaps,
  slotLabel
} = require('./appointments');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// The website service select must stay in step with these values.
const PUBLIC_SERVICES = [
  'General Dentistry',
  'Cosmetic Dentistry',
  'Orthodontics',
  'Restorative Dentistry',
  'Pediatric Dentistry',
  'Emergency Dentistry'
];

const ReferenceAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const buckets = new Map();

/**
 * Fixed-window limiter kept in process memory. On serverless hosting each warm
 * instance keeps its own counters, so the limit is a per-instance ceiling.
 */
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  if (buckets.size > 5000) {
    for (const [stored, value] of buckets) {
      if (now >= value.resetAt) buckets.delete(stored);
    }
  }
  return entry.count > limit;
}

function bookingWindowMs() {
  return Math.max(60, Number(process.env.PUBLIC_BOOKING_WINDOW_MINUTES || 15)) * 60 * 1000;
}

function bookingLimit() {
  return Math.max(1, Number(process.env.PUBLIC_BOOKING_LIMIT || 8));
}

function lookupLimit() {
  return Math.max(5, Number(process.env.PUBLIC_LOOKUP_LIMIT || 60));
}

function daysAhead() {
  return Math.min(180, Math.max(1, Number(process.env.PUBLIC_BOOKING_DAYS_AHEAD || 60)));
}

function leadMinutes() {
  return Math.max(0, Number(process.env.PUBLIC_BOOKING_LEAD_MINUTES || 60));
}

function normalizeService(value) {
  const raw = String(value || '').trim().toLowerCase();
  return PUBLIC_SERVICES.find(service => service.toLowerCase() === raw) || '';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? digits.slice(0, 32) : '';
}

function referenceFor(dateOnly) {
  const compact = String(dateOnly).replace(/-/g, '').slice(2);
  let suffix = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i += 1) suffix += ReferenceAlphabet[bytes[i] % ReferenceAlphabet.length];
  return `MD-${compact}-${suffix}`;
}

async function activeClinicians(sql) {
  return sql`SELECT id, name FROM clinic_users WHERE role = 'doctor' AND active = true ORDER BY created_at`;
}

/**
 * Open slots for one date across a set of clinicians.
 * Rules and bookings are read once per call rather than once per clinician so the
 * calendar view stays cheap even when the clinic adds more dentists.
 */
async function openSlots(sql, { dateOnly, clinicians, timeZone = clinicTimeZone(), minimumLeadMinutes = leadMinutes() }) {
  if (!DATE_RE.test(String(dateOnly))) return [];
  if (!clinicians.length) return [];

  // The SQL driver in this project binds scalars only, so the day's rules and
  // bookings are read once and matched against the requested clinicians in memory.
  const rules = await sql`SELECT clinician_id, weekday, start_time, end_time, slot_minutes, room FROM doctor_availability
    WHERE active = true AND weekday = ${weekdayForDateOnly(dateOnly)} ORDER BY start_time`;
  if (!rules.length) return [];

  const dayStart = zonedTimeToUtc(dateOnly, '00:00', timeZone);
  const dayEnd = zonedTimeToUtc(addDays(dateOnly, 1), '00:00', timeZone);
  const booked = await sql`SELECT clinician_id, dentist, appointment_at, duration_minutes FROM appointments
    WHERE status IN ('requested', 'confirmed')
      AND appointment_at >= ${dayStart.toISOString()} AND appointment_at < ${dayEnd.toISOString()}`;

  const nameById = new Map(clinicians.map(clinician => [clinician.id, clinician.name]));
  const idByLowerName = new Map(clinicians.map(clinician => [clinician.name.toLowerCase(), clinician.id]));
  const relevantRules = rules.filter(rule => nameById.has(rule.clinician_id));
  if (!relevantRules.length) return [];

  const byClinician = new Map(clinicians.map(clinician => [clinician.id, []]));
  for (const row of booked) {
    const start = new Date(row.appointment_at);
    const interval = { start, end: new Date(start.getTime() + (Number(row.duration_minutes) || 60) * 60000) };
    const clinicianId = (row.clinician_id && nameById.has(row.clinician_id) && row.clinician_id)
      || idByLowerName.get(String(row.dentist || '').toLowerCase())
      || null;
    if (clinicianId) byClinician.get(clinicianId).push(interval);
  }

  const earliest = Date.now() + minimumLeadMinutes * 60000;
  const open = new Map();
  for (const rule of relevantRules) {
    const clinicianId = rule.clinician_id;
    for (const slot of ruleSlotStarts(rule, dateOnly, timeZone)) {
      const end = new Date(slot.date.getTime() + slot.slotMinutes * 60000);
      if (slot.date.getTime() < earliest) continue;
      if (overlaps(slot.date, end, byClinician.get(clinicianId) || [])) continue;
      const key = slot.date.toISOString();
      if (open.has(key)) continue;
      open.set(key, {
        start: key,
        end: end.toISOString(),
        time: slot.time,
        label: slotLabel(key, timeZone),
        durationMinutes: slot.slotMinutes,
        room: rule.room || '',
        clinicianId,
        clinician: nameById.get(clinicianId) || ''
      });
    }
  }
  return Array.from(open.values()).sort((a, b) => a.start.localeCompare(b.start));
}

/** Per-day counts for the next `days` days, used by the website date picker. */
async function openCalendar(sql, { clinicians, fromDateOnly, days = 14, timeZone = clinicTimeZone() }) {
  const total = Math.min(31, Math.max(1, Number(days) || 14));
  const result = [];
  for (let index = 0; index < total; index += 1) {
    const dateOnly = addDays(fromDateOnly, index);
    const slots = await openSlots(sql, { dateOnly, clinicians, timeZone });
    result.push({ date: dateOnly, weekday: weekdayForDateOnly(dateOnly), openCount: slots.length, firstSlot: slots[0]?.label || '' });
  }
  return result;
}

function maskedAuthor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Patient';
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1].slice(0, 1).toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

module.exports = {
  PUBLIC_SERVICES,
  DATE_RE,
  TIME_RE,
  rateLimited,
  bookingWindowMs,
  bookingLimit,
  lookupLimit,
  daysAhead,
  leadMinutes,
  normalizeService,
  normalizePhone,
  referenceFor,
  activeClinicians,
  openSlots,
  openCalendar,
  maskedAuthor,
  formatDateOnlyInZone
};
