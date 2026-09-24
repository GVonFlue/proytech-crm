import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { contrast, fresh, parseColor, luminance, MIN } from './contrast.mjs';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[]; globalThis.__CAL__=[]; globalThis.__TASKS__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

/* THE CLIENT DASHBOARD'S MONEY STRIP — every tile means one thing.

   The reported case: Chris Waipa bought one $2,499 website and paid $2,499.
   The dashboard read Lifetime $4,998, because Lifetime was cash PLUS
   closedDealsTotal — and a closed deal is booked value whose payment is already
   in the cash. It also read "0 deals" under $2,499 contracted, because
   dealsOf() only counts OPEN deals.

   Lifetime is labelled "collected, all time", so it is asserted against the
   money that actually arrived, setup and retainer both, and nothing else. */
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
const client=o=>({stage:'signed',owner:'Garrett',isClient:true,convertedAt:'2026-08-17',createdAt:ago(60),
  activities:[],meetings:[],deals:[],dealValue:0,...o});
globalThis.__LEADS__=[
  /* one closed deal, paid in full — the reported record */
  client({id:'l1',name:'Chris Waipa',company:'Mortgage Punk',clientPhase:'build',
    closedDeals:[{id:'c1',label:'Website',amount:2499,closedAt:'2026-08-17'}],
    payments:[{id:'p1',amount:2499,date:'2026-08-17'}]}),
  /* two closed deals, one paid, plus retainer cash: lifetime is every dollar in */
  client({id:'l2',name:'Two Deal',company:'Two Co',clientPhase:'active',
    closedDeals:[{id:'c2',label:'Website',amount:2000},{id:'c3',label:'Business Suite',amount:3000}],
    payments:[{id:'p2',amount:2000,date:'2026-07-01'}],
    retainer:299, retainerActive:true, retainerStart:'2026-08-01',
    retainerPayments:[{id:'r1',amount:299,date:'2026-08-01'}]}),
  /* an open lead with a deal and nothing paid: it has bought nothing */
  {id:'l3',name:'Open Lead',company:'Open Co',stage:'discovery',owner:'Garrett',createdAt:ago(5),
    activities:[],meetings:[],deals:[{id:'d1',label:'Business Suite',setup:3500}],dealValue:3500,payments:[]},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bcmoney.mjs',out.outputFiles[0].text);
const mod=await import('./.bcmoney.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,80));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===l); if(b) await click(b); await act(async()=>{await new Promise(r=>setTimeout(r,50));});};
const stat=label=>{const p=document.querySelector('.modal.lead.client'); if(!p) return null;
  const s=[...p.querySelectorAll('.cv-stat')].find(e=>((e.querySelector('.cv-stat-l')||{}).textContent||'').trim().toLowerCase()===label);
  return s?{v:(s.querySelector('.cv-stat-v')||{}).textContent||'',s:(s.querySelector('.cv-stat-s')||{}).textContent||''}:null;};
const openClient=async name=>{
  const x=document.querySelector('.modal.lead.client .m-x'); if(x) await click(x);
  await nav('Clients');
  const card=[...document.querySelectorAll('.kcard')].find(c=>!c.classList.contains('kproj')&&(c.textContent||'').includes(name));
  if(card) await click(card.querySelector('.kn')||card);
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
};

console.log('\none closed deal, paid in full');
await openClient('Chris Waipa');
ok('the client dashboard opens', !!document.querySelector('.modal.lead.client'));
ok('contracted is the one deal', (stat('contracted')||{}).v==='$2,499', JSON.stringify(stat('contracted')));
ok('and counts it as one deal, not zero', /^1 deal$/.test((stat('contracted')||{}).s||''), JSON.stringify(stat('contracted')));
ok('collected is the one payment', (stat('collected')||{}).v==='$2,499', JSON.stringify(stat('collected')));
ok('lifetime is the cash that arrived — not cash plus the deal it paid for', (stat('lifetime')||{}).v==='$2,499', JSON.stringify(stat('lifetime')));

console.log('\ntwo closed deals, one paid, and retainer cash');
await openClient('Two Deal');
ok('contracted counts both deals', (stat('contracted')||{}).v==='$5,000' && /^2 deals$/.test((stat('contracted')||{}).s||''), JSON.stringify(stat('contracted')));
ok('still owed is the unpaid deal', (stat('still owed')||{}).v==='$3,000', JSON.stringify(stat('still owed')));
ok('lifetime is setup plus retainer cash, nothing booked', (stat('lifetime')||{}).v==='$2,299', JSON.stringify(stat('lifetime')));

console.log('\nthe dashboard reads cleanly');
/* The reported screenshot also showed the Recurring card's labels in pale cyan
   and its fields tinted — the old dark paint reaching a light screen. */
{
  const p=document.querySelector('.modal.lead.client');
  fresh(dom.window);
  const head=p&&p.querySelector('.cv-head'); const hb=head&&parseColor(dom.window.getComputedStyle(head).backgroundColor);
  ok('the header is the navy band', !!hb&&hb.a>0.99&&luminance(hb.rgb)<0.05, head&&dom.window.getComputedStyle(head).backgroundColor);
  ok('with the Recurring card on it', !!(p&&[...p.querySelectorAll('.cv-card-h')].some(h=>/Recurring/.test(h.textContent))));
  const {count,low}=contrast(p,{win:dom.window});
  ok(`${count} elements render text, all of it at least ${MIN}:1 against its ground`, !low.length, low.join('\n        '));
}

console.log('\nthe lead view\'s payment header');
/* An open Discovery lead with $0 paid read "PAID IN FULL". owedBy() returns 0
   for anything not yet won, and the header read that 0 as settled. */
{
  const x=document.querySelector('.modal.lead.client .m-x'); if(x) await click(x);
  await nav('Leads');
  const row=[...document.querySelectorAll('tbody tr')].find(r=>/Open Lead/.test(r.textContent||''));
  if(row) await click(row);
  await act(async()=>{await new Promise(r=>setTimeout(r,60));});
  const deal=[...document.querySelectorAll('.m-jump button')].find(b=>/Deal/.test(b.textContent||''));
  if(deal) await click(deal);
  await act(async()=>{await new Promise(r=>setTimeout(r,120));});
  const hd=document.querySelector('.modal.lead .pay-head b');
  ok('the payment panel is open', !!document.querySelector('.modal.lead .pay-panel'));
  ok('an open lead with nothing paid does not read "paid in full"', hd && !/paid in full/i.test(hd.textContent), hd&&hd.textContent);
  ok('it says the deal has not closed', hd && /not closed yet/i.test(hd.textContent), hd&&hd.textContent);
}

try{fs.unlinkSync('tests/.bcmoney.mjs');}catch{}
console.log(`\n${pass} passed, ${fail} failed`);
await act(async()=>{root.unmount();});
process.exit(fail?1:0);
