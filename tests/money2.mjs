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
globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[];globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];
globalThis.__SETTINGS_WRITES__=[];
const pad=n=>String(n).padStart(2,'0');
const today=(()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;})();
globalThis.__SETTINGS__={goals:{revenue:10000},recurring:[
  {id:'r1',name:'Supabase Pro',amount:25,every:'monthly',category:'Hosting',nextDue:today,active:true},
  {id:'r2',name:'Vercel Pro',amount:20,every:'monthly',category:'Hosting',nextDue:today,active:true},
  {id:'r3',name:'Domain',amount:120,every:'yearly',category:'Hosting',nextDue:today,active:true},
  {id:'r4',name:'Paused thing',amount:99,every:'monthly',category:'Software',nextDue:today,active:false},
]};
globalThis.__TXNS__=[{id:'t1',date:today,type:'expense',amount:300,category:'Marketing',party:'Ads'}];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  {id:'c1',name:'Retainer Co',company:'Retainer Co',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:today,closedAt:today,createdAt:ago(60),activities:[],meetings:[],deals:[],dealValue:1000,
   retainerActive:true,retainer:250,onboarding:{deposit_paid:{done:today,due:null}},
   payments:[{id:'p1',amount:1000,date:today,note:'setup'}]},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bn.mjs',out.outputFiles[0].text);
const mod=await import('./.bn.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,130));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=100)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const seg=l=>[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim()===l);
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};

console.log('\nthe tabs merged');
const navs=[...document.querySelectorAll('.nav-i')].map(b=>b.textContent.trim());
ok('there is one Money tab', navs.filter(n=>n==='Money').length===1, navs.join(' | '));
ok('The Books is gone from the sidebar', !navs.includes('The Books'), navs.join(' | '));

console.log('\nburn is worked out across cadences');
await nav('Money');
/* Supabase 25 + Vercel 20 + Domain 120/12=10 = 55. The paused one is excluded. */
const burn=kpi('Monthly burn');
ok('burn is $55, annual bills divided down', burn && /\$55/.test(burn.v), burn&&burn.v);
ok('the paused bill is not counted', burn && /3 recurring bills/.test(burn.d), burn&&burn.d);
const mrr=kpi('MRR');
ok('MRR shows the retainer', mrr && /\$250/.test(mrr.v), mrr&&mrr.v);
ok('and says whether it covers burn', mrr && /covers burn/.test(mrr.d), mrr&&mrr.d);

console.log('\nnext 90 days is committed only');
await click(seg('Next 90 days')); await settle();
const body=document.body.textContent||'';
ok('it says it is not a forecast', /Nothing here is a guess/.test(body), body.slice(0,200));
ok('retainers are counted for 3 months', /\$750/.test(body), (body.match(/\$[\d,]+/g)||[]).slice(0,8).join(' '));
ok('recurring bills are listed', /Supabase Pro/.test(body));
ok('the paused bill is absent', !/Paused thing/.test(body));

console.log('\nmonth by month');
await click(seg('Month by month')); await settle();
ok('twelve months are charted', document.querySelectorAll('.mn-col').length===12,
   document.querySelectorAll('.mn-col').length+' cols');
ok('in and out are separate bars', document.querySelectorAll('.mn-fill.in').length>0
   && document.querySelectorAll('.mn-fill.out').length>0);

console.log('\nwhere it goes');
await click(seg('Where it goes')); await settle();
ok('expenses break down by category', /Marketing/.test(document.body.textContent||''));

console.log('\nadding a bill');
await click(seg('Recurring bills')); await settle();
ok('existing bills are editable', document.querySelectorAll('.mn-bill').length===4,
   document.querySelectorAll('.mn-bill').length+' rows');
ok('each shows its monthly equivalent', /\$10\/mo/.test(document.body.textContent||''),
   [...document.querySelectorAll('.mn-pm')].map(e=>e.textContent).join(' | '));
const seq=['Google Workspace','14']; let i=0;
dom.window.prompt=()=>seq[i++];
await click([...document.querySelectorAll('.deal-add-btn')].find(b=>/Add a recurring/.test(b.textContent)));
/* saveSettings debounces 700ms before it writes */
await settle(1000);
/* find the write that actually carries the new bill — other writes (module
   backfills) also land in this array */
const sw=(globalThis.__SETTINGS_WRITES__||[]).filter(x=>Array.isArray(x.recurring)).at(-1);
ok('it saved to settings', sw && (sw.recurring||[]).some(r=>r.name==='Google Workspace'),
   JSON.stringify((sw&&sw.recurring||[]).map(r=>r.name)));
ok('the existing bills survived', sw && sw.recurring.length===5, sw&&sw.recurring.length);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
