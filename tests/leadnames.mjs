/* THE PERSON'S NAME, AND WHAT A NEW TASK LANDS IN.
   ============================================================================

   Two claims that are invisible in the code and obvious on screen.

   1. A list of leads shows WHO, not just the company. Every row title in the
      app goes through personLabel(), so "Kleen Stripe" reads "Devin Hammann —
      Kleen Stripe". A record with only a company still reads as that company
      alone, never "Unnamed — " or a bare dash.

   2. The Tasks screen opens on YOUR work, and a task you stop and type lands
      in Focus rather than the pile.

   Both were verified by breaking them: reverting the Name component to
   l.company||l.name turns the first assertion red, which is the only reason to
   trust it. A source-reading assertion is not written until it has been seen
   to fail. */
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
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[]; globalThis.__CAL__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};

globalThis.__LEADS__=[
  {id:'l1',name:'Devin Hammann',company:'Kleen Stripe',stage:'new',dealValue:2999,followUp:day(-2),
   createdAt:new Date(Date.now()-9e8).toISOString(),activities:[]},
  {id:'l2',name:'',company:'Koehn Painting',stage:'new',dealValue:4999,
   createdAt:new Date(Date.now()-9e8).toISOString(),activities:[]},
];
globalThis.__TASKS__=[
  {id:'t1',title:'Mine and open',owner:'Garrett',due:day(0),done:false,revenue:3,urgency:3,effort:3,createdAt:new Date(Date.now()-864e5).toISOString()},
  {id:'t2',title:'Belongs to Logan',owner:'Logan',due:day(0),done:false,revenue:3,urgency:3,effort:3,createdAt:new Date(Date.now()-864e5).toISOString()},
  {id:'t3',title:'Shared with both',owner:'Both',due:day(0),done:false,revenue:3,urgency:3,effort:3,createdAt:new Date(Date.now()-864e5).toISOString()},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bln.mjs',out.outputFiles[0].text);
const mod=await import('./.bln.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,120));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===l); if(b) await click(b); await act(async()=>{await new Promise(r=>setTimeout(r,60));});};
const seg=label=>[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim().startsWith(label));

console.log('\nTASKS — opens on Mine');
await nav('Tasks');
const mine=seg('Mine'), all=seg('All');
ok('Mine chip is the one switched on', !!mine&&/\bon\b/.test(mine.className), 'mine='+(mine&&mine.className)+' all='+(all&&all.className));
const body=()=>document.body.textContent||'';
ok('my own task is listed', /Mine and open/.test(body()));
ok('a task owned by someone else is not', !/Belongs to Logan/.test(body()));
ok('a shared task still counts as mine', /Shared with both/.test(body()));

console.log('\nTASKS — a task you type lands in Focus');
const input=[...document.querySelectorAll('input')].find(i=>/Add a task/.test(i.placeholder||''));
await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  setter.call(input,'Ring the roofer back');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
});
const addBtn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='Add');
await click(addBtn);
await act(async()=>{await new Promise(r=>setTimeout(r,60));});
const rowOf=title=>[...document.querySelectorAll('.card')]
  .filter(e=>(e.textContent||'').includes(title)&&e.querySelector('.task-focus'))
  .sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length)[0];
const row=rowOf('Ring the roofer back');
ok('the new task is on screen', !!row);
const fbtn=row&&row.querySelector('.task-focus');
ok('its Focus toggle is already on', !!fbtn&&/\bon\b/.test(fbtn.className), fbtn?fbtn.className:'no focus button');
ok('a Focus section exists to hold it', /Free time/.test(document.body.textContent||''));

console.log('\nNAMES — the person shows next to the business');
await nav('Dashboard');
const pipeKpi=[...document.querySelectorAll('.kpi, .kpi-c, [class*=kpi]')].find(e=>/Open Pipeline/i.test(e.textContent||''));
if(pipeKpi) await click(pipeKpi);
await act(async()=>{await new Promise(r=>setTimeout(r,60));});
const rows=[...document.querySelectorAll('.drow-t')].map(e=>(e.textContent||'').trim());
ok('a named lead reads "Person — Business"', rows.some(r=>/Devin Hammann — Kleen Stripe/.test(r)), rows.join(' | ')||'(no rows)');
ok('a company with no contact still reads cleanly', rows.some(r=>/^Koehn Painting$/.test(r)), rows.join(' | ')||'(no rows)');

console.log('\n'+pass+' passed, '+fail+' failed\n');
process.exit(fail?1:0);
