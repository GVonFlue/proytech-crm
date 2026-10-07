/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lib = bundleName('fuclib');
const B_app = bundleName('fucapp');
/* FOLLOW-UP USES THE SAME NEXT-TOUCH RULE AS REACH OUT.

   Follow-Up read followUp and nothing else, so a relationship due by its
   cadence alone (no date ever set) was on the dashboard's Reach out and the
   Relationships strip but never on Follow-Up. It now reads lib/relationships
   dueOn(): a relationship is due by nextTouch (last touch + cadence, or a
   sooner date not yet met by a touch); a business lead by its follow-up date,
   as before.

   Also here, because building this found it: a follow-up date a touch has
   already met no longer counts. Under "the earlier of the date and the
   cadence" a past date never went away, so logging a touch on "Follow-up was
   Oct 6" could not clear it, on Follow-Up or on Reach out.

   What is asserted:
     the rule        dueOn for a lead and a relationship; a met date is done
     the page        a cadence-only relationship is listed; one inside its
                     cadence is not; a met date is not; a business lead with a
                     past date still is, and one with no date still is not
     one definition  the relationships on Follow-Up are exactly Reach out's
                     overdue plus anything due today, from the same records
     clearing        Log touch on a relationship card writes ONE activity and
                     the card leaves; a business lead keeps its date chips
     the card        "last touch" is lib/lead lastTouch, not the newest
                     non-note row (a no-answer dial is not a touch)

   Seen red with FollowUp reading l.followUp again (the cadence-only
   relationship vanished) and with the met-date guard removed (Lena stayed). */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };
const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };
const isoD = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const day = n => { const x = new Date(); x.setDate(x.getDate() + n); return isoD(x); };
const at = n => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
const TODAY = day(0);

{ const lib = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/relationships.js'] }); fs.writeFileSync('tests/' + B_lib, lib.outputFiles[0].text); }
const R = await import('./' + B_lib + '?v=' + Date.now());
const call = (n, o = {}) => ({ id: 'c' + n + Math.random().toString(36).slice(2, 6), ts: at(-n), type: 'Call', text: 'spoke', who: 'Garrett', ...o });

console.log('\nthe rule');
{
  const cfg = R.readCadence(null);
  const rel = o => ({ isRelationship: true, activities: [], meetings: [], keyDates: [], ...o });
  ok('a business lead is due on its follow-up date', R.dueOn({ followUp: day(-2) }, cfg, TODAY) === day(-2));
  ok('  and has nothing due without one (no cadence for leads)', R.dueOn({ activities: [call(400)] }, cfg, TODAY) === null);
  ok('a relationship with no date is due by cadence (A, touched 20 days ago: 6 days late)', R.dueOn(rel({ relTier: 'champion', activities: [call(20)] }), cfg, TODAY) === day(-6));
  const met = rel({ relTier: 'champion', followUp: day(-3), activities: [call(1)] });
  ok('a date a touch has met is done: due by cadence again', R.dueOn(met, cfg, TODAY) === day(13) && R.nextTouch(met, cfg, TODAY).source === 'cadence', JSON.stringify(R.nextTouch(met, cfg, TODAY)));
  const touchedSameDay = rel({ relTier: 'new', followUp: day(-1), activities: [call(1)] });
  ok('  a touch ON the day counts as meeting it', R.nextTouch(touchedSameDay, cfg, TODAY).source === 'cadence');
  const unmet = rel({ relTier: 'new', followUp: day(-1), activities: [call(5)] });
  ok('  one not met yet still wins over a later cadence', R.dueOn(unmet, cfg, TODAY) === day(-1) && R.nextTouch(unmet, cfg, TODAY).source === 'followUp');
  ok('  a future date still wins when sooner', R.dueOn(rel({ relTier: 'new', followUp: day(4), activities: [call(5)] }), cfg, TODAY) === day(4));
}

/* ---------------------------------------------------------- the app ---- */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const base = o => ({ company: 'Co', owner: 'Garrett', owner_id: 'u_owner', createdAt: at(-400), stage: 'new', priority: 'low', meetings: [], deals: [], payments: [],
  custom: {}, serviceInterest: [], labels: [], keyDates: [], activities: [], ...o });
const rel = o => base({ isRelationship: true, ...o });
const LEADS = [
  rel({ id: 'r1', name: 'Ana Cadence', relTier: 'champion', activities: [call(20)] }),                      /* due by cadence alone */
  rel({ id: 'r2', name: 'Lena Met', relTier: 'champion', followUp: day(-3), activities: [call(1)] }),        /* date met by a touch */
  rel({ id: 'r3', name: 'Cal Fine', relTier: 'new', activities: [call(5)] }),                               /* inside cadence */
  rel({ id: 'r4', name: 'Dee Dated', relTier: 'new', followUp: day(0), activities: [call(5)] }),            /* a date due today, not met */
  rel({ id: 'r5', name: 'Sam Never', relTier: 'b' }),                                                       /* never contacted */
  base({ id: 'L1', name: 'Lou Lead', followUp: day(-2), activities: [call(1, { disp: 'NA', text: 'No answer.' }), call(30)] }), /* business lead, past date */
  base({ id: 'L2', name: 'Liv Lead', activities: [call(200)] }),                                            /* business lead, no date: never on Follow-Up */
];
globalThis.__USERS__ = [{ id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] }];
globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }];
globalThis.__LEADS__ = LEADS;
globalThis.__SETTINGS__ = { modules: ['dash', 'followup', 'leads', 'rels', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New Lead', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }, { key: 'lost', label: 'Lost', color: '#B0606A', prob: 0, open: false, won: false, lost: true }] };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

{ const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text); }
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(60); };
const nav = async label => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === label));
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(260);

const reach = [...el.querySelectorAll('.lc-reach .ro-grp.overdue .ro-name')].map(e => e.textContent.trim());
const reachToday = [...el.querySelectorAll('.lc-reach .ro-grp.week .ro-row')].filter(r => /today/i.test(r.textContent)).map(r => r.querySelector('.ro-name').textContent.trim());

await nav('Follow-Up'); await settle(160);
const cardNamed = n => [...el.querySelectorAll('.fu-card')].find(c => (c.querySelector('.fu-name') || {}).textContent === n);
const listed = () => [...el.querySelectorAll('.fu-card .fu-name')].map(e => e.textContent.trim());
const relNames = new Set(LEADS.filter(l => l.isRelationship).map(l => l.name));

console.log('\nthe page');
ok('a relationship due by cadence alone is on Follow-Up', listed().includes('Ana Cadence'), JSON.stringify(listed()));
ok('  never contacted is too, and says so', listed().includes('Sam Never') && /Never contacted/.test(cardNamed('Sam Never').textContent));
ok('  a date due today that no touch has met is too', listed().includes('Dee Dated'));
ok('a date a touch already met is not', !listed().includes('Lena Met'), JSON.stringify(listed()));
ok('someone inside their cadence is not', !listed().includes('Cal Fine'));
ok('a business lead with a past date still is', listed().includes('Lou Lead'));
ok('  a business lead with no date still is not (leads have no cadence)', !listed().includes('Liv Lead'));

console.log('\none definition');
const fuRels = listed().filter(n => relNames.has(n)).sort();
const roRels = [...new Set([...reach, ...reachToday])].sort();
ok('the relationships on Follow-Up are exactly Reach out\'s overdue plus due today', JSON.stringify(fuRels) === JSON.stringify(roRels), JSON.stringify({ fuRels, roRels }));

console.log('\nthe card');
ok('a relationship card says its cadence', /Every 14 days · A tier/.test(cardNamed('Ana Cadence').textContent), cardNamed('Ana Cadence').textContent);
ok('"last touch" is lastTouch: Lou\'s no-answer yesterday is not it, the call 30 days ago is',
   new RegExp('last touch ' + new Date(at(-30)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).test(cardNamed('Lou Lead').textContent), cardNamed('Lou Lead').textContent);
ok('a business lead keeps its date chips', !!cardNamed('Lou Lead').querySelector('.fu-chip') && !cardNamed('Lou Lead').querySelector('.lt-b'));
ok('a relationship gets Log touch instead (a later date cannot postpone the cadence)', !!cardNamed('Ana Cadence').querySelector('.lt-b') && !cardNamed('Ana Cadence').querySelector('.fu-chip'));

console.log('\nclearing a relationship');
{
  const before = globalThis.__WRITES__.length;
  await click(cardNamed('Ana Cadence').querySelector('.lt-b'));
  await click([...cardNamed('Ana Cadence').querySelectorAll('.lt-k')].find(b => b.textContent === 'Call'));
  await settle(120);
  const w = globalThis.__WRITES__.slice(before);
  ok('Log touch writes once, one new Call activity on Ana', w.length === 1 && w[0].id === 'r1' && w[0].activities.length === 2 && w[0].activities[0].type === 'Call', JSON.stringify(w.map(x => [x.id, x.activities.length])));
  ok('  and does not set a follow-up date', !w[0].followUp);
  ok('  Ana leaves Follow-Up', !listed().includes('Ana Cadence'), JSON.stringify(listed()));
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
