/* WHAT THIS APP WRITES, as a stable fingerprint.
   ============================================================================

   A pure refactor is only pure if the bytes reaching the database do not move.
   This file drives the real app through a fixed sequence of write paths,
   captures everything the stub records, normalises away the parts that are
   allowed to differ between two runs, and prints a digest.

   Run it on the commit before a refactor and on the commit after. The digests
   must match. If they do not, the diff below the digest names the write that
   changed.

     node tests/writefingerprint.mjs > /tmp/before.txt   # on main
     node tests/writefingerprint.mjs > /tmp/after.txt    # on the branch
     diff /tmp/before.txt /tmp/after.txt

   WHAT IS NORMALISED, AND WHY EACH ONE IS ALLOWED TO MOVE:
     · uid()          Date.now + Math.random. A new id every run by design.
     · ISO timestamps new Date() at write time.
     · today's date   any YYYY-MM-DD equal to today, for the same reason.
   Nothing else is touched. Amounts, types, field names, ORDER of writes, the
   text of activity lines and the shape of every patch are all compared exactly,
   because all of them are behaviour.

   It is deliberately NOT an assertion file. It has no expected values baked in
   — a fingerprint that encodes today's behaviour would have to be regenerated
   for every legitimate change, and a file you regenerate without reading is a
   file that proves nothing.
   ========================================================================== */
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
  ? { ok:true, json: async () => ({ connected:true, email:'gvonflue@gmail.com' }) }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };
/* every prompt/confirm answered the same way on both runs */
dom.window.prompt = () => '2026-08-21';
dom.window.confirm = () => true;
dom.window.alert = () => {};

const iso = d => new Date(d).toISOString();
const ago = n => iso(Date.now() - n * 864e5);
const TODAY = new Date();
const todayStr = `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}-${String(TODAY.getDate()).padStart(2,'0')}`;

const STAGES = [
  { key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
  { key:'proposal', label:'Proposal Sent', color:'#C8A24A', prob:.7, open:true, won:false, lost:false },
  { key:'signed', label:'Signed', color:'#1F9D55', prob:1, open:false, won:true, lost:false },
  { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
  { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true },
];
const SETTINGS = { modules:['dash','leads','rels','settings'], modulesV:9, stages:STAGES,
  options:{}, pools:['General'], retainerStartCleared:'2026-01-01T00:00:00.000Z' };
const LEAD = {
  id:'L1', name:'Sarah Chen', company:'Chen Realty', businessType:'Real Estate',
  stage:'proposal', priority:'high', source:'Referral', owner:'Garrett', owner_id:'u_owner',
  phone:'3165551234', email:'sarah@chenrealty.com', website:'chenrealty.com',
  createdAt:ago(60), followUp:'2026-09-01', nextAction:'Follow Up Call',
  dealValue:3500, deals:[{ id:'d1', label:'Website build', setup:3500, website:'', integration:'', extras:[] }],
  payments:[], serviceInterest:[], labels:[], custom:{},
  meetings:[{ id:'m1', title:'Coffee', mtype:'Coffee', start:ago(9), end:ago(9), status:'',
              setBy:'Garrett', setById:'u_owner', createdAt:ago(12) }],
  activities:[{ id:'a1', ts:ago(1), type:'Call', text:'Ran through the proposal.', who:'Garrett' }],
};
const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bwf.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) return false;
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); return true; };
const settle = async (ms = 110) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const setV = async (el, v, tag='TEXTAREA') => { if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  await act(async () => { el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input', { bubbles: true })); });
  await settle(60);
};

globalThis.__USERS__ = [OWNER]; globalThis.__TEAM__ = [{ id:'u_owner', name:'Garrett', role:'owner' },
  { id:'u_l', name:'Logan', role:'owner' }];
globalThis.__LEADS__ = [JSON.parse(JSON.stringify(LEAD))];
globalThis.__SETTINGS__ = SETTINGS;
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];

const el = document.getElementById('root');
const root = createRoot(el);
const mod = await import('./.bwf.mjs?v=' + Date.now());
await act(async () => { root.render(React.createElement(mod.default)); });
await settle(180);

const q = s => el.querySelector(s);
const qa = s => [...el.querySelectorAll(s)];
const btn = re => qa('button').find(b => re.test((b.textContent || '').trim()));
const nav = async l => { const b = qa('.nav-i').find(e => (e.textContent||'').trim() === l); if (b) { await click(b); await settle(); } };

/* ---- the sequence. Every step is a WRITE PATH through the lead view. ---- */
await nav('Leads');
await click(qa('tbody tr').find(r => /Sarah Chen/.test(r.textContent || '')));
await settle(170);

/* 1. change a field on the record */
await setV(qa('.m-facts select')[1], 'low');                       // priority picker
/* 2. log a call from the composer */
await click(q('.compose-open')); await settle(90);
await setV(q('.act-input'), 'Fingerprint call');
await click(btn(/^Log Call$/)); await settle(120);
/* 3. tag a colleague on a note */
await click(q('.compose-open')); await settle(80);
await click(qa('.act-t').find(b => /^Note$/.test((b.textContent||'').trim()))); await settle(60);
await setV(q('.act-input'), 'Fingerprint note');
const chip = qa('.tagchip')[0]; if (chip) await click(chip);
await click(btn(/^Log Note$/)); await settle(120);
/* 4. the one-tap park — stage + follow-up + activity in a single patch */
if (q('.notnow')) { await click(q('.notnow')); await settle(130); }
/* 5. a key date */
const kd = q('.kd-add input[type="date"]');
if (kd) { await setV(kd, '1984-11-04'); const add = qa('.kd-add button')[0]; if (add) { await click(add); await settle(110); } }
/* 6. a label */
const lbl = qa('.lblchip').find(b => !b.classList.contains('add'));
if (lbl) { await click(lbl); await settle(110); }
/* 7. open the Deal section and log a payment */
for (const h of qa('.msec:not(.open) .msec-h')) { await click(h); await settle(35); }
const payAdd = btn(/Log a payment/); if (payAdd) { await click(payAdd); await settle(140); }

/* ---- normalise and print ------------------------------------------------ */
const UID = /\b[0-9a-z]{8,9}[0-9a-z]{5}\b/g;                       // uid(): base36 time + random
const norm = v => {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o;
  }
  if (typeof v === 'string') {
    let s = v;
    s = s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<TS>');
    s = s.split(todayStr).join('<TODAY>');
    s = s.replace(UID, '<ID>');
    return s;
  }
  return v;
};
const writes = (globalThis.__WRITES__ || []).map(w => norm(w));
const settingsW = (globalThis.__SETTINGS_WRITES__ || []).map(w => norm(w));

console.log('WRITE FINGERPRINT');
console.log('lead writes:     ' + writes.length);
console.log('settings writes: ' + settingsW.length);
console.log('');
writes.forEach((w, i) => {
  console.log(`--- lead write ${i + 1} ---`);
  console.log(JSON.stringify(w, null, 1));
});
settingsW.forEach((w, i) => {
  console.log(`--- settings write ${i + 1} ---`);
  console.log(JSON.stringify(w, null, 1));
});
await act(async () => root.unmount());
dom.window.close();
process.exit(0);
