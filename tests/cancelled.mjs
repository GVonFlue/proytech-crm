import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
  'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
  try { Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true}); } catch {}
}
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__WRITES__=[]; globalThis.__CAL__=[];
globalThis.fetch=async(url,opts={})=>{
  if(String(url).includes('/api/google-status')) return {ok:true,json:async()=>({connected:true,email:'admin@getproytech.com'})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};

/* THE REPORTED STATE, exactly: three meetings booked today, two of them deleted
   BEFORE the cancelled flag existed — so their Booked activities carry no flag
   at all, only a meetingId pointing at a meeting the lead no longer has. */
const now=new Date(); now.setHours(9,0,0,0);
const ts=n=>new Date(now.getTime()+n*60000).toISOString();
const pad=x=>String(x).padStart(2,'0');
const localStart=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T14:00:00`;
globalThis.__LEADS__=[{
  id:'l1', name:'Jason Bell', company:'Specs Eyewear', stage:'new', owner:'Garrett',
  createdAt:new Date(now.getTime()-30*864e5).toISOString(),
  activities:[
    {id:'a1',ts:ts(1),type:'Booked',mtype:'Coffee',meetingId:'m1',text:'Coffee booked: one',who:'Garrett'},
    {id:'a2',ts:ts(2),type:'Booked',mtype:'Coffee',meetingId:'m2',text:'Coffee booked: two (DELETED)',who:'Garrett'},
    {id:'a3',ts:ts(3),type:'Booked',mtype:'Coffee',meetingId:'m3',text:'Coffee booked: three (DELETED)',who:'Garrett'},
    {id:'a4',ts:ts(4),type:'Call',text:'Called him',who:'Garrett'},
  ],
  meetings:[ {id:'m1',title:'Coffee one',mtype:'Coffee',start:localStart,end:localStart,status:'',createdAt:ts(1)} ],
}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
  logLevel:'silent'});
fs.writeFileSync('tests/.b3.mjs',out.outputFiles[0].text);
const mod=await import('./.b3.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,80));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const kpiVal=label=>{const k=[...document.querySelectorAll('.kpi')].find(e=>{
    const l=e.querySelector('.kl'); return l && (l.textContent||'').trim().toLowerCase()===label.toLowerCase(); });
  if(!k) return 'no kpi:'+label;
  return ((k.querySelector('.kv')||{}).textContent||'').trim()+' || '+((k.querySelector('.kd')||{}).textContent||'').trim(); };

console.log('\nActivity page — 3 booked, 2 already deleted');
const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Activity');
ok('Activity page reachable', !!nav);
if(nav) await click(nav);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});

const booked=kpiVal('Booked');
ok('Booked counts 1, not 3', /^1 \|\|/.test(booked), booked.slice(0,60));
const total=kpiVal('Total logged');
ok('Total logged counts 2, not 4', /^2 \|\|/.test(total), total.slice(0,90));
ok('and it says why', /2 cancelled, not counted/.test(total), total.slice(0,110));

const rows=[...document.querySelectorAll('.act-row')];
ok('the log still shows all 4 entries', rows.length===4, 'rows='+rows.length);
const struck=rows.filter(r=>(r.className||'').includes('cancelled'));
ok('the two dead bookings are struck through', struck.length===2, 'struck='+struck.length);
ok('the surviving booking is not', struck.every(r=>!/booked: one/i.test(r.textContent||'')));
ok('cancelled tag rendered', document.querySelectorAll('.act-row.cancelled .fcancel').length===2);

console.log('\nMonday Huddle uses the same rule');
const hud=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Monday Huddle');
if(hud){ await click(hud); await act(async()=>{await new Promise(r=>setTimeout(r,50));});
  ok('huddle renders', (document.body.textContent||'').length>500); }

console.log('\nlead modal agrees');
const ln=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads');
if(ln) await click(ln);
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
const row=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop();
if(row) await click(row);
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
const jump=[...document.querySelectorAll('button')].find(b=>/^Meetings\s*\d/.test((b.textContent||'').trim()));
ok('Meetings chip says 1', /Meetings\s*1(?!\d)/.test(((jump&&jump.textContent)||'').replace(/\s+/g,' ')),
   ((jump&&jump.textContent)||'no chip').replace(/\s+/g,' '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
