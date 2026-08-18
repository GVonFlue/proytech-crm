/* Client meeting logs — asserts on WHAT REACHES THE DATABASE.

   The whole design rests on two claims that a green build cannot check:
     1. A client log DERIVES onto the lead. Nothing is copied there, so
        opening the lead writes nothing and the transcript never lands in
        the leads table (which reps can read).
     2. The ONLY thing that crosses into rep-readable data is a line an
        owner typed and published on purpose — one activity, one write.

   Paths resolve from this file, not from the working directory, so the
   suite runs as `node tests/clientlog.mjs` from the repo root.            */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[];globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];
globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;globalThis.__MLOG_WRITES__=[];
globalThis.__USERS__=[
  {id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
const pad=n=>String(n).padStart(2,'0');
const dayISO=n=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};

globalThis.__LEADS__=[
  {id:'l1',name:'Rita Alvarez',company:'Alvarez Realty',stage:'new',owner:'Garrett',createdAt:ago(30),
   meetings:[],deals:[],dealValue:0,
   activities:[{id:'a0',ts:ago(20),type:'Call',text:'First call.',who:'Garrett'}]},
  {id:'l2',name:'Other Lead',company:'Other Co',stage:'new',owner:'Garrett',createdAt:ago(30),
   meetings:[],deals:[],dealValue:0,activities:[]},
];
/* one client meeting on l1, one internal Sunday meeting. The transcript is
   the thing that must never appear anywhere near the leads table. */
const SECRET='CANDID READ: she is bluffing about the other agency';
/* the three that must never be drafted into the publish box, kept as distinct
   strings so a leak is a substring match rather than a reading of the text */
const OBJECTION='thinks the price is high for what it is';
const PAYING='900 a month to Boomtown';
const READ_WHY='she stopped asking questions after the price came up';
globalThis.__MLOGS__=[
  {id:'ml_client',kind:'client',leadId:'l1',meetingDate:dayISO(3),source:'Notes',attendees:['Garrett','Rita'],
   transcript:SECRET,createdAt:ago(3),createdBy:'Garrett',shared:{text:'',at:'',by:'',activityId:''},
   extraction:{title:'Alvarez discovery',headline:'She wants the CRM before listing season',
     summary:'Rita runs eleven agents and is drowning in spreadsheet handoffs.',
     themes:[],decisions:[],actions:[],numbers:[],risks:[],openItems:[{key:'send-quote',title:'Send the quote'}],loopReview:[],
     wants:[{want:'stop rekeying listings by hand',quote:'I retype everything twice'}],
     objections:[{objection:OBJECTION,detail:'went quiet after the number'}],
     budget:{stated:'4000 dollars',paying:PAYING,note:''},
     commitments:[{side:'us',what:'send the quote',due:'2026-08-22'},
                  {side:'client',what:'loop in her broker',due:''}],
     people:[{name:'Dana Ruiz',role:'office manager',influence:'decides'}],
     temperature:{read:'cool',why:READ_WHY},
     nextStep:{what:'demo the pipeline board',who:'Garrett',when:'2026-08-24'}}},
  {id:'ml_internal',kind:'internal',meetingDate:dayISO(5),source:'Voice memo',attendees:['Garrett','Logan'],
   transcript:'internal talk',createdAt:ago(5),createdBy:'Garrett',
   extraction:{title:'Sunday CEO',headline:'Pricing needs to move',summary:'.',
     themes:[],decisions:[],actions:[],numbers:[],risks:[],openItems:[{key:'file-llc',title:'File the LLC'}],loopReview:[]}},
];

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],
 logLevel:'silent'});
/* written beside this file so `import 'react'` still resolves up the tree */
fs.writeFileSync(path.join(here,'.bcl.mjs'),out.outputFiles[0].text);
const mod=await import('./.bcl.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root2=createRoot(document.getElementById('root'));
await act(async()=>{root2.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,110));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const setV=async(el,v)=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  const st=Object.getOwnPropertyDescriptor(proto,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));

console.log('\nthe lead reads the meeting through, without a copy');
await nav('Leads');
const row=[...document.querySelectorAll('tbody tr')].find(e=>/Rita Alvarez/.test(e.textContent||''));
if(row) await click(row); await settle(120);
const modalTxt=()=>(document.querySelector('.m-wrap,.modal,.m-body')||document.body).textContent||'';
ok('the modal opened', /Rita Alvarez/.test(modalTxt()));
ok('the meeting shows on the lead', /Alvarez discovery/.test(modalTxt()), modalTxt().slice(0,200));
ok('its summary is there to read', /drowning in spreadsheet handoffs/.test(modalTxt()));
ok('it is marked owner only', /owner only/i.test(modalTxt()));
ok('the transcript is NOT on the lead', !modalTxt().includes('bluffing'));

console.log('\nthe derived row shows the structured read, not one line');
ok('what she wants', /stop rekeying listings by hand/.test(modalTxt()));
ok('in her own words', /I retype everything twice/.test(modalTxt()));
ok('what we owe her', /send the quote/.test(modalTxt()));
ok('what she owes us', /loop in her broker/.test(modalTxt()));
ok('who else is involved', /Dana Ruiz/.test(modalTxt()));
ok('what happens next', /demo the pipeline board/.test(modalTxt()));
/* the candid three DO belong here — this block is rendered from meeting_logs,
   which a rep cannot read a row of, so this is the owner on their own lead */
ok('the objection, for the owner reading their own lead', modalTxt().includes(OBJECTION));
ok('the budget, for the owner', /4000 dollars/.test(modalTxt()));
ok('the read on the meeting, for the owner', /Cooling/.test(modalTxt()));
ok('opening the lead wrote nothing', globalThis.__WRITES__.length===0,
   JSON.stringify(globalThis.__WRITES__.map(w=>w.id)));

console.log('\nan internal meeting never reaches a lead');
ok('the Sunday meeting is not on this lead', !/Sunday CEO/.test(modalTxt()));

console.log('\nnothing is published until a human presses the button');
/* Close the lead first. The modal renders above the page and its compose box
   stays in the DOM across a nav — leave it open and the textarea this test
   reaches for is the activity composer, not the publish field. */
const closeX=[...document.querySelectorAll('.m-x')].pop();
if(closeX) await click(closeX); await settle(90);
ok('the lead modal is closed', !document.querySelector('.m-x'));
const L1=()=>globalThis.__WRITES__.filter(x=>x.id==='l1');
const beforeW=L1().length;
await nav('Meeting Log');
ok('both meetings are listed', /Alvarez discovery/.test(document.body.textContent||'')&&/Sunday CEO/.test(document.body.textContent||''));
ok('the client one is marked private', /Private/.test(document.body.textContent||''));
const loopTxt=document.body.textContent||'';
ok('the ladder shows the internal loop', /File the LLC/.test(loopTxt));
ok('the ladder ignores the client loop', !/Send the quote/.test(loopTxt), loopTxt.slice(0,300));

const logRow=[...document.querySelectorAll('.hli')].find(e=>/Alvarez discovery/.test(e.textContent||''));
if(logRow) await click(logRow); await settle(110);
ok('the client log opened', /What Rita Alvarez/.test(document.body.textContent||'')||/On the lead/.test(document.body.textContent||''));
const ta=[...document.querySelectorAll('textarea')].pop();
const draft=(ta&&ta.value)||'';
ok('a draft line is offered', !!draft, draft);
ok('it carries what she wants', /stop rekeying listings by hand/.test(draft), draft);
ok('what each side committed to', /send the quote/.test(draft)&&/loop in her broker/.test(draft), draft);
ok('who else is involved', /Dana Ruiz/.test(draft));
ok('and what happens next', /demo the pipeline board/.test(draft));
/* the point of the split: this box is the one thing on the screen that can put
   text somewhere a rep reads, so the candid three are not drafted into it */
ok('NOT her objection', !draft.includes(OBJECTION), draft);
ok('NOT what she pays today', !draft.includes(PAYING)&&!/4000/.test(draft), draft);
ok('NOT the read on the meeting', !/cool/i.test(draft)&&!draft.includes(READ_WHY), draft);
ok('still nothing written to the lead', L1().length===beforeW, 'l1 writes='+L1().length);
ok('and the draft is editable, not fixed', !!ta&&!ta.readOnly&&!ta.disabled);

console.log('\npublishing writes exactly one activity, and only what was typed');
await setV(ta,'She wants this live before listing season. Get the quote out.');
const add=btn(/Add to lead/);
ok('the button is there', !!add);
await click(add); await settle(120);

const w=L1();
ok('exactly one lead write', w.length===beforeW+1, 'writes='+w.length+' before='+beforeW);
const lead=w.at(-1)||{activities:[]};
const published=(lead.activities||[]).filter(a=>a.fromLog==='ml_client');
ok('exactly one activity added', published.length===1, JSON.stringify((lead.activities||[]).map(a=>a.type+':'+a.text).slice(0,4)));
ok('it says what was typed', /before listing season/.test(published[0]?.text||''), published[0]?.text);
ok('it is traceable to the log', published[0]?.fromLog==='ml_client');
ok('it is a Note, so it does not count as outreach', published[0]?.type==='Note', published[0]?.type);
ok('the original call is still there', (lead.activities||[]).some(a=>a.id==='a0'));
ok('the transcript did NOT reach the lead', !JSON.stringify(lead).includes('bluffing'));
ok('the extraction summary did NOT reach the lead', !JSON.stringify(lead).includes('drowning'));

const ml=(globalThis.__MLOG_WRITES__||[]).at(-1);
ok('the log recorded what was published', ml&&ml.shared&&/before listing season/.test(ml.shared.text||''), JSON.stringify(ml&&ml.shared));
ok('and who published it', ml&&ml.shared&&ml.shared.by==='Garrett');
ok('and which activity it became', ml&&ml.shared&&ml.shared.activityId===published[0]?.id);

console.log('\nre-publishing edits the line instead of logging a second meeting');
await settle(60);
const ta2=[...document.querySelectorAll('textarea')].pop();
await setV(ta2,'Corrected: she wants it before listing season.');
const again=btn(/Update the line on the lead|Add to lead/);
if(again) await click(again); await settle(120);
const lead2=globalThis.__WRITES__.filter(x=>x.id==='l1').at(-1)||{activities:[]};
const pub2=(lead2.activities||[]).filter(a=>a.fromLog==='ml_client');
ok('still exactly one activity', pub2.length===1, JSON.stringify(pub2.map(a=>a.text)));
ok('the text was corrected in place', /^Corrected/.test(pub2[0]?.text||''), pub2[0]?.text);
ok('it kept the same activity id', pub2[0]?.id===published[0]?.id);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
