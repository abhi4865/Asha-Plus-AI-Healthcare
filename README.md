ASHA+

A full-stack healthcare management platform built for **ASHA (Accredited Social Health Activist) workers** and **rural patients** in India. Asha Care digitizes patient registration, home-visit tracking, government health-scheme discovery, and gives users an AI-powered health assistant — all wrapped in a secure, role-based system for Super Admins, Admins, ASHA Workers, and Patients.

**🔗 Live Demo:** [https://asha-care-b95ff.web.app/](https://asha-care-b95ff.web.app/)

---

## ✨ Features

- **Role-based access control** — Super Admin, Admin, ASHA Worker, and Patient roles, each with their own dashboard and permissions, enforced both client-side and server-side.
- **Patient management** — Register, edit, search, and view detailed patient profiles with home-visit history (vitals, notes, health alerts — bilingual in English & Hindi).
- **ASHA worker management** — Super Admins can assign ASHA workers to one or more villages (or full "All Locations" access), with server-side scoped queries so workers only ever see their own patients.
- **🤖 Asha AI — Health Chatbot**
  - Answers health, medicine, nutrition, and wellness questions only (guarded against off-topic use).
  - Supports both **Hindi and English**, including voice input via the Web Speech API.
  - Structured, doctor-safe responses: instructions, common medicines table, and warning signs.
  - Backed by a free-tier **Gemini → Groq → Hugging Face** fallback chain with response caching.
  - **Download chat history as a PDF** to carry to a pharmacy or doctor.
- **📄 AI Medical Document Analysis** — Upload a photo of a prescription, lab report, or medicine pack; the app OCRs it (Tesseract.js) and returns an AI-generated summary, including automatic expiry-date detection for medicine packaging.
- **Government Schemes directory** — Browse and (for staff) manage health-related government scheme listings, bilingual.
- **Real-time updates everywhere** — Firestore `onSnapshot` listeners keep patient lists, visit history, and ASHA worker lists live across sessions.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Frontend Hosting | Firebase Hosting |
| Backend | Node.js + Express |
| Backend Hosting | Vercel Serverless Functions |
| Auth | Firebase Authentication (email/password + custom claims for roles) |
| Database | Firebase Firestore |
| AI Providers | Google Gemini, Groq, Hugging Face (fallback chain) |
| PDF Export | html2pdf.js |
| OCR | Tesseract.js |
| Voice Input | Web Speech API |

---

## 🏛️ Architecture

```
┌─────────────────────┐        HTTPS / Bearer Token        ┌──────────────────────────┐
│   React Frontend     │ ─────────────────────────────────▶│  Express API (Vercel)    │
│  (Firebase Hosting)  │◀─────────────────────────────────── backend/api/index.js     │
└─────────┬────────────┘         JSON responses             └───────────┬──────────────┘
          │                                                              │
          │ Firebase SDK — direct reads & real-time listeners           │ firebase-admin SDK
          ▼                                                              ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        Firebase (Auth + Firestore)                            │
│   Collections: users, patients, patients/{id}/visits, govt_schemes,           │
│                cached_responses                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

The frontend reads from Firestore **directly** for instant, real-time UI updates, but all writes and privileged operations (creating users, deleting records, calling AI providers) route through the Express/Vercel backend, which verifies the caller's Firebase ID token and role before touching the database.

---

## 👥 Roles

| Role | Access |
|---|---|
| **Super Admin** | Full control — manage admins, ASHA workers, patients, schemes, roles |
| **Admin** | Manage ASHA workers' patients, visits, and schemes |
| **ASHA Worker** | Register/edit patients in their assigned village(s), log home visits |
| **Patient** | View own profile & visit history, use the AI chatbot, browse schemes |

---

## 📁 Project Structure

```
asha-care/
├── frontend/                # React + Vite app (deployed to Firebase Hosting)
│   ├── src/
│   │   ├── App.jsx          # Main application: routing, auth, dashboards, chatbot, etc.
│   │   ├── api.js           # Centralized API client (attaches Firebase auth token)
│   │   └── firebaseConfig.js
│   └── ...
└── backend/                 # Express app (deployed as Vercel Serverless Functions)
    └── api/
        └── index.js         # All API routes, role checks, AI provider fallback chain
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project (Auth + Firestore enabled)
- API keys for at least one AI provider: Gemini, Groq, or Hugging Face

### 1. Clone the repository
```bash
git clone https://github.com/abhi4865/asha-care.git
cd asha-care
```

### 2. Frontend setup
```bash
cd frontend
npm install
```
Create a `.env` file:
```
VITE_API_URL=https://your-backend.vercel.app
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
Run locally:
```bash
npm run dev
```
Deploy to Firebase Hosting:
```bash
npm run build
firebase deploy --only hosting
```

### 3. Backend setup
```bash
cd backend
npm install
```
Set the following environment variables (in Vercel project settings, or a local `.env` for testing):
```
FIREBASE_SERVICE_ACCOUNT=<stringified Firebase service account JSON>
SETUP_TOKEN=<secret token for bootstrapping the first super_admin>
GEMINI_API_KEY=...
GROQ_API_KEY=...
HF_TOKEN=...
```
Deploy:
```bash
vercel --prod
```

### 4. Bootstrap the first Super Admin
```bash
curl -X POST https://your-backend.vercel.app/api/initializeAdmin \
  -H "Content-Type: application/json" \
  -d '{"setupToken":"YOUR_SETUP_TOKEN","email":"admin@example.com","password":"yourpassword","name":"Super Admin"}'
```

---

## 🔌 API Overview

All backend routes are `POST` and live under `/api/`. A few highlights:

| Endpoint | Description |
|---|---|
| `/api/createUser` | Create ASHA worker / patient / admin accounts (role-gated) |
| `/api/addPatient`, `/api/updatePatient`, `/api/deletePatient` | Patient CRUD |
| `/api/addVisit`, `/api/updateVisit`, `/api/deleteVisit` | Visit history CRUD |
| `/api/askHealthAssistant` | AI chatbot Q&A |
| `/api/analyzeMedicalDocument` | AI analysis of OCR'd medical documents |
| `/api/selfRegisterPatient` | Patient self-signup |
| `/api/adminCreatePatient` | Staff-created patient, optionally with a login account |

Every route verifies the caller's Firebase ID token and role before executing.

---

## 🙋 Author

Built by **Abhishek** ([@abhi4865](https://github.com/abhi4865)).

---

## 📄 License

This project is open for educational and portfolio purposes. Add a license of your choice if distributing publicly.
