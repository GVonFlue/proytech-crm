/* WHEN A REP MAY BOOK — the whole rule, in one file, with no imports.
   ============================================================================

   A rep picks from a fixed lattice of half-hour slots between 8am and 8pm. A
   slot is offered only when every calendar we read is EMPTY or holds nothing
   but a Banana-coloured event there.

   THE INVERSION IS THE POINT. Everything blocks unless it is explicitly marked
   soft. An event nobody remembered to colour stays protected, because the
   failure we can live with is "a rep had to escalate a time that was actually
   free" and the one we cannot is "a rep booked over a real commitment".

   So there is no list of colours that block. There is one colour that does not.

   NO IMPORTS, AND NOT BY ACCIDENT. Everything here is arithmetic over epoch
   milliseconds, which means the whole rule is testable in plain Node with no
   jsdom, no network and no clock of its own. Every function takes the times it
   needs rather than reading Date.now() — a rule that consults a hidden clock
   cannot be tested at a DST boundary, and the DST boundary is exactly where a
   booking grid gets it wrong.                                                */

/* Google's event palette, id 5. Verified against the live API rather than
   trusted from memory — see api/calendar-probe.js, which colours an event,
   reads it back and asserts. If Google ever renumbers the palette, that probe
   fails loudly and this constant is the one line to change. */
export const BANANA = '5';

export const DAY_START_HOUR = 8;     // 8am, inclusive
export const DAY_END_HOUR   = 20;    // 8pm, exclusive — the last slot ENDS here
export const SLOT_MINUTES   = 30;

/* The demo is ten minutes. The slot is thirty, and the calendar event spans the
   whole slot rather than just the demo, because the twenty minutes of prep
   buffer are as committed as the call is. An event that claimed 3:00–3:10 would
   leave 3:10–3:30 looking free to anyone reading the calendar directly, and the
   buffer exists precisely so that nobody books into it. */
export const DEMO_MINUTES = 10;

export const TZ_DEFAULT = 'America/Chicago';

/* ---------------------------------------------------------------------------
   TIME ZONES

   Every comparison in this file happens in ONE zone: the calendar owner's. The
   rep's browser zone is never consulted and must never be — a rep travelling,
   or a laptop left on the wrong zone, would otherwise be offered a lattice
   shifted by an hour against a busy list that was not, and the result LOOKS
   authoritative. An availability check that is confidently wrong is worse than
   no check, because the rep stops looking.

   Date's own local-time methods are useless here for the same reason: they read
   the host zone. Intl is the only thing in the platform that will answer
   questions about a NAMED zone, so it does the work.                        */

const FMTS = new Map();
function fmtFor(tz) {
  let f = FMTS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    FMTS.set(tz, f);
  }
  return f;
}

/** The wall-clock reading in `tz` at instant `ts`. */
export function wallParts(ts, tz) {
  const p = {};
  for (const part of fmtFor(tz).formatToParts(new Date(ts))) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  /* hour12:false yields '24' for midnight on some engines rather than '00'.
     Left unhandled it turns midnight into the following day at hour 24, which
     is a whole-day error rather than an hour one. */
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: (+p.hour) % 24, minute: +p.minute, second: +p.second,
  };
}

/** How far `tz` is from UTC at instant `ts`, in ms. Positive east of Greenwich. */
export function tzOffset(ts, tz) {
  const w = wallParts(ts, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The instant at which `tz` reads the given wall-clock time.
 *
 *  Two passes, and the second one is not optional. The offset we need is the
 *  offset AT THE ANSWER, but we can only measure it at a guess — and on the day
 *  a zone changes, the guess can land on the far side of the transition. One
 *  pass is right for 363 days a year and an hour out on the other two.        */
export function zonedToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off1 = tzOffset(guess, tz);
  const ts = guess - off1;
  const off2 = tzOffset(ts, tz);
  return off2 === off1 ? ts : guess - off2;
}

const asDate = s => String(s || '').split('-').map(Number);

/** Midnight-to-midnight in `tz` for a 'YYYY-MM-DD' day. What we ask Google for:
 *  the whole day, not just the bookable window, so that an event running from
 *  7am to 9am — or an all-day one — is in the answer rather than missed at the
 *  edge. */
export function dayWindow(date, tz) {
  const [y, mo, d] = asDate(date);
  const start = zonedToUtc(y, mo, d, 0, 0, tz);
  /* Day + 1 via UTC arithmetic on the CALENDAR date, not by adding 24h to the
     instant: a spring-forward day is 23 hours long and would come up short. */
  const nxt = new Date(Date.UTC(y, mo - 1, d + 1));
  return { start, end: zonedToUtc(nxt.getUTCFullYear(), nxt.getUTCMonth() + 1, nxt.getUTCDate(), 0, 0, tz) };
}

const label12 = (h, mi) => {
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, '0')} ${ampm}`;
};
const pad = n => String(n).padStart(2, '0');

/** The lattice for one day: every half hour from 8am, the last one ending at 8pm.
 *
 *  Built in WALL-CLOCK steps and converted per slot, not by adding 30 minutes of
 *  real time to the previous instant. Those differ across a DST transition, and
 *  while the bookable window never contains 2am today, a lattice that is only
 *  correct because of where the window happens to sit is a trap for whoever
 *  widens it later. */
export function slotsForDay(date, tz = TZ_DEFAULT) {
  const [y, mo, d] = asDate(date);
  if (!y || !mo || !d) return [];
  const out = [];
  const span = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  for (let m = 0; m + SLOT_MINUTES <= span; m += SLOT_MINUTES) {
    const h  = DAY_START_HOUR + Math.floor(m / 60), mi = m % 60;
    const m2 = m + SLOT_MINUTES;
    const h2 = DAY_START_HOUR + Math.floor(m2 / 60), mi2 = m2 % 60;
    out.push({
      hhmm: `${pad(h)}:${pad(mi)}`,
      label: label12(h, mi),
      start: zonedToUtc(y, mo, d, h, mi, tz),
      end: zonedToUtc(y, mo, d, h2, mi2, tz),
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   WHAT COUNTS AS BUSY                                                        */

/** One Google event → one interval, or null if it is not a commitment at all.
 *
 *  WHAT IS DELIBERATELY NOT CHECKED HERE: whether the owner declined it,
 *  whether it is marked Free rather than Busy, and whether it runs all day.
 *  All three block. Google's own soft signals have been replaced by exactly one
 *  signal — the colour — and honouring a second one behind the operator's back
 *  would put holes in the lattice that nobody asked for and nobody could see.
 *
 *  Cancelled is different, and is the one status that drops out: a cancelled
 *  instance is a deleted event, not a quiet one. Google returns them as
 *  exceptions to a recurring series, so a weekly slot the owner cancelled once
 *  would otherwise block that week forever. */
export function classifyEvent(ev, tz = TZ_DEFAULT) {
  if (!ev || ev.status === 'cancelled') return null;
  const st = ev.start || {}, en = ev.end || {};
  let start, end;
  if (st.dateTime) {
    /* An RFC3339 stamp carries its own offset, so this is absolute and the zone
       argument is not consulted. */
    start = Date.parse(st.dateTime);
    end   = Date.parse(en.dateTime || st.dateTime);
  } else if (st.date) {
    /* All-day events are dates, not instants, and Google's end date is
       EXCLUSIVE — a one-day event ends on the following morning. */
    const [ay, am, ad] = asDate(st.date);
    const [by, bm, bd] = asDate(en.date || st.date);
    start = zonedToUtc(ay, am, ad, 0, 0, tz);
    end   = zonedToUtc(by, bm, bd, 0, 0, tz);
    if (!(end > start)) end = start + 86400000;
  } else return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end, soft: String(ev.colorId == null ? '' : ev.colorId) === BANANA };
}

/** Every event on the day, classified. Order is irrelevant; overlap is not. */
export function busyFrom(events, tz = TZ_DEFAULT) {
  return (Array.isArray(events) ? events : [])
    .map(e => classifyEvent(e, tz))
    .filter(Boolean);
}

/* ---------------------------------------------------------------------------
   THE ANSWER                                                                 */

/** Slot states, in the order a rep should prefer them.
 *   open    nothing there at all
 *   soft    only Banana — bookable, and booking it displaces something
 *   blocked a real commitment overlaps
 *   past    the time has gone
 */
export const BOOKABLE = new Set(['open', 'soft']);
export const isBookable = s => BOOKABLE.has(s && s.state);

/** Mark the lattice against the day's busy list.
 *
 *  `now` is passed, never read from the clock, so that "is this slot in the
 *  past" is as testable as everything else. A slot counts as past once it has
 *  STARTED: a rep on the phone at 2:58 can still take the 3:00. */
export function markSlots(slots, busy, { now = 0 } = {}) {
  const list = Array.isArray(busy) ? busy : [];
  return (slots || []).map(s => {
    let hard = false, soft = false;
    for (const iv of list) {
      /* Half-open overlap. Back-to-back is not a clash: an event ending at 3:00
         does not touch the slot starting at 3:00, and treating it as a clash
         would delete a legitimately free slot from every hour of the day. */
      if (!(iv.start < s.end && iv.end > s.start)) continue;
      if (iv.soft) soft = true; else hard = true;
    }
    const state = now && s.start <= now ? 'past'
      : hard ? 'blocked'
      : soft ? 'soft'
      : 'open';
    return { ...s, state };
  });
}

/** Everything a picker needs for one day, from the raw event lists. */
export function availabilityFor(date, events, { tz = TZ_DEFAULT, now = 0 } = {}) {
  return markSlots(slotsForDay(date, tz), busyFrom(events, tz), { now });
}

/** The slot a rep tapped, found again in a freshly-read lattice.
 *
 *  Matched on wall-clock time rather than on the instant, so that a lattice
 *  rebuilt from a new read lines up with the one the rep was looking at. */
export const slotAt = (slots, hhmm) => (slots || []).find(s => s.hhmm === hhmm) || null;

/** Local wall-clock strings for api/calendar-event.js, which takes
 *  'YYYY-MM-DDTHH:MM:SS' plus a zone name rather than an instant. Derived from
 *  the slot's own instants in the calendar's zone, so the string that reaches
 *  Google is the same time the availability check approved. */
export function slotWallClock(slot, tz = TZ_DEFAULT) {
  const w = ts => {
    const p = wallParts(ts, tz);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00`;
  };
  return { start: w(slot.start), end: w(slot.end), timezone: tz };
}
