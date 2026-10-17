# Northstar Quality Operations

Electron desktop starter built with React, Vite, and MongoDB.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set `MONGODB_URI`, `MONGODB_DB`, and the SMTP values locally. Do not commit `.env`.
4. Run `npm run dev` to open the desktop app.

Sign-in accepts a username or email. Accounts in the `users` collection use:

```json
{
  "username": "agent",
  "usernameLower": "agent",
  "name": "Agent Name",
  "role": "Quality",
  "passwordHash": "<bcrypt hash>",
  "isActive": true
}
```

Supported roles are `Admin`, `Quality`, `Team Leader`, and `Manager`. Passwords must be stored as bcrypt hashes. The renderer never receives the MongoDB URI; database access stays in Electron's main process.

`npm run seed:admin` creates an Admin account once. Supply `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` in the process environment; an existing account with different details is never overwritten.

`npm run package:win` builds a Windows installer using `quality-assurance.png` as the app, window, taskbar, and installer icon.

## Quality evaluation email

Saving an evaluation through a saved form sends a formatted HTML email to the employee and the team leader. The optional CC field accepts comma-, semicolon-, or space-separated addresses. Direct evaluations do not send email.

Configure these values in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=quality@example.com
SMTP_PASS=your_smtp_password
SMTP_FROM=Northstar Quality Operations <quality@example.com>
```

The evaluation is saved even when SMTP is unavailable; the call queue displays the delivery status.

## Current scope

The sign-in flow reads MongoDB accounts, and Settings can test the database connection. Navigation, role-based page visibility, responsive layouts, and sample dashboard/list content are in place. Operational records and management actions are UI scaffolding and are not yet persisted to MongoDB.