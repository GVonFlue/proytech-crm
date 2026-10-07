/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_pui = bundleName('pui');
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','KeyboardEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
 try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; globalThis.__WRITES__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};


/* THE PROPOSALS TAB, DRIVEN THROUGH THE REAL CRM.

   Boots the whole App (only the database is stubbed) and does what Garrett
   does: open Proposals, pick the client, pick the package and an add-on,
   type what was quoted, write notes, Generate, edit a line, save, email it.
   Then a client accepts, and the CRM's own poll applies it to the lead.

   This is the test a source check cannot replace: the first version of the
   App wiring built clean and would have crashed every screen on load with
   `useRef is not defined`. Only rendering it catches that class of bug.

   Asserts on what reached the server, not just what is on screen: no price
   is sent to the AI, the saved body carries the CRM's numbers and not the
   notes, and the send call names no recipient.

   Seen red: useRef unimported (the whole App throws); the poll not applying
   an acceptance; Generate posting the quoted prices to the AI. */
globalThis.__SETTINGS__={options:{},offer:JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json','utf8'))};
globalThis.__LEADS__=[
 {id:'L1',name:'Dee Client',company:'Dee Co',businessType:'Home Services',website:'deeco.com',email:'dee@deeco.com',stage:'new',createdAt:'2026-09-01T12:00:00Z',activities:[]},
 {id:'L2',name:'Ann Accepts',company:'Ann LLC',email:'ann@ann.co',stage:'proposal',createdAt:'2026-09-01T12:00:00Z',activities:[],
  deals:[{id:'est',label:'Estimate',setup:5000}],dealValue:5000},
];
globalThis.__TXNS__=[];
globalThis.__PROPOSALS__=[];
const SENT=[];
const realFetch=globalThis.fetch;
globalThis.fetch=async(u,o={})=>{
  const url=String(u);
  if(url.includes('/api/proposal-draft')){ SENT.push({url,body:JSON.parse(o.body)}); return {ok:true,status:200,json:async()=>({ok:true,draft:{
    headline:'Growth systems',summary:'Your site works. Your follow up does not run without you.',
    plan:{goal:'Book 20 jobs a month',numbers:[{label:'Leads a month',value:'40'}],levers:['Answer every lead in a minute','Ask every happy customer for a review','Reactivate past customers']},
    gaps:[{title:'Missed calls are lost jobs',text:'Nobody calls back after hours.'}],
    build:[{title:'Website',tag:'new',text:'A new site.'},{title:'Automations',tag:'new',text:'Follow up that runs itself.'}],
    whyNow:['Busy season is close.'],email:{subject:'Your proposal from ProyTech',body:'Hi Dee, thanks for the time today. Your proposal is ready. Click Accept at the bottom to get started.'}}})}; }
  if(url.includes('/api/proposal-send')){ const b=JSON.parse(o.body); SENT.push({url,body:b});
    const p=globalThis.__PROPOSALS__.find(x=>x.id===b.id); const exp=new Date(Date.now()+7*864e5).toISOString();
    if(p){ p.status='sent'; p.sent_at=new Date().toISOString(); p.expires_at=exp; if(b.mode==='email') p.email_to='dee@deeco.com'; }
    return {ok:true,status:200,json:async()=>({ok:true,link:'https://crm.test/proposal.html#t='+(p&&p.token),expiresAt:exp,...(b.mode==='email'?{to:'dee@deeco.com'}:{})})}; }
  return realFetch(u,o);
};
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/'+B_pui,out.outputFiles[0].text);
const mod=await import('./'+B_pui+'?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,160));});
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,300):''));}};
const tick=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}); await tick();};
const setVal=async(el,v)=>{ await act(async()=>{ const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); }); await tick(); };
const byText=(sel,re)=>[...document.querySelectorAll(sel)].find(e=>re.test(e.textContent||''));
const txt=()=>document.body.textContent.replace(/\s+/g,' ');

console.log('\nthe tab');
ok('the CRM renders at all (no crash on load)', !!document.querySelector('.sb')||document.body.textContent.length>200);
const nav=byText('.sb button, .sb a, nav button','^\\s*Proposals\\s*$'.length?/^\s*Proposals\s*$/:/x/);
ok('owners see a Proposals tab', !!nav);
if(nav) await click(nav);
await tick(200);
ok('it opens with no proposals yet', /No proposals yet/.test(txt()), txt().slice(0,200));
const nb=byText('button',/New proposal/);
ok('New proposal is available because the offer is set', nb&&!nb.disabled);
if(nb) await click(nb);

console.log('\nbuilding one');
const clientSel=[...document.querySelectorAll('.pp-form select')][0];
ok('there is a client picker listing leads', clientSel&&[...clientSel.options].some(o=>/Dee Client/.test(o.textContent)));
await setVal(clientSel,'L1');
const growth=byText('.pp-opt',/Growth OS/), auto=byText('.pp-opt',/Automations/);
ok('the packages and add-on come from the offer', !!growth&&!!auto);
await click(growth); await click(auto);
const setupIn=document.querySelector('input[aria-label="Growth OS setup"]');
ok('the usual price is prefilled', setupIn&&setupIn.value==='3000', setupIn&&setupIn.value);
await setVal(setupIn,'2800');
/* cents with two digits, as on the proposal itself ($2,149.50); this used to
   assert "$2,149.5", which pinned a formatting bug in place */
ok('the running total uses what was quoted', /Setup \$4,299 · deposit \$2,149\.50 · monthly \$548/.test(txt()), (document.querySelector('.pp-total')||{}).textContent);
await setVal(document.querySelector('.pp-notes'),'Owner wants 20 jobs a month. Misses calls on site. Has 30 years of past customers and never emails them. Reviews only by luck. ZEBRA-NOTE-7');
await click(byText('button',/Generate proposal/)); await tick(200);

console.log('\nwhat went to the AI');
const ask=SENT.find(s=>s.url.includes('proposal-draft'));
ok('Generate called the draft route', !!ask);
const askS=JSON.stringify(ask&&ask.body);
ok('the notes and the items went', /ZEBRA-NOTE-7/.test(askS)&&/Growth OS/.test(askS)&&/Automations/.test(askS));
ok('NO price went to the AI', !/2800|3000|1499|4299|299|\bsetup\b|\bmonthly\b/.test(askS), askS.slice(0,300));

console.log('\nthe review');
const doc=document.querySelector('.pdoc');
ok('the proposal renders for review', !!doc);
const dt=doc?doc.textContent.replace(/\s+/g,' '):'';
ok('for the right client', /Dee Co/.test(dt));
ok('opening with their plan: goal and three levers', /Book 20 jobs a month/.test(dt)&&/Lever 3/.test(dt));
ok('the price is the CRM\'s: $4,299 install, $2,149.50 now, $548/mo', /\$4,299/.test(dt)&&/\$2,149\.50/.test(dt)&&/\$548\/mo/.test(dt), dt.slice(dt.indexOf('Install'),dt.indexOf('Install')+300));
ok('with the guarantee and the terms', /14 days/.test(dt)&&/monthly fee starts at launch/i.test(dt));
ok('and good for 7 days', /good for 7 days/.test(dt));
await click(byText('button',/Edit text/));
const sumBox=document.querySelector('.pdoc .pd-summary textarea');
ok('Edit text turns the words into editable boxes', !!sumBox);
await setVal(sumBox,'Your site works. Edited by hand.');
await click(byText('button',/Done editing/));
ok('the edit shows in the proposal', /Edited by hand/.test(document.querySelector('.pdoc').textContent));
ok('numbers are never editable boxes', ![...document.querySelectorAll('.pd-price textarea, .pd-inv textarea')].length);

console.log('\nsaving');
await click(byText('button',/Save draft/)); await tick(150);
const w=(globalThis.__PROPOSAL_WRITES__||[])[0];
ok('a draft was saved', !!w);
ok('with the CRM\'s numbers in it', w&&w.body.quote.setup===4299&&w.body.quote.deposit===2149.5&&w.body.quote.monthly===548, w&&w.body.quote);
ok('with the hand edit in it', w&&/Edited by hand/.test(w.body.copy.summary));
ok('the notes are stored apart, NOT in what the client gets', w&&/ZEBRA-NOTE-7/.test(w.notes)&&!JSON.stringify(w.body).includes('ZEBRA-NOTE-7'));
ok('with an unguessable 43-character token', w&&/^[A-Za-z0-9_-]{43}$/.test(w.token));
ok('the lead\'s email is not copied into the body', w&&!JSON.stringify(w.body).includes('dee@deeco.com'));

console.log('\nthe proposal standard: Send stays blocked until it is met');
const ready=()=>document.querySelector('.pp-ready');
const row=re=>[...((ready()&&ready().querySelectorAll('li'))||[])].find(li=>re.test(li.textContent));
const isNo=re=>{const r=row(re);return !!r&&r.className==='no';}, isOk=re=>{const r=row(re);return !!r&&r.className==='ok';};
ok('a ready-to-send checklist is shown above Send', !!ready());
ok('  blocked, and it says how many things are left', ready()&&/to fix before this can go out/.test(ready().textContent), ready()&&ready().textContent.slice(0,160));
ok('  a package is selected: passes', isOk(/A package is selected/));
ok('  three levers: passes', isOk(/Exactly 3 levers/));
ok('  only 1 of their numbers: missing', isNo(/At least 3 of their numbers/)&&/1 of 3/.test(row(/At least 3/).textContent));
ok('  only 1 gap: missing', isNo(/3 to 5 gaps/));
ok('  the build item not tied to anything bought is named', isNo(/Every build item/)&&/Website/.test(row(/Every build item/).textContent)&&!/Automations/.test(row(/Every build item/).textContent));
ok('  the lead has an email: passes', isOk(/valid email/));
ok('  not yet read: missing', isNo(/read every section/));
ok('  Email to client is disabled', byText('button',/Email to client/).disabled===true);
ok('  Copy client link is disabled', byText('button',/Copy client link/).disabled===true);
// fix it the way an owner would, in edit mode
if(!document.querySelector('.pd-add')) await click(byText('button',/Edit text/));
for(let k=0;k<2;k++) await click(byText('.pd-add',/Add a number/));
const nums=[...document.querySelectorAll('.pd-num')];
for(const [i,[val,label]] of [[1,['12','Jobs a month now']],[2,['1 in 4','Quotes that close']]].entries()){
  const tas=nums[nums.length-2+i].querySelectorAll('textarea'); await setVal(tas[0],val); await setVal(tas[1],label); }
for(let k=0;k<2;k++) await click(byText('.pd-add',/Add a gap/));
const gl=[...document.querySelectorAll('.pd-gaps li')];
await setVal(gl[gl.length-2].querySelectorAll('textarea')[0],'No follow up after a quote');
await setVal(gl[gl.length-1].querySelectorAll('textarea')[0],'Reviews are left to chance');
const link=[...document.querySelectorAll('.pd-link select')].find(sel=>sel.value==='');
ok('the unlinked build item offers what they are buying', link&&[...link.options].some(o=>o.value==='growth-os'));
await setVal(link,'growth-os');
ok('three numbers, three gaps, every build item linked: those rows pass', isOk(/At least 3 of their numbers/)&&isOk(/3 to 5 gaps/)&&isOk(/Every build item/));
ok('  but still blocked until the owner has read it', byText('button',/Email to client/).disabled===true&&isNo(/read every section/));
await click(document.querySelector('.pp-ready-tick input'));
ok('ticked: ready, and both Send buttons unlock', ready().className.includes(' ok')&&!byText('button',/Email to client/).disabled&&!byText('button',/Copy client link/).disabled);
await setVal(gl[gl.length-1].querySelectorAll('textarea')[0],'Reviews are left to luck');
ok('an edit AFTER ticking clears the tick: you must read what you changed', isNo(/read every section/)&&byText('button',/Email to client/).disabled===true);
await click(document.querySelector('.pp-ready-tick input'));
ok('  ticked again: ready', ready().className.includes(' ok'));

console.log('\nemailing it');
await click(byText('button',/Email to client/));
const subj=document.querySelector('.pp-mail input'), msgBox=document.querySelector('.pp-mail textarea');
ok('the email panel opens with the AI\'s draft to review', subj&&subj.value==='Your proposal from ProyTech'&&/Click Accept/.test(msgBox.value));
ok('it shows who it goes to, from the lead record', /Email to dee@deeco\.com/.test(document.querySelector('.pp-mail').textContent));
await setVal(msgBox,msgBox.value+' See you soon.');
await click(byText('.pp-mail button',/Send it/)); await tick(150);
const sendCall=SENT.find(s=>s.url.includes('proposal-send')&&s.body.mode==='email');
ok('Send posted the edited email', sendCall&&/See you soon/.test(sendCall.body.message));
ok('the request carries the owner\'s tick, which the server checks again', sendCall&&sendCall.body.reviewed===true);
ok('the request names NO recipient (the server reads it from the lead)', sendCall&&!('to' in sendCall.body)&&!('email' in sendCall.body)&&!JSON.stringify(sendCall.body).includes('@'));
ok('the owner is told it went', /Sent to dee@deeco\.com/.test(txt()));

console.log('\na client accepts, and the CRM applies it');
globalThis.__PROPOSALS__.push({id:'acc-1',lead_id:'L2',token:'T'.repeat(43),status:'accepted',
  body:{quote:{packageId:'website',service:'Website',items:[{id:'website',name:'Website',service:'Website',kind:'package',setup:1800,monthly:149}],setup:1800,deposit:900,monthly:149,prepay:null}},
  sent_at:'2026-10-03T15:00:00.000Z',expires_at:'2026-10-10T15:00:00.000Z',viewed_at:'2026-10-04T15:00:00.000Z',
  accepted_at:'2026-10-05T15:00:00.000Z',accepted_name:'Ann Accepts',accepted_ip:'9.8.7.6',accepted_plan:'monthly',applied_at:null});
globalThis.__WRITES__=[];
await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('focus'));}); await tick(300);
const lw=[...globalThis.__WRITES__].reverse().find(x=>x&&x.id==='L2');
ok('the poll wrote the accepted lead', !!lw);
ok('marked won', lw&&lw.stage==='signed', lw&&lw.stage);
ok('the estimate replaced by the accepted Website deal', lw&&lw.deals.length===1&&lw.deals[0].service==='Website'&&lw.deals[0].price==='1800'&&lw.dealValue===1800, lw&&JSON.stringify(lw.deals));
ok('monthly quoted, not started', lw&&lw.retainer==='149'&&!lw.retainerStart);
ok('the acceptance is on the timeline', lw&&lw.activities.some(a=>a.id==='prop-acc-acc-1'&&/Ann Accepts/.test(a.text)));
ok('and the proposal is marked applied', (globalThis.__PROPOSAL_APPLIED__||[]).includes('acc-1'));
const before=globalThis.__WRITES__.length;
await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('focus'));}); await tick(300);
ok('the next poll changes nothing', !globalThis.__WRITES__.slice(before).some(x=>x&&x.id==='L2'));

console.log('\nreps');
const appSrc=fs.readFileSync('src/App.jsx','utf8');
ok('the tab is owner-only in the gate', /if\(k==='proposals'\) return modOn\(settings,'proposals'\)&&!isRep\(user\);/.test(appSrc));
ok('and never on a rep\'s tab list', /const REP_TABS=[^\n]*k!=='proposals'[^\n]*\.concat\(\['dash'\]\)/.test(appSrc));

console.log(`\n${pass} passed, ${fail} failed`);
root.unmount(); try{fs.unlinkSync('tests/'+B_pui);}catch{} process.exit(fail?1:0);
