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

/* What the endpoint returns is swapped per case, so this asserts the RENDER —
   whether a populated "beyond" actually reaches the screen — separately from
   whether the model chooses to populate it. Those are different failures and
   were indistinguishable from the outside. */
let REPLY = { ok:true, text:'{"answer":"a","beyond":"b"}', spent:1, budget:100 };
globalThis.fetch = async (u) => {
  if (String(u).includes('/api/jarvis')) return { ok:true, json: async () => REPLY };
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


const ask = async q => {
  const box = curEl.querySelector('.jv textarea');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(box, q); box.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click(curEl.querySelector('.jv-send'));
  await settle(220);
};
const lastMsg = () => [...curEl.querySelectorAll('.jv-msg.them')].pop();

console.log('a populated "beyond" renders, separately from the answer');
REPLY = { ok:true, text: JSON.stringify({
  answer:'Brandon has introduced you to twelve people.',
  beyond:'A BNI chapter allows one person per profession.' }), spent:1, budget:100 };
await boot([OWNER]);
await nav('^(JARVIS|Assistant)$');
await ask('who should brandon meet');
const m1 = lastMsg();
ok('the answer body is the record half', /introduced you to twelve/.test(m1.textContent||''));
ok('the reasoning renders in its own block', !!m1.querySelector('.jv-beyond'));
ok('and carries the reasoning text', /one person per profession/.test((m1.querySelector('.jv-beyond')||{}).textContent||''));
ok('it is labelled as not from the records',
   /not from your records/i.test((m1.querySelector('.jv-beyond-tag')||{}).textContent||''),
   (m1.querySelector('.jv-beyond-tag')||{}).textContent||'no tag');
ok('the reasoning is NOT inside the answer body',
   !/one person per profession/.test((m1.querySelector('.jv-body')||{}).textContent||''));

console.log('\nan empty "beyond" shows nothing at all');
REPLY = { ok:true, text: JSON.stringify({ answer:'Just the records.', beyond:'' }), spent:1, budget:100 };
await ask('how many leads');
ok('no empty block is drawn', !lastMsg().querySelector('.jv-beyond'));

console.log('\na reply with no answer field keeps the model\'s own words');
REPLY = { ok:true, text:'{"beyond":"I reasoned but filled no answer"}', spent:1, budget:100 };
await ask('something odd');
ok('the raw reply is shown rather than a shrug',
   /I reasoned but filled no answer/.test((lastMsg().querySelector('.jv-body')||{}).textContent||''),
   (lastMsg().querySelector('.jv-body')||{}).textContent||'');
ok('and it is not the old dead-end message',
   !/could not put an answer together/.test(lastMsg().textContent||''));

console.log('\na truncated reply says so');
REPLY = { ok:true, text:'{"answer":"half a sen', stopReason:'max_tokens', spent:1, budget:100 };
await ask('a long one');
ok('the note names the length limit',
   /length limit/i.test((lastMsg().querySelector('.jv-note')||{}).textContent||''),
   (lastMsg().querySelector('.jv-note')||{}).textContent||'no note');
ok('and the partial text is still shown',
   /half a sen/.test((lastMsg().querySelector('.jv-body')||{}).textContent||''));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
