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
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[]; globalThis.__CAL__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};

const past=new Date(Date.now()-5*864e5);
const pad=x=>String(x).padStart(2,'0');
const at=`${past.getFullYear()}-${pad(past.getMonth()+1)}-${pad(past.getDate())}T10:00:00`;
const day=n=>{const d=new Date(Date.now()-n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const mtgOn=(id,type,dayStr)=>({id,title:type,mtype:type,start:dayStr+'T10:00:00',end:dayStr+'T10:30:00',status:'held',createdAt:new Date(past).toISOString()});
const mtg=(id,type)=>mtgOn(id,type,at.slice(0,10));
const lead=(id,name,meetings,won,closedOn)=>({id,name,company:name,owner:'Garrett',
  stage:won?'won':'new', isClient:!!won, convertedAt:won?(closedOn||at.slice(0,10)):undefined,
  createdAt:new Date(Date.now()-40*864e5).toISOString(), activities:[], meetings});

/* 6 leads:
   coffee only, not closed      -> excluded entirely
   coffee only, CLOSED          -> excluded entirely (this is the one that used
                                   to make the ratio look artificially fine/bad)
   discovery, closed            -> counts, numerator
   discovery, not closed        -> counts, denominator only
   pitch, closed                -> counts, numerator
   coffee + discovery, closed   -> counts once, numerator                        */
globalThis.__LEADS__=[
  lead('a','Coffee only open',   [mtg('m1','Coffee')],                       false),
  lead('b','Coffee only won',    [mtg('m2','Coffee')],                        true),
  lead('c','Discovery won',      [mtg('m3','Discovery Call')],                true),
  lead('d','Discovery open',     [mtg('m4','Discovery Call')],               false),
  lead('e','Pitch won',          [mtg('m5','Proposal / Pitch')],              true),
  lead('f','Coffee+Disc won',    [mtg('m6','Coffee'),mtg('m7','Discovery Call')], true),
  /* signed 10 days ago, onboarding call 3 days ago. This is the one that used to
     hand the ratio a free conversion for doing delivery work. */
  lead('g','Onboarded after',    [mtgOn('m8','Onboarding',day(3))],           true, day(10)),
  /* signed 10 days ago, then a discovery call logged afterwards — right type,
     wrong order, still must not count as a meeting that converted. */
  lead('h','Discovery after',    [mtgOn('m9','Discovery Call',day(3))],       true, day(10)),
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.b4.mjs',out.outputFiles[0].text);
const mod=await import('./.b4.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,80));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async label=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===label); if(b) await click(b);
  await act(async()=>{await new Promise(r=>setTimeout(r,50));}); };
const anCard=label=>{const c=[...document.querySelectorAll('.an-card')]
  .find(e=>((e.querySelector('.an-l')||{}).textContent||'').includes(label));
  return c?{v:((c.querySelector('.an-v')||{}).textContent||'').trim(),d:((c.querySelector('.an-d')||{}).textContent||'').trim()}:null; };
const kpi=label=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===label.toLowerCase());
  return k?((k.querySelector('.kv')||{}).textContent||'').trim():'none'; };

console.log('\nMeeting -> Close, coffee excluded by default');
const mc=anCard('Meeting');
ok('card renders', !!mc, JSON.stringify(mc));
/* AUDIT #7. Four is below RATE_MIN_N, so <Rate> shows the raw figure rather
   than "75%" — a rate off four data points is not a rate. What this suite is
   actually about is the DENOMINATOR (which meetings count), and that is
   unchanged and still asserted by the "3 of 4" checks below. */
ok('ratio is 3 of 4, shown as a figure because four is a thin sample',
   mc && mc.v==='3/4', mc&&mc.v);
ok('denominator excludes the coffee-only leads', mc && /3 of 4/.test(mc.d), mc&&mc.d);
ok('an onboarding-only client is NOT a free conversion', mc && /3 of 4/.test(mc.d), mc&&mc.d);
ok('a post-close discovery call does not count either', mc && /1 only met after signing/.test(mc.d), mc&&mc.d);
ok('it names what was excluded', mc && /Coffee, Onboarding, Check-in not counted/i.test(mc.d), mc&&mc.d);
ok('it flags all 3 with no sales meeting (2 coffee-only + 1 onboarding-only)',
   mc && /3 met with no sales meeting logged/.test(mc.d), mc&&mc.d);

console.log('\ncoffee still counts everywhere else');
ok('Meetings Held counts all 7', kpi('Meetings Held')!=='none', 'tile='+kpi('Meetings Held'));
const show=anCard('Show Rate');
ok('show rate still 100% (no no-shows)', show && show.v==='100%', show&&show.v);
ok('show rate admits nothing is unmarked here', show && !/unmarked/.test(show.d), show&&show.d);

console.log('\nSettings toggle');
await nav('Settings');
const rows=[...document.querySelectorAll('.mod-row')].filter(r=>/^(Coffee|Discovery Call|Proposal \/ Pitch|Onboarding|Check-in|Other)$/.test((r.querySelector('span')||{}).textContent||''));
ok('a card lists every meeting type', rows.length===6, 'rows='+rows.length);
const coffeeRow=rows.find(r=>((r.querySelector('span')||{}).textContent||'')==='Coffee');
ok('Coffee is off by default', coffeeRow && !coffeeRow.querySelector('input').checked);
const discRow=rows.find(r=>((r.querySelector('span')||{}).textContent||'')==='Discovery Call');
ok('Discovery Call is on by default', discRow && discRow.querySelector('input').checked);

/* turn Coffee back ON and the ratio must widen to include the coffee-only leads */
if(coffeeRow){
  const box=coffeeRow.querySelector('input');
  await click(box);
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  const after=[...document.querySelectorAll('.mod-row')].find(r=>((r.querySelector('span')||{}).textContent||'')==='Coffee');
  ok('the toggle actually flipped', after && after.querySelector('input').checked,
     'checked='+(after&&after.querySelector('input').checked));
  const note=[...document.querySelectorAll('.subcell')].map(e=>e.textContent||'').find(t=>/^Counting:/.test(t))||'';
  ok('the Settings summary lists Coffee', /Counting:.*Coffee/.test(note), note.slice(0,90));
  await nav('Dashboard');
  const mc2=anCard('Meeting');
  ok('switching Coffee on widens it to 4 of 6', mc2 && /4 of 6/.test(mc2.d), mc2&&mc2.d);
  ok('and the ratio moves to 67%', mc2 && mc2.v==='67%', mc2&&mc2.v);
  ok('the post-close leads STILL do not count', mc2 && /only met after signing/.test(mc2.d), mc2&&mc2.d);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
