/* Batch reassign on the Leads table.

   THREE THINGS THIS HAS TO GET RIGHT, and they are the three that bite:

   1. THE WRITE. owner, owner_id and data->>'owner_id' must all agree, and the
      way you achieve that is NOT by setting three fields — it is by routing
      through putMany -> stampOwner, which derives owner_id from the name and
      nulls the pool. This asserts on what reached the database.

   2. THE SILENT NULL. stampOwner resolves ownership with an exact name match
      and writes null on a miss, which leaves leads owned by nobody and visible
      to no rep, with no error anywhere. The batch path must refuse AND NAME
      THE PERSON rather than write nulls.

   3. THE GUARD RAIL. A moved lead keeps its commission snapshot and its
      meeting stamps, but a rep's earnings screens compute over the leads
      Postgres returns to THEM — so moving a lead takes pending money off their
      screen while it is still owed. The confirm has to say whose, and how
      much, before anything moves.                                            */
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
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 260) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const L = (o) => ({ company:(o.name||'')+' Co', stage:'new', createdAt:ago(9),
  meetings:[], deals:[], dealValue:0, activities:[], ...o });

/* Dana owns four. Two of them carry money she has not been paid for yet:
   a pending commission, and a held meeting nobody has approved. */
const LEADS = () => ([
  L({ id:'d1', name:'Dana Plain',  owner:'Dana', owner_id:'u_dana' }),
  L({ id:'d2', name:'Dana Cmsn',   owner:'Dana', owner_id:'u_dana',
      commission:{ repId:'u_dana', repName:'Dana', pct:10, base:5000, amount:500,
                   status:'pending', convertedAt:ago(4) } }),
  L({ id:'d3', name:'Dana Fee',    owner:'Dana', owner_id:'u_dana',
      meetings:[{ id:'m1', title:'Coffee', mtype:'Coffee', start:ago(3), end:ago(3),
                  status:'held', setBy:'Dana', setById:'u_dana',
                  heldBy:'Dana', heldById:'u_dana', heldAt:ago(3), createdAt:ago(5) }] }),
  /* already approved — no longer "awaiting approval", must not be counted */
  L({ id:'d4', name:'Dana Paid',   owner:'Dana', owner_id:'u_dana',
      meetings:[{ id:'m2', title:'Coffee', mtype:'Coffee', start:ago(6), end:ago(6),
                  status:'held', setBy:'Dana', setById:'u_dana', payRate:75,
                  payApprovedAt:ago(2), createdAt:ago(7) }] }),
  L({ id:'g1', name:'Garrett One', owner:'Garrett', owner_id:'u_owner' }),
]);

const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const TONY  = { id:'u_tony', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General','Test'], commission_pct:10, appointment_rate:75, active:true, tabs:['dash','leads'], goal_conversions:0, nav_order:[] };
const DANA  = { id:'u_dana', name:'Dana', email:'dana@getproytech.com', role:'rep',
  pools:['General'], commission_pct:10, appointment_rate:50, active:true, tabs:['dash','leads'], goal_conversions:0, nav_order:[] };
/* same NAME as Tony, different row — stampOwner's users.find takes the first */
const TWIN  = { id:'u_twin', name:'Tony Porter', email:'other.tony@x.com', role:'rep',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bbr.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 90) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot(users) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users;
  globalThis.__LEADS__ = LEADS();
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS__ = null; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bbr.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(150);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const scopeBtn = re => [...curEl.querySelectorAll('.scope-seg button')].find(b => re.test(b.textContent || ''));
const boxes = () => [...curEl.querySelectorAll('tbody .selcol input')];
const rowFor = name => [...curEl.querySelectorAll('tbody tr')].find(r => new RegExp(name).test(r.textContent || ''));
const boxFor = name => (rowFor(name) || { querySelector: () => null }).querySelector('.selcol input');
const bulkSelect = () => (curEl.querySelector('.bulkbar') || { querySelector: () => null }).querySelector('select');
const btn = re => [...curEl.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim()));
const pick = async (sel, v) => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setter.call(sel, v); sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); await settle(); };
const confirmText = () => (curEl.querySelector('.bulk-confirm') || {}).textContent || '';
const resultText = () => (curEl.querySelector('.bulk-result') || {}).textContent || '';
const written = id => (globalThis.__WRITES__ || []).filter(w => w.id === id).at(-1);
const toAll = async () => { await click(scopeBtn(/^All/)); };

/* ==================================================================== */
console.log('\nselecting');
{
  await boot([OWNER, TONY, DANA]);
  await nav('Leads'); await toAll();
  ok('an owner gets a checkbox on every row', boxes().length === 5, boxes().length + ' boxes');
  await click(boxFor('Dana Plain'));
  ok('ticking one opens the bulk bar', !!curEl.querySelector('.bulkbar'));
  ok('  and it counts what is selected', /1 selected/.test((curEl.querySelector('.bulkbar')||{}).textContent||''),
     (curEl.querySelector('.bulkbar')||{}).textContent);
  ok('ticking a box does NOT open the lead modal', !curEl.querySelector('.modal, .m-head'),
     'the row click fired through the checkbox');
}
{
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  const head = curEl.querySelector('thead .selcol input');
  await click(head);
  ok('the header box selects every visible row', /5 selected/.test((curEl.querySelector('.bulkbar')||{}).textContent||''),
     (curEl.querySelector('.bulkbar')||{}).textContent);
  await click(head);
  ok('  and clicking it again clears them', !curEl.querySelector('.bulkbar'));
}
{
  /* the rule that stops a batch acting on rows you cannot see */
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(curEl.querySelector('thead .selcol input'));
  ok('5 are selected to begin with', /5 selected/.test((curEl.querySelector('.bulkbar')||{}).textContent||''));
  const ownerSel = [...curEl.querySelectorAll('select')]
    .find(s => [...s.options].some(o => o.value === 'all' && /All owners/.test(o.textContent || '')));
  await pick(ownerSel, 'u_dana');
  ok('changing a filter clears the selection rather than acting on hidden rows',
     !curEl.querySelector('.bulkbar'), 'selection survived a filter change');
}
{
  await boot([TONY, OWNER, DANA]);        // signed in as a rep
  await nav('Leads');
  ok('a rep gets no checkboxes at all', boxes().length === 0, boxes().length + ' boxes for a rep');
}

/* ==================================================================== */
console.log('\nTHE GUARD RAIL — named before anything moves');
{
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(curEl.querySelector('thead .selcol input'));
  await pick(bulkSelect(), 'u_tony');
  await click(btn(/^Reassign$/));
  const t = confirmText();
  ok('the confirm names the destination', /Tony Porter/.test(t), t);
  ok('  and how many are moving', /Move\s*5/.test(t.replace(/\s+/g,' ')), t);
  ok('it names WHOSE money goes off screen', /Dana/.test(t), t);
  ok('  the pending commission, with the amount', /1 pending commission/.test(t) && /\$500/.test(t), t);
  ok('  the unapproved held meeting, with the amount', /1 held meeting awaiting approval/.test(t) && /\$50/.test(t), t);
  ok('  an ALREADY APPROVED fee is not counted as at risk', !/2 held meetings/.test(t), t);
  ok('it is honest that the money itself is not lost', /keep the money|stay on the lead/.test(t), t);
  ok('nothing is written until the confirm is confirmed',
     (globalThis.__WRITES__ || []).length === 0, JSON.stringify((globalThis.__WRITES__||[]).map(w => w.id)));

  await click(btn(/^Cancel$/));
  ok('cancelling writes nothing and keeps the selection',
     (globalThis.__WRITES__ || []).length === 0 && !!curEl.querySelector('.bulkbar'));
}
{
  /* no false alarm */
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(boxFor('Dana Plain'));
  await pick(bulkSelect(), 'u_tony');
  await click(btn(/^Reassign$/));
  ok('a lead carrying nothing pending says so plainly',
     /Nothing selected carries pending commission/.test(confirmText()), confirmText());
}
{
  /* the destination is not warned about losing sight of their own leads */
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(curEl.querySelector('thead .selcol input'));
  await pick(bulkSelect(), 'u_dana');
  await click(btn(/^Reassign$/));
  /* assert on the LIST, not on prose: the empty-state sentence contains the
     words "pending commission" too, so a text match here passes for the wrong
     reason and would keep passing if the exclusion broke. */
  ok('moving leads TO Dana does not warn that Dana loses sight of them',
     !curEl.querySelector('.bc-list'), confirmText());
  ok('  it says there is nothing at risk instead',
     /Nothing selected carries/.test(confirmText()), confirmText());
}

/* ==================================================================== */
console.log('\nthe write');
{
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(boxFor('Dana Plain')); await click(boxFor('Dana Cmsn'));
  await pick(bulkSelect(), 'u_tony');
  await click(btn(/^Reassign$/));
  await click(btn(/^Move 2$/));
  await settle(140);

  const a = written('d1'), b = written('d2');
  ok('both leads were written', !!a && !!b, JSON.stringify((globalThis.__WRITES__||[]).map(w=>w.id)));
  ok('owner is the new name', a.owner === 'Tony Porter' && b.owner === 'Tony Porter', a && a.owner);
  ok('owner_id is the new id — derived by stampOwner, not trusted from the caller',
     a.owner_id === 'u_tony' && b.owner_id === 'u_tony', a && a.owner_id);
  ok('the pool is cleared, so no other rep in it keeps read access',
     !a.pool && !b.pool, JSON.stringify([a&&a.pool, b&&b.pool]));
  ok('one activity records the move, naming both sides',
     /Reassigned from Dana to Tony Porter/.test((a.activities||[])[0]?.text || ''), (a.activities||[])[0]);
  ok('  stamped with who did it', (a.activities||[])[0]?.who === 'Garrett', (a.activities||[])[0]);
  ok('the commission snapshot is NOT rewritten — that history is Dana\'s',
     b.commission && b.commission.repId === 'u_dana' && b.commission.amount === 500, JSON.stringify(b.commission));
  ok('leads that were not selected are untouched', !written('g1') && !written('d3'),
     JSON.stringify((globalThis.__WRITES__||[]).map(w=>w.id)));
  ok('it reports what happened', /Moved 2 leads to/.test(resultText()) && /Tony Porter/.test(resultText()), resultText());
  ok('  and the selection is cleared afterwards', !curEl.querySelector('.bulkbar'));
}
{
  /* unassigning is the same path with no target */
  await boot([OWNER, TONY, DANA]); await nav('Leads'); await toAll();
  await click(boxFor('Dana Plain'));
  await pick(bulkSelect(), '__pool');
  await click(btn(/^Reassign$/));
  await click(btn(/^Move 1$/));
  await settle(140);
  const a = written('d1');
  ok('unassigning clears owner_id', !!a && !a.owner_id, JSON.stringify(a && { o:a.owner, id:a.owner_id }));
}

/* ==================================================================== */
console.log('\nTHE SILENT NULL — refuse, and say which name failed');
{
  /* Two active people share a name. stampOwner's users.find takes the first,
     so assigning would pick one at random and look like it worked. */
  await boot([OWNER, TONY, TWIN, DANA]); await nav('Leads'); await toAll();
  await click(boxFor('Dana Plain'));
  await pick(bulkSelect(), 'u_tony');
  await click(btn(/^Reassign$/));
  await click(btn(/^Move 1$/));
  await settle(140);
  const t = resultText();
  ok('a duplicated name refuses the whole batch', /Nothing was moved/.test(t), t);
  ok('  and NAMES the name that is doubled', /Tony Porter/.test(t), t);
  ok('  and says how many people share it', /\b2\b/.test(t), t);
  ok('  and nothing reached the database', (globalThis.__WRITES__ || []).length === 0,
     JSON.stringify((globalThis.__WRITES__||[]).map(w=>w.id)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
