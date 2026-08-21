/* PR 5 — Tony's lead view is its own screen, not Garrett's with tiles removed.
   ============================================================================

   TWO CLAIMS, AND THE SECOND IS THE ONE THAT MATTERS IF IT IS EVER WRONG.

   IT IS COMPOSED, NOT REDACTED. The owner's Commission block — rate, base,
   approve, void — does not exist for a rep. Rather than leaving the gap where
   it was, what he DOES have is gathered under one heading: his cut and the
   appointments he set on this lead. The test checks the heading only appears
   when there is something under it, and that no section renders as an empty
   shell, because an empty shell IS the hole.

   NOTHING OWNER-ONLY REACHES HIM. Asserted by signing in AS TONY and reading
   the whole rendered screen — every section opened — for the things that must
   never be on it: another rep's rate, the commission base, the approve and void
   controls, the pool picker, anyone else's pay. Not by reading the gates in the
   source and believing them.

   The figures are not recomputed for this screen. apptEarnings() is the same
   function RepPay and the Money page call, handed an array of one lead — so
   the number here and the number on his pay screen come from one place.
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
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 240) : '')); } };

const iso = d => new Date(d).toISOString();
const ago = n => iso(Date.now() - n * 864e5);

/* Tony owns this one. It carries HIS commission and THREE appointments he set:
   one held-not-approved, one approved, one cancelled (which pays nothing). */
const LEAD = {
  id:'l1', name:'Sarah Chen', company:'Chen Realty', businessType:'Real Estate',
  stage:'signed', priority:'high', source:'Referral', owner:'Tony Porter', owner_id:'u_owner',
  phone:'3165551234', email:'sarah@chenrealty.com', createdAt: ago(60),
  followUp:'2026-09-01', nextAction:'Follow Up Call', nextSteps:'Send the proposal',
  isClient:true, convertedAt: ago(20), closedAt: String(ago(20)).slice(0,10),
  dealValue:3500, deals:[{ id:'d1', label:'Website build', setup:3500, website:'', integration:'', extras:[] }],
  payments:[{ id:'p1', amount:1200, date:String(ago(10)).slice(0,10), note:'Square deposit' }],
  retainer:450, retainerActive:true, serviceInterest:[], labels:[], custom:{},
  commission:{ repId:'u_owner', repName:'Tony Porter', pct:10, base:3500, amount:350,
               status:'pending', convertedAt: ago(20) },
  onboarding:{ deposit_paid:{ done:null, due:null } }, clientPhase:'intake',
  meetings:[
    { id:'m1', title:'Discovery', mtype:'Discovery', start: ago(9), end: ago(9), status:'held',
      setBy:'Tony Porter', setById:'u_owner', heldBy:'Tony Porter', heldById:'u_owner', heldAt: ago(9), createdAt: ago(12) },
    { id:'m2', title:'Follow-up call', mtype:'Check-in', start: ago(20), end: ago(20), status:'held',
      setBy:'Tony Porter', setById:'u_owner', payRate:75, payApprovedAt: ago(4), createdAt: ago(22) },
    { id:'m3', title:'Cancelled one', mtype:'Coffee', start: ago(30), end: ago(30), status:'',
      setBy:'Tony Porter', setById:'u_owner', createdAt: ago(31) },
  ],
  activities:[
    { id:'a1', ts: ago(1), type:'Call', text:'Rang her about the build.', who:'Tony Porter' },
    { id:'a2', ts: ago(6), type:'Note', text:'Lead created.', who:'Garrett' },
  ],
};

/* users[0] is who is signed in. For a REP, RLS returns ONLY their own row —
   handing the test the whole table would be testing a database that does not
   exist, and would hide exactly the leak this file is looking for. */
const TONY = { id:'u_owner', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General'], commission_pct:10, appointment_rate:75, active:true,
  tabs:['dash','leads','meetings'], goal_conversions:0, nav_order:[] };
const GARRETT = { id:'u_boss', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const ROSTER = [{ id:'u_owner', name:'Tony Porter', role:'rep' }, { id:'u_boss', name:'Garrett', role:'owner' }];
const SETTINGS = { modules:['dash','leads','settings'], modulesV:9, options:{}, pools:['General','Test'],
  retainerStartCleared:'2026-01-01T00:00:00.000Z',
  stages:[{ key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
          { key:'signed', label:'Signed', color:'#1F9D55', prob:1, open:false, won:true, lost:false },
          { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
          { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true }] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.brv.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot(users, leadOverride) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users; globalThis.__TEAM__ = ROSTER;
  globalThis.__LEADS__ = [JSON.parse(JSON.stringify(leadOverride || LEAD))]; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.brv.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(200);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent||'').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async () => { await nav('Leads');
  const r = [...curEl.querySelectorAll('tbody tr')].find(x => /Sarah Chen/.test(x.textContent||''));
  if (!r) throw new Error('no row'); await click(r); await settle(190); };
/* Everything, opened. A gate that only holds because a section happens to be
   collapsed is not a gate. */
const openAll = async () => { for (const h of [...curEl.querySelectorAll('.msec:not(.open) .msec-h')]) { await click(h); await settle(40); } };
const T = () => (curEl.querySelector('.modal') || curEl).textContent || '';
const btn = re => [...curEl.querySelectorAll('button')].some(b => re.test((b.textContent||'').trim()));
const label = re => [...curEl.querySelectorAll('label')].some(l => re.test(l.textContent||''));

/* ==================================================================== */
console.log('\nsigned in as Tony — what he SHOULD see');
await boot([TONY]);
await openLead();
await openAll();
{
  ok('his own history', /Rang her about the build/.test(T()));
  ok('the composer, to log more', !!curEl.querySelector('.compose-open') || !!curEl.querySelector('.act-input'));
  ok('his follow-up, promoted in the prep rail',
     !!curEl.querySelector('.m-prep .fu-block'), 'no follow-up module in the prep rail');
  ok('  with the one-tap presets', curEl.querySelectorAll('.m-prep .fu-chip').length >= 4,
     curEl.querySelectorAll('.m-prep .fu-chip').length + ' presets');
  ok('his cut, as "Your commission"', /Your commission/.test(T()));
  ok('  and the amount', /\$350/.test(T()));
  ok('his appointments on this lead', /Your appointments/.test(T()));
  /* read the <b>, not the row text: "Appointments you set2" has no word
     boundary between the label and the number, so a \\b regex never matches */
  {
    const row=[...curEl.querySelectorAll('.cmsn-row')].find(r=>/Appointments you set/.test(r.textContent||''));
    const n=((row||{}).querySelector? row.querySelector('b') : null);
    ok('  the two that pay are counted, the cancelled one is not',
       !!n && (n.textContent||'').trim()==='2', n && n.textContent);
  }
  ok('  awaiting approval is separated from approved',
     /Awaiting approval/.test(T()) && /Approved/.test(T()));
  ok('  and it says where his full total lives', /your full total is on Your Pay/i.test(T()));
  ok('it is gathered under one heading', /Your work on this lead/.test(T()));
}

console.log('\nNOTHING OWNER-ONLY REACHES HIM');
{
  ok('no commission RATE field', !label(/Rate at conversion/) && !/Rate at conversion/.test(T()), T().slice(0,120));
  ok('no commission BASE field', !label(/Deal value used/) && !/Deal value used/.test(T()));
  ok('no Approve commission control', !btn(/Approve commission/));
  ok('no Void control', !btn(/^Void/));
  ok('no "Put back to pending"', !btn(/Put back to pending/));
  ok('no lead pool picker', !label(/Lead pool/));
  ok('no "Deal value entered by" audit line', !/Deal value entered by/.test(T()));
  ok('the Owner field is present but not editable',
     label(/^Owner$/) && [...curEl.querySelectorAll('input[disabled]')].length > 0);
  ok('no delete-lead control — a rep marks Lost instead', !btn(/Delete lead/) && btn(/Lost/));
  /* the roster gives him NAMES for tagging; it must never give him pay */
  ok('no other person\'s rate or pay anywhere on the screen',
     !/10%\s*(rate|commission rate)/i.test(T()) && !/appointment_rate/.test(T()));
  ok('  and no owner-only commission section at all', !/Rep\b.*Rate at conversion/s.test(T()));
}

console.log('\nthe layout closes up — no holes where the owner blocks were');
{
  const shells = [...curEl.querySelectorAll('.msec.open')].filter(sec => {
    const b = sec.querySelector('.msec-b');
    return b && !(b.textContent || '').trim();
  });
  ok('no section renders as an empty shell', shells.length === 0,
     shells.map(s => (s.querySelector('.msec-t')||{}).textContent).join(', '));
  const heads = [...curEl.querySelectorAll('.dh')].filter(h => {
    let n = h.nextElementSibling;
    return !n || !(n.textContent || '').trim();
  });
  ok('no heading is left with nothing under it', heads.length === 0,
     heads.map(h => (h.textContent||'').trim()).join(' | '));
}
{
  /* and the heading itself must not appear when there is nothing to gather */
  await boot([TONY], { id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new',
    owner:'Tony Porter', owner_id:'u_owner', createdAt: ago(3),
    meetings:[], deals:[], dealValue:0, activities:[], custom:{} });
  await openLead();
  ok('a lead with no cut and no appointments shows no "Your work" heading',
     !/Your work on this lead/.test(T()), 'the heading appeared with nothing under it');
}

console.log('\nthe owner still sees the owner\'s version');
{
  await boot([GARRETT, TONY]);
  await openLead(); await openAll();
  ok('the owner DOES get the commission controls', /Rate at conversion/.test(T()));
  ok('  and the approve control', btn(/Approve commission/));
  ok('  and the pool picker', label(/Lead pool/));
  ok('but NOT the rep-only blocks', !/Your work on this lead/.test(T()) && !/Your appointments/.test(T()));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
