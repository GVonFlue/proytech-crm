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
globalThis.__USER_WRITES__=[];globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];
globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const pad=n=>String(n).padStart(2,'0');
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
/* a date N days out, expressed as a birthday with a real birth year */
const inDays=(n,year)=>{const d=new Date(Date.now()+n*864e5);
  return `${year||d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
/* Named once so the assertion about the rendered age can be derived from it
   rather than restating an answer that is only right in one calendar year. */
const SOON_BIRTH_YEAR=1985;
globalThis.__LEADS__=[
  {id:'b1',name:'Soon Birthday',company:'Soon Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   activities:[],meetings:[],deals:[],dealValue:0,
   keyDates:[{id:'k1',label:'Birthday',date:inDays(3,SOON_BIRTH_YEAR),annual:true,lead:7}]},
  {id:'b2',name:'Far Birthday',company:'Far Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   activities:[],meetings:[],deals:[],dealValue:0,
   keyDates:[{id:'k2',label:'Birthday',date:inDays(60,1990),annual:true,lead:7}]},
  {id:'b3',name:'Anniversary Co',company:'Anniv Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   activities:[],meetings:[],deals:[],dealValue:0,
   keyDates:[{id:'k3',label:'Home purchase anniversary',date:inDays(1,2020),annual:true,lead:7}]},
  {id:'b4',name:'Blank Co',company:'Blank Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   activities:[],meetings:[],deals:[],dealValue:0},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bl.mjs',out.outputFiles[0].text);
const mod=await import('./.bl.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,110));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const W=id=>globalThis.__WRITES__.filter(w=>w.id===id).at(-1);

console.log('\nreminders on the dashboard');
await nav('Dashboard');
const td=(document.querySelector('.today')||{}).textContent||'';
ok('a Birthdays & dates group appears', /Birthdays & dates/.test(td), td.slice(0,140));
ok('a birthday 3 days out is listed', /Soon Birthday/.test(td)&&/in 3 days/.test(td), td.slice(0,260));
ok('a birthday 60 days out is NOT', !/Far Birthday/.test(td), td.slice(0,300));
ok('a custom labelled date shows too', /Home purchase anniversary/.test(td), td.slice(0,300));
ok('tomorrow reads as tomorrow', /tomorrow/.test(td), td.slice(0,300));
/* The expected age is DERIVED from the same fixture the birthday was built
   from, not typed. It was /turns 4[01]/ — true only while the year is 2026,
   and the second clock-rotted assertion in this suite (see
   tests/clockwarp.mjs). Scoped to the birthday's own row too: "Home purchase
   anniversary" also renders a "turns N", so a page-wide match could pass or
   fail on the wrong record. */
const soonAge = new Date(Date.now()+3*864e5).getFullYear() - SOON_BIRTH_YEAR;
/* (?!\\d), not \\b. The row renders with no separators — "turns 41in 3 days" —
   so there is no word boundary after the number, and \\b silently never matched.
   What is actually meant is "not followed by another digit", so that turns 4
   cannot match inside turns 41. */
ok('the age is worked out from the year',
   new RegExp('Soon Birthday[\\s\\S]{0,120}turns '+soonAge+'(?!\\d)').test(td),
   'expected turns '+soonAge+' beside Soon Birthday — saw: '+(td.match(/turns \d+/g)||[]).join(', '));

console.log('\nadding one');
await nav('Leads');
const row=[...document.querySelectorAll('tbody tr')].find(e=>/Blank Co/.test(e.textContent||''));
if(row) await click(row); await settle(130);
const box=document.querySelector('.kd-add');
ok('the editor is on the lead', !!box);
const sel=box.querySelector('select');
ok('it offers the seeded types', [...sel.options].some(o=>/Spouse birthday/.test(o.textContent)),
   [...sel.options].map(o=>o.textContent).join(' | '));
const di=box.querySelector('input[type=date]');
const st=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
await act(async()=>{st.call(di,'1978-03-04');di.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
await click([...box.querySelectorAll('button')].find(b=>/Add/.test(b.textContent))); await settle();
const w=W('b4');
ok('it saved', w&&(w.keyDates||[]).length===1, JSON.stringify(w&&w.keyDates));
ok('with the label and the year kept', w&&w.keyDates[0].label==='Birthday'&&w.keyDates[0].date==='1978-03-04',
   JSON.stringify(w&&w.keyDates&&w.keyDates[0]));
ok('and marked as recurring', w&&w.keyDates[0].annual===true);

console.log('\nSettings can edit the types');
await nav('Settings'); await settle(120);
ok('a key date editor exists', /Key date types/.test(document.body.textContent||''));
ok('seeded, not empty', /Wedding anniversary/.test(document.body.textContent||''));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
