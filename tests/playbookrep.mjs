/* THE PLAYBOOK AS A REP ACTUALLY USES IT — tiles, two clicks, and the split
   between what he SAYS and why it works.

   WHAT THIS SUITE IS FOR

   tests/kbrep.mjs proves the rep side leaks nothing. This one proves it is
   USABLE, which is a different claim and has its own failure mode:

     A rep is on a live call. The prospect says "what's the catch." If the
     words he is supposed to say are three paragraphs into a wall of coaching,
     the screen has failed him at the only moment it existed for.

   So the assertions here are about REACHABILITY and SEPARATION:

     1. An objection is TWO CLICKS from anywhere — the Playbook tab, then the
        tile. No intermediate list, no category screen in between.
     2. The spoken line and the reasoning are DIFFERENT ELEMENTS. Not different
        fonts agreed by convention — different nodes, so a stylesheet change
        cannot silently merge them back into one block.
     3. Modules and notes come back in a STABLE, DOCUMENT order. The old rep
        list sorted by publish date, so editing SOP-04 moved it above SOP-01.
     4. The compliance list is pinned to the landing and is the ACTUAL
        compliance list, not whichever note happens to carry a rule or two.

   And two properties of the importer, both of which are safety rather than
   convenience:

     5. Importing creates DRAFTS and cannot publish.
     6. Importing twice does not duplicate.

   Paths resolve from this file, so it runs as `node tests/playbookrep.mjs`. */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,240):''));}};

/* ==================================================== part 1: the pure lib */

const kb = await import('../src/lib/kb.js');

const P = (id,title,category,body,tags=[],published_at='2026-08-01T10:00:00.000Z') =>
  ({id,title,category,tags,body,published_at});

console.log('\nmodules come back in a stable order, highest-frequency first');
{
  /* Deliberately fed in the WRONG order, and with the SOPs published newest
     first — the exact shape that used to render SOP-06 above SOP-01. */
  const rows=[
    P('s6','SOP-06 · How you get paid','Process','x','',[],'2026-08-20T10:00:00.000Z'),
    P('s1','SOP-01 · Running a calling block','Process','x',[],'2026-08-02T10:00:00.000Z'),
    P('s4','SOP-04 · Follow-up','Process','x',[],'2026-08-19T10:00:00.000Z'),
    P('sc2','2. The in','Script','x'),
    P('sc0','0. How this call works','Script','x'),
    P('ob','Not interested','Objections','x'),
    P('cm','Things you cannot say','Compliance','! **No client names.** Ever.'),
  ];
  const mods=kb.kbModules(rows);
  ok('Objections is the first module', mods[0] && mods[0].key==='Objections', mods.map(m=>m.key).join(','));
  ok('Compliance is second', mods[1] && mods[1].key==='Compliance', mods.map(m=>m.key).join(','));
  ok('Script is third', mods[2] && mods[2].key==='Script');
  ok('Process is fourth', mods[3] && mods[3].key==='Process');

  const sops=mods.find(m=>m.key==='Process').notes.map(n=>n.id);
  ok('SOPs are in document order, not publish order', sops.join(',')==='s1,s4,s6', sops.join(','));
  const script=mods.find(m=>m.key==='Script').notes.map(n=>n.id);
  ok('script sections are in document order', script.join(',')==='sc0,sc2', script.join(','));
}

console.log('\nan unranked category still gets a module rather than vanishing');
{
  const mods=kb.kbModules([P('a','Thing','Vendors','x'),P('b','Other thing','Zebra rituals','x')]);
  ok('both modules exist', mods.length===2, mods.map(m=>m.key).join(','));
  ok('the known-but-unranked one sorts before the unknown one',
     mods[0].key==='Vendors', mods.map(m=>m.key).join(','));
}

console.log('\nthe compliance list is found by content, and it is the RIGHT note');
{
  /* The price objection legitimately ends in three rules, and it sits in the
     FIRST module. First-match would pin it to the landing screen and a rep
     would learn that three of the nine rules are all of them. */
  const price=P('p','What does it cost?','Objections',
    'Say the range.\n\n! **Never invent a monthly.** No.\n! **Never price the CRM.** No.\n! **Never discount.** No.');
  const rules=P('c','Things you cannot say','Compliance',
    ['! **No results promises.** None of it.',
     '! **No timelines.** You do not know.',
     '! **No price outside the build range.** Nothing else.',
     '! **No client names.** Not yours to give.'].join('\n'));
  const mods=kb.kbModules([price,rules]);
  const c=kb.cautionNote(mods);
  ok('the compliance note wins on count, not position', c && c.id==='c', c && c.id);
  ok('every rule is picked up', kb.cautionItems(c).length===4, String(kb.cautionItems(c).length));
  ok('the chips are short headlines',
     kb.cautionItems(c).map(kb.leadOf).every(l=>l.length>0&&l.length<=40),
     kb.cautionItems(c).map(kb.leadOf).join(' | '));
  ok('no note with rules means no strip rather than a wrong one',
     kb.cautionNote(kb.kbModules([P('x','Plain','Script','Just prose.')]))===null);
}

console.log('\nthe body parser separates what you SAY from why it works');
{
  const body=[
    'They say: *"what\'s the catch?"*','',
    '> "No catch. It is built."','>','> "Happens more than you\'d think."','',
    '## Why it works','',
    'Answer it flat and fast.',
  ].join('\n');
  const b=kb.parseBlocks(body);
  const say=b.find(x=>x.kind==='say');
  ok('the spoken lines are their own block kind', !!say);
  ok('a bare > splits it into two spoken paragraphs', say && say.paras.length===2, JSON.stringify(say&&say.paras));
  ok('the coaching is NOT in the say block',
     say && !say.paras.join(' ').includes('Answer it flat'), JSON.stringify(say&&say.paras));
  ok('the coaching is a paragraph block', b.some(x=>x.kind==='p'&&/Answer it flat/.test(x.text)));
  ok('the heading survives', b.some(x=>x.kind==='h'&&x.text==='Why it works'));
}

console.log('\nthe parser drops nothing and invents no markup');
{
  const b=kb.parseBlocks('| A | B |\n|---|---|\n| x | y |');
  const t=b.find(x=>x.kind==='table');
  ok('a table header is read', t && t.head.join(',')==='A,B', JSON.stringify(t&&t.head));
  ok('the |---| rule is not a data row', t && t.rows.length===1, JSON.stringify(t&&t.rows));
  ok('unknown syntax degrades to a paragraph rather than disappearing',
     kb.parseBlocks('~~~weird~~~').some(x=>x.kind==='p'&&x.text.includes('weird')));
  const seg=kb.parseInline('a **b** c `d` e');
  ok('inline returns SEGMENTS, never a markup string',
     Array.isArray(seg)&&seg.every(s=>typeof s.s==='string'&&/^[tbic]$/.test(s.t)), JSON.stringify(seg));
}

/* ============================================ part 2: the shipped content */

console.log('\nPLAYBOOK-SEED.json is importable as it stands');
{
  const raw=fs.readFileSync(path.join(root,'PLAYBOOK-SEED.json'),'utf8');
  const seed=JSON.parse(raw);
  const notes=seed.notes||[];
  ok('the file parses and has notes', notes.length>0, String(notes.length));
  ok('every note has a title and a body', notes.every(n=>String(n.title||'').trim()&&String(n.body||'').trim()));
  /* Postgres caps the published body at 8,000. A seed file that cannot be
     published is a seed file that looks fine until the owner presses the
     button on note fourteen. */
  const over=notes.filter(n=>String(n.body).length>8000);
  ok('no body exceeds the 8,000-character Postgres cap', over.length===0, over.map(n=>n.title).join(','));
  ok('no duplicate titles — the importer skips by title',
     new Set(notes.map(n=>n.title.trim().toLowerCase())).size===notes.length);

  const rows=notes.map((n,i)=>P('seed'+i,n.title,n.category,n.body,n.tags));
  const mods=kb.kbModules(rows);
  ok('objections lead the screen', mods[0].key==='Objections', mods.map(m=>m.key).join(','));
  ok('all five objections are separate notes — that is what makes it two clicks',
     mods[0].notes.length===5, String(mods[0].notes.length));
  /* Every objection must carry a spoken answer. One that is all prose is the
     failure this whole screen exists to prevent, and it would be invisible. */
  const noSay=mods[0].notes.filter(n=>!kb.parseBlocks(n.body).some(b=>b.kind==='say'));
  ok('every objection has words to say out loud', noSay.length===0, noSay.map(n=>n.title).join(','));
  const c=kb.cautionNote(mods);
  ok('the compliance list is the pinned one', c && /cannot say/i.test(c.title), c&&c.title);
  ok('it carries every rule', kb.cautionItems(c).length>=9, String(kb.cautionItems(c).length));
}

/* ================================================== part 3: the rep screen */

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver','File','Blob']){
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
globalThis.__MLOGS__=[];globalThis.__LEADS__=[];

globalThis.__USERS__=[
  {id:'u_rep',name:'Tony',email:'tony@getproytech.com',role:'rep',pools:[],
   commission_pct:25,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];

const SAID   = 'SPOKENLINE-no-catch-it-is-built-it-is-real';
const COACH  = 'COACHINGTEXT-answer-it-flat-and-fast';
globalThis.__KB_NOTES__=[];
globalThis.__KB_PUB__=[
  {id:'ob1',title:"What's the catch?",category:'Objections',tags:['catch'],
   body:`They say: *"what's the catch?"*\n\n> "${SAID}"\n\n## Why it works\n\n${COACH}`,
   published_at:'2026-08-09T10:00:00.000Z'},
  {id:'ob2',title:'Not interested',category:'Objections',tags:[],
   body:'> "Totally fair."\n\nOne attempt.',published_at:'2026-08-09T10:00:00.000Z'},
  {id:'cm1',title:'Things you cannot say',category:'Compliance',tags:[],
   body:['! **No results promises.** Not even as a joke.',
         '! **No timelines.** You do not know.',
         '! **No client names.** Not yours to give.'].join('\n'),
   published_at:'2026-08-09T10:00:00.000Z'},
  {id:'sp1',title:'SOP-01 · Running a calling block',category:'Process',tags:[],
   body:'Dial in sets of twenty.',published_at:'2026-08-20T10:00:00.000Z'},
];

globalThis.__FETCHES__=[];
globalThis.fetch=async(u,opts={})=>{
  const url=String(u);
  globalThis.__FETCHES__.push({url,body:opts&&opts.body?String(opts.body):''});
  if(url.includes('google-status')) return {ok:true,json:async()=>({connected:false,email:''})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync(path.join(here,'.bpr.mjs'),out.outputFiles[0].text);
const mod=await import('./.bpr.mjs?v='+Date.now());
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
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));
const txt=()=>document.body.textContent||'';

console.log('\nthe landing screen puts the objections first and pins the rules');
let clicks=0;
await nav('Playbook'); clicks++; await settle(120);
{
  const heads=[...document.querySelectorAll('.pb-mod-h b')].map(e=>(e.textContent||'').trim());
  ok('Objections is the first module heading', heads[0]==='Objections', heads.join(' | '));
  ok('the objections module is the emphasised one', !!document.querySelector('.pb-tiles.lead'));
  ok('each objection is its own tile',
     [...document.querySelectorAll('.pb-tiles.lead .pb-tile')].length===2,
     String([...document.querySelectorAll('.pb-tiles.lead .pb-tile')].length));

  const strip=document.querySelector('.pb-strip');
  ok('the compliance strip is on the landing screen', !!strip);
  const chips=[...document.querySelectorAll('.pb-chip')].map(e=>(e.textContent||'').trim());
  ok('its headlines are readable without opening anything', chips.length===3, chips.join(' | '));
  ok('the headline is the rule, not the whole sentence',
     chips.includes('No results promises')&&chips.includes('No client names'), chips.join(' | '));
  ok('the compliance note is not ALSO drawn as a tile',
     ![...document.querySelectorAll('.pb-tile')].some(t=>/cannot say/i.test(t.textContent||'')));
}

console.log('\nan objection is TWO clicks from the sidebar');
{
  const tile=[...document.querySelectorAll('.pb-tile')].find(e=>/catch/i.test(e.textContent||''));
  ok('the objection tile is on the landing screen — no list in between', !!tile);
  if(tile){ await click(tile); clicks++; }
  await settle();
  ok('the note is open', !!document.querySelector('.pb-note'));
  ok('it took exactly two clicks', clicks===2, String(clicks));
}

console.log('\nwhat he SAYS and why it works are different elements');
{
  const say=document.querySelector('.pb-note .pb-say');
  ok('there is a spoken block', !!say);
  ok('the words to say are inside it', !!say && (say.textContent||'').includes(SAID));
  ok('the coaching is NOT inside it', !!say && !(say.textContent||'').includes(COACH),
     (say&&say.textContent||'').slice(0,120));
  const coachEl=[...document.querySelectorAll('.pb-note .pb-p')].find(e=>(e.textContent||'').includes(COACH));
  ok('the coaching is a separate paragraph element', !!coachEl);
  /* Structural, not stylistic: two different nodes with two different classes.
     Asserting on font-size would be asserting on a stylesheet jsdom does not
     apply, and would pass whatever the screen looked like. */
  ok('they are not the same node', !!coachEl && !!say && !say.contains(coachEl));
}

console.log('\nthe compliance list is reachable from the strip, in one click');
{
  await click(btn(/Back to the playbook/)); await settle();
  const strip=document.querySelector('.pb-strip');
  await click(strip); await settle();
  ok('the strip opens the compliance note', /cannot say/i.test((document.querySelector('.pb-note h1')||{}).textContent||''),
     (document.querySelector('.pb-note h1')||{}).textContent||'');
  ok('the rules render as a rule list, not as prose', !!document.querySelector('.pb-caution'));
  ok('every rule is on screen', [...document.querySelectorAll('.pb-caution div')].length===3,
     String([...document.querySelectorAll('.pb-caution div')].length));
}

console.log('\nreading the playbook writes nothing, as before');
{
  ok('nothing was written to kb_notes', globalThis.__KB_WRITES__.length===0, JSON.stringify(globalThis.__KB_WRITES__));
  ok('nothing was published', globalThis.__KB_PUBLISHED__.length===0);
  ok('a rep sees no import control', !btn(/Import notes/));
}

/* ================================================ part 4: source discipline */

console.log('\nthe screen stays white-labellable and cannot render markup');
{
  const src=fs.readFileSync(path.join(root,'src/Playbook.jsx'),'utf8');
  /* Same rule tests/content.mjs holds ContentStudio.jsx to: colour lives in
     brand.js, not in a component, or a white-label install cannot be restyled
     without editing React. */
  const hex=src.match(/#[0-9a-fA-F]{3,8}\b/g)||[];
  ok('no hex colours in Playbook.jsx', hex.length===0, hex.join(' '));
  ok('it reads its colours from BRAND', /BRAND\.colors/.test(src));
  /* A Playbook note is text an owner typed. The one guaranteed way to keep
     typed text from becoming script is to have no path that renders it as
     markup — the parser returns data and the screen maps it to elements. */
  ok('nothing is rendered as raw HTML', !/dangerouslySetInnerHTML/.test(src));
  /* The importer must not be one button away from publishing to every rep. */
  const imp=src.slice(src.indexOf('const doImport'), src.indexOf('const doDelete'));
  ok('the importer exists', imp.length>200);
  ok('the importer never publishes', !/publishNote/.test(imp), imp.slice(0,120));
  ok('the importer validates before it writes any row',
     imp.indexOf('bad.length')>0 && imp.indexOf('bad.length')<imp.indexOf('await saveNote'),
     'validate at '+imp.indexOf('bad.length')+', write at '+imp.indexOf('await saveNote'));
  ok('the importer skips titles that already exist', /have\.has/.test(imp));
}

console.log('\n'+pass+' passed, '+fail+' failed');
try{ await act(async()=>{rootEl.unmount()}); dom.window.close(); }catch{}
process.exit(fail?1:0);
