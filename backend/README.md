# Backend — Maison Dental APIs & Database

Serverless API architecture and PostgreSQL database schemas for Maison Dental.

## Endpoints
- `/api/appointments.js` — Appointment booking, approval, and schedule management
- `/api/messages.js` — Conversation threads and message dispatch
- `/api/attachments.js` — Attachment upload and metadata verification
- `/api/treatments.js` — Clinical plans, shades, and treatment records
- `/api/reviews.js` — Patient testimonials and ratings
- `/api/availability.js` — Doctor and operatory schedule availability
- `/api/notifications.js` — Real-time event notifications

## Getting Started
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Run migrations
npm run db:migrate

# 4. Start local development server
npm start
```
