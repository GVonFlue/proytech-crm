/* The Google Calendar status is fetched for the person who signed in.
   ============================================================================

   The bug: refreshGcal() ran in a useEffect with an empty dependency array, so
   it fired once at App mount. Hooks run BEFORE the component's auth
   early-returns, so that was while the sign-in screen was still up.
   /api/google-status requires a session — it hands out the address of the
   Google account the whole install writes to — so with no token there was no
   answer, and connected stayed false. App does not remount when you sign in
   (the session lands in its own state), so the empty dependency array never
   asked again: the "Google Calendar isn't connected" warning was wrong for the
   rest of the session, on every load that started signed out. Which is every
   sign-in.

   This asserts the ORDER, not just the outcome, because an effect keyed on
   mount and one keyed on the session look identical once both have happened:

     1. signed out, the status is not asked for at all — there is nobody to ask
        for, and an unauthenticated ask is what poisoned the flag
     2. signing in asks, WITH a bearer token
     3. the booking form does not warn

   The fetch stub only answers `connected` when the request carried an
   authorization header, which is what the real endpoint's guard does. Without
   that, this test would pass on the broken code.
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

const statusCalls = [];
globalThis.fetch = async (u, o) => {
  const url = String(u);
  if (url.includes('/api/google-status')) {
    const authed = !!((o && o.headers && (o.headers.authorization || o.headers.Authorization)) || '');
    statusCalls.push({ authed });
    /* the real endpoint guards with requireAuth: no session, no answer */
    return authed
      ? { ok:true, json: async () => ({ connected:true, email:'admin@getproytech.com' }) }
      : { ok:false, status:401, json: async () => ({ error:'unauthorized' }) };
  }
  return { ok:false, status:500, json: async () => ({}), text: async () => '' };
};

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const LEAD = { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new', priority:'high',
  owner:'Garrett', owner_id:'u_owner', createdAt: ago(20), phone:'3165551234', email:'s@chenrealty.com',
  activities:[], meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[], labels:[], keyDates:[] };
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
fs.writeFileSync('tests/.bgs.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 160) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
globalThis.__LEADS__ = [LEAD]; globalThis.__SETTINGS__ = SETTINGS;
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

/* ---- 1. the app loads with nobody signed in ---- */
globalThis.__SIGNED_OUT__ = true;
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./.bgs.mjs?v=' + Date.now())).default)); });
await settle(250);

ok('signed out, the sign-in screen is up', !el.querySelector('.nav-i'));
ok('signed out, the status is never asked for',
   statusCalls.length === 0, JSON.stringify(statusCalls));

/* ---- 2. sign in, the way onChange delivers it ---- */
globalThis.__SIGNED_OUT__ = false;
await act(async () => { for (const cb of [...(globalThis.__AUTH_SUBS__ || [])]) cb({ access_token:'test-access-token', user:{ id:'u_owner', email:'admin@getproytech.com' } }, 'SIGNED_IN'); });
await settle(300);

ok('signing in asks for the status', statusCalls.length >= 1, JSON.stringify(statusCalls));
ok('  and asks with a bearer token', statusCalls.every(c => c.authed), JSON.stringify(statusCalls));

/* ---- 3. the symptom itself ---- */
const nav = [...el.querySelectorAll('.nav-i')].find(e => /^Leads$/.test((e.textContent||'').trim()));
if (nav) await click(nav); await settle();
const row = [...el.querySelectorAll('tbody tr')].find(r => /Sarah Chen/.test(r.textContent||''));
if (!row) throw new Error('no lead row');
await click(row); await settle(220);
for (const h of [...el.querySelectorAll('.msec:not(.open) .msec-h')]) { await click(h); await settle(40); }

const warn = el.querySelector('.mtg-warn');
ok('the booking form does not claim the calendar is disconnected',
   !warn, warn && (warn.textContent||'').slice(0, 140));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
