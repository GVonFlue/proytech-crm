/* THE BOOKING LATTICE, AND THE ZONE IT IS MEASURED IN.
   ============================================================================

   Two risks were named before a line was written: the timezone, and recurring
   events. This file is the timezone half.

   An availability check that is an hour out is WORSE THAN NO CHECK, because it
   answers confidently and the rep stops looking. So the assertions here are not
   "a lattice came back" — they are specific instants, computed by hand, on both
   sides of both daylight-saving transitions, in a zone that is not this
   machine's.                                                                 */
import { execFileSync } from 'node:child_process';
import { test, report } from './assert.mjs';
import {
  BANANA, DAY_END_HOUR, DAY_START_HOUR, SLOT_MINUTES,
  availabilityFor, busyFrom, classifyEvent, dayWindow, markSlots,
  slotAt, slotsForDay, slotWallClock, tzOffset, wallParts, zonedToUtc, isBookable,
} from '../src/lib/availability.js';

const CHI = 'America/Chicago';
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${a}, expected ${b}`); };
const utc = s => Date.parse(s);

/* ---- the lattice ------------------------------------------------------- */

test('8am to 8pm in half hours is 24 slots', () => {
  eq(slotsForDay('2026-06-15', CHI).length, (DAY_END_HOUR - DAY_START_HOUR) * 60 / SLOT_MINUTES, 'count');
});

test('it starts at 8:00 and the last one ENDS at 8pm, not starts', () => {
  const s = slotsForDay('2026-06-15', CHI);
  eq(s[0].hhmm, '08:00', 'first');
  eq(s[0].label, '8:00 AM', 'first label');
  eq(s[s.length - 1].hhmm, '19:30', 'last');
  eq(s[s.length - 1].label, '7:30 PM', 'last label');
  eq(wallParts(s[s.length - 1].end, CHI).hour, DAY_END_HOUR, 'last slot ends at 8pm');
});

test('every slot is exactly half an hour of wall clock', () => {
  for (const s of slotsForDay('2026-06-15', CHI)) {
    const a = wallParts(s.start, CHI), b = wallParts(s.end, CHI);
    eq((b.hour * 60 + b.minute) - (a.hour * 60 + a.minute), SLOT_MINUTES, `${s.hhmm} span`);
  }
});

test('no 3:45 exists to be picked', () => {
  const s = slotsForDay('2026-06-15', CHI);
  eq(s.some(x => x.hhmm === '15:45'), false, '15:45 present');
  eq(s.some(x => x.hhmm === '15:30'), true, '15:30 missing');
});

/* ---- the zone, by hand -------------------------------------------------- */

test('winter: 8am Chicago is 14:00 UTC (CST, -6)', () => {
  eq(slotsForDay('2026-01-15', CHI)[0].start, utc('2026-01-15T14:00:00Z'), '8am CST');
});

test('summer: 8am Chicago is 13:00 UTC (CDT, -5)', () => {
  eq(slotsForDay('2026-06-15', CHI)[0].start, utc('2026-06-15T13:00:00Z'), '8am CDT');
});

/* US DST in 2026: forward Sun 8 March, back Sun 1 November. The day BEFORE and
   the day OF each transition are the two the naive one-pass conversion gets
   wrong, so both are asserted rather than one. */
test('the day before spring forward is still CST', () => {
  eq(slotsForDay('2026-03-07', CHI)[0].start, utc('2026-03-07T14:00:00Z'), '7 Mar 8am');
});

test('spring-forward day itself is already CDT by 8am', () => {
  eq(slotsForDay('2026-03-08', CHI)[0].start, utc('2026-03-08T13:00:00Z'), '8 Mar 8am');
});

test('the day before falling back is still CDT', () => {
  eq(slotsForDay('2026-10-31', CHI)[0].start, utc('2026-10-31T13:00:00Z'), '31 Oct 8am');
});

test('fall-back day itself is CST by 8am', () => {
  eq(slotsForDay('2026-11-01', CHI)[0].start, utc('2026-11-01T14:00:00Z'), '1 Nov 8am');
});

test('a spring-forward day is 23 hours long, not 24', () => {
  const w = dayWindow('2026-03-08', CHI);
  eq((w.end - w.start) / 3600000, 23, 'hours');
});

test('a fall-back day is 25', () => {
  const w = dayWindow('2026-11-01', CHI);
  eq((w.end - w.start) / 3600000, 25, 'hours');
});

test('the day window is midnight to midnight, so a 7am event is inside it', () => {
  const w = dayWindow('2026-06-15', CHI);
  eq(w.start, utc('2026-06-15T05:00:00Z'), 'midnight CDT');
  eq(w.end, utc('2026-06-16T05:00:00Z'), 'next midnight');
});

/* THE SECOND PASS, EARNED.
   The bookable window starts at 8am and both transitions happen at 2am, so no
   slot in this lattice can tell you whether the correction pass works — a
   one-pass conversion passes every assertion above. These are the wall times
   where it does not: between 1am and 8am the guess and the answer sit on
   opposite sides of the transition. Nothing books at 6am today. Something will
   the day DAY_START_HOUR moves, and this is what stops that being an hour out. */
test('spring forward: 6am is CDT, not the CST the first guess sees', () => {
  eq(zonedToUtc(2026, 3, 8, 6, 0, CHI), utc('2026-03-08T11:00:00Z'), '6am 8 Mar');
});

test('fall back: 6am is CST, not the CDT the first guess sees', () => {
  eq(zonedToUtc(2026, 11, 1, 6, 0, CHI), utc('2026-11-01T12:00:00Z'), '6am 1 Nov');
});

test('and the ordinary days either side are unmoved', () => {
  eq(zonedToUtc(2026, 3, 7, 6, 0, CHI), utc('2026-03-07T12:00:00Z'), '6am 7 Mar');
  eq(zonedToUtc(2026, 11, 2, 6, 0, CHI), utc('2026-11-02T12:00:00Z'), '6am 2 Nov');
});

test('zonedToUtc survives the hour that does not exist', () => {
  /* 2:30am on 8 March 2026 never happens in Chicago. It must still produce a
     real instant rather than NaN or a throw — nothing in the bookable window
     goes near it, but a lattice that is only safe because of where its edges
     sit is a trap for whoever widens them. */
  const t = zonedToUtc(2026, 3, 8, 2, 30, CHI);
  if (!Number.isFinite(t)) throw new Error('not a finite instant');
});

test('tzOffset reads the named zone, not the host', () => {
  eq(tzOffset(utc('2026-06-15T18:00:00Z'), CHI), -5 * 3600000, 'CDT offset');
  eq(tzOffset(utc('2026-01-15T18:00:00Z'), CHI), -6 * 3600000, 'CST offset');
  eq(tzOffset(utc('2026-06-15T18:00:00Z'), 'UTC'), 0, 'UTC offset');
});

test('midnight comes back as hour 0, never hour 24', () => {
  eq(wallParts(utc('2026-06-15T05:00:00Z'), CHI).hour, 0, 'midnight hour');
  eq(wallParts(utc('2026-06-15T05:00:00Z'), CHI).day, 15, 'midnight day');
});

/* THE ONE THAT MATTERS MOST. The rep's machine must not be able to move the
   lattice. Run in a child process under a zone eleven hours away — if any part
   of this reached for local time, these instants would differ. */
test('the answer is identical on a laptop set to Tokyo', () => {
  const script = `
    import('${new URL('../src/lib/availability.js', import.meta.url).href}').then(m => {
      const days = ['2026-01-15','2026-03-08','2026-06-15','2026-11-01'];
      const out = days.map(d => m.slotsForDay(d, '${CHI}').map(s => s.start + ':' + s.hhmm).join(','));
      process.stdout.write(JSON.stringify(out));
    });`;
  const run = tz => execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  const tokyo = run('Asia/Tokyo'), utcRun = run('UTC'), honolulu = run('Pacific/Honolulu');
  eq(tokyo, utcRun, 'Tokyo vs UTC');
  eq(tokyo, honolulu, 'Tokyo vs Honolulu');
  const here = ['2026-01-15', '2026-03-08', '2026-06-15', '2026-11-01']
    .map(d => slotsForDay(d, CHI).map(s => s.start + ':' + s.hhmm).join(','));
  eq(tokyo, JSON.stringify(here), 'child vs this process');
});

/* ---- what blocks -------------------------------------------------------- */

const ev = (o = {}) => ({
  start: { dateTime: '2026-06-15T15:00:00-05:00' },
  end:   { dateTime: '2026-06-15T16:00:00-05:00' },
  ...o,
});

test('Banana is soft', () => {
  eq(classifyEvent(ev({ colorId: BANANA }), CHI).soft, true, 'banana soft');
});

test('no colour at all is HARD — the inversion, and the whole point', () => {
  eq(classifyEvent(ev(), CHI).soft, false, 'default hard');
  eq(classifyEvent(ev({ colorId: null }), CHI).soft, false, 'null hard');
  eq(classifyEvent(ev({ colorId: '' }), CHI).soft, false, 'empty hard');
});

test('every other colour is hard, including ones we have never seen', () => {
  for (const c of ['1', '2', '3', '4', '6', '7', '8', '9', '10', '11', '99', 'banana'])
    eq(classifyEvent(ev({ colorId: c }), CHI).soft, false, `colour ${c}`);
});

test('a declined event still blocks', () => {
  eq(classifyEvent(ev({ attendees: [{ self: true, responseStatus: 'declined' }] }), CHI).soft, false, 'declined');
});

test('an event marked Free still blocks', () => {
  eq(classifyEvent(ev({ transparency: 'transparent' }), CHI).soft, false, 'transparent');
});

test('a cancelled instance is not a commitment', () => {
  eq(classifyEvent(ev({ status: 'cancelled' }), CHI), null, 'cancelled');
});

test('an all-day event blocks the whole day, end date exclusive', () => {
  const c = classifyEvent({ start: { date: '2026-06-15' }, end: { date: '2026-06-16' } }, CHI);
  eq(c.start, utc('2026-06-15T05:00:00Z'), 'starts at local midnight');
  eq(c.end, utc('2026-06-16T05:00:00Z'), 'ends at next local midnight');
  eq(c.soft, false, 'hard');
  const marked = markSlots(slotsForDay('2026-06-15', CHI), [c]);
  eq(marked.every(s => s.state === 'blocked'), true, 'every slot blocked');
});

test('a Banana all-day event leaves the day soft, not open', () => {
  const c = classifyEvent({ start: { date: '2026-06-15' }, end: { date: '2026-06-16' }, colorId: BANANA }, CHI);
  const marked = markSlots(slotsForDay('2026-06-15', CHI), [c]);
  eq(marked.every(s => s.state === 'soft'), true, 'all soft');
  eq(marked.every(isBookable), true, 'all still bookable');
});

test('an all-day event with no end date still blocks its day', () => {
  /* Google always sends an end. A malformed one must not OPEN a day — the
     inversion has to hold on the way in as well as the way out. */
  const c = classifyEvent({ start: { date: '2026-06-15' } }, CHI);
  if (!c) throw new Error('dropped the event instead of blocking');
  eq(markSlots(slotsForDay('2026-06-15', CHI), [c]).every(s => s.state === 'blocked'), true, 'blocked');
});

test('a multi-day all-day event covers the middle day', () => {
  const c = classifyEvent({ start: { date: '2026-06-15' }, end: { date: '2026-06-18' } }, CHI);
  eq(markSlots(slotsForDay('2026-06-16', CHI), [c]).every(s => s.state === 'blocked'), true, 'middle day');
  eq(markSlots(slotsForDay('2026-06-18', CHI), [c]).some(s => s.state === 'blocked'), false, 'end date is exclusive');
});

test('a classified event carries THREE facts and no more', () => {
  /* This shape goes over the wire to a rep's browser. Adding a title here —
     for a log line, for a tooltip, for debugging — would ship the contents of
     the owner's calendar to every rep with a lead open. The assertion is on the
     key set so that adding one is a failing test rather than a quiet leak. */
  const k = Object.keys(classifyEvent(ev({ summary: 'Dentist', attendees: [{ email: 'x@y.z' }] }), CHI)).sort();
  eq(k.join(','), 'end,soft,start', 'keys');
});

test('junk is dropped rather than guessed at', () => {
  eq(classifyEvent(null, CHI), null, 'null');
  eq(classifyEvent({}, CHI), null, 'no times');
  eq(classifyEvent({ start: { dateTime: 'nonsense' }, end: { dateTime: 'nonsense' } }, CHI), null, 'unparseable');
  eq(busyFrom([null, {}, ev()], CHI).length, 1, 'only the real one survives');
});

/* ---- overlap ------------------------------------------------------------ */

const on = (d, a, b, o = {}) => ({ start: { dateTime: `${d}T${a}:00-05:00` }, end: { dateTime: `${d}T${b}:00-05:00` }, ...o });
const marked = (evs, opts) => availabilityFor('2026-06-15', evs, { tz: CHI, ...opts });
const stateOf = (evs, hhmm, opts) => slotAt(marked(evs, opts), hhmm).state;

test('an empty calendar is 24 open slots', () => {
  eq(marked([]).every(s => s.state === 'open'), true, 'all open');
});

test('a hard event blocks the slots it overlaps and no others', () => {
  const m = marked([on('2026-06-15', '15:00', '16:00')]);
  eq(slotAt(m, '15:00').state, 'blocked', '15:00');
  eq(slotAt(m, '15:30').state, 'blocked', '15:30');
  eq(slotAt(m, '14:30').state, 'open', '14:30');
  eq(slotAt(m, '16:00').state, 'open', '16:00');
});

test('back to back is not a clash', () => {
  /* An event ending exactly at 3:00 leaves the 3:00 slot alone. Treating touch
     as overlap would quietly delete a free slot from every hour of the day. */
  eq(stateOf([on('2026-06-15', '14:30', '15:00')], '15:00'), 'open', 'after');
  eq(stateOf([on('2026-06-15', '15:30', '16:00')], '15:00'), 'open', 'before');
});

test('a one-minute overlap is an overlap', () => {
  eq(stateOf([on('2026-06-15', '15:29', '15:31')], '15:00'), 'blocked', 'tail');
  eq(stateOf([on('2026-06-15', '15:29', '15:31')], '15:30'), 'blocked', 'head');
});

test('an event swallowing a slot blocks it', () => {
  eq(stateOf([on('2026-06-15', '09:00', '18:00')], '15:00'), 'blocked', 'inside a long one');
});

test('Banana alone makes a slot soft, and soft is bookable', () => {
  const m = marked([on('2026-06-15', '15:00', '16:00', { colorId: BANANA })]);
  eq(slotAt(m, '15:00').state, 'soft', 'soft');
  eq(isBookable(slotAt(m, '15:00')), true, 'bookable');
});

test('HARD WINS. Banana over the top of a real commitment does not free it', () => {
  const m = marked([
    on('2026-06-15', '15:00', '16:00', { colorId: BANANA }),
    on('2026-06-15', '15:15', '15:45'),
  ]);
  eq(slotAt(m, '15:00').state, 'blocked', '15:00');
  eq(slotAt(m, '15:30').state, 'blocked', '15:30');
  eq(isBookable(slotAt(m, '15:00')), false, 'not bookable');
});

test('two calendars merge into one answer', () => {
  /* Mine and his, concatenated — a slot survives only if BOTH are clear. */
  const mine = [on('2026-06-15', '10:00', '10:30', { colorId: BANANA })];
  const his  = [on('2026-06-15', '10:00', '10:30')];
  eq(stateOf([...mine], '10:00'), 'soft', 'mine alone');
  eq(stateOf([...mine, ...his], '10:00'), 'blocked', 'his hard commitment wins');
});

test('a recurring series arrives already expanded, and each instance blocks', () => {
  /* singleEvents=true is the server's job; what this asserts is that N
     instances sharing one recurringEventId are N separate blocks, not one. */
  const inst = t => on('2026-06-15', t, t.replace(/:00$/, ':30'), { recurringEventId: 'abc123', iCalUID: 'abc123' });
  const m = marked([inst('09:00'), inst('13:00'), inst('17:00')]);
  eq(slotAt(m, '09:00').state, 'blocked', '9');
  eq(slotAt(m, '13:00').state, 'blocked', '1');
  eq(slotAt(m, '17:00').state, 'blocked', '5');
  eq(slotAt(m, '11:00').state, 'open', '11 untouched');
});

/* ---- the past ----------------------------------------------------------- */

test('a slot that has started is past, and one about to start is not', () => {
  const now = utc('2026-06-15T20:00:00Z');   // 3:00pm Chicago exactly
  eq(stateOf([], '14:30', { now }), 'past', '2:30 gone');
  eq(stateOf([], '15:00', { now }), 'past', '3:00 has started');
  eq(stateOf([], '15:30', { now }), 'open', '3:30 still open');
});

test('a rep at 2:58 can still take the 3:00', () => {
  const now = utc('2026-06-15T19:58:00Z');
  eq(stateOf([], '15:00', { now }), 'open', '3:00 at 2:58');
});

test('past beats blocked — a gone slot is not offered as a clash', () => {
  const now = utc('2026-06-15T20:00:00Z');
  eq(stateOf([on('2026-06-15', '09:00', '10:00')], '09:00', { now }), 'past', 'morning');
});

test('now=0 means do not judge the past at all', () => {
  eq(stateOf([], '09:00', { now: 0 }), 'open', 'no clock, no past');
});

/* ---- handing the slot to the booking endpoint --------------------------- */

test('the wall-clock strings match the slot that was approved', () => {
  const s = slotAt(slotsForDay('2026-06-15', CHI), '15:00');
  const w = slotWallClock(s, CHI);
  eq(w.start, '2026-06-15T15:00:00', 'start');
  eq(w.end, '2026-06-15T15:30:00', 'end');
  eq(w.timezone, CHI, 'zone');
});

test('and in winter too, where the offset differs', () => {
  const s = slotAt(slotsForDay('2026-01-15', CHI), '15:00');
  eq(slotWallClock(s, CHI).start, '2026-01-15T15:00:00', 'winter start');
});

test('the event spans the whole slot, buffer included', () => {
  const s = slotAt(slotsForDay('2026-06-15', CHI), '15:00');
  eq((s.end - s.start) / 60000, SLOT_MINUTES, 'thirty minutes, not ten');
});

report('availability');
