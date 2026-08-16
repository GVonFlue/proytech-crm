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
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5,booked:10,onboarded:3}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const today=(()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;})();
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  {id:'l1',name:'Said Yes Co',company:'Said Yes Co',stage:'discovery',owner:'Garrett',
   createdAt:ago(20),activities:[],meetings:[],deals:[],dealValue:2000},
  /* a client converted long before the cash rule existed — must keep counting */
  {id:'l2',name:'Legacy Client',company:'Legacy Client',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:'2026-05-10',closedAt:today,createdAt:ago(90),activities:[],meetings:[],deals:[],dealValue:5000},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bc.mjs',out.outputFiles[0].text);
const mod=await import('./.bc.mjs?v='+Date.now());
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
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test((b.textContent||'').trim()));
const openLead=async name=>{ await nav('Leads');
  const r=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&new RegExp(name).test(e.textContent||'')).pop();
  if(r) await click(r); await settle(); };
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};
const W=()=>globalThis.__WRITES__.at(-1);

console.log('\nbaseline: a pre-existing client still counts');
await nav('Dashboard');
const rev0=kpi('Revenue Collected');
ok('legacy client\'s $5,000 is counted', rev0 && /\$5,000/.test(rev0.v), rev0&&rev0.v);

console.log('\nconvert someone who just said yes');
await openLead('Said Yes Co');
await click(btn(/Convert to Client/)); await settle();
ok('they are a client now', W() && W().isClient===true);
ok('stage moved to won', W() && W().stage==='signed', W()&&W().stage);
ok('onboarding started', W() && Object.keys(W().onboarding||{}).length>0);

await nav('Dashboard');
const rev1=kpi('Revenue Collected');
ok('their $2,000 is NOT counted yet', rev1 && /\$5,000/.test(rev1.v), rev1&&rev1.v);
ok('the tile says what they still owe', rev1 && /\$2,000 still owed/.test(rev1.d), rev1&&rev1.d);

console.log('\nthe banner explains it');
await openLead('Said Yes Co');
const bar=document.querySelector('.client-bar');
ok('a status bar is shown', !!bar);
ok('it says payment is not collected', bar && /payment not collected yet/i.test(bar.textContent||''), bar&&bar.textContent);
ok('and names the amount', bar && /\$2,000/.test(bar.textContent||''), bar&&bar.textContent);
ok('revert is right there', !!(bar&&/Revert to lead/.test(bar.textContent||'')));

console.log('\ntick the deposit and the money lands');
/* date prompt, then amount, then note — answer all three */
const asked=[];
dom.window.prompt=(msg,def)=>{ asked.push(String(msg)); 
  if(/YYYY-MM-DD/.test(msg)) return today;
  if(/How much/i.test(msg)) return def||'2000';
  return 'Square deposit'; };
const dep=document.querySelector('.cb-pay');
ok('a Mark payment collected button is on the record', !!dep,
   'client-bar buttons: '+[...document.querySelectorAll('.client-bar button')].map(b=>b.textContent).join(' | '));
if(dep){ await click(dep); await settle(); }
ok('it asks for the amount too, not just the date', asked.some(m=>/How much/i.test(m)), asked.join(' || '));
ok('and it defaults to what is owed', /2000/.test(String((W().payments||[])[0]&&(W().payments||[])[0].amount)),
   JSON.stringify(W().payments));
ok('a payment was logged, not just the flag', (W().payments||[]).length===1, JSON.stringify(W().payments));
ok('dated to the day the money landed', (W().payments||[])[0] && (W().payments||[])[0].date===today,
   (W().payments||[])[0] && (W().payments||[])[0].date);
ok('the note came across', (W().payments||[])[0] && (W().payments||[])[0].note==='Square deposit');
ok('a Payment activity was logged', (W().activities||[]).some(a=>a.type==='Payment'&&/2,000/.test(a.text||'')),
   JSON.stringify((W().activities||[]).map(a=>a.type+':'+a.text).slice(0,3)));
ok('and a confirmation note beside it', (W().activities||[]).some(a=>/Payment confirmed/.test(a.text||'')));
await nav('Dashboard');
const rev2=kpi('Revenue Collected');
ok('now it counts', rev2 && /\$7,000/.test(rev2.v), rev2&&rev2.v);
ok('and nothing is awaiting', rev2 && !/awaiting/.test(rev2.d), rev2&&rev2.d);
await openLead('Said Yes Co');
ok('the bar flips to confirmed', /Payment confirmed/i.test((document.querySelector('.client-bar')||{}).textContent||''),
   (document.querySelector('.client-bar')||{}).textContent||'');

console.log('\npressing it again does not double-count');
const beforeP=(W().payments||[]).length;
dom.window.confirm=()=>true;
await click(document.querySelector('.cb-pay')); await settle();   // untick
await act(async()=>{});
const askedAmounts=[];
dom.window.prompt=(msg,def)=>{ if(/YYYY-MM-DD/.test(msg)) return today;
  if(/How much/i.test(msg)){ askedAmounts.push(String(def)); return '0'; } return ''; };
await click(document.querySelector('.cb-pay')); await settle();   // re-tick
ok('the amount prompt accounts for what is already logged', askedAmounts.some(v=>v==='0'||v===''),
   'defaults offered: '+askedAmounts.join(','));
ok('no duplicate payment row', (W().payments||[]).length===beforeP, (W().payments||[]).length+' vs '+beforeP);
ok('the earlier payment survived the untick', (W().payments||[]).length===1);

console.log('\nrevert undoes the whole conversion');
dom.window.confirm=()=>true;
const undo=[...document.querySelectorAll('.client-bar button')].find(b=>/Revert to lead/.test(b.textContent||''));
await click(undo); await settle();
const w=W();
ok('no longer a client', w && w.isClient===false);
ok('stage moved OFF won', w && w.stage!=='signed', 'stage='+(w&&w.stage));
ok('close date cleared', w && !w.closedAt, 'closedAt='+(w&&w.closedAt));
ok('converted date cleared', w && !w.convertedAt, 'convertedAt='+(w&&w.convertedAt));
ok('delivery progress kept', w && Object.keys(w.onboarding||{}).length>0, 'onboarding keys='+Object.keys((w&&w.onboarding)||{}).length);
ok('the deposit tick survived', w && !!(w.onboarding||{}).deposit_paid);
ok('it was logged', w && (w.activities||[]).some(a=>/Reverted to lead/.test(a.text||'')),
   JSON.stringify((w&&w.activities||[]).map(a=>a.text).slice(0,2)));

await nav('Dashboard');
const rev3=kpi('Revenue Collected');
/* Revenue is CASH now, so the $2,000 they actually paid still counts after a
   revert — the money arrived, and erasing that would be a lie. Reverting removes
   their client status and the closed-deal count, not their payment history. */
ok('money they actually paid still counts after a revert', rev3 && /\$7,000/.test(rev3.v), rev3&&rev3.v);
ok('and nothing is left owing on them', rev3 && !/still owed/.test(rev3.d), rev3&&rev3.d);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
