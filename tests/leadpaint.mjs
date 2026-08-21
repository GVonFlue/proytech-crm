/* PR 4 — the lead view is painted, and machine notes stop crowding the history.
   ============================================================================

   TWO THINGS, AND THE SECOND IS THE ONE THAT CAN GO WRONG QUIETLY.

   THE FOLD. Runs of app-written notes — "Stage moved: …", "Follow-up cleared.",
   "Payment confirmed …" — collapse into one line. It must be a FOLD and not a
   filter: every note is still reachable in one tap, still deletable, and the
   day headings must not skip. A single machine note is left alone, because
   hiding one sentence behind a disclosure costs a click to read a sentence.

   It changes nothing but which rows are drawn together. The Notes chip and the
   contact tally are STILL inflated by these notes — a separate, real bug,
   written up in TOUCH-COUNT-FINDING.md and deliberately not fixed here. This
   file asserts that it is still there, so the fold cannot be mistaken for
   having fixed it.

   THE PAINT. Asserted only where it can leak: the dark tokens must resolve
   inside the lead view and must NOT reach any other modal or the page behind
   it. Everything else about how it looks is a judgement call for a human, and
   a test that pinned hex values would only ever be a change-detector.
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
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 220) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const A = (id, d, type, text, who='Garrett') => ({ id, ts: ago(d), type, text, who });

/* One lead whose history is mostly the app talking to itself — which is what a
   lead looks like after a month of being worked properly. */
const LEAD = {
  id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new', owner:'Garrett', owner_id:'u_owner',
  createdAt: ago(40), meetings:[], deals:[], dealValue:0, custom:{},
  activities:[
    A('h1', 1, 'Call', 'Rang her about the proposal — wants it live before September.'),
    /* a run of four, all on the same day */
    A('s1', 2, 'Note', 'Follow-up cleared.'),
    A('s2', 2, 'Note', 'Follow-up cleared.'),
    A('s3', 2, 'Note', 'Stage moved: New Lead → Proposal Sent'),
    A('s4', 2, 'Note', 'Deal value set to $3,500'),
    A('h2', 3, 'Note', 'She mentioned her brother runs the listing team.'),
    /* a run of one — must NOT fold */
    A('s5', 4, 'Note', 'Payment confirmed 1 Aug — $3,500 now counting.'),
    A('h3', 5, 'Text', 'Sent her the deck.'),
    A('s6',40, 'Note', 'Lead created.'),
  ],
};
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const SETTINGS = { modules:['dash','leads','settings'], modulesV:9, options:{},
  retainerStartCleared:'2026-01-01T00:00:00.000Z',
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bpt.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot() {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
  globalThis.__LEADS__ = [JSON.parse(JSON.stringify(LEAD))]; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bpt.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(190);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent||'').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async () => { await nav('Leads');
  const r = [...curEl.querySelectorAll('tbody tr')].find(x => /Sarah Chen/.test(x.textContent||''));
  await click(r); await settle(180); };
const cs = n => dom.window.getComputedStyle(n);
const feedText = () => (curEl.querySelector('.feed')||{}).textContent || '';

/* ==================================================================== */
console.log('\nthe fold');
await boot(); await openLead();
{
  const runs = [...curEl.querySelectorAll('.sysrun')];
  ok('a run of machine notes folds into one line', runs.length === 1, runs.length + ' folded runs');
  ok('  it says how many it is holding', /\b4\b/.test(runs[0].textContent||''), runs[0].textContent);
  ok('  and names the first one, so the fold is not a mystery',
     /Follow-up cleared/.test(runs[0].textContent||''), runs[0].textContent);
}
{
  /* the thing the fold exists to protect */
  const items = [...curEl.querySelectorAll('.fitem')].map(e => (e.querySelector('.ftxt')||{}).textContent||'');
  ok('the human history is what is left on screen',
     items.some(t => /Rang her about the proposal/.test(t))
     && items.some(t => /brother runs the listing team/.test(t))
     && items.some(t => /Sent her the deck/.test(t)), JSON.stringify(items));
  ok('  and the folded four are NOT drawn as rows',
     !items.some(t => /Stage moved/.test(t)) && !items.some(t => /Deal value set to/.test(t)),
     JSON.stringify(items));
}
{
  /* a single machine note is left alone — a disclosure to read one sentence is
     a worse trade than the sentence */
  const items = [...curEl.querySelectorAll('.fitem')].map(e => (e.querySelector('.ftxt')||{}).textContent||'');
  ok('a LONE machine note is not folded', items.some(t => /Payment confirmed/.test(t)), JSON.stringify(items));
  ok('  and neither is a lone "Lead created."', items.some(t => /Lead created/.test(t)));
}
{
  await click(curEl.querySelector('.sysrun')); await settle(120);
  const items = [...curEl.querySelectorAll('.fitem')].map(e => (e.querySelector('.ftxt')||{}).textContent||'');
  ok('one tap opens the run', items.some(t => /Stage moved/.test(t)) && items.some(t => /Deal value set to/.test(t)),
     JSON.stringify(items));
  ok('  every note in it is still deletable',
     [...curEl.querySelectorAll('.fitem.sys .fdel')].length === 4,
     [...curEl.querySelectorAll('.fitem.sys .fdel')].length + ' delete buttons');
  await click(curEl.querySelector('.sysrun')); await settle(120);
  ok('  and it folds again', [...curEl.querySelectorAll('.fitem.sys')].length === 0);
}
{
  /* the timeline must not skip a day because a day is all machine notes */
  ok('day headings still cover the folded run', [...curEl.querySelectorAll('.fday')].length >= 4,
     [...curEl.querySelectorAll('.fday')].length + ' day headings');
}

console.log('\nthe fold changed NO counts — the real bug is still there');
{
  /* TOUCH-COUNT-FINDING.md. If this ever starts failing it means the count bug
     was fixed, which is a good thing that must not happen by accident inside a
     presentation PR. */
  const chips = [...curEl.querySelectorAll('.afilter button')].map(b => (b.textContent||'').trim());
  const notes = chips.find(c => /^Notes/.test(c)) || '';
  /* Seven: six machine notes plus one real one. noteCount has NO exclusion at
     all — not even the "Lead created." that touch() removes — so every one of
     them is counted as a note the user wrote. That is the bug in
     TOUCH-COUNT-FINDING.md, asserted here so a presentation PR cannot fix it by
     accident and hide the before/after. */
  ok('the Notes chip still counts all six machine notes', /Notes \(7\)/.test(notes),
     notes + '  (expected 7 = 1 human + 6 machine)');
  ok('  so this PR did not quietly fix the counting bug', /\(7\)/.test(notes), notes);
}

console.log('\nthe paint, only where it can leak');
{
  const m = curEl.querySelector('.modal.lead');
  ok('the lead view carries the dark surface', !!m);
  const bg = cs(m).backgroundColor + ' ' + cs(m).backgroundImage;
  ok('  its background is painted, not inherited', /rgb|gradient/.test(bg), bg.slice(0, 90));
  ok('  the arc token resolves inside it', cs(m).getPropertyValue('--arc').trim() === '#38BDF8',
     JSON.stringify(cs(m).getPropertyValue('--arc')));
  ok('  and it is the SAME token JARVIS ships',
     fs.readFileSync('src/Jarvis.jsx','utf8').includes('--arc:#38BDF8'));
}
{
  /* the containment claim: the tokens must not exist anywhere but here */
  const app = curEl.querySelector('.app, #root, div');
  ok('the page behind it is untouched by the dark tokens',
     cs(document.body).getPropertyValue('--arc').trim() === '',
     JSON.stringify(cs(document.body).getPropertyValue('--arc')));
  const src = fs.readFileSync('src/App.jsx','utf8');
  /* Anchor on the paint block's own header, not on '.modal.lead{' — PR 2's
     full-viewport rule uses that selector too and sits earlier in the file. */
  const block = src.slice(src.indexOf('THE LEAD VIEW, PAINTED.'),
                          src.indexOf('@media (prefers-reduced-motion:reduce){.modal.lead'));
  const strays = (block.match(/\n\.(?!modal\.lead)[a-z]/g) || []);
  ok('  every rule in the paint block is scoped to .modal.lead', strays.length === 0,
     strays.join(' '));
}
{
  await nav('Leads');
  const imp = [...curEl.querySelectorAll('button')].find(b => /^Import$/.test((b.textContent||'').trim()));
  await click(imp); await settle(110);
  const m = curEl.querySelector('.modal');
  ok('another modal is still the light card', !m.className.includes('lead'), m.className);
  ok('  with no dark token on it', cs(m).getPropertyValue('--arc').trim() === '',
     JSON.stringify(cs(m).getPropertyValue('--arc')));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
