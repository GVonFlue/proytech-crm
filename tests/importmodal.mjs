/* The CSV import modal with a WIDE file.

   THE BUG: .modal is a flex COLUMN with max-height:90vh and overflow:hidden.
   A flex item defaults to min-height:auto, which refuses to shrink below its
   own content — so a tall body grew straight past the modal and .modal clipped
   it. There was no scrollbar anywhere, on the modal or the body, so everything
   below the fold was UNREACHABLE rather than merely off-screen. At 21 columns
   the mapping grid put the Import button there and the modal could not be
   submitted at all.

   WHAT THIS FILE CAN AND CANNOT ASSERT. jsdom has no layout engine, so "is the
   button on screen" is not a question it can answer — every getBoundingClientRect
   is a stub. What it CAN do is resolve computed styles from the app's own
   stylesheet, and report the DOM structure. So reachability is asserted as the
   two things that actually produce it:

     1. the scrolling body really computes to min-height:0 + overflow-y:auto,
        so its overflow is reachable rather than clipped; and
     2. the Import button is not inside that body at all — it lives in a
        flex:none footer pinned as a sibling, so no amount of content above it
        can push it anywhere.

   Neither is a proxy for the fix. Together they are the fix.                */
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
/* /api/import-leads deliberately fails, so the mapping comes from guessField()
   and not from a model. A test that depends on an AI answer is a test that
   fails for reasons unrelated to what it is checking. */
globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok:true, json: async () => ({ connected:false, email:'' }) }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 260) : '')); } };

/* 21 columns — the width that made the modal unsubmittable. */
const COLS = ['Name','Company','Phone','Email','Website','Business Type','Source','Notes',
  'Email Address','Extra Notes','Region','Rating','Tag A','Tag B','Tag C','Tag D',
  'Ref','Score','Segment','Owner Hint','Last Touch'];
const CSV = [COLS.join(','), COLS.map((_,i)=>'v'+i).join(','), COLS.map((_,i)=>'w'+i).join(',')].join('\n');

globalThis.__USERS__ = [{ id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, active:true, tabs:[], goal_conversions:0, nav_order:[] }];
globalThis.__LEADS__ = [];
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
globalThis.__SETTINGS__ = null; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bim.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 90) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const setTA = async (el, v) => { const st = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;
  await act(async () => { st.call(el, v); el.dispatchEvent(new dom.window.Event('input',{bubbles:true})); });
  /* React's onBlur is delegated from focusout, NOT blur — blur does not bubble,
     so dispatching it never reaches the handler and ingest() never runs. */
  await act(async () => { el.dispatchEvent(new dom.window.Event('focusout',{bubbles:true})); }); await settle(200); };
const pickSel = async (sel, v) => { const st = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  await act(async () => { st.call(sel, v); sel.dispatchEvent(new dom.window.Event('change',{bubbles:true})); }); await settle(40); };

const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./.bim.mjs?v=' + Date.now())).default)); });
await settle(160);

const btn = re => [...el.querySelectorAll('button')].find(b => re.test((b.textContent || '').trim()));
const nav = async l => { const b = [...el.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const cs = node => dom.window.getComputedStyle(node);

/* ---- open the modal on a 21-column paste ------------------------------- */
await nav('Leads');
await click(btn(/^Import$/));
await settle(60);
const modal = el.querySelector('.modal');
ok('the import modal opened', !!modal);
await setTA(modal.querySelector('textarea'), CSV);

console.log('\nthe wide file really is wide');
{
  const rowsN = el.querySelectorAll('.imp-map .imp-row').length;
  ok('all 21 columns get a mapping row', rowsN === 21, rowsN + ' mapping rows');
}

console.log('\nIMPORT IS REACHABLE — the requirement');
{
  const m = el.querySelector('.modal');
  const body = m.querySelector('.m-scroll');
  const foot = m.querySelector('.m-foot');
  const imp = [...m.querySelectorAll('button')].find(b => /^Import \d+ leads?$/.test((b.textContent||'').trim()));

  ok('the Import button exists at 21 columns', !!imp,
     [...m.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).join(' | '));

  /* 1. the body's overflow is reachable rather than clipped */
  ok('the modal body scrolls', !!body && cs(body).overflowY === 'auto', body && cs(body).overflowY);
  ok('  and can shrink below its content — the half that was missing',
     !!body && cs(body).minHeight === '0px', body && cs(body).minHeight,);

  /* the constraint that makes the above necessary, asserted so the test still
     means something if someone removes it */
  /* jsdom resolves 90vh to px, so assert the cap EXISTS rather than its unit */
  ok('the modal is still a height-capped flex column that hides overflow',
     cs(m).flexDirection === 'column' && cs(m).overflow === 'hidden'
       && !!cs(m).maxHeight && cs(m).maxHeight !== 'none',
     [cs(m).flexDirection, cs(m).overflow, cs(m).maxHeight].join(' / '));

  /* 2. the button is not in the scrolling region at all */
  ok('the Import button is NOT inside the scrolling body', !!body && !body.contains(imp),
     'it can be scrolled out of reach if it lives there');
  ok('  it is in a pinned footer', !!foot && foot.contains(imp));
  ok('  which is a direct child of the modal, beside the body',
     !!foot && foot.parentElement === m && !!body && body.parentElement === m);
  ok('  and never shrinks', !!foot && cs(foot).flexGrow === '0' && cs(foot).flexShrink === '0',
     foot && [cs(foot).flexGrow, cs(foot).flexShrink].join('/'));
}

console.log('\nthe fix is shared, not local to this modal');
{
  /* One inline style was repeated across four modals and every one of them had
     the bug. Encoding the count stops a fifth being added with it. */
  const src = fs.readFileSync('src/App.jsx','utf8');
  ok('no modal still uses the unscrollable inline body',
     !src.includes("padding:'4px 22px 22px'"), 'an inline modal body survived');
  const n = (src.match(/className="m-scroll"/g)||[]).length;
  ok('all four shared-shell modals use .m-scroll', n === 4, n + ' uses of .m-scroll');
  ok('  and .m-foot is defined once, not re-declared per modal',
     (src.match(/^\.m-foot\{/gm)||[]).length === 1, (src.match(/^\.m-foot\{/gm)||[]).length + ' definitions');
}

console.log('\ntwo columns onto one field');
{
  const m = el.querySelector('.modal');
  const sels = [...m.querySelectorAll('.imp-map .imp-row select')];
  /* Notes CONCATENATES in buildLead — that is a feature and must not be
     dressed as data loss. */
  await pickSel(sels[7], 'note');
  await pickSel(sels[9], 'note');
  const note = [...m.querySelectorAll('.imp-note')].map(n=>n.textContent||'').join(' ');
  ok('two columns onto Notes says they are joined', /joined with/.test(note), note);
  ok('  and names both columns', /Notes/.test(note) && /Extra Notes/.test(note), note);
  ok('  in the neutral style, because nothing is lost', !!m.querySelector('.imp-note'));

  /* Email does NOT concatenate — f[t]=v, so the last column silently wins. */
  await pickSel(sels[3], 'email');
  await pickSel(sels[8], 'email');
  const warn = [...m.querySelectorAll('.imp-warn')].map(n=>n.textContent||'').join(' ');
  ok('two columns onto Email warns that it is not supported',
     /not supported/.test(warn), warn);
  ok('  and names which one survives', /only/.test(warn) && /Email Address/.test(warn), warn);
  ok('  in the warning style, because a column is being dropped',
     [...m.querySelectorAll('.imp-warn')].some(n=>/Email/.test(n.textContent||'')));
}

console.log('\nthe sponsor toggle');
{
  const label = el.querySelector('.spon-tog');
  ok('the toggle is there', !!label);
  /* .spon-tog is inline-flex with gap:8px. A bare text node beside <b> makes
     each a separate flex item, so the gap lands ON TOP of the space already in
     the text and reads as a double space. One <span> = one flex item = one
     space. */
  const bare = [...label.childNodes].filter(n => n.nodeType === 3 && (n.textContent||'').trim());
  ok('its text is one flex item, not a bare text node beside <b>',
     bare.length === 0, bare.map(n=>JSON.stringify(n.textContent)).join(' '));
  ok('  the wording is unchanged', /Mark all imported leads as potential sponsors/.test(label.textContent||''),
     label.textContent);
  ok('  and there is genuinely no double space in it', !/ {2}/.test(label.textContent||''),
     JSON.stringify(label.textContent));
}

console.log('\nit still imports');
{
  const m = el.querySelector('.modal');
  const imp = [...m.querySelectorAll('button')].find(b => /^Import \d+ leads?$/.test((b.textContent||'').trim()));
  await click(imp); await settle(160);
  ok('clicking Import writes the rows', (globalThis.__MANY__||[]).length > 0 || (globalThis.__WRITES__||[]).length > 0,
     JSON.stringify((globalThis.__WRITES__||[]).map(w=>w.name)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
