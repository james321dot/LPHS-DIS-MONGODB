# LPHS Digital Attendance System

LPHS DAS is a TanStack Start + React + TypeScript attendance application deployed to Cloudflare Workers.

## Database

The application uses MongoDB Atlas through the official MongoDB Node.js driver. Database access is server-only; the MongoDB URI is never bundled into browser JavaScript.

Required server environment variables:

- `MONGODB_URI`
- `MONGODB_DB` (defaults to `LPHS-DIS`)
- `SESSION_SECRET`
- `STAFF_GUARD_PASSWORD`
- `STAFF_ADMIN_PASSWORD`
- `STAFF_ECLUB_PASSWORD`
- `STAFF_DEV_PASSWORD`
- `ADMIN_PASSWORD`

For local development, copy `.env.example` to `.env` and fill in the values.

For Cloudflare, add the same values as Worker secrets/environment variables. Never commit the real `.env` or MongoDB connection string.

## MongoDB collections

The application creates and uses:

- `attendance` — attendance records
- `roster` — registered students/staff
- `scanEvents` — QR/manual scan history, capped at 500 records

## Authentication

Staff passwords are checked on the server. A short-lived HMAC-signed application session is returned after successful login. Every MongoDB operation verifies the session and role before accessing the database.

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Deploy:

```bash
npm run deploy
```
