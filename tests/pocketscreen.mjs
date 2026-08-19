/* THE RECORDING SCREEN — asserts on WHAT REACHES THE DATABASE.

   One recording is a permanent source with many outputs, so the claims a green
   build cannot check are:

     1. NO OUTPUT EVER CARRIES THE TRANSCRIPT. The recording keeps the only
        copy. Seeded with a sentinel and asserted against every write.
     2. Outputs go to the RIGHT table with the RIGHT kind, and carry
        sourcePocketId — which vanishes on reload if normLog/normKbNote forget
        it, the bug those functions exist to warn about.
     3. The outputs list is DERIVED. It appears without the recording row being
        written.
     4. Deep extract spends NOTHING until pressed.
     5. An open recording makes "Your day" say there is something waiting,
        rather than "Nothing waiting on you" over a queue.

   Runs as `node tests/pocketscreen.mjs`.                                     */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 240) : '')); } };

/* ------------------------------------------- part 1: the derived index, pure */

const { outputIndex } = await import('../src/Pocket.jsx').catch(() => ({}));

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
 try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {} }
globalThis.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.confirm = () => true;

const TRANSCRIPT_SENTINEL = 'SENTINEL-PAY-SPLIT-forty-percent-and-we-floor-at-nine-thousand';

globalThis.__WRITES__=[]; globalThis.__MANY__=[]; globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[]; globalThis.__EVENTS__=[]; globalThis.__EVENT_WRITES__=[];
globalThis.__SETTINGS_WRITES__=[]; globalThis.__SETTINGS__=null;
globalThis.__MLOGS__=[]; globalThis.__MLOG_WRITES__=[];
globalThis.__KB_NOTES__=[]; globalThis.__KB_PUB__=[]; globalThis.__KB_WRITES__=[];
globalThis.__POCKET_LOADS__=[]; globalThis.__POCKET_STATUS__=[]; globalThis.__POCKET_DELETED__=[]; globalThis.__POCKET_PROPOSALS__=[];
globalThis.__USERS__=[{ id:'u_owner', name:'Garrett', email:'garrett@getproytech.com', role:'owner', pools:[], commission_pct:0, active:true, tabs:[], goal_conversions:0, nav_order:[] }];

/* two Mark Kaufmanns, on purpose */
globalThis.__LEADS__=[
  { id:'l_mark_a', name:'Mark Kaufmann', company:'Kaufmann Realty', email:'mark@kaufmannrealty.com', phone:'', stage:'new', owner:'Garrett', createdAt:'2026-07-01T10:00:00.000Z', meetings:[], deals:[], dealValue:0, activities:[] },
  { id:'l_mark_b', name:'Mark Kaufmann', company:'Delta Freight', email:'mk@deltafreight.com', phone:'', stage:'new', owner:'Garrett', createdAt:'2026-07-01T10:00:00.000Z', meetings:[], deals:[], dealValue:0, activities:[] },
  { id:'l_rita',  name:'Rita Alvarez',  company:'Alvarez Realty', email:'rita@alvarezrealty.com', phone:'', stage:'new', owner:'Garrett', createdAt:'2026-07-01T10:00:00.000Z', meetings:[], deals:[], dealValue:0, activities:[] },
];

globalThis.__POCKETS__=[{
  id:'rec_sunday', status:'open', received_at:'2026-08-18T15:00:00.000Z',
  title:'Sunday with Logan', createdAt:'2026-08-17T15:00:00.000Z', duration:2400,
  summary:'Pricing, the Alvarez account, and the rate lock objection.',
  actionItems:[{ title:'Send the Alvarez quote' }],
  transcript:'Garrett: So about Rita Alvarez.\nLogan: ' + TRANSCRIPT_SENTINEL,
  events:[{ event:'summary.completed' }],
}];

globalThis.__FETCHES__=[];
globalThis.fetch = async (u, opts = {}) => {
  const url = String(u);
  globalThis.__FETCHES__.push({ url, body: opts && opts.body ? String(opts.body) : '' });
  if (url.includes('google-status')) return { ok:true, json: async () => ({ connected:false, email:'' }) };
  if (url.includes('/api/pocket-segment')) return { ok:true, json: async () => ({ ok:true, truncated:false, proposals:[
    { destination:'client', target:'Rita Alvarez', title:'Alvarez wants the board',
      body:'Rita is drowning in spreadsheet handoffs and wants it before listing season.',
      locator:{ start:'12:30', end:'22:10', quote:'so about Rita Alvarez' }, confidence:'high' },
    { destination:'playbook', target:'', title:'Rate lock objection',
      body:'When a lender says the rate is locked, ask what the expiry date is before you answer.',
      locator:{ start:'30:00', end:'32:00', quote:'the rate lock thing' }, confidence:'medium' },
  ] }) };
  if (url.includes('/api/pocket-backfill')) {
    const b = JSON.parse(opts.body);
    if (b.action === 'list') return { ok:true, json: async () => ({ ok:true, hasMore:false, total:2, recordings:[
      { id:'rec_sunday', title:'Sunday with Logan', createdAt:'2026-08-17T15:00:00.000Z', duration:2400 },
      { id:'rec_older',  title:'Older call',        createdAt:'2026-08-10T15:00:00.000Z', duration:600 },
    ] }) };
    return { ok:true, json: async () => ({ ok:true, id:b.id, created: b.id === 'rec_older' }) };
  }
  if (url.includes('/api/meeting-log')) return { ok:true, json: async () => ({ ok:true, extraction:{
    title:'Alvarez discovery', headline:'She wants it before listing season', summary:'.',
    themes:[], decisions:[], actions:[], numbers:[], risks:[], openItems:[], loopReview:[],
    wants:[], objections:[], budget:{stated:'',paying:'',note:''}, commitments:[], people:[],
    temperature:{read:'',why:''}, nextStep:{what:'',who:'',when:''} } }) };
  return { ok:false, status:500, json: async () => ({}), text: async () => '' };
};

const out = await esbuild.build({ entryPoints:[path.join(root,'src/App.jsx')], bundle:true, write:false, format:'esm', jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')})); } }],
 logLevel:'silent' });
fs.writeFileSync(path.join(here,'.bps.mjs'), out.outputFiles[0].text);
const mod = await import('./.bps.mjs?v=' + Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const rootEl = createRoot(document.getElementById('root'));
await act(async () => { rootEl.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 140)); });

const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles:true })); }); };
const settle = async (ms = 100) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const btn = re => [...document.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
const btns = re => [...document.querySelectorAll('button')].filter(b => re.test(b.textContent || ''));
const txt = () => document.body.textContent || '';

console.log('\n"Your day" does not call a queue of recordings a clear day');
{
  ok('the dashboard rendered', /Your day/.test(txt()), txt().slice(0, 160));
  ok('it does NOT say nothing is waiting', !/Nothing waiting on you/.test(txt()));
  ok('the recording is listed', /Recordings to work through/.test(txt()));
  ok('by name', /Sunday with Logan/.test(txt()));
  ok('with Pocket\'s summary, which cost nothing', /Pricing, the Alvarez account/.test(txt()));
}

console.log('\nopening it loads the recording — and only then the transcript');
{
  ok('the list never carried the transcript', !txt().includes(TRANSCRIPT_SENTINEL));
  const open = btn(/Sunday with Logan/);
  ok('the recording is clickable', !!open);
  if (open) await click(open); await settle(160);
  ok('the screen opened', /What came out of this/.test(txt()), txt().slice(0, 200));
  ok('the full row was fetched separately', globalThis.__POCKET_LOADS__.includes('rec_sunday'));
  ok('nothing has been made from it yet', /Nothing made from this recording yet/.test(txt()));
}

console.log('\nDeep extract spends nothing until it is pressed');
{
  const before = globalThis.__FETCHES__.filter(f => f.url.includes('pocket-segment')).length;
  ok('no segmentation call on open', before === 0, before);
  const go = btn(/Deep extract/);
  ok('the button is there', !!go);
  if (go) await click(go); await settle(200);
  const after = globalThis.__FETCHES__.filter(f => f.url.includes('pocket-segment')).length;
  ok('exactly one call after pressing', after === 1, after);
  ok('two proposals rendered', /Proposed · 2/.test(txt()), txt().slice(0, 200));
  ok('nothing is filed yet', /nothing is filed until you press Create/.test(txt()));
  ok('the result was cached so reopening does not re-spend', globalThis.__POCKET_PROPOSALS__.length === 1);
  ok('creating nothing wrote nothing', globalThis.__MLOG_WRITES__.length === 0 && globalThis.__KB_WRITES__.length === 0);
}

console.log('\ncreating a client output — one row, right kind, NO transcript');
{
  const create = btns(/Create it/)[0];
  ok('the first proposal has a Create button', !!create);
  if (create) await click(create); await settle(220);

  ok('exactly one meeting log written', globalThis.__MLOG_WRITES__.length === 1, globalThis.__MLOG_WRITES__.length);
  const w = globalThis.__MLOG_WRITES__[0] || {};
  ok('kind is client', w.kind === 'client', w.kind);
  ok('filed on the right lead', w.leadId === 'l_rita', w.leadId);
  ok('THE TRANSCRIPT IS EMPTY', w.transcript === '', JSON.stringify(w.transcript || '').slice(0, 120));
  ok('it carries the source recording id', w.sourcePocketId === 'rec_sunday', w.sourcePocketId);
  ok('and the locator, as provenance', w.sourceSegment && w.sourceSegment.start === '12:30', JSON.stringify(w.sourceSegment));
  ok('the deep read ran on the SEGMENT, not the whole recording', (() => {
    const c = globalThis.__FETCHES__.filter(f => f.url.includes('/api/meeting-log')).pop();
    return c && !c.body.includes(TRANSCRIPT_SENTINEL) && c.body.includes('spreadsheet handoffs');
  })(), 'segment-only extraction call');
  ok('no write anywhere contains the transcript',
     [...globalThis.__MLOG_WRITES__, ...globalThis.__KB_WRITES__, ...globalThis.__WRITES__]
       .every(x => !JSON.stringify(x).includes(TRANSCRIPT_SENTINEL)));
}

console.log('\nthe outputs list is DERIVED — it appears without the recording being rewritten');
{
  await settle(140);
  ok('it now shows what came out', /Alvarez discovery|Alvarez wants the board/.test(txt()), txt().slice(0, 240));
  ok('no longer says nothing was made', !/Nothing made from this recording yet/.test(txt()));
  ok('the recording row was never written to record it',
     globalThis.__POCKET_PROPOSALS__.length === 1 && globalThis.__POCKET_STATUS__.length === 0);
}

console.log('\ncreating a Playbook output writes an UNPUBLISHED draft, not a published note');
{
  const create = btns(/Create it/)[0];
  ok('the remaining proposal has a Create button', !!create);
  if (create) await click(create); await settle(200);
  ok('one kb note written', globalThis.__KB_WRITES__.length === 1, globalThis.__KB_WRITES__.length);
  const k = globalThis.__KB_WRITES__[0] || {};
  ok('it is a draft', (k.status || 'draft') === 'draft', k.status);
  ok('it carries the source recording', k.sourcePocketId === 'rec_sunday');
  ok('with the locator', k.sourceSegment && k.sourceSegment.start === '30:00');
  ok('and no transcript anywhere in it', !JSON.stringify(k).includes(TRANSCRIPT_SENTINEL));
  ok('publishing was NOT called', (globalThis.__KB_PUBLISHED__ || []).length === 0);
  ok('no further meeting log was written', globalThis.__MLOG_WRITES__.length === 1);
}

console.log('\nthe two Mark Kaufmanns, on a real proposal card');
{
  const manual = btn(/New output, by hand/);
  ok('a manual output can be started', !!manual);
  if (manual) await click(manual); await settle(140);
  const areas = [...document.querySelectorAll('textarea')];
  const box = areas[areas.length - 1];
  if (box) {
    const st = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => { st.call(box, 'Mark Kaufmann called about the listing.'); box.dispatchEvent(new dom.window.Event('input', { bubbles:true })); });
    await settle(120);
  }
  const lead = btn(/^\s*A lead\s*$/);
  if (lead) await click(lead); await settle(140);
  ok('it says two people match', /2 people match/.test(txt()), txt().slice(-600));
  ok('both are named', (txt().match(/Mark Kaufmann/g) || []).length >= 2);
  ok('nothing was filed by the ambiguity', globalThis.__MLOG_WRITES__.length === 1);
}

console.log('\nnon-client outputs call api/meeting-log ZERO times');
{
  /* THE COST ASSERTION. The seven-field deep read is the only thing in this
     feature that spends Anthropic tokens, and it exists to describe a PERSON.
     A business note, a Sunday meeting and a Playbook draft have no person, so
     they must not trigger it — and the failure mode is invisible: everything
     still works, it just quietly bills on every output.

     Asserted on the outbound fetch, not on rows written. Asserting rows would
     pass even if the call fired and its result was thrown away, which is
     exactly the bug worth catching. */
  const extractCalls = () => globalThis.__FETCHES__.filter(f => f.url.includes('/api/meeting-log')).length;
  const before = extractCalls();
  ok('the client output earlier DID spend once', before === 1, before);

  const setInput = async (el, v) => {
    const st = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { st.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles:true })); });
  };
  const setArea = async (el, v) => {
    const st = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => { st.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles:true })); });
  };

  const makeOne = async (destLabel, title, body) => {
    const fresh = btn(/New output, by hand/);
    if (fresh) await click(fresh); await settle(120);
    const d = btn(new RegExp('^\\s*' + destLabel + '\\s*$'));
    if (d) await click(d); await settle(120);
    const ti = [...document.querySelectorAll('input[placeholder="Title"]')].pop();
    if (ti) await setInput(ti, title);
    const bx = [...document.querySelectorAll('textarea')].pop();
    if (bx) await setArea(bx, body);
    await settle(120);
    const go = btns(/Create it/).pop();
    ok('  ' + destLabel + ': Create is available', !!go && !go.disabled);
    if (go) await click(go); await settle(200);
  };

  await makeOne('Business note', 'Vendor quirk', 'The title company will not send the CD before noon.');
  ok('a business note was written', globalThis.__MLOG_WRITES__.some(w => w.kind === 'note'),
     globalThis.__MLOG_WRITES__.map(w => w.kind).join(','));
  ok('  and it spent NOTHING', extractCalls() === before, extractCalls());

  await makeOne('Sunday meeting', 'Sunday cadence', 'We decided to move the huddle to Monday morning.');
  ok('a Sunday meeting was written', globalThis.__MLOG_WRITES__.some(w => w.kind === 'internal'),
     globalThis.__MLOG_WRITES__.map(w => w.kind).join(','));
  ok('  and it spent NOTHING', extractCalls() === before, extractCalls());

  const kbBefore = globalThis.__KB_WRITES__.length;
  await makeOne('Playbook draft', 'Rate lock, second pass', 'Ask what the lock expiry is before you answer.');
  ok('a Playbook draft was written', globalThis.__KB_WRITES__.length === kbBefore + 1);
  ok('  and it spent NOTHING', extractCalls() === before, extractCalls());

  /* This block plus the two outputs created earlier is the plan's "one
     recording, several outputs" case: five outputs, four tables' worth of
     shapes, one source. */
  ok('one recording now has five outputs', globalThis.__MLOG_WRITES__.length + globalThis.__KB_WRITES__.length === 5,
     `${globalThis.__MLOG_WRITES__.length} logs + ${globalThis.__KB_WRITES__.length} kb`);
  ok('every one of them names the source recording',
     [...globalThis.__MLOG_WRITES__, ...globalThis.__KB_WRITES__].every(w => w.sourcePocketId === 'rec_sunday'));
  ok('and NOT ONE of them carries the transcript',
     [...globalThis.__MLOG_WRITES__, ...globalThis.__KB_WRITES__].every(w => !JSON.stringify(w).includes(TRANSCRIPT_SENTINEL)));
  ok('total spend across five outputs is one call, for the one with a person on it',
     extractCalls() === 1, extractCalls());
}

console.log('\nmarking it done takes it out of the queue');
{
  const done = btn(/Done with it/);
  ok('the button is there', !!done);
  if (done) await click(done); await settle(160);
  ok('the status change was written', globalThis.__POCKET_STATUS__.some(s => s.id === 'rec_sunday' && s.status === 'done'),
     JSON.stringify(globalThis.__POCKET_STATUS__));
  ok('and the screen closed back to the dashboard', /Your day/.test(txt()));
  ok('the queue no longer lists it', !/Recordings to work through/.test(txt()));
}

console.log('\nthe Pocket import panel in Settings');
{
  /* rec_sunday is already in the CRM at this point (it was imported by the
     webhook fixture and then marked done), so this also covers the case the
     whole backfill design rests on: importing something already here is a
     refresh, not a duplicate. */
  const nav = [...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === 'Settings');
  if (nav) await click(nav); await settle(200);
  ok('Settings opened', /Sections/.test(txt()), txt().slice(0, 160));
  ok('the Pocket panel is there', /predate it/.test(txt()), 'panel copy');
  ok('it says re-running is safe', /never duplicated/.test(txt()));

  const before = globalThis.__FETCHES__.filter(f => f.url.includes('pocket-backfill')).length;
  ok('nothing was called just by opening Settings', before === 0);
  /* A DELTA, not a fixed count. Asserting "exactly one log and one note"
     couples this to how many outputs earlier blocks happened to make, and it
     broke the moment another one was added. What matters is that importing
     writes no outputs, whatever exists already. */
  const outsBefore = globalThis.__MLOG_WRITES__.length + globalThis.__KB_WRITES__.length;

  const go = btn(/Import recent recordings/);
  ok('the button is there', !!go);
  if (go) await click(go); await settle(400);

  const calls = globalThis.__FETCHES__.filter(f => f.url.includes('pocket-backfill'));
  const actions = calls.map(c => JSON.parse(c.body).action);
  ok('it listed once, then imported one at a time',
     actions[0] === 'list' && actions.filter(a => a === 'import').length === 2, actions.join(','));
  ok('  which is what stops a long transcript timing the function out', actions.length === 3);

  ok('the one already in the CRM reports as already here', /Already here/.test(txt()), txt().slice(-400));
  ok('the new one reports as imported', /Imported/.test(txt()));
  ok('both are named', /Sunday with Logan/.test(txt()) && /Older call/.test(txt()));
  ok('importing wrote no outputs of any kind',
     globalThis.__MLOG_WRITES__.length + globalThis.__KB_WRITES__.length === outsBefore,
     `${outsBefore} before, ${globalThis.__MLOG_WRITES__.length + globalThis.__KB_WRITES__.length} after`);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
try { await act(async () => rootEl.unmount()); dom.window.close(); } catch {}
process.exit(fail ? 1 : 0);
