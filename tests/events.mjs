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
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
globalThis.__LEADS__=[
  {id:'c1',name:'Dustin Kihle',company:'Kihle Roofing',email:'dustin@kihleroofing.com',stage:'new',owner:'Garrett',
   createdAt:new Date(Date.now()-864e5).toISOString(),activities:[],meetings:[],deals:[],dealValue:0},
  {id:'c2',name:'Robin',company:'Adeas Printing',email:'robin@adeas.com',stage:'new',owner:'Garrett',isRelationship:true,
   createdAt:new Date(Date.now()-864e5).toISOString(),activities:[],meetings:[],deals:[],dealValue:0},
  {id:'c3',name:'Jay Simpson',company:'',stage:'new',owner:'Garrett',
   createdAt:new Date(Date.now()-864e5).toISOString(),activities:[],meetings:[],deals:[],dealValue:0},
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.ba.mjs',out.outputFiles[0].text);
const mod=await import('./.ba.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=60)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const setVal=async(el,v,tag='HTMLInputElement')=>{const set=Object.getOwnPropertyDescriptor(dom.window[tag].prototype,'value').set;
  await act(async()=>{set.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test((b.textContent||'').trim()));
const seg=l=>[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim()===l);
const field=lab=>{const f=[...document.querySelectorAll('.field')].find(e=>((e.querySelector('label')||{}).textContent||'').trim()===lab);
  return f?f.querySelector('input,select'):null;};
const ev=()=>globalThis.__EVENT_WRITES__.at(-1);
const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};

console.log('\nthe tab exists');
await nav('Events');
ok('Events page renders', /Suite nights and anything else/i.test(document.body.textContent||''));
ok('empty state shown', /No events yet/i.test(document.body.textContent||''));

console.log('\ncreate one');
await click(btn(/New event/)); await settle();
ok('an event row was written', !!ev(), JSON.stringify(ev()||{}).slice(0,60));
ok('it opened straight into the detail view', !!field('Event name'));
ok('seats default to 19', field('Seats in total').value==='19', field('Seats in total').value);

await setVal(field('Event name'),'Suite Night · August'); await settle(20);
await setVal(field('Venue'),'Equity Bank Park'); await settle(20);
await setVal(field('Date'),day(30)); await settle();
ok('name and venue saved', ev().name==='Suite Night · August'&&ev().venue==='Equity Bank Park',
   JSON.stringify({n:ev().name,v:ev().venue}));

console.log('\nthe timeline builds itself off the date');
const ms=ev().milestones||[];
ok('milestones seeded', ms.length===9, 'n='+ms.length);
ok('landing page lands 28 days before', ms.some(m=>/Landing page live/.test(m.label)&&m.due===day(2)),
   (ms.find(m=>/Landing page/.test(m.label))||{}).due+' vs '+day(2));
ok('event day is the date itself', ms.some(m=>m.label==='Event day'&&m.due===day(30)));
ok('follow-up lands after', ms.some(m=>/Follow up/.test(m.label)&&m.due===day(32)));

console.log('\nmoving the date drags the timeline');
await setVal(field('Date'),day(37)); await settle();
const ms2=ev().milestones||[];
ok('landing page moved with it', ms2.some(m=>/Landing page live/.test(m.label)&&m.due===day(9)),
   (ms2.find(m=>/Landing page/.test(m.label))||{}).due+' vs '+day(9));
ok('nothing was duplicated', ms2.length===9, 'n='+ms2.length);

console.log('\nsponsors');
await click(seg('Sponsors')); await settle();
await click(btn(/Add a sponsor slot/)); await settle();
ok('a slot exists', (ev().slots||[]).length===1);
const lab=document.querySelector('.ev-row .ev-lab');
await setVal(lab,'Catering'); await settle(20);
await setVal(document.querySelector('.ev-row .ev-amt'),'150'); await settle();
ok('label and price saved', ev().slots[0].label==='Catering'&&ev().slots[0].price==='150',
   JSON.stringify(ev().slots[0]));
const sel=document.querySelector('.ev-pick select');
ok('the picker lists CRM contacts', [...sel.options].some(o=>/Dustin Kihle/.test(o.textContent))
   && [...sel.options].some(o=>/relationship/.test(o.textContent)), [...sel.options].map(o=>o.textContent).join(' | '));
await act(async()=>{const s=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  s.call(sel,'c1'); sel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
await click(btn(/^Add$/)); await settle();
ok('sponsor attached from the CRM', ev().slots[0].contactId==='c1'&&/Dustin/.test(ev().slots[0].contactName),
   JSON.stringify(ev().slots[0]));

console.log('\na typed-in name becomes a real lead');
await click(btn(/Add a sponsor slot/)); await settle();
const rows=[...document.querySelectorAll('.ev-row')];
const newInput=rows[1].querySelector('.ev-pick input');
await setVal(newInput,'Brand New Sponsor'); await settle();
await click([...rows[1].querySelectorAll('button')].find(b=>/^Add$/.test(b.textContent))); await settle();
const lw=globalThis.__WRITES__.at(-1);
ok('a lead was created in the CRM', lw && lw.name==='Brand New Sponsor', JSON.stringify(lw&&{n:lw.name,s:lw.source}));
ok('sourced to the event', lw && lw.source==='Suite Night · August', lw&&lw.source);

console.log('\nguest list and seat maths');
await click(seg('Guest list')); await settle();
const gsel=document.querySelector('.ev-pick select');
await act(async()=>{const s=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  s.call(gsel,'c2'); gsel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
await click(btn(/^Add$/)); await settle();
ok('guest added as invited', (ev().guests||[]).length===1 && ev().guests[0].status==='invited');
const kpiV=lab2=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab2.toLowerCase());
  return k?((k.querySelector('.kv')||{}).textContent||'').trim():'none';};
ok('an invite does not take a seat yet', kpiV('Seats left')==='17', 'seats left='+kpiV('Seats left'));
const gst=document.querySelector('.ev-st');
await act(async()=>{const s=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  s.call(gst,'confirmed'); gst.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
await settle();
ok('confirming takes one', kpiV('Seats left')==='16', 'seats left='+kpiV('Seats left'));
await setVal(document.querySelector('.ev-plus input'),'2'); await settle();
ok('a plus-two takes three', kpiV('Seats left')==='14', 'seats left='+kpiV('Seats left'));

console.log('\nmoney');
await click(seg('Money')); await settle();
const amts=[...document.querySelectorAll('.ev-amt')];
await setVal(amts[0],'600'); await settle(20);
await setVal(amts[1],'250'); await settle();
ok('costs recorded', evNum(ev().costs[0].amount)===600 && evNum(ev().costs[1].amount)===250,
   JSON.stringify((ev().costs||[]).map(c=>c.amount)));
function evNum(v){const n=Number(v);return isNaN(n)?0:n;}
/* 1 sponsor at $150 promised, 3 confirmed heads x $60 cover = $180, costs $850 */
ok('projected net is promised + cover - costs', kpiV('Projected net')==='-$520', 'net='+kpiV('Projected net'));
/* nothing collected yet, so banked is costs-only: -$850, not $0 */
ok('banked shows the hole, not a zero', /-\$850 banked so far/.test(document.body.textContent||''),
   (document.body.textContent||'').match(/[-$\d,]+ banked so far/)?.[0]||'not found');
console.log('\nmarking money in');
const paid=[...document.querySelectorAll('.ev-paid input')];
if(paid.length){ await click(paid[0]); await settle(); }
await click(seg('Sponsors')); await settle();
const sPaid=document.querySelector('.ev-paid input');
if(sPaid){ await click(sPaid); await settle(); }
ok('a paid sponsor moves banked', /-\$700 banked so far/.test(document.body.textContent||''),
   (document.body.textContent||'').match(/[-$\d,]+ banked so far/)?.[0]||'not found');
ok('projected did not move', kpiV('Projected net')==='-$520', kpiV('Projected net'));

console.log('\nGoogle Sheet import');
/* the sheet has: one person already on the list, one who exists in the CRM by
   email, one brand new, one whose NAME matches a contact but nothing else, and
   one junk row with neither name nor email */
globalThis.__SHEET__={headers:['Timestamp','Full Name','Email Address','Phone','Guests','Notes'],rows:[
  ['x','Robin','robin@adeas.com','','1','print sponsor'],
  ['x','Dustin Kihle','dustin@kihleroofing.com','316-555-0101','0',''],
  ['x','Brand New Person','new@person.com','316-555-0199','2','met at chamber'],
  ['x','Jay Simpson','','','0','name only, nothing to confirm it'],
  ['x','','','','',''],
]};
const oldFetch=globalThis.fetch;
globalThis.fetch=async(u,opts)=>{
  if(String(u).includes('/api/sheet-read'))
    return {ok:true,json:async()=>({headers:globalThis.__SHEET__.headers,rows:globalThis.__SHEET__.rows,tab:'RSVPs'})};
  return oldFetch(u,opts);
};
await click(seg('Guest list')); await settle();
const url=[...document.querySelectorAll('.sheet-row input')][0];
ok('a sheet box is on the guest tab', !!url);
await setVal(url,'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'); await settle();
await click(btn(/Check the sheet/)); await settle(120);

ok('columns were auto-mapped', /Full Name/.test((document.querySelector('.sheet-map select')||{}).value||''),
   (document.querySelector('.sheet-map select')||{}).value);
const tally=(document.querySelector('.sheet-tally')||{}).textContent||'';
ok('one row is brand new', /1 new/.test(tally), tally);
ok('one matched an existing contact by email', /1 already in the CRM/.test(tally), tally);
ok('the guest already on the list is not re-added', /1 already on this list/.test(tally), tally);
ok('the junk row is skipped', /1 rows with no name or email/.test(tally), tally);
ok('the name-only match is held back', /1 need a look/.test(tally), tally);
ok('and it says why', /name matched, no email or phone/.test((document.querySelector('.sheet-unsure')||{}).textContent||''),
   (document.querySelector('.sheet-unsure')||{}).textContent||'');

const before=(ev().guests||[]).length;
const leadsBefore=globalThis.__WRITES__.length;
await click(btn(/Add 2 to the guest list/)); await settle();
const gs=ev().guests||[];
ok('two guests added', gs.length===before+2, before+' -> '+gs.length);
ok('the new person became a lead', globalThis.__WRITES__.slice(leadsBefore).some(l=>l.name==='Brand New Person'),
   JSON.stringify(globalThis.__WRITES__.slice(leadsBefore).map(l=>l.name)));
const nl=globalThis.__WRITES__.slice(leadsBefore).find(l=>l.name==='Brand New Person');
ok('with their email and phone', nl && nl.email==='new@person.com' && !!nl.phone, JSON.stringify(nl&&{e:nl.email,p:nl.phone}));
ok('sourced to the event', nl && nl.source==='Suite Night · August', nl&&nl.source);
ok('the matched contact was NOT duplicated as a lead',
   !globalThis.__WRITES__.slice(leadsBefore).some(l=>l.name==='Dustin Kihle'),
   JSON.stringify(globalThis.__WRITES__.slice(leadsBefore).map(l=>l.name)));
ok('plus-ones came across', gs.some(g=>g.name==='Brand New Person'&&evNum(g.plusOnes)===2),
   JSON.stringify(gs.map(g=>g.name+':'+g.plusOnes)));
ok('the name-only one was left out', !gs.some(g=>/same name/.test(g.notes||'')));

console.log('\nsyncing the same sheet twice');
await click(btn(/Check the sheet/)); await settle(120);
const t2=(document.querySelector('.sheet-tally')||{}).textContent||'';
ok('everything imported now reads as already on the list', /3 already on this list/.test(t2), t2);
ok('nothing new is offered', /0 new/.test(t2), t2);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
