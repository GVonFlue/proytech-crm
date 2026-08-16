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
globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];
globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();

globalThis.__EVENTS__=[
  {id:'e1',name:'Suite Night · June',venue:'Equity Bank Park',date:day(-60),seatsTotal:19,houseSeats:2,
   sponsorSeatEach:0,coverPrice:60,status:'done',costs:[],guests:[],milestones:[],
   slots:[{id:'s1',label:'Catering',price:'150',contactId:'r1',contactName:'Robin',paid:true},
          {id:'s2',label:'Giveaway',price:'250',contactId:'d1',contactName:'Dustin',paid:true}]},
  {id:'e2',name:'Suite Night · August',venue:'Intrust Bank Arena',date:day(-10),seatsTotal:19,houseSeats:2,
   sponsorSeatEach:0,coverPrice:60,status:'done',costs:[],guests:[],milestones:[],
   slots:[{id:'s3',label:'Catering',price:'150',contactId:'r1',contactName:'Robin',paid:false},
          {id:'s3b',label:'Giveaway',price:'200',contactId:'d1',contactName:'Dustin',paid:false}]},
  /* upcoming — Robin is on it, Dustin is not. Dustin is the lapsed one. */
  {id:'e3',name:'Suite Night · October',venue:'Equity Bank Park',date:day(30),seatsTotal:19,houseSeats:2,
   sponsorSeatEach:0,coverPrice:60,status:'planning',costs:[],guests:[],milestones:[],
   slots:[{id:'s4',label:'Catering',price:'150',contactId:'r1',contactName:'Robin',paid:false}]},
];
globalThis.__LEADS__=[
  {id:'r1',name:'Robin',company:'Adeas Printing',stage:'new',owner:'Garrett',isRelationship:true,
   createdAt:ago(200),activities:[],meetings:[],deals:[],dealValue:0},
  {id:'d1',name:'Dustin Kihle',company:'Kihle Roofing',stage:'new',owner:'Garrett',
   createdAt:ago(200),activities:[],meetings:[],deals:[],dealValue:0},
  /* a warm contact who has never sponsored */
  {id:'w1',name:'Ashley Thill',company:'Advisory',stage:'signed',owner:'Garrett',isClient:true,
   convertedAt:day(-100),createdAt:ago(200),activities:[],meetings:[],deals:[],dealValue:0},
  /* legacy: an old single-amount sponsor with no event */
  {id:'g1',name:'Old Sponsor',company:'Old Co',stage:'new',owner:'Garrett',pastSponsor:true,sponsorAmount:500,
   sponsorTier:'Gold',createdAt:ago(400),activities:[],meetings:[],deals:[],dealValue:0},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bi.mjs',out.outputFiles[0].text);
const mod=await import('./.bi.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,110));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=80)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};
const seg=l=>[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim().startsWith(l));
const names=()=>[...document.querySelectorAll('.sp-lrow .mrow-name')].map(e=>(e.textContent||'').trim());

console.log('\nthe tab exists and totals are derived from events');
await nav('Sponsors');
ok('page renders', /who to call next/i.test(document.body.textContent||''));
/* Robin 150+150+150 = 450, Dustin 250, Old Sponsor 500 legacy = 1200 */
const given=kpi('Given all time');
/* Robin 150+150+150=450 · Dustin 250+200=450 · Old Sponsor 500 legacy = 1400 */
ok('given all time is $1,400', given && /\$1,400/.test(given.v), given&&given.v);
ok('three sponsors counted', given && /3 sponsors/.test(given.d), given&&given.d);
const owed=kpi('Still owed');
/* Robin's Aug 150 unpaid + Oct 150 unpaid = 300 */
/* Robin Aug 150 + Robin Oct 150 + Dustin Aug 200 = 500 */
ok('unpaid slots roll up as owed', owed && /\$500/.test(owed.v), owed&&owed.v);
const rep=kpi('Came back');
ok('repeat sponsors counted', rep && /^2$/.test(rep.v), rep&&rep.v);

console.log('\nordered by what they have given');
const all=names();
ok('sorted by total given, biggest first',
   all[0]==='Old Sponsor'&&all.includes('Robin')&&all.includes('Dustin Kihle'), all.join(' | '));

console.log('\nlapsed is the outreach list');
await click(seg('Not on the next one')); await settle();
const lap=names();
ok('Dustin is lapsed', lap.includes('Dustin Kihle'), lap.join(' | '));
ok('Robin is NOT — he is on the October event', !lap.includes('Robin'), lap.join(' | '));

console.log('\nnever asked');
await click(seg('Never asked')); await settle();
const nv=names();
ok('a warm client who never sponsored is listed', nv.includes('Ashley Thill'), nv.join(' | '));
ok('existing sponsors are excluded', !nv.includes('Robin')&&!nv.includes('Dustin Kihle'), nv.join(' | '));

console.log('\nhistory inside the lead');
await nav('Leads');
/* Dustin, not Robin — Robin is flagged isRelationship so he lives on the
   Relationships page, not in the Leads table. */
const row=[...document.querySelectorAll('tbody tr')].find(e=>/Dustin/.test(e.textContent||''));
ok('Dustin is in the leads table', !!row,
   [...document.querySelectorAll('tbody tr')].map(r=>(r.textContent||'').slice(0,20)).join(' | '));
if(row) await click(row);
await settle(120);
/* the section is collapsed by default — its body only renders when open */
const sp=[...document.querySelectorAll('.msec-h')].find(e=>/Sponsorship/.test(e.textContent||''));
ok('a Sponsorship section exists on the lead', !!sp,
   [...document.querySelectorAll('.msec-t')].map(e=>e.textContent).join(' | '));
if(sp) await click(sp); await settle();
const hist=[...document.querySelectorAll('.sp-row')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
ok('both of Dustin\'s sponsorships are listed', hist.length===2, 'n='+hist.length+' :: '+hist.join(' | '));
ok('each names its event', hist.every(h=>/Suite Night/.test(h)), hist.join(' | '));
ok('newest first', /August/.test(hist[0]||''), hist[0]);
ok('the unpaid one is flagged', hist.filter(h=>/owed/.test(h)).length===1, hist.join(' | '));
ok('the lifetime total is shown', /\$450 across 2/.test(document.body.textContent||''),
   (document.querySelector('.sp-h')||{}).textContent);

console.log('\nlogging one by hand');
const seq=['Chamber Golf Tournament','300',day(-200)];
let i=0; dom.window.prompt=()=>seq[i++];
dom.window.confirm=()=>true;
const add=[...document.querySelectorAll('.deal-add-btn')].find(b=>/Log one by hand/.test(b.textContent||''));
ok('a manual option exists', !!add);
if(add){ await click(add); await settle();
  const w=globalThis.__WRITES__.filter(x=>x.id==='d1').at(-1);
  ok('it saved to the lead', w && (w.sponsorships||[]).length===1, JSON.stringify(w&&w.sponsorships));
  ok('with the amount', w && (w.sponsorships||[])[0].amount===300);
  ok('and it was logged as an activity', w && (w.activities||[]).some(a=>/Sponsorship logged/.test(a.text||'')));
  ok('manual entries are marked as such', /logged by hand/.test(document.body.textContent||''));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
