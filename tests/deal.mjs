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
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

globalThis.__LEADS__=[{
  id:'l1', name:'Ashley Thill', company:'Business Advisor', stage:'signed', owner:'Garrett',
  isClient:true, convertedAt:'2026-07-25',
  createdAt:new Date(Date.now()-11*864e5).toISOString(),
  activities:[{id:'a0',ts:new Date(Date.now()-864e5).toISOString(),type:'Note',text:'Existing note',who:'Garrett'}],
  meetings:[],
  deals:[{id:'d1',label:'Chris 50th Site',setup:'',website:'150',integration:'',extras:[]},
         {id:'d2',label:'Second thing',   setup:'500',website:'',integration:'',extras:[]}],
  dealValue:650, closedDeals:[],
}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.b6.mjs',out.outputFiles[0].text);
const mod=await import('./.b6.mjs?v='+Date.now());
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

await nav('Leads');
const row=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Ashley Thill/.test(e.textContent||'')).pop();
if(row) await click(row);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});
ok('lead modal opened', /Ashley Thill/.test(document.body.textContent||''));

const dealJump=[...document.querySelectorAll('button')].find(b=>/^Deal$/.test((b.textContent||'').trim()));
if(dealJump) await click(dealJump);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});

console.log('\nbefore');
let btns=[...document.querySelectorAll('.deal-close-btn')];
ok('two open deals, each with a close button', btns.length===2, 'n='+btns.length);

console.log('\nclose the first deal');
await click(btns[0]);
await act(async()=>{await new Promise(r=>setTimeout(r,60));});

const w=globalThis.__WRITES__.at(-1);
ok('something was written to the database', !!w);
ok('the closed deal is GONE from open deals',
   w && (w.deals||[]).length===1 && (w.deals||[])[0].id==='d2',
   'deals='+JSON.stringify((w&&w.deals||[]).map(d=>d.id)));
ok('the other deal survived', w && (w.deals||[]).some(d=>d.id==='d2'));
ok('it was archived into closedDeals',
   w && (w.closedDeals||[]).length===1 && (w.closedDeals||[])[0].label==='Chris 50th Site',
   JSON.stringify((w&&w.closedDeals||[]).map(d=>d.label)));
ok('the archived amount is right', w && (w.closedDeals||[])[0] && (w.closedDeals||[])[0].amount===150,
   String((w&&w.closedDeals||[])[0]&&(w.closedDeals||[])[0].amount));
ok('dealValue dropped to the remaining 500', w && w.dealValue===500, 'dealValue='+(w&&w.dealValue));
ok('the note was logged', w && (w.activities||[]).some(a=>/^Deal closed: Chris 50th Site/.test(a.text||'')),
   JSON.stringify((w&&w.activities||[]).map(a=>a.text)));
ok('the pre-existing activity was NOT wiped', w && (w.activities||[]).some(a=>a.text==='Existing note'));
ok('no duplicate "deal value set to" noise beside it',
   w && !(w.activities||[]).some(a=>/Deal value set to/.test(a.text||'')),
   JSON.stringify((w&&w.activities||[]).map(a=>a.text)));
ok('the commission trail is still stamped', w && w.dealValueBy==='Garrett' && !!w.dealValueAt,
   'by='+(w&&w.dealValueBy));

console.log('\nand the screen agrees');
btns=[...document.querySelectorAll('.deal-close-btn')];
ok('only one close button left on screen', btns.length===1, 'n='+btns.length);
ok('the closed deal name is out of the open list',
   ![...document.querySelectorAll('.deal-card, .deal-head, input')].some(e=>/Chris 50th Site/.test(e.value||'')),
   'still present');

console.log('\nthe stale-write bug itself');
/* every write in this tick must agree — the old code produced a final write that
   still had d1 open because addActivity rebuilt the lead from a stale snapshot */
const bad=globalThis.__WRITES__.filter(x=>x.id==='l1'&&(x.closedDeals||[]).length>0&&(x.deals||[]).some(d=>d.id==='d1'));
ok('no write ever archived the deal while leaving it open', bad.length===0, 'bad writes='+bad.length);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
