# Maison Dental — deployment and operations

This project is a static clinic portal (`index.html`, `css/`, `js/`) backed by Vercel
serverless API routes (`api/`) and PostgreSQL. The portal has no demo sign-in path:
every account signs in against the database and every portal reads and writes through
authenticated API calls.

## Implemented in this release

| Area | What is implemented |
| --- | --- |
| Sign-in | Bcrypt password hashes, JWT in an HttpOnly/SameSite cookie, 8-hour sessions, login throttling, active-account checks, same-origin mutation checks, role checks on every route. No demo credentials in the UI. |
| Roles | Patient, doctor and management permissions are enforced server-side. Management provisions staff; patients self-register. Doctors only see their own caseload and conversations. |
| Data | Users, appointments, availability rules, treatment plans, chat threads/messages, attachments, reviews, notifications, delivery attempts, reminders and audit events are stored in PostgreSQL. |
| Appointments | Availability-aware booking, overlap conflict detection, confirmation, cancellation, rescheduling, rooms, duration, patient search and paginated message history. |
| Files | Private JPEG/PNG/WebP/PDF chat attachments stored in Postgres; magic-byte validation, 3 MB decoded cap, five attachments per message, per-thread access checks, `no-store` downloads and a restrictive download CSP. |
| Notifications | In-app notifications plus optional Resend email and Twilio SMS, per-channel delivery status (`sent`, `skipped`, `failed`), failed-delivery retries and a daily reminders cron. |
| Safeguards | Append-only application audit log, `/api/health` schema/config check, CSP and security headers, backup script with checksums and audit rows, and compliance/security runbooks. |

## 1. Database

Create a PostgreSQL database (Neon is the installed driver) and apply the schema:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'
npm run db:migrate
```

`database/schema.sql` is idempotent. It creates missing tables and adds new columns to
an existing install. Review it before running against a database that already contains
real records.

> Use a **new empty database** for the first production launch. The old prototype
> database contains demo content and must not be promoted to production.

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables. Copy names from
`.env.example`; never commit real values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string with TLS. |
| `JWT_SECRET` | yes | At least 32 random bytes. Rotating it invalidates every session. |
| `ADMIN_BOOTSTRAP_KEY` | once | One-time key for creating the first management account. Delete after use. |
| `APP_ORIGIN` | recommended | Public origin used in notification links, no trailing slash. |
| `CLINIC_TIMEZONE` | recommended | IANA timezone for availability, default `America/New_York`. |
| `RESEND_API_KEY` | optional | Enables email delivery. |
| `MAIL_FROM` | with Resend | Verified sender, e.g. `Maison Dental <notifications@clinic.example>`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | optional | Enables SMS delivery. Contacts must be E.164 (`+12125550199`). |
| `CRON_SECRET` | for reminders | Bearer secret automatically sent by Vercel Cron to `/api/reminders`. |
| `ATTACHMENT_MAX_BYTES` | optional | Lower the 3 MB hard cap if needed. |

Keep secrets only in Vercel/environment storage. `.env` is git-ignored. Do not put
provider keys in `js/`, `index.html`, or any public asset.

## 3. Deploy and verify

1. Deploy the project to Vercel.
2. Open `GET /api/health`. A healthy deployment returns:

```json
{
  "ok": true,
  "status": "ok",
  "databaseReachable": true,
  "schemaReady": true,
  "authConfigured": true,
  "notifications": { "email": "configured", "sms": "configured" }
}
```

`ok: false` with `missing` names means the schema is behind: run `npm run db:migrate`.
Set up an external uptime monitor against `/api/health` and alert on non-200 or
`ok: false`. Check Vercel function logs for `console.error` entries.

## 4. Create the first management account (one time)

```bash
curl -X POST https://YOUR_DOMAIN/api/bootstrap \
  -H 'Content-Type: application/json' \
  -H "x-bootstrap-key: $ADMIN_BOOTSTRAP_KEY" \
  -d '{"name":"Clinic Director","email":"director@clinic.example","phone":"+12125550199","password":"a-long-passphrase-123"}'
```

Then **delete `ADMIN_BOOTSTRAP_KEY` from Vercel and redeploy**. Bootstrap permanently
closes after the first management account.

## 5. Provision clinicians and staff

Only management may create staff accounts. Sign in with curl and keep the session cookie:

```bash
curl -c cookies.txt -X POST https://YOUR_DOMAIN/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"director@clinic.example","password":"a-long-passphrase-123"}'

curl -b cookies.txt -X POST https://YOUR_DOMAIN/api/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Dr. Alistair Vance, DDS","email":"vance@clinic.example","phone":"+12125550111","role":"doctor","password":"another-long-passphrase-123"}'
```

Patients create their own accounts in the portal. A doctor must have at least one
appointment with a patient before the API lets the doctor read that patient's record,
conversation or attachments.

## 6. Publish availability before booking

Management can use **Management → Clinician Availability**, and each doctor can use
**Doctor → My Weekly Availability**. Rules are clinic-local wall-clock times interpreted
in `CLINIC_TIMEZONE`.

Until rules exist for the selected day, the API allows a future time (manual/legacy
mode). Once rules exist, bookings must land on a published slot and cannot overlap an
existing `requested` or `confirmed` appointment. A conflict returns HTTP 409 with
`availableSlots`, which the booking form displays.

API example:

```bash
curl -b cookies.txt -X POST https://YOUR_DOMAIN/api/availability \
  -H 'Content-Type: application/json' \
  -d '{"clinicianId":"DOCTOR_USER_ID","weekday":1,"startTime":"09:00","endTime":"17:00","slotMinutes":60,"room":"Studio Suite IV"}'

curl -b cookies.txt 'https://YOUR_DOMAIN/api/availability?clinicianId=DOCTOR_USER_ID&date=2026-11-20'
```

## 7. Chat attachments

- Allowed: JPEG, PNG, WebP and PDF, verified by file signature, not just the extension.
- Maximum decoded size: **3 MB** (Vercel's JSON body limit is 4.5 MB; base64 expands by ~33%).
- Maximum five attachments per message.
- Files are stored as `bytea` in `message_attachments`, so they inherit database access
  control and point-in-time/backup coverage.
- Downloads go through `GET /api/attachments?id=…`, require an authenticated session and
  are scoped to the patient thread. PDFs are served as downloads.

If you later move to object storage, keep the same upload/download endpoints and access
checks; do not expose public bucket URLs.

## 8. Email and SMS

Email uses Resend (`RESEND_API_KEY`, `MAIL_FROM`). SMS uses Twilio. If a provider is not
configured, the notification is still saved in-app and the delivery row is recorded as
`skipped` with a reason, so nothing fails silently.

1. Verify the sending domain with the email provider.
2. Buy/verify an SMS sender and use E.164 destination numbers.
3. Set `CRON_SECRET` and deploy; `vercel.json` schedules `GET /api/reminders` daily.
4. Check the bell panel: each notification shows `email: sent`, `sms: skipped`, etc.
5. Failed provider deliveries are retried up to three times within 24 hours by the cron.

Manual reminder (doctor or management):

```bash
curl -b cookies.txt -X POST https://YOUR_DOMAIN/api/reminders \
  -H 'Content-Type: application/json' \
  -d '{"appointmentId":"APPOINTMENT_ID"}'
```

The scheduled route requires `Authorization: Bearer $CRON_SECRET`; Vercel Cron adds this
automatically when the environment variable is set.

## 9. Backups and restore drills

```bash
export DATABASE_URL='postgresql://…'
npm run backup
```

The script writes a custom-format `pg_dump` under `backups/` (git-ignored), computes a
SHA-256 checksum, records a `backup_runs` row and removes local dumps older than 14 days
(`BACKUP_RETENTION_DAYS`). Copy dumps to encrypted off-host storage.

Restore drill into a **separate** database:

```bash
createdb clinic_restore_test
pg_restore --no-owner --no-privileges -d clinic_restore_test backups/maison-YYYYMMDDTHHMMSSZ.dump
psql clinic_restore_test -c 'select count(*) from clinic_users; select count(*) from appointments;'
```

If you use Neon, enable point-in-time restore on the plan you need and document the
recovery window. Test a restore at least quarterly. Backups contain protected health
information: encrypt them and restrict access.

## 10. Verification before real patient data

Run locally:

```bash
npm run check   # syntax + module load for every JS/API file
npm test        # clinic-timezone/DST slot math
```

Then verify against a staging database and staging deployment:

- signed-out API requests return 401;
- patient cannot read another patient's appointments, threads or attachments;
- doctor cannot read a patient outside their caseload;
- management can search all patients, see audit events and provision staff;
- booking outside availability and double-booking both return 409;
- reschedule/cancel notify the patient and are recorded in audit;
- a 3 MB image/PDF uploads and downloads, while an oversized file or a renamed `.exe` is rejected;
- email/SMS delivery status is visible, or explicitly `skipped` with a reason;
- a foreign `Origin` mutation returns 403;
- `/api/health` reports `ok: true` and `schemaReady: true`;
- restore drill succeeds.

## Known limitations (be explicit about these before go-live)

- No multi-factor authentication and no automated password reset; management resets
  accounts. Deactivating an account in SQL does not revoke an issued JWT until it expires
  (maximum 8 hours) unless you rotate `JWT_SECRET`.
- No antivirus/content-disarm scanning for uploads. Add a scanning service before
  accepting patient-supplied files at scale.
- No realtime WebSocket channel; notifications poll every 30 seconds.
- No online payments/deposits.
- No external object storage; attachments live in Postgres and therefore in backups.
- Twilio delivery receipts/webhooks are not implemented; status reflects provider acceptance.
- No automated retention/deletion policy; define one in `COMPLIANCE.md`.
- The clinic location and legal regime must be confirmed by counsel before storing real
  dental or health information.
