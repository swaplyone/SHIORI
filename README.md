# SHIORI (栞)
### *Plan. Build. Verify.* • A SwaplyOne Product

> An electronic-paper (E-Ink) developer task manager and collaborative workspace connected directly to GitHub repositories, commits, and work verification.

---

## Key Concepts & Architecture

1. **Project Model (Project = GitHub Repository)**
   - No orphan tasks. Every TODO belongs strictly to one GitHub repository project.
   - Connect GitHub once per account. Add repositories with 1 click without reconnecting.

2. **Signature Morph Bar (Dynamic Island Interaction)**
   - **E-Ink Focus Timer (TIME $\rightarrow$ INK)**: Black ink progresses from left to right with per-pixel dual-layer text inversion.
   - **OTP Verification Status**: Compact real-time countdown, waveform pulse, and confirmation fill.

3. **Automatic Work Verification & GitHub Webhooks**
   - 3-tier confidence evaluation matching commits and branch activity to auto-complete tasks.
   - Idempotent processing and abuse prevention (+10 push, +25 bonus).

4. **Code Recovery & File Version History**
   - Interactive version timeline per file.
   - Non-destructive safe recovery branches (`recovery/a82f31c-...`).

5. **Intentional Two-Sided Connections**
   - Zero user discovery: Connect exclusively through exact 6-character SHIORI IDs (`SHI-8F42K`).
   - Two distinct 6-digit OTPs sent via SMTP to both participants.

---

## Tech Stack
* **Frontend**: React, TypeScript, Vite, Tailwind CSS, Lucide Icons, Socket.IO Client.
* **Backend**: Node.js, Express, TypeScript, Socket.IO, SQL.js (SQLite), Nodemailer.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start Backend API (Port 4000)
npm --prefix server run dev

# 3. Start Frontend Client (Port 5173)
npm --prefix client run dev
```

---

## Production Deployment

* **Frontend**: Vercel / Netlify (`https://shiori.swaplyone.in`)
* **Backend**: Render Web Service (`https://api.shiori.swaplyone.in`)
