/* PROPOSALS, FAST TO SCOPE: THE BUILDER, DRIVEN THROUGH THE REAL CRM.
   ============================================================================

   Boots the whole App (database stubbed) and scopes a proposal the new way:
     - a one-line "What we're doing for them" blurb
     - attach Pocket recordings: this lead's (linked through a meeting log
       made from the recording) listed first, others found by search, max 3
     - Generate sends recording IDS and the blurb, never a transcript
     - Save keeps the ids on the owner-only row (source_pocket_ids) and NOT
       in the body; the body never carries a transcript or the blurb
     - the checklist: numbers are a yellow "Stronger with numbers" note with
       a one-click "Add numbers", never a blocking row
     - a number the server dropped (nobody said it) is reported

   Seen red: posting the transcript to the draft route; saving the ids into
   the body; numbers back as a required row.                               */
/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_psc = bundleName('psc');
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


globalThis.__SETTINGS__={options:{},offer:JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json','utf8'))};
globalThis.__LEADS__=[{id:'L1',name:'Dee Client',company:'Dee Co',email:'dee@deeco.com',stage:'new',createdAt:'2026-09-01T12:00:00Z',activities:[]}];
globalThis.__TXNS__=[]; globalThis.__PROPOSALS__=[];
globalThis.__POCKETS__=[
  {id:'P1',status:'done',received_at:'2026-10-01T15:00:00Z',title:'Kickoff with Dee',summary:'Wants more booked jobs',createdAt:'2026-10-01T15:00:00Z',duration:1800,transcript:'SECRET-TRANSCRIPT-1 we closed 31 jobs'},
  {id:'P2',status:'done',received_at:'2026-10-03T15:00:00Z',title:'Kitchen remodel call',summary:'Reviews by luck',createdAt:'2026-10-03T15:00:00Z',duration:900,transcript:'SECRET-TRANSCRIPT-2'},
  {id:'P3',status:'open',received_at:'2026-10-04T15:00:00Z',title:'Unrelated meeting',summary:'Someone else',createdAt:'2026-10-04T15:00:00Z',duration:600,transcript:'SECRET-TRANSCRIPT-3'},
];
/* P1 is linked to Dee: a meeting log on her lead was made from it */
globalThis.__MLOGS__=[{id:'m1',kind:'client',leadId:'L1',sourcePocketId:'P1',meetingDate:'2026-10-01',extraction:{title:'Kickoff'}}];
const SENT=[];
const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{
  const url=String(u);
  if(url.includes('/api/proposal-draft')){ SENT.push(JSON.parse(o.body)); return {ok:true,status:200,json:async()=>({ok:true,droppedNumbers:1,draft:{
    headline:'Your 48-job year',summary:'You already win on trust.',
    plan:{goal:'Get from 31 to 48 jobs a year',numbers:[{label:'Jobs last year',value:'31'}],levers:['Answer fast','Follow up','Ask for reviews']},
    gaps:[{title:'Missed calls',text:'x'},{title:'No follow up',text:'x'},{title:'Reviews by luck',text:'x'}],
    build:[{title:'Website',tag:'new',text:'x',item:'growth-os'}],whyNow:['Now.'],email:{subject:'s',body:'b'},
    transcript:'SECRET-TRANSCRIPT-1',recordingIds:['P1'],notes:'RAW'}})}; }
  return realFetch(u,o);
};
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/'+B_psc,out.outputFiles[0].text);
const mod=await import('./'+B_psc+'?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,160));});
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,300):''));}};
const tick=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}); await tick();};
const setVal=async(el,v)=>{ await act(async()=>{ const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); }); await tick(); };
const byText=(sel,re)=>[...document.querySelectorAll(sel)].find(e=>re.test(e.textContent||''));
const txt=()=>document.body.textContent.replace(/\s+/g,' ');

const nav=byText('.sb button, .sb a, nav button',/^\s*Proposals\s*$/);
if(nav) await click(nav); await tick(200);
await click(byText('button',/New proposal/));
await setVal([...document.querySelectorAll('.pp-form select')][0],'L1');
await click(byText('.pp-opt',/Growth OS/));

console.log('\nthe inputs');
ok('the notes box is now "What we\'re doing for them"', /What we're doing for them/.test(txt()) && !!document.querySelector('textarea[aria-label="What we\'re doing for them"]'));
const recs=()=>[...document.querySelectorAll('.pp-rec')];
ok('this lead\'s linked recording is listed, without searching', recs().length===1 && /Kickoff with Dee/.test(recs()[0].textContent) && /30 min/.test(recs()[0].textContent));
ok('  and nobody else\'s', !/Unrelated meeting|Kitchen remodel/.test(txt()));
await setVal(document.querySelector('input[aria-label="Search recordings"]'),'kitchen');
ok('search finds others by title or summary', recs().some(r=>/Kitchen remodel call/.test(r.textContent)) && !recs().some(r=>/Unrelated/.test(r.textContent)));
await click(recs().find(r=>/Kickoff with Dee/.test(r.textContent)).querySelector('input'));
await click(recs().find(r=>/Kitchen remodel/.test(r.textContent)).querySelector('input'));
ok('two attached', /2 attached/.test(txt()));
await setVal(document.querySelector('.pp-notes'),'Website and follow up.');
await click(byText('button',/Generate proposal/)); await tick(200);

console.log('\nwhat went to the AI');
const ask=SENT[0];
ok('a one-line blurb was enough, with recordings attached', !!ask);
ok('the recording IDS went', ask && JSON.stringify(ask.recordingIds)==='["P1","P2"]');
ok('NO transcript went from the browser', ask && !/SECRET-TRANSCRIPT/.test(JSON.stringify(ask)));
ok('the number the server dropped is reported', /Removed 1 number the client never said/.test(txt()), txt().match(/Removed[^.]*\./));

console.log('\nthe checklist');
const advice=()=>document.querySelector('.pp-advice');
ok('numbers are a yellow "Stronger with numbers" note, not a blocking row', advice() && /Stronger with numbers/.test(advice().textContent) && /Three of their numbers/.test(advice().textContent)
  && ![...document.querySelectorAll('.pp-ready li')].some(li=>/their numbers/.test(li.textContent)));
ok('the required rows include a point of contact and the legal block', [...document.querySelectorAll('.pp-ready li')].some(li=>/point of contact/.test(li.textContent)) && [...document.querySelectorAll('.pp-ready li')].some(li=>/Terms of Service/.test(li.textContent)));
const before=document.querySelectorAll('.pd-num').length;
await click([...advice().querySelectorAll('button')].find(b=>/Add numbers/.test(b.textContent)));
ok('one click on "Add numbers" opens editing with rows to fill', document.querySelectorAll('.pd-num').length===3 && document.querySelectorAll('.pd-num textarea').length>=6 && before===1, document.querySelectorAll('.pd-num').length);

console.log('\nsaving');
await click(byText('button',/Done editing/)||byText('button',/Edit text/));
await click(byText('button',/Save draft/)); await tick(150);
const w=(globalThis.__PROPOSAL_WRITES__||[]).at(-1);
ok('the attached recording ids are kept on the row', w && JSON.stringify(w.source_pocket_ids)==='["P1","P2"]', w && JSON.stringify(w.source_pocket_ids));
const bs=JSON.stringify(w && w.body);
ok('and NOT in the body: no ids, no transcript, no blurb', w && !/"P1"|"P2"|SECRET-TRANSCRIPT|recordingIds|source_pocket_ids|Website and follow up\./.test(bs), bs && bs.match(/SECRET-TRANSCRIPT|"P1"|recordingIds/));

root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
