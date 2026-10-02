import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','KeyboardEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const mAgo=n=>{const d=new Date();d.setMonth(d.getMonth()-n);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;};

globalThis.__LEADS__=[
  {id:'c1',name:'Devin Hammann',company:'Kleen Stripe',stage:'won',isClient:true,
   createdAt:new Date(Date.now()-2e9).toISOString(),activities:[],
   retainer:249,retainerActive:true,retainerStart:mAgo(3)+'-01',
   deals:[{id:'d1',label:'Website build',service:'Website',setup:1500,website:1499,integration:'',extras:[]}],
   payments:[{id:'p1',amount:1500,date:mAgo(3)+'-12'},{id:'p2',amount:1499,date:mAgo(1)+'-08'}]},
  {id:'c2',name:'Justus Kidd',company:'Agent Kidd',stage:'won',isClient:true,
   createdAt:new Date(Date.now()-2e9).toISOString(),activities:[],
   deals:[{id:'d2',label:'Business Suite',service:'Business Suite',setup:2999,website:'',integration:'',extras:[]}],
   payments:[{id:'p3',amount:2999,date:mAgo(2)+'-20'}]},
  {id:'o1',name:'Alex Colon',company:'At Home Wichita',stage:'new',dealValue:1999,
   createdAt:new Date(Date.now()-9e8).toISOString(),activities:[]},
];
globalThis.__LEADS__.push({id:'o2',name:'Michael Gomm',company:'The Glass Guru',stage:'new',createdAt:new Date(Date.now()-9e8).toISOString(),activities:[],
  closedDeals:[{id:'cd1',label:'Starter site',amount:1800,closedAt:'2026-08-20',by:'Garrett'}]});
globalThis.__SETTINGS__={options:{},services:[{id:'svc_website',name:'Website',price:'2500'},{id:'svc_crm',name:'CRM',price:'1500'},{id:'svc_automations',name:'Automations',price:'1200'},{id:'svc_webcrm',name:'Web+CRM',price:'3500'},{id:'svc_gbp',name:'Google Business Profile setup',price:''}]};
globalThis.__TXNS__=[{id:'t1',type:'expense',amount:420,date:mAgo(1)+'-05',category:'Hosting'}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bspick.mjs',out.outputFiles[0].text);
const mod=await import('./.bspick.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,160));});



/* ADDING A DEAL FROM A SERVICE, DRIVEN THROUGH THE REAL SCREEN.
   servicecatalog.mjs checks the functions; this one clicks what Garrett clicks.
   It exists because a source check passed while the screen printed a stray 0
   beside "Add line item" (a numeric false rendered by React). Seen red: the
   un-coerced legacy check; Add a deal back on the old prompt; the catalog
   price auto-filled into a new deal. */
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});
  await act(async()=>{await new Promise(r=>setTimeout(r,80));});};
const change=async (el,v)=>{ await act(async()=>{ const set=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  set.call(el,v); el.dispatchEvent(new dom.window.Event('change',{bubbles:true})); }); await act(async()=>{await new Promise(r=>setTimeout(r,80));}); };
const pipeKpi=[...document.querySelectorAll('.kpi, .kpi-c, [class*=kpi]')].find(e=>/Open Pipeline/i.test(e.textContent||''));
if(pipeKpi) await click(pipeKpi);
const c=[...document.querySelectorAll('.drow-t')].find(e=>/Michael Gomm/.test(e.textContent||'')); if(c) await click(c);
await act(async()=>{await new Promise(r=>setTimeout(r,120));});
const t=[...document.querySelectorAll('.mj')].find(b=>/Deal/.test(b.textContent||'')); if(t) await click(t);
ok('the deal panel opened', !!t);

const add=document.querySelector('.deal-add-btn');
ok('there is an Add a deal button', !!add); if(add) await click(add);
const opts=[...document.querySelectorAll('.svc-opt')].map(b=>b.querySelector('b').textContent);
ok('it opens the service picker, not a prompt',
  JSON.stringify(opts)===JSON.stringify(['Website','CRM','Automations','Web+CRM','Google Business Profile setup','Custom deal']), JSON.stringify(opts));
ok('a usual price shows only as a hint',
  /usually \$2,500/.test(document.querySelector('.svc-pick').textContent)&&/You set the price/.test(document.querySelector('.svc-pick').textContent));

const web=[...document.querySelectorAll('.svc-opt')].find(b=>/^Website/.test(b.textContent||'')); if(web) await click(web);
ok('tapping a service asks for this client\'s price first, no deal yet', !document.querySelector('.deal-card')&&!!document.querySelector('.svc-opt.pricing input'));
const q=document.querySelector('.svc-opt.pricing input');
ok('the price box starts empty, the usual price is only a placeholder', q&&q.value===''&&/2500/.test(q.getAttribute('placeholder')||''), q&&[q.value,q.getAttribute('placeholder')]);
await act(async()=>{ const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  set.call(q,'3750'); q.dispatchEvent(new dom.window.Event('input',{bubbles:true})); });
const addBtn=[...document.querySelectorAll('.svc-opt.pricing button')].find(b=>/Add deal/.test(b.textContent||'')); if(addBtn) await click(addBtn);
const card=document.querySelector('.deal-card');
ok('Add deal creates the deal', !!card);
const [svcSel]=card?[...card.querySelectorAll('select')]:[];
ok('with that service set', svcSel&&svcSel.value==='Website', svcSel&&svcSel.value);
const price=card&&[...card.querySelectorAll('input[type=number]')][0];
ok('at the price typed for this client, not the usual one', price&&price.value==='3750', price&&price.value);
ok('the deal is worth that price', /\$3,750/.test((card&&card.querySelector('.deal-card-v')||{}).textContent||''));
ok('a new deal shows one price, not the old three boxes', card&&!/Setup \$/.test(card.textContent));
ok('no stray 0 is printed on the card', card&&!/0\s*Add line item/.test(card.textContent), (card&&card.textContent||'').slice(0,160));
ok('the picker closes after a pick', !document.querySelector('.svc-pick'));

if(svcSel) await change(svcSel,'Web+CRM');
const price2=document.querySelector('.deal-card input[type=number]');
ok('changing the service keeps this client\'s price', price2&&price2.value==='3750', price2&&price2.value);
ok('and the deal value does not move', /\$3,750/.test((document.querySelector('.deal-card .deal-card-v')||{}).textContent||''));

/* the backfill: a closed deal gets a service */
const back=document.querySelector('.dh-svc');
ok('a closed deal offers a service picker', !!back);
if(back) await change(back,'Website');
const writes=globalThis.__WRITES__||[];
const last=JSON.stringify(writes.slice(-3));
ok('picking it saves the service onto the closed deal', /"service":"Website"[^}]*|"cd1"/.test(last)&&/Starter site/.test(last)&&/"service":"Website"/.test(last));

console.log(`\n${pass} passed, ${fail} failed`);
root.unmount(); try{fs.unlinkSync('tests/.bspick.mjs');}catch{} process.exit(fail?1:0);
