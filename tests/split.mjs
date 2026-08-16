import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__WRITES__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];globalThis.__USER_WRITES__=[];
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const now=new Date();
const thisM=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
const prev=new Date(now.getFullYear(),now.getMonth()-1,15);
const prevM=`${prev.getFullYear()}-${pad(prev.getMonth()+1)}`;
const dThis=`${thisM}-07`, dPrev=`${prevM}-21`;
const ago=n=>new Date(Date.now()-n*864e5).toISOString();

globalThis.__LEADS__=[
  /* THE REPORTED CASE — Justus. Closed LAST month for $2,499, paid half then
     and half this month. Each half must land in its own month. */
  {id:'j1',name:'Agent Kidd',company:'Agent Kidd Real Estate',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:dPrev,closedAt:dPrev,createdAt:ago(90),activities:[],meetings:[],deals:[],dealValue:2499,
   onboarding:{deposit_paid:{done:dPrev,due:null}},
   payments:[{id:'pa',amount:1250,date:dPrev,note:'deposit'},
             {id:'pb',amount:1249,date:dThis,note:'balance'}]},
  /* a lead closed this month with NO payments logged — the legacy path. It must
     keep counting at its close date or old history would vanish. */
  {id:'g1',name:'Legacy Co',company:'Legacy Co',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:`${thisM}-01`,closedAt:`${thisM}-01`,createdAt:ago(40),activities:[],meetings:[],deals:[],dealValue:999,
   onboarding:{deposit_paid:{done:`${thisM}-01`,due:null}}},
  /* closed this month, half collected, half still owed */
  /* open prospect — never bought, owes nothing */
  {id:'o1',name:'Prospect Co',company:'Prospect Co',stage:'discovery',owner:'Garrett',
   createdAt:ago(10),activities:[],meetings:[],deals:[],dealValue:5000},
  /* THE REPORTED SHAPE: won this month AND an archived closed deal this month */
  {id:'lv',name:'Level Up',company:'Level Up',stage:'signed',owner:'Logan',isClient:true,
   convertedAt:`${thisM}-06`,closedAt:`${thisM}-06`,createdAt:ago(15),activities:[],meetings:[],deals:[],dealValue:0,
   onboarding:{deposit_paid:{done:`${thisM}-06`,due:null}},
   closedDeals:[{id:'cdx',label:'Build',amount:1299,closedAt:`${thisM}-06`}]},
  {id:'h1',name:'Half Paid',company:'Half Paid',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:`${thisM}-03`,closedAt:`${thisM}-03`,createdAt:ago(20),activities:[],meetings:[],deals:[],dealValue:1000,
   onboarding:{deposit_paid:{done:`${thisM}-03`,due:null}},
   payments:[{id:'pc',amount:400,date:`${thisM}-03`,note:'deposit'}]},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bf.mjs',out.outputFiles[0].text);
const mod=await import('./.bf.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=70)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};

/* ---- expected, by hand ----
   THIS MONTH collected:
     Justus     balance payment dated this month              = 1249
     Half Paid  deposit dated this month                      =  400
     Legacy Co  no payment rows, closed this month, confirmed =  999  (legacy)
     Level Up   no payment rows, closedDeal this month        = 1299  (legacy)
     Prospect   open, never bought                            =    0
                                                       total  = 3947
   Justus' 1250 deposit belongs to LAST month and must NOT appear.
   STILL OWED: Justus  2499 contracted, 2499 paid            ->    0
               Legacy   999, no payment rows but deposit ticked -> 0 (settled,
                        consistent with how revenue counts it)
               Half Paid 1000 contracted, 400 paid            ->  600
                                                             total    =  600  */
console.log('\nrevenue follows the payment date, not the close date');
const rev=kpi('Revenue Collected');
ok('the tile is about collection now', !!rev, [...document.querySelectorAll('.kpi .kl')].map(e=>e.textContent).join(' | '));
ok('this month collects $3,947', rev && /\$3,947/.test(rev.v), rev&&rev.v);
ok("last month's half is not counted here", rev && !/3,898|2,899/.test(rev.v), rev&&rev.v);
ok('outstanding is named on the tile', rev && /\$600 still owed/.test(rev.d), rev&&rev.d);

console.log('\nthe drilldown shows the actual payments');
await click([...document.querySelectorAll('.kpi')].find(e=>/Revenue Collected/.test(e.textContent||'')));
await settle();
const rows=[...document.querySelectorAll('.drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
ok('the balance payment is listed', rows.some(r=>/Agent Kidd/.test(r)&&/\$1,249/.test(r)), rows.join(' || '));
ok('the deposit from last month is NOT', !rows.some(r=>/\$1,250/.test(r)), rows.join(' || '));
ok('a partly-paid client shows what is still owed',
   rows.some(r=>/Half Paid/.test(r)&&/\$600 still owed/.test(r)), rows.join(' || '));
ok('a lead with no payments logged still counts, and says why',
   rows.some(r=>/Legacy Co/.test(r)&&/no payments logged/.test(r)), rows.join(' || '));

console.log('\nnothing was lost from the old behaviour');
const dc=kpi('Deals Closed');
/* closed THIS month: Legacy Co, Level Up, Half Paid = 3 distinct closes.
   Justus closed last month and must not appear. */
ok('deals closed still counts by close date', dc && /^3$/.test(dc.v), dc&&dc.v);

console.log('\nthe reported bug: a lead closed AND with an archived deal');
/* Level Up: won stage, closedAt this month, AND a closedDeals row this month.
   Both branches used to fire, so one lead scored 2. */
/* Level Up is won this month AND has an archived deal this month. Before the
   fix both branches fired and the tile read 4 over a list of 3. */
ok('it counts as ONE close, not two', dc && /^3$/.test(dc.v), 'deals closed = '+(dc&&dc.v));
/* open the DEALS CLOSED panel specifically — the revenue panel is a different
   list and comparing against it proves nothing */
await click([...document.querySelectorAll('.kpi')].find(e=>/Deals Closed/.test(e.textContent||'')));
await settle();
const dRows=[...document.querySelectorAll('.drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
ok('the count matches the number of rows listed', dc && Number(dc.v)===dRows.length,
   'tile='+(dc&&dc.v)+' rows='+dRows.length+' :: '+dRows.join(' | '));
ok('Level Up appears once', dRows.filter(r=>/Level Up/.test(r)).length===1, dRows.join(' | '));

console.log('\nan open lead is not a debtor');
/* Prospect Co sits at discovery with a $5,000 deal value and has bought
   nothing. "Still owed" used to include the entire open pipeline. */
ok('open pipeline is not counted as owed', rev && !/\$5,600|\$5,000/.test(rev.d), rev&&rev.d);
ok('only won business is owed', rev && /\$600 still owed/.test(rev.d), rev&&rev.d);

console.log('\nthe reported shape: closed deal + a legacy deal object left behind');
/* Justus exactly: $2,499 archived into closedDeals, the old `deal` object still
   on the record, $2,748 paid across two months, $249 retainer active. */
globalThis.__LEADS__=[{id:'jk',name:'Justus Kidd',company:'Agent Kidd Real Estate',
  stage:'signed',owner:'Garrett',isClient:true,convertedAt:dPrev,closedAt:dPrev,createdAt:ago(90),
  activities:[],meetings:[],deals:[],dealValue:0,
  deal:{setup:'2499',website:'',integration:'',extras:[]},
  retainerActive:true,retainer:249,
  onboarding:{deposit_paid:{done:dPrev,due:null}},
  closedDeals:[{id:'cd',label:'Schedule C',amount:2499,closedAt:dPrev}],
  payments:[{id:'p1',amount:1498.50,date:dPrev,note:'square deposit'},
            {id:'p2',amount:1249.50,date:dThis,note:'Square Payment'}]}];
await act(async()=>{root.unmount();});
document.getElementById('root').innerHTML='';
const r2=createRoot(document.getElementById('root'));
await act(async()=>{r2.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,140));});
const rv=kpi('Revenue Collected');
/* contracted = 2499 closed + 249 first month = 2748. paid = 2748. owed = 0. */
ok('a paid-in-full client owes nothing', rv && !/still owed/.test(rv.d), rv&&rv.d);
ok('the phantom legacy deal is not counted twice', rv && !/2,250|4,998/.test(rv.d), rv&&rv.d);

console.log('\nthe payments panel agrees');
const nb=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()==='Leads');
if(nb) await click(nb); await settle(90);
const rr=[...document.querySelectorAll('tbody tr')].find(e=>/Justus/.test(e.textContent||''));
if(rr) await click(rr); await settle(140);
const dj=[...document.querySelectorAll('button')].find(b=>/^Deal$/.test((b.textContent||'').trim()));
if(dj) await click(dj); await settle(90);
const panel=(document.querySelector('.pay-panel')||{}).textContent||'';
ok('owed counts the closed deal, not just the retainer', /of \$2,748/.test(panel.replace(/\s+/g,' ')),
   panel.replace(/\s+/g,' ').slice(0,140));
ok('and it reads as paid in full', /PAID IN FULL/i.test(panel), panel.slice(0,120));
ok('no bogus "paid over the deal total" warning', !/over the deal total/.test(panel), panel.slice(0,160));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
