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

/* ACTIVITY: the compact layout, and "What got done / Everything".

   Three things arrived on this lead today and only ONE of them is somebody's
   work: a call. The other two are a note a spreadsheet brought in and a note
   the app stamped about itself. Before this, all three counted, so a single
   import could make a day look busy. The numbers must count the call only,
   whichever way the switch is set; the log hides the other two by default and
   shows them, labelled, under Everything. */
const now=new Date(); now.setHours(9,0,0,0);
const ts=n=>new Date(now.getTime()+n*60000).toISOString();
globalThis.__LEADS__=[{
  id:'l1', name:'Dana Reyes', company:'Reyes Dental', stage:'new', owner:'Garrett',
  createdAt:new Date(now.getTime()-30*864e5).toISOString(),
  activities:[
    {id:'a1',ts:ts(1),type:'Note',text:'Came in on the Chamber list',who:'Garrett',imported:true},
    {id:'a2',ts:ts(2),type:'Note',text:'Stage moved: New → Contacted',who:'Garrett'},
    {id:'a3',ts:ts(3),type:'Call',text:'Talked through pricing',who:'Garrett'},
  ],
  meetings:[],
}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
  logLevel:'silent'});
fs.writeFileSync('tests/.bactl.mjs',out.outputFiles[0].text);
const mod=await import('./.bactl.mjs?v='+Date.now());
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

console.log('\nActivity page — one call, one import note, one app note');
const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Activity');
ok('Activity page reachable', !!nav);
if(nav) await click(nav);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});

const total=kpiVal('Total logged');
ok('Total logged counts the call only', /^1 \|\|/.test(total), total.slice(0,80));
ok('and the note is not mistaken for a cancellation', !/cancelled/.test(total), total);
const notes=kpiVal('Notes');
ok('Notes counts 0: neither note was written by a person', /^0 \|\|/.test(notes), notes.slice(0,60));

const grid=document.querySelector('.kpis.act-kpis');
ok('the tiles sit in the compact grid', !!grid && grid.querySelectorAll('.kpi').length>=7,
   grid?('tiles='+grid.querySelectorAll('.kpi').length):'no .kpis.act-kpis');

let rows=[...document.querySelectorAll('.act-row')];
ok('What got done shows the call only', rows.length===1 && /pricing/.test(rows[0].textContent||''), 'rows='+rows.length);
ok('the log says how many entries it shows', /Log\s*1 entry/.test((document.querySelector('.act-loghead')||{}).textContent||''));

const every=[...document.querySelectorAll('.act-loghead .seg button')].find(b=>/Everything/.test(b.textContent||''));
ok('there is an Everything switch', !!every);
if(every) await click(every);
await act(async()=>{await new Promise(r=>setTimeout(r,30));});
rows=[...document.querySelectorAll('.act-row')];
ok('Everything shows all three', rows.length===3, 'rows='+rows.length);
const tags=[...document.querySelectorAll('.act-row.machine .act-machine')].map(e=>(e.textContent||'').trim()).sort();
ok('and labels the two the app wrote', tags.join('|')==='Imported|Written by the app', tags.join('|'));
ok('the numbers did not move', /^1 \|\|/.test(kpiVal('Total logged')), kpiVal('Total logged').slice(0,60));

console.log('\nthe Monday Huddle asks the same question');
{
  /* Structural, by named anchor: the Huddle's per-type counts feed its summary
     and are not rendered as a tile a jsdom test can read. The regression this
     pins is someone re-inlining a list of note prefixes in weekSlice. */
  const src=fs.readFileSync('src/App.jsx','utf8');
  const ws=src.indexOf('function weekSlice('), end=src.indexOf('\n}\n',ws);
  const body=ws>=0&&end>ws?src.slice(ws,end):'';
  ok('weekSlice found', !!body);
  ok('weekSlice decides app-written notes with isAppWritten', /const sys=isAppWritten\(a\)/.test(body));
  ok('and no longer keeps its own list of note prefixes', !/startsWith\('Stage moved:'\)\)\s*;/.test(body) && !/a\.text==='Lead created\.'/.test(body));
  ok('the Activity screen uses the same predicate', /machine:isAppWritten\(a\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
try{ fs.unlinkSync('tests/.bactl.mjs'); }catch{}
process.exit(fail?1:0);
