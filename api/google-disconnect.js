// Forgets the stored Google connection.
//
// OWNER-ONLY, and it is worth saying why an eight-line endpoint needs the
// strongest check in the app.
//
// There is ONE Google connection per install (ENGINEERING §6 — not
// multi-tenant). Severing it is not a per-user action: it stops every rep
// booking meetings and every Sheets read, at once, until somebody with access
// to the Google account walks the OAuth flow again. Unauthenticated it was a
// one-line denial of service on the URL alone. Merely signed-in would still
// let any rep switch the feature off for the whole team.
//
// The counterpart action — connecting — is google-auth.js, a browser redirect
// that cannot carry a token and so cannot use guard() at all. It is deliberately
// left alone here: it is where the missing OAuth `state` has to be generated,
// and that fix touches google-callback.js and the stored-config format too.
// See API-AUDIT.md.
import { guard, sweep } from '@getproytech/core/guard';
import { clearGoogle } from './_google.js';

export default async function handler(req, res) {
  // requireAdmin implies requireAuth. Tiny body: an action with no arguments.
  const gate = await guard(req, res, {
    name: 'google-disconnect', perIp: 10, windowMin: 10, perDay: 100,
    maxChars: 500, requireAdmin: true,
  });
  if (!gate.ok) return;
  sweep();

  try { await clearGoogle(); res.status(200).json({ ok: true }); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
}
