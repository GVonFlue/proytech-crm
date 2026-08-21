/* Signed in with no crm_users row is a state, not a broken app.
   ============================================================================

   crm_whoami() answers 'none' for a login with no crm_users row, and it answers
   it with active:true — so the deactivated gate never caught it and the account
   fell through into the app. RLS then returns nothing, and what you get is the
   full chrome, rep navigation, your name in the corner off your email address,
   and zero of everything. An app that works perfectly and contains nothing is
   indistinguishable from a broken one. That is what happened to the orphan
   logan@proytech.app login.

   THE GATE IS THE EASY PART. What this file is really for is the two states it
   must NOT catch, both of which are load-bearing and neither of which is
   obvious from the gate's own condition:

     setup:false   crm_users is EMPTY — a fresh install, whose first login is
                   deliberately treated as the owner so the app can be set up
                   at all. Gating it locks you out of your own new install.
     whoami null   the call failed, or the install predates TEAM-MIGRATION.sql.
                   That path falls back to legacy single-tenant behaviour on
                   purpose, and must not be gated on a call that did not
                   come back.

   All four states are asserted together, because the bug was never "the gate
   is missing" — it was that four different situations rendered as one.
*/
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body></body></html>',
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
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','settings'], modulesV:9, options:{}, pools:['General'],
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };
const LEAD = { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new', priority:'high',
  owner:'Garrett', owner_id:'u_owner', createdAt:'2026-01-01T00:00:00.000Z',
  activities:[], meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[], labels:[], keyDates:[] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bng.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 200) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot({ whoami, users, leads = [LEAD], uid = 'u_owner', email = 'admin@getproytech.com' }) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  if (whoami === undefined) delete globalThis.__WHOAMI__; else globalThis.__WHOAMI__ = whoami;
  globalThis.__UID__ = uid; globalThis.__EMAIL__ = email;
  globalThis.__USERS__ = users; globalThis.__TEAM__ = [];
  globalThis.__LEADS__ = leads; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bng.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(260);
}
const gateText = () => { const g = curEl.querySelector('.gate-card'); return g ? (g.textContent || '') : ''; };
const inApp = () => !!curEl.querySelector('.nav-i');

/* ---- 1. the bug: signed in, no row ---- */
await boot({ whoami: { role:'none', active:true, setup:true, name:null, pools:[], commission_pct:0, tabs:[], goal_conversions:0 },
             users: [], uid:'2cec312b-0000-0000-0000-000000000000', email:'logan@proytech.app' });
ok('no crm_users row: gated, not dropped into the app', !inApp() && !!gateText(), gateText().slice(0, 90));
ok('  it says the account is not set up', /isn’t set up|isn't set up/.test(gateText()), gateText().slice(0, 120));
ok('  it names the address that needs adding', /logan@proytech\.app/.test(gateText()), gateText().slice(0, 160));
ok('  and offers a way out', !!curEl.querySelector('.gate-card button'));

/* ---- 2. the trap: a fresh install must still bootstrap ---- */
await boot({ whoami: { role:'owner', active:true, setup:false, name:null, pools:[], commission_pct:0, tabs:[], goal_conversions:0 },
             users: [], leads: [] });
ok('setup:false is a FRESH INSTALL, not an orphan — no gate', inApp(), gateText().slice(0, 120));

/* ---- 3. the other trap: whoami came back null ---- */
await boot({ whoami: null, users: [OWNER] });
ok('whoami null falls back to legacy behaviour — no gate', inApp(), gateText().slice(0, 120));

/* ---- 4. the gate that already existed still says its own thing ---- */
await boot({ whoami: { role:'rep', active:false, setup:true, name:'Tony Porter', pools:[], commission_pct:0, tabs:[], goal_conversions:0 },
             users: [OWNER] });
ok('deactivated is still its own message, not the new one',
   /switched off/.test(gateText()) && !/isn’t set up|isn't set up/.test(gateText()), gateText().slice(0, 120));

/* ---- 5. belt and braces on the fresh-install trap ----
   crm_whoami() coalesces role to 'owner' when crm_users is empty, so today
   role:'none' already implies setup:true and the setup guard is redundant.
   It is asserted anyway, and named as redundant, because the gate should not
   depend on that detail of the SQL: if the fresh-install branch ever changes,
   this is what stops the change from locking an owner out of a new install. */
await boot({ whoami: { role:'none', active:true, setup:false, name:null, pools:[], commission_pct:0, tabs:[], goal_conversions:0 },
             users: [], leads: [] });
ok('role none WITH setup:false still bootstraps — the gate never locks a fresh install',
   inApp(), gateText().slice(0, 120));

/* ---- 6. and a normal user is untouched ---- */
await boot({ whoami: undefined, users: [OWNER] });
ok('a set-up account still lands in the app', inApp() && !gateText());

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
