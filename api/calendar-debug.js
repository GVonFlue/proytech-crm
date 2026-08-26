// What events.list ACTUALLY returned, for one day, unsummarised.
//
// POST { date:'YYYY-MM-DD' } -> the request URL, the raw count, and for every
// event its start, end and colorId — alongside how this app classified it and
// what the grid would therefore show.
//
// WHY IT EXISTS. The grid offered eleven slots on a day that had seven events
// on it, and there are three completely different reasons that can happen:
// the API returned nothing, it returned events that were then misclassified,
// or it was never called at all. Those three have three different fixes and
// they are indistinguishable from the outside. Guessing between them costs a
// deploy per guess; this costs one call.
//
// It reports the REQUEST, not a description of it — the URL comes from the
// same eventsUrl() the real read uses, so a wrong timeMin or a missing
// singleEvents shows up here as itself rather than as a second construction
// that happens to be correct.
//
// OWNER ONLY. It returns event titles, which is exactly what the availability
// endpoint deliberately strips before answering a rep. That asymmetry is the
// point: the owner debugging his own calendar may see it, a rep may not.
import { guard, sweep } from './_guard.js';
import { calendarIds, calendarTz, getAccessToken } from './_google.js';
import { eventsUrl, readCalendar } from './calendar-availability.js';
import { BANANA, busyFrom, classifyEvent, dayWindow, markSlots, slotsForDay } from '../src/lib/availability.js';

const iso = ts => (Number.isFinite(ts) ? new Date(ts).toISOString() : String(ts));

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'calendar-debug', perIp: 30, windowMin: 10, perDay: 200,
    maxChars: 500, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();

  const tz = calendarTz();
  const out = { tz, banana: BANANA, calendarIds: calendarIds() };
  try {
    const token = await getAccessToken();
    out.tokenPresent = !!token;
    if (!token) { res.status(200).json({ ok: false, error: 'not_connected', ...out }); return; }

    const date = String((req.body || {}).date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ ok: false, error: 'date required' }); return; }
    const { start, end } = dayWindow(date, tz);
    out.date = date;
    out.window = { timeMin: iso(start), timeMax: iso(end), startMs: start, endMs: end };

    out.calendars = [];
    let all = [];
    for (const id of calendarIds()) {
      const cal = { id, url: eventsUrl(id, start, end) };
      try {
        const items = await readCalendar(id, token, start, end);
        cal.count = items.length;
        /* Everything that could plausibly decide the answer, verbatim from
           Google. colorId is printed as its literal value INCLUDING absent, so
           "no colour" and "colour 5" cannot be confused in the output the way
           they would be by a boolean. */
        cal.events = items.map(e => {
          const c = classifyEvent(e, tz);
          return {
            summary: e.summary || '(no title)',
            start: (e.start && (e.start.dateTime || e.start.date)) || null,
            end: (e.end && (e.end.dateTime || e.end.date)) || null,
            colorId: e.colorId === undefined ? '(absent)' : e.colorId,
            allDay: !!(e.start && e.start.date && !e.start.dateTime),
            status: e.status || null,
            transparency: e.transparency || null,
            recurring: !!e.recurringEventId,
            classifiedAs: c ? (c.soft ? 'SOFT (banana)' : 'HARD') : 'DROPPED (not a commitment)',
            classifiedStart: c ? iso(c.start) : null,
            classifiedEnd: c ? iso(c.end) : null,
          };
        });
        all = all.concat(items);
      } catch (e) {
        cal.error = e.message || 'read failed';
        cal.count = null;
      }
      out.calendars.push(cal);
    }

    const failed = out.calendars.filter(c => c.error);
    const busy = busyFrom(all, tz);
    out.intervals = busy.map(b => ({ start: iso(b.start), end: iso(b.end), soft: b.soft }));
    /* now:0 on purpose — this must describe the RULE, not today's clock, or a
       diagnostic run in the afternoon reports the morning as 'past' and hides
       the very misclassification being hunted. */
    out.slots = markSlots(slotsForDay(date, tz), busy, { now: 0 })
      .map(s => `${s.label} ${s.state}`);
    out.summary = {
      eventsReturned: all.length,
      calendarsRead: out.calendars.length - failed.length,
      calendarsFailed: failed.length,
      hard: busy.filter(b => !b.soft).length,
      soft: busy.filter(b => b.soft).length,
      bookable: out.slots.filter(s => / (open|soft)$/.test(s)).length,
    };
    /* The three-way verdict, stated rather than left to be inferred from the
       numbers — the whole point is to separate these cases in one reading. */
    out.verdict = failed.length ? 'A CALENDAR FAILED TO READ — see calendars[].error'
      : all.length === 0 ? 'THE API RETURNED NOTHING for this window — the read is reaching Google but finding no events'
      : busy.length === 0 ? 'EVENTS RETURNED BUT ALL DROPPED — classification is the fault'
      : 'EVENTS RETURNED AND CLASSIFIED — if the grid disagrees with slots[] below, the grid is not calling this endpoint';

    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'debug failed', ...out });
  }
}
