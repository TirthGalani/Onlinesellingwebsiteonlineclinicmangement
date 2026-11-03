# Vercel deployment starter

This repository is a static vanilla HTML/CSS/JS demo with initial serverless API routes. It is not production-ready for real patient records.

## Deploy
1. Push this project to a private Git repository and import it into Vercel.
2. Create a hosted Postgres database (Neon is a compatible option) and add its connection string as `DATABASE_URL` in Vercel Project Settings → Environment Variables.
3. Generate a unique random `JWT_SECRET` and add it there. Never commit `.env` or secrets.
4. Deploy, then check `/api/health` and confirm `storageConfigured: true`.

The appointments endpoint expects a signed-in identity token. Authentication, role provisioning, patient chat persistence, secure file storage, audit logging, backups, and health-data compliance review still need implementation before real patient data is used. `localStorage` remains the current frontend store until it is migrated to authenticated API calls.

Vercel hosts the frontend and functions; a database is a separate service and may have free-tier limits or paid usage. Verify current vendor pricing and healthcare data terms for your region before choosing a provider.
