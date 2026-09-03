/* THE REVENUE TILE: PICK A MONTH, AND SEE WHO OWES YOU
   ============================================================================

   tests/revmonth.mjs proves the arithmetic. This proves the SCREEN — the parts
   that are only true once React has rendered them:

     · the picker starts on the current month EVERY mount, and nothing
       remembers the last choice. A stale month that still says "Revenue
       Collected" reads exactly like the current one, and that is worse than an
       extra click, so this asserts the absence of persistence directly rather
       than trusting a comment.
     · changing it moves the tile, the goal bar and the drilldown together. A
       picker that moved the headline and left the panel behind would be the
       two-screens-disagree bug inside one tile.
     · the still-owed clause SAYS WHAT IT MEANS on the screen, not in a doc. It
       is as-of-today across every month whatever month is picked, because the
       alternatives are worse: "as of the end of that month" is not computable
       (an open deal carries no date it was created), and "only work won that
       month" hides the oldest debts, which are the ones worth chasing.
     · the breakdown's rows sum to the tile's total. That is the whole point of
       a drilldown (ENGINEERING §2) and the reason the panel exists.
     · "past due" is only ever said about an invoice with a due date. A sale
       nobody billed is OLD, not LATE, and inventing a deadline nobody agreed
       to is how a client gets chased for being on time.                      */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__WRITES__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];globalThis.__USER_WRITES__=[];
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__USERS__=[{id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]}];
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const pad=n=>String(n).padStart(2,'0');
const now=new Date();
const THIS=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
const prev=new Date(now.getFullYear(),now.getMonth()-1,15);
const PREV=`${prev.getFullYear()}-${pad(prev.getMonth()+1)}`;
const PREV_NAME=new Date(prev.getFullYear(),prev.getMonth(),1).toLocaleString('en-US',{month:'long',year:'numeric'});
const dAgo=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
const ago=n=>new Date(Date.now()-n*864e5).toISOString();

/* KIDD — $3,000 of work won last month. $1,000 paid last month, $500 this
   month, $1,500 still outstanding. One record that lands in BOTH months and in
   the debt, so no assertion here can pass by accident. */
const KIDD={id:'k1',name:'Agent Kidd',company:'Kidd Realty',stage:'signed',owner:'Garrett',isClient:true,
  convertedAt:`${PREV}-04`,closedAt:`${PREV}-04`,createdAt:ago(120),activities:[],meetings:[],
  dealValue:3000,deals:[{id:'dk',label:'Build',setup:3000}],closedDeals:[],
  onboarding:{deposit_paid:{done:`${PREV}-04`,due:null}},
  payments:[{id:'pk1',amount:1000,date:`${PREV}-04`,note:'deposit'},
            {id:'pk2',amount:500,date:`${THIS}-02`,note:'part'}]};

/* LATE — won 70 days ago, $2,000 of work, $500 paid. An invoice was raised and
   went past due 20 days ago. The only record entitled to the word "overdue". */
const LATE={id:'k2',name:'Late Payer',company:'Late Ltd',stage:'signed',owner:'Garrett',isClient:true,
  convertedAt:dAgo(70),closedAt:dAgo(70),createdAt:ago(150),activities:[],meetings:[],
  dealValue:2000,deals:[{id:'dl',label:'Site',setup:2000}],closedDeals:[],
  onboarding:{deposit_paid:{done:dAgo(70),due:null}},
  payments:[{id:'pl',amount:500,date:dAgo(70),note:'deposit'}]};

/* PROSPECT — an $8,000 proposal that has NOT been won. It must appear nowhere
   in the owed panel: this is the difference between "still owed" meaning
   sold-and-unpaid and it meaning quoted work. */
const PROSPECT={id:'k3',name:'Big Prospect',company:'Prospect Co',stage:'proposal',owner:'Garrett',
  createdAt:ago(20),activities:[],meetings:[],dealValue:8000,
  deals:[{id:'dp',label:'Proposal',setup:8000}],closedDeals:[],payments:[]};

globalThis.__LEADS__=[KIDD,LATE,PROSPECT];
globalThis.__TXNS__=[{id:'t1',date:`${PREV}-09`,type:'income',amount:250,who:'Workshop',note:'one-off'}];
globalThis.__INVOICES__=[{id:'iv1',number:'INV-0031',clientId:'k2',status:'sent',
  issueDate:dAgo(50),dueDate:dAgo(20),items:[{id:'i',label:'Site',qty:1,amount:1500}],taxRate:0}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bmp.mjs',out.outputFiles[0].text);
const mod=await import('./.bmp.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
let root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,200));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,260):''));}};
const settle=async(ms=120)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const tileEl=()=>[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim()==='Revenue Collected');
const kv=()=>((tileEl()||{querySelector:()=>null}).querySelector?.('.kv')||{}).textContent||'';
const kd=()=>(((tileEl()||{querySelector:()=>null}).querySelector?.('.kd')||{}).textContent||'').replace(/ /g,' ');
const picker=()=>(tileEl()||{querySelector:()=>null}).querySelector?.('.kpi-month');
const pick=async v=>{const s=picker(); await act(async()=>{
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  setter.call(s,v); s.dispatchEvent(new dom.window.Event('change',{bubbles:true}));}); await settle(); };
const panel=()=>document.querySelector('.drill');
const panelText=()=>((panel()||{}).textContent||'').replace(/ /g,' ').replace(/\s+/g,' ');
const money=s=>{const m=String(s).match(/\$([\d,]+)/);return m?Number(m[1].replace(/,/g,'')):null;};

/* ---- expected, worked by hand from the cast above -------------------------
   THIS MONTH collected: Kidd's $500 part payment                    =   500
   LAST MONTH collected: Kidd's $1,000 deposit + $250 workshop       = 1,250
   STILL OWED (today, all months):
     Kidd   3,000 contracted − 1,500 paid                            = 1,500
     Late   2,000 contracted −   500 paid                            = 1,500
     Big Prospect — never won, never bought                          =     0
                                                              total  = 3,000
   Of that, the work won LAST MONTH is Kidd's alone                  = 1,500 */

console.log('\nthe tile opens on the current month, every time');
{
  ok('the picker is on the tile',            !!picker(), document.querySelector('.kpi')?.textContent?.slice(0,60));
  ok('  and it starts on this month',        picker().value===THIS, picker().value);
  ok('  labelled so, not as a date',         /This month/.test(picker().textContent), picker().textContent.slice(0,40));
  ok('this month collected $500',            money(kv())===500, kv());

  /* The picker's options must NOT be part of the tile's label — a <select>'s
     options are in its textContent, and a label reading "Revenue Collected
     This month August 2026 July 2026…" is wrong for a screen reader before it
     is wrong for a test. */
  ok('the label is still just the label',
     ((tileEl().querySelector('.kl')||{}).textContent||'').trim()==='Revenue Collected',
     (tileEl().querySelector('.kl')||{}).textContent);
}

console.log('\npicking a month moves the tile, the goal bar and the panel together');
{
  await pick(PREV);
  ok('the headline is last month\'s',        money(kv())===1250, kv());
  ok('  and the month is named on screen',   kd().includes(PREV_NAME), kd());
  ok('  the split follows it too',           /\$1,000 from clients/.test(kd())&&/\$250 other/.test(kd()), kd());

  /* A FINISHED month is 100% through it. Judging August against today's
     third-of-the-month pace would call a closed month "on pace" for a goal it
     never got near. */
  const goal=(tileEl().querySelector('.kgt')||{}).textContent||'';
  ok('a finished month is judged as finished, not as on pace',
     /behind pace/.test(goal)&&!/on pace/.test(goal), goal);

  await click(tileEl()); await settle();
  ok('the drilldown names the month it is showing', /Collected in /.test(panelText())&&panelText().includes(PREV_NAME), panelText().slice(0,90));
  const rows=[...document.querySelectorAll('.drill .drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
  ok('  it lists last month\'s payment',      rows.some(r=>/Kidd/.test(r)&&/\$1,000/.test(r)), rows.join(' || '));
  ok('  and this month\'s $500 is NOT in it', !rows.some(r=>/\$500\b/.test(r)), rows.join(' || '));
  ok('  the hand-entered income is there too',rows.some(r=>/Workshop/.test(r)&&/\$250/.test(r)), rows.join(' || '));
  ok('  the rows sum to the header',
     rows.reduce((a,r)=>a+(money(r.match(/\$[\d,]+(?!.*\$)/)?.[0]||'')||0),0)===1250, rows.join(' || '));
  await click(tileEl()); await settle();
}

console.log('\nstill owed says what it means, on the screen, on every month');
{
  /* The clause does not move with the picker, and it explains why in the words
     the user reads — not in a comment they never will. */
  ok('it is stated as of today, across every month',
     /still owed today, all months/.test(kd()), kd());
  ok('  and the total is the same on a past month as on this one',
     /\$3,000 still owed/.test(kd()), kd());
  ok('  with the picked month\'s share named separately',
     new RegExp(`\\$1,500 of it on work won in ${PREV_NAME}`).test(kd()), kd());

  await pick(THIS);
  ok('back on this month the debt is unchanged', /\$3,000 still owed today, all months/.test(kd()), kd());
  ok('  and the month-share clause is gone with the picker',
     !/of it on work won in/.test(kd()), kd());
}

console.log('\nthe breakdown answers who, how much, and how overdue');
{
  const link=[...document.querySelectorAll('.kpi .kd-link')][0];
  ok('the still-owed figure is pressable', !!link, kd());
  await click(link); await settle();
  const t=panelText();
  ok('  and opens its own panel',          /Still owed/.test(t), t.slice(0,80));
  ok('  headed with the total and the count', /\$3,000/.test(t)&&/2 clients/.test(t), t.slice(0,160));
  ok('  and headed with what it means',   /as of today, every month/.test(t), t.slice(0,180));

  /* THE ANSWER TO "WHICH NUMBER HAVE I BEEN LOOKING AT". The panel states it
     rather than leaving it to be inferred from a total. */
  ok('the panel says it is sold-and-not-collected', /Sold and not collected/.test(t), t.slice(0,300));
  ok('  and says explicitly that it is NOT invoiced-and-unpaid',
     /not.{0,3}invoiced-and-unpaid/.test(t), t.slice(0,320));
  ok('  and that open pipeline is excluded', /Open pipeline is excluded/.test(t), t.slice(0,400));
  ok('  and that retainers are excluded',    /Retainers are excluded/.test(t), t.slice(0,460));

  const rows=[...document.querySelectorAll('.drill .drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
  ok('every debtor is named with an amount', rows.length===2, rows.join(' || '));
  ok('  the rows sum to the header',
     rows.reduce((a,r)=>a+(money(r.match(/\$[\d,.]+(?!.*\$)/)?.[0]||'')||0),0)===3000, rows.join(' || '));
  ok('  the $8,000 prospect is not a debtor', !rows.some(r=>/Prospect/.test(r)), rows.join(' || '));

  /* Two ages, two words, never blurred. */
  const lateRow=rows.find(r=>/Late/.test(r))||'';
  const kiddRow=rows.find(r=>/Kidd/.test(r))||'';
  ok('an invoiced debt is PAST DUE, by its due date', /20 days past due/.test(lateRow), lateRow);
  ok('  and names the invoice',                       /INV-0031/.test(lateRow), lateRow);
  ok('  and it sorts first',                          /Late/.test(rows[0]), rows.join(' || '));
  ok('an un-invoiced sale is SOLD, not past due',
     /sold \d+ days ago/.test(kiddRow)&&!/past due/.test(kiddRow), kiddRow);
  ok('  and says nobody has billed it',               /not invoiced/.test(kiddRow), kiddRow);
}

console.log('\nthe month is not remembered — a remount is back on today');
{
  await pick(PREV);
  ok('the picker moved', picker().value===PREV, picker().value);
  /* NOTHING may have been written. A month persisted to settings is a month
     that comes back looking current when it is not. */
  ok('  and nothing was saved to settings',
     !(globalThis.__SETTINGS_WRITES__||[]).some(w=>JSON.stringify(w).includes(PREV)),
     JSON.stringify(globalThis.__SETTINGS_WRITES__||[]).slice(0,200));
  ok('  and nothing was written to storage',
     !Object.keys({...dom.window.localStorage}).some(k=>/month/i.test(k)),
     Object.keys({...dom.window.localStorage}).join(','));

  /* A fresh mount is a fresh login. */
  await act(async()=>{root.unmount();});
  root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(mod.default));});
  await settle(240);
  ok('a fresh mount is back on this month', picker()&&picker().value===THIS, picker()&&picker().value);
  ok('  showing this month\'s figure',      money(kv())===500, kv());
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
