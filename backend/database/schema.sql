-- Maison Dental — PostgreSQL schema (idempotent).
-- Apply with: psql "$DATABASE_URL" -f database/schema.sql
-- Safe to re-run: tables are created if missing and new columns are added to existing installs.
-- Do not insert demo patient records into a production database.

CREATE TABLE IF NOT EXISTS clinic_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('patient', 'doctor', 'management')),
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clinic_users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE clinic_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
CREATE INDEX IF NOT EXISTS clinic_users_role_idx ON clinic_users(role);

CREATE TABLE IF NOT EXISTS clinic_setup (
  id integer PRIMARY KEY CHECK (id = 1),
  management_bootstrapped boolean NOT NULL DEFAULT false
);
INSERT INTO clinic_setup (id, management_bootstrapped) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_login_limits (
  rate_key text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE TABLE IF NOT EXISTS appointments (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES clinic_users(id),
  patient_name text NOT NULL,
  service text NOT NULL,
  dentist text NOT NULL,
  appointment_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'completed', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinician_id text REFERENCES clinic_users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS room text NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_from timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason text NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by text REFERENCES clinic_users(id);
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx ON appointments(patient_id, appointment_at);
CREATE INDEX IF NOT EXISTS appointments_dentist_date_idx ON appointments(dentist, appointment_at);
CREATE INDEX IF NOT EXISTS appointments_clinician_date_idx ON appointments(clinician_id, appointment_at);
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_unique ON appointments(dentist, appointment_at) WHERE status <> 'cancelled';

-- Weekly clinician availability. Times are clinic-local wall-clock times and are
-- interpreted in CLINIC_TIMEZONE (default America/New_York) by the API.
CREATE TABLE IF NOT EXISTS doctor_availability (
  id text PRIMARY KEY,
  clinician_id text NOT NULL REFERENCES clinic_users(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 60 CHECK (slot_minutes BETWEEN 15 AND 240),
  room text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS doctor_availability_clinician_idx ON doctor_availability(clinician_id, weekday, start_time);
CREATE UNIQUE INDEX IF NOT EXISTS doctor_availability_unique_slot ON doctor_availability(clinician_id, weekday, start_time, end_time);

CREATE TABLE IF NOT EXISTS chat_threads (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES clinic_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES clinic_users(id),
  body text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'standard' CHECK (message_type IN ('standard', 'instruction', 'medicine')),
  read_by text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(body) <= 8000)
);
CREATE INDEX IF NOT EXISTS chat_messages_thread_date_idx ON chat_messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS message_attachments (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 8388608),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS uploaded_by text REFERENCES clinic_users(id);
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS checksum text NOT NULL DEFAULT '';
-- Files are kept in Postgres so uploads inherit database encryption, backups and
-- access control. The API caps each file at ATTACHMENT_MAX_BYTES (3 MB by default).
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS file_data bytea;
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments(message_id);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES clinic_users(id),
  clinician_id text NOT NULL REFERENCES clinic_users(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  description text NOT NULL DEFAULT '',
  milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treatment_plans_patient_idx ON treatment_plans(patient_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS patient_reviews (
  id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES clinic_users(id),
  appointment_id text NOT NULL UNIQUE REFERENCES appointments(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL,
  content text NOT NULL,
  visibility text NOT NULL DEFAULT 'published' CHECK (visibility IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_reviews_visible_idx ON patient_reviews(visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS user_notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES clinic_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  notification_type text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS link_url text NOT NULL DEFAULT '';
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS delivery_summary text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_idx ON user_notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_notifications_user_date_idx ON user_notifications(user_id, created_at DESC);

-- One row per outbound channel attempt, so the UI and operations team can see
-- whether an email/SMS was sent, skipped because no provider is configured, or failed.
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id text PRIMARY KEY,
  notification_id text NOT NULL REFERENCES user_notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider text NOT NULL DEFAULT '',
  provider_message_id text,
  error text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx ON notification_deliveries(notification_id);

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id text PRIMARY KEY,
  appointment_id text NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_kind text NOT NULL DEFAULT 'scheduled',
  channel text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL DEFAULT '',
  provider_message_id text,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointment_reminders_appointment_idx ON appointment_reminders(appointment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  actor_id text REFERENCES clinic_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_entity_date_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_date_idx ON audit_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_date_idx ON audit_events(action, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  location text NOT NULL DEFAULT '',
  size_bytes bigint,
  checksum text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  notes text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON backup_runs(started_at DESC);
