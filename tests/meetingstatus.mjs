/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_mstatus = bundleName('mstatus');
const B_mstatus_lead = bundleName('mstatus_lead');
/* A MEETING WITH AN UNKNOWN STATUS MUST NOT DISAPPEAR.
   ============================================================================

   api/coffee-book.js saved coffees with status:'scheduled'. The CRM's
   vocabulary is '' (not happened yet), 'held', 'noshow', and every bucket asked
   for !m.status, so a 'scheduled' coffee was in NO bucket: not Upcoming before
   its time and not Needs status after. Nobody was ever asked whether it
   happened, so nobody marked it held, so the Race to 20 never counted it.

   Two halves, both tested here:
   - going forward, coffee-book writes '' (asserted on the write itself);
   - bookings already saved as 'scheduled' are read as '' through ONE helper,
     meetingStatus() in src/lib/lead.js, which isUpcoming, needsStatus,
     needsDate, meetingsOf and the dashboard all go through.

   The jsdom half mounts the real App, so the Meetings tabs, the dashboard tile
   and the Held click are the ones a person uses, and the held write is checked
   on what reaches the database.                                             */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { countRace } from '../api/coffee-race.js';

/* lib/lead.js uses extensionless imports, so it is bundled first — the same way
   tests/cardfee.mjs and tests/closedmonth.mjs reach it. */
const libOut = await esbuild.build({ entryPoints: ['src/lib/lead.js'], bundle: true, write: false, format: 'esm',
  platform: 'neutral', external: ['lucide-react', 'react'], define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
fs.writeFileSync('tests/'+B_mstatus_lead, libOut.outputFiles[0].text);
const {
  MEETING_STATUSES, meetingStatus, meetingsOf, isUpcoming, needsStatus, needsDate,
} = await import('./'+B_mstatus_lead+'?v=' + Date.now());
fs.unlinkSync('tests/'+B_mstatus_lead);

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

/* ---- the shared reader, on its own -------------------------------------- */
console.log('\nmeetingStatus() — one vocabulary, read in one place');
{
  ok('the vocabulary is blank, held, noshow', JSON.stringify(MEETING_STATUSES) === JSON.stringify(['', 'held', 'noshow']));
  ok("'scheduled' reads as blank", meetingStatus({ status: 'scheduled' }) === '');
  ok('missing / null / blank read as blank', [{}, { status: null }, { status: '' }].every(m => meetingStatus(m) === ''));
  ok('held and noshow are kept', meetingStatus({ status: 'held' }) === 'held' && meetingStatus({ status: 'noshow' }) === 'noshow');
  ok('meetingsOf() hands every screen the normalised status',
     meetingsOf({ meetings: [{ id: 'a', status: 'scheduled', start: '2030-01-01T09:00:00' }] })[0].status === '');

  const NOW = Date.parse('2030-06-15T12:00:00Z');
  const at = (iso, status) => ({ id: 'x', start: iso, end: iso, status });
  for (const s of ['', 'scheduled']) {
    const label = s ? "status 'scheduled'" : 'status blank';
    ok(`${label}, before its time: Upcoming, not Needs status`,
       isUpcoming(at('2030-06-16T09:00:00Z', s), NOW) && !needsStatus(at('2030-06-16T09:00:00Z', s), NOW));
    ok(`${label}, after its time: Needs status, not Upcoming`,
       needsStatus(at('2030-06-14T09:00:00Z', s), NOW) && !isUpcoming(at('2030-06-14T09:00:00Z', s), NOW));
  }
  ok('a held meeting is in neither time bucket',
     !isUpcoming(at('2030-06-16T09:00:00Z', 'held'), NOW) && !needsStatus(at('2030-06-14T09:00:00Z', 'held'), NOW));
  ok("a dateless 'scheduled' meeting asks for a date", needsDate({ status: 'scheduled', dateUnknown: true }));
}

/* ---- coffee-book writes the vocabulary --------------------------------- */
console.log('\napi/coffee-book.js — new bookings are saved blank');
{
  const src = fs.readFileSync(path.resolve('api/coffee-book.js'), 'utf8');
  const meeting = src.slice(src.indexOf('const meeting = {'), src.indexOf('};', src.indexOf('const meeting = {')));
  ok("the meeting it writes has status: ''", /\bstatus:\s*''/.test(meeting), meeting);
  ok("and nothing in it says 'scheduled'", !/['"]scheduled['"]/.test(meeting.replace(/\/\/.*$/gm, '')));
}

/* ---- the real app ------------------------------------------------------- */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__WRITES__ = []; globalThis.__CAL__ = []; globalThis.__TASKS__ = []; globalThis.__USER_WRITES__ = [];
globalThis.__EVENTS__ = []; globalThis.__EVENT_WRITES__ = []; globalThis.__USERS__ = []; globalThis.__SETTINGS_WRITES__ = [];
globalThis.fetch = async u => {
  if (String(u).includes('google-status')) return { ok: true, json: async () => ({ connected: true, email: 'admin@getproytech.com' }) };
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};

const pad = n => String(n).padStart(2, '0');
/* Wall clock, no offset — exactly what coffee-book writes. */
const local = (days, hh = 9) => { const d = new Date(Date.now() + days * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hh)}:00:00`; };
const iso = n => new Date(Date.now() + n * 864e5).toISOString();
/* The shape api/coffee-book.js saves, with the status under test. */
const coffee = (id, start, status, host) => ({
  id, mtype: 'Coffee', title: 'Coffee with ' + id, start, end: start.replace(/T(\d\d)/, (_, h) => 'T' + pad(+h + 1)),
  location: 'Mokas Coffee, Delano District, Wichita, KS', status, eventId: 'ev_' + id, host, createdAt: iso(-10),
});
const lead = (id, name, m) => ({ id, name, company: name, owner: 'Garrett', stage: 'new', createdAt: iso(-30),
  activities: [], deals: [], dealValue: 0, meetings: [m] });
globalThis.__LEADS__ = [
  lead('l1', 'NewCoffee Future', coffee('cb1', local(3), '', 'Logan')),             // booked after this fix
  lead('l2', 'OldCoffee Future', coffee('cs1', local(4), 'scheduled', 'Garrett')),  // booked before it
  lead('l3', 'NewCoffee Past', coffee('cb2', local(-2), '', 'Logan')),
  lead('l4', 'OldCoffee Past', coffee('cs2', local(-3), 'scheduled', 'Garrett')),
];

const out = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel: 'silent' });
fs.writeFileSync('tests/'+B_mstatus, out.outputFiles[0].text);
const mod = await import('./'+B_mstatus+'?v=' + Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 90)); });

const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 70) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const nav = async l => { const b = [...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const tabBtn = l => [...document.querySelectorAll('.mtab')].find(b => (b.textContent || '').trim().startsWith(l));
const names = () => [...document.querySelectorAll('.mrow-name')].map(e => (e.textContent || '').trim()).sort();
const tabs = () => [...document.querySelectorAll('.mtab')].map(b => (b.textContent || '').replace(/\s/g, '')).join('|');
const W = id => globalThis.__WRITES__.filter(w => w.id === id).at(-1);

try {
  console.log('\nthe dashboard counts both kinds as upcoming');
  await nav('Dashboard');
  ok("'2 upcoming' on the Meetings Booked tile", /\b2 upcoming\b/.test(document.body.textContent || ''),
     ((document.body.textContent || '').match(/\d+ upcoming/g) || []).join(' | '));

  console.log('\nMeetings → Upcoming, before their time');
  await nav('Meetings');
  ok('Upcoming counts 2', /Upcoming2/.test(tabs()), tabs());
  await click(tabBtn('Upcoming')); await settle();
  ok('a coffee-book meeting (blank) is in Upcoming', names().includes('NewCoffee Future'), names().join(' | '));
  ok("an existing 'scheduled' coffee is in Upcoming", names().includes('OldCoffee Future'), names().join(' | '));
  ok('  and nothing past is', names().length === 2, names().join(' | '));

  console.log('\nMeetings → Needs status, after their time');
  ok('Needs status counts 2', /Needsstatus2/.test(tabs()), tabs());
  await click(tabBtn('Needs status')); await settle();
  ok('a coffee-book meeting (blank) is in Needs status', names().includes('NewCoffee Past'), names().join(' | '));
  ok("an existing 'scheduled' coffee is in Needs status", names().includes('OldCoffee Past'), names().join(' | '));
  ok('  and each offers Held / No-show', document.querySelectorAll('.mrow .ms-b.held').length === 2);

  console.log('\nmark both Held');
  for (const who of ['OldCoffee Past', 'NewCoffee Past']) {
    const row = [...document.querySelectorAll('.mrow')].find(r => (r.textContent || '').includes(who));
    const btn = row && row.querySelector('.ms-b.held');
    ok(`a Held button is on ${who}`, !!btn);
    if (btn) await click(btn);
    await settle();
  }
  const cs2 = ((W('l4') || {}).meetings || []).find(m => m.id === 'cs2');
  const cb2 = ((W('l3') || {}).meetings || []).find(m => m.id === 'cb2');
  ok("the 'scheduled' one is saved as held", cs2 && cs2.status === 'held', JSON.stringify(cs2 && cs2.status));
  ok('the blank one is saved as held', cb2 && cb2.status === 'held', JSON.stringify(cb2 && cb2.status));
  ok('  each stamped with who and when', [cs2, cb2].every(m => m && m.heldBy && m.heldAt));
  ok('  and the host survives the write', cs2 && cs2.host === 'Garrett' && cb2 && cb2.host === 'Logan');
  ok('Held now counts 2 and Needs status 0', /Held2/.test(tabs()) && /Needsstatus0/.test(tabs()), tabs());
  await click(tabBtn('Held')); await settle();
  ok('both are in the Held tab', names().join('|') === 'NewCoffee Past|OldCoffee Past', names().join(' | '));

  console.log('\nand the Race to 20 counts what reached the database');
  const tz = 'America/Chicago';
  const start = local(-7).slice(0, 10), end = local(7).slice(0, 10);
  const written = ['l1', 'l2', 'l3', 'l4'].map(id => ({ data: W(id) || globalThis.__LEADS__.find(l => l.id === id) }));
  const counts = countRace(written, start, end, tz);
  ok('each held coffee is credited to its host', counts.Garrett === 1 && counts.Logan === 1, JSON.stringify(counts));
  const before = countRace(globalThis.__LEADS__.map(l => ({ data: l })), start, end, tz);
  ok("countRace still counts only status === 'held' (blank and 'scheduled' count 0)",
     before.Garrett === 0 && before.Logan === 0, JSON.stringify(before));
} finally {
  await act(async () => { root.unmount(); });
  try { fs.unlinkSync('tests/'+B_mstatus); } catch {}
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
