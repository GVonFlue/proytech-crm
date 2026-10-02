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
/* four deal shapes, none labelled */
globalThis.__LEADS__=[
 {id:'s1',name:'Shape Closed',company:'Closed Co',stage:'signed',isClient:true,createdAt:'2026-05-01T12:00:00Z',activities:[],
  closedDeals:[{id:'cx',label:'Old site',amount:1800,closedAt:'2026-06-02'}],payments:[{id:'p',amount:1800,date:'2026-06-03'}]},
 {id:'s2',name:'Shape Itemised',company:'Items Co',stage:'proposal',createdAt:'2026-05-01T12:00:00Z',activities:[],
  deals:[{id:'dx',label:'Build',setup:1200,website:300,integration:'',extras:[]}]},
 {id:'s3',name:'Shape Legacy',company:'Legacy Co',stage:'signed',isClient:true,createdAt:'2026-05-01T12:00:00Z',activities:[],
  deal:{setup:2999,website:0,integration:0}},
 {id:'s4',name:'Shape Bare',company:'Bare Co',stage:'new',dealValue:1999,createdAt:'2026-05-01T12:00:00Z',activities:[]},
 /* two services, so its cash cannot place itself */
 {id:'s5',name:'Two Services',company:'Both Co',stage:'signed',isClient:true,createdAt:'2026-05-01T12:00:00Z',activities:[],retainer:199,retainerActive:true,
  deals:[{id:'w5',label:'Site',service:'Website',price:'3000'},{id:'c5',label:'Suite',service:'CRM',price:'2500'}],
  payments:[{id:'pw',amount:1500,date:'2026-09-01'},{id:'pr',amount:199,date:'2026-09-30',purpose:'Retainer'}]},
];
globalThis.__TXNS__=[{id:'t1',type:'expense',amount:420,date:mAgo(1)+'-05',category:'Hosting'}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bslabel.mjs',out.outputFiles[0].text);
const mod=await import('./.bslabel.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,160));});




/* LABEL YOUR DEALS, DRIVEN THROUGH THE REAL SCREEN.
   Opens it from the dashboard's Sold-by-service card, labels a deal in each of
   the four shapes deals live in, and checks what was saved: the service, in
   the deal's own shape, and no amount touched. Seen red: the screen writing
   an amount; the dashboard button missing. */
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const tick=async(ms=80)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}); await tick();};
const change=async (el,v)=>{ await act(async()=>{ const set=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  set.call(el,v); el.dispatchEvent(new dom.window.Event('change',{bubbles:true})); }); await tick(); };
const lastWrite=id=>[...(globalThis.__WRITES__||[])].reverse().find(w=>w&&w.id===id);

const btn=document.querySelector('.sa-open');
ok('the Sold-by-service card offers to label deals', !!btn && /Label deals/.test(btn.textContent));
if(btn) await click(btn);
const card=()=>document.querySelector('.sa-card');
ok('it opens the labelling screen', !!card());
ok('it counts what is unlabelled, in deals and dollars',
  /4 of 6 deals have no service yet, worth \$8,298/.test((card()||{textContent:''}).textContent), (card()||{textContent:''}).textContent.slice(0,200));

const rowFor=label=>[...document.querySelectorAll('.sa-row')].find(r=>new RegExp(label).test(r.textContent));
ok('a closed deal is listed', !!rowFor('Old site'));
ok('an itemised open deal is listed', !!rowFor('Build'));
ok('an old single deal and a bare deal value are listed', document.querySelectorAll('.sa-row').length===4, String(document.querySelectorAll('.sa-row').length));

await change(rowFor('Old site').querySelector('select'),'Website');
const w1=lastWrite('s1');
ok('labelling a closed deal saves the service on it', w1&&w1.closedDeals&&w1.closedDeals[0].service==='Website');
ok('and leaves its amount alone', w1&&w1.closedDeals[0].amount===1800);

await change(rowFor('Build').querySelector('select'),'CRM');
const w2=lastWrite('s2');
ok('labelling an itemised deal saves the service on it', w2&&w2.deals[0].service==='CRM');
ok('and leaves its prices alone', w2&&w2.deals[0].setup===1200&&w2.deals[0].website===300);

let rows=[...document.querySelectorAll('.sa-row')];
await change(rows.find(r=>/2,999/.test(r.textContent)).querySelector('select'),'Web+CRM');
const w3=lastWrite('s3');
ok('an old single deal keeps its shape and gets the service', w3&&w3.deal&&w3.deal.service==='Web+CRM'&&w3.deal.setup===2999&&!w3.deals);

rows=[...document.querySelectorAll('.sa-row')];
await change(rows.find(r=>/1,999/.test(r.textContent)).querySelector('select'),'Automations');
const w4=lastWrite('s4');
ok('a bare deal value keeps its number and gets a label beside it', w4&&w4.dealService==='Automations'&&w4.dealValue===1999&&!w4.deals);

ok('once all are labelled, nothing is left', /Nothing left to label|All 6 deals have a service/.test((card()||{textContent:''}).textContent));

/* PAYMENTS TO PLACE. The closed deal's payment placed itself once that deal
   got a service; the two-service client's two payments cannot. */
const payTab=[...document.querySelectorAll('.sa-tabs button')].find(b=>/Payments to place/.test(b.textContent));
ok('there is a Payments to place tab, counting what is unplaced', payTab&&/\(2\)/.test(payTab.textContent), payTab&&payTab.textContent);
if(payTab) await click(payTab);
const payRows=()=>[...document.querySelectorAll('.sa-pay')];
ok('it lists both payments of the two-service client', payRows().length===2&&payRows().every(r=>/Both Co|Two Services/.test(r.textContent)));
const work=payRows().find(r=>/1,500/.test(r.textContent));
ok('a work payment asks which deal it paid for', work&&/Which deal/.test(work.querySelector('select').textContent));
await change(work.querySelector('select'),'c5');
const w5=lastWrite('s5');
ok('picking a deal tags the payment, nothing else', w5&&w5.payments[0].dealId==='c5'&&w5.payments[0].amount===1500&&w5.payments[0].date==='2026-09-01');
const ret=payRows().find(r=>/199/.test(r.textContent));
ok('a retainer payment asks which service the retainer is for', ret&&/Retainer is for/.test(ret.querySelector('select').textContent));
await change(ret.querySelector('select'),'CRM');
const w6=lastWrite('s5');
ok('picking it sets the client\'s retainer service', w6&&w6.retainerService==='CRM'&&w6.retainer===199);
ok('then every payment is placed', /Every payment is placed/.test((card()||{textContent:''}).textContent));
const close=document.querySelector('.sa-x'); if(close) await click(close);
ok('it closes', !card());
ok('and the dashboard has no Unassigned left to label', !document.querySelector('.sa-open'));

console.log(`\n${pass} passed, ${fail} failed`);
root.unmount(); try{fs.unlinkSync('tests/.bslabel.mjs');}catch{} process.exit(fail?1:0);
