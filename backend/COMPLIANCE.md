# Privacy and compliance review

**This is an engineering checklist, not legal advice.** A qualified privacy/health lawyer
and the clinic's compliance officer must confirm the applicable regime before real dental
or health information is entered.

The portal UI references New York. If the clinic is a US covered entity or business
associate, HIPAA and applicable New York laws are likely relevant. If care is delivered in
Canada, PHIPA (Ontario) or PIPEDA and provincial rules may apply. If patients are in the
EU/UK, GDPR/UK GDPR may apply. Confirm the clinic's actual location, patient locations,
payer contracts and vendor relationships.

## Data inventory

| Data | Where it lives | Sensitivity |
| --- | --- | --- |
| Name, email, phone, role, password hash, last login | `clinic_users` | PII / account data |
| Appointment service, clinician, time, notes, cancellation reason | `appointments` | Health-adjacent PII |
| Treatment title, description, milestones, progress | `treatment_plans` | Clinical data |
| Chat messages and message type | `chat_messages`, `chat_threads` | Clinical communication |
| Images/PDFs (possibly dental photos, X-rays, prescriptions) | `message_attachments.file_data` | Clinical data, potentially biometric |
| Reviews and ratings | `patient_reviews` | PII + opinions |
| Notifications, delivery status, recipients | `user_notifications`, `notification_deliveries` | PII + metadata |
| Audit events and reminders | `audit_events`, `appointment_reminders`, `backup_runs` | Security/operational records |
| Backups | `backups/` and database provider snapshots | Copy of all of the above |

## Safeguards already in the code

- Role-based access control on every API route; doctors limited to their caseload.
- Password hashing, throttled sign-in, active-account checks and 8-hour sessions.
- Private, access-checked attachment downloads; file type/size validation.
- Audit trail for authentication and record changes.
- No third-party analytics or advertising scripts; only Google Fonts, Lucide icons and
  Unsplash demo imagery are loaded by the static page. **Remove the Unsplash/Google Fonts
  external dependencies or self-host them if your privacy review requires it**, because
  those requests disclose visitor IP addresses to third parties.
- Secrets kept out of the repository; CSP/HSTS/security headers in `vercel.json`.
- Backup script with checksums and restore instructions.

## Required before storing real patient information

### 1. Legal basis and notices

- [ ] Confirm HIPAA covered-entity/business-associate status, or the applicable
      provincial/national regime.
- [ ] Publish a privacy notice covering what is collected, why, who can see it, retention,
      vendors/subprocessors, and how to exercise access/correction/deletion rights.
- [ ] Obtain and record patient consent where required (treatment, communications,
      email/SMS reminders, photography).
- [ ] Define the minimum age/minor consent process.
- [ ] Document the lawful basis for any marketing or review publication; reviews are
      currently published to all signed-in users, so add a consent/visibility control
      before real reviews are collected.

### 2. Vendor agreements

- [ ] Signed BAA (US) or DPA/subprocessor terms with Vercel (hosting), Neon (database),
      Resend (email) and Twilio (SMS).
- [ ] Confirm data residency and cross-border transfer terms.
- [ ] Record each vendor's security certifications and breach notification commitments.
- [ ] Confirm email/SMS content is limited to the minimum necessary. Current reminder
      text includes service, clinician and time; review whether that is acceptable for
      SMS or reduce it to "You have an appointment — sign in for details."

### 3. Security risk analysis

- [ ] Complete a HIPAA security risk analysis (or equivalent) covering confidentiality,
      integrity and availability.
- [ ] Add MFA for staff (recommended: identity provider or Vercel/Neon MFA).
- [ ] Add malware scanning/content disarm for uploads.
- [ ] Confirm encryption at rest and in transit with the database and hosting providers.
- [ ] Test backups/restores and document recovery time/point objectives.
- [ ] Establish patch management and dependency review.
- [ ] Restrict production database access to named administrators; no shared credentials.

### 4. Retention, deletion and patient rights

- [ ] Define retention periods for clinical records, messages, attachments, audit events
      and backups, including legal minimums and litigation holds.
- [ ] Implement a deletion workflow (currently no automated retention job).
- [ ] Define how access/correction requests are verified and fulfilled.
- [ ] Ensure backups expire on a documented schedule and cannot resurrect deleted records
      indefinitely.
- [ ] Define a legal-hold process.

### 5. Breach response

- [ ] Written incident response plan with roles, escalation contacts and timelines.
- [ ] Breach notification procedure for the applicable jurisdiction.
- [ ] Log review and alerting ownership.
- [ ] Evidence preservation and patient communication templates.
- [ ] Tabletop exercise before launch.

### 6. Workforce and operations

- [ ] Unique named accounts; no shared logins; least-privilege roles.
- [ ] Training on phishing, device security, minimum necessary access and secure
      messaging.
- [ ] Offboarding checklist: deactivate the account, rotate shared secrets if exposed,
      and review audit events.
- [ ] Physical/administrative safeguards for front-desk devices and printed records.

## Go-live gate

Do **not** enter real dental or health information until:

1. the applicable legal regime and clinic location are confirmed in writing;
2. required BAAs/DPAs are signed;
3. the privacy notice, consent flow and retention policy are approved;
4. the risk analysis and breach plan are complete;
5. malware scanning and MFA decisions are implemented or formally risk-accepted;
6. a restore drill has succeeded;
7. counsel/compliance signs off on this checklist.

Until then, use synthetic test data only.
