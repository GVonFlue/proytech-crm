# ProyTech CRM

Private internal CRM for ProyTech. Vite + React + Supabase.

## Run locally
npm install
npm run dev

## Deploy
Push to GitHub, import the repo in Vercel (framework auto-detected as Vite).
No environment variables needed — the Supabase publishable key lives in src/lib/supabase.js
(safe to commit; protected by Row Level Security + login).

## Logins
Sign in with username + password (e.g. "garrett" / "logan").
Users are managed in the Supabase dashboard under Authentication.
