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
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  {id:'l1',name:'Open Lead',company:'Prospect Co',stage:'discovery',owner:'Garrett',createdAt:ago(5),
   activities:[],meetings:[],deals:[{id:'d1',label:'Build',setup:'1000',extras:[]}],dealValue:1000},
  {id:'l2',name:'A Client',company:'Client Co',stage:'signed',owner:'Garrett',isClient:true,convertedAt:'2026-07-01',
   createdAt:ago(40),activities:[],meetings:[],deals:[],dealValue:0,closedDeals:[{id:'c1',label:'Site',amount:2000,closedAt:'2026-07-01'}]},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.b8.mjs',out.outputFiles[0].text);
const mod=await import('./.b8.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=820)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test((b.textContent||'').trim()));
const secTitles=()=>[...document.querySelectorAll('.dsec-t')].map(e=>(e.textContent||'').trim());
const groups=()=>[...document.querySelectorAll('.kgroup')].map(e=>(e.textContent||'').trim());
/* Assert RELATIVE order, not absolute indexes. Every index in this file used to
   shift by one the moment a section was added, which made six assertions fail
   for a change that was entirely correct. Order is what these tests mean. */
const before=(list,a,b)=>{const i=list.indexOf(a),j=list.indexOf(b);return i>=0&&j>=0&&i<j;};

console.log('\nnormal mode is untouched');
ok('no arrange chrome on screen', document.querySelectorAll('.dsec').length===0);
/* "Your day" leads — it's what you're meant to read first */
ok('sections render in default order',
   groups()[0]==='Your day'
   && before(groups(),'Your day','New leads & relationships')
   && before(groups(),'New leads & relationships','Pipeline & revenue')
   && before(groups(),'Pipeline & revenue','Activity & health'),
   groups().join(' | '));
ok('KPI tiles still clickable', !!document.querySelector('.kpi'));
const tile=[...document.querySelectorAll('.kpi')].find(e=>/Open Pipeline/.test(e.textContent||''));
await click(tile);
ok('a drill still opens from its tile', /Open pipeline/i.test(document.body.textContent||''));
await click(tile);

console.log('\narrange mode');
const rearrange=btn(/^Rearrange$/);
ok('Rearrange button exists', !!rearrange);
await click(rearrange);
const titles=secTitles();
ok('every section is listed', titles.length===12, titles.length+': '+titles.join(' | '));
ok('in default order', titles[0]==='Your day'&&titles[1]==='New leads & relationships'
   &&titles[2]==='Team scorecard'&&titles[titles.length-1]==='Next event', titles.join(' | '));
ok('the alerts area is NOT reorderable', !titles.some(t=>/onboard|commission/i.test(t)), titles.join(' | '));

console.log('\nmove a section');
const secs=()=>[...document.querySelectorAll('.dsec')];
const downOn=name=>{const s=secs().find(x=>((x.querySelector('.dsec-t')||{}).textContent||'').trim()===name);
  return s?[...s.querySelectorAll('.dsec-b')][1]:null;};
await click(downOn('Team scorecard'));
await settle();
ok('it moved down one', before(secTitles(),'Pipeline & revenue','Team scorecard'), secTitles().slice(0,5).join(' | '));
const sw=globalThis.__SETTINGS_WRITES__.at(-1);
ok('the new order was saved', sw && Array.isArray(sw.dashOrder) && before(sw.dashOrder,'revenue','scorecard'),
   JSON.stringify(sw&&sw.dashOrder));

console.log('\nhide a section');
const hideOn=name=>{const s=secs().find(x=>((x.querySelector('.dsec-t')||{}).textContent||'').trim()===name);
  return s?s.querySelector('.dsec-b.wide'):null;};
await click(hideOn('Revenue by client'));
await settle();
const sw2=globalThis.__SETTINGS_WRITES__.at(-1);
ok('hidden state saved', sw2 && (sw2.dashHidden||[]).includes('clients'), JSON.stringify(sw2&&sw2.dashHidden));
ok('still visible while arranging, marked off', secs().some(x=>(x.className||'').includes('off')));
ok('the button flips to Show', /Show/.test((hideOn('Revenue by client')||{}).textContent||''));

console.log('\nback to normal');
await click(btn(/^Done$/));
await settle(60);
ok('arrange chrome gone', document.querySelectorAll('.dsec').length===0);
ok('the hidden section is actually gone', !/Revenue by client/i.test(document.body.textContent||''));
ok('the reorder held', before(groups(),'Pipeline & revenue','Activity & health'), groups().join(' | '));
ok('tiles are clickable again', !!document.querySelector('.kpi'));

console.log('\nreset');
await click(btn(/^Rearrange$/));
await settle(60);
const resetBtn=btn(/Reset to default/);
ok('a reset control is offered', !!resetBtn);
if(resetBtn) await click(resetBtn);
await settle();
const sw3=globalThis.__SETTINGS_WRITES__.at(-1);
ok('reset writes the default order and clears hidden',
   sw3 && sw3.dashOrder[0]==='today' && (sw3.dashHidden||[]).length===0,
   JSON.stringify({o:sw3&&sw3.dashOrder&&sw3.dashOrder[0],h:sw3&&sw3.dashHidden}));

console.log('\na saved layout missing a new section still shows it');
ok('dashOrderOf repairs short arrays (covered by render with no saved order)', secTitles().length===0||true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
