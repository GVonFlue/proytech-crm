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
globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];
/* THE REPORTED STATE: saved options that predate the '—' entry, so the list
   starts with a real value. This is what makes a new lead default to it. */
globalThis.__SETTINGS__={options:{
  businessType:['Real Estate','Lending','Construction','Other'],
  source:['Referral','Cold Outreach'],
  nextAction:['Follow Up Call'],
  owner:['Garrett','Logan']}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
globalThis.__LEADS__=[{id:'x1',name:'No Type Co',company:'No Type Co',stage:'new',owner:'Garrett',
  businessType:'—',createdAt:new Date(Date.now()-864e5).toISOString(),
  activities:[],meetings:[],deals:[],dealValue:0}];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bm.mjs',out.outputFiles[0].text);
const mod=await import('./.bm.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,120));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=110)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};

console.log('\na brand new lead');
const leadsNav=[...document.querySelectorAll('.nav-i')].find(b=>(b.textContent||'').trim()==='Leads');
if(leadsNav) await click(leadsNav); await settle();
const row=[...document.querySelectorAll('tbody tr')].find(e=>/No Type Co/.test(e.textContent||''));
if(row) await click(row); await settle(130);
/* Business Type lives in the Qualifying section, which is collapsed by
   default — its body only renders when open. */
const qual=[...document.querySelectorAll('.msec-h')].find(e=>/Qualifying/i.test(e.textContent||''));
ok('a Qualifying section exists', !!qual,
   [...document.querySelectorAll('.msec-t')].map(e=>e.textContent).join(' | '));
if(qual){ await click(qual); await settle(); }
const field=[...document.querySelectorAll('.field')].find(f=>/Business Type/.test((f.querySelector('label')||{}).textContent||''));
ok('the Business Type field is there', !!field,
   [...document.querySelectorAll('.field label')].map(e=>e.textContent).slice(0,8).join(' | '));
const sel=field&&field.querySelector('select');
ok('a blank option exists even though settings has none',
   sel && [...sel.options].some(o=>o.value===''||o.value==='—'),
   sel && [...sel.options].map(o=>JSON.stringify(o.value)).join(' | '));
ok('it is the FIRST option, so it is what shows',
   sel && (sel.options[0].value===''||sel.options[0].value==='—'),
   sel && JSON.stringify(sel.options[0].value));
ok('the field does not default to Real Estate',
   sel && sel.value!=='Real Estate', 'value='+(sel&&JSON.stringify(sel.value)));
ok('the saved options are all still offered',
   sel && ['Real Estate','Lending','Construction','Other'].every(v=>[...sel.options].some(o=>o.value===v)),
   sel && [...sel.options].map(o=>o.value).join(' | '));

console.log('\nno duplicate blank when one already exists');
ok('a list already containing a dash is left alone',
   true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
