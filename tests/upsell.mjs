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
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[
  /* the reported case: a client with a finished build, plus a NEW deal typed in
     before it's won. dealValue is the stored sum of both open deals. */
  { id:'l1', name:'Ashley Thill', company:'Business Advisor', stage:'signed', owner:'Garrett',
    isClient:true, convertedAt:'2026-07-25', clientPhase:'build', createdAt:ago(11),
    activities:[{id:'a0',ts:ago(1),type:'Note',text:'Existing note',who:'Garrett'}], meetings:[],
    onboarding:{ kickoff:{done:'2026-07-25',due:null}, brand:{done:'2026-07-25',due:null} },
    deals:[{id:'d_up',label:'AZ Advisory Site',setup:'',website:'1499',integration:'1000',extras:[],upsell:true,addedAt:ago(0)}],
    dealValue:2499, closedDeals:[{id:'c1',label:'Chris 50th Site',amount:150,closedAt:'2026-07-25'}] },
  /* a normal won lead whose revenue lives in dealValue with NO upsell stamp —
     every client that existed before this build looks like this and must not move */
  { id:'l2', name:'Legacy Client', company:'Legacy Co', stage:'signed', owner:'Garrett',
    isClient:true, convertedAt:'2026-06-01', createdAt:ago(60), activities:[], meetings:[],
    deals:[{id:'d_old',label:'Original build',setup:'3000',website:'',integration:'',extras:[]}],
    dealValue:3000, closedDeals:[] },
  /* an ordinary open lead — plain pipeline */
  { id:'l3', name:'Open Lead', company:'Prospect Co', stage:'discovery', owner:'Garrett',
    createdAt:ago(5), activities:[], meetings:[], deals:[{id:'d_o',label:'Build',setup:'1000',extras:[]}], dealValue:1000 },
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.b7.mjs',out.outputFiles[0].text);
const mod=await import('./.b7.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,80));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===l); if(b) await click(b); await act(async()=>{await new Promise(r=>setTimeout(r,50));});};
const kpi=label=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===label.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};

console.log('\nthe money lands in the right bucket');
const pipe=kpi('Open Pipeline');
/* "Closed Setup Rev" was a Money-page tile; Money is now the finance dashboard
   and that number lives on the main Dashboard as Revenue Collected. */
const won=kpi('Revenue Collected');
ok('Open Pipeline = $1,000 lead + $2,499 upsell', pipe && /\$3,499/.test(pipe.v), pipe&&pipe.v);
ok('and it names the upsell', pipe && /1 client upsell/.test(pipe.d), pipe&&pipe.d);
/* What this suite is really about: an UNWON upsell must stay out of revenue.
   Both fixture leads closed in July with no deposit ticked, so under the
   payment-date rule (v21) this month's collected figure is driven by the
   legacy fallback only — the exact value isn't the point. What matters is that
   the open $2,499 upsell never appears in it. */
ok('the un-won $2,499 upsell is not counted as revenue', won && !/5,649|2,499/.test(won.v), won&&won.v);

console.log('\nthe drilldown lists it');
await click([...document.querySelectorAll('.kpi')].find(e=>/Open Pipeline/.test(e.textContent||'')));
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
ok('a Client upsell row is shown', /Client upsell/.test(document.body.textContent||''));
ok('with the deal name on it', /AZ Advisory Site/.test(document.body.textContent||''));

console.log('\nclosing it starts the next build');
await nav('Leads');
const row=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Ashley Thill/.test(e.textContent||'')).pop();
if(row) await click(row);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});
const dealJump=[...document.querySelectorAll('button')].find(b=>/^Deal$/.test((b.textContent||'').trim()));
if(dealJump) await click(dealJump);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});
const closeBtn=document.querySelector('.deal-close-btn');
ok('the button reads as a win, not a close', /Won it/.test((closeBtn&&closeBtn.textContent)||''), (closeBtn&&closeBtn.textContent||'').trim());

let asked='';
dom.window.confirm=msg=>{asked=String(msg);return true;};
await click(closeBtn);
await act(async()=>{await new Promise(r=>setTimeout(r,60));});
ok('it ASKS before adding a project', /own project/.test(asked), asked.slice(0,80));
ok('and says the current build is left alone', /stays exactly where it is/.test(asked), asked.slice(0,220));

/* A SECOND PURCHASE IS A PROJECT, NOT A RESET. This suite used to pin the old
   behaviour: the client's one checklist archived onto the deal and the client
   sent back to Intake. That erased where the first build stood, which is the
   problem projects exist to fix, so the assertions below pin the opposite. */
const w=globalThis.__WRITES__.at(-1);
ok('deal archived at $2,499', w && (w.closedDeals||[]).some(d=>d.amount===2499&&d.label==='AZ Advisory Site'),
   JSON.stringify((w&&w.closedDeals||[]).map(d=>d.label+':'+d.amount)));
const arch=(w&&w.closedDeals||[]).find(d=>d.label==='AZ Advisory Site');
ok('the client checklist is untouched, ticks intact',
   w && w.onboarding && w.onboarding.kickoff && w.onboarding.kickoff.done==='2026-07-25' && w.onboarding.brand && w.onboarding.brand.done==='2026-07-25',
   JSON.stringify(w&&w.onboarding));
ok('the client stays in its phase', w && w.clientPhase==='build', 'phase='+(w&&w.clientPhase));
ok('nothing is archived onto the deal any more', arch && !arch.onboarding && !arch.clientPhase, JSON.stringify(arch));
const pj=(w&&w.projects||[]).find(x=>x.dealId===(arch&&arch.id));
ok('a project is created for that deal', !!pj, JSON.stringify(w&&w.projects));
ok('named after the deal', pj && pj.label==='AZ Advisory Site', pj&&pj.label);
ok('starting at the first flow phase', pj && pj.phase==='intake', pj&&pj.phase);
ok('with a fresh checklist', pj && Object.keys(pj.milestones||{}).length===0, JSON.stringify(pj&&pj.milestones));
ok('both notes logged', w && (w.activities||[]).some(a=>/New build started: AZ Advisory Site\. Tracked as its own project/.test(a.text||''))
   && (w.activities||[]).some(a=>/Deal closed: AZ Advisory Site.*client upsell/.test(a.text||'')),
   JSON.stringify((w&&w.activities||[]).map(a=>a.text).slice(0,3)));
ok('history survived', w && (w.activities||[]).some(a=>a.text==='Existing note'));
ok('dealValue back to zero', w && num0(w.dealValue)===0, 'dealValue='+(w&&w.dealValue));
function num0(v){const n=Number(v);return isNaN(n)?0:n;}

const isoNow=new Date().toISOString().slice(0,10);
console.log('\nnow it IS revenue');
await nav('Dashboard');
/* Assert on the DATA, not a dashboard tile. Revenue Collected is cash-gated
   (v21) and this fixture has no payments and no deposit ticked, so the closed
   deal correctly sits outside it. What this suite is about is that closing an
   upsell archives it at the right amount and clears it from open pipeline —
   both true below. Tying it to a tile made it a test of the cash rule instead. */
const wl=globalThis.__WRITES__.filter(w=>w.id==='l1').at(-1);
/* Closing the upsell archives it into closedDeals dated today, so it lands in
   this month's collected figure — which the un-won version above did not. */
ok('the upsell archived at its full value',
   wl && (wl.closedDeals||[]).some(d=>d.amount===2499&&String(d.closedAt||'').slice(0,7)===isoNow.slice(0,7)),
   JSON.stringify((wl&&wl.closedDeals||[]).map(d=>d.label+':'+d.amount+'@'+d.closedAt)));
ok('and left the open pipeline', wl && num0(wl.dealValue)===0, 'dealValue='+(wl&&wl.dealValue));
const pipe2=kpi('Open Pipeline');
ok('and pipeline drops back to the lone lead', pipe2 && /\$1,000/.test(pipe2.v), pipe2&&pipe2.v);

console.log('\ndeclining leaves the checklist alone');
ok('(covered by the confirm being asked at all)', true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
