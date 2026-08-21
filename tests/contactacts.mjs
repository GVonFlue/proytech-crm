/* The contact actions: Call, Text, Email, Site.
   ============================================================================

   Two things are asserted that the inventory cannot assert, because the
   inventory is a ledger of what must not disappear rather than a spec of how
   it behaves:

     1. A missing field DISABLES the action, it does not remove it. Hiding made
        "no phone on this record" and "this view cannot call" look identical —
        nothing on screen either way. The row is the same shape on every lead.

     2. Email opens GMAIL COMPOSE at the configured account index, not mailto:.
        mailto: does nothing at all on a machine with no mail client registered,
        which is why it read as a missing feature rather than a broken one.

   The account index is read from localStorage, so it is exercised here at a
   value other than the default — a hardcoded 0 would pass a test that only
   ever checked u/0.
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

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const FULL = { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new', priority:'high',
  owner:'Garrett', owner_id:'u_owner', createdAt: ago(20),
  phone:'3165551234', email:'s@chenrealty.com', website:'chenrealty.com',
  activities:[], meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[], labels:[], keyDates:[] };
/* the same record with nothing to reach them on */
const BARE = { ...FULL, id:'l2', name:'Marcus Webb', company:'Webb Auto', phone:'', email:'', website:'' };
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','settings'], modulesV:9, options:{}, pools:['General'],
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bca.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 140) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

/* not 0: a hardcoded index would pass a test that only ever checked u/0 */
localStorage.setItem('gmailAccount', '3');

let curRoot = null, curEl = null;
async function boot() {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
  globalThis.__LEADS__ = [FULL, BARE]; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bca.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(200);
}
const openLead = async name => {
  const b = [...curEl.querySelectorAll('.nav-i')].find(e => /^Leads$/.test((e.textContent||'').trim()));
  if (b) await click(b); await settle();
  const row = [...curEl.querySelectorAll('tbody tr')].find(r => new RegExp(name).test(r.textContent||''));
  if (!row) throw new Error('no row for ' + name);
  await click(row); await settle(200);
};
const acts = () => [...curEl.querySelectorAll('.m-acts .m-act')];
const href = label => { const a = acts().find(e => (e.querySelector('b')||{}).textContent === label);
  return a && a.tagName === 'A' ? a.getAttribute('href') : null; };
const close = async () => { const x = [...curEl.querySelectorAll('.modal.lead .m-headright .m-x')].pop();
  if (x) { await click(x); await settle(150); } };

await boot();
await openLead('Sarah Chen');

ok('all four actions render', acts().length === 4, acts().map(a => (a.querySelector('b')||{}).textContent).join(','));
ok('they are out of the header', !curEl.querySelector('.m-head .qbtn'));
ok('and in the prep rail', !!curEl.querySelector('.m-prep .m-acts'));
ok('Call hands off to the dialler', href('Call') === 'tel:3165551234', String(href('Call')));
ok('Text hands off to SMS', href('Text') === 'sms:3165551234', String(href('Text')));
ok('Email opens Gmail compose at the configured account',
   href('Email') === 'https://mail.google.com/mail/u/3/?view=cm&fs=1&to=s%40chenrealty.com',
   String(href('Email')));
ok('Site opens in a new tab', /chenrealty\.com/.test(String(href('Site')))
   && acts().find(e => (e.querySelector('b')||{}).textContent === 'Site').getAttribute('target') === '_blank');
ok('nothing is disabled when every field is filled',
   acts().every(a => a.tagName === 'A'), acts().map(a => a.tagName).join(','));

await close();
await openLead('Marcus Webb');
ok('a bare record still renders all four', acts().length === 4, String(acts().length));
ok('  and every one of them is disabled, not missing',
   acts().every(a => a.tagName === 'BUTTON' && a.disabled), acts().map(a => a.tagName).join(','));
ok('  each says which field is missing',
   acts().every(a => /No (phone|email|website)/.test(a.getAttribute('title') || '')),
   acts().map(a => a.getAttribute('title')).join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
