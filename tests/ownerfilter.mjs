/* REP-AUDIT follow-up: filtering the Leads table by owner.

   THE POINT OF THIS FILE IS THAT IT ALSO PROVES THE FEATURE WAS THE SMALL ONE.
   The first two blocks assert what already worked before any of this was
   built — an owner on "All" could already see every rep's leads, and the Owner
   column is on by default. If those ever fail, the gap really is a missing
   VIEW and this filter is the wrong shape. They pass, so the gap was one
   dropdown.

   The block that matters most is the last: a lead carrying a rep's NAME with a
   null owner_id is not that rep's lead. Postgres will not return it to them
   (leads_all matches on owner_id), so listing it under their name would state
   the opposite of what the database does. It must show under Unassigned, and
   the screen must say so out loud — stampOwner() creates exactly this drift by
   resolving owner_id from an exact name match and writing null on a miss. */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
  'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
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
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 240) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const L = (id, name, owner, owner_id) => ({ id, name, company: name + ' Co', stage:'new',
  owner, owner_id, createdAt: ago(9), meetings:[], deals:[], dealValue:0, activities:[] });

/* One fixture, six leads, every ownership shape that exists in the real data. */
const LEADS = () => ([
  L('t1','Tony One','Tony Porter','u_tony'),
  L('t2','Tony Two','Tony Porter','u_tony'),
  L('d1','Dana One','Dana','u_dana'),
  /* THE DRIFT CASE: wears Tony's name, has no id. stampOwner() writes this
     whenever crm_users has no exact name match at the moment of the write. */
  L('x1','Drifted','Tony Porter',null),
  L('u1','Nobody','',null),
  L('g1','Garrett One','Garrett','u_owner'),
]);

const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const TONY  = { id:'u_tony', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General','Test'], commission_pct:10, active:true, tabs:['dash','leads'], goal_conversions:0, nav_order:[] };
const DANA  = { id:'u_dana', name:'Dana', email:'dana@getproytech.com', role:'rep',
  pools:['General'], commission_pct:10, active:true, tabs:['dash','leads'], goal_conversions:0, nav_order:[] };
const GONE  = { id:'u_gone', name:'Old Rep', email:'old@x.com', role:'rep',
  pools:[], commission_pct:0, active:false, tabs:[], goal_conversions:0, nav_order:[] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bof.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 90) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot(users) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users;              // whoami reports users[0]
  globalThis.__LEADS__ = LEADS();
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS__ = null; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bof.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(150);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
/* The owner control is the only select carrying an "All owners" option. Pinned
   that way rather than by position: the toolbar has five selects and they get
   reordered. */
const ownerSelect = () => [...curEl.querySelectorAll('select')]
  .find(s => [...s.options].some(o => o.value === 'all' && /All owners/.test(o.textContent || '')));
const pick = async (sel, v) => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setter.call(sel, v); sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle(); };
const names = () => [...curEl.querySelectorAll('tbody tr .namecell')].map(e => (e.textContent || '').trim()).sort();
const scopeBtn = re => [...curEl.querySelectorAll('.scope-seg button')].find(b => re.test(b.textContent || ''));
const noteText = () => [...curEl.querySelectorAll('.pool-note')].map(e => e.textContent || '').join(' ');

/* ==================================================================== */
console.log('\nwhat already worked before this feature — the reason it stayed small');
{
  await boot([OWNER, TONY, DANA]);
  await nav('Leads');
  ok('an owner gets the All scope button', !!scopeBtn(/^All/), 'no All button for an owner');
  await click(scopeBtn(/^All/));
  ok('All already shows every rep\'s leads, including Tony\'s',
     names().includes('Tony One') && names().includes('Dana One'), JSON.stringify(names()));
  const heads = [...curEl.querySelectorAll('thead th')].map(t => (t.textContent || '').replace(/[▲▼↕]/g, '').trim());
  ok('  and the Owner column is already on by default', heads.includes('Owner'), JSON.stringify(heads));
}

console.log('\nthe control itself');
{
  ok('an owner gets an owner filter', !!ownerSelect());
  const opts = [...ownerSelect().options].map(o => (o.textContent || '').trim());
  ok('  it lists the active people', opts.some(o => /Tony Porter/.test(o)) && opts.some(o => /Dana/.test(o)), JSON.stringify(opts));
  ok('  it offers Unassigned', opts.some(o => /^Unassigned$/.test(o)), JSON.stringify(opts));
  ok('  owners are marked as such, so you can tell them apart at a glance',
     opts.some(o => /Garrett · owner/.test(o)), JSON.stringify(opts));
}
{
  await boot([OWNER, TONY, DANA, GONE]);
  await nav('Leads');
  const opts = [...ownerSelect().options].map(o => (o.textContent || '').trim());
  ok('a deactivated person is not offered — they cannot sign in',
     !opts.some(o => /Old Rep/.test(o)), JSON.stringify(opts));
}

console.log('\nfiltering to one person');
{
  await boot([OWNER, TONY, DANA]);
  await nav('Leads');
  await pick(ownerSelect(), 'u_tony');
  ok('picking a person switches the scope to All, rather than showing an empty Mine',
     scopeBtn(/^All/).className.includes('on'), 'scope did not move');
  ok('it shows that person\'s leads', JSON.stringify(names()) === JSON.stringify(['Tony One','Tony Two']), JSON.stringify(names()));
  ok('  and nobody else\'s', !names().includes('Dana One') && !names().includes('Garrett One'), JSON.stringify(names()));
}

console.log('\na rep never sees the control');
{
  await boot([TONY, OWNER, DANA]);          // Tony is signed in
  await nav('Leads');
  ok('no owner filter for a rep', !ownerSelect(), 'a rep was offered an owner filter');
  ok('  and no All scope button either', !scopeBtn(/^All/));
}

/* ==================================================================== */
console.log('\nTHE DRIFT CASE — a name without an id is nobody\'s lead');
{
  await boot([OWNER, TONY, DANA]);
  await nav('Leads');
  await pick(ownerSelect(), 'u_tony');
  ok('a lead wearing Tony\'s name with a null owner_id is NOT listed as his',
     !names().includes('Drifted'), JSON.stringify(names()) + ' — RLS matches owner_id, so neither may this');

  const t = noteText();
  ok('the screen says so instead of hiding it', /Drifted|no owner id/.test(t) || /1 more lead carries/.test(t), t);
  ok('  it names the person', /Tony Porter/.test(t), t);
  ok('  and counts them', /\b1\b/.test(t), t);

  await pick(ownerSelect(), 'none');
  ok('Unassigned is where it actually shows up',
     names().includes('Drifted') && names().includes('Nobody'), JSON.stringify(names()));
  ok('  and Unassigned holds nothing that has an owner id',
     !names().includes('Tony One') && !names().includes('Dana One'), JSON.stringify(names()));
  ok('  with a note explaining a rep cannot see them', /never by the name written on them/.test(noteText()), noteText());
}
{
  /* the hint must not cry wolf */
  await boot([OWNER, TONY, DANA]);
  await nav('Leads');
  await pick(ownerSelect(), 'u_dana');
  ok('no drift hint for a person whose leads are all properly bound',
     !/carries|carry/.test(noteText()), noteText());
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
