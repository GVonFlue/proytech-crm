/* PR 2 — the lead view becomes a full-viewport surface with a ?lead= URL.
   ============================================================================

   THE POINT OF THIS FILE IS THE THREE THINGS THAT MUST NOT BREAK.

   Making the lead view feel like a page is easy. Making it feel like a page
   WITHOUT becoming one is the whole design, and the difference is only visible
   in what survives closing it:

     1. PREV / NEXT — eleven callers pass openLead(id, ORDER), an ordered list
        of the ids on the screen you came from. A real route carries an id and
        cannot carry that ordering, so it would be lost.
     2. RETURN TO CONTEXT — the Leads table's filters, sort and scroll live in
        its own useState. A route unmounts it; a modal does not.
     3. THE MULTI-SELECT — the batch-reassign selection is in that same state,
        and losing it silently is exactly the regression a route would cause.

   So each of those is asserted around a real open-and-close, not reasoned
   about. The URL work is asserted the same way: pushState on open, one entry
   for the whole view however far you page, popstate closes, and a cold load
   with ?lead= opens the right record — or, when the id is not in the set,
   opens nothing and cleans the URL rather than guessing why.
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
const L = (id, name, extra = {}) => ({ id, name, company: name + ' Co', stage:'new',
  owner:'Garrett', owner_id:'u_owner', createdAt: ago(9), meetings:[], deals:[],
  dealValue:0, activities:[], custom:{}, ...extra });
const LEADS = () => ([
  L('l1','Alpha One'), L('l2','Bravo Two'), L('l3','Charlie Three'),
  L('l4','Delta Four'), L('l5','Echo Five'),
]);
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
fs.writeFileSync('tests/.bls.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 110) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const setV = async (el, v) => {
  const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  await act(async () => { el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  await settle(70);
};

let curRoot = null, curEl = null;
async function boot(url = 'https://crm.test/') {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  dom.reconfigure({ url });
  globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' }];
  globalThis.__LEADS__ = LEADS(); globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bls.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(190);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const rows = () => [...curEl.querySelectorAll('tbody tr')];
const rowNames = () => [...curEl.querySelectorAll('tbody tr .namecell')].map(e => (e.textContent || '').trim());
const openRow = async name => { const r = rows().find(x => new RegExp(name).test(x.textContent || ''));
  if (!r) throw new Error('no row for ' + name); await click(r); await settle(170); };
const modal = () => curEl.querySelector('.modal');
const title = () => ((curEl.querySelector('.m-head h2')) || {}).textContent || '';
const closeBtn = () => [...curEl.querySelectorAll('.m-headright .m-x')].pop();
const search = () => dom.window.location.search;
const back = async () => { await act(async () => { dom.window.history.back(); });
  await act(async () => { await new Promise(r => setTimeout(r, 60)); }); await settle(140); };

/* ==================================================================== */
console.log('\nthe surface');
{
  await boot(); await nav('Leads'); await openRow('Alpha One');
  ok('the lead view opens', !!modal());
  ok('  it is the full-viewport surface, not the 960px card',
     modal().className.includes('lead') && curEl.querySelector('.scrim2').className.includes('lead'),
     modal().className);
  const cs = dom.window.getComputedStyle(modal());
  ok('  width is not capped at 960px', cs.width === '100%', cs.width);
  ok('  and neither is height', cs.maxHeight === 'none', cs.maxHeight);
}
{
  /* the other five modals must be untouched by this */
  await boot(); await nav('Leads');
  const imp = [...curEl.querySelectorAll('button')].find(b => /^Import$/.test((b.textContent||'').trim()));
  await click(imp); await settle(90);
  const m = curEl.querySelector('.modal');
  ok('every other modal keeps the 960px card', !m.className.includes('lead'), m.className);
  ok('  and still computes to 960px', dom.window.getComputedStyle(m).width === '960px',
     dom.window.getComputedStyle(m).width);
}

console.log('\n1. PREV / NEXT still walks the list you came from');
{
  await boot(); await nav('Leads');
  const order = rowNames();
  await openRow(order[0]);
  ok('the position counter is there', /1 \/ 5/.test((curEl.querySelector('.m-headright')||{}).textContent||''),
     (curEl.querySelector('.m-headright')||{}).textContent);
  const next = [...curEl.querySelectorAll('.m-headright .m-x')][1];
  await click(next); await settle(150);
  ok('  next moves to the second lead in that order', title() === order[1], title() + ' vs ' + order[1]);
  const prev = [...curEl.querySelectorAll('.m-headright .m-x')][0];
  await click(prev); await settle(150);
  ok('  and prev comes back', title() === order[0], title());
}
{
  /* the ordering must follow the FILTER, not the raw table */
  await boot(); await nav('Leads');
  const box = curEl.querySelector('.searchbox input');
  await setV(box, 'Bravo');
  ok('the table is filtered to one row', rowNames().length === 1, JSON.stringify(rowNames()));
  await openRow('Bravo Two');
  ok('  a single-row filter offers no prev/next at all',
     !/\d+ \/ \d+/.test((curEl.querySelector('.m-headright')||{}).textContent||''),
     (curEl.querySelector('.m-headright')||{}).textContent);
}

console.log('\n2. RETURN TO CONTEXT — the page behind was never unmounted');
{
  await boot(); await nav('Leads');
  const box = curEl.querySelector('.searchbox input');
  await setV(box, 'a');                       // matches several
  const filtered = rowNames();
  ok('a filter is applied', filtered.length > 0 && filtered.length < 5, JSON.stringify(filtered));
  await openRow(filtered[0]);
  ok('  the lead opened', !!modal());
  await click(closeBtn()); await settle(150);
  ok('  the filter is still applied after closing', JSON.stringify(rowNames()) === JSON.stringify(filtered),
     JSON.stringify(rowNames()));
  ok('  and the search box still holds what was typed',
     (curEl.querySelector('.searchbox input')||{}).value === 'a',
     (curEl.querySelector('.searchbox input')||{}).value);
}

console.log('\n3. THE MULTI-SELECT survives opening and closing a lead');
{
  await boot(); await nav('Leads');
  const all = [...curEl.querySelectorAll('.scope-seg button')].find(b => /^All/.test(b.textContent||''));
  if (all) await click(all);
  await click(rows()[0].querySelector('.selcol input'));
  await click(rows()[1].querySelector('.selcol input'));
  await settle(90);
  ok('two leads are selected', /2 selected/.test((curEl.querySelector('.bulkbar')||{}).textContent||''),
     (curEl.querySelector('.bulkbar')||{}).textContent);
  await openRow('Charlie Three');
  ok('  a lead opens over the top of that selection', !!modal());
  await click(closeBtn()); await settle(150);
  ok('  the selection is STILL there after closing',
     /2 selected/.test((curEl.querySelector('.bulkbar')||{}).textContent||''),
     (curEl.querySelector('.bulkbar')||{}).textContent || 'the bulk bar is gone');
  ok('  and the right two are still ticked',
     rows().filter(r => r.querySelector('.selcol input').checked).length === 2);
}

console.log('\nthe URL');
{
  await boot(); await nav('Leads');
  ok('no ?lead= before opening one', !/lead=/.test(search()), search());
  await openRow('Delta Four');
  ok('opening a lead puts its id in the URL', /[?&]lead=l4\b/.test(search()), search());
  await click(closeBtn()); await settle(150);
  ok('  closing takes it back out', !/lead=/.test(search()), search());
}
{
  await boot(); await nav('Leads');
  await openRow('Alpha One');
  await click([...curEl.querySelectorAll('.m-headright .m-x')][1]); await settle(150);
  await click([...curEl.querySelectorAll('.m-headright .m-x')][1]); await settle(150);
  ok('paging updates the URL to the lead you are on', /lead=l3\b/.test(search()), search());
  await back();
  ok('  ONE Back closes the whole view, however far you paged',
     !modal(), 'still open on ' + title());
  ok('  and the URL is clean', !/lead=/.test(search()), search());
}
{
  /* a pasted link, cold */
  await boot('https://crm.test/?lead=l3');
  ok('a cold load with ?lead= opens that lead', !!modal() && /Charlie Three/.test(title()), title());
}
{
  await boot('https://crm.test/?lead=does-not-exist');
  ok('an unknown id opens nothing rather than erroring', !modal());
  ok('  and the stale ?lead= is cleaned off the URL', !/lead=/.test(search()), search());
}

console.log('\nEscape');
{
  await boot(); await nav('Leads'); await openRow('Echo Five');
  await act(async () => { dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key:'Escape', bubbles:true })); });
  await settle(140);
  ok('Escape closes the surface', !modal());
}
{
  await boot(); await nav('Leads'); await openRow('Echo Five');
  const ta = curEl.querySelector('textarea') || curEl.querySelector('.m-left input');
  await act(async () => { ta.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key:'Escape', bubbles:true })); });
  await settle(140);
  ok('  but NOT while typing — a half-written note is not thrown away', !!modal());
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
