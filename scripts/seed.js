/* Seeds a realistic clinic so the portal is demonstrable.
 * Idempotent: fixed ids plus ON CONFLICT DO NOTHING, so re-running is safe.
 * Demo accounts only — never run this against a production database. */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const { database, usingEmbeddedDatabase, configuredDatabaseUrl } = require('../backend/api/_lib/db');

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'ClinicDemo2026!';

const DAY = 86400000;

function at(daysFromNow, hour, minute = 0) {
  const date = new Date(Date.now() + daysFromNow * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const USERS = [
  { id: 'seed-user-olivia', name: 'Olivia Sterling', email: 'olivia@maison.demo', phone: '+12125550100', role: 'patient' },
  { id: 'seed-user-marcus', name: 'Marcus Hale', email: 'marcus@maison.demo', phone: '+12125550111', role: 'patient' },
  { id: 'seed-user-sofia', name: 'Sofia Reyes', email: 'sofia@maison.demo', phone: '+12125550122', role: 'patient' },
  { id: 'seed-user-alistair', name: 'Dr. Alistair Vance, DDS', email: 'alistair@maison.demo', phone: '+12125550133', role: 'doctor' },
  { id: 'seed-user-julian', name: 'Dr. Julian Thorne, BDS', email: 'julian@maison.demo', phone: '+12125550144', role: 'doctor' },
  { id: 'seed-user-genevieve', name: 'Genevieve Laurent', email: 'genevieve@maison.demo', phone: '+12125550199', role: 'management' }
];

const AVAILABILITY = [
  { id: 'seed-avail-alistair-weekday1', clinician_id: 'seed-user-alistair', weekday: 1, start: '09:00', end: '17:00', slot: 60, room: 'Suite IV' },
  { id: 'seed-avail-alistair-weekday3', clinician_id: 'seed-user-alistair', weekday: 3, start: '09:00', end: '15:00', slot: 60, room: 'Suite IV' },
  { id: 'seed-avail-julian-weekday2', clinician_id: 'seed-user-julian', weekday: 2, start: '10:00', end: '18:00', slot: 30, room: 'Imaging Suite B' },
  { id: 'seed-avail-julian-weekday5', clinician_id: 'seed-user-julian', weekday: 5, start: '09:00', end: '13:00', slot: 30, room: 'Imaging Suite B' }
];

const APPOINTMENTS = [
  { id: 'seed-apt-olivia-fitting', patient: 'seed-user-olivia', service: 'Custom Porcelain Veneers', dentist: 'Dr. Alistair Vance, DDS', clinician: 'seed-user-alistair', at: at(8, 10, 30), status: 'confirmed', room: 'Suite IV', notes: 'Final shade matching and trial fitting for upper front teeth (teeth 6 to 11).' },
  { id: 'seed-apt-olivia-scan', patient: 'seed-user-olivia', service: '3D Digital Dental Scan', dentist: 'Dr. Julian Thorne, BDS', clinician: 'seed-user-julian', at: at(24, 14, 0), status: 'requested', room: 'Imaging Suite B', notes: 'Follow-up 3D digital scan to verify lower teeth alignment.' },
  { id: 'seed-apt-olivia-clean', patient: 'seed-user-olivia', service: 'Gentle Teeth Cleaning & Polishing', dentist: 'Dr. Alistair Vance, DDS', clinician: 'seed-user-alistair', at: at(-17, 9, 15), status: 'completed', room: 'Atelier I', notes: 'Annual routine dental check-up, gentle cleaning, and enamel polish.' },
  { id: 'seed-apt-marcus-consult', patient: 'seed-user-marcus', service: 'Cosmetic Smile Consultation & Design', dentist: 'Dr. Alistair Vance, DDS', clinician: 'seed-user-alistair', at: at(2, 11, 0), status: 'confirmed', room: 'Suite IV', notes: 'New smile architecture consultation.' },
  { id: 'seed-apt-marcus-aligners', patient: 'seed-user-marcus', service: 'Clear Aligners Consultation (Invisalign)', dentist: 'Dr. Julian Thorne, BDS', clinician: 'seed-user-julian', at: at(-4, 16, 0), status: 'completed', room: 'Imaging Suite B', notes: 'Aligner suitability review.' },
  { id: 'seed-apt-sofia-gum', patient: 'seed-user-sofia', service: 'Gentle Gum Health & Laser Care', dentist: 'Dr. Alistair Vance, DDS', clinician: 'seed-user-alistair', at: at(5, 15, 30), status: 'confirmed', room: 'Atelier II', notes: 'Biofilm care and laser gum therapy.' },
  { id: 'seed-apt-sofia-crown', patient: 'seed-user-sofia', service: 'Tooth-Colored Ceramic Inlay & Crown', dentist: 'Dr. Julian Thorne, BDS', clinician: 'seed-user-julian', at: at(-11, 10, 0), status: 'completed', room: 'Imaging Suite B', notes: 'Ceramic onlay fit and polish.' }
];

const TREATMENTS = [
  {
    id: 'seed-plan-olivia-veneers',
    patient: 'seed-user-olivia',
    clinician: 'seed-user-alistair',
    title: 'Custom Porcelain Veneers',
    status: 'in_progress',
    progress: 75,
    description: 'Handcrafted thin porcelain veneers to brighten and balance your front teeth.',
    milestones: [
      { label: 'Digital 3D Smile Preview & Design', completed: true, date: at(-53, 9, 0) },
      { label: 'Gentle Tooth Preparation & Temporary Veneers', completed: true, date: at(-31, 9, 0) },
      { label: 'Veneer Fitting & Natural Color Matching', completed: false, date: at(8, 10, 30) }
    ]
  },
  {
    id: 'seed-plan-sofia-gum',
    patient: 'seed-user-sofia',
    clinician: 'seed-user-alistair',
    title: 'Gum Health Recovery Programme',
    status: 'planned',
    progress: 20,
    description: 'Staged laser care and biofilm control to settle sensitive gums before any cosmetic work.',
    milestones: [
      { label: 'Baseline gum charting', completed: true, date: at(-9, 15, 30) },
      { label: 'First laser session', completed: false, date: at(5, 15, 30) },
      { label: 'Re-review and hygiene plan', completed: false, date: at(35, 11, 0) }
    ]
  }
];

const MESSAGES = [
  { id: 'seed-msg-olivia-1', thread: 'seed-thread-olivia', sender: 'seed-user-alistair', type: 'instruction', body: 'Please start using your prescribed soothing mouth rinse 48 hours before your appointment, twice daily after meals.', ago: -2 },
  { id: 'seed-msg-olivia-2', thread: 'seed-thread-olivia', sender: 'seed-user-alistair', type: 'standard', body: 'Dr. Vance rounded the canine tooth edges as you requested. The updated 3D preview is ready in your treatment plan.', ago: -2 },
  { id: 'seed-msg-olivia-3', thread: 'seed-thread-olivia', sender: 'seed-user-olivia', type: 'standard', body: 'Thank you — the new edges look much more natural. Should I still arrive at 10:30 for the fitting?', ago: -1 },
  { id: 'seed-msg-olivia-4', thread: 'seed-thread-olivia', sender: 'seed-user-alistair', type: 'standard', body: 'Yes, 10:30 in Suite IV. Complimentary valet will be ready for you at 450 Madison Avenue.', ago: -1 },
  { id: 'seed-msg-marcus-1', thread: 'seed-thread-marcus', sender: 'seed-user-alistair', type: 'standard', body: 'Looking forward to your smile design consultation. Please bring any reference photos you like.', ago: -3 },
  { id: 'seed-msg-marcus-2', thread: 'seed-thread-marcus', sender: 'seed-user-marcus', type: 'standard', body: 'Will do. Is the consultation included in the treatment cost?', ago: -1 }
];

const REVIEWS = [
  { id: 'seed-review-olivia', patient: 'seed-user-olivia', appointment: 'seed-apt-olivia-clean', rating: 5, title: 'The calmest dental visit I have had', content: 'Warm water cleaning, noise-cancelling headphones, and no discomfort at all. The studio genuinely feels considered.' },
  { id: 'seed-review-marcus', patient: 'seed-user-marcus', appointment: 'seed-apt-marcus-aligners', rating: 4, title: 'Clear plan, honest pricing', content: 'Dr. Thorne explained the aligner timeline plainly and showed the 3D preview before I committed.' },
  { id: 'seed-review-sofia', patient: 'seed-user-sofia', appointment: 'seed-apt-sofia-crown', rating: 5, title: 'Nobody can tell which tooth it is', content: 'The ceramic crown matches perfectly. Fitting took one visit and the finish is invisible.' }
];

const NOTIFICATIONS = [
  { id: 'seed-notif-olivia-1', user: 'seed-user-olivia', title: 'Appointment Confirmed', body: 'Your veneer try-in appointment has been confirmed in Suite IV.', type: 'success' },
  { id: 'seed-notif-olivia-2', user: 'seed-user-olivia', title: 'Doctor Instruction Received', body: 'Dr. Alistair Vance shared pre-visit gentle oral rinse guidance.', type: 'info' },
  { id: 'seed-notif-olivia-3', user: 'seed-user-olivia', title: 'Visit Reminder: Valet Parking', body: 'Complimentary valet service is ready at 450 Madison Avenue for your upcoming visit.', type: 'info' },
  { id: 'seed-notif-alistair-1', user: 'seed-user-alistair', title: 'New Treatment Request', body: 'A patient requested a 3D digital scan slot.', type: 'info' },
  { id: 'seed-notif-genevieve-1', user: 'seed-user-genevieve', title: 'Week Ahead', body: 'Three confirmed visits and two open slots remain in the schedule.', type: 'info' }
];

async function main() {
  if (!usingEmbeddedDatabase()) {
    console.warn(`Refusing to seed a live database (${configuredDatabaseUrl().split('@').pop()}).`);
    console.warn('Set DATABASE_URL to the placeholder or pass FORCE_SEED=1 to override.');
    if (process.env.FORCE_SEED !== '1') process.exit(1);
  }

  const sql = database();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Emails are the stable identity here: an account may already exist under a
  // different id, and every child row must point at the id the database chose.
  const ids = {};
  for (const user of USERS) {
    await sql`INSERT INTO clinic_users (id, name, email, phone, password_hash, role)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.phone}, ${passwordHash}, ${user.role})
      ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, phone = EXCLUDED.phone, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`;
    const rows = await sql`SELECT id FROM clinic_users WHERE email = ${user.email}`;
    ids[user.id] = rows[0].id;
  }
  const uid = seedId => ids[seedId] || seedId;
  await sql`UPDATE clinic_setup SET management_bootstrapped = true WHERE id = 1`;

  for (const slot of AVAILABILITY) {
    await sql`INSERT INTO doctor_availability (id, clinician_id, weekday, start_time, end_time, slot_minutes, room)
      VALUES (${slot.id}, ${uid(slot.clinician_id)}, ${slot.weekday}, ${slot.start}::time, ${slot.end}::time, ${slot.slot}, ${slot.room})
      ON CONFLICT (id) DO NOTHING`;
  }

  const names = Object.fromEntries(USERS.map(user => [user.id, user.name]));
  for (const appointment of APPOINTMENTS) {
    await sql`INSERT INTO appointments (id, patient_id, patient_name, service, dentist, clinician_id, appointment_at, status, notes, room, created_by)
      VALUES (${appointment.id}, ${uid(appointment.patient)}, ${names[appointment.patient]}, ${appointment.service}, ${appointment.dentist},
        ${uid(appointment.clinician)}, ${appointment.at}::timestamptz, ${appointment.status}, ${appointment.notes}, ${appointment.room}, ${uid(appointment.clinician)})
      ON CONFLICT (id) DO NOTHING`;
  }

  for (const plan of TREATMENTS) {
    await sql`INSERT INTO treatment_plans (id, patient_id, clinician_id, title, status, progress, description, milestones)
      VALUES (${plan.id}, ${uid(plan.patient)}, ${uid(plan.clinician)}, ${plan.title}, ${plan.status}, ${plan.progress}, ${plan.description}, ${JSON.stringify(plan.milestones)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  }

  const threads = [
    { id: 'seed-thread-olivia', patient: 'seed-user-olivia' },
    { id: 'seed-thread-marcus', patient: 'seed-user-marcus' }
  ];
  for (const thread of threads) {
    await sql`INSERT INTO chat_threads (id, patient_id) VALUES (${thread.id}, ${uid(thread.patient)}) ON CONFLICT (id) DO NOTHING`;
  }
  for (const message of MESSAGES) {
    const createdAt = at(message.ago, 9, 30);
    await sql`INSERT INTO chat_messages (id, thread_id, sender_id, body, message_type, created_at)
      VALUES (${message.id}, ${message.thread}, ${uid(message.sender)}, ${message.body}, ${message.type}, ${createdAt}::timestamptz)
      ON CONFLICT (id) DO NOTHING`;
  }

  for (const review of REVIEWS) {
    await sql`INSERT INTO patient_reviews (id, patient_id, appointment_id, rating, title, content)
      VALUES (${review.id}, ${uid(review.patient)}, ${review.appointment}, ${review.rating}, ${review.title}, ${review.content})
      ON CONFLICT (id) DO NOTHING`;
  }

  for (const notification of NOTIFICATIONS) {
    await sql`INSERT INTO user_notifications (id, user_id, title, body, notification_type, dedupe_key)
      VALUES (${notification.id}, ${uid(notification.user)}, ${notification.title}, ${notification.body}, ${notification.type}, ${`seed:${notification.id}`})
      ON CONFLICT (id) DO NOTHING`;
  }

  const counts = await sql`SELECT
    (SELECT count(*)::int FROM clinic_users) AS users,
    (SELECT count(*)::int FROM appointments) AS appointments,
    (SELECT count(*)::int FROM treatment_plans) AS plans,
    (SELECT count(*)::int FROM chat_messages) AS messages,
    (SELECT count(*)::int FROM patient_reviews) AS reviews,
    (SELECT count(*)::int FROM doctor_availability) AS availability`;
  const summary = counts[0];

  console.log('Seeded clinic data:');
  for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
  console.log('\nSign in with any of these and the shared password:');
  for (const user of USERS) console.log(`  ${user.role.padEnd(11)} ${user.email}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  if (usingEmbeddedDatabase()) console.log('\nStorage: embedded Postgres in backend/.pgdata');
}

main().catch(error => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
