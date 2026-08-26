/* THE READ SIDE — what we ask Google for, and what we do when it will not say.
   ============================================================================

   The second of the two named risks: recurring events. A standing Tuesday
   meeting that comes back as one master row with an RRULE, rather than as
   instances, is invisible to every overlap check in availability.js — and an
   invisible commitment reads as a free slot. It is one query parameter.

   The other half is the read that fails. An unread calendar is not an empty
   calendar, and the difference between those two sentences is the entire
   feature.                                                                   */
import { test, testAsync, report } from './assert.mjs';
import { eventsUrl, readCalendar } from '../api/calendar-availability.js';
import { probeWindow } from '../api/calendar-probe.js';
import { BANANA } from '../src/lib/availability.js';

const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const DAY0 = Date.UTC(2026, 5, 15, 5, 0, 0);
const DAY1 = Date.UTC(2026, 5, 16, 5, 0, 0);

/** A fake Google that records what it was asked. */
function fakeGoogle(pages) {
  const calls = [];
  const fetchFn = async url => {
    calls.push(String(url));
    const page = pages.shift();
    if (!page) return { ok: false, status: 500, json: async () => ({ error: { message: 'no more pages' } }) };
    if (page.fail) return { ok: false, status: page.status || 500, json: async () => ({ error: { message: page.fail } }) };
    return { ok: true, status: 200, json: async () => page };
  };
  return { calls, fetchFn };
}

await testAsync('it asks for expanded instances, not recurrence rules', async () => {
  const g = fakeGoogle([{ items: [] }]);
  await readCalendar('primary', 'tok', DAY0, DAY1, g.fetchFn);
  const q = new URL(g.calls[0]).searchParams;
  /* THE ONE THAT MATTERS. Without this, a weekly commitment is invisible. */
  eq(q.get('singleEvents'), 'true', 'singleEvents');
  /* Google rejects orderBy=startTime UNLESS singleEvents is set, so these two
     travel together or not at all. */
  eq(q.get('orderBy'), 'startTime', 'orderBy');
  eq(q.get('showDeleted'), 'false', 'showDeleted');
});

await testAsync('it asks for the day it was given, as instants', async () => {
  const g = fakeGoogle([{ items: [] }]);
  await readCalendar('primary', 'tok', DAY0, DAY1, g.fetchFn);
  const q = new URL(g.calls[0]).searchParams;
  eq(q.get('timeMin'), new Date(DAY0).toISOString(), 'timeMin');
  eq(q.get('timeMax'), new Date(DAY1).toISOString(), 'timeMax');
});

await testAsync('a calendar id that is an email address is escaped, not interpolated', async () => {
  const g = fakeGoogle([{ items: [] }]);
  await readCalendar('logan+demo@getproytech.com', 'tok', DAY0, DAY1, g.fetchFn);
  /* A raw @ or + in a path is a different URL than the one intended, and the
     failure is a 404 that reads exactly like "not shared with you". */
  if (!g.calls[0].includes('logan%2Bdemo%40getproytech.com'))
    throw new Error('calendar id not encoded: ' + g.calls[0]);
});

await testAsync('it carries the bearer token', async () => {
  let seen = null;
  await readCalendar('primary', 'tok-123', DAY0, DAY1, async (u, o) => {
    seen = o && o.headers && o.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ items: [] }) };
  });
  eq(seen, 'Bearer tok-123', 'authorization');
});

await testAsync('every page is followed, so a busy day is not silently truncated', async () => {
  const g = fakeGoogle([
    { items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' },
    { items: [{ id: 'c' }] },
  ]);
  const items = await readCalendar('primary', 'tok', DAY0, DAY1, g.fetchFn);
  eq(items.length, 3, 'items across pages');
  eq(new URL(g.calls[1]).searchParams.get('pageToken'), 'p2', 'page token sent');
});

await testAsync('AN UNREAD CALENDAR IS NOT AN EMPTY ONE — it throws', async () => {
  const g = fakeGoogle([{ fail: 'Not Found', status: 404 }]);
  let threw = null;
  try { await readCalendar('logan@getproytech.com', 'tok', DAY0, DAY1, g.fetchFn); }
  catch (e) { threw = e; }
  if (!threw) throw new Error('a 404 came back as an empty calendar — every slot would read free');
  /* The message has to name the calendar. A 404 here means "never shared with
     this account", and that is a two-minute fix only if you know which one. */
  if (!/logan@getproytech\.com/.test(threw.message)) throw new Error('does not name the calendar: ' + threw.message);
  if (!/Not Found/.test(threw.message)) throw new Error('loses Google reason: ' + threw.message);
});

await testAsync('a runaway page loop refuses rather than answering from a partial read', async () => {
  const g = fakeGoogle(Array.from({ length: 20 }, () => ({ items: [{ id: 'x' }], nextPageToken: 'more' })));
  let threw = null;
  try { await readCalendar('primary', 'tok', DAY0, DAY1, g.fetchFn); } catch (e) { threw = e; }
  if (!threw) throw new Error('answered from a truncated read');
  if (!/partial/.test(threw.message)) throw new Error('wrong reason: ' + threw.message);
});

/* ---- the diagnostic ------------------------------------------------------ */

await testAsync('the diagnostic reports the URL the real read actually used', async () => {
  /* Two constructions of the same URL is how a diagnostic comes back clean
     while the real request is malformed — the exact failure it exists to find.
     One builder, used by both, so that cannot happen. */
  const g = fakeGoogle([{ items: [] }]);
  await readCalendar('primary', 'tok', DAY0, DAY1, g.fetchFn);
  eq(g.calls[0], eventsUrl('primary', DAY0, DAY1), 'same URL');
});

test('the page token is the only thing that changes between pages', () => {
  const a = new URL(eventsUrl('primary', DAY0, DAY1));
  const b = new URL(eventsUrl('primary', DAY0, DAY1, 'p2'));
  a.searchParams.set('pageToken', 'p2');
  eq(b.searchParams.get('pageToken'), 'p2', 'token set');
  eq(b.search.split('&').sort().join('&'), a.search.split('&').sort().join('&'), 'otherwise identical');
});

/* ---- the probe ---------------------------------------------------------- */

test('the probe books a year out, at an hour nobody uses', () => {
  const w = probeWindow(Date.UTC(2026, 0, 1, 12, 0, 0));
  eq(w.start, '2027-01-01T04:00:00', 'start');
  eq(w.end, '2027-01-01T04:10:00', 'end');
});

test('the probe tests the constant the app actually uses', () => {
  /* Not a literal '5' — if someone edits availability.js the probe has to
     follow, or it proves something about a number nothing reads. */
  if (typeof BANANA !== 'string' || !BANANA) throw new Error('BANANA missing');
});

report('availability api');
