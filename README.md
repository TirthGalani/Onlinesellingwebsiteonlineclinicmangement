# Maison Dental — Website & Clinic Portal

A luxury dental clinic website paired with an authenticated clinic management portal for patients, clinicians and management.

---

## Public website

The marketing site is plain HTML, CSS and JavaScript with no build step:

| Page | File | Purpose |
| --- | --- | --- |
| Home | `index.html` | Hero, trust signals, treatments, technology, testimonials |
| About | `about.html` | Clinic story, philosophy, dentists and technology |
| Services | `services.html` | General, cosmetic, orthodontics, restorative, paediatric and emergency care |
| Appointment | `appointment.html` | Appointment request form, WhatsApp handoff, hours and emergency contact |
| Patient Information | `patient-information.html` | First visit, insurance, pre/post care and FAQs |
| Gallery | `gallery.html` | Clinic spaces, technology, treatment imagery and lightbox |
| Testimonials | `testimonials.html` | Written reviews and video testimonial placeholders |
| Contact | `contact.html` | Contact details, WhatsApp, Google Map, parking and enquiry form |

Shared assets live in `css/site.css`, `js/site.js` and `assets/site/`.

### Run locally

```bash
npm install
npm start
```

- Website: http://127.0.0.1:5500/index.html
- Portal: http://127.0.0.1:5500/portal.html
- API health: http://127.0.0.1:5500/api/health

The server serves the site, the portal and the `/api/*` handlers on one origin, which the session cookie and the mutation origin guard require.

---

## Clinic portal

`portal.html` is the three-role portal (Patient, Doctor, Management). Its existing authentication, chat, appointments, treatment plans and reviews are preserved. The portal uses `css/styles.css`, `js/app.js`, `js/data.js`, `js/api.js` and the `/api` backend.

The `frontend/` directory is a legacy standalone copy from an earlier split. The root files are the active application.

---

## Backend

```bash
cd backend
npm install
# configure backend/.env (see backend/.env.example)
npm run db:migrate
npm start
```

The root `serve.js` loads `.env` and uses either the embedded Postgres database (`backend/.pgdata`) or Neon via `DATABASE_URL`.

---

## Live booking, reviews and smile cases

The website talks to four unauthenticated endpoints:

- `GET /api/public/availability?clinicians=1` — clinician list, services and booking window.
- `GET /api/public/availability?date=YYYY-MM-DD[&calendar=1&span=14]` — open slots, or open counts per day.
- `POST /api/public/book` — reserves a real slot and returns `status: "confirmed"` with a reference.
- `GET /api/public/reviews` and `GET /api/public/cases` — verified patient reviews and consented before/after cases.

Slots come from the clinician availability rules that doctors and management maintain in the portal, so the website cannot offer a time that is already taken: a second request for the same slot returns HTTP 409 with the remaining open times. Website bookings are stored with `source = 'website'` and appear in the management schedule with a **Website** badge and the patient's contact details.

`appointment.html` uses these endpoints when they respond and otherwise falls back to the WhatsApp request flow, so the page still works as a static site.

**Before publishing:**
- Management must save availability rules, or the website shows no open times.
- Smile cases are added in the Management workspace → Smile Case Library. A case can only be published with both photographs and a recorded consent date; "Withdraw consent" unpublishes it immediately.
- Reviews shown on the site are the ones patients wrote in the portal after a completed visit. Names are masked to "First L." unless `PUBLIC_REVIEWS_NAMES=full` is set with written permission.

Settings and limits are documented in `backend/.env.example`.

## Demo content and production notes

- Clinic name, address, phone, email and photography are placeholders. Replace them in `js/site.js` (`CLINIC`) and the page markup before publishing.
- The contact form opens the visitor's email app because no anonymous public contact endpoint is exposed.
- No live payments are included. Confirmation email/SMS for a booked slot needs the Resend/Twilio settings; without them the confirmation is shown on screen and the clinic is notified in the portal.
- Clinical text is general information, not a substitute for professional advice.
