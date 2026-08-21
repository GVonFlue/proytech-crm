/* PR 6 — a relationship reads on its own terms, not as a lead with the deal
   parts hidden.
   ============================================================================

   isRelationship is a BOOLEAN ON THE SAME RECORD, flipped by a checkbox inside
   this very view. That is why this is one component with two modes and not two
   screens: flipping the toggle must not navigate anywhere, and every helper,
   every write path and the whole activity feed are shared.

   WHAT THE MODE HAS TO GET RIGHT

     · what a relationship IS leads the record — tier, who introduced them, the
       chain, who came from them — open, and first, instead of collapsed at the
       bottom under "Type & Introduction"
     · key dates are PREP. A birthday is the reason you call a referral
       partner; it was three sections down inside a contact form
     · the deal questions stop being asked. "Won the deal? Convert to Client"
       on a referral partner is the app asking the wrong question
     · and nothing is lost by the mode. A record flipped to a relationship
       while carrying a live deal keeps the panel that edits it — hiding data
       somebody entered is worse than an odd-looking screen. That case is the
       one most likely to be got wrong, so it is asserted directly.

   A lead's layout must be untouched by all of it, which is the last block.
   ========================================================================== */
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
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 240) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();

/* Marcus is a referral partner: a tier, two people who came from him, key
   dates, real history — and no deal, because that is the point of him. */
const MARCUS = {
  id:'r1', name:'Marcus Webb', company:'Webb Lending', stage:'new', owner:'Garrett', owner_id:'u_owner',
  createdAt: ago(400), isRelationship:true, relTier:'champion',
  relNote:'Met at the Wichita Chamber mixer', introducedBy:'',
  phone:'3165550000', email:'marcus@webblending.com',
  keyDates:[{ id:'k1', label:'Birthday', date:'1979-03-12', annual:true, lead:14 },
            { id:'k2', label:'Work anniversary', date:'2014-06-01', annual:true, lead:7 }],
  serviceInterest:[], labels:[], custom:{}, meetings:[], deals:[], dealValue:0,
  activities:[
    { id:'a1', ts: ago(21), type:'Meeting', text:'Coffee at Reverie — seeing more first-time buyers.', who:'Garrett' },
    { id:'a2', ts: ago(90), type:'Note', text:'Introduced us to Sarah Chen.', who:'Garrett' },
  ],
};
/* two people he introduced, so the "came from this contact" line has substance */
const SARAH = { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'signed', owner:'Garrett',
  owner_id:'u_owner', createdAt: ago(120), introducedBy:'r1', isClient:true,
  dealValue:3500, deals:[], activities:[], meetings:[], custom:{} };
const RAY = { id:'l2', name:'Ray Alvarez', company:'Alvarez Homes', stage:'new', owner:'Garrett',
  owner_id:'u_owner', createdAt: ago(60), introducedBy:'r1',
  dealValue:0, deals:[], activities:[], meetings:[], custom:{} };

const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','rels','settings'], modulesV:9, options:{}, pools:['General'],
  retainerStartCleared:'2026-01-01T00:00:00.000Z',
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'signed', label:'Signed', color:'#1F9D55', prob:1, open:false, won:true, lost:false },
          { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.brl.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot(leads) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
  globalThis.__LEADS__ = JSON.parse(JSON.stringify(leads)); globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.brl.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(200);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent||'').trim() === l);
  if (b) await click(b); await settle(); };
const openRel = async name => { await nav('Relationships');
  const list = [...curEl.querySelectorAll('.seg button')].find(b => /^List$/.test((b.textContent||'').trim()));
  if (list) { await click(list); await settle(80); }
  const r = [...curEl.querySelectorAll('tbody tr')].find(x => new RegExp(name).test(x.textContent||''));
  if (!r) throw new Error('no relationship row for ' + name);
  await click(r); await settle(190); };
const openLead = async name => { await nav('Leads');
  const all = [...curEl.querySelectorAll('.scope-seg button')].find(b => /^All/.test(b.textContent||''));
  if (all) await click(all);
  const r = [...curEl.querySelectorAll('tbody tr')].find(x => new RegExp(name).test(x.textContent||''));
  if (!r) throw new Error('no lead row for ' + name);
  await click(r); await settle(190); };
const T = () => (curEl.querySelector('.modal') || curEl).textContent || '';
const btn = re => [...curEl.querySelectorAll('button')].some(b => re.test((b.textContent||'').trim()));
const secTitles = () => [...curEl.querySelectorAll('.msec-t')].map(e => (e.textContent||'').trim());

/* ==================================================================== */
console.log('\nit leads with what it IS');
await boot([MARCUS, SARAH, RAY]);
await openRel('Marcus Webb');
{
  const titles = secTitles();
  ok('the section is titled for a relationship', titles.some(t => /The relationship/.test(t)), JSON.stringify(titles));
  ok('  not "Type & Introduction"', !titles.some(t => /Type & Introduction/.test(t)), JSON.stringify(titles));
  ok('  and it is FIRST in the record rail', /The relationship/.test(titles[0] || ''), JSON.stringify(titles));
  ok('  open, without a click', !!curEl.querySelector('.msec.open .tier-btns') || !!curEl.querySelector('.tier-btns'),
     'the tier buttons were not rendered');
}
{
  ok('the tier is on screen', curEl.querySelectorAll('.tier-btn').length > 0);
  ok('  with the one they are marked as, selected',
     [...curEl.querySelectorAll('.tier-btn')].some(b => /on/.test(b.className)),
     [...curEl.querySelectorAll('.tier-btn')].map(b => b.className).join(' | '));
  /* read the input's VALUE — textContent never includes what is typed in a
     field, so /.../.test(T()) is always false for anything editable */
  ok('how you know them',
     [...curEl.querySelectorAll('input')].some(i => /Wichita Chamber mixer/.test(i.value || '')),
     [...curEl.querySelectorAll('input')].map(i => i.value).filter(Boolean).join(' | '));
  ok('who came from this contact', !!curEl.querySelector('.rel-gave') && /\b2\b/.test(
     (curEl.querySelector('.rel-gave')||{}).textContent||''),
     (curEl.querySelector('.rel-gave')||{}).textContent);
  ok('  and it is kept out of the money, said out loud', !!curEl.querySelector('.rel-hint'));
}

console.log('\nkey dates are prep, not a form field');
{
  ok('they are in the prep rail', !!curEl.querySelector('.m-prep .kd-list'),
     'no key dates in the prep rail');
  const kd = (curEl.querySelector('.m-prep .kd-list')||{}).textContent || '';
  ok('  both of them', /Birthday/.test(kd) && /Work anniversary/.test(kd), kd);
  ok('  with how long until each', /in \d+d|today/.test(kd), kd);
  ok('  read-only there — they are still edited in Contact',
     curEl.querySelectorAll('.m-prep .kd-list .ev-x').length === 0
     && !!curEl.querySelector('.m-left .kd-add'),
     'the prep copy should not offer remove, and Contact should still offer add');
}

console.log('\nthe deal questions stop being asked');
{
  ok('no "Won the deal? Convert to Client"', !/Won the deal/.test(T()) && !btn(/Convert to Client/), T().slice(0,140));
  ok('no Deal section on a relationship carrying no deal',
     !secTitles().some(t => /^Deal$/.test(t)), JSON.stringify(secTitles()));
  ok('and no close-tracking prompt', !/Not counted in your numbers/.test(T()));
}
{
  /* the case most likely to be got wrong */
  await boot([{ ...MARCUS, dealValue:2000,
    deals:[{ id:'d1', label:'Old build', setup:2000, website:'', integration:'', extras:[] }] }, SARAH, RAY]);
  await openRel('Marcus Webb');
  ok('a relationship that DOES carry a deal keeps the panel that edits it',
     secTitles().some(t => /^Deal$/.test(t)), JSON.stringify(secTitles()));
}

console.log('\neverything shared is still shared');
{
  await boot([MARCUS, SARAH, RAY]);
  await openRel('Marcus Webb');
  ok('the history is the same feed', /Coffee at Reverie/.test(T()) && /Introduced us to Sarah Chen/.test(T()));
  ok('the composer is there', !!curEl.querySelector('.compose-open') || !!curEl.querySelector('.act-input'));
  ok('the follow-up module is in the prep rail', !!curEl.querySelector('.m-prep .fu-block'));
  ok('  with its presets', curEl.querySelectorAll('.m-prep .fu-chip').length >= 4);
  ok('and the toggle back to a lead is still reachable', !!curEl.querySelector('.spon-tog.rel'));
}

console.log('\na LEAD is untouched by any of it');
{
  await boot([MARCUS, SARAH, RAY]);
  await openLead('Sarah Chen');
  const titles = secTitles();
  ok('a lead still says "Type & Introduction"', titles.some(t => /Type & Introduction/.test(t)), JSON.stringify(titles));
  ok('  and it is NOT first', !/The relationship/.test(titles[0] || ''), JSON.stringify(titles));
  ok('a lead still has its Deal section', titles.some(t => /^Deal$/.test(t)), JSON.stringify(titles));
  ok('a lead has no key dates in the prep rail', !curEl.querySelector('.m-prep .kd-list'));
  await boot([MARCUS, { ...SARAH, isClient:false }, RAY]);
  await openLead('Sarah Chen');
  ok('and a non-client lead still gets "Won the deal?"', /Won the deal/.test(T()));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
