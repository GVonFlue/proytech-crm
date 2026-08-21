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
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  {id:'a1',name:'Vet One',company:'Vet Co',stage:'new',owner:'Garrett',createdAt:ago(9),
   labels:['Veteran','Military'],activities:[],meetings:[],deals:[],dealValue:0},
  {id:'a2',name:'Cop One',company:'Cop Co',stage:'new',owner:'Garrett',createdAt:ago(9),
   labels:['Police'],activities:[],meetings:[],deals:[],dealValue:0},
  {id:'a3',name:'Plain One',company:'Plain Co',stage:'new',owner:'Garrett',createdAt:ago(9),
   activities:[],meetings:[],deals:[],dealValue:0},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bk.mjs',out.outputFiles[0].text);
const mod=await import('./.bk.mjs?v='+Date.now());
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
/* .namecell, not td:first-child — the first cell is the batch-select checkbox
   for an owner, and "the first column" was never what this meant. */
const rowNames=()=>[...document.querySelectorAll('tbody tr .namecell')].map(e=>(e.textContent||'').trim());
const setSel=async(el,v)=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});};
const setV=async(el,v)=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const W=id=>globalThis.__WRITES__.filter(w=>w.id===id).at(-1);

console.log('\nfiltering by label');
await nav('Leads');
const sel=[...document.querySelectorAll('.selctl')].find(e=>/All labels/.test(e.textContent||''));
ok('a label filter appears', !!sel, [...document.querySelectorAll('.selctl')].map(e=>e.textContent.slice(0,18)).join(' | '));
ok('it counts each label', /Veteran · 1/.test((sel||{}).textContent||''), (sel||{}).textContent);
await setSel(sel,'Military'); await settle();
ok('only the military contact shows', rowNames().length===1&&/Vet One/.test(rowNames()[0]), rowNames().join(' | '));
await setSel(sel,'all'); await settle();
ok('clearing brings everyone back', rowNames().length===3, rowNames().join(' | '));

console.log('\nsearch finds them too');
const q=document.querySelector('input[placeholder*="Search"]');
await setV(q,'police'); await settle();
ok('typing a label filters', rowNames().length===1&&/Cop One/.test(rowNames()[0]), rowNames().join(' | '));
await setV(q,''); await settle();

console.log('\nlabelling someone');
const row=[...document.querySelectorAll('tbody tr')].find(e=>/Plain One/.test(e.textContent||''));
if(row) await click(row); await settle(130);
const chips=[...document.querySelectorAll('.lblchip')];
ok('the picker is on the lead', chips.length>3, chips.map(c=>c.textContent).slice(0,5).join(' | '));
const fire=chips.find(c=>/Fire/.test(c.textContent||''));
ok('the seeded vocabulary is there', !!fire);
await click(fire); await settle();
ok('it saved to the lead', (W('a3')||{}).labels&&W('a3').labels.includes('Fire / EMS'), JSON.stringify((W('a3')||{}).labels));
await click([...document.querySelectorAll('.lblchip')].find(c=>/Fire/.test(c.textContent||''))); await settle();
ok('clicking again removes it', !((W('a3')||{}).labels||[]).includes('Fire / EMS'), JSON.stringify((W('a3')||{}).labels));

console.log('\nadding a new label from the lead');
dom.window.prompt=()=>'Rotary Club';
await click([...document.querySelectorAll('.lblchip.add')][0]); await settle(900);
ok('it went on the lead', ((W('a3')||{}).labels||[]).includes('Rotary Club'), JSON.stringify((W('a3')||{}).labels));
const sw=(globalThis.__SETTINGS_WRITES__||[]).at(-1);
ok('and into the shared vocabulary', sw&&(sw.options||{}).labels&&sw.options.labels.includes('Rotary Club'),
   JSON.stringify(sw&&sw.options&&sw.options.labels));
ok('the built-in labels survived', sw&&sw.options.labels.includes('Military')&&sw.options.labels.includes('Police'),
   JSON.stringify(sw&&sw.options&&sw.options.labels));

console.log('\nSettings can edit the list');
await nav('Settings'); await settle(120);
const body=document.body.textContent||'';
ok('a Labels editor exists', /Labels \(Military, Police/.test(body), body.slice(0,200));
ok('it is seeded with the defaults, not empty', /Veteran/.test(body));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
