// Reads every calendar that decides a booking, for ONE day, and returns the
// busy intervals with the one bit that matters: hard or soft.
//
// POST { date:'YYYY-MM-DD' } -> { ok, tz, now, intervals:[{start,end,soft}], calendars:[...] }
//
// SIGNED-IN, NOT OWNER-ONLY, for the same reason api/calendar-event.js is:
// reps book meetings, and a rep who cannot see availability books blind. What
// crosses the wire is deliberately thin — start, end, and whether it is soft.
// No titles, no attendees, no ids. A rep is deciding WHETHER to displace
// something, never which thing, so the content of the owner's calendar has no
// business in a rep's browser.
//
// WHY events.list AND NOT freebusy.query
//
//   1. freebusy does not return colour. It returns intervals and nothing else,
//      so it cannot express "Banana is soft" — the entire rule.
//   2. freebusy is not covered by this install's scopes anyway. The grant holds
//      calendar.events, which reads and writes events on every calendar the
//      account can reach; freebusy.query wants calendar.readonly or
//      calendar.freebusy. So the colour requirement steers us onto the endpoint
//      we already have consent for. Nobody has to reconnect.
//
// singleEvents=true IS LOAD-BEARING. Without it a recurring series comes back
// as one master row carrying a recurrence rule, and the individual instances
// are simply absent — a standing Tuesday meeting would be invisible and we
// would book straight over it. It is one query parameter and it is the
// difference between this feature working and this feature being a hazard.
import { guard, sweep } from './_guard.js';
import { calendarIds, calendarTz, getAccessToken } from './_google.js';
import { busyFrom, dayWindow } from '../src/lib/availability.js';

const API = 'https://www.googleapis.com/calendar/v3/calendars';

/* A day cannot hold 2500 events. The page loop exists so that a shared calendar
   full of subscribed noise degrades into "slow" rather than "quietly truncated
   and therefore quietly free". */
const PAGE = 250;
const MAX_PAGES = 10;

/** Every event touching [timeMin, timeMax) on one calendar. Throws rather than
 *  returning empty: an unread calendar is NOT an empty calendar, and the whole
 *  design depends on never confusing the two. */
export async function readCalendar(id, token, timeMin, timeMax, fetchFn = fetch) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = new URLSearchParams({
      singleEvents: 'true',            // expand recurrences into instances
      orderBy: 'startTime',            // only legal WITH singleEvents
      showDeleted: 'false',
      maxResults: String(PAGE),
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
    });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await fetchFn(`${API}/${encodeURIComponent(id)}/events?${q}`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      /* 404 here almost always means the calendar was never shared with this
         account, or was un-shared. Naming it is the difference between a
         five-minute fix and an afternoon. */
      const msg = (j.error && j.error.message) || `HTTP ${r.status}`;
      throw new Error(`${id}: ${msg}`);
    }
    out.push(...(Array.isArray(j.items) ? j.items : []));
    pageToken = j.nextPageToken || '';
    if (!pageToken) return out;
  }
  throw new Error(`${id}: more pages than expected — refusing to answer from a partial read`);
}

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'calendar-availability', perIp: 240, windowMin: 10, perDay: 4000,
    maxChars: 500, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();

  const tz = calendarTz();
  try {
    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: false, error: 'not_connected', tz }); return; }
    const date = String((req.body || {}).date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ ok: false, error: 'date required' }); return; }

    const ids = calendarIds();
    const { start, end } = dayWindow(date, tz);

    /* FAIL CLOSED, AND THIS IS THE WHOLE POINT OF Promise.all HERE.
       If his calendar reads and mine does not, the honest answer is "we do not
       know", NOT the half of the truth we happen to hold. A partial answer
       would render as a confident grid of open slots covering commitments we
       simply failed to read — the exact failure this feature exists to stop.
       One rejection rejects the request, and the client falls back to the
       unverified grid, which at least says so on its face. */
    const perCal = await Promise.all(
      ids.map(id => readCalendar(id, token, start, end).then(items => ({ id, items })))
    );

    const intervals = perCal.flatMap(c => busyFrom(c.items, tz))
      .map(({ start: s, end: e, soft }) => ({ start: s, end: e, soft }));

    res.status(200).json({
      ok: true, tz, date, now: Date.now(), intervals,
      calendars: perCal.map(c => ({ id: c.id, events: c.items.length })),
    });
  } catch (e) {
    /* 200 with ok:false, like calendar-event.js: this is a condition the client
       is expected to handle and show, not an exception to swallow. */
    res.status(200).json({ ok: false, tz, error: e.message || 'availability read failed' });
  }
}
