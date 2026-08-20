// Tells the app whether a Google account is connected, and which one.
//
// THIS REQUIRES A SESSION, and it is worth saying why for something that only
// reports a boolean and an address.
//
// It returns the email of the Google account the whole install writes to —
// a real person's inbox. Unauthenticated, that is a working endpoint for
// harvesting the owner's address off any deployment of this app, and it needs
// no knowledge of the CRM at all: one GET, no arguments, no login.
//
// POST rather than GET so it goes through the same guard() as every other
// endpoint here. guard() is POST-only by design, and a second bespoke auth path
// for one status read is exactly the kind of parallel system ENGINEERING §5
// warns about — one implementation of "is this a real session", not two.
import { guard, sweep } from './_guard.js';
import { loadGoogle } from './_google.js';

export default async function handler(req, res) {
  // Every signed-in user may ask: a rep needs to know whose calendar a booking
  // lands on, and the booking screen says so out loud. Signed-in, not owner.
  const gate = await guard(req, res, {
    name: 'google-status', perIp: 60, windowMin: 10, perDay: 5000,
    maxChars: 2000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();

  try {
    const g = await loadGoogle();
    res.status(200).json({ connected: !!(g && g.refresh_token), email: (g && g.email) || '' });
  } catch (e) {
    res.status(200).json({ connected: false, email: '', error: e.message });
  }
}
