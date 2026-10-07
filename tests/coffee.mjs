/* THE COFFEE PAGE — the race scoreboard, whose time an event takes, and 7:30.
   ============================================================================

   Three things, each of which fails silently if it is wrong:

   - countRace() is a public number. Counting a scheduled coffee, a no-show, or
     a meeting outside the week reads as a real lead in the race.
   - Garrett and Logan share ONE calendar. If ownership is read wrong in the
     permissive direction, a host is offered a window he is already in, and the
     guest finds out at the coffee shop. So every ambiguous case below must
     block BOTH.
   - The 7:30 window sits before the CRM lattice's 8am start, so it is checked
     by plain overlap. The edges (back-to-back, DST, already started) are where
     an overlap test gets it wrong.                                            */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, testAsync, report, ok } from './assert.mjs';
import {
  BOTH, COFFEE_WINDOWS, eventOwner, knownHost, openWindows, readDayEvents, windowInterval,
  customWindow, slotWindow, windowLabel, isWindowFree,
} from '../api/_coffee.js';
import { execFileSync } from 'node:child_process';
import { BANANA, DAY_START_HOUR, slotWallClock } from '../src/lib/availability.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The route modules read their env when first imported (api/_env.js), and ES
   imports are hoisted — so env FIRST, then import them dynamically. The routes
   are driven below against a fake Google / Supabase / Resend. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@getproytech.com>';
process.env.NOTIFY_TO = 'garrett@getproytech.com';
process.env.APP_URL = 'https://crm.test';
process.env.CALENDAR_TZ = 'America/Chicago';
delete process.env.CALENDAR_IDS;
const { countRace, meetingDay, racerFor } = await import('../api/coffee-race.js');
const { WINDOW_LABEL, emailWhen, slotLabel, default: bookRoute } = await import('../api/coffee-book.js');
const { default: availRoute } = await import('../api/coffee-availability.js');
const CHI = 'America/Chicago';
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};
const has = (list, id, what) => { if (!list.includes(id)) throw new Error(`${what}: ${id} missing from ${JSON.stringify(list)}`); };
const lacks = (list, id, what) => { if (list.includes(id)) throw new Error(`${what}: ${id} should not be in ${JSON.stringify(list)}`); };

/* ---- countRace ---------------------------------------------------------- */

const lead = (...meetings) => ({ data: { meetings } });
const coffee = (over = {}) => ({ mtype: 'Coffee', status: 'held', host: 'Garrett', start: '2026-10-05T09:00:00', ...over });

test('counts held coffees per host', () => {
  const rows = [
    lead(coffee(), coffee({ host: 'Logan' })),
    lead(coffee({ host: 'Logan', start: '2026-10-06T07:30:00' })),
  ];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 1, Logan: 2 }, 'counts');
});

test('only status "held" counts: scheduled and no-show do not', () => {
  const rows = [lead(
    coffee({ status: 'scheduled' }),
    coffee({ status: 'no-show' }),
    coffee({ status: 'noshow' }),
    coffee({ status: 'cancelled' }),
    coffee({ status: '' }),
    coffee(),
  )];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 1, Logan: 0 }, 'only the held one');
});

test('only mtype Coffee counts, in any case', () => {
  const rows = [lead(
    coffee({ mtype: 'Discovery Call' }),
    coffee({ mtype: 'Onboarding' }),
    coffee({ mtype: '' }),
    coffee({ mtype: undefined }),
    coffee({ mtype: 'coffee' }),
  )];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 1, Logan: 0 }, 'only coffee');
});

test('only inside the date window, both ends inclusive', () => {
  const rows = [lead(
    coffee({ start: '2026-10-02T12:00:00' }),   // day before
    coffee({ start: '2026-10-03T07:30:00' }),   // first day
    coffee({ start: '2026-10-10T12:00:00' }),   // last day
    coffee({ start: '2026-10-11T07:30:00' }),   // day after
    coffee({ start: '' }),                      // no date at all
  )];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 2, Logan: 0 }, 'first and last day only');
});

test('a coffee with no start is dated by when it was marked held', () => {
  const rows = [lead(
    coffee({ start: undefined, heldAt: '2026-10-04T15:00:00.000Z' }),
    coffee({ start: undefined, heldAt: '2026-09-30T15:00:00.000Z' }),
  )];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 1, Logan: 0 }, 'heldAt fallback');
});

test('credit goes to m.host first, then falls back to heldBy', () => {
  // Host wins even when the other person clicked "held".
  eq(racerFor({ host: 'Logan', heldBy: 'Garrett' }), 'Logan', 'host beats heldBy');
  // Hand-added coffee in the CRM: no host, so whoever marked it held.
  eq(racerFor({ heldBy: 'Logan Poppell' }), 'Logan', 'heldBy fallback');
  eq(racerFor({ host: '', heldBy: 'garrett' }), 'Garrett', 'empty host falls back, case-insensitive');
  eq(racerFor({}), null, 'nobody to credit');
  eq(racerFor({ host: 'Dana' }), null, 'not a racer');

  const rows = [lead(
    coffee({ host: 'Logan', heldBy: 'Garrett' }),
    coffee({ host: undefined, heldBy: 'Logan' }),
    coffee({ host: undefined, heldBy: undefined }),
  )];
  eq(countRace(rows, '2026-10-03', '2026-10-10'), { Garrett: 0, Logan: 2 }, 'counts follow credit');
});

/* The race day is decided in the CALENDAR's zone. Slicing the raw string read
   a UTC stamp of a Saturday-evening coffee as Sunday, outside the race. */
const RACE = ['2026-10-03', '2026-10-10', 'America/Chicago'];
const one = start => countRace([lead(coffee({ start }))], ...RACE).Garrett;

test('a coffee at 7:30 PM Central on Sat Oct 10 counts, however it is stamped', () => {
  eq(one('2026-10-10T19:30:00'), 1, 'wall clock, as coffee-book and the CRM write it');
  eq(one('2026-10-10T19:30:00-05:00'), 1, 'with its Central offset');
  eq(one('2026-10-11T00:30:00.000Z'), 1, 'as UTC, where the date already reads Oct 11');
});

test('a coffee at 12:30 AM Central on Sun Oct 11 does not count', () => {
  eq(one('2026-10-11T00:30:00'), 0, 'wall clock');
  eq(one('2026-10-11T00:30:00-05:00'), 0, 'with offset');
  eq(one('2026-10-11T05:30:00.000Z'), 0, 'as UTC');
});

test('a UTC-stamped start that is still Oct 10 in Central counts', () => {
  eq(one('2026-10-11T04:59:00Z'), 1, '11:59 PM Central');
  eq(one('2026-10-11T05:00:00Z'), 0, 'midnight Central is Sunday');
  eq(meetingDay({ start: '2026-10-11T03:00:00.000Z' }, 'America/Chicago'), '2026-10-10', 'meetingDay');
});

test('the first day is decided the same way', () => {
  eq(one('2026-10-03T03:00:00Z'), 0, '10 PM Central on Fri Oct 2');
  eq(one('2026-10-03T05:00:00Z'), 1, 'midnight Central on Sat Oct 3');
});

test('heldAt, which the CRM stamps in UTC, is converted too', () => {
  const rows = [lead(coffee({ start: undefined, heldAt: '2026-10-11T02:00:00.000Z' }))];   // 9 PM Oct 10 Central
  eq(countRace(rows, ...RACE).Garrett, 1, 'held Saturday night');
});

test('an unreadable start is no day, not a guess', () => {
  eq(meetingDay({ start: 'soon' }, 'America/Chicago'), '', 'garbage');
  eq(meetingDay({ start: '2026-13-45T99:00:00Z' }, 'America/Chicago'), '', 'impossible instant');
});

test('bad rows do not throw and return numbers only', () => {
  const counts = countRace([null, {}, { data: null }, { data: { meetings: null } }, lead()], '2026-10-03', '2026-10-10');
  eq(counts, { Garrett: 0, Logan: 0 }, 'zeros');
  eq(countRace(null, '2026-10-03', '2026-10-10'), { Garrett: 0, Logan: 0 }, 'null leads');
});

/* ---- whose time an event takes ----------------------------------------- */

const DATE = '2026-10-05';   // a Monday, CDT (UTC-5)
const at = hhmm => `${DATE}T${hhmm}:00-05:00`;
const ev = (summary, from, to, extra = {}) =>
  ({ summary, start: { dateTime: at(from) }, end: { dateTime: at(to) }, ...extra });
const tagged = host => ({ extendedProperties: { private: { coffeeHost: host } } });
const ZWSP = String.fromCharCode(0x200B);   // what coffee-book puts after the ×
const free = (events, host, now = 0) => openWindows(DATE, events, { tz: CHI, host, now });

test("Logan's coffee does NOT block Garrett", () => {
  const events = [ev(`Coffee: Pat Doe ×${ZWSP} Logan (ProyTech)`, '09:00', '10:00', tagged('Logan'))];
  has(free(events, 'Garrett'), '0900', 'Garrett at 9');
  lacks(free(events, 'Logan'), '0900', 'Logan at 9');
});

test("Logan's coffee booked before the tag existed is read from its title", () => {
  const events = [ev(`Coffee: Pat Doe ×${ZWSP} Logan (ProyTech)`, '09:00', '10:00')];
  eq(eventOwner(events[0]), 'Logan', 'owner from title');
  has(free(events, 'Garrett'), '0900', 'Garrett at 9');
  lacks(free(events, 'Logan'), '0900', 'Logan at 9');
});

test('a guest NAMED Logan booking Garrett is still Garrett\'s coffee', () => {
  // Rule (b) runs before rule (c), so the guest's name never decides.
  const e = ev(`Coffee: Logan Smith ×${ZWSP} Garrett (ProyTech)`, '10:30', '11:30');
  eq(eventOwner(e), 'Garrett', 'host after the ×');
  lacks(free([e], 'Garrett'), '1030', 'Garrett blocked');
  has(free([e], 'Logan'), '1030', 'Logan free');
});

test('"Garrett: dentist" blocks only Garrett', () => {
  const events = [ev('Garrett: dentist', '12:00', '13:00')];
  eq(eventOwner(events[0]), 'Garrett', 'owner');
  lacks(free(events, 'Garrett'), '1200', 'Garrett at noon');
  has(free(events, 'Logan'), '1200', 'Logan at noon');
});

test('a host name matches case-insensitively', () => {
  eq(eventOwner(ev('gym w/ LOGAN', '09:00', '10:00')), 'Logan', 'upper');
  eq(eventOwner(ev('call logan back', '09:00', '10:00')), 'Logan', 'lower');
});

test('an untagged event with no host name blocks BOTH', () => {
  const events = [ev('Board meeting', '09:00', '10:00')];
  eq(eventOwner(events[0]), BOTH, 'owner');
  lacks(free(events, 'Garrett'), '0900', 'Garrett');
  lacks(free(events, 'Logan'), '0900', 'Logan');
});

test('an event naming BOTH hosts blocks both', () => {
  const events = [ev('Garrett + Logan: weekly sync', '09:00', '10:00')];
  eq(eventOwner(events[0]), BOTH, 'owner');
  lacks(free(events, 'Garrett'), '0900', 'Garrett');
  lacks(free(events, 'Logan'), '0900', 'Logan');
});

test('an event with no title at all blocks both', () => {
  eq(eventOwner({ start: { dateTime: at('09:00') }, end: { dateTime: at('10:00') } }), BOTH, 'no summary');
});

test('the tag wins over the title', () => {
  // A coffee titled for Logan but tagged Garrett belongs to Garrett.
  eq(eventOwner(ev(`Coffee: X ×${ZWSP} Logan (ProyTech)`, '09:00', '10:00', tagged('Garrett'))), 'Garrett', 'tag first');
  eq(eventOwner(ev('Logan: lunch', '09:00', '10:00', tagged('garrett'))), 'Garrett', 'tag canonicalised');
});

test('a tag or coffee title naming someone unknown blocks both', () => {
  eq(eventOwner(ev('Garrett: x', '09:00', '10:00', tagged('Dana'))), BOTH, 'unknown tag');
  eq(eventOwner(ev(`Coffee: X ×${ZWSP} Dana (ProyTech)`, '09:00', '10:00')), BOTH, 'unknown coffee host');
});

test('with NO host given, every event blocks (the old behaviour)', () => {
  const events = [ev('Garrett: dentist', '09:00', '10:00'), ev('x', '12:00', '13:00', tagged('Logan'))];
  eq(free(events, ''), ['0730', '1030', '1330', '1700', '1830'], 'no host');
  eq(free(events, undefined), ['0730', '1030', '1330', '1700', '1830'], 'undefined host');
});

test('an unrecognised host is treated as no host, so it can only offer LESS', () => {
  const events = [ev('Garrett: dentist', '09:00', '10:00')];
  lacks(free(events, 'Garett'), '0900', 'typo');
  eq(knownHost('  logan '), 'Logan', 'trim + case');
  eq(knownHost('Dana'), null, 'unknown');
});

test('transparent events still block, as in the CRM lattice', () => {
  // availability.js deliberately does not honour Free/Busy; coffee agrees.
  lacks(free([ev('Board meeting', '09:00', '10:00', { transparency: 'transparent' })], 'Garrett'), '0900', 'transparent');
});

test('Banana (soft) and cancelled events do not block', () => {
  has(free([ev('Board meeting', '09:00', '10:00', { colorId: BANANA })], 'Garrett'), '0900', 'banana');
  has(free([ev('Board meeting', '09:00', '10:00', { status: 'cancelled' })], 'Garrett'), '0900', 'cancelled');
});

test('an all-day event with no host name blocks every window for both', () => {
  const allDay = { summary: 'Offsite', start: { date: DATE }, end: { date: '2026-10-06' } };
  eq(free([allDay], 'Garrett'), [], 'Garrett');
  eq(free([allDay], 'Logan'), [], 'Logan');
});

/* ---- the 7:30 window --------------------------------------------------- */

test('the windows are 7:30, 9:00, 10:30, 12:00, 1:30, 5:00 and 6:30, an hour each', () => {
  eq(COFFEE_WINDOWS.map(w => w.id), ['0730', '0900', '1030', '1200', '1330', '1700', '1830'], 'ids');
  for (const w of COFFEE_WINDOWS) {
    const iv = windowInterval(DATE, w, CHI);
    eq((iv.end - iv.start) / 60000, 60, w.id + ' length');
  }
});

test('an empty day offers all seven, 7:30 included', () => {
  eq(free([], 'Garrett'), ['0730', '0900', '1030', '1200', '1330', '1700', '1830'], 'empty day');
});

test('7:30 is 7:30 in the calendar zone, not the server\'s', () => {
  const w = COFFEE_WINDOWS.find(x => x.id === '0730');
  const iv = windowInterval(DATE, w, CHI);
  eq(new Date(iv.start).toISOString(), '2026-10-05T12:30:00.000Z', 'CDT start');
  eq(new Date(iv.end).toISOString(), '2026-10-05T13:30:00.000Z', 'CDT end');
  // After the 1 Nov fall-back, Chicago is UTC-6: same wall clock, an hour later in UTC.
  eq(new Date(windowInterval('2026-11-02', w, CHI).start).toISOString(), '2026-11-02T13:30:00.000Z', 'CST start');
});

test('the event booked for 7:30 carries 7:30–8:30 wall clock', () => {
  const w = COFFEE_WINDOWS.find(x => x.id === '0730');
  const wc = slotWallClock(windowInterval(DATE, w, CHI), CHI);
  eq([wc.start, wc.end], ['2026-10-05T07:30:00', '2026-10-05T08:30:00'], 'wall clock');
});

test('7:30 is blocked by anything overlapping 7:30–8:30, and only that', () => {
  lacks(free([ev('Garrett: gym', '08:00', '08:30')], 'Garrett'), '0730', '8:00–8:30');
  lacks(free([ev('Garrett: gym', '07:00', '07:45')], 'Garrett'), '0730', '7:00–7:45');
  has(free([ev('Garrett: gym', '08:00', '08:30')], 'Garrett'), '0900', '9:00 untouched by 8:00–8:30');
  // Half-open: back-to-back on either side is not a clash.
  has(free([ev('Garrett: gym', '06:30', '07:30')], 'Garrett'), '0730', 'ends at 7:30');
  has(free([ev('Garrett: gym', '08:30', '09:00')], 'Garrett'), '0730', 'starts at 8:30');
  // And it is per host like every other window.
  has(free([ev('Logan: gym', '07:30', '08:30')], 'Garrett'), '0730', "Logan's 7:30 is not Garrett's");
});

test('a window that has already started is not offered', () => {
  const now = Date.parse(at('07:31'));
  eq(free([], 'Garrett', now), ['0900', '1030', '1200', '1330', '1700', '1830'], 'after 7:30');
});

test('the CRM lattice still starts at 8am', () => {
  eq(DAY_START_HOUR, 8, 'DAY_START_HOUR');
});

test('every coffee window has a label in coffee-book', () => {
  for (const w of COFFEE_WINDOWS) if (!WINDOW_LABEL[w.id]) throw new Error('no label for ' + w.id);
  eq(WINDOW_LABEL['0730'], '7:30–8:30 AM', '0730 label');
});

/* ---- the owners' email names the day, in the calendar's zone ----------- */

test('the email reads "Thu, Oct 8 · 7:30–8:30 AM", not "2026-10-08"', () => {
  eq(emailWhen('2026-10-08', '0730', CHI), 'Thu, Oct 8 · 7:30–8:30 AM', '7:30 on Thu Oct 8');
  eq(emailWhen('2026-10-10', '1200', CHI), 'Sat, Oct 10 · 12:00–1:00 PM', 'noon on race Saturday');
  eq(emailWhen('2026-11-02', '0900', CHI), 'Mon, Nov 2 · 9:00–10:00 AM', 'the Monday after DST ends');
});

test("the weekday is the calendar's, whatever zone the server runs in", () => {
  /* new Date('2026-10-08') is UTC midnight: Wed evening in Chicago. Run the
     real function in a process whose own zone is UTC+14, where the day has
     long since rolled over, and it must still say Thursday. */
  const code = "import('./api/coffee-book.js').then(m=>process.stdout.write(m.emailWhen('2026-10-08','0730','America/Chicago')))";
  for (const zone of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
    eq(out, 'Thu, Oct 8 · 7:30–8:30 AM', 'server in ' + zone);
  }
});

test('an unknown slot falls back to the raw date rather than inventing a day', () => {
  eq(emailWhen('2026-10-08', '9999', CHI), '2026-10-08', 'unknown slot');
});

/* ---- failing closed ---------------------------------------------------- */

const okPage = items => async () => ({ ok: true, json: async () => ({ items }) });

await testAsync('events from every calendar are merged', async () => {
  let n = 0;
  const fetchFn = async () => ({ ok: true, json: async () => ({ items: [{ id: 'e' + (n++) }] }) });
  eq((await readDayEvents(['primary', 'other'], 't', DATE, CHI, fetchFn)).length, 2, 'two calendars');
});

await testAsync('one unreadable calendar means NO events, not fewer', async () => {
  let n = 0;
  const fetchFn = async () => (n++ === 0
    ? { ok: true, json: async () => ({ items: [] }) }
    : { ok: false, status: 403, json: async () => ({}) });
  eq(await readDayEvents(['primary', 'other'], 't', DATE, CHI, fetchFn), null, 'second calendar 403');
});

await testAsync('a network error or unreadable body is also NO events', async () => {
  eq(await readDayEvents(['primary'], 't', DATE, CHI, async () => { throw new Error('down'); }), null, 'throws');
  eq(await readDayEvents(['primary'], 't', DATE, CHI, async () => ({ ok: true, json: async () => { throw new Error('bad'); } })), null, 'bad json');
  eq((await readDayEvents(['primary'], 't', DATE, CHI, okPage([]))).length, 0, 'a readable empty day is []');
});

await testAsync('both routes fail closed on an unread calendar and use the one shared rule', async () => {
  const avail = await fs.readFile(path.join(ROOT, 'api/coffee-availability.js'), 'utf8');
  const book = await fs.readFile(path.join(ROOT, 'api/coffee-book.js'), 'utf8');
  for (const [name, src] of [['coffee-availability', avail], ['coffee-book', book]]) {
    if (!/from '\.\/_coffee\.js'/.test(src)) throw new Error(name + ' does not use ./_coffee.js');
    if (!/if \(!events\)/.test(src)) throw new Error(name + ' does not check for an unread calendar');
    // the decision (openWindows for the list, isWindowFree for one window) comes after the read check
    const decide = Math.max(src.indexOf('openWindows(date, events'), src.indexOf('isWindowFree(date, events'));
    if (decide < 0 || src.indexOf('if (!events)') > decide) throw new Error(name + ' decides before checking the read');
  }
  if (!/isWindowFree\(date, events, win, \{[^}]*\bhost\b/.test(book)) throw new Error('coffee-book re-check is not per host');
  if (!/extendedProperties:\s*\{\s*private:\s*\{\s*coffeeHost:\s*host\s*\}\s*\}/.test(book))
    throw new Error('coffee-book does not tag new events with coffeeHost');
});

/* ---- more coffee times: three new presets, and custom start times ------- */

test('the new presets: 1:30, 5:00 and 6:30, an hour each, in Chicago time', () => {
  const at = id => COFFEE_WINDOWS.find(w => w.id === id);
  eq(new Date(windowInterval(DATE, at('1330'), CHI).start).toISOString(), '2026-10-05T18:30:00.000Z', '1:30 PM CDT');
  eq(new Date(windowInterval(DATE, at('1700'), CHI).end).toISOString(), '2026-10-05T23:00:00.000Z', '5–6 PM ends at 6');
  eq(new Date(windowInterval(DATE, at('1830'), CHI).end).toISOString(), '2026-10-06T00:30:00.000Z', '6:30–7:30 PM ends past UTC midnight');
  eq([WINDOW_LABEL['1330'], WINDOW_LABEL['1700'], WINDOW_LABEL['1830']], ['1:30–2:30 PM', '5:00–6:00 PM', '6:30–7:30 PM'], 'labels');
  eq(emailWhen('2026-10-08', '1830', CHI), 'Thu, Oct 8 · 6:30–7:30 PM', 'owner email');
});

test('one rule writes every label: each preset label equals windowLabel()', () => {
  for (const w of COFFEE_WINDOWS) eq(WINDOW_LABEL[w.id], windowLabel(w), w.id);
  eq(windowLabel(customWindow('11:45')), '11:45 AM–12:45 PM', 'across noon');
  eq(windowLabel(customWindow('19:00')), '7:00–8:00 PM', 'the latest');
});

test('custom times: 15-minute steps from 07:00 to 19:00, nothing else', () => {
  for (const t of ['07:00', '07:15', '09:45', '12:00', '14:15', '18:45', '19:00'])
    eq(customWindow(t) && customWindow(t).id, 'c' + t.replace(':', ''), `valid ${t}`);
  for (const t of ['06:45', '06:59', '19:15', '19:01', '23:00', '00:00', '14:10', '14:05', '14:59', '7:00', '14:5', '14:60', '24:00',
    '1415', '14.15', ' 14:15', '14:15 ', 'ab:cd', '', null, undefined, 1415, '14:15:00'])
    eq(customWindow(t), null, `invalid ${JSON.stringify(t)}`);
  eq(slotWindow('c1415') && slotWindow('c1415').id, 'c1415', 'booking slot c1415');
  eq(slotWindow('1330') && slotWindow('1330').id, '1330', 'a preset still resolves');
  for (const s of ['c1410', 'c0645', 'c1915', 'c14:15', 'C1415', '1415', 'c141', 'c14150', 'x', '']) eq(slotWindow(s), null, `bad slot ${s}`);
});

test("a custom time overlapping LOGAN's coffee is open for Garrett and taken for Logan", () => {
  const logan = [ev(`Coffee: Pat Doe ×${ZWSP} Logan (ProyTech)`, '14:00', '15:00', tagged('Logan'))];
  const w = customWindow('14:15'), o = h => ({ tz: CHI, host: h });
  ok(isWindowFree(DATE, logan, w, o('Garrett')), 'free for Garrett');
  ok(!isWindowFree(DATE, logan, w, o('Logan')), 'taken for Logan');
  const legacy = [ev(`Coffee: Pat Doe ×${ZWSP} Logan (ProyTech)`, '14:00', '15:00')];
  ok(isWindowFree(DATE, legacy, w, o('Garrett')) && !isWindowFree(DATE, legacy, w, o('Logan')), 'the same for a coffee read from its title');
  const garrett = [ev('Garrett: dentist', '14:30', '15:00')];
  ok(!isWindowFree(DATE, garrett, w, o('Garrett')) && isWindowFree(DATE, garrett, w, o('Logan')), "Garrett's own event: the other way round");
});

test('an untagged event blocks a custom time for BOTH hosts (and with no host)', () => {
  const board = [ev('Board meeting', '14:30', '15:00')], w = customWindow('14:15');
  for (const h of ['Garrett', 'Logan', '', 'Dana']) ok(!isWindowFree(DATE, board, w, { tz: CHI, host: h }), `blocked for ${h || 'no host'}`);
});

test('custom times follow the preset rules: Banana, cancelled, back-to-back, the past', () => {
  const w = customWindow('14:15'), o = { tz: CHI, host: 'Garrett' };
  ok(isWindowFree(DATE, [ev('Board meeting', '14:00', '15:00', { colorId: BANANA })], w, o), 'Banana does not block');
  ok(isWindowFree(DATE, [ev('Board meeting', '14:00', '15:00', { status: 'cancelled' })], w, o), 'cancelled does not block');
  ok(isWindowFree(DATE, [ev('Board meeting', '13:15', '14:15'), ev('Board meeting', '15:15', '16:00')], w, o), 'back to back on both sides is free');
  ok(!isWindowFree(DATE, [], w, { ...o, now: Date.parse(at('14:15')) }), 'a custom time that has started is not free');
  ok(!isWindowFree(DATE, [], null, o), 'an invalid custom time is never free');
  ok(isWindowFree(DATE, [], customWindow('19:00'), o) && !isWindowFree(DATE, [ev('Board meeting', '19:59', '20:30')], customWindow('19:00'), o), '7:00 PM runs to 8:00');
});

/* ---- the routes, end to end, against a fake Google / Supabase / Resend ---- */
const BOOK_DATE = '2030-01-08';                  // a Tuesday, safely in the future
const bat = h => `${BOOK_DATE}T${h}:00-06:00`;    // CST in January
let CAL = [], calFail = false, posted = [], mails = [], leadWrites = [], LEAD_ROWS = [];
const realFetch = globalThis.fetch;
const fake = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const J = (d, s = 200) => ({ ok: s < 300, status: s, headers: new Headers({ 'content-type': 'application/json' }), json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('api_hits')) return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
  if (u.includes('/rest/v1/secrets')) return J({ data: { refresh_token: 'r' } });
  if (u.includes('oauth2.googleapis.com/token')) return J({ access_token: 'g' });
  if (u.includes('googleapis.com/calendar')) {
    if (method === 'GET') return calFail ? J({}, 403) : J({ items: CAL });
    posted.push(JSON.parse(opts.body)); return J({ id: 'ev1', htmlLink: 'https://cal/ev1' });
  }
  if (u.includes('/rest/v1/leads')) { if (method === 'GET') return J(LEAD_ROWS); leadWrites.push(JSON.parse(opts.body)); return J([], 201); }
  if (u.includes('crm_users')) return J([{ email: 'logan@getproytech.com' }]);
  if (u.includes('api.resend.com')) { mails.push(JSON.parse(opts.body)); return J({ id: 'm1' }); }
  return J({}, 404);
};
const call = async (route, body) => {
  const res = { code: 0, body: null }; res.status = c => { res.code = c; return res; }; res.json = b => { res.body = b; return res; }; res.setHeader = () => {}; res.end = () => res;
  await route({ method: 'POST', headers: { 'x-forwarded-for': '8.8.8.8', origin: 'https://www.getproytech.com' }, socket: {}, body }, res);
  return res;
};
const LOGAN_AT_2 = { summary: `Coffee: Pat ×${ZWSP} Logan (ProyTech)`, start: { dateTime: bat('14:00') }, end: { dateTime: bat('15:00') }, extendedProperties: { private: { coffeeHost: 'Logan' } } };
const GUEST = { date: BOOK_DATE, shop: 'Mokas Coffee — Delano', name: 'Sam Guest', phone: '316-555-0101', email: 'sam@guest.example' };

await testAsync('coffee-availability answers custom: true/false, per host, by the same rule', async () => {
  globalThis.fetch = fake;
  try {
    CAL = [LOGAN_AT_2]; calFail = false;
    let r = await call(availRoute, { date: BOOK_DATE, host: 'Garrett', custom: '14:15' });
    eq([r.body.ok, r.body.custom], [true, true], 'Garrett at 2:15, beside Logan’s coffee');
    ok(r.body.open.includes('1330') && r.body.open.includes('1830'), 'the presets come back too');
    r = await call(availRoute, { date: BOOK_DATE, host: 'Logan', custom: '14:15' });
    eq(r.body.custom, false, 'Logan at 2:15 is taken');
    ok(!r.body.open.includes('1330'), 'and Logan’s 1:30 preset is taken too (it overlaps 2:00)');
    CAL = [{ summary: 'Board meeting', start: { dateTime: bat('14:30') }, end: { dateTime: bat('15:00') } }];
    for (const h of ['Garrett', 'Logan']) eq((await call(availRoute, { date: BOOK_DATE, host: h, custom: '14:15' })).body.custom, false, `untagged blocks ${h}`);
    CAL = [];
    for (const bad of ['14:10', '06:45', '19:15', '2:15', 'soon', '']) eq((await call(availRoute, { date: BOOK_DATE, host: 'Garrett', custom: bad })).body.custom, false, `invalid ${bad}`);
    eq((await call(availRoute, { date: '2020-01-07', host: 'Garrett', custom: '14:15' })).body.custom, false, 'in the past');
    r = await call(availRoute, { date: BOOK_DATE, host: 'Garrett' });
    ok(!('custom' in r.body) && r.body.open.length === 7, 'no custom asked: the usual answer, all seven presets');
    calFail = true;
    r = await call(availRoute, { date: BOOK_DATE, host: 'Garrett', custom: '14:15' });
    eq([r.body.custom, r.body.open.length, r.body.reason], [false, 0, 'calendar_read_failed'], 'an unread calendar: custom false, nothing open');
  } finally { globalThis.fetch = realFetch; calFail = false; }
});

await testAsync('coffee-book: a custom slot is re-checked for that host and booked at that time', async () => {
  globalThis.fetch = fake;
  try {
    CAL = [LOGAN_AT_2]; posted = []; mails = []; leadWrites = [];
    let r = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: 'c1415' });
    eq(r.body && r.body.ok, true, 'Garrett books 2:15 beside Logan’s coffee: ' + JSON.stringify(r.body));
    const e = posted[0] || {};
    eq([e.start && e.start.dateTime, e.end && e.end.dateTime, e.start && e.start.timeZone], [`${BOOK_DATE}T14:15:00`, `${BOOK_DATE}T15:15:00`, 'America/Chicago'], 'the invite is 2:15–3:15 Chicago');
    eq(e.extendedProperties && e.extendedProperties.private.coffeeHost, 'Garrett', 'tagged for Garrett');
    ok(e.attendees && e.attendees[0].email === GUEST.email, 'the guest is invited');
    ok(/^Coffee: Sam Guest ×.* Garrett \(ProyTech\)$/.test(e.summary || ''), 'the title still says whose coffee it is: ' + e.summary);
    const lead = (leadWrites[0] && leadWrites[0].data) || {};
    const m = (lead.meetings || [])[0] || {};
    eq([m.mtype, m.start, m.end, m.host, m.status], ['Coffee', `${BOOK_DATE}T14:15:00`, `${BOOK_DATE}T15:15:00`, 'Garrett', ''], 'the CRM meeting');
    ok((lead.activities || []).some(a => /2030-01-08 · 2:15–3:15 PM/.test(a.text || '')), 'the CRM note says 2:15–3:15 PM');
    ok(mails.length === 1 && /<b>When:<\/b> Tue, Jan 8 · 2:15–3:15 PM</.test(mails[0].html), 'the owner email: "Tue, Jan 8 · 2:15–3:15 PM"');
    eq(slotLabel('c1415'), '2:15–3:15 PM', 'slotLabel');

    posted = [];
    r = await call(bookRoute, { ...GUEST, host: 'Logan', slot: 'c1415' });
    eq([r.body.ok, r.body.error, posted.length], [false, 'slot_taken', 0], 'Logan cannot: it overlaps his own coffee, nothing created');
    CAL = [{ summary: 'Board meeting', start: { dateTime: bat('14:30') }, end: { dateTime: bat('15:00') } }];
    for (const h of ['Garrett', 'Logan']) eq((await call(bookRoute, { ...GUEST, host: h, slot: 'c1415' })).body.error, 'slot_taken', `an untagged event blocks ${h}`);

    CAL = []; posted = [];
    for (const bad of ['c1410', 'c0645', 'c1915', 'c14:15', '1415', 'c', 'later'])
      { const x = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: bad }); eq([x.code, x.body.error], [400, 'bad date/slot'], `rejects ${bad}`); }
    eq(posted.length, 0, 'and none of them touched the calendar');
    r = await call(bookRoute, { ...GUEST, host: 'Logan', slot: '1830' });
    ok(r.body.ok && posted[0].start.dateTime === `${BOOK_DATE}T18:30:00`, 'a new preset (6:30 PM) books too');
    calFail = true; posted = [];
    r = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: 'c1415' });
    eq([r.body.ok, r.body.error, posted.length], [false, 'calendar_read_failed', 0], 'an unread calendar books nothing');
  } finally { globalThis.fetch = realFetch; calFail = false; }
});

test('the Race to 20 still counts these coffees once held', () => {
  const lead = (leadWrites[0] && leadWrites[0].data) || {};
  const held = { data: { ...lead, meetings: (lead.meetings || []).map(m => ({ ...m, status: 'held' })) } };
  eq(countRace([held], '2030-01-01', '2030-01-31', CHI), { Garrett: 1, Logan: 0 }, 'a custom-time coffee is credited to its host');
  const evening = { data: { meetings: [{ mtype: 'Coffee', status: 'held', host: 'Logan', start: '2026-10-10T18:30:00' }] } };
  eq(countRace([evening], '2026-10-03', '2026-10-10', CHI), { Garrett: 0, Logan: 1 }, 'a 6:30 PM coffee on the last day counts');
});

/* ---- how they arrived vs what they told us (Relationships Part 2) -------
   A coffee booking ARRIVED VIA the coffee page, always. The visitor's "how
   did you hear" answer is its own field, `heard`, and never becomes source or
   introducedBy: a typed name is not a contact id, and the old code wrote the
   name itself into introducedBy, which reads as "(removed contact)". */
await testAsync('a new coffee lead: Arrived via "Coffee page", the answer kept separately, no guessed credit', async () => {
  globalThis.fetch = fake;
  try {
    CAL = []; LEAD_ROWS = []; leadWrites = []; posted = []; mails = [];
    let r = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: '0900', heard: 'intro', referrer: 'Dana Realtor' });
    eq(r.body.ok, true, 'booked: ' + JSON.stringify(r.body));
    let lead = (leadWrites[0] && leadWrites[0].data) || {};
    eq(lead.source, 'Coffee page', 'arrived via the coffee page, not "Intro from Dana Realtor"');
    eq(lead.heard, { answer: 'Someone introduced us', referrer: 'Dana Realtor', on: BOOK_DATE }, 'the answer, as its own field');
    eq(lead.introducedBy, '', 'nobody credited by guess: the name is not a contact');
    ok(mails.length === 1 && /Heard:<\/b> intro — Dana Realtor/.test(mails[0].html), 'the owners still see what they said');
    leadWrites = [];
    r = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: '1030', heard: 'Facebook' });
    lead = (leadWrites[0] && leadWrites[0].data) || {};
    eq([lead.source, lead.heard], ['Coffee page', { answer: 'Facebook', on: BOOK_DATE }], 'any other answer: Coffee page, and the answer kept');
    leadWrites = [];
    r = await call(bookRoute, { ...GUEST, host: 'Garrett', slot: '1200' });
    lead = (leadWrites[0] && leadWrites[0].data) || {};
    ok(lead.source === 'Coffee page' && !('heard' in lead), 'no answer: Coffee page, no heard field');
  } finally { globalThis.fetch = realFetch; }
});

await testAsync('an existing lead keeps how it first arrived, and its credit', async () => {
  globalThis.fetch = fake;
  try {
    CAL = []; leadWrites = [];
    const row = (data) => ({ id: 'L1', owner_id: 'u1', pool: null, data: { id: 'L1', name: 'Sam Guest', email: GUEST.email, activities: [], meetings: [], keyDates: [], ...data } });
    LEAD_ROWS = [row({ source: 'Website', introducedBy: 'dana' })];
    await call(bookRoute, { ...GUEST, host: 'Garrett', slot: '0900', heard: 'intro', referrer: 'Pat' });
    let d = (leadWrites[0] && leadWrites[0].data) || {};
    eq([d.source, d.introducedBy], ['Website', 'dana'], 'a known channel and a linked referrer are untouched');
    eq(d.heard, { answer: 'Someone introduced us', referrer: 'Pat', on: BOOK_DATE }, 'the answer is recorded, since there was none');
    leadWrites = []; LEAD_ROWS = [row({ source: '', heard: { answer: 'Postcard', on: '2029-12-01' } })];
    await call(bookRoute, { ...GUEST, host: 'Garrett', slot: '0900', heard: 'Facebook' });
    d = (leadWrites[0] && leadWrites[0].data) || {};
    eq(d.source, 'Coffee page', 'an empty channel becomes Coffee page');
    eq(d.heard, { answer: 'Postcard', on: '2029-12-01' }, 'the first answer they gave is kept, not overwritten');
    ok((d.activities || []).some(a => /How they heard: Facebook/.test(a.text || '')), 'the new answer is still in the booking note');
  } finally { globalThis.fetch = realFetch; LEAD_ROWS = []; }
});

report('coffee');
