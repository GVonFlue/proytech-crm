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

/* PROJECTS — a client's next purchase gets its own card on the Clients board.

   The reported case: Alyssa Poppell is a client whose website is live, so her
   card sits in Active. She has now bought a Business Suite, and there was
   nowhere to track that build without dragging her whole record back to Build.
   A project is that second build, beside the first. */
/* lib/lead.js imports without extensions, so plain Node cannot load it:
   bundle it the way tests/onepredicate.mjs does. */
const libOut=await esbuild.build({entryPoints:['src/lib/lead.js'],bundle:true,write:false,format:'esm',jsx:'automatic',
  loader:{'.js':'jsx'},define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},logLevel:'silent'});
fs.writeFileSync('tests/.bprojlib.mjs',libOut.outputFiles[0].text);
const { withDefaultTracks, activeTracks, trackForLabel, newProject, projectProgress,
  boardProjects, DEFAULT_DELIVERY_TRACKS, clientOverall } = await import('./.bprojlib.mjs?v='+Date.now());

const ago=n=>new Date(Date.now()-n*864e5).toISOString();
const client=(o)=>({stage:'signed',owner:'Garrett',isClient:true,convertedAt:'2026-07-01',createdAt:ago(80),activities:[],meetings:[],deals:[],dealValue:0,...o});
globalThis.__LEADS__=[
  client({ id:'l1', name:'Alyssa Poppell', company:'Poppell Studio', clientPhase:'active',
    closedDeals:[{id:'c1',label:'Website',amount:2500,closedAt:'2026-07-01'},{id:'c2',label:'Business Suite',amount:4000,closedAt:'2026-09-01'}],
    projects:[{id:'pj_c2',dealId:'c2',label:'Business Suite',trackKey:'suite',phase:'build',
      milestones:{'Kickoff and intake received':{done:'2026-09-01',due:null}},startedAt:'2026-09-01'}] }),
  /* every client that exists today looks like this: no projects array */
  client({ id:'l2', name:'Legacy Client', company:'Legacy Co', clientPhase:'build', closedDeals:[] }),
  client({ id:'l3', name:'Gone Client', company:'Gone Co', clientPhase:'churned',
    projects:[{id:'pj_x',dealId:'x',label:'Old Suite',trackKey:'suite',phase:'build',milestones:{}}] }),
  client({ id:'l4', name:'Wobbly Client', company:'Wobbly Co', clientPhase:'atrisk',
    projects:[{id:'pj_y',dealId:'y',label:'AI Receptionist',trackKey:'ai',phase:'intake',milestones:{}}] }),
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bproj.mjs',out.outputFiles[0].text);
const mod=await import('./.bproj.mjs?v='+Date.now());
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


console.log('\nthe pure parts');
{
  const saved=[{key:'website',label:'Website',services:['Website'],milestones:['a']}];
  const once=withDefaultTracks(saved,0);
  ok('an install that saved its tracks before gets Business Suite added', once.some(t=>t.key==='suite'));
  ok('its own tracks are kept', once[0].key==='website'&&once[0].milestones[0]==='a');
  ok('and once the new version is saved, a deleted track stays deleted', !withDefaultTracks(saved,1).some(t=>t.key==='suite'));
  ok('no saved tracks means the defaults', withDefaultTracks([],0)===DEFAULT_DELIVERY_TRACKS);

  /* The trap: activeTracks falls back to EVERY track when a client names no
     matching service. Adding a track must not hand those clients a third
     checklist or undo "all delivery steps complete". */
  const noSvc={serviceInterest:[],delivery:{}};
  ok('a client with no matching service does not get the Business Suite checklist',
     !activeTracks(noSvc,DEFAULT_DELIVERY_TRACKS).some(t=>t.key==='suite'));
  const legacyTracks=DEFAULT_DELIVERY_TRACKS.filter(t=>t.key!=='suite');
  ok('so their delivery total is exactly what it was',
     JSON.stringify(clientOverall(noSvc,DEFAULT_DELIVERY_TRACKS))===JSON.stringify(clientOverall(noSvc,legacyTracks)));
  ok('a client who bought a Business Suite does get it',
     activeTracks({serviceInterest:['Business Suite']},DEFAULT_DELIVERY_TRACKS).some(t=>t.key==='suite'));

  ok('a deal named Business Suite picks the Business Suite checklist', (trackForLabel('Business Suite',DEFAULT_DELIVERY_TRACKS)||{}).key==='suite');
  ok('a deal named for a website picks Website', (trackForLabel('New website build',DEFAULT_DELIVERY_TRACKS)||{}).key==='website');
  ok('a deal it cannot place picks nothing rather than guessing', trackForLabel('Quarterly consulting',DEFAULT_DELIVERY_TRACKS)===null);
  const np=newProject({id:'c9',label:'Business Suite'},DEFAULT_DELIVERY_TRACKS,'intake');
  ok('a new project is tied to its deal and starts clean', np.dealId==='c9'&&np.phase==='intake'&&np.trackKey==='suite'&&!Object.keys(np.milestones).length);
  ok('progress counts the checklist it follows', projectProgress({trackKey:'suite',milestones:{'Install set up':{done:'2026-09-02'}}},DEFAULT_DELIVERY_TRACKS).done===1);
  ok('a churned client\'s projects leave the board', boardProjects(globalThis.__LEADS__,false).every(x=>x.lead.id!=='l3'));
}

const cards=()=>[...document.querySelectorAll('.kcard')];
const colOf=el=>{ const c=el&&el.closest('.kcol'); return c?((c.querySelector('.kt')||{}).textContent||'').replace('custom','').trim():''; };

console.log('\nthe Clients board');
await nav('Clients');
const alyssa=cards().filter(c=>/Alyssa Poppell/.test(c.textContent||''));
ok('Alyssa has two cards', alyssa.length===2, 'cards='+alyssa.length);
const main=alyssa.find(c=>!c.classList.contains('kproj')), proj=alyssa.find(c=>c.classList.contains('kproj'));
ok('her client card is still in Active', main && colOf(main)==='Active', main&&colOf(main));
ok('her Business Suite project is in Build', proj && colOf(proj)==='Build', proj&&colOf(proj));
ok('the project card names the purchase', proj && /Business Suite/.test(proj.textContent||''));
ok('and shows its checklist progress', proj && /1\/8 steps/.test(proj.textContent||''), proj&&proj.textContent);
const legacy=cards().filter(c=>/Legacy Client/.test(c.textContent||''));
ok('a client with no projects renders exactly one card', legacy.length===1 && !legacy[0].classList.contains('kproj'));
ok('a churned client\'s project is not on the board', !cards().some(c=>/Old Suite/.test(c.textContent||'')));
const wob=cards().find(c=>c.classList.contains('kproj')&&/AI Receptionist/.test(c.textContent||''));
ok('an at-risk client\'s project still shows, flagged', wob && /Client at risk/.test(wob.textContent||''), wob&&wob.textContent);
const buildCol=[...document.querySelectorAll('.kcol')].find(c=>((c.querySelector('.kt')||{}).textContent||'').trim()==='Build');
ok('the Build column counts the project', buildCol && ((buildCol.querySelector('.kc')||{}).textContent||'').trim()==='2',
   buildCol&&(buildCol.querySelector('.kc')||{}).textContent);

console.log('\nmoving the project moves only the project');
globalThis.__WRITES__.length=0;
const adv=proj&&[...proj.querySelectorAll('.kmv')].pop();
if(adv) await click(adv);
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
let w=globalThis.__WRITES__.filter(x=>x.id==='l1').at(-1);
const wp=w&&(w.projects||[]).find(x=>x.id==='pj_c2');
ok('the project advanced to Launch in the database', wp && wp.phase==='launch', JSON.stringify(wp));
ok('the client did not move', w && w.clientPhase==='active', w&&w.clientPhase);
ok('the checklist tick survived', wp && wp.milestones && wp.milestones['Kickoff and intake received'] && wp.milestones['Kickoff and intake received'].done==='2026-09-01');
ok('and the move is logged against the project', w && (w.activities||[]).some(a=>/^Phase → Launch \(Business Suite\)$/.test(a.text||'')),
   JSON.stringify((w&&w.activities||[]).map(a=>a.text).slice(0,2)));

console.log('\nits checklist, from the card');
const proj2=cards().find(c=>c.classList.contains('kproj')&&/Business Suite/.test(c.textContent||''));
if(proj2) await click(proj2.querySelector('.kn')||proj2);
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
const panel=document.querySelector('.proj-detail');
ok('opening the card shows the project panel', !!panel);
const step=panel&&[...panel.querySelectorAll('.onb-item')].find(e=>/Install set up/.test(e.textContent||''));
ok('with the Business Suite checklist', panel && panel.querySelectorAll('.onb-item').length===8, panel&&('items='+panel.querySelectorAll('.onb-item').length));
globalThis.__WRITES__.length=0;
if(step) await click(step.querySelector('.onb-check'));
await act(async()=>{await new Promise(r=>setTimeout(r,40));});
w=globalThis.__WRITES__.filter(x=>x.id==='l1').at(-1);
const ms=w&&((w.projects||[]).find(x=>x.id==='pj_c2')||{}).milestones||{};
ok('ticking a step writes it to that project', !!(ms['Install set up']&&ms['Install set up'].done), JSON.stringify(ms));
ok('and leaves the client\'s own checklist alone', w && JSON.stringify(w.onboarding||null)===JSON.stringify(globalThis.__LEADS__[0].onboarding||null));

console.log('\na purchase that was closed before projects existed');
await nav('Leads');
const row=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Alyssa Poppell/.test(e.textContent||'')).pop();
if(row) await click(row);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});
const dealJump=[...document.querySelectorAll('button')].find(b=>/^Deal$/.test((b.textContent||'').trim()));
if(dealJump) await click(dealJump);
await act(async()=>{await new Promise(r=>setTimeout(r,50));});
const rows=[...document.querySelectorAll('.dh-row')];
const suiteRow=rows.find(r=>/Business Suite/.test(r.textContent||'')), siteRow=rows.find(r=>/Website/.test(r.textContent||''));
ok('a purchase with a project says it is on the board', suiteRow && /On the board/.test(suiteRow.textContent||''), suiteRow&&suiteRow.textContent);
const trackBtn=siteRow&&siteRow.querySelector('.dh-proj-btn');
ok('one without offers to track it', !!trackBtn);
globalThis.__WRITES__.length=0;
if(trackBtn) await click(trackBtn);
await act(async()=>{await new Promise(r=>setTimeout(r,60));});
w=globalThis.__WRITES__.filter(x=>x.id==='l1').at(-1);
ok('which adds a project for that deal and keeps the existing one',
   w && (w.projects||[]).some(x=>x.dealId==='c1'&&x.trackKey==='website') && (w.projects||[]).some(x=>x.id==='pj_c2'),
   JSON.stringify((w&&w.projects||[]).map(x=>x.dealId+':'+x.trackKey)));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
