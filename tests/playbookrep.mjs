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

console.log('\npagination — the deck, and what must never happen to a card');
{
  const body=[
    'They say: *"what is the catch?"*','',
    '> "No catch. It is built."','',
    '## Why it works','',
    'Answer it flat and fast.',
  ].join('\n');
  const cards=kb.paginate(body);
  ok('the author\'s ## is the card boundary', cards.length===2, String(cards.length));
  ok('  the heading names the second card', cards[1].heading==='Why it works', cards[1].heading);
  ok('  and the first card has no heading of its own', !cards[0].heading);

  /* THE SHAPE THE WHOLE DECK IS FOR. */
  const sh=kb.cardShape(cards[0].blocks);
  ok('card one carries the spoken line', !!sh.say);
  ok('  the short lead-in becomes an eyebrow, not a competitor', !!sh.eyebrow);
  ok('  and nothing else is on that card', sh.rest.length===0, JSON.stringify(sh.rest));

  /* Both tiers visible at once: a say with trailing prose splits into the
     spoken line and the recessive remainder. */
  const mixed=kb.cardShape(kb.parseBlocks('> "Say this."\n\nAnd here is why it works.'));
  ok('prose after a spoken line is the recessive remainder',
     !!mixed.say && mixed.rest.length===1 && mixed.rest[0].kind==='p', JSON.stringify(mixed.rest));
  ok('  while prose with no spoken line is not',
     kb.cardShape(kb.parseBlocks('Just prose.')).say===null);

  /* A long lead-in is NOT an eyebrow: a rep must never read a paragraph to
     reach the sentence he needs. */
  const long=kb.cardShape(kb.parseBlocks('x'.repeat(200)+'\n\n> "Say this."'));
  ok('a long paragraph before the say is moved below it, not made an eyebrow',
     long.eyebrow===null && long.rest.length===1, JSON.stringify({e:!!long.eyebrow,r:long.rest.length}));

  ok('pagination is deterministic', JSON.stringify(kb.paginate(body))===JSON.stringify(kb.paginate(body)));
  ok('an empty note is one empty card, not a crash',
     kb.paginate('').length===1 && kb.paginate('')[0].blocks.length===0);
}

console.log('\nevery seeded note fits its cards, and every objection leads with the line');
{
  const raw=JSON.parse(fs.readFileSync(path.join(root,'PLAYBOOK-SEED.json'),'utf8')).notes;
  const over=[], noSay=[];
  for(const n of raw){
    const cards=kb.paginate(n.body);
    for(const c of cards){
      const cost=c.blocks.reduce((s,b)=>s+kb.blockCost(b),0);
      if(cost>kb.CARD_BUDGET) over.push(n.title+' ('+cost+')');
    }
    if(n.category==='Objections'&&!kb.cardShape(cards[0].blocks).say) noSay.push(n.title);
  }
  ok('no card is over budget', over.length===0, over.join(', '));
  ok('EVERY objection leads with the words to say', noSay.length===0, noSay.join(', '));

  /* The swap table: one card per industry, then the whole table for comparing.
     Six industries in the source, so six row cards and one all-rows card. */
  const swap=raw.find(n=>/Six industries/.test(n.title));
  const cards=kb.paginate(swap.body);
  const rows=cards.filter(c=>c.blocks.some(b=>b.kind==='rowcard'));
  ok('the swap table becomes one card per industry', rows.length===6, String(rows.length));
  ok('  each knows where it is in the set', rows.every(c=>Array.isArray(c.pos)&&c.pos[1]===6));
  ok('  and the whole table is still reachable, as the comparison card',
     cards.some(c=>c.all&&c.blocks.some(b=>b.kind==='table')));
  ok('  which comes after the row cards, not before',
     cards.findIndex(c=>c.all) > cards.findIndex(c=>c.blocks.some(b=>b.kind==='rowcard')));

  /* Nine compliance rules do not fit one card and MUST split — but only
     between rules, never inside one. */
  const comp=raw.find(n=>/cannot say/i.test(n.title));
  const ccards=kb.paginate(comp.body);
  const items=ccards.flatMap(c=>c.blocks.filter(b=>b.kind==='caution')).flatMap(b=>b.items);
  ok('the compliance list paginates', ccards.length>1, String(ccards.length));
  ok('  and not one rule is lost or cut in half',
     items.length===kb.cautionItems({body:comp.body}).length,
     items.length+' vs '+kb.cautionItems({body:comp.body}).length);
}

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
  ok('the note is open', !!document.querySelector('.pb-card'));
  ok('it took exactly two clicks', clicks===2, String(clicks));
}

console.log('\nTHE THING THIS IS JUDGED ON — the words to say are what he lands on');
{
  /* Two clicks in, no scrolling, no scanning: the spoken line must be ON the
     first card and must be the dominant thing on it. */
  const card=document.querySelector('.pb-card');
  const say=card&&card.querySelector('.pb-say');
  ok('the first card carries the spoken block', !!say);
  ok('the words to say are inside it', !!say && (say.textContent||'').includes(SAID));

  /* AND THE COACHING IS NOT ON THIS CARD AT ALL. It lives behind the note's
     own `## Why it works`, which is where the card break comes from — so
     there is nothing to scan past, not merely something smaller to ignore. */
  ok('the coaching is not on the first card', !(card.textContent||'').includes(COACH),
     (card.textContent||'').slice(0,160));

  /* Nothing above the say may compete with it. The eyebrow is allowed, because
     it is 13px dim italic against 28px 600 — but nothing else. */
  const before=[...card.querySelectorAll('.pb-cbody > *')];
  const sayIdx=before.findIndex(e=>e.classList.contains('pb-say'));
  ok('the say block is first in the card body, or second behind only an eyebrow',
     sayIdx===0 || (sayIdx===1 && before[0].classList.contains('pb-eyebrow')),
     before.map(e=>e.className).join(' | '));

  ok('the deck says how many cards there are', /1 \/ 2/.test(card.textContent||''),
     (card.querySelector('.pb-count')||{}).textContent||'no counter');
}

console.log('\nthe coaching is one click away, and looks different when it arrives');
{
  const next=[...document.querySelectorAll('.pb-nav button')].pop();
  ok('there is a next control', !!next);
  if(next) await click(next); await settle();
  const card=document.querySelector('.pb-card');
  ok('the coaching is on the second card', (card.textContent||'').includes(COACH));
  /* BODY copy, not the recessive coaching treatment — and that is correct.
     The recessive style exists so prose does not compete with a spoken line on
     the same card. Here there is no spoken line: the explanation IS the card,
     so shrinking it would leave nothing for it to recede from. The two-tier
     split is asserted as a pure function in part 1, where both tiers can be
     seen at once. */
  ok('and it is rendered as body copy, because it is the whole card',
     !!card.querySelector('.pb-body .pb-p'),
     (card.querySelector('.pb-cbody')||{}).className||'');
  ok('the counter moved', /2 \/ 2/.test(card.textContent||''),
     (card.querySelector('.pb-count')||{}).textContent||'');
  ok('and Back is now available', [...document.querySelectorAll('.pb-nav button')]
     .some(b=>/Back/.test(b.textContent||'')&&!b.disabled));
}

console.log('\nthe compliance list is reachable from the strip, in one click');
{
  await click(btn(/Back to the playbook/)); await settle();
  const strip=document.querySelector('.pb-strip');
  await click(strip); await settle();
  ok('the strip opens the compliance note', /cannot say/i.test((document.querySelector('.pb-ctitle')||{}).textContent||''),
     (document.querySelector('.pb-ctitle')||{}).textContent||'');
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

  /* NO BRAND WASH ON A LARGE SURFACE. tint(cobalt,.06) resolves to
     rgb(242,244,253) — a pale violet, not cobalt — and it used to fill the
     tiles and the say block. A brand colour diluted to 6% is not that colour;
     at that size it is a tint nobody chose, and it is the first thing anyone
     notices. Brand belongs at full strength on small marks. */
  ok('no cobalt wash token is defined at all', !/--pb-primary-wash/.test(src));
  ok('  the tiles are white', /\.pb-tile\{[^}]*background:white/.test(src));
  ok('  the say block fills with the neutral grey, not a brand tint',
     /\.pb-say\{[^}]*background:var\(--pb-well\)/.test(src));
  ok('  and carries the brand at FULL strength as a rule, not a fill',
     /\.pb-say\{border-left:4px solid var\(--pb-primary\)/.test(src));

  /* THE PREVIEW MUST NOT BE A SECOND IMPLEMENTATION. It rendered pre-wrap
     while the rep view parsed, so the owner saw ## and ** and the rep saw
     neither — the one screen whose job is "show me what he gets" was the only
     one that could not. */
  ok('nothing renders a body as raw pre-wrap any more', !/whiteSpace: 'pre-wrap'/.test(src));
  ok('the deck is exported as ONE component', /export function NoteCards/.test(src));
  const previewSrc=src.slice(src.indexOf('function Preview('), src.indexOf('function Editor('));
  const repSrc=src.slice(src.indexOf('function RepList('), src.indexOf('function Preview('));
  ok('the owner Preview renders it', /<NoteCards note=/.test(previewSrc));
  ok('the rep view renders it', /<NoteCards note=/.test(repSrc));
  ok('  and neither builds its own body renderer',
     !/parseBlocks\(/.test(previewSrc) && !/parseBlocks\(/.test(repSrc));
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
