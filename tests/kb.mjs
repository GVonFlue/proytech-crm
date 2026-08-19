/* PLAYBOOK — asserts on WHAT REACHES THE DATABASE AND THE NETWORK.

   The security model is the feature, and most of it is enforced in Postgres:
   a rep gets zero rows from kb_notes, and kb_ai_context() reads kb_published
   and cannot name kb_notes. Those are proved against a real server in
   VERIFY-RLS.md §6 and CANNOT be tested from jsdom.

   This suite covers the parts SQL cannot reach:

     1. THE TIER-3 TEST. An owner's browser legitimately holds drafts — it has
        to, they are editing them. Postgres cannot stop that browser putting a
        draft in a request, because the owner is authorised to read the text
        and "displaying it" is indistinguishable from "sending it". So the
        outbound /api/jarvis body is asserted directly: a draft's sentinel
        string must not appear in it. This is the most important test here.
     2. A transcript never reaches a Playbook note.
     3. Saving never publishes.
     4. The preview is rendered from kb_preview(), NOT from editor state.
     5. The "published version is behind" indicator.

   Paths resolve from this file, so it runs as `node tests/kb.mjs`.          */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,220):''));}};

/* ======================================================== part 1: the pure lib */

const kb = await import('../src/lib/kb.js');
const jv = await import('../src/lib/jarvis.js');

console.log('\nsearch ranks the note CALLED the thing above one that mentions it');
{
  const notes=[
    {id:'a',title:'Vendor quirks',category:'Vendors',tags:[],body:'A lender objection came up once in passing.'},
    {id:'b',title:'Lender objections',category:'Objections',tags:['lenders'],body:'When they say the rate is locked.'},
  ];
  const r=kb.searchKb(notes,'lender objection');
  ok('the titled note wins', r[0] && r[0].id==='b', r.map(x=>x.id).join(','));
  ok('the passing mention still matches', r.length===2);
  ok('a query with no hits returns nothing', kb.searchKb(notes,'zzzz').length===0);
}

console.log('\nthe drift indicator');
{
  const t0='2026-08-01T10:00:00.000Z', t1='2026-08-02T10:00:00.000Z';
  ok('in sync right after publishing', !kb.isBehind({updatedAt:t0},{publishedAt:t0}));
  ok('behind once edited afterwards', kb.isBehind({updatedAt:t1},{publishedAt:t0}));
  ok('never behind when unpublished', !kb.isBehind({updatedAt:t1},null));
  ok('it names what moved',
     kb.behindSummary({title:'X',category:'c',tags:[],body:'new'},{title:'X',category:'c',tags:[],body:'old'})==='the text');
}

console.log('\nkbBlock arranges published rows and invents nothing');
{
  const rows=[
    {id:'p1',title:'Onboarding',category:'Onboarding',tags:['setup'],body:'Step one.'},
    {id:'p2',title:'Vendors',category:'Vendors',tags:[],body:'Quirks.'},
  ];
  const b=kb.kbBlock(rows,'onboarding');
  ok('the relevant note arrives whole', b.full[0] && b.full[0].id==='p1', JSON.stringify(b.full.map(f=>f.id)));
  ok('every id came from the input', [...b.full,...b.lines].every(x=>['p1','p2'].includes(x.id)));
  ok('an empty context is empty, not undefined', kb.kbBlock([], 'x').full.length===0);
  const big=kb.kbBlock([{id:'p3',title:'T',category:'C',tags:[],body:'x'.repeat(9000)}],'t');
  ok('a long body is capped', big.full[0].body.length<=kb.KB_MAX_BODY, big.full[0].body.length);
}

console.log('\nbuildPayload carries the playbook and only what it was given');
{
  const { payload } = jv.buildPayload({
    leads:[], question:'how do we onboard', me:'Garrett',
    kb:[{id:'p1',title:'Onboarding',category:'Onboarding',tags:[],body:'PUBLISHED-BODY-TEXT'}],
  });
  ok('the block is there', !!payload.kb && Array.isArray(payload.kb.full));
  ok('published text is in it', JSON.stringify(payload.kb).includes('PUBLISHED-BODY-TEXT'));
  const bare = jv.buildPayload({ leads:[], question:'x', me:'G' }).payload;
  ok('no playbook means an empty block, not a crash', bare.kb.full.length===0 && bare.kb.lines.length===0);
}

/* ============================================== part 2: the app, in a browser */

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.confirm=()=>true;

globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[];globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];
globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;globalThis.__MLOG_WRITES__=[];
globalThis.__KB_WRITES__=[];globalThis.__KB_PUBLISHED__=[];globalThis.__KB_UNPUBLISHED__=[];
globalThis.__KB_PREVIEWS__=[];globalThis.__KB_DELETED__=[];
globalThis.__USERS__=[
  {id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];

/* THE SENTINELS. Each is a distinct string so a leak is a substring match
   rather than a reading of the text. */
const DRAFT_SECRET   = 'DRAFTSENTINEL-reps-must-never-see-this';
const TRANSCRIPT_SECRET = 'TRANSCRIPTSENTINEL-Logan-takes-forty-percent-and-we-floor-at-nine-thousand';
const PUBLISHED_TEXT = 'PUBLISHEDBODY-ask-what-the-lock-expiry-is-before-you-answer';

/* kb_notes as the OWNER's login sees it: both notes, draft included.
   A rep's login would get [] here from Postgres — that is VERIFY-RLS.md §6,
   not something this file can prove. */
globalThis.__KB_NOTES__=[
  {id:'kb_draft',title:'Half-written thing',category:'Process',tags:['wip'],body:DRAFT_SECRET,
   sourceLogId:'',status:'draft',createdAt:'2026-08-01T10:00:00.000Z',createdBy:'Garrett',updatedAt:'2026-08-05T10:00:00.000Z'},
  {id:'kb_live',title:'Rate lock objection',category:'Objections',tags:['lenders'],body:PUBLISHED_TEXT,
   sourceLogId:'',status:'published',createdAt:'2026-08-01T10:00:00.000Z',createdBy:'Garrett',updatedAt:'2026-08-09T10:00:00.000Z'},
];
/* kb_published — what a rep and the assistant may read. The draft is ABSENT,
   which is the physical fact the whole design rests on. */
globalThis.__KB_PUB__=[
  {id:'kb_live',title:'Rate lock objection',category:'Objections',tags:['lenders'],
   body:PUBLISHED_TEXT,published_at:'2026-08-09T10:00:00.000Z'},
];

globalThis.__MLOGS__=[
  {id:'ml1',kind:'internal',meetingDate:'2026-08-10',source:'Voice memo',attendees:['Garrett','Logan'],
   transcript:TRANSCRIPT_SECRET+' '+'and here is how we actually handle the rate lock question. '.repeat(12),
   createdAt:'2026-08-10T10:00:00.000Z',createdBy:'Garrett',
   extraction:{title:'Sunday CEO',headline:'.',summary:'.',themes:[],decisions:[],actions:[],numbers:[],risks:[],openItems:[],loopReview:[]}},
];

globalThis.__LEADS__=[
  {id:'l1',name:'Rita Alvarez',company:'Alvarez Realty',stage:'new',owner:'Garrett',
   createdAt:'2026-07-01T10:00:00.000Z',meetings:[],deals:[],dealValue:0,activities:[]},
];

/* every outbound request is recorded, and nothing reaches the network */
globalThis.__FETCHES__=[];
globalThis.fetch=async(u,opts={})=>{
  const url=String(u);
  globalThis.__FETCHES__.push({url,body:opts&&opts.body?String(opts.body):''});
  if(url.includes('google-status')) return {ok:true,json:async()=>({connected:false,email:''})};
  if(url.includes('/api/kb-draft')) return {ok:true,json:async()=>({ok:true,draft:{
    title:'Handling the rate lock',category:'Objections',tags:['lenders'],
    body:'When a lender says the rate is locked, ask what the expiry is.'}})};
  if(url.includes('/api/jarvis')) return {ok:true,json:async()=>({ok:true,text:JSON.stringify({answer:'Checked.',actions:[],cited:[]}),usage:{},cost:0,spent:0,budget:20})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync(path.join(here,'.bkb.mjs'),out.outputFiles[0].text);
const mod=await import('./.bkb.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const rootEl=createRoot(document.getElementById('root'));
await act(async()=>{rootEl.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,120));});

const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const setV=async(el,v)=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  const st=Object.getOwnPropertyDescriptor(proto,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));
const txt=()=>document.body.textContent||'';

console.log('\nthe tab is there and lists both notes');
await nav('Playbook');
ok('the Playbook screen opened', /How the business runs/.test(txt()), txt().slice(0,180));
ok('the published note is listed', /Rate lock objection/.test(txt()));
ok('the draft is listed FOR THE OWNER', /Half-written thing/.test(txt()));
ok('the draft is marked owner-only', /Draft · only you/.test(txt()));
ok('the published note says reps can read it', /reps can read/.test(txt()));

console.log('\nTIER 3 — the JARVIS request never carries draft text');
{
  const before=globalThis.__FETCHES__.length;
  await nav('JARVIS'); await settle(120);
  const box=document.querySelector('textarea');
  ok('the assistant has an input', !!box);
  if(box){
    await setV(box,'how do we handle a rate lock objection');
    const send=document.querySelector('.jv-send');
    if(send) await click(send);
    await settle(200);
  }
  const calls=globalThis.__FETCHES__.slice(before).filter(f=>f.url.includes('/api/jarvis'));
  ok('a request actually went out', calls.length===1, 'calls='+calls.length);
  const body=calls.map(c=>c.body).join('');
  /* THE ASSERTION THIS WHOLE FILE EXISTS FOR */
  ok('the DRAFT sentinel is not in the outbound body', !body.includes(DRAFT_SECRET));
  ok('the draft title is not in it either', !body.includes('Half-written thing'));
  ok('the published note IS in it', body.includes(PUBLISHED_TEXT));
  ok('no transcript went out', !body.includes(TRANSCRIPT_SECRET));
}

console.log('\nsaving never publishes');
{
  await nav('Playbook');
  const row=[...document.querySelectorAll('.hli')].find(e=>/Half-written thing/.test(e.textContent||''));
  if(row) await click(row); await settle();
  ok('the editor opened on the draft', /Half-written thing/.test(txt()));
  const pubBefore=globalThis.__KB_PUBLISHED__.length;
  const save=btn(/^\s*Save\s*$/);
  ok('there is a Save button', !!save);
  if(save) await click(save); await settle();
  ok('the note was written', globalThis.__KB_WRITES__.length>=1, JSON.stringify(globalThis.__KB_WRITES__.map(w=>w.id)));
  ok('saving called kb_publish zero times', globalThis.__KB_PUBLISHED__.length===pubBefore);
  ok('no write carried a status of published',
     globalThis.__KB_WRITES__.every(w=>w.status!=='published'||w.id==='kb_live'));
}

console.log('\nthe preview comes from kb_preview(), not from the editor');
{
  /* The database is made to disagree with the editor on purpose. If the screen
     re-rendered its own state, it would show the editor's text and this test
     would fail — which is the entire point of asserting it. */
  globalThis.__KB_PREVIEW_ROW__={title:'TITLE-FROM-THE-DATABASE',category:'Objections',
    tags:['fromdb'],body:'BODY-FROM-THE-DATABASE'};
  const box=[...document.querySelectorAll('textarea')].pop();
  if(box) await setV(box,'EDITOR-ONLY-TEXT-not-in-the-database');
  const prev=btn(/Preview what a rep sees/);
  ok('there is a preview button', !!prev);
  if(prev) await click(prev); await settle(140);
  ok('kb_preview was actually called', globalThis.__KB_PREVIEWS__.length>=1);
  ok('the preview screen opened', /Exactly what a rep will see/.test(txt()));
  ok('it shows the DATABASE text', /BODY-FROM-THE-DATABASE/.test(txt()));
  ok('it does NOT show the unsaved editor text', !txt().includes('EDITOR-ONLY-TEXT-not-in-the-database'));
  ok('it names what stays behind', /Stays with you/.test(txt()));
  globalThis.__KB_PREVIEW_ROW__=null;
}

console.log('\npublishing is one explicit call, and re-publishing does not duplicate');
{
  const before=globalThis.__KB_PUBLISHED__.length;
  const go=btn(/Publish to reps|Publish these changes/);
  ok('the publish button is on the PREVIEW screen', !!go);
  if(go) await click(go); await settle(140);
  ok('exactly one kb_publish call', globalThis.__KB_PUBLISHED__.length===before+1,
     JSON.stringify(globalThis.__KB_PUBLISHED__));
  const rows=(globalThis.__KB_PUB__||[]).filter(r=>r.id==='kb_draft');
  ok('it produced exactly one published row', rows.length===1, 'rows='+rows.length);
  ok('the published body is the note text, not a transcript', rows[0] && !rows[0].body.includes(TRANSCRIPT_SECRET));
}

console.log('\na transcript never reaches a Playbook note');
{
  await nav('Playbook');
  const nw=btn(/New note/);
  if(nw) await click(nw); await settle();
  const start=btn(/Start from a meeting recording/);
  ok('the meeting picker is offered', !!start);
  if(start) await click(start); await settle();
  const pick=[...document.querySelectorAll('.hli')].find(e=>/Sunday CEO/.test(e.textContent||''));
  ok('a meeting with a transcript is listed', !!pick);
  if(pick) await click(pick); await settle(160);
  ok('the drafted text landed in the editor', /rate is locked/.test(txt()), txt().slice(0,200));
  ok('the transcript did NOT land in the editor', !txt().includes(TRANSCRIPT_SECRET));

  const kbBefore=globalThis.__KB_WRITES__.length;
  const save=btn(/^\s*Save\s*$/);
  if(save) await click(save); await settle();
  const written=globalThis.__KB_WRITES__.slice(kbBefore);
  ok('saving wrote the note', written.length>=1);
  ok('NO write anywhere contains the transcript',
     globalThis.__KB_WRITES__.every(w=>!JSON.stringify(w).includes(TRANSCRIPT_SECRET)));
  ok('the transcript never reached the leads table',
     globalThis.__WRITES__.every(w=>!JSON.stringify(w).includes(TRANSCRIPT_SECRET)));
  ok('only the meeting id is kept as the source',
     written.every(w=>!w.transcript && (w.sourceLogId===''||w.sourceLogId==='ml1')),
     JSON.stringify(written.map(w=>({s:w.sourceLogId,t:!!w.transcript}))));
}

console.log('\nthe "published version is behind" indicator');
{
  /* kb_live was published on the 9th and edited on the 9th in the fixture, so
     it starts in sync. Editing it must light the indicator. */
  await nav('Playbook');
  /* The previous block left us in the editor. Clicking the tab you are already
     on does not unmount the screen, so walk back through the app's own button
     rather than assuming a fresh mount. */
  const back=btn(/All notes/);
  if(back) await click(back); await settle();
  const row=[...document.querySelectorAll('.hli')].find(e=>/Rate lock objection/.test(e.textContent||''));
  ok('the published note is in the list', !!row);
  if(row) await click(row); await settle();
  ok('the editor opened on the published note', /Rate lock objection/.test(txt()));
  ok('it does not claim to be behind yet', !/Published version is behind/.test(txt()));
  const box=[...document.querySelectorAll('textarea')].pop();
  if(box) await setV(box, PUBLISHED_TEXT+' and one more line.');
  const save=btn(/^\s*Save\s*$/);
  if(save) await click(save); await settle(140);
  ok('now it says the published version is behind', /Published version is behind/.test(txt()), txt().slice(0,300));
  ok('it says what reps are still reading', /still reading/.test(txt()));
}

console.log('\n'+pass+' passed, '+fail+' failed');
try{ await act(async()=>{rootEl.unmount()}); dom.window.close(); }catch{}
process.exit(fail?1:0);
