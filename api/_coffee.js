// api/_coffee.js — the coffee booking rule, shared by /api/coffee-availability
// and /api/coffee-book so "is this window free for this host" is decided once.
// Underscore prefix => Vercel does NOT expose this as a route.
//
// Pure: no network, no clock of its own (`now` is passed), so the whole rule is
// testable in plain Node — see tests/coffee.mjs.
//
// WHY COFFEE DOES NOT USE THE 30-MINUTE LATTICE. src/lib/availability.js builds
// its lattice from DAY_START_HOUR (8am), and the CRM's rep picker depends on
// that. The 7:30 coffee would need the lattice to start earlier for everyone, so
// coffee windows are checked here by plain overlap against the same classified
// events instead. classifyEvent() still decides what an event IS (cancelled
// drops out, Banana is soft, all-day and transparent events block), so the two
// pickers agree on what counts as busy and differ only in the grid.
//
// WHY OWNERSHIP COMES FROM THE EVENT. Both hosts book onto ONE shared Google
// calendar, so the calendar an event sits on says nothing about whose time it
// is. Without this, Logan's 9am coffee hid 9am from anyone booking Garrett.
import { classifyEvent, dayWindow, zonedToUtc } from '../src/lib/availability.js';

/* Who can be booked. Env so another install can name its own people;
   the default is ProyTech's two hosts. */
export const COFFEE_HOSTS = String(process.env.COFFEE_HOSTS || 'Garrett,Logan')
  .split(',').map(s => s.trim()).filter(Boolean);

/* An event that cannot be attributed to exactly one host blocks every host. */
export const BOTH = '*';

export const COFFEE_MINUTES = 60;
export const COFFEE_WINDOWS = [
  { id: '0730', h: 7,  m: 30 },
  { id: '0900', h: 9,  m: 0 },
  { id: '1030', h: 10, m: 30 },
  { id: '1200', h: 12, m: 0 },
  { id: '1330', h: 13, m: 30 },
  { id: '1700', h: 17, m: 0 },
  { id: '1830', h: 18, m: 30 },
];

/* CUSTOM TIMES. The /coffee page lets a visitor pick any start time; the
   server accepts only a 15-minute step from 07:00 to 19:00 inclusive (so the
   latest coffee ends at 8 PM). Anything else is not a time we offer and is
   refused, never rounded: a rounded time is a booking nobody asked for.
   `customWindow('14:15')` is a window like the presets, id 'c1415'. */
export const CUSTOM_FIRST = 7 * 60, CUSTOM_LAST = 19 * 60, CUSTOM_STEP = 15;
export function customWindow(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]), t = h * 60 + mi;
  if (mi > 59 || t < CUSTOM_FIRST || t > CUSTOM_LAST || mi % CUSTOM_STEP) return null;
  return { id: 'c' + m[1] + m[2], h, m: mi, custom: true };
}
/* A slot id from a booking: a preset ('1330') or a custom 'cHHMM' ('c1415'),
   with the same validation as the availability check. Anything else: null. */
export function slotWindow(slot) {
  const s = String(slot == null ? '' : slot);
  const preset = COFFEE_WINDOWS.find(w => w.id === s);
  if (preset) return preset;
  const c = /^c(\d{2})(\d{2})$/.exec(s);
  return c ? customWindow(`${c[1]}:${c[2]}`) : null;
}
/* "2:15–3:15 PM", "11:45 AM–12:45 PM": one rule for every window's label, so
   a custom time reads exactly like a preset (the presets' labels in
   coffee-book's WINDOW_LABEL are checked against it in tests/coffee.mjs). */
export function windowLabel(w) {
  const at = t => { const h = Math.floor(t / 60) % 24, mi = t % 60; return { h12: h % 12 === 0 ? 12 : h % 12, mm: String(mi).padStart(2, '0'), ap: h < 12 ? 'AM' : 'PM' }; };
  const a = at(w.h * 60 + w.m), b = at(w.h * 60 + w.m + COFFEE_MINUTES);
  return a.ap === b.ap ? `${a.h12}:${a.mm}–${b.h12}:${b.mm} ${b.ap}` : `${a.h12}:${a.mm} ${a.ap}–${b.h12}:${b.mm} ${b.ap}`;
}

/** The canonical spelling of a host name, or null if it is not one of `hosts`. */
export function knownHost(name, hosts = COFFEE_HOSTS) {
  const n = String(name == null ? '' : name).trim().toLowerCase();
  return (n && hosts.find(h => h.toLowerCase() === n)) || null;
}

/* The title /api/coffee-book writes: "Coffee: <guest> ×<ZWSP> <host> (Brand)".
   Greedy `.*` takes the LAST ×, and the host is read from after it, so a guest
   called "Logan Smith" booking Garrett is still Garrett's coffee. The zero-width
   space is listed explicitly because \s does not match U+200B. */
const COFFEE_TITLE = /^\s*Coffee:.*×[\s​]*(.+?)[\s​]*\([^()]*\)\s*$/;

/** Whose time a calendar event takes: a host's name, or BOTH.
 *   a. extendedProperties.private.coffeeHost, set by /api/coffee-book
 *   b. the coffee title pattern (events booked before the tag existed)
 *   c. a title naming exactly one host ("Garrett: dentist")
 *   d. anything else — no name, both names, an unknown tag — blocks BOTH.
 *  (d) is the fail-safe: an event nobody can attribute protects everyone. */
export function eventOwner(ev, hosts = COFFEE_HOSTS) {
  const tag = ev && ev.extendedProperties && ev.extendedProperties.private
    && ev.extendedProperties.private.coffeeHost;
  if (tag != null && String(tag).trim()) return knownHost(tag, hosts) || BOTH;

  const title = String((ev && ev.summary) || '');
  const m = COFFEE_TITLE.exec(title);
  if (m) return knownHost(m[1], hosts) || BOTH;

  const lower = title.toLowerCase();
  const named = hosts.filter(h => lower.includes(h.toLowerCase()));
  return named.length === 1 ? named[0] : BOTH;
}

/** A coffee window on `date` ('YYYY-MM-DD') as instants, measured in `tz`.
 *  The end is computed as a wall-clock time and converted, not by adding an
 *  hour of real time, for the same DST reason slotsForDay() gives. */
export function windowInterval(date, w, tz) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const endMin = w.h * 60 + w.m + COFFEE_MINUTES;
  return {
    start: zonedToUtc(y, mo, d, w.h, w.m, tz),
    end: zonedToUtc(y, mo, d, Math.floor(endMin / 60), endMin % 60, tz),
  };
}

/** Every event on `date` across every calendar in `ids`, or NULL if any one of
 *  them could not be read. Null, not [], because an unread calendar is not an
 *  empty one: callers must offer nothing on null. `fetchFn` is injectable so
 *  that failure is testable without Google. */
export async function readDayEvents(ids, token, date, tz, fetchFn = fetch) {
  const { start, end } = dayWindow(date, tz);
  const timeMin = new Date(start).toISOString();
  const timeMax = new Date(end).toISOString();
  let events = [];
  for (const id of ids) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`
      + `?singleEvents=true&orderBy=startTime&maxResults=250`
      + `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
    let r;
    try { r = await fetchFn(url, { headers: { Authorization: 'Bearer ' + token } }); }
    catch { return null; }
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j) return null;
    if (Array.isArray(j.items)) events = events.concat(j.items);
  }
  return events;
}

/** The ids of the windows on `date` that are free for `host`.
 *
 *  With a known host, an event blocks only if it is that host's or BOTH's.
 *  With no host — or one we do not recognise — every event blocks, which is
 *  the behaviour from before hosts existed and the safe reading of a typo.
 *  A window that has already started is never offered. */
export function openWindows(date, events, opts = {}) {
  const busy = busyFor(events, opts);
  return COFFEE_WINDOWS.filter(w => freeOf(busy, date, w, opts)).map(w => w.id);
}

/** Is ONE window (a preset or a custom time) free for `host`? The same owner
 *  rules and the same "already started" rule as openWindows — it is the same
 *  code. A null window (an invalid custom time) is never free. */
export function isWindowFree(date, events, w, opts = {}) {
  return !!w && freeOf(busyFor(events, opts), date, w, opts);
}

/* the events that block this host: their own, and anything unattributed */
function busyFor(events, { tz, host = '', hosts = COFFEE_HOSTS } = {}) {
  const who = knownHost(host, hosts);
  const busy = [];
  for (const ev of Array.isArray(events) ? events : []) {
    const iv = classifyEvent(ev, tz);
    if (!iv || iv.soft) continue;          // cancelled, unreadable, or Banana
    if (who) {
      const owner = eventOwner(ev, hosts);
      if (owner !== BOTH && owner !== who) continue;
    }
    busy.push(iv);
  }
  return busy;
}
function freeOf(busy, date, w, { tz, now = 0 } = {}) {
  const { start, end } = windowInterval(date, w, tz);
  if (now && start <= now) return false;
  // Half-open overlap: an event ending at 9:00 does not touch the 9:00 window.
  return !busy.some(iv => iv.start < end && iv.end > start);
}
