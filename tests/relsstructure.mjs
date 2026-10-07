/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_rs = bundleName('rs');
/* The Relationships page surfaces what decays, not what was labelled once.
   ============================================================================

   The tab was organised by TIER — a label set once that never changes — while
   the thing that actually kills a relationship is silence. Grouped could not be
   acted on and List buried the overdue dates in the fifth column, so the
   actionable content was the hardest thing on the page to find.

   What is asserted here:

     the strip      lib/relationships reachOut (Oct 2026): OVERDUE (past last
                    touch + cadence, a sooner follow-up date, or never
                    contacted), DUE THIS WEEK, and BIRTHDAYS 3 days ahead, A
                    tier first, above the grouping. It replaced overdue / due
                    today / gone quiet; a relationship with no date set still
                    surfaces, because the cadence is its due date.
     coldest first  each tier column is ordered by silence, never-contacted at
                    the top, because that is the only ordering that makes the
                    column actionable.
     the tautology  no "Introduced by" column inside a group that IS an
                    introducer, and no "How you know them" column anywhere.
     the no-op      the column footer said "Tap to list all 7" while all 7 were
                    already listed above it.

   Cadence is A 14 / B 30 / C 90 days (no relCadence saved, so the defaults),
   and the fixture is built around it: one A inside, one outside, one never
   contacted, one whose follow-up date is further out than its cadence.
*/
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','KeyboardEvent',
  'getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage',
  'history','location','navigator','MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
}
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok:true, json: async () => ({ connected:false, email:'' }) }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };

const ago = d => new Date(Date.now() - d * 864e5).toISOString();
/* LOCAL date parts, not toISOString().
   The app's isoOf() reads getFullYear/getMonth/getDate — local — and daysUntil
   compares against that. Building fixture dates in UTC made this file fail for
   the hours each day when the UTC date is already tomorrow: "due today" became
   due-in-one-day and the bucket emptied. Shipped in PR D and caught the same
   evening by the sweep rather than by luck. */
const iso = d => { const x = new Date(Date.now() + d * 864e5);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const call = d => ({ id:'a'+d, ts: ago(d), type:'Call', text:'spoke', who:'Garrett' });
const sysnote = d => ({ id:'s'+d, ts: ago(d), type:'Note', text:'Follow-up cleared.', who:'Garrett' });

const rel = (o) => ({ company:'Co', owner:'Garrett', owner_id:'u_owner', isRelationship:true,
  createdAt: ago(400), meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[],
  labels:[], keyDates:[], activities:[], ...o });

/* A every 14 days, B every 30, C every 90. */
const RELS = [
  /* overdue: an A silent 45 days with no follow-up date */
  rel({ id:'r1', name:'Quiet Champion', relTier:'champion', activities:[call(45)] }),
  /* STILL overdue: silent 45 days with a date 6 days out. The follow-up date
     wins only when it is SOONER than the cadence; it never buys more time. */
  rel({ id:'r2', name:'Scheduled Champion', relTier:'champion', followUp: iso(6), activities:[call(45)] }),
  /* due this week: touched 10 days ago, due in 4 */
  rel({ id:'r3', name:'Fresh Champion', relTier:'champion', activities:[call(10)] }),
  /* overdue: never contacted at all */
  rel({ id:'r4', name:'Never Contacted', relTier:'champion', activities:[] }),
  /* THE MACHINE-NOTE TRAP: last real touch 200 days ago, but a "Follow-up
     cleared." was written yesterday. Counting any activity as contact would
     make this one look touched yesterday and hide it. */
  rel({ id:'r5', name:'Bookkeeping Only', relTier:'b', activities:[sysnote(1), call(200)] }),
  /* overdue by date: set 9 days ago, last touched 12 days ago, so no touch
     has met it (a touch on or after the date would, lib/relationships) */
  rel({ id:'r6', name:'Overdue Date', relTier:'b', followUp: iso(-9), activities:[call(12)] }),
  /* due today */
  rel({ id:'r7', name:'Due Today', relTier:'new', followUp: iso(0), activities:[call(3)] }),
  /* introduced by r1, so a group with a real introducer exists */
  rel({ id:'r8', name:'Introduced Person', relTier:'new', introducedBy:'r1', activities:[call(5)] }),
];
const BIZ = { id:'L9', name:'Biz Lead', company:'Biz', stage:'new', priority:'low', owner:'Garrett',
  owner_id:'u_owner', createdAt: ago(10), activities:[], meetings:[], deals:[], payments:[],
  custom:{}, serviceInterest:[], labels:[], keyDates:[] };
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','rels','settings'], modulesV:9, options:{}, pools:['General'],
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/'+B_rs, out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 150) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
globalThis.__LEADS__ = [...RELS, BIZ]; globalThis.__SETTINGS__ = SETTINGS;
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./'+B_rs+'?v=' + Date.now())).default)); });
await settle(240);
const nav = [...el.querySelectorAll('.nav-i')].find(e => /^Relationships$/.test((e.textContent||'').trim()));
await click(nav); await settle(200);

const T = () => el.textContent || '';
const bucket = k => [...el.querySelectorAll('.needs-att .ro-grp.' + k + ' .ro-row')].map(r => (r.querySelector('.ro-name')||{}).textContent || '');

console.log('\nthe needs-attention strip (lib/relationships reachOut)');
ok('the strip is on the page', !!el.querySelector('.needs-att'), T().slice(0, 120));
const over = bucket('overdue'), week = bucket('week');
ok('overdue: past cadence, a past date, never contacted, A tier first',
   JSON.stringify(over) === JSON.stringify(['Never Contacted', 'Quiet Champion', 'Scheduled Champion', 'Bookkeeping Only', 'Overdue Date']),
   JSON.stringify(over));
ok('due this week: the A due in 4 days, then the C whose date is today',
   JSON.stringify(week) === JSON.stringify(['Fresh Champion', 'Due Today']), JSON.stringify(week));
ok('a follow-up date further out than the cadence does not hide someone', over.includes('Scheduled Champion'), JSON.stringify(over));
ok('a machine note does NOT count as contact', over.includes('Bookkeeping Only'),
   'last real touch 200d ago, "Follow-up cleared." yesterday: ' + JSON.stringify(over));
ok('never-contacted sorts first in its tier', over.indexOf('Never Contacted') < over.indexOf('Quiet Champion'), JSON.stringify(over));
ok('someone well inside their cadence is not listed', !over.includes('Introduced Person') && !week.includes('Introduced Person'));
ok('every row can log a touch', el.querySelectorAll('.needs-att .ro-row .lt-b').length === over.length + week.length);

console.log('\nthe tier columns');
const champCol = [...el.querySelectorAll('.rel-tier')][0];
const champNames = [...champCol.querySelectorAll('.rt-person .rt-pn')].map(e => e.textContent);
ok('coldest first, not alphabetical',
   champNames[0] === 'Never Contacted' && champNames.indexOf('Quiet Champion') < champNames.indexOf('Fresh Champion'),
   JSON.stringify(champNames));
ok('every row says how long it has been', champCol.querySelectorAll('.rt-person .since').length === champNames.length,
   String(champCol.querySelectorAll('.rt-person .since').length));
ok('never-contacted says so rather than showing a number',
   !!champCol.querySelector('.since.never'), (champCol.querySelector('.since')||{}).textContent);
ok('the footer no longer claims to list what is already listed',
   !/Tap to list all/.test(T()) && /Filter the list to these/.test(T()),
   (champCol.querySelector('.rt-foot')||{}).textContent);

console.log('\nthe tables');
const seg = [...el.querySelectorAll('.seg button')];
await click(seg.find(b => /^List$/.test((b.textContent||'').trim()))); await settle(140);
const heads = () => [...el.querySelectorAll('.tbl thead th')].map(t => t.textContent);
ok('"How you know them" is gone', !heads().includes('How you know them'), JSON.stringify(heads()));
ok('List shows last contact and referrals',
   heads().includes('Last contact') && heads().includes('Referrals'), JSON.stringify(heads()));
ok('List keeps "Introduced by" — it is not a tautology there', heads().includes('Introduced by'), JSON.stringify(heads()));

await click(seg.find(b => /^Grouped$/.test((b.textContent||'').trim()))); await settle(160);
ok('Grouped drops "Introduced by" inside a group that IS the introducer',
   !heads().includes('Introduced by'), JSON.stringify(heads()));
ok('  and still shows last contact', heads().includes('Last contact'), JSON.stringify(heads()));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
