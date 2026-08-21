/* Nothing in the lead view is dark text on the dark plate.
   ============================================================================

   PR 4 painted the surface and restyled `.mf b`. It never restyled `.mf-v` —
   the span the Stage and Priority tiles put their value in, because those two
   are <label>s wrapping an invisible <select> rather than buttons with a <b>.
   They kept ${INK}, near-black, on a navy plate. Legible before the paint,
   invisible after it, and only on those two of the nine tiles, which is why it
   read as "those two are broken" rather than as a row-wide problem.

   So this does not check those two. It walks EVERY element that renders text
   inside the lead view, computes the luminance of its resolved colour, and
   fails anything dark — because the next tile to be added will be the next one
   nobody checked.

   WHY LUMINANCE AND NOT A CONTRAST RATIO. The surface is a gradient over a
   plate over a scrim; jsdom resolves `color` but cannot composite what is
   behind it, so a true WCAG ratio is not available here. It is not needed: the
   ground is dark everywhere in this view, so "is this text light" answers the
   only question being asked, and answers it for elements a hand-audit skips.
   ========================================================================== */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { audit, nodeLuminance } from './darksurface.mjs';

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
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 2000) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
/* every fact tile at once: a stage, a priority, a source, an owner, a type, a
   close date, a deal, and a FUTURE meeting so the .hot variant renders too */
const LEAD = {
  id:'l1', name:'Sarah Chen', company:'Chen Realty', businessType:'Real Estate',
  stage:'proposal', priority:'high', source:'Referral', owner:'Garrett', owner_id:'u_owner',
  phone:'3165551234', email:'s@chenrealty.com', website:'chenrealty.com',
  createdAt: ago(60), followUp:'2026-09-01', nextAction:'Follow Up Call',
  expectedClose:'2026-09-30', dealValue:3500,
  deals:[{ id:'d1', label:'Build', setup:3500, website:'', integration:'', extras:[] }],
  payments:[{ id:'p1', amount:1200, date:String(ago(9)).slice(0,10), note:'Deposit' }],
  retainer:450, retainerActive:true, serviceInterest:['Website'], labels:['VIP'],
  keyDates:[{ id:'k1', label:'Birthday', date:'1984-11-04', annual:true, lead:14 }],
  custom:{}, isClient:false,
  meetings:[{ id:'m1', title:'Discovery', mtype:'Discovery',
    start: new Date(Date.now()+3*864e5).toISOString(),
    end: new Date(Date.now()+3*864e5+18e5).toISOString(),
    status:'', setBy:'Garrett', setById:'u_owner', createdAt: ago(2) }],
  activities:[
    { id:'a1', ts: ago(1), type:'Call', text:'Rang her.', who:'Garrett', tags:['Logan'] },
    { id:'a2', ts: ago(2), type:'Note', text:'Stage moved: New Lead → Proposal Sent', who:'Garrett' },
    { id:'a3', ts: ago(2), type:'Note', text:'Deal value set to $3,500', who:'Garrett' },
    { id:'a4', ts: ago(9), type:'Note', text:'She wants it live before September.', who:'Garrett' },
  ],
};
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','rels','settings'], modulesV:9, options:{}, pools:['General'],
  retainerStartCleared:'2026-01-01T00:00:00.000Z',
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'proposal', label:'Proposal Sent', color:'#C8A24A', prob:.7, open:true, won:false, lost:false },
          { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bct.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 130) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

const REP = { id:'u_rep', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General'], commission_pct:15, appointment_rate:40, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const ROSTER = [{ id:'u_owner', name:'Garrett', role:'owner' }, { id:'u_rep', name:'Tony Porter', role:'rep' }];
/* a second business lead so prev/next render, and so the Leads table is never
   a single row (a relationship is filtered out of it by bizLeads) */
const FILLER = { id:'l2', name:'Marcus Webb', company:'Webb Auto', stage:'new', priority:'low',
  owner:'Garrett', owner_id:'u_owner', createdAt: ago(30), activities:[], meetings:[], deals:[],
  payments:[], custom:{}, serviceInterest:[], labels:[], keyDates:[] };

let curRoot = null, curEl = null;
async function boot({ users, leads }) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users; globalThis.__TEAM__ = ROSTER;
  globalThis.__LEADS__ = leads; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bct.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(200);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent||'').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async name => { await nav('Leads');
  const row = [...curEl.querySelectorAll('tbody tr')].find(r => new RegExp(name).test(r.textContent||''));
  if (!row) throw new Error('no row for ' + name);
  await click(row); await settle(200); };
/* a relationship is reached from its own page, and that page defaults to Grouped */
const openRel = async name => { await nav('Relationships');
  const list = [...curEl.querySelectorAll('.seg button')].find(b => /^List$/.test((b.textContent||'').trim()));
  if (list) { await click(list); await settle(80); }
  const row = [...curEl.querySelectorAll('tbody tr')].find(r => new RegExp(name).test(r.textContent||''));
  if (!row) throw new Error('no relationship row for ' + name);
  await click(row); await settle(200); };
/* open everything: a collapsed section's text is not in the DOM to be checked */
const openAll = async () => {
  for (const h of [...curEl.querySelectorAll('.msec:not(.open) .msec-h')]) { await click(h); await settle(40); }
  const o = curEl.querySelector('.compose-open'); if (o) { await click(o); await settle(120); } };

const cs = n => dom.window.getComputedStyle(n);
/* The engine lives in darksurface.mjs — the Relationships page gets the same
   check, and a second copy of it would drift the moment one screen needed a
   tweak. This file is the lead view's fixtures and the two tiles worth naming. */
const A = { win: dom.window, host: '.modal.lead' };
const L1 = n => nodeLuminance(n, A);
const DARK = 0.35;
const nm = e => e.tagName.toLowerCase() +
  ((e.className||'').toString().split(' ').filter(Boolean).map(c => '.' + c).join(''));

function scan(label) {
  const modal = curEl.querySelector('.modal.lead');
  ok(`${label}: the lead view is the dark surface`, !!modal);
  if (!modal) return;
  const { count, dark, light } = audit(modal, A);
  ok(`${label}: ${count} elements render text, none of it dark`,
     dark.length === 0, dark.join('\n        '));
  ok(`${label}: no element paints a light surface in the dark view`,
     light.length === 0, light.join('\n        '));
}

/* Every mode, not just the one the bug was reported on. A rep sees a different
   composition, and a relationship replaces the deal sections outright, so each
   mounts elements the others never render. */
await boot({ users:[OWNER], leads:[LEAD, FILLER] });
await openLead('Sarah Chen'); await openAll();
scan('owner');

/* the two tiles that were actually reported, named, so a regression is obvious */
{
  const sel = [...curEl.querySelectorAll('.mf-sel')];
  ok('both picker tiles are present', sel.length === 2, sel.length + ' .mf-sel tiles');
  for (const t of sel) {
    const v = t.querySelector('.mf-v');
    const L = v ? L1(v) : null;
    const which = ((t.querySelector('i')||{}).textContent || '?');
    ok(`  the ${which} tile's value is light`, L !== null && L >= DARK, v ? `color=${cs(v).color} L=${L}` : 'no .mf-v');
  }
}
/* the rest of the row uses <b>, which the paint did cover — asserted so the
   split between the two mechanisms stays visible to whoever reads this next */
{
  const bs = [...curEl.querySelectorAll('.m-facts .mf b')];
  ok(`the other ${bs.length} tiles put their value in <b>`, bs.length >= 5, String(bs.length));
  ok('  and every one of those is light too', bs.every(b => (L1(b) ?? 0) >= DARK),
     bs.map(b => cs(b).color).join(' '));
}

await boot({ users:[REP], leads:[{ ...LEAD, owner:'Tony Porter', owner_id:'u_rep',
  commission:{ pct:15, amount:525 } }, { ...FILLER, owner:'Tony Porter', owner_id:'u_rep' }] });
await openLead('Sarah Chen'); await openAll();
scan('rep');

/* the relationship carries a populated referral ledger, one linked entry and
   one dangling, because an empty section paints nothing and would have let the
   ledger through the way the empty meeting list would have hidden the card */
await boot({ users:[OWNER], leads:[{ ...LEAD, isRelationship:true, isClient:false,
  referralsOut:[
    { id:'r1', leadId:'l2', name:'Marcus Webb', note:'warm, wants a site', sentAt:'2026-07-02' },
    { id:'r2', leadId:'gone-9', name:'Dana Ruiz', note:'', sentAt:'2026-06-11' },
  ] }, { ...FILLER, introducedBy:'l1' }] });
await openRel('Sarah Chen'); await openAll();
/* and the add form open, which is a surface of its own */
{ const b = curEl.querySelector('.rl-add'); if (b) { await click(b); await settle(90); } }
scan('relationship');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
