// api/coffee-availability.js — PUBLIC endpoint for the /coffee booking page on
// getproytech.com. Given a date, and optionally a host, it reads every calendar
// in CALENDAR_IDS and returns which of the four fixed coffee windows are open.
//
// Body: { date: 'YYYY-MM-DD', host?: 'Garrett' | 'Logan' }
//
// The rule lives in ./_coffee.js (shared with /api/coffee-book, so the re-check
// at booking time is the same rule as the offer):
//   - Both hosts book onto ONE shared calendar, so an event's owner is read
//     from the EVENT (coffeeHost tag, coffee title, a host's name in the title).
//     With a host given, only that host's events and unattributable ones block.
//     With no host, every event blocks — the behaviour from before hosts.
//   - Windows are checked by plain overlap, not on the CRM's 30-minute lattice,
//     because the lattice starts at 8am and the first coffee is 7:30.
//
// Public by design (no login on the marketing site), but rate-limited and
// CORS-locked to getproytech.com. No calendar details ever leave the server —
// the response is just a list of open window ids.

import { guard, sweep } from './_guard.js';
import { getAccessToken, calendarIds, calendarTz } from './_google.js';
import { COFFEE_WINDOWS, openWindows, readDayEvents } from './_coffee.js';

// Re-exported for anything that imported the window list from here before it
// moved to ./_coffee.js.
export { COFFEE_WINDOWS };

const ALLOW_ORIGIN = 'https://www.getproytech.com';

function cors(res, origin) {
  // Allow the marketing site (www and apex) to call this cross-origin.
  const ok = origin === 'https://www.getproytech.com' || origin === 'https://getproytech.com';
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req, res) {
  cors(res, req.headers.origin);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const gate = await guard(req, res, { name: 'coffee-availability', perIp: 60, windowMin: 10, perDay: 2000 });
  if (!gate.ok) return;
  sweep();

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const date = String((body.date || '')).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ ok: false, error: 'bad date' }); return;
    }
    // Optional. An unrecognised name is treated as no host (everything blocks),
    // which can only offer FEWER windows, never a double-booking.
    const host = String(body.host || '').trim();

    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: true, open: [], reason: 'calendar_not_connected' }); return; }

    const tz = calendarTz();
    const events = await readDayEvents(calendarIds(), token, date, tz);
    // One calendar failing to read must FAIL CLOSED, not silently offer busy
    // time as free. Safest is to offer nothing.
    if (!events) { res.status(200).json({ ok: true, open: [], reason: 'calendar_read_failed' }); return; }

    const open = openWindows(date, events, { tz, now: Date.now(), host });
    res.status(200).json({ ok: true, open });
  } catch (e) {
    // Fail closed: on error, offer nothing rather than risk double-booking.
    res.status(200).json({ ok: true, open: [], reason: 'error' });
  }
}
