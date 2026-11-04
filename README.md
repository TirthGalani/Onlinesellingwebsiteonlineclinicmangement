# Maison Dental — Clinic Management System

A sanctuary for aesthetic dentistry, prosthodontics, and biological oral health.
This repository has been cleanly divided into **`frontend/`** and **`backend/`** architectures with **all login authentication barriers removed** for immediate, open workspace access.

---

## 📁 Project Structure

```text
Clinic mangement system/
├── frontend/                     # Pure client-side application (Static HTML5/CSS3/ES6)
│   ├── index.html                # Main UI with Patient, Doctor & Management portals
│   ├── css/
│   │   ├── styles.css            # Responsive layout, typography, themes & luxury styling
│   │   └── luxury-showcase.css   # Supplemental showcases
│   ├── js/
│   │   ├── data.js               # Reactive client-side data store with demo persistence
│   │   └── app.js                # Core controller: tri-directional chat, booking, navigation
│   ├── assets/                   # Static assets, branding, and imagery
│   └── README.md                 # Frontend instructions
│
├── backend/                      # Serverless APIs, Postgres Database, and Utilities
│   ├── api/                      # Serverless functions (appointments, messages, audit, etc.)
│   ├── database/                 # PostgreSQL schema, migrations, and backup scripts
│   ├── scripts/                  # Automated verification and health check scripts
│   ├── server/                   # Server configurations
│   ├── package.json              # Backend dependencies and scripts
│   ├── .env.example              # Environment variables template
│   ├── vercel.json               # Vercel deployment configuration
│   └── README.md                 # Backend instructions
│
├── index.html                    # Root entrypoint (mirrored for 1-click live preview)
├── css/                          # Root styling (mirrored)
├── js/                           # Root scripts (mirrored)
└── README.md                     # This file
```

---

## 🚀 How to Run

### Option 1: Run the Frontend Directly (No Login Required)

The frontend runs with zero setup or build steps. All three workspaces (**Patient Portal**, **Doctor Workspace**, and **Management Workspace**) are fully functional with tri-directional chat, photo/PDF attachment support, interactive appointment booking, clinical plans, and reviews.

1. **Using VS Code Live Server / Any Static HTTP Server:**
   - Serve the project root or the `frontend/` directory at `http://127.0.0.1:5500/index.html`.
2. **Using Python:**
   ```bash
   python -m http.server 5500
   ```
   Open `http://localhost:5500` in your browser.
3. **Using Node `npx serve`:**
   ```bash
   npx serve frontend -p 5500
   ```

### Option 2: Run the Backend Services

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables:
   ```bash
   cp .env.example .env
   # Add your PostgreSQL / Neon connection string to .env
   ```
4. Run database migrations:
   ```bash
   npm run db:migrate
   ```
5. Run the local development server:
   ```bash
   npm start
   ```

---

## 🔓 Authentication Barrier Removed

- **Instant Role Switcher**: Click the profile avatar or top role badge anytime to open the **Workspace Profile Switcher**.
- **No Password Wall**: Seamlessly toggle between:
  - **Olivia Sterling** — Patient Portal (Treatment tracking, concierge chat, appointment booking)
  - **Dr. Alistair Vance** — Doctor Workspace (Patient charts, clinical plans, prescription messaging)
  - **Genevieve Laurent** — Management Workspace (Operations overview, appointment scheduling, staff coordination)
- **Shared Live State**: Tri-directional chat synchronizes across Patient, Doctor, and Management portals immediately in the browser session.

