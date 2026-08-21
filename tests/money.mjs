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
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.__WRITES__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];globalThis.__USER_WRITES__=[];
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__INVOICES__=[];
/* AUDIT #25: this install is already past the one-off retainerStart clear,
   so a start date set here is one somebody chose. */
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5},retainerStartCleared:'2026-08-01T00:00:00.000Z'};
globalThis.fetch=async(u,o)=>{
  if(String(u).includes('google-status')) return {ok:true,json:async()=>({connected:true,email:'a@b.com'})};
  if(String(u).includes('/api/calendar-event')){ globalThis.__CAL__.push(o&&o.body?JSON.parse(o.body):null);
    return {ok:true,json:async()=>({ok:true,eventId:'ev1',htmlLink:'https://cal/x'})}; }
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};
const pad=n=>String(n).padStart(2,'0');
const today=(()=>{const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;})();
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
/* Two won leads: one PAID, one not. avgDeal must be the paid one's value,
   not half of it, and win rate must count both. */
globalThis.__LEADS__=[
  /* the reported case: monthly-only, no setup fee, $130/mo. Converted this
     month like the others, but no deposit is expected from them. */
  {id:'p4',name:'Monthly Only',company:'Monthly Only',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:today,closedAt:today,createdAt:ago(20),activities:[],meetings:[],deals:[],dealValue:0,
   /* AUDIT #26. A retainer counts in MRR when it is BILLING, and billing
      begins on a start date somebody set. The toggle alone is a price. */
   retainerActive:true,retainer:130,retainerStart:today,onboarding:{},onbSkip:['deposit_paid']},
  {id:'p1',name:'Paid Co',company:'Paid Co',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:today,closedAt:today,createdAt:ago(20),activities:[],meetings:[],deals:[],dealValue:4000,
   onboarding:{deposit_paid:{done:today,due:null}},payments:[{id:'x1',amount:4000,date:today,note:'wire'}]},
  {id:'p2',name:'Unpaid Co',company:'Unpaid Co',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:today,closedAt:today,createdAt:ago(20),activities:[],meetings:[],deals:[],dealValue:2000,
   onboarding:{}},
  /* the reported case: closed via "Close this deal", so dealValue is now 0 and
     the money lives in closedDeals. The row used to read $0. */
  {id:'p5',name:'Level Up',company:'Level Up',stage:'signed',owner:'Logan',isClient:true,
   convertedAt:today,closedAt:today,createdAt:ago(25),activities:[],meetings:[],deals:[],dealValue:0,
   onboarding:{deposit_paid:{done:today,due:null}},
   /* AUDIT #22. Closed TODAY, so the legacy fallback no longer counts it — a
      deposit tick is not a payment. The suite's subject is that a closedDeals
      row shows its real amount instead of $0, which is unchanged; the money
      just has to be logged like money now. */
   payments:[{id:'plu',amount:1299,date:today,note:'build'}],
   closedDeals:[{id:'cd1',label:'Build',amount:1299,closedAt:today}]},
  /* closed in a PREVIOUS month — must not appear under a this-month tile */
  {id:'p6',name:'July Co',company:'July Co',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:'2026-07-21',closedAt:'2026-07-21',createdAt:ago(60),activities:[],meetings:[],deals:[],dealValue:2499,
   onboarding:{deposit_paid:{done:'2026-07-21',due:null}}},
  {id:'p3',name:'Lost Co',company:'Lost Co',stage:'lost',owner:'Garrett',createdAt:ago(30),
   activities:[],meetings:[],deals:[],dealValue:1000},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.be.mjs',out.outputFiles[0].text);
const mod=await import('./.be.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=70)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};
const anCard=lab=>{const c=[...document.querySelectorAll('.an-card')]
  .find(e=>((e.querySelector('.an-l')||{}).textContent||'').includes(lab));
  return c?{v:((c.querySelector('.an-v')||{}).textContent||'').trim(),d:((c.querySelector('.an-d')||{}).textContent||'').trim()}:null;};

/* ---- expected values, worked by hand from the fixture above ----
   THIS MONTH, cash-confirmed only:
     Paid Co        dealValue 4000, deposit ticked        -> 4000
     Level Up       dealValue 0, closedDeals 1299 today   -> 1299
     Monthly Only   dealValue 0, deposit N/A              ->    0
     Unpaid Co      dealValue 2000, no deposit            ->    0  (awaiting)
     July Co        closed 2026-07-21                     ->    0  (not this month)
                                                    month = 5299
   ALL TIME adds July Co's 2499                            -> 7798
   AVG DEAL (corrected by AUDIT #4). wonValue is 7798 and it is made of THREE
     deals: Paid Co's 4000 setup, July Co's 2499 setup, and Level Up's 1299
     ARCHIVED closed deal. It used to be divided by wonValued — a count of
     LEADS with a live setup value, which is 2 — so it read 3899 over a total
     that included a deal the divisor never counted. 7798/3 = 2599.33 -> $2,599.
     Monthly Only still contributes nothing to either side: a retainer-only
     client is not a data point about deal SIZE, and that part was always right.
   WIN RATE: 4 won (Paid, Unpaid, Monthly Only, Level Up, July Co = 5) vs 1 lost.
*/
console.log('\navgDeal no longer punished by an unpaid win');
await nav('Dashboard');
const ad=anCard('Avg Deal Size');
/* $2,599, not $3,899 — see the arithmetic above. The old number divided a
   three-deal total by two. */
ok('avg deal divides by the deals in its own total', ad && /\$2,599/.test(ad.v), ad&&ad.v);
ok('and says how many DEALS that was, not how many leads', ad && /across 3 deals/.test(ad.d), ad&&ad.d);
ok('the retainer-only clients are named, not silently dropped',
   ad && /2 retainer-only/.test(ad.d), ad&&ad.d);

console.log('\nwin rate still counts the sale');
await nav('Dashboard');
const wr=anCard('Win Rate');
/* 3 won (paid, unpaid, monthly-only), 1 lost => 75%. Gating on cash would
   wrongly say 33%. Winning a deal and collecting for it are different events. */
ok('win rate counts every win, paid or not', wr && /83%/.test(wr.v), wr&&wr.v);

console.log('\nrevenue still waits for the money');
const rev=kpi('Revenue Collected');
ok('only cash-confirmed money counts', rev && /\$5,299/.test(rev.v), rev&&rev.v);
/* STILL OWED, worked by hand:
     Paid Co       4000 contracted, deposit ticked, no payment rows -> settled 0
     Unpaid Co     2000 contracted, no deposit                      -> owes 2000
     Monthly Only     0 contracted                                  ->        0
     Level Up      1299 closedDeals, deposit ticked, no rows        -> settled 0
     July Co       2499 contracted, deposit ticked, no rows         -> settled 0
     Lost Co       1000 contracted, LOST — a lost lead owes nothing ->        0
                                                             total  =     2000 */
ok('what is still owed is named on the tile', rev && /still owed/.test(rev.d), rev&&rev.d);

console.log('\nrevenue by client agrees with the dashboard');
const rows=[...document.querySelectorAll('.rbc-row')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
const unpaidRow=rows.find(r=>/Unpaid Co/.test(r));
/* AUDIT #3: this pill now comes from owedBy(), the same function the Money
   page and the client card use, so the word is "outstanding" everywhere. */
ok('the unpaid client is flagged, not counted as revenue',
   unpaidRow && /\$2,000 outstanding/.test(unpaidRow), unpaidRow);
ok('and shows $0 lifetime', unpaidRow && /\$0/.test(unpaidRow), unpaidRow);
const paidRow=rows.find(r=>/Paid Co/.test(r));
ok('the paid client shows its full value', paidRow && /\$4,000/.test(paidRow), paidRow);

console.log('\nThe ledger is a real P&L now');
/* The Books merged into Money — the ledger is the "This month" tab there. */
await nav('Money');
const body=document.body.textContent||'';
ok('the client payment shows as income', /client payment/i.test(body), body.slice(0,200));
ok('with the client name on it', /Paid Co/.test(body));
ok('and it counts toward money in', /\+\$4,000/.test(body.replace(/\s/g,'')),
   (body.match(/[+−]\$[\d,]+/g)||[]).join(' '));

console.log('\nmobile: the worst offenders are capped');
const css=[...document.querySelectorAll('style')].map(e=>e.textContent||'').join('');
ok('invoice modal can no longer exceed the screen', /\.inv-modal\{width:1080px;max-width:96vw/.test(css));
ok('login card is capped', /\.gate-card\{[^}]*max-width:calc\(100vw/.test(css));
ok('column menu is capped', /\.colmenu\{[^}]*max-width:calc\(100vw/.test(css));
ok('form grid drops to one column on a phone', /\.fgrid\{grid-template-columns:1fr\}/.test(css));
ok('fact strip is no longer wider than the phone', /\.m-facts\{max-width:100%\}/.test(css));

console.log('\nmeeting location reaches Google');
await nav('Leads');
const r=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Paid Co/.test(e.textContent||'')).pop();
if(r) await click(r); await settle();
const jump=[...document.querySelectorAll('button')].find(b=>/^Meetings/.test((b.textContent||'').trim()));
if(jump) await click(jump); await settle();
/* the Meetings section collapses by default — open it so the scheduler mounts */
if(!document.querySelector('.mtg-form')){
  const heads=[...document.querySelectorAll('.m-left *')].filter(e=>/^MEETINGS/i.test((e.textContent||'').trim()));
  for(const h of heads){ await click(h); await settle(40); if(document.querySelector('.mtg-form')) break; }
}
const locIn=[...document.querySelectorAll('.mtg-form input')].find(i=>/Address or place/.test(i.placeholder||''));
ok('a location field is on the scheduler', !!locIn,
   'scheduler mounted: '+!!document.querySelector('.mtg-form')+' inputs: '+[...document.querySelectorAll('.mtg-form input')].map(i=>i.placeholder||i.type).join(' | '));
if(locIn){
  const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{set.call(locIn,'Reverie Coffee, 2库 Douglas');locIn.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  const dt=document.querySelector('.mtg-form input[type=date]');
  await act(async()=>{set.call(dt,today);dt.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  const go=[...document.querySelectorAll('.mtg-form button')].find(b=>/Schedule/.test(b.textContent));
  await click(go); await settle(90);
  const sent=globalThis.__CAL__.filter(Boolean).at(-1);
  ok('location was sent to the calendar API', sent && /Reverie Coffee/.test(sent.location||''),
     JSON.stringify(sent&&{loc:sent.location}));
  const w=globalThis.__WRITES__.at(-1);
  ok('and stored on the meeting', w && (w.meetings||[]).some(m=>/Reverie/.test(m.location||'')),
     JSON.stringify((w&&w.meetings||[]).map(m=>m.location)));
}

console.log('\nmonthly-only clients');
await nav('Dashboard');
const onb=kpi('Clients Onboarded');
/* 3 converted this month: Paid (deposit in), Unpaid (deposit due), Monthly Only
   (none expected). The tile must not claim a deposit it hasn't got. */
ok('onboarded counts every client converted this month', onb && /^4$/.test(onb.v), onb&&onb.v);
ok('deposits are counted only among clients one is expected from',
   onb && /2 of 3 deposits in/.test(onb.d), onb&&onb.d);
ok('and the monthly-only one is named separately', onb && /1 monthly-only/.test(onb.d), onb&&onb.d);

await click([...document.querySelectorAll('.kpi')].find(e=>/Clients Onboarded/.test(e.textContent||'')));
await settle();
const dr=(document.body.textContent||'');
ok('the drilldown says monthly only, not "no deposit yet"',
   /Monthly Only[\s\S]{0,80}monthly only/i.test(dr.replace(/\s+/g,' ')),
   (dr.match(/Monthly Only[^$]{0,70}/)||[''])[0]);

console.log('\nnothing is held back from a monthly-only client');
const rev2=kpi('Revenue Collected');
ok('the monthly-only client adds nothing to revenue', rev2 && /\$5,299/.test(rev2.v), rev2&&rev2.v);
ok('the monthly-only client owes nothing', rev2 && /\$2,000 still owed/.test(rev2.d), rev2&&rev2.d);
ok('and a lost lead is not treated as a debtor', rev2 && !/\$3,000/.test(rev2.d), rev2&&rev2.d);
/* Renamed with the behaviour: "the moment it is on" was the bug — a rate set
   on a client you have not started billing is not revenue. */
ok('a BILLING retainer counts in MRR',
   (kpi('MRR')||{v:''}).v && /\$130|\$130/.test((kpi('MRR')||{}).v||''), (kpi('MRR')||{}).v);

console.log('\nthe Deals Closed panel matches its tile');
await nav('Dashboard');
const dcTile=kpi('Deals Closed');
await click([...document.querySelectorAll('.kpi')].find(e=>/Deals Closed/.test(e.textContent||'')));
await settle();
const drillRows=()=>[...document.querySelectorAll('.drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
const sub=(document.querySelector('.drill-sub, .d-sub')||{}).textContent
  ||((document.body.textContent||'').match(/\$[\d,]+ (this month|all time)/)||[''])[0];
ok('the panel defaults to this month', /this month/.test(sub), sub);
const dRows=drillRows();
ok('a deal closed via closedDeals shows its real amount, not $0',
   dRows.some(r=>/Level Up/.test(r)&&/\$1,299/.test(r)), dRows.join(' || '));
ok('a deal closed in a previous month is not listed',
   !dRows.some(r=>/July Co/.test(r)), dRows.join(' || '));
ok('the header total equals the rows shown', /\$5,299 this month/.test(sub), sub);
/* AUDIT #8: the subtitle reports what CLOSED, which is the question the tile
   asks. It briefly said "collected from clients" (AUDIT #1) — still the wrong
   question for this tile, just a more honestly labelled one. In this fixture
   the two happen to be the same $5,299, which is exactly why the mismatch
   survived so long: Paid Co's 4,000 and Level Up's 1,299 both closed AND were
   collected in the same month. A deal closed in one month and paid in the next
   is what pulls them apart. */
ok('and that is exactly what the tile says', dcTile && /\$5,299 closed/.test(dcTile.d), dcTile&&dcTile.d);
/* Count and list must agree — the drilldown header now carries both numbers. */
ok('the drilldown header states the close count too', /\d+ close/.test(document.body.textContent||''),
   (document.body.textContent||'').match(/Deals closed.{0,60}/)?.[0]);

console.log('\nAll time widens it');
const allBtn=[...document.querySelectorAll('.mtab-time button')].find(b=>/All time/.test(b.textContent||''));
ok('an All time toggle is offered', !!allBtn);
if(allBtn){ await click(allBtn); await settle();
  const r2=drillRows();
  ok('the previous month now appears', r2.some(r=>/July Co/.test(r)&&/\$2,499/.test(r)), r2.join(' || '));
  const sub2=((document.body.textContent||'').match(/\$[\d,]+ all time/)||[''])[0];
  ok('and the total grows to match', /\$7,798 all time/.test(sub2), sub2);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
