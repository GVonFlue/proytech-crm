/* PLAYBOOK, THE REP SIDE — what a sales rep's browser does with it.

   WHAT ENFORCES THIS, AND WHAT THIS FILE IS

   A rep gets zero rows from kb_notes because of an RLS policy, and that is
   proved against a real Postgres with real logins in VERIFY-RLS.md §6. It is
   not provable from jsdom and this file does not pretend to prove it.

   So this suite is the SECOND line, and it is deliberately adversarial: the
   fixture hands a rep's browser a draft it should never have been given, as
   though the policy had been dropped. Nothing here should surface it — not the
   screen, not the assistant. If the database boundary ever regresses, the app
   should not cheerfully render the leak on top of it.

   Read that the right way round: the app is not the control. This is what
   happens when the control fails.                                          */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,220):''));}};

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
globalThis.__KB_WRITES__=[];globalThis.__KB_PUBLISHED__=[];globalThis.__KB_PREVIEWS__=[];

/* signed in as a REP */
globalThis.__USERS__=[
  {id:'u_rep',name:'Dana',email:'dana@getproytech.com',role:'rep',pools:['Inbound'],
   commission_pct:10,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];

const DRAFT_SECRET   = 'DRAFTSENTINEL-pay-split-and-the-price-floor';
const PUBLISHED_TEXT = 'PUBLISHEDBODY-ask-what-the-lock-expiry-is-before-you-answer';

/* THE ADVERSARIAL BIT: a rep's browser is handed a draft. In a correctly
   migrated install this array is EMPTY for a rep, because kb_notes RLS returns
   them nothing. Putting a draft here models the policy having been dropped. */
globalThis.__KB_NOTES__=[
  {id:'kb_draft',title:'Half-written thing',category:'Process',tags:[],body:DRAFT_SECRET,
   sourceLogId:'',status:'draft',createdAt:'2026-08-01T10:00:00.000Z',createdBy:'Garrett',updatedAt:'2026-08-05T10:00:00.000Z'},
];
globalThis.__KB_PUB__=[
  {id:'kb_live',title:'Rate lock objection',category:'Objections',tags:['lenders'],
   body:PUBLISHED_TEXT,published_at:'2026-08-09T10:00:00.000Z'},
];
/* a rep must not be shown meeting logs either — this array is empty for the
   same reason, and the Playbook must not offer to draft from one */
globalThis.__MLOGS__=[];

globalThis.__LEADS__=[
  {id:'l1',name:'Rita Alvarez',company:'Alvarez Realty',stage:'new',owner:'Dana',owner_id:'u_rep',
   createdAt:'2026-07-01T10:00:00.000Z',meetings:[],deals:[],dealValue:0,activities:[]},
];

globalThis.__FETCHES__=[];
globalThis.fetch=async(u,opts={})=>{
  const url=String(u);
  globalThis.__FETCHES__.push({url,body:opts&&opts.body?String(opts.body):''});
  if(url.includes('google-status')) return {ok:true,json:async()=>({connected:false,email:''})};
  if(url.includes('/api/jarvis')) return {ok:true,json:async()=>({ok:true,text:JSON.stringify({answer:'Checked.',actions:[],cited:[]}),usage:{},cost:0,spent:0,budget:20})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync(path.join(here,'.bkr.mjs'),out.outputFiles[0].text);
const mod=await import('./.bkr.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const rootEl=createRoot(document.getElementById('root'));
await act(async()=>{rootEl.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,140));});

const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle(); return !!b;};
const setV=async(el,v)=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  const st=Object.getOwnPropertyDescriptor(proto,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));
const txt=()=>document.body.textContent||'';

console.log('\na rep gets the tab at all');
const navs=[...document.querySelectorAll('.nav-i')].map(e=>(e.textContent||'').trim());
ok('Playbook is in a rep\'s sidebar by default', navs.includes('Playbook'), navs.join(' | '));
ok('Meeting Log is NOT', !navs.includes('Meeting Log'), navs.join(' | '));
ok('Money is NOT', !navs.includes('Money'));

console.log('\nthe rep screen shows published notes only');
await nav('Playbook'); await settle(120);
/* Asserted on STRUCTURE, not on the sentence under the heading. This line used
   to match the rep view's subtitle and broke the first time that copy was
   reworded, which made it a test of the copy rather than of the screen. */
ok('the rep view opened', !!document.querySelector('.pb .pb-tiles, .pb .empty'),
   (document.querySelector('.pb') && document.querySelector('.pb').className) || 'no .pb');
ok('the published note is listed', /Rate lock objection/.test(txt()));
ok('the DRAFT is not listed, even though this browser was handed one', !/Half-written thing/.test(txt()));
ok('the draft body is nowhere on the page', !txt().includes(DRAFT_SECRET));

console.log('\nand no owner controls exist on it');
ok('no New note button', !btn(/New note/));
ok('no publish button', !btn(/Publish/));
ok('no preview button', !btn(/Preview what a rep sees/));
ok('no delete button', !btn(/Delete/));
ok('no way to draft from a meeting recording', !btn(/Start from a meeting recording/));

console.log('\nopening a published note reads it, and writes nothing');
{
  /* A tile, not a list row. The old selector was `.hli`, and when it stopped
     matching, "its text is readable" KEPT PASSING — the tile carries a preview
     of the note's first line, so the body sentinel was on the page without the
     note ever having been opened. A pass that survives the click never
     happening is not a test of opening a note, so this now asserts the note
     VIEW is on screen (the back control) as well as the text. */
  const row=[...document.querySelectorAll('.pb-tile')].find(e=>/Rate lock objection/.test(e.textContent||''));
  ok('the note is clickable', !!row);
  if(row) await click(row); await settle();
  ok('the note view opened', !!document.querySelector('.pb-note') && !!btn(/Back to the playbook/));
  ok('its text is readable', txt().includes(PUBLISHED_TEXT));
  ok('reading it wrote nothing to the playbook', globalThis.__KB_WRITES__.length===0,
     JSON.stringify(globalThis.__KB_WRITES__));
  ok('reading it published nothing', globalThis.__KB_PUBLISHED__.length===0);
  ok('reading it wrote nothing to the leads table', globalThis.__WRITES__.length===0);
}

console.log('\na rep has no assistant tab unless the owner grants it');
{
  /* REP_DEFAULT_TABS does not include 'jarvis'. That is pre-existing and not
     something the Playbook changed, but it is worth pinning: it means the
     network-level rep assertion below cannot be driven through the UI on a
     default install, so it is made against buildPayload directly — the same
     function the browser calls one line before it fetches. */
  ok('no JARVIS tab by default', !navs.includes('JARVIS') && !navs.includes('Jarvis'), navs.join(' | '));
}

console.log('\nthe payload a rep would send carries published text and no draft');
{
  const jv = await import('../src/lib/jarvis.js');
  const { payload } = jv.buildPayload({
    leads: [], question: 'what do I say when a lender says the rate is locked',
    rep: true, me: 'Dana', role: 'rep',
    /* what a rep's browser actually holds: kb_ai_context() -> kb_published.
       The draft above is NOT here, because no query available to a rep returns
       it — that is the RLS boundary, proved in VERIFY-RLS.md §6. */
    kb: globalThis.__KB_PUB__,
  });
  const body = JSON.stringify(payload);
  ok('the published note is in the payload', body.includes(PUBLISHED_TEXT));
  ok('the draft sentinel is not', !body.includes(DRAFT_SECRET));
  ok('the payload says this user is a rep', /"role":"rep"/.test(body));
  ok('no money reached it', !/dealValue|retainer|commission/.test(body), body.slice(0,200));
}

console.log('\n'+pass+' passed, '+fail+' failed');
try{ await act(async()=>{rootEl.unmount()}); dom.window.close(); }catch{}
process.exit(fail?1:0);
