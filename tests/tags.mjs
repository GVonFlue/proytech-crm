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
globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;
globalThis.__USERS__=[
  {id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
  {id:'u_logan',name:'Logan',email:'logan@getproytech.com',role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  {id:'l1',name:'Tag Target',company:'Tag Co',stage:'new',owner:'Garrett',createdAt:ago(10),
   meetings:[],deals:[],dealValue:0,activities:[]},
  /* Logan already tagged Garrett on this one */
  /* owned by Garrett so it's reachable in the default "Mine" view. Logan
     tagging Garrett on Logan's OWN lead is still covered by l3 and l4. */
  {id:'l2',name:'Waiting Co',company:'Waiting Co',stage:'new',owner:'Garrett',createdAt:ago(20),
   meetings:[],deals:[],dealValue:0,
   activities:[{id:'a1',ts:ago(1),type:'Note',text:'Needs a quote by Friday',who:'Logan',tags:['Garrett']}]},
  /* tagged for Logan only — must NOT show on Garrett's day */
  {id:'l3',name:'Logans Thing',company:'Logan Co',stage:'new',owner:'Logan',createdAt:ago(20),
   meetings:[],deals:[],dealValue:0,
   activities:[{id:'a2',ts:ago(1),type:'Note',text:'Logan handles this',who:'Garrett',tags:['Logan']}]},
  /* already cleared by Garrett */
  {id:'l4',name:'Done Co',company:'Done Co',stage:'new',owner:'Logan',createdAt:ago(20),
   meetings:[],deals:[],dealValue:0,
   activities:[{id:'a3',ts:ago(2),type:'Note',text:'Old ask',who:'Logan',tags:['Garrett'],tagsDone:['Garrett']}]},
  /* a follow-up overdue and a meeting today */
  {id:'l5',name:'Overdue Co',company:'Overdue Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   followUp:day(-3),nextAction:'Call about the proposal',meetings:[],deals:[],dealValue:0,activities:[]},
  {id:'l6',name:'Today Mtg',company:'Today Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   meetings:[{id:'m1',title:'Coffee',mtype:'Coffee',start:day(0)+'T09:30:00',end:day(0)+'T10:00:00',
     status:'',who:'Garrett',createdAt:ago(2)}],deals:[],dealValue:0,activities:[]},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bj.mjs',out.outputFiles[0].text);
const mod=await import('./.bj.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,110));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=80)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const setV=async(el,v)=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const W=id=>globalThis.__WRITES__.filter(w=>w.id===id).at(-1);

console.log('\nYour day is the first thing on the dashboard');
await nav('Dashboard');
const groups=[...document.querySelectorAll('.kgroup')].map(e=>(e.textContent||'').trim());
ok('it sits above everything else', /^Your day/.test(groups[0]||''), groups.slice(0,3).join(' | '));
const td=document.querySelector('.today');
ok('the section renders', !!td);

console.log('\nit shows what is waiting on YOU');
const txt=(td||{}).textContent||'';
ok("Logan's tag is listed", /Waiting Co/.test(txt)&&/quote by Friday/.test(txt), txt.slice(0,200));
ok("a tag meant for Logan is NOT", !/Logans Thing/.test(txt), txt.slice(0,240));
ok('a tag already cleared is NOT', !/Done Co/.test(txt), txt.slice(0,240));
ok('an overdue follow-up is listed', /Overdue Co/.test(txt)&&/3d overdue/.test(txt), txt.slice(0,300));
ok("today's meeting is listed", /Today Mtg/.test(txt), txt.slice(0,320));
ok('the count adds up to three', /3 things/.test((document.querySelector('.kgroup')||{}).textContent||''),
   (document.querySelector('.kgroup')||{}).textContent);

console.log('\ntagging someone from a note');
await nav('Leads');
const row=[...document.querySelectorAll('tbody tr')].find(e=>/Tag Target/.test(e.textContent||''));
if(row) await click(row); await settle(110);
const opener=document.querySelector('.compose-open');
if(opener){ await click(opener); await settle(); }
const chip=[...document.querySelectorAll('.tagchip')].find(b=>/Logan/.test(b.textContent||''));
ok('a Logan chip is offered', !!chip,
   [...document.querySelectorAll('.tagchip')].map(b=>b.textContent).join(' | '));
ok('you cannot tag yourself', ![...document.querySelectorAll('.tagchip')].some(b=>/Garrett/.test(b.textContent||'')));
await click(chip); await settle();
ok('it says where it will show', /Logan's dashboard/.test((document.querySelector('.tagpick-n')||{}).textContent||''),
   (document.querySelector('.tagpick-n')||{}).textContent);
const ta=document.querySelector('.act-input');
await setV(ta,'Can you price this out @Logan');
const logBtn=[...document.querySelectorAll('button')].find(b=>/^Log Note$/.test((b.textContent||'').trim()));
await click(logBtn); await settle();
const w=W('l1');
const note=(w&&w.activities||[])[0];
ok('the note saved with the tag', note && (note.tags||[]).includes('Logan'), JSON.stringify(note));
ok('the trailing @Logan is stripped from the text', note && !/@Logan/.test(note.text||''), note&&note.text);
ok('the rest of the sentence survives', note && /price this out/.test(note.text||''), note&&note.text);
ok('the chip resets after logging', ![...document.querySelectorAll('.tagchip.on')].length);

console.log('\nclearing a tag is per person');
await nav('Dashboard');
const before=(document.querySelector('.today')||{}).textContent||'';
ok('it is still on the dashboard', /Waiting Co/.test(before));
/* close the open modal first — nav alone leaves it mounted, so the next click
   lands on a table row that's behind it */
const xBtn=[...document.querySelectorAll('.m-x, .modal button')].find(b=>/^$/.test((b.textContent||'').trim()));
if(xBtn) await click(xBtn);
await settle(60);
await nav('Leads');
/* match on the NAME cell specifically — "Waiting Co" is both the name and the
   company, and other rows can contain the substring in other columns */
const row2=[...document.querySelectorAll('tbody tr')]
  .find(e=>/^Waiting Co/.test(((e.querySelector('td')||{}).textContent||'').trim()));
ok('found the Waiting Co row', !!row2,
   [...document.querySelectorAll('tbody tr td:first-child')].map(e=>e.textContent.slice(0,14)).join(' | '));
if(row2) await click(row2); await settle(140);
/* the modal may still be showing the previous lead if the row order shifted —
   confirm we're on Waiting Co before asserting on its tags */
ok('the Waiting Co lead is open', /Waiting Co/.test(document.body.textContent||''),
   (document.querySelector('.m-head')||{}).textContent||'');
const ftag=[...document.querySelectorAll('.ftag')].find(e=>/Garrett/.test(e.textContent||''));
ok('the tag shows on the activity row', !!ftag,
   [...document.querySelectorAll('.ftag')].map(e=>e.textContent).join(' | '));
if(ftag){ await click(ftag); await settle();
  const w2=W('l2');
  ok('clearing marks only that person', w2 && (w2.activities||[])[0] && (w2.activities[0].tagsDone||[]).includes('Garrett'),
     JSON.stringify(w2&&w2.activities&&w2.activities[0]));
  ok('the tag itself is kept as history', w2 && (w2.activities[0].tags||[]).includes('Garrett')); }

console.log('\nactivity log is readable');
/* Waiting Co has one note on it from Logan. */
const bar=document.querySelector('.touchbar');
ok('a contact summary sits above the feed', !!bar, (document.querySelector('.m-right')||{}).textContent?.slice(0,120));
ok('it counts conversations, not just rows', bar && /conversation|No calls or meetings/.test(bar.textContent||''), bar&&bar.textContent);
ok('the composer is collapsed by default', !!document.querySelector('.compose-open')&&!document.querySelector('.act-input'),
   'compose-open='+!!document.querySelector('.compose-open')+' input='+!!document.querySelector('.act-input'));
await click(document.querySelector('.compose-open')); await settle();
ok('clicking it opens the composer', !!document.querySelector('.act-input'));
const chips=[...document.querySelectorAll('.afilter button')].map(b=>b.textContent.trim());
ok('every filter chip carries a count', chips.some(c=>/^All \(\d+\)/.test(c)), chips.join(' | '));
ok('types with none are dimmed, not hidden',
   [...document.querySelectorAll('.afilter button.none')].length>0,
   chips.join(' | '));
ok('the feed groups by day', !!document.querySelector('.fday'),
   [...document.querySelectorAll('.fday')].map(e=>e.textContent).join(' | '));

console.log('\nthe feed gets the room');
{
  const css=[...document.querySelectorAll('style')].map(e=>e.textContent||'').join('');
  ok('the feed claims the leftover height', /\.feed\{[^}]*flex:1 1 auto/.test(css),
     (css.match(/\.feed\{[^}]*\}/)||[''])[0].slice(0,110));
  ok('and can actually shrink (min-height:0)', /\.feed\{[^}]*min-height:0/.test(css));
  ok('the column no longer scrolls too', /\.m-right\{[^}]*overflow:hidden/.test(css),
     (css.match(/\.m-right\{[^}]*\}/)||[''])[0].slice(0,110));
  ok('delete is pinned, not in the scroll flow', /\.m-danger\{[^}]*flex:none/.test(css));
  ok('on a phone the feed stops being its own scroller',
     /\.feed\{flex:none;min-height:auto;overflow:visible\}/.test(css));
  const feed=document.querySelector('.feed');
  ok('the feed element is present', !!feed);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
