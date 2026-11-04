# Security operations

This document describes how the clinic portal protects accounts and records, and what
operators must do. It is not a substitute for a formal risk assessment or legal advice.

## Authentication and session model

- Passwords are hashed with bcrypt (cost 12). Minimum policy: 12–128 characters with at
  least one letter and one number.
- Sign-in issues an HS256 JWT (`iss: maison-dental`, 8-hour expiry) in the
  `maison_session` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`.
- Login attempts are throttled per email + client IP. Five failures within 15 minutes
  lock that key for 15 minutes.
- `GET /api/auth/me` confirms the account still exists, still has the token's role, and
  is active.
- Sign-out clears the cookie. Rotating `JWT_SECRET` invalidates every outstanding session
  immediately.
- No demo accounts or shared credentials exist in the sign-in flow.

## Authorization

| Resource | Patient | Doctor | Management |
| --- | --- | --- | --- |
| Own appointments | read, request, cancel, reschedule | — | all |
| Caseload appointments | — | read/update assigned clinician only | all |
| Treatment plans | read own | read own caseload; create/update own authored plans | read all; update progress/status |
| Chat threads | own thread | only patients with an appointment to them | all |
| Attachments | own thread | own caseload | all |
| Reviews | submit after a completed visit | read published | read published |
| Patient directory | — | own caseload only | all |
| Availability | read slots for booking | read/write own weekly rules | read/write all |
| Audit, staff provisioning, reminders to any patient | — | own appointment reminders | yes |

Every route calls `requireUser` with the allowed roles and re-checks row ownership. It
never trusts a patient, thread, attachment or appointment id supplied by the browser.

## CSRF and browser protections

- Cookie-authenticated mutations require a same-origin `Origin`.
- State-changing routes only accept `POST`, `PATCH` or `DELETE`; JSON bodies are required
  for API mutations.
- `vercel.json` sets CSP (no `object-src`, no framing), HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a restrictive `Referrer-Policy`, and a
  `Permissions-Policy` that disables camera/microphone/geolocation/payment.
- API responses are `Cache-Control: no-store`.

## File upload controls

- Only JPEG, PNG, WebP and PDF are accepted, confirmed by magic bytes.
- 3 MB decoded cap, 5 files per message; filenames are reduced to a basename and
  control/quote characters are removed.
- Only the sender of a message may attach files to it.
- Downloads require a live session, pass a thread/caseload access check and return
  `no-store`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a sandbox CSP.
- PDFs download instead of rendering inline.
- **Gap:** no malware scanning. Add a scanning/CDR service before accepting
  patient-supplied files in production at scale.

## Secrets

- Store `DATABASE_URL`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_KEY`, provider keys and
  `CRON_SECRET` only in Vercel/environment secret storage.
- `.env` is git-ignored; never commit it, print it in logs, or put keys in `js/` or
  `index.html`.
- Rotate `JWT_SECRET` after suspected compromise (all users must sign in again).
- Remove `ADMIN_BOOTSTRAP_KEY` immediately after creating the first management account.
- Use separate database roles for the app (read/write DML) and migrations/backups where
  your database provider supports it.

## Audit trail

`audit_events` records sign-in, registration, staff creation, appointment
request/status/reschedule, availability changes, treatment changes, review creation,
message sends, attachment uploads, reminder sends and notification reads. The management
portal exposes the latest events through `GET /api/audit`.

The application only inserts audit rows; treat the table as append-only. Database
superusers can still alter it, so restrict direct database access. Retain audit events
according to your legal/retention policy and export them to immutable storage if needed.

## Monitoring and incident response

1. Uptime check `/api/health` every minute; alert on non-200 or `ok: false`.
2. Alert on spikes in 401/403/429 responses and on `failed` delivery rows.
3. Review Vercel function logs for `console.error` output; avoid logging PHI.
4. On suspected account compromise: rotate `JWT_SECRET`, reset the account password,
   review `audit_events` and delivery logs, preserve evidence, and follow your breach
   notification policy.
5. On suspected database compromise: rotate database credentials, take an isolated
   backup, restrict network access, and engage your provider/incident process.

## Hardening checklist before go-live

- [ ] Production database uses TLS; backups encrypted and restore-tested.
- [ ] `JWT_SECRET` and `CRON_SECRET` are long random values unique to this deployment.
- [ ] `ADMIN_BOOTSTRAP_KEY` deleted; no demo/sample accounts exist.
- [ ] Every staff account belongs to a named person; shared logins are prohibited.
- [ ] BAA/DPA signed with Vercel, Neon, email provider and SMS provider.
- [ ] MFA added at the identity/provider layer (recommended; not built into this app).
- [ ] Password reset and account deactivation procedure documented and tested.
- [ ] Upload malware scanning added.
- [ ] Retention, legal hold and deletion procedures documented.
- [ ] Staff trained on phishing, minimum-necessary access and secure devices.
- [ ] Privacy notice and patient consent flow reviewed by counsel.

## Reporting a vulnerability

Do not open a public issue with patient data. Contact the clinic's security owner through
the private channel documented in the operations handbook, include reproduction steps,
and avoid accessing records that are not yours.
