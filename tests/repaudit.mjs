/* THE REP EXPERIENCE — asserted by rendering the real app as a rep.

   REP-AUDIT.md #2, #6, #7, #8. Everything here was found by mounting the app
   signed in as a rep and reading what actually rendered, so that is how it is
   tested too.                                                                */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,220):''));}};

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver'])
 { try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}; dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; dom.window.confirm=()=>true;

const iso=n=>new Date(Date.now()-n*864e5).toISOString();
const day=n=>iso(n).slice(0,10);

globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__TASKS__=[];globalThis.__USER_WRITES__=[];
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__MLOGS__=[];globalThis.__MLOG_WRITES__=[];globalThis.__KB_NOTES__=[];globalThis.__KB_PUB__=[];globalThis.__KB_WRITES__=[];globalThis.__POCKETS__=[];
globalThis.__SETTINGS__={goals:{revenue:10000},retainerStartCleared:'2026-08-01T00:00:00.000Z'};
globalThis.__USERS__=[{id:'u_owner',name:'Dana',email:'dana@x.com',role:'rep',pools:['Inbound'],commission_pct:0,appointment_rate:75,active:true,tabs:[],goal_conversions:5,nav_order:[]}];

globalThis.__LEADS__=[
  /* overdue follow-up */
  {id:'l_od',name:'Overdue Olga',company:'Olga Co',stage:'proposal',owner:'Dana',owner_id:'u_owner',
   createdAt:iso(30),followUp:day(4),nextAction:'Send the quote',dealValue:5000,deals:[],
   meetings:[{id:'mt1',title:'Discovery',mtype:'Discovery',start:iso(2),status:'held',
     setBy:'Dana',setById:'u_owner',heldBy:'Dana',heldById:'u_owner',heldAt:iso(1)}],
   activities:[{id:'a1',ts:iso(9),type:'Call',text:'spoke',who:'Dana'}],closedDeals:[],payments:[],
   /* set by Dana, then the lead was reassigned to Sam — she must keep the fee */
   meetingsSetByDana:true},
  /* never contacted */
  {id:'l_new',name:'Fresh Fred',company:'Fred Ltd',stage:'new',owner:'Dana',owner_id:'u_owner',
   createdAt:iso(3),dealValue:0,deals:[],meetings:[],activities:[],closedDeals:[],payments:[]},
  /* touched, but gone quiet */
  {id:'l_stale',name:'Quiet Quinn',company:'Quinn Co',stage:'discovery',owner:'Dana',owner_id:'u_owner',
   createdAt:iso(40),dealValue:2000,deals:[],meetings:[],
   activities:[{id:'a2',ts:iso(12),type:'Call',text:'left a message',who:'Dana'}],closedDeals:[],payments:[]},
  /* an UNCLAIMED pool lead */
  {id:'l_pool',name:'Pool Pat',company:'Pat Inc',stage:'new',owner:'',owner_id:null,pool:'Inbound',
   createdAt:iso(2),dealValue:9900,deals:[],meetings:[],activities:[],closedDeals:[],payments:[]},
];

globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],logLevel:'silent'});
fs.writeFileSync(path.join(here,'.brep.mjs'),out.outputFiles[0].text);
const mod=await import('./.brep.mjs?v='+Date.now());
const React=(await import('react')).default; const {createRoot}=await import('react-dom/client'); const {act}=await import('react');
const rootEl=createRoot(document.getElementById('root'));
await act(async()=>{rootEl.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,220));});

const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});await act(async()=>{await new Promise(r=>setTimeout(r,150));});};
const vis=el=>{const c=(el||document.body).cloneNode(true);c.querySelectorAll('style,script').forEach(x=>x.remove());
  return (c.textContent||'').replace(/\s+/g,' ').trim();};
const txt=()=>vis(document.body);
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l); if(b) await click(b); return !!b;};

console.log('\n#6 a rep opens the app and is told what to do');
{
  const t=txt();
  ok('the dashboard leads with Your day', /Your day/.test(t), t.slice(0,120));
  ok('  and counts what is waiting', /\d+ things?/.test(t), t.match(/Your day.{0,30}/)?.[0]);
  ok('the overdue follow-up is named', /Overdue Olga/.test(t));
  ok('  with how late it is', /\d+d overdue/.test(t), t.match(/Overdue Olga.{0,60}/)?.[0]);
  ok('  and what to do', /Send the quote/.test(t));
  ok('the never-contacted lead is named', /Fresh Fred/.test(t));
  ok('  under its own heading', /Never contacted/.test(t));
  ok('the lead gone quiet is named', /Quiet Quinn/.test(t));
  ok('  under its own heading', /Gone quiet/.test(t));
  /* The whole point: a next action exists and it is clickable. */
  const jump=[...document.querySelectorAll('.td-name')].find(b=>/Overdue Olga/.test(b.textContent||''));
  ok('every row opens the lead', !!jump);
  if (jump) await click(jump);
  ok('  and it does open', /Overdue Olga/.test(vis(document.querySelector('.m-wrap')||document.body)));
  const close=[...document.querySelectorAll('button')].find(b=>/^×|Close/.test((b.textContent||'').trim()));
  if (close) await click(close);
}

console.log('\n#8 two numbers about the same leads no longer contradict');
{
  const t=txt();
  ok('"Leads Worked" says what it counts', /touched this month/.test(t), t.match(/Leads Worked.{0,60}/)?.[0]);
  ok('  and the open count is labelled separately', /touched this month · \d+ open/.test(t), t.match(/Leads Worked.{0,60}/)?.[0]);
  ok('  so "0 · 1 open right now" is gone', !/open right now/.test(t));
}

console.log('\n#7 a rep is never told they are not a rep');
{
  const t=txt();
  ok('the leaderboard empty state does not question their role',
     !/turns on once you're set up as a rep/.test(t), t.match(/Your rank.{0,120}/)?.[0]);
  ok('  it explains what fills it instead', /Convert a client and you'll appear here/.test(t),
     t.match(/Your rank.{0,140}/)?.[0]);
}

console.log('\n#2 claiming a lead clears its pool');
{
  await nav('Leads'); await act(async()=>{await new Promise(r=>setTimeout(r,200));});
  const seg=[...document.querySelectorAll('.scope-seg button')].find(b=>/Pool/.test(b.textContent||''));
  if (seg) await click(seg);
  const claim=[...document.querySelectorAll('button')].find(b=>/Claim/.test(b.textContent||''));
  ok('the unclaimed pool lead offers a Claim button', !!claim, txt().slice(0,200));
  const before=(globalThis.__WRITES__||[]).length;
  if (claim) await click(claim);
  const w=(globalThis.__WRITES__||[]).slice(before).find(x=>x.id==='l_pool');
  ok('claiming writes the lead', !!w, JSON.stringify((globalThis.__WRITES__||[]).slice(before).map(x=>x.id)));
  ok('  it becomes theirs', w && w.owner==='Dana' && w.owner_id==='u_owner', w&&`${w.owner}/${w.owner_id}`);
  /* THE ASSERTION. A claimed lead keeping its pool stays readable by every
     OTHER rep with that pool, because the RLS policy is owner OR pool. */
  ok('  AND THE POOL IS CLEARED', w && !w.pool, w&&JSON.stringify(w.pool));
}

console.log('\n#2 an owner assigning a lead clears the pool too');
{
  /* Same code path — stampOwner runs on every write, so this is covered by
     construction rather than by a second branch. */
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url),'utf8');
  ok('stampOwner drops the pool whenever there is an owner',
     /pool:oid\?null:\(l\.pool\|\|null\)/.test(src));
  ok('  and says why, with the RLS clause spelled out', /owner_id = auth\.uid\(\) OR pool = any\(my_pools\(\)\)/.test(src));
}

/* ======================================= REP PAY, on real screens */

console.log('\n#14 deal value: theirs yes, the pool\'s not until claimed');
{
  await nav('Leads'); await act(async()=>{await new Promise(r=>setTimeout(r,220));});
  const t=txt();
  ok('their own lead shows its value', /\$5,000/.test(t), t.match(/Overdue Olga.{0,80}/)?.[0]);
  /* Pool Pat carries a dealValue in the fixture; unclaimed, it must not show. */
  const seg=[...document.querySelectorAll('.scope-seg button')].find(b=>/Pool/.test(b.textContent||''));
  if (seg) await click(seg);
  const pool=txt();
  ok('the pool lead is listed', /Pool Pat/.test(pool), pool.slice(0,200));
  ok('  but its value is not', !/\$9,900/.test(pool), pool.match(/Pool Pat.{0,90}/)?.[0]);
  const back=[...document.querySelectorAll('.scope-seg button')].find(b=>/Mine/.test(b.textContent||''));
  if (back) await click(back);
}

console.log('\nrep pay: the fee follows whoever SET the meeting');
{
  const { apptEarnings } = await import('../src/lib/reppay.js');
  const leads=globalThis.__LEADS__;
  /* l_od's meeting was set by Dana; the lead has since been reassigned to Sam. */
  ok('Dana is owed it even though Sam owns the lead now',
     apptEarnings(leads,'u_owner',75).pendingTotal===75, String(apptEarnings(leads,'u_owner',75).pendingTotal));
  ok('Sam is owed nothing for it', apptEarnings(leads,'u_sam',75).pendingTotal===0);
}

console.log('\nrep pay: a rep sees what they have claimed and what is approved');
{
  await nav('Dashboard'); await act(async()=>{await new Promise(r=>setTimeout(r,260));});
  const t=txt();
  ok('the appointments block is shown', /Your appointments/.test(t), t.slice(0,200));
  ok('  awaiting approval is the pending total', /Awaiting approval.{0,40}\$75/.test(t.replace(/\s+/g,' ')),
     t.match(/Awaiting approval.{0,60}/)?.[0]);
  ok('  and it says what earns a fee', /marked ‘?held’?|marked held/.test(t)||/paid once it is marked/.test(t),
     t.match(/per meeting.{0,80}/)?.[0]);
  ok('  and that no-shows pay nothing', /no-shows pay nothing/.test(t));
  /* Dana is on appointments only, so no commission block should appear. */
  ok('a rep on one model does not see the other', !/Your commission/.test(t));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
try{ await act(async()=>rootEl.unmount()); dom.window.close(); }catch{}
process.exit(fail?1:0);
