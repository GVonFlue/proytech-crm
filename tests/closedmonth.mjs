/* DEALS CLOSED: PICK A MONTH — and behave exactly like Revenue Collected
   ============================================================================

   The ask was "same shape as Revenue Collected so the two tiles behave
   identically rather than each having their own idea of what a month picker
   is". That is a claim about SAMENESS, so most of this file asserts sameness
   directly rather than checking the new tile in isolation: same default, same
   wording, same option list, same non-persistence, same component.

   The one place they deliberately differ — each tile keeps its OWN month — is
   asserted too, because an undocumented difference and a bug look identical
   from the outside.

   The arithmetic lives in tests/closesmonth-unit coverage inside this file's
   first block, over the pure function, for the same reason revmonth.mjs does:
   a DOM test tells you a string appeared, not that a sum is right.

   Every date here is derived from the clock or from a named distance chosen to
   clear the worst calendar — see tests/clockwarp.mjs.                        */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

/* ---------- the pure function first ---------- */
const lib = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', platform:'neutral', external:['lucide-react','react'], define:{'import.meta.env':'{}'} });
fs.writeFileSync('tests/.bcm.mjs', lib.outputFiles[0].text);
const { closesForMonth, moneyMonths } = await import('./.bcm.mjs?v=' + Date.now());

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,260):''));}};

const pad=n=>String(n).padStart(2,'0');
const now=new Date();
const THIS=`${now.getFullYear()}-${pad(now.getMonth()+1)}`;
const prevD=new Date(now.getFullYear(),now.getMonth()-1,15);
const PREV=`${prevD.getFullYear()}-${pad(prevD.getMonth()+1)}`;
const PREV_NAME=new Date(prevD.getFullYear(),prevD.getMonth(),1).toLocaleString('en-US',{month:'long',year:'numeric'});
const PREV_SHORT=new Date(prevD.getFullYear(),prevD.getMonth(),1).toLocaleString('en-US',{month:'short',year:'numeric'});
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
/* 120 days clears the deepest "last month" reaches back (day-of-month plus the
   length of last month, at most 62), so this is always older than PREV. */
const LONG_AGO=120, dAgo=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);

const STAGES=[{key:'new',label:'New Lead',open:true},{key:'signed',label:'Signed',won:true},{key:'lost',label:'Lost',lost:true}];

console.log('\nthe closes for a month come from one function taking the month');
{
  /* SIGNED_PREV — won last month, deposit ticked, one close worth $2,000. */
  const signedPrev={id:'sp',stage:'signed',isClient:true,closedAt:`${PREV}-08`,convertedAt:`${PREV}-08`,
    dealValue:2000,deals:[],closedDeals:[],onboarding:{deposit_paid:{done:`${PREV}-08`,due:null}},payments:[]};
  /* SIGNED_THIS — won this month, $900. */
  const signedThis={id:'st',stage:'signed',isClient:true,closedAt:`${THIS}-02`,convertedAt:`${THIS}-02`,
    dealValue:900,deals:[],closedDeals:[],onbSkip:['deposit_paid'],onboarding:{},payments:[]};
  /* BOTH — AUDIT #8's case: reached a won stage last month AND has a deal
     archived into closedDeals in the same month. One lead closing is ONE close,
     however its money is recorded. */
  const both={id:'bo',stage:'signed',isClient:true,closedAt:`${PREV}-09`,convertedAt:`${PREV}-09`,
    dealValue:5000,deals:[],onboarding:{deposit_paid:{done:`${PREV}-09`,due:null}},payments:[],
    closedDeals:[{id:'cd',label:'Build',amount:1500,closedAt:`${PREV}-09`}]};
  /* FREE — a close worth $0 last month. Still a close; dropping it is what made
     the tile read one more than its own list. */
  const free={id:'fr',stage:'signed',isClient:true,closedAt:`${PREV}-11`,convertedAt:`${PREV}-11`,
    dealValue:0,deals:[],closedDeals:[],onbSkip:['deposit_paid'],onboarding:{},payments:[]};
  /* PENDING — won last month, cash NOT confirmed. Not a close yet; surfaced
     separately rather than dropped. */
  const pending={id:'pe',stage:'signed',isClient:true,closedAt:`${PREV}-12`,convertedAt:`${PREV}-12`,
    dealValue:4000,deals:[],closedDeals:[],onboarding:{},payments:[]};
  /* OPEN — never closed anything. */
  const open={id:'op',stage:'new',dealValue:7000,deals:[],closedDeals:[],payments:[]};
  const L=[signedPrev,signedThis,both,free,pending,open];

  const p=closesForMonth(L,STAGES,PREV);
  const t=closesForMonth(L,STAGES,THIS);

  ok('last month counts its own closes',   p.closedMonth===3, String(p.closedMonth));
  ok('  and only its own value',           p.closedMonthValue===3500, String(p.closedMonthValue));
  ok('this month is a different answer',   t.closedMonth===1&&t.closedMonthValue===900, `${t.closedMonth}/${t.closedMonthValue}`);
  ok('a month with nothing in it is 0',    closesForMonth(L,STAGES,'2019-01').closedMonth===0);
  ok('null leads are safe',                closesForMonth(null,STAGES,PREV).closedMonth===0);

  /* AUDIT #8, both halves, on the pure function this time. */
  const byId=Object.fromEntries(p.closedRows.map(r=>[r.id,r]));
  ok('a lead that won AND archived a deal in one month counts ONCE',
     byId.bo&&byId.bo.closes===1, JSON.stringify(byId.bo));
  ok('  and at the archived value, not both',
     byId.bo&&byId.bo.value===1500, JSON.stringify(byId.bo));
  ok('a close worth $0 is still a close',  !!byId.fr&&byId.fr.closes===1&&byId.fr.value===0, JSON.stringify(byId.fr));
  ok('an unconfirmed win is NOT a close',  !byId.pe, JSON.stringify(byId.pe));
  ok('  it is surfaced as awaiting cash',  p.awaitingCash===1&&p.awaitingValue===4000, `${p.awaitingCash}/${p.awaitingValue}`);
  ok('an open lead is neither',            !byId.op);

  /* THE INVARIANT: rows and totals are the same array, so tile and panel cannot
     give two answers (ENGINEERING §2). */
  ok('the rows sum to the count',  p.closedRows.reduce((a,r)=>a+r.closes,0)===p.closedMonth);
  ok('  and to the value',         p.closedRows.reduce((a,r)=>a+r.value,0)===p.closedMonthValue);
}

console.log('\nboth pickers are offered the same months');
{
  const L=[{id:'a',stage:'signed',closedAt:'2026-03-04',payments:[],closedDeals:[]},
           {id:'b',stage:'signed',closedAt:'',payments:[{id:'p',amount:5,date:'2026-04-09'}],closedDeals:[]},
           {id:'c',stage:'signed',closedAt:'',payments:[],closedDeals:[{id:'d',amount:9,closedAt:'2026-05-06'}]}];
  const T=[{id:'t',date:'2026-06-02',type:'income',amount:11}];
  const opts=moneyMonths(L,T,'2026-09',[]);
  /* A month whose only event was a SIGNATURE has to be offered, or the Deals
     Closed picker cannot reach the month it is about. This is why the option
     list moved into lib/lead.js rather than staying the revenue tile's. */
  ok('a close-only month is offered',   opts.includes('2026-03'), opts.join(','));
  ok('a payment month is offered',      opts.includes('2026-04'), opts.join(','));
  ok('an archived-deal month is too',   opts.includes('2026-05'), opts.join(','));
  ok('a hand-entered income month too', opts.includes('2026-06'), opts.join(','));
  ok('this month is always offered',    opts.includes('2026-09'), opts.join(','));
  ok('the future is never offered',     !opts.some(k=>k>'2026-09'), opts.join(','));
  ok('newest first',                    opts[0]==='2026-09', opts.join(','));
  ok('no duplicates',                   opts.length===new Set(opts).size, opts.join(','));
}

/* ================================ the screen ================================ */

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
/* BOTH goals set: without a closes goal the tile falls back to an all-time
   count and deliberately shows no picker (there is no month for it to move). */
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

/* KIDD — signed LAST month for $3,000, paid $1,000 then and $500 this month.
   It is one close in PREV and part of revenue in BOTH months, which is what
   makes the two tiles' months genuinely independent rather than decorative. */
const KIDD={id:'k1',name:'Agent Kidd',company:'Kidd Realty',stage:'signed',owner:'Garrett',isClient:true,
  convertedAt:`${PREV}-04`,closedAt:`${PREV}-04`,createdAt:ago(120),activities:[],meetings:[],
  dealValue:3000,deals:[{id:'dk',setup:3000}],closedDeals:[],
  onboarding:{deposit_paid:{done:`${PREV}-04`,due:null}},
  payments:[{id:'pk1',amount:1000,date:`${PREV}-04`},{id:'pk2',amount:500,date:`${THIS}-02`}]};
/* FRESH — signed THIS month for $1,200, paid in full. */
const FRESH={id:'k2',name:'Fresh Signing',company:'Fresh Co',stage:'signed',owner:'Garrett',isClient:true,
  convertedAt:`${THIS}-03`,closedAt:`${THIS}-03`,createdAt:ago(40),activities:[],meetings:[],
  dealValue:1200,deals:[],closedDeals:[],onbSkip:['deposit_paid'],onboarding:{},
  payments:[{id:'pf',amount:1200,date:`${THIS}-03`}]};
/* OLDWIN — signed LONG_AGO, so it is in neither month and keeps the all-time
   figure genuinely different from either. */
const OLDWIN={id:'k3',name:'Ancient Co',company:'Ancient',stage:'signed',owner:'Garrett',isClient:true,
  convertedAt:dAgo(LONG_AGO),closedAt:dAgo(LONG_AGO),createdAt:ago(LONG_AGO+30),activities:[],meetings:[],
  dealValue:600,deals:[],closedDeals:[],onbSkip:['deposit_paid'],onboarding:{},
  payments:[{id:'po',amount:600,date:dAgo(LONG_AGO)}]};

globalThis.__LEADS__=[KIDD,FRESH,OLDWIN];
globalThis.__TXNS__=[];
globalThis.__INVOICES__=[];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bcd.mjs',out.outputFiles[0].text);
const mod=await import('./.bcd.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
let root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,200));});

const settle=async(ms=130)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const tile=lab=>[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim()===lab);
const kv=lab=>(((tile(lab)||{querySelector:()=>null}).querySelector?.('.kv'))||{}).textContent||'';
const kd=lab=>((((tile(lab)||{querySelector:()=>null}).querySelector?.('.kd'))||{}).textContent||'').replace(/ /g,' ');
const pickerOf=lab=>(tile(lab)||{querySelector:()=>null}).querySelector?.('.kpi-month');
const setSel=async(sel,v)=>{await act(async()=>{
  Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(sel,v);
  sel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));}); await settle(); };
const panelText=()=>((document.querySelector('.drill')||{}).textContent||'').replace(/ /g,' ').replace(/\s+/g,' ');
const REV='Revenue Collected', CLOSED='Deals Closed';

/* ---- expected, by hand ----
   Deals closed  PREV: Kidd                  = 1 close, $3,000
                 THIS: Fresh                 = 1 close, $1,200
   Revenue       PREV: Kidd's $1,000         = $1,000
                 THIS: Kidd $500 + Fresh $1,200 = $1,700                      */

console.log('\nthe two tiles start the same way');
{
  ok('Deals Closed has a picker',      !!pickerOf(CLOSED), (tile(CLOSED)||{}).textContent);
  ok('Revenue Collected has one too',  !!pickerOf(REV));
  ok('both start on this month',       pickerOf(CLOSED).value===THIS&&pickerOf(REV).value===THIS,
     `${pickerOf(CLOSED).value} / ${pickerOf(REV).value}`);
  ok('both call it "This month"',
     /This month/.test(pickerOf(CLOSED).textContent)&&/This month/.test(pickerOf(REV).textContent));
  /* SAMENESS, asserted rather than assumed: the option lists must be identical,
     because two dropdowns offering different months is the same
     two-screens-two-answers bug in a smaller box. */
  const a=[...pickerOf(CLOSED).options].map(o=>o.value+'='+o.text).join('|');
  const b=[...pickerOf(REV).options].map(o=>o.value+'='+o.text).join('|');
  ok('and both offer exactly the same months, worded the same', a===b, a+' VS '+b);
  ok('  including the month Kidd signed in', a.includes(PREV+'='), a);

  ok('neither label swallowed its picker',
     ((tile(CLOSED).querySelector('.kl')||{}).textContent||'').trim()===CLOSED,
     (tile(CLOSED).querySelector('.kl')||{}).textContent);

  ok('this month closed 1',            /^1$/.test(kv(CLOSED).trim()), kv(CLOSED));
  ok('  worth $1,200',                 /\$1,200 closed/.test(kd(CLOSED)), kd(CLOSED));
  ok('  and says "this month"',        /this month/.test(kd(CLOSED)), kd(CLOSED));
}

console.log('\npicking a month moves the tile, its goal bar and its panel');
{
  await setSel(pickerOf(CLOSED),PREV);
  ok('the count is last month\'s',     /^1$/.test(kv(CLOSED).trim()), kv(CLOSED));
  ok('  the value is last month\'s',   /\$3,000 closed/.test(kd(CLOSED)), kd(CLOSED));
  ok('  and the month is NAMED',       kd(CLOSED).includes(PREV_NAME), kd(CLOSED));
  ok('  "this month" is gone',         !/this month/.test(kd(CLOSED)), kd(CLOSED));

  /* A finished month is 100% through it — the same rule the revenue tile got. */
  const goal=(tile(CLOSED).querySelector('.kgt')||{}).textContent||'';
  ok('a finished month is judged as finished', /behind pace/.test(goal)&&!/on pace/.test(goal), goal);

  await click(tile(CLOSED)); await settle();
  const t=panelText();
  ok('the panel opened',               /Deals closed/.test(t), t.slice(0,80));
  ok('  and names the picked month',   t.includes(PREV_NAME), t.slice(0,140));
  ok('  not "this month"',             !/this month/.test(t), t.slice(0,140));
  ok('  the scope button says the month too', /Deals closed[\s\S]*/.test(t)
     && [...document.querySelectorAll('.drill .mtab-time button')].some(b=>b.textContent.trim()===PREV_SHORT),
     [...document.querySelectorAll('.drill .mtab-time button')].map(b=>b.textContent).join(' | '));

  const rows=[...document.querySelectorAll('.drill .drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
  ok('  it lists the lead that closed then', rows.some(r=>/Kidd/.test(r)&&/\$3,000/.test(r)), rows.join(' || '));
  ok('  and not the one that closed since',  !rows.some(r=>/Fresh/.test(r)), rows.join(' || '));
  ok('  and not the ancient one',            !rows.some(r=>/Ancient/.test(r)), rows.join(' || '));
  ok('  the rows sum to the header',
     rows.reduce((a,r)=>{const m=r.match(/\$([\d,]+)(?!.*\$)/);return a+(m?Number(m[1].replace(/,/g,'')):0);},0)===3000,
     rows.join(' || '));
  /* A COUNT must never be formatted as MONEY. The month rows used to carry the
     number of closes in a field called `deals` that the all-time rows filled
     with dollars, and one usd() ran over both — so a lead that closed once read
     "$3,000 setup + $1 closed deals". The $1 was the number 1. */
  ok('  no count is rendered as a dollar figure', !rows.some(r=>/\$1 closed deals/.test(r)), rows.join(' || '));
  ok('  and a single close is not announced as a count',
     !rows.some(r=>/1 closes/.test(r)), rows.join(' || '));

  /* ALL TIME is still a different question and still available. */
  const allBtn=[...document.querySelectorAll('.drill .mtab-time button')].find(b=>/All time/.test(b.textContent));
  await click(allBtn); await settle();
  const at=panelText();
  ok('all time is still reachable',    /all time/.test(at), at.slice(0,140));
  ok('  and includes every won lead',  /Kidd/.test(at)&&/Fresh/.test(at)&&/Ancient/.test(at), at.slice(0,300));
  await click(tile(CLOSED)); await settle();
}

console.log('\neach tile keeps its OWN month — the documented difference');
{
  ok('Deals Closed is still on last month', pickerOf(CLOSED).value===PREV, pickerOf(CLOSED).value);
  ok('Revenue Collected did NOT follow it', pickerOf(REV).value===THIS, pickerOf(REV).value);
  ok('  so revenue still reads this month', /\$1,700/.test(kv(REV)), kv(REV));
  /* The cost of independence is a row that can show two months at once, so the
     mitigation is asserted: the tile that has moved says which month it is on,
     and the one that has not says nothing. */
  ok('the moved tile names its month',      kd(CLOSED).includes(PREV_NAME), kd(CLOSED));
  ok('the unmoved one does not',            !kd(REV).includes(PREV_NAME), kd(REV));

  /* And moving revenue does not drag closes back. */
  await setSel(pickerOf(REV),PREV);
  ok('moving revenue leaves closes alone',  pickerOf(CLOSED).value===PREV&&pickerOf(REV).value===PREV,
     `${pickerOf(CLOSED).value} / ${pickerOf(REV).value}`);
  ok('  and revenue is last month\'s now',  /\$1,000/.test(kv(REV)), kv(REV));
}

console.log('\nneither month is remembered — a remount is back on today');
{
  ok('nothing was saved to settings',
     !(globalThis.__SETTINGS_WRITES__||[]).some(w=>JSON.stringify(w).includes(PREV)),
     JSON.stringify(globalThis.__SETTINGS_WRITES__||[]).slice(0,200));
  ok('  and nothing was written to storage',
     !Object.keys({...dom.window.localStorage}).some(k=>/month|closed|revenue/i.test(k)),
     Object.keys({...dom.window.localStorage}).join(','));

  await act(async()=>{root.unmount();});
  root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(mod.default));});
  await settle(260);
  ok('Deals Closed is back on this month',      pickerOf(CLOSED)&&pickerOf(CLOSED).value===THIS, pickerOf(CLOSED)&&pickerOf(CLOSED).value);
  ok('Revenue Collected is back on this month', pickerOf(REV)&&pickerOf(REV).value===THIS, pickerOf(REV)&&pickerOf(REV).value);
  ok('  showing this month\'s closes',          /^1$/.test(kv(CLOSED).trim())&&/\$1,200 closed/.test(kd(CLOSED)), kd(CLOSED));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
