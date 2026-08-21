/* The conversation survives leaving the screen.
   ============================================================================

   Jarvis is mounted by a view ternary in App, so clicking into a lead unmounts
   it. Held in useState, the thread went with it — you came back to an empty
   feed and no way to get the answer back.

   The thread lives in a module-scoped store in Jarvis.jsx now, so it outlives
   the unmount and dies on reload. This asserts both halves of that, because
   only asserting the first would let "never forgets anything, ever" pass:

     1. ask a question, leave for a lead, come back — the thread is still there
     2. a different uid signs in — the thread is NOT there, because it quotes
        leads by name and a rep's leads are not the owner's

   Reload is not asserted here: a module store dies with the module, and jsdom
   has no reload to drive. That is the mechanism, not a promise made in code.
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

let asked = 0;
globalThis.fetch = async (u, o) => {
  if (String(u).includes('/api/jarvis')) {
    asked++;
    return { ok:true, json: async () => ({ ok:true, text:'She is your warmest one this week.', spent:1, budget:100 }) };
  }
  if (String(u).includes('google-status')) return { ok:true, json: async () => ({ connected:false, email:'' }) };
  return { ok:false, status:500, json: async () => ({}), text: async () => '' };
};

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 600) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const LEAD = { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new', priority:'high',
  owner:'Garrett', owner_id:'u_owner', createdAt: ago(20), phone:'3165551234', email:'s@chenrealty.com',
  activities:[{ id:'a1', ts: ago(1), type:'Call', text:'Rang her.', who:'Garrett' }],
  meetings:[], deals:[], payments:[], custom:{}, serviceInterest:[], labels:[], keyDates:[] };
const LEAD2 = { ...LEAD, id:'l2', name:'Marcus Webb', company:'Webb Auto', activities:[] };
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const REP = { id:'u_rep', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General'], commission_pct:15, appointment_rate:40, active:true,
  tabs:['dash','leads','jarvis','settings'], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','jarvis','settings'], modulesV:9, options:{}, pools:['General'],
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bjp.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 140) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

/* One import of the bundle for the whole run. The store is module state, so a
   fresh import per mount would hand every mount a fresh store and the test
   would pass no matter what the component did. */
const mod = await import('./.bjp.mjs?v=1');

let curRoot = null, curEl = null;
async function boot(users) {
  globalThis.__UID__ = users[0].id; globalThis.__EMAIL__ = users[0].email;
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users;
  globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }, { id:'u_rep', name:'Tony Porter', role:'rep' }];
  globalThis.__LEADS__ = [LEAD, LEAD2]; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(200);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => new RegExp(l, 'i').test((e.textContent||'').trim()));
  if (!b) throw new Error('no nav item ' + l); await click(b); await settle(); };
const thread = () => [...curEl.querySelectorAll('.jv-msg')].map(m => (m.textContent||'').trim());

await boot([OWNER]);
await nav('^(JARVIS|Assistant)$');
const box = curEl.querySelector('.jv textarea');
ok('the assistant is on screen', !!box);
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(box, 'who is warmest');
  box.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
await click(curEl.querySelector('.jv-send'));
await settle(200);

const before = thread();
ok('the question and the answer are in the feed', before.length === 2 && asked === 1,
   JSON.stringify(before));

/* leave the way the bug was reported: click into a lead */
await nav('Leads');
await click([...curEl.querySelectorAll('tbody tr')].find(r => /Sarah Chen/.test(r.textContent||'')));
await settle(200);
ok('the lead view took over — the assistant is unmounted', !curEl.querySelector('.jv'));

const closer = [...curEl.querySelectorAll('.modal.lead .m-headright .m-x')].pop();
if (closer) { await click(closer); await settle(150); }
await nav('^(JARVIS|Assistant)$');
const after = thread();
ok('coming back, the conversation is still there',
   JSON.stringify(after) === JSON.stringify(before) && asked === 1, JSON.stringify(after));

/* a different person, same browser, no reload */
await boot([REP]);
await nav('^(JARVIS|Assistant)$');
ok('a different uid does not inherit the thread', thread().length === 0, JSON.stringify(thread()));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
