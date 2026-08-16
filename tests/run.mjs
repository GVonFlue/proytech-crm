import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','navigator','HTMLElement','Element','Node','Event','CustomEvent',
  'getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','location','history','MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); }
  catch { /* read-only host global (navigator) — jsdom's is close enough via window */ }
}
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.fetch = async () => ({ ok:false, status:500, json: async()=>({}), text: async()=>'' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__WRITES__ = [];

/* ---- the exact shape of the bug, as reported ----
   1) a legacy 'Booked' activity from before meeting records existed
   2) a meeting logged from the composer: start === createdAt, logged:true
   3) a real scheduled meeting in the future  (control)
   4) a real past meeting with no status      (control — should stay Needs status) */
const iso = d => new Date(d).toISOString();
/* Deliberately inside the CURRENT month, not a flat 3 days back. The drilldown
   is month-scoped by default, so on the 1st or 2nd of a month a "3 days ago"
   fixture lands in the previous month and every past-dated tab reads 0 —
   a calendar artifact that looks exactly like a broken filter. */
const daysBack = Math.min(3, Math.max(0, new Date().getDate() - 1));
const past = iso(Date.now() - daysBack*864e5);
const future = iso(Date.now() + 3*864e5);
const longPast = iso(Date.now() - (daysBack + 7)*864e5);   // only used for createdAt, month doesn't matter
globalThis.__LEADS__ = [
  { id:'l1', name:'Legacy Booked', company:'Legacy Booked', stage:'new', createdAt:longPast,
    activities:[{ id:'a1', ts:past, type:'Booked', mtype:'Coffee', text:'Coffee booked.', who:'Garrett' }], meetings:[] },
  { id:'l2', name:'Composer Logged', company:'Composer Logged', stage:'new', createdAt:longPast,
    activities:[{ id:'a2', ts:past, type:'Booked', mtype:'Coffee', meetingId:'m2', text:'Coffee booked.', who:'Garrett' }],
    meetings:[{ id:'m2', title:'Coffee with x', mtype:'Coffee', start:past, end:past, status:'', createdAt:past, logged:true }] },
  { id:'l3', name:'Real Future', company:'Real Future', stage:'new', createdAt:longPast, activities:[],
    meetings:[{ id:'m3', title:'Pitch', mtype:'Proposal / Pitch', start:future, end:future, status:'', createdAt:iso(Date.now()) }] },
  { id:'l4', name:'Real Past', company:'Real Past', stage:'new', createdAt:longPast, activities:[],
    meetings:[{ id:'m4', title:'Pitch', mtype:'Proposal / Pitch', start:past, end:past, status:'', createdAt:longPast }] },
];

const entry = process.argv[2] || 'src/App.jsx';
const out = await esbuild.build({
  entryPoints:[entry], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'], define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub-supabase', setup(b){
    b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('t/stub-supabase.js') }));
  }}], logLevel:'silent',
});
const code = out.outputFiles[0].text;
fs.writeFileSync('t/.bundle.mjs', code);
const mod = await import('./.bundle.mjs?v=' + Date.now());

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 60)); });

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const txt = () => document.body.textContent || '';
const byText = (sel, re) => [...document.querySelectorAll(sel)].filter(e => re.test(e.textContent || ''));
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles:true })); }); };

console.log('\nsigned-in render');
ok('no blank screen', txt().length > 400, `len=${txt().length}`);
ok('dashboard mounted', /Welcome|whole board at a glance/i.test(txt()));

console.log('\nMeetings Booked tile');
const tile = byText('.kcard, .kpi, [class*="kcard"]', /Meetings Booked/i)[0]
  || [...document.querySelectorAll('div')].filter(e => /Meetings Booked/.test(e.textContent||'') && (e.className||'').includes('k')).pop();
ok('tile present', !!tile);
const tileTxt = tile ? tile.textContent : '';
ok('tile reports 1 upcoming', /1 upcoming/.test(tileTxt), tileTxt);
ok('tile reports 2 needing a date', /2 need a date/.test(tileTxt), tileTxt);

if (tile) {
  await click(tile);
  console.log('\nmeetings drilldown');
  const tabs = [...document.querySelectorAll('.mtab')].map(b => b.textContent.trim());
  ok('Needs a date tab exists', tabs.some(t => /Needs a date/.test(t)), tabs.join(' | '));
  const tabTxt = tabs.join(' | ');
  ok('Upcoming = 1', /Upcoming1/.test(tabTxt.replace(/\s/g,'')), tabTxt);
  ok('Needs status = 1 (only the real past meeting)', /Needsstatus1/.test(tabTxt.replace(/\s/g,'')), tabTxt);
  ok('Needs a date = 2', /Needsadate2/.test(tabTxt.replace(/\s/g,'')), tabTxt);

  const needsTab = [...document.querySelectorAll('.mtab')].find(b => /Needs status/.test(b.textContent));
  await click(needsTab);
  ok('Needs status shows only Real Past', /Real Past/.test(txt()) && !/Legacy Booked/.test(document.querySelector('.drill, [class*="drill"]')?.textContent || txt()));

  const dateTab = [...document.querySelectorAll('.mtab')].find(b => /Needs a date/.test(b.textContent));
  await click(dateTab);
  const rows = [...document.querySelectorAll('.mtg-drow')];
  ok('two undated rows render', rows.length === 2, 'rows=' + rows.length);
  ok('rows say no date set', /no date set/.test(txt()));
  ok('rows do NOT ask did this happen', !rows.some(r => /did this happen/.test(r.textContent)));
  ok('no Held/No-show buttons on undated rows', !rows.some(r => r.querySelector('.ms-b')));
  const picker = document.querySelector('.mtg-fix input[type=datetime-local]');
  ok('date picker present', !!picker);

  if (picker) {
    console.log('\nsetting a date');
    /* the drilldown is month-scoped by default, so pick a date INSIDE this
       month — otherwise the newly dated meeting correctly leaves the view and
       the counts look wrong when they aren't. */
    const pad = n => String(n).padStart(2,'0');
    const t0 = new Date(Date.now() + 2*864e5);
    if (t0.getMonth() !== new Date().getMonth()) t0.setTime(Date.now() + 2*36e5);
    const chosen = `${t0.getFullYear()}-${pad(t0.getMonth()+1)}-${pad(t0.getDate())}T10:00`;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
    await act(async () => { setter.call(picker, chosen);
      picker.dispatchEvent(new dom.window.Event('input',{bubbles:true})); });
    const btn = [...document.querySelectorAll('.mtg-fix button')].find(b => /Set date/.test(b.textContent));
    ok('Set date button present', !!btn);
    if (btn) {
      await click(btn);
      const w = globalThis.__WRITES__.at(-1);
      ok('a lead was written', !!w, JSON.stringify(globalThis.__WRITES__.length));
      const mt = w && (w.meetings||[])[0];
      ok('dateUnknown written as false', mt && mt.dateUnknown === false, JSON.stringify(mt||{}).slice(0,200));
      ok('start moved to the chosen date', mt && mt.start === chosen + ':00', mt && mt.start);
      ok('end is 30 min later by default', mt && /T10:30:00$/.test(mt.end), mt && mt.end);
      ok('start no longer equals createdAt', mt && mt.start !== mt.createdAt);
      const tabs2 = [...document.querySelectorAll('.mtab')].map(b=>b.textContent.replace(/\s/g,'')).join('|');
      ok('it left Needs a date', /Needsadate1/.test(tabs2), tabs2);
      ok('it moved into Upcoming', /Upcoming2/.test(tabs2), tabs2);
      ok('it did NOT land in Needs status', /Needsstatus1/.test(tabs2), tabs2);
      const allTime = [...document.querySelectorAll('.mtab-time button')].find(b=>/All time/.test(b.textContent));
      await click(allTime);
      const tabs3 = [...document.querySelectorAll('.mtab')].map(b=>b.textContent.replace(/\s/g,'')).join('|');
      ok('all-time scope agrees', /Upcoming2/.test(tabs3) && /Needsadate1/.test(tabs3), tabs3);
    }
  }
}

console.log('\nother pages still render');
for (const nav of ['Leads','Pipeline','Follow-Up','Activity','Monday Huddle','Clients','The Books','Money','Tasks','Leaderboard','Settings']) {
  const b = [...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e => (e.textContent||'').trim() === nav);
  if (!b) continue;
  await click(b);
  ok(nav + ' renders', (document.body.textContent||'').length > 300);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
