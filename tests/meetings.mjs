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
globalThis.fetch=async(u,o)=>{
  if(String(u).includes('google-status')) return {ok:true,json:async()=>({connected:true,email:'admin@getproytech.com'})};
  if(String(u).includes('/api/calendar-event')){ globalThis.__CAL__.push(o&&o.body?JSON.parse(o.body):null);
    return {ok:true,json:async()=>({ok:true,eventId:'ev1',htmlLink:'https://cal/x'})}; }
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};
const pad=n=>String(n).padStart(2,'0');
const local=n=>{const d=new Date(Date.now()+n*864e5);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T10:00:00`;};
const iso=n=>new Date(Date.now()+n*864e5).toISOString();
const M=(id,t,type,start,status,extra={})=>({id,title:t,mtype:type,start,end:start,status,who:'Garrett',createdAt:iso(-9),...extra});
globalThis.__LEADS__=[
  {id:'l1',name:'Future Co',company:'Future Co',owner:'Garrett',stage:'new',createdAt:iso(-30),activities:[],deals:[],dealValue:0,
   meetings:[M('m1','Coffee chat','Coffee',local(4),''), M('m5','Later one','Discovery Call',local(9),'')]},
  {id:'l2',name:'Past Co',company:'Past Co',owner:'Garrett',stage:'new',createdAt:iso(-30),activities:[],deals:[],dealValue:0,
   meetings:[M('m2','Old pitch','Proposal / Pitch',local(-2),'')]},
  {id:'l3',name:'Done Co',company:'Done Co',owner:'Logan',stage:'new',createdAt:iso(-30),activities:[],deals:[],dealValue:0,
   meetings:[M('m3','Held one','Discovery Call',local(-5),'held',{eventId:'ev9',htmlLink:'https://cal/y'})]},
  {id:'l4',name:'Nodate Co',company:'Nodate Co',owner:'Garrett',stage:'new',createdAt:iso(-30),activities:[],deals:[],dealValue:0,
   meetings:[M('m4','Someday','Coffee',iso(-9),'',{logged:true,createdAt:iso(-9)})]},
];
globalThis.__LEADS__[3].meetings[0].start=globalThis.__LEADS__[3].meetings[0].createdAt;

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bd.mjs',out.outputFiles[0].text);
const mod=await import('./.bd.mjs?v='+Date.now());
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
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const tabBtn=l=>[...document.querySelectorAll('.mtab')].find(b=>(b.textContent||'').trim().startsWith(l));
const names=()=>[...document.querySelectorAll('.mrow-name')].map(e=>(e.textContent||'').trim());
const W=id=>globalThis.__WRITES__.filter(w=>w.id===id).at(-1);

console.log('\nthe tab exists and lists everything');
await nav('Meetings');
ok('page renders', /Everything booked, everywhere/i.test(document.body.textContent||''));
const tabs=[...document.querySelectorAll('.mtab')].map(b=>(b.textContent||'').replace(/\s/g,'')).join('|');
ok('Upcoming counts 2', /Upcoming2/.test(tabs), tabs);
ok('Needs status counts 1', /Needsstatus1/.test(tabs), tabs);
ok('Needs a date counts 1', /Needsadate1/.test(tabs), tabs);
ok('Held counts 1', /Held1/.test(tabs), tabs);

console.log('\nupcoming is soonest first');
ok('two rows', names().length===2, names().join(' | '));
ok('nearest meeting first', names()[0]==='Future Co', names().join(' | '));

console.log('\nsearch and owner filter');
const q=document.querySelector('.mtg-q');
const setV=async(el,v)=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
await setV(q,'past'); await settle();
await click(tabBtn('Needs status')); await settle();
ok('search narrows to the match', names().length===1&&names()[0]==='Past Co', names().join(' | '));
await setV(q,''); await settle();

console.log('\nchange the type from here');
const sel=document.querySelector('.mrow-type');
ok('a type dropdown is on the row', !!sel);
await act(async()=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  st.call(sel,'Onboarding'); sel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
await settle();
ok('the type was saved to the lead', (W('l2').meetings||[]).some(m=>m.id==='m2'&&m.mtype==='Onboarding'),
   JSON.stringify((W('l2').meetings||[]).map(m=>m.mtype)));

console.log('\nmark what happened');
const held=[...document.querySelectorAll('.ms-b.held')][0];
await click(held); await settle();
ok('status saved as held', (W('l2').meetings||[]).some(m=>m.id==='m2'&&m.status==='held'),
   JSON.stringify((W('l2').meetings||[]).map(m=>m.status)));
ok('and it logged a Meeting activity', (W('l2').activities||[]).some(a=>a.type==='Meeting'&&/^Met:/.test(a.text||'')),
   JSON.stringify((W('l2').activities||[]).map(a=>a.text)));

console.log('\ngive an undated meeting a date');
await click(tabBtn('Needs a date')); await settle();
ok('the undated one is here', names().length===1&&names()[0]==='Nodate Co', names().join(' | '));
ok('no Held/No-show offered on it', !document.querySelector('.mrow .ms-b'));
const dt=document.querySelector('.mtg-fix input[type=datetime-local]');
ok('a date picker is offered instead', !!dt);
ok('and it steps in 15s', dt&&dt.getAttribute('step')==='900', dt&&dt.getAttribute('step'));
if(dt){ const st=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  const d=new Date(Date.now()+3*864e5);
  const v=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T14:30`;
  await act(async()=>{st.call(dt,v);dt.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await click([...document.querySelectorAll('.mtg-fix button')].find(b=>/Set date/.test(b.textContent))); await settle();
  const m4=(W('l4').meetings||[]).find(m=>m.id==='m4');
  ok('the date was written', m4&&/T14:30/.test(m4.start||''), m4&&m4.start);
  ok('and it is no longer dateless', m4&&m4.dateUnknown===false, JSON.stringify(m4&&{d:m4.dateUnknown}));
}

console.log('\ncancel one');
dom.window.confirm=()=>true;
await click(tabBtn('Held')); await settle();
/* m2 was marked held earlier, so the Held tab now has two rows. Target Done
   Co's specifically — it's the one with a calendar event to delete. */
const rows=[...document.querySelectorAll('.mrow')];
const target=rows.find(r=>/Done Co/.test(r.textContent||''));
ok('the held meeting with a calendar event is listed', !!target,
   rows.map(r=>(r.querySelector('.mrow-name')||{}).textContent).join(' | '));
const del=target&&target.querySelector('.ev-x');
ok('a cancel button is on the row', !!del);
const calBefore=globalThis.__CAL__.length;
await click(del); await settle();
const w3=W('l3');
ok('the meeting is gone from the lead', !(w3.meetings||[]).some(m=>m.id==='m3'),
   JSON.stringify((w3.meetings||[]).map(m=>m.id)));
ok('a cancellation note was logged', (w3.activities||[]).some(a=>/^Cancelled:/.test(a.text||'')),
   JSON.stringify((w3.activities||[]).map(a=>a.text)));
ok('the calendar event was deleted too', globalThis.__CAL__.length>calBefore
   && globalThis.__CAL__.at(-1) && globalThis.__CAL__.at(-1).action==='delete',
   JSON.stringify(globalThis.__CAL__.at(-1)));

console.log('\nthe dashboard agrees');
await nav('Dashboard');
const tile=[...document.querySelectorAll('.kpi')].find(e=>/Meetings Booked/.test(e.textContent||''));
ok('dashboard still renders after all that', !!tile);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
