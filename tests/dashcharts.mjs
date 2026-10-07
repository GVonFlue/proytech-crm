/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_ch = bundleName('ch');
const B_cp = bundleName('cp');
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','KeyboardEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const mAgo=n=>{const d=new Date();d.setMonth(d.getMonth()-n);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;};

globalThis.__LEADS__=[
  {id:'c1',name:'Devin Hammann',company:'Kleen Stripe',stage:'won',isClient:true,
   createdAt:new Date(Date.now()-2e9).toISOString(),activities:[],
   retainer:249,retainerActive:true,retainerStart:mAgo(3)+'-01',
   deals:[{id:'d1',label:'Website build',service:'Website',setup:1500,website:1499,integration:'',extras:[]}],
   payments:[{id:'p1',amount:1500,date:mAgo(3)+'-12'},{id:'p2',amount:1499,date:mAgo(1)+'-08'}]},
  {id:'c2',name:'Justus Kidd',company:'Agent Kidd',stage:'won',isClient:true,
   createdAt:new Date(Date.now()-2e9).toISOString(),activities:[],
   deals:[{id:'d2',label:'Business Suite',service:'Business Suite',setup:2999,website:'',integration:'',extras:[]}],
   payments:[{id:'p3',amount:2999,date:mAgo(2)+'-20'}]},
  {id:'o1',name:'Alex Colon',company:'At Home Wichita',stage:'new',dealValue:1999,
   createdAt:new Date(Date.now()-9e8).toISOString(),activities:[]},
];
globalThis.__TXNS__=[{id:'t1',type:'expense',amount:420,date:mAgo(1)+'-05',category:'Hosting'}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/'+B_cp,out.outputFiles[0].text);
const mod=await import('./'+B_cp+'?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,160));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  await act(async()=>{await new Promise(r=>setTimeout(r,60));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===l); if(b) await click(b);};

console.log('\nCHARTS');
const txt=()=>document.body.textContent||'';
ok('Revenue collected tile is on the dashboard', /Revenue collected/.test(txt()));
ok('Recurring revenue tile', /Recurring revenue/.test(txt()));
/* renamed Oct 2026: it now splits won work from pipeline (serviceRevenue) */
ok('Revenue by service tile', /Revenue by service/.test(txt()));
ok('In and out tile', /In and out/.test(txt()));
ok('they sit in one grid', !!document.querySelector('.chart-grid'));
ok('four cards in it', (document.querySelectorAll('.chart-grid .card')||[]).length===4,
   'found '+document.querySelectorAll('.chart-grid .card').length);

console.log('\nTHE SERIES THEMSELVES');
const cb=await esbuild.build({entryPoints:['src/lib/charts.js'],bundle:true,write:false,format:'esm',logLevel:'silent',
  loader:{'.js':'jsx'},define:{'import.meta.env':'__ENV__'},
  banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'}});
fs.writeFileSync('tests/'+B_ch,cb.outputFiles[0].text);
const lib=await import('./'+B_ch+'?v='+Date.now());
const coll=lib.collectedByMonth(globalThis.__LEADS__,12);
ok('twelve months of revenue', coll.length===12);
ok('a payment lands in its own month', coll.find(m=>m.k===mAgo(2)).value===2999,
   JSON.stringify(coll.filter(m=>m.value)));
const mrr=lib.mrrByMonth(globalThis.__LEADS__,12);
ok('MRR counts a retainer from its start date', mrr[mrr.length-1].value===249, JSON.stringify(mrr.slice(-4)));
ok('and not before it', mrr.find(m=>m.k===mAgo(5)).value===0, JSON.stringify(mrr.slice(0,8)));
const svc=lib.soldByService(globalThis.__LEADS__);
ok('sold splits by service', svc.find(x=>x.name==='Website')?.value===2999 && svc.find(x=>x.name==='Business Suite')?.value===2999,
   JSON.stringify(svc));
const noSvc=lib.soldByService([{deals:[{id:'x',setup:500}]}]);
ok('a deal with no service is Unassigned, never dropped', noSvc[0]&&noSvc[0].name==='Unassigned'&&noSvc[0].value===500, JSON.stringify(noSvc));

console.log('\nTHE DEAL SERVICE FIELD');
const pipeKpi=[...document.querySelectorAll('.kpi, .kpi-c, [class*=kpi]')].find(e=>/Open Pipeline/i.test(e.textContent||''));
if(pipeKpi) await click(pipeKpi);
const cand=[...document.querySelectorAll('.drow-t')].filter(e=>/Alex Colon/.test(e.textContent||''));
if(cand[0]) await click(cand[0]);
await act(async()=>{await new Promise(r=>setTimeout(r,120));});
const dealTab=[...document.querySelectorAll('.mj')].find(b=>/Deal/.test(b.textContent||''));
ok('the lead opened', !!dealTab);
if(dealTab) await click(dealTab);
/* the picker offers the Settings service catalog (Services & pricing), so
   match its shipped default rather than the older Service Interest list, which
   the deal picker stopped reading in Oct 2026 */
const sel=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.textContent==='Web+CRM'));
ok('a deal carries a Service picker', !!sel, 'selects='+document.querySelectorAll('.m-right select').length);

console.log('\nCONVERT STAYS REACHABLE');
/* Convert moved from the prep rail into the header, beside the name (Oct
   2026). The header is always on screen, so the reachability promise holds;
   and it must exist ONCE, not in both places. */
const head=document.querySelector('.m-head');
const conv=[...document.querySelectorAll('.m-head button')].find(b=>/Convert to Client/.test(b.textContent||''));
ok('Convert to Client is in the always-visible header', !!conv,
   'header buttons='+(head?head.querySelectorAll('button').length:'no header'));
ok('and only there, not also in the rail',
   ![...document.querySelectorAll('.m-prep button')].some(b=>/Convert to Client/.test(b.textContent||'')));
ok('the header carries the ProyTech plate', !!document.querySelector('.m-head.plate'));
ok('and it is still there with a panel open', !!conv&&!!document.querySelector('.m-grid.panel-on'));

console.log('\nTHE TAB PANEL');
const grid=document.querySelector('.m-grid.lead3');
ok('opening a tab puts the grid in panel mode', !!grid&&/panel-on/.test(grid.className), grid&&grid.className);
ok('the activity feed stands aside for it', !!document.querySelector('.m-grid.panel-on'));
ok('the panel names who you are working on', !!document.querySelector('.mp-bar'));
ok('only the open section is picked', document.querySelector('.m-left').getAttribute('data-panel')==='deal',
   String(document.querySelector('.m-right')&&document.querySelector('.m-left').getAttribute('data-panel')));
if(dealTab) await click(dealTab);
const grid2=document.querySelector('.m-grid.lead3');
ok('clicking the same tab closes it', !!grid2&&/panel-off/.test(grid2.className), grid2&&grid2.className);

console.log('\nTHE RECORD IS WHITE AGAIN');
const modal=document.querySelector('.modal.leadfs');
ok('the lead view carries the light class', !!modal, 'classes='+((document.querySelector('.scrim2')||{}).className||'none'));
ok('and not the dark skin', !document.querySelector('.modal.lead'),
   'still dark: '+((document.querySelector('.modal.lead')||{}).className||''));

console.log('\nIT IS A POPUP, AND IT IS NOT NAVY');
if(dealTab) await click(dealTab);
const pop=document.querySelector('.m-pop');
ok('the section floats as its own card', !!pop, 'classes='+(document.querySelector('.m-left')||{}).className);
ok('the record is dimmed behind it', !!document.querySelector('.m-popscrim'));
ok('it opens at the top of the section', !pop||pop.scrollTop===0, pop&&String(pop.scrollTop));
ok('contact is not stapled to the deal panel', pop&&pop.getAttribute('data-panel')==='deal');
const tabText=[...document.querySelectorAll('.mj')].map(b=>(b.textContent||'').trim()).join('|');
ok('Contact has a tab of its own', /Contact/.test(tabText), tabText);
ok('Sponsors has a tab', /Sponsors/.test(tabText), tabText);
const contactTab=[...document.querySelectorAll('.mj')].find(b=>/Contact/.test(b.textContent||''));
if(contactTab) await click(contactTab);
ok('and it opens its own section', (document.querySelector('.m-pop')||{getAttribute:()=>null}).getAttribute('data-panel')==='contact');
const scrim=document.querySelector('.m-popscrim');
if(scrim) await act(async()=>{scrim.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));});
ok('clicking away closes it', !document.querySelector('.m-pop'));

console.log('\n'+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);
