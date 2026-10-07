/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lib = bundleName('rclib');
const B_app = bundleName('rcapp');
/* STAYING IN TOUCH ON A CADENCE (Relationships & Referrals spec, Part 1).
   ============================================================================

   Two halves.

   THE RULES, as pure functions (lib/relationships, lib/lead lastTouch):
     - cadence per tier (A 14 / B 30 / C 90), Settings overriding a tier, a
       never-saved tier falling back BY NAME, junk refused
     - a per-person override, and blank meaning the tier
     - next touch = last touch + cadence; a sooner follow-up date wins, a later
       one does not; never contacted is due now
     - last touch derived from every touch kind Log touch offers, a note a
       person wrote and a meeting marked held; not from a machine note, an
       import, a no-answer, a no-show or a meeting still to come
     - the Reach out groups: overdue / due this week / birthdays 3 days ahead
       (across New Year too), A tier first, Mine by owner
     - the Huddle's cold list is the cadence, and ignores follow-up dates

   THE REAL APP, as the owner:
     - the dashboard's "Reach out" and the Relationships strip list the SAME
       people in the same order
     - Mine keeps only relationships the signed-in person owns
     - "Log touch" writes exactly ONE activity, from the dashboard, the strip,
       the List and the record, and what reaches the database is the activity
       lib/relationships builds (Coffee is a Meeting with mtype Coffee)
     - the person logged leaves the overdue list at once
     - Settings → Relationship cadence names its fallbacks and saves
       settings.relCadence; the strip reads the new number
     - the dashboard's Going Cold count is the cadence's cold list

   The rep's card is tests/relcadencerep.mjs (a second signed-in identity
   needs its own process). */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };

const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };

/* LOCAL dates, the way the app's isoOf builds a day */
const isoD = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const day = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoD(x); };
const at = n => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
const TODAY = day(0);

/* ======================================================= the rules ===== */
{
  const lib = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/relationships.js'] });
  fs.writeFileSync('tests/' + B_lib, lib.outputFiles[0].text);
}
const R = await import('./' + B_lib + '?v=' + Date.now());
const act = (type, n, o = {}) => ({ id: type + n + Math.random(), ts: at(-n), type, text: 'x', who: 'Garrett', ...o });
const rel = o => ({ id: 'x', name: 'X', isRelationship: true, owner: 'Garrett', activities: [], meetings: [], keyDates: [], ...o });

console.log('\ncadence per tier, from Settings, with named fallbacks');
{
  const none = R.readCadence(null);
  ok('nothing saved: A 14, B 30, C 90', none.days.champion === 14 && none.days.b === 30 && none.days.new === 90, JSON.stringify(none.days));
  ok('  and all three are named as fallbacks', JSON.stringify(none.fellBack) === JSON.stringify(['champion', 'b', 'new']), JSON.stringify(none.fellBack));
  const part = R.readCadence({ relCadence: { b: 45 } });
  ok('B saved as 45: B is 45, A and C fall back by name', part.days.b === 45 && JSON.stringify(part.fellBack) === JSON.stringify(['champion', 'new']), JSON.stringify(part));
  const junk = R.readCadence({ relCadence: { champion: 0, b: 400, new: 'soon' } });
  ok('0, 400 and words are refused: every tier falls back', junk.fellBack.length === 3 && junk.days.champion === 14 && junk.days.b === 30, JSON.stringify(junk));
}

console.log('\nper-person override');
{
  const cfg = R.readCadence(null);
  ok('relCadenceDays 7 on a C: every 7 days, marked as theirs', JSON.stringify(R.cadenceOf(rel({ relTier: 'new', relCadenceDays: 7 }), cfg)) === JSON.stringify({ days: 7, source: 'person' }));
  ok('blank: the tier', JSON.stringify(R.cadenceOf(rel({ relTier: 'b', relCadenceDays: '' }), cfg)) === JSON.stringify({ days: 30, source: 'tier' }));
  ok('an unknown tier reads as C, not as a missing number', R.cadenceOf(rel({ relTier: 'zzz' }), cfg).days === 90);
}

console.log('\nnext touch = last touch + cadence');
{
  const cfg = R.readCadence(null);
  for (const [tier, days] of [['champion', 14], ['b', 30], ['new', 90]]) {
    const n = R.nextTouch(rel({ relTier: tier, activities: [act('Call', 10)] }), cfg, TODAY);
    ok(`${R.tierLetter(tier)}: touched 10 days ago, due in ${days - 10}`, n.due === day(days - 10) && n.source === 'cadence', JSON.stringify(n));
  }
  const own = R.nextTouch(rel({ relTier: 'new', relCadenceDays: 7, activities: [act('Call', 10)] }), cfg, TODAY);
  ok('a C with its own 7 days, touched 10 days ago: 3 days late', own.due === day(-3) && own.daysLate === 3, JSON.stringify(own));
  const sooner = R.nextTouch(rel({ relTier: 'new', followUp: day(2), activities: [act('Call', 10)] }), cfg, TODAY);
  ok('a follow-up date sooner than the cadence wins', sooner.due === day(2) && sooner.source === 'followUp', JSON.stringify(sooner));
  const later = R.nextTouch(rel({ relTier: 'champion', followUp: day(30), activities: [act('Call', 10)] }), cfg, TODAY);
  ok('a later one does not buy time', later.due === day(4) && later.source === 'cadence', JSON.stringify(later));
  const never = R.nextTouch(rel({ relTier: 'b' }), cfg, TODAY);
  ok('never contacted: due now', never.due === TODAY && never.source === 'never' && never.last === null, JSON.stringify(never));
}

console.log('\nlast touch is derived from logged activity, never typed');
{
  const cfg = R.readCadence(null);
  const lastOf = r => R.nextTouch(r, cfg, TODAY).last;
  for (const k of R.TOUCH_KINDS) {
    const [type, text, extra] = R.touchActivity(k.key, '');
    const r = rel({ activities: [{ id: 'a', ts: at(-5), type, text, who: 'Garrett', ...extra }] });
    ok(`${k.key} (written as ${type}${extra.mtype ? ' / ' + extra.mtype : ''}) is a touch`, lastOf(r) === day(-5), JSON.stringify(R.nextTouch(r, cfg, TODAY)));
  }
  ok('a note a person wrote is a touch', lastOf(rel({ activities: [act('Note', 5, { text: 'Saw him at the chamber lunch' })] })) === day(-5));
  ok('a meeting marked held is a touch', lastOf(rel({ meetings: [{ id: 'm', mtype: 'Coffee', start: at(-4), end: at(-4), status: 'held' }] })) === day(-4));
  ok('  newer than an older call, it wins', lastOf(rel({ activities: [act('Call', 20)], meetings: [{ id: 'm', start: at(-4), end: at(-4), status: 'held' }] })) === day(-4));
  ok('a no-show is not', lastOf(rel({ meetings: [{ id: 'm', start: at(-4), end: at(-4), status: 'noshow' }] })) === null);
  ok('a meeting not yet marked is not', lastOf(rel({ meetings: [{ id: 'm', start: at(-4), end: at(-4), status: '' }] })) === null);
  ok('one "held" in the future is not, until it has happened', lastOf(rel({ meetings: [{ id: 'm', start: at(3), end: at(3), status: 'held' }] })) === null);
  ok('a machine note is not', lastOf(rel({ activities: [act('Note', 1, { text: 'Follow-up cleared.' })] })) === null);
  ok('an imported note is not', lastOf(rel({ activities: [act('Note', 1, { imported: true })] })) === null);
  ok('a no-answer dial is not', lastOf(rel({ activities: [act('Call', 1, { disp: 'NA' })] })) === null);
  const [t1, x1, e1] = R.touchActivity('Coffee', 'talked about the expo');
  ok('Log touch "Coffee" with a note: a Meeting, mtype Coffee, the note kept', t1 === 'Meeting' && e1.mtype === 'Coffee' && e1.touch === 'Coffee' && x1 === 'Coffee: talked about the expo', JSON.stringify([t1, x1, e1]));
  ok('  with no note it still writes a readable line', R.touchActivity('Intro', '')[1] === 'Intro logged');
  ok('  an unknown kind writes nothing', R.touchActivity('Telegram', 'hi') === null);
}

console.log('\nthe Reach out groups');
{
  const cfg = R.readCadence(null);
  const rels = [
    rel({ id: 'c1', name: 'C overdue', relTier: 'new', activities: [act('Call', 100)] }),
    rel({ id: 'a1', name: 'A overdue', relTier: 'champion', activities: [act('Call', 20)] }),
    rel({ id: 'a0', name: 'A never', relTier: 'champion', owner: 'Tony' }),
    rel({ id: 'b1', name: 'B this week', relTier: 'b', activities: [act('Call', 27)] }),
    rel({ id: 'a2', name: 'A this week', relTier: 'champion', activities: [act('Call', 12)] }),
    rel({ id: 'b2', name: 'B fine', relTier: 'b', activities: [act('Call', 2)] }),
    rel({ id: 'bd', name: 'Birthday soon', relTier: 'new', activities: [act('Call', 2)], keyDates: [{ id: 'k', label: 'Birthday', date: '0000' + day(3).slice(4), annual: true }] }),
    rel({ id: 'bf', name: 'Birthday later', relTier: 'new', activities: [act('Call', 2)], keyDates: [{ id: 'k', label: 'Birthday', date: '0000' + day(4).slice(4), annual: true }] }),
    { id: 'L1', name: 'A lead, not a relationship', relTier: 'champion', activities: [], meetings: [], keyDates: [] },
  ];
  const ro = R.reachOut(rels, { cfg, today: TODAY });
  const names = k => ro[k].map(x => x.name);
  ok('overdue: A first (never contacted at the top), then C', JSON.stringify(names('overdue')) === JSON.stringify(['A never', 'A overdue', 'C overdue']), JSON.stringify(names('overdue')));
  ok('due this week: A first, then B', JSON.stringify(names('week')) === JSON.stringify(['A this week', 'B this week']), JSON.stringify(names('week')));
  ok('a birthday 3 days out shows; 4 days out does not', JSON.stringify(names('birthdays')) === JSON.stringify(['Birthday soon']), JSON.stringify(names('birthdays')));
  ok('someone inside their cadence is not listed', !JSON.stringify(ro).includes('B fine'));
  ok('a lead that is not a relationship is never listed', !JSON.stringify(ro).includes('not a relationship'));
  ok('count is every row', ro.count === 6, ro.count);
  const mine = R.reachOut(rels, { cfg, today: TODAY, mine: 'Tony' });
  ok('Mine keeps only what that person owns', mine.count === 1 && mine.overdue[0].name === 'A never', JSON.stringify(mine.overdue.map(x => x.name)));
  const nye = R.reachOut([rel({ name: 'New Year baby', activities: [act('Call', 1)], keyDates: [{ id: 'k', label: 'Spouse birthday', date: '1980-01-01', annual: true }] })], { cfg, today: '2026-12-30' });
  ok('across New Year: 30 Dec sees a 1 Jan birthday, in 2 days', nye.birthdays.length === 1 && nye.birthdays[0].inDays === 2 && nye.birthdays[0].on === '2027-01-01', JSON.stringify(nye.birthdays));
}

console.log('\nthe Huddle\'s cold list is the cadence');
{
  const cfg = R.readCadence(null);
  const cold = R.coldByCadence([
    rel({ id: 'a', name: 'A 20d', relTier: 'champion', activities: [act('Call', 20)] }),
    rel({ id: 'b', name: 'B 20d', relTier: 'b', activities: [act('Call', 20)] }),
    rel({ id: 'n', name: 'never', relTier: 'new' }),
    rel({ id: 'f', name: 'A 20d with a date ahead', relTier: 'champion', followUp: day(5), activities: [act('Call', 20)] }),
  ], cfg, TODAY);
  const nm = cold.map(x => x.r.name);
  ok('an A silent 20 days is cold (it was not, at the old 30)', nm.includes('A 20d'), JSON.stringify(nm));
  ok('a B silent 20 days is not', !nm.includes('B 20d'), JSON.stringify(nm));
  ok('never contacted is cold, and coldest', nm[0] === 'never', JSON.stringify(nm));
  ok('a follow-up date does not hide someone from the cold list', nm.includes('A 20d with a date ahead'), JSON.stringify(nm));
}

/* ====================================================== the real app ==== */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const call = n => ({ id: 'c' + n + Math.random().toString(36).slice(2, 6), ts: at(-n), type: 'Call', text: 'spoke', who: 'Garrett' });
const appRel = o => ({ company: 'Co', owner: 'Garrett', owner_id: 'u_owner', isRelationship: true, createdAt: at(-400), meetings: [], deals: [], payments: [],
  custom: {}, serviceInterest: [], labels: [], keyDates: [], activities: [], ...o });
const RELS = [
  appRel({ id: 'r1', name: 'Ana Overdue', relTier: 'champion', activities: [call(30)] }),
  appRel({ id: 'r2', name: 'Ben Week', relTier: 'b', activities: [call(27)] }),
  appRel({ id: 'r3', name: 'Cal Fine', relTier: 'new', activities: [call(5)] }),
  appRel({ id: 'r4', name: 'Dee Tony', relTier: 'champion', owner: 'Tony', owner_id: 'u_rep', activities: [call(40)] }),
  appRel({ id: 'r5', name: 'Eve Held', relTier: 'champion', meetings: [{ id: 'm1', title: 'Coffee', mtype: 'Coffee', start: at(-10), end: at(-10), status: 'held', createdAt: at(-12) }] }),
  appRel({ id: 'r6', name: 'Fay Birthday', relTier: 'new', activities: [call(5)], keyDates: [{ id: 'k1', label: 'Birthday', date: '0000' + day(2).slice(4), annual: true }] }),
];
const OWNER = { id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] };
const REP = { id: 'u_rep', name: 'Tony', email: 'tony@agency.test', role: 'rep', pools: [], commission_pct: 25, appointment_rate: 0, active: true, tabs: ['dash', 'leads', 'rels'], goal_conversions: 0, nav_order: [] };
globalThis.__USERS__ = [OWNER, REP]; globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }, { id: 'u_rep', name: 'Tony', role: 'rep' }];
globalThis.__LEADS__ = RELS; globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New Lead', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }, { key: 'lost', label: 'Lost', color: '#B0606A', prob: 0, open: false, won: false, lost: true }] };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

{
  const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text);
}
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act: rAct } = await import('react');
const settle = async (ms = 120) => { await rAct(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { if (!el) throw new Error('click: element not found'); await rAct(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(60); };
const nav = async label => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === label));
const typeIn = async (el, v) => { await rAct(async () => {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };
const blur = async el => { await rAct(async () => { el.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); }); await settle(60); };
const names = sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim());
const lastWrite = id => [...globalThis.__WRITES__].reverse().find(w => w && w.id === id);
const actsNow = id => ((lastWrite(id) || RELS.find(r => r.id === id)).activities || []);

const el = document.getElementById('root');
const root = createRoot(el);
await rAct(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(260);

console.log('\nthe dashboard\'s Reach out and the Relationships strip agree');
const dashOver = names('.lc-reach .ro-grp.overdue .ro-name'), dashWeek = names('.lc-reach .ro-grp.week .ro-name'), dashBday = names('.lc-reach .ro-grp.birthdays .ro-name');
ok('"What\'s due" shows a Reach out group for the owner, with no client work at all', !!el.querySelector('.lc-due .lc-reach'), (el.textContent || '').slice(0, 200));
ok('overdue on the dashboard: both A tiers past 14 days, every owner', JSON.stringify(dashOver) === JSON.stringify(['Dee Tony', 'Ana Overdue']), JSON.stringify(dashOver));
ok('due this week: the held coffee 10 days ago counts as the last touch (A due in 4), then the B', JSON.stringify(dashWeek) === JSON.stringify(['Eve Held', 'Ben Week']), JSON.stringify(dashWeek));
ok('birthdays: two days out', JSON.stringify(dashBday) === JSON.stringify(['Fay Birthday']), JSON.stringify(dashBday));
const coldKpi = [...el.querySelectorAll('.kpi')].find(k => /^Going Cold$/.test(((k.querySelector('.kl') || {}).textContent || '').trim()));
const coldVal = coldKpi ? (coldKpi.querySelector('.kv') || {}).textContent : '(no Going Cold tile)';
ok('the dashboard\'s Going Cold count is the cadence\'s cold list (2: both As past 14 days)', coldVal === '2', coldVal);

const seg = [...el.querySelectorAll('.lc-due .seg-b')].find(b => /Mine/.test(b.textContent));
await click(seg);
ok('Mine: only the relationships Garrett owns', !names('.lc-reach .ro-name').includes('Dee Tony') && names('.lc-reach .ro-name').includes('Ana Overdue'), JSON.stringify(names('.lc-reach .ro-name')));
await click([...el.querySelectorAll('.lc-due .seg-b')].find(b => /Everyone/.test(b.textContent)));

await nav('Relationships'); await settle(120);
const stripAll = names('.needs-att .ro-name');
ok('the Relationships strip lists the same people, in the same order', JSON.stringify(stripAll) === JSON.stringify([...dashOver, ...dashWeek, ...dashBday]), JSON.stringify(stripAll));
ok('the tier columns say A / B / C with the spec\'s words and the cadence', /A tier/.test(el.textContent) && /Actively sends business · every 14d/.test(el.textContent) && /Keep in touch · every 90d/.test(el.textContent));
ok('"Champions" and "New Relationships" are gone from the page', !/Champions|New Relationships/.test(el.querySelector('.relsurface').textContent));

console.log('\nLog touch writes one activity, from every place it is offered');
async function logFrom(scope, id, kind, note) {
  const before = actsNow(id).length, writes = globalThis.__WRITES__.length;
  const row = scope();
  if (!row) return { err: 'no row' };
  await click(row.querySelector('.lt-b'));
  const pop = row.querySelector('.lt-pop') || document.querySelector('.lt-pop');
  if (!pop) return { err: 'no popover' };
  if (note) await typeIn(pop.querySelector('.lt-note'), note);
  await click([...pop.querySelectorAll('.lt-k')].find(b => b.textContent === kind));
  await settle(80);
  const after = actsNow(id);
  return { added: after.length - before, newWrites: globalThis.__WRITES__.length - writes, a: after[0] };
}
const rowNamed = (sel, name) => () => [...document.querySelectorAll(sel)].find(r => (r.textContent || '').includes(name));

{
  const r = await logFrom(rowNamed('.needs-att .ro-row', 'Ana Overdue'), 'r1', 'Coffee', 'talked about the expo');
  ok('from the strip: exactly one new activity on Ana, in one write', r.added === 1 && r.newWrites === 1, JSON.stringify(r));
  ok('  and it is a Meeting with mtype Coffee, the note kept, by Garrett', r.a && r.a.type === 'Meeting' && r.a.mtype === 'Coffee' && r.a.touch === 'Coffee' && r.a.text === 'Coffee: talked about the expo' && r.a.who === 'Garrett', JSON.stringify(r.a));
  ok('  Ana leaves the overdue list at once', !names('.needs-att .ro-grp.overdue .ro-name').includes('Ana Overdue'), JSON.stringify(names('.needs-att .ro-grp.overdue .ro-name')));
}
{
  const seg2 = [...el.querySelectorAll('.seg button')].find(b => /^List$/.test((b.textContent || '').trim()));
  await click(seg2);
  ok('the List has a "Next touch" column', names('.tbl thead th').includes('Next touch'), JSON.stringify(names('.tbl thead th')));
  const r = await logFrom(rowNamed('.tbl tbody tr', 'Cal Fine'), 'r3', 'Event');
  ok('from the List: exactly one new activity on Cal, type Event', r.added === 1 && r.newWrites === 1 && r.a && r.a.type === 'Event' && r.a.text === 'Event logged', JSON.stringify(r));
}
{
  await nav('Dashboard'); await settle(120);
  const r = await logFrom(rowNamed('.lc-reach .ro-row', 'Ben Week'), 'r2', 'Referral', 'sent us the Hendersons');
  ok('from the dashboard: exactly one new activity on Ben, type Referral', r.added === 1 && r.newWrites === 1 && r.a && r.a.type === 'Referral' && r.a.text === 'sent us the Hendersons', JSON.stringify(r));
  ok('  Ben leaves "due this week"', !names('.lc-reach .ro-grp.week .ro-name').includes('Ben Week'), JSON.stringify(names('.lc-reach .ro-name')));
}
{
  await click([...el.querySelectorAll('.lc-reach .ro-name')].find(b => b.textContent === 'Dee Tony'));
  await settle(160);
  const before = actsNow('r4').length;
  const btn = document.querySelector('.rel-lt .lt-b');
  ok('the record has Log touch and its own cadence field', !!btn && !!document.querySelector('.cad-person input'));
  if (btn) {
    await click(btn);
    await click([...document.querySelectorAll('.rel-lt .lt-k')].find(b => b.textContent === 'Text'));
    await settle(80);
    ok('from the record: exactly one new activity on Dee, type Text', actsNow('r4').length - before === 1 && actsNow('r4')[0].type === 'Text', JSON.stringify(actsNow('r4')[0]));
  }
  const close = document.querySelector('.m-x, [aria-label="Close"]');
  if (close) await click(close);
  await settle(80);
}

console.log('\nSettings → Relationship cadence');
{
  await nav('Settings'); await settle(160);
  const card = [...el.querySelectorAll('.card')].find(c => /Relationship cadence/.test(c.textContent));
  ok('the card is on the owner\'s Settings', !!card);
  ok('  and names every tier that fell back, with its number', !!card && /built-in default for:\s*A tier \(14 days\), B tier \(30 days\), C tier \(90 days\)/.test(card.textContent), card && card.textContent.slice(0, 400));
  const inp = card && card.querySelector('input[aria-label="A tier cadence in days"]');
  const w0 = globalThis.__SETTINGS_WRITES__.length;
  await typeIn(inp, '7'); await blur(inp); await settle(800);   /* saveSettings writes after 700ms */
  const sw = globalThis.__SETTINGS_WRITES__.slice(w0).pop();
  ok('A set to 7 saves settings.relCadence with all three tiers', !!sw && sw.relCadence && sw.relCadence.champion === 7 && sw.relCadence.b === 30 && sw.relCadence.new === 90, JSON.stringify(sw && sw.relCadence));
  const w1 = globalThis.__SETTINGS_WRITES__.length;
  await typeIn(inp, '0'); await blur(inp); await settle(800);
  ok('0 is refused: nothing saved', globalThis.__SETTINGS_WRITES__.length === w1);
  await nav('Relationships'); await settle(120);
  ok('the strip reads the new number: every 7d on A', /Actively sends business · every 7d/.test(el.textContent));
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
