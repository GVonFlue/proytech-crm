/* Nothing on the Relationships page is unreadable on the dark surface.
   ============================================================================

   The page joined the lead view as an intelligence surface: dark when the app
   is telling you something, light when you are telling it. That makes it the
   second screen to need the audit, which is why the engine was pulled out into
   darksurface.mjs first rather than after.

   Both passes run, and the second is the one that matters here: this page is
   built almost entirely from components written for a white background — .tbl,
   .card, .searchbox, .seg, .due — so the failure mode is not dark text on the
   plate, it is a light component still painting its own white ground inside a
   dark page. That is exactly what hid the meeting card in the lead view.

   Every mode is swept, because Grouped, List and a tier-filtered view mount
   different components, and a component nobody rendered is a component nobody
   checked.
*/
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { audit } from './darksurface.mjs';

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
fs.writeFileSync('tests/.brc.mjs', out.outputFiles[0].text);

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
await act(async () => { root.render(React.createElement((await import('./.brc.mjs?v=' + Date.now())).default)); });
await settle(240);
const nav = [...el.querySelectorAll('.nav-i')].find(e => /^Relationships$/.test((e.textContent||'').trim()));
await click(nav); await settle(200);

const A = { win: dom.window, host: '.relsurface' };
const surface = () => el.querySelector('.relsurface');

function sweep(label) {
  const root = surface();
  ok(`${label}: the page is the dark surface`, !!root);
  if (!root) return;
  const { count, dark, light } = audit(root, A);
  ok(`${label}: ${count} elements render text, none of it dark`,
     dark.length === 0, dark.join('\n        '));
  ok(`${label}: no element paints a light surface in the dark page`,
     light.length === 0, light.join('\n        '));
}

const seg = () => [...el.querySelectorAll('.seg button')];
const pick = async name => { const b = seg().find(x => new RegExp('^' + name + '$').test((x.textContent||'').trim()));
  if (b) { await click(b); await settle(160); } };

sweep('grouped');
await pick('List');   sweep('list');
await pick('Grouped');
/* a tier filter is its own state: the column lights up and the table narrows */
const champFoot = el.querySelector('.rel-tier .rt-foot');
if (champFoot) { await click(champFoot); await settle(170); }
sweep('tier-filtered');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
