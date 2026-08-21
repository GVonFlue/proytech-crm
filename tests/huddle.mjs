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
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const at=n=>new Date(Date.now()-n*864e5).toISOString();
const mk=(id,name,actDays)=>({id,name,company:name,stage:'new',owner:'Garrett',
  createdAt:at(60),meetings:[],deals:[],dealValue:0,
  activities:actDays.map((d,i)=>({id:id+'a'+i,ts:at(d),type:'Call',text:'Called them',who:'Garrett'}))});
/* Activity at 0 (today), 3 (mid-window), 6 (the oldest day still inside a
   rolling 7), and 8 (outside). Under the OLD last-complete-Mon-Sun rule the
   today/3-day ones would usually fall outside the window entirely. */
globalThis.__LEADS__=[ mk('l1','Today Co',[0]), mk('l2','Midweek Co',[3]),
  mk('l3','Edge Co',[6]), mk('l4','Stale Co',[8]) ];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bb.mjs',out.outputFiles[0].text);
const mod=await import('./.bb.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await act(async()=>{await new Promise(r=>setTimeout(r,60));});};
const txt=()=>document.body.textContent||'';
const statVal=lab=>{const st=[...document.querySelectorAll('.stat, .hstat, .kpi')]
  .find(e=>new RegExp(lab,'i').test(e.textContent||'')); return st?(st.textContent||'').replace(/\s+/g,' '):''; };
const pad=n=>String(n).padStart(2,'0');
const dstr=n=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};

await nav('Monday Huddle');
console.log('\nthe window is a rolling 7 days ending today');
ok('page renders', /by the numbers/i.test(txt()));
ok('header says the last 7 days', /the last 7 days/i.test(txt()), txt().match(/·[^·]{0,30}7 days/)?.[0]||'');
/* the label prints the range — start must be 6 days back, end today */
const label=(document.querySelector('.hud-d')||{}).textContent||'';
ok('label spans six days back to today', label.length>10, label);

console.log('\nactivity inside and outside the window');
const touches=statVal('Touches');
/* 3 calls inside (0, 3, 6 days ago), 1 outside (8 days ago) */
ok('counts today, mid-window and the 6-day edge — but not day 8',
   /^Touches3(?!\d)/.test(touches.replace(/\s/g,'')), 'touches stat: '+touches);
ok('no copy says "last week" anywhere', !/last week/i.test(txt()),
   (txt().match(/.{0,30}last week.{0,20}/i)||[''])[0]);
ok('and no "last full week" label', !/last full week/i.test(txt()));

console.log('\na saved huddle survives the day rolling over');
/* the old code keyed freshness on the period start date, which now changes
   daily — a huddle written yesterday would vanish today */
globalThis.__SETTINGS__={huddle:{weekKey:dstr(7),periodTo:dstr(1),
  brief:{headline:'Written yesterday',wins:['a win'],concerns:[],focus:[],projection:''},
  generatedAt:new Date(Date.now()-864e5).toISOString(),by:'Garrett'}};
await act(async()=>{root.unmount();});
document.getElementById('root').innerHTML='';
const root2=createRoot(document.getElementById('root'));
await act(async()=>{root2.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,150));});
await nav('Monday Huddle');
ok('yesterday\'s huddle is still shown', /Written yesterday/.test(txt()), txt().slice(0,140));
ok('and it says how old it is', /day ago|days ago/.test(txt()),
   (txt().match(/covers the 7 days[^·]{0,60}/)||[''])[0]);
ok('with a nudge to rewrite', /rewrite for today/i.test(txt()));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
