// api/coffee-availability.js — PUBLIC endpoint for the /coffee booking page on
// getproytech.com. Given a date, it reads Google free/busy across every
// calendar in CALENDAR_IDS (yours + Logan's) and returns which of the three
// fixed coffee windows are open.
//
// Reuses the exact same machinery the CRM's own scheduler uses:
//   _google.js      getAccessToken(), calendarIds(), calendarTz()
//   availability.js dayWindow(), availabilityFor(), isBookable()
// so "is this slot free" is decided by one rule in one place, not two.
//
// A coffee window is 60 minutes and the lattice is 30, so each window maps to
// TWO underlying slots; the window is offered only when BOTH are bookable.
//
// Public by design (no login on the marketing site), but rate-limited and
// CORS-locked to getproytech.com. No calendar details ever leave the server —
// the response is just a list of open window ids.

import { guard, sweep } from './_guard.js';
import { getAccessToken, calendarIds, calendarTz } from './_google.js';
import { dayWindow, availabilityFor, isBookable, slotAt } from '../src/lib/availability.js';

// The three coffee windows, each defined by the two 30-min lattice slots it covers.
export const COFFEE_WINDOWS = [
  { id: '0900', slots: ['09:00', '09:30'] },
  { id: '1030', slots: ['10:30', '11:00'] },
  { id: '1200', slots: ['12:00', '12:30'] },
];

const ALLOW_ORIGIN = 'https://www.getproytech.com';

function cors(res, origin) {
  // Allow the marketing site (www and apex) to call this cross-origin.
  const ok = origin === 'https://www.getproytech.com' || origin === 'https://getproytech.com';
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
    const date = String((req.query && req.query.date) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ ok: false, error: 'bad date' }); return;
    }

    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: true, open: [], reason: 'calendar_not_connected' }); return; }

    const tz = calendarTz();
    const { start, end } = dayWindow(date, tz);
    const timeMin = new Date(start).toISOString();
    const timeMax = new Date(end).toISOString();

    // Pull the day's events from EVERY calendar we read; merge into one event list.
    const ids = calendarIds();
    let events = [];
    for (const id of ids) {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
        + `?singleEvents=true&orderBy=startTime&maxResults=250`
        + `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) {
        // One calendar failing to read must FAIL CLOSED for that calendar's
        // owner, not silently offer their busy time. Safest is to offer nothing.
        res.status(200).json({ ok: true, open: [], reason: 'calendar_read_failed' });
        return;
      }
      const j = await r.json();
      if (Array.isArray(j.items)) events = events.concat(j.items);
    }

    // Build the lattice for the day, marked against the merged busy list.
    const now = Date.now();
    const lattice = availabilityFor(date, events, { tz, now });

    // A window is open only when BOTH of its 30-min slots are bookable.
    const open = COFFEE_WINDOWS.filter(w =>
      w.slots.every(hhmm => {
        const s = slotAt(lattice, hhmm);
        return s && isBookable(s);
      })
    ).map(w => w.id);

    res.status(200).json({ ok: true, open });
  } catch (e) {
    // Fail closed: on error, offer nothing rather than risk double-booking.
    res.status(200).json({ ok: true, open: [], reason: 'error' });
  }
}
