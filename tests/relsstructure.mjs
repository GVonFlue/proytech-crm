/* The Relationships page surfaces what decays, not what was labelled once.
   ============================================================================

   The tab was organised by TIER — a label set once that never changes — while
   the thing that actually kills a relationship is silence. Grouped could not be
   acted on and List buried the overdue dates in the fifth column, so the
   actionable content was the hardest thing on the page to find.

   What is asserted here:

     the strip      overdue, due today, and GONE QUIET, across every tier and
                    above the grouping. The third bucket is the point: overdue
                    reads followUp, so a relationship with no date set can never
                    appear in it however long it has been silent — which is the
                    exact failure the page existed to fix.
     coldest first  each tier column is ordered by silence, never-contacted at
                    the top, because that is the only ordering that makes the
                    column actionable.
     the tautology  no "Introduced by" column inside a group that IS an
                    introducer, and no "How you know them" column anywhere.
     the no-op      the column footer said "Tap to list all 7" while all 7 were
                    already listed above it.

   Thresholds are COLD_DAYS — 30/60/90 by tier — and the fixture is built around
   them: one champion just inside, one just outside, one never contacted.
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
const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const call = d => ({ id:'a'+d, ts: ago(d), type:'Call', text:'spoke', who:'Garrett' });
const sysnote = d => ({ id:'s'+d, ts: ago(d), type:'Note', text:'Follow-up cleared.', who:'Garrett' });

const rel = (o) => ({ company:'Co', owner:'Garrett', owner_id:'u_owner', isRelationship:true,
  createdAt: ago(400), meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[],
  labels:[], keyDates:[], activities:[], ...o });

/* Champions allow 30 days, B allows 60, New allows 90. */
const RELS = [
  /* quiet: a champion silent 45 days with no follow-up date */
  rel({ id:'r1', name:'Quiet Champion', relTier:'champion', activities:[call(45)] }),
  /* NOT quiet: a champion silent 45 days but with a date ahead of them */
  rel({ id:'r2', name:'Scheduled Champion', relTier:'champion', followUp: iso(6), activities:[call(45)] }),
  /* NOT quiet: silent 20 days, inside the champion limit */
  rel({ id:'r3', name:'Fresh Champion', relTier:'champion', activities:[call(20)] }),
  /* quiet: never contacted at all */
  rel({ id:'r4', name:'Never Contacted', relTier:'champion', activities:[] }),
  /* THE MACHINE-NOTE TRAP: last real touch 200 days ago, but a "Follow-up
     cleared." was written yesterday. Counting any activity as contact would
     make this one look touched yesterday and hide it. */
  rel({ id:'r5', name:'Bookkeeping Only', relTier:'b', activities:[sysnote(1), call(200)] }),
  /* overdue by date */
  rel({ id:'r6', name:'Overdue Date', relTier:'b', followUp: iso(-9), activities:[call(3)] }),
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
fs.writeFileSync('tests/.brs.mjs', out.outputFiles[0].text);

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
await act(async () => { root.render(React.createElement((await import('./.brs.mjs?v=' + Date.now())).default)); });
await settle(240);
const nav = [...el.querySelectorAll('.nav-i')].find(e => /^Relationships$/.test((e.textContent||'').trim()));
await click(nav); await settle(200);

const T = () => el.textContent || '';
const bucket = k => [...el.querySelectorAll('.na-col.' + k + ' .na-row')].map(r => (r.querySelector('.na-name')||{}).textContent || '');

console.log('\nthe needs-attention strip');
ok('the strip is on the page', !!el.querySelector('.needs-att'), T().slice(0, 120));
ok('overdue: the one with a past date', JSON.stringify(bucket('over')) === JSON.stringify(['Overdue Date']),
   JSON.stringify(bucket('over')));
ok('due today: the one due today', JSON.stringify(bucket('today')) === JSON.stringify(['Due Today']),
   JSON.stringify(bucket('today')));

const quiet = bucket('quiet');
console.log('\ngone quiet — the bucket overdue-only would have missed');
ok('a champion silent past its 30 days is quiet', quiet.includes('Quiet Champion'), JSON.stringify(quiet));
ok('never contacted is quiet', quiet.includes('Never Contacted'), JSON.stringify(quiet));
ok('a machine note does NOT count as contact',
   quiet.includes('Bookkeeping Only'),
   'last real touch 200d ago, "Follow-up cleared." yesterday: ' + JSON.stringify(quiet));
ok('someone with a date ahead of them is not quiet', !quiet.includes('Scheduled Champion'), JSON.stringify(quiet));
ok('someone inside their tier limit is not quiet', !quiet.includes('Fresh Champion'), JSON.stringify(quiet));
ok('never-contacted sorts above the merely cold',
   quiet.indexOf('Never Contacted') < quiet.indexOf('Quiet Champion'), JSON.stringify(quiet));

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
