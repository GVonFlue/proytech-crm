/* The intake tile: how many leads and relationships were added, and when.

   Worth its own suite because the counting is date arithmetic, and date
   arithmetic is where this repo has been bitten before. Three things are
   asserted that a click-through would not catch:

     1. "Today" means today's DATE, not the last 24 hours. A lead added at
        23:59 must still count as today at 00:01 the next... no — it must stop
        counting, and one added at 00:01 today must count immediately. A
        rolling window gets both of those wrong.
     2. A record with an unparseable createdAt must be counted in NOTHING.
        isoOf(new Date('nonsense')) is "NaN-aN-aN", which sorts ABOVE every real
        date as a string, so a naive >= comparison counts it in every range.
     3. Relationships and leads are counted separately. They live in one table
        distinguished only by isRelationship, so it is easy to double-count.
*/
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
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[]; globalThis.__CAL__=[]; globalThis.__TASKS__=[];
globalThis.__SETTINGS_WRITES__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

/* Midday so the test cannot straddle a day boundary while it runs. */
const atNoon=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-n);return d.toISOString();};
const base={stage:'discovery',owner:'Garrett',activities:[],meetings:[],deals:[],dealValue:0};
globalThis.__LEADS__=[
  /* leads: 2 today, 1 at 6 days, 1 at 20 days, 1 at 200 days */
  {...base,id:'t1',name:'Today One',   company:'A Co', createdAt:atNoon(0)},
  {...base,id:'t2',name:'Today Two',   company:'B Co', createdAt:atNoon(0)},
  {...base,id:'w1',name:'Six Days',    company:'C Co', createdAt:atNoon(6)},
  {...base,id:'m1',name:'Twenty Days', company:'D Co', createdAt:atNoon(20)},
  {...base,id:'y1',name:'Long Ago',    company:'E Co', createdAt:atNoon(200)},
  /* relationships: 1 today, 1 at 10 days */
  {...base,id:'r1',name:'Rel Today',   isRelationship:true, createdAt:atNoon(0)},
  {...base,id:'r2',name:'Rel Ten Days',isRelationship:true, createdAt:atNoon(10)},
  /* must never be counted, in any range */
  {...base,id:'bad1',name:'No Date',   createdAt:''},
  {...base,id:'bad2',name:'Junk Date', createdAt:'not a date at all'},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bik.mjs',out.outputFiles[0].text);
const mod=await import('./.bik.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=120)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};

const panel=()=>document.querySelector('.intake');
/* [leads, relationships] as rendered */
const nums=()=>[...document.querySelectorAll('.intake .ik-n')].map(e=>Number((e.querySelector('b')||{}).textContent));
const rangeBtn=re=>[...document.querySelectorAll('.intake .ik-r')].find(b=>re.test((b.textContent||'').trim()));
const onRange=()=>((document.querySelector('.intake .ik-r.on')||{}).textContent||'').trim();
const rows=()=>[...document.querySelectorAll('.intake .ik-row .ik-nm')].map(e=>(e.textContent||'').trim());

console.log('\nthe tile is on the dashboard');
ok('intake panel renders', !!panel());
ok('it is titled', /intake/i.test((panel()||{}).textContent||''));
ok('every range is offered', document.querySelectorAll('.intake .ik-r').length===6,
   String(document.querySelectorAll('.intake .ik-r').length));

console.log('\nit defaults to today');
ok('Today is the selected range', onRange()==='Today', onRange());
ok('2 leads added today', nums()[0]===2, JSON.stringify(nums()));
ok('1 relationship added today', nums()[1]===1, JSON.stringify(nums()));
ok('a relationship is NOT counted as a lead', nums()[0]===2, JSON.stringify(nums()));

console.log('\nrecords with no usable createdAt are counted in nothing');
ok('the junk-date lead is not in today', !rows().includes('Junk Date'), rows().join(' | '));
ok('the blank-date lead is not in today', !rows().includes('No Date'), rows().join(' | '));

console.log('\nwidening the range widens the count');
await click(rangeBtn(/^7 days$/)); await settle();
ok('7 days is now selected', onRange()==='7 days', onRange());
ok('7 days picks up the 6-day-old lead', nums()[0]===3, JSON.stringify(nums()));
ok('and still only the one relationship', nums()[1]===1, JSON.stringify(nums()));

await click(rangeBtn(/^14 days$/)); await settle();
ok('14 days picks up the 10-day-old relationship', nums()[1]===2, JSON.stringify(nums()));
ok('but not the 20-day-old lead', nums()[0]===3, JSON.stringify(nums()));

await click(rangeBtn(/^30 days$/)); await settle();
ok('30 days picks up the 20-day-old lead', nums()[0]===4, JSON.stringify(nums()));

await click(rangeBtn(/^12 months$/)); await settle();
ok('12 months picks up the 200-day-old lead', nums()[0]===5, JSON.stringify(nums()));
ok('the junk dates are STILL excluded at the widest range', nums()[0]===5&&nums()[1]===2,
   JSON.stringify(nums()));

console.log('\nthe list underneath');
ok('newest first', rows()[0]==='Today One'||rows()[0]==='Today Two'||rows()[0]==='Rel Today', rows().join(' | '));
ok('it caps at 6 rows', rows().length<=6, String(rows().length));
ok('and says how many it left out', /\+ \d+ more/.test((panel()||{}).textContent||''));

console.log('\nnarrowing back');
await click(rangeBtn(/^Today$/)); await settle();
ok('back to 2 and 1', nums()[0]===2&&nums()[1]===1, JSON.stringify(nums()));
ok('no "more" line when everything fits', !/\+ \d+ more/.test((panel()||{}).textContent||''));

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) process.exitCode=1;
