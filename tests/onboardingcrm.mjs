/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_onbcrm = bundleName('onbcrm');
const B_onbcv = bundleName('onbcv');
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

/* THE ONBOARDING TAB, DRIVEN THROUGH THE REAL CRM (as the owner).

   Boots the whole App with only the database stubbed, and asserts on what
   reaches the database and the server, not only on the screen:

     - the CRM's poll applies a submitted onboarding to the LEAD's existing
       checklist (intake_form, logo_received, headshot_received), once, and
       marks it applied for that submit; an unsubmitted one is left alone
     - the tab lists both, with status from the shared library
     - "Deposit paid" and "access received" are the lead's checklist: ticking
       access writes the LEAD, not the onboarding
     - Copy website prompt copies the stored prompt; Regenerate rebuilds it
       with the files' storage paths from onboarding-admin and saves it
     - Edit answers runs the same clean the portal's route runs: an SSN is
       refused and NOTHING is written
     - New onboarding writes a 43-character token and the chosen products
     - Download PDF prints the answers document only
     - the client record (ClientView) shows an Onboarding tab only when App
       hands it one

   Seen red: the poll writing to the onboarding instead of the lead; the
   editor saving uncleaned answers; the access toggle writing a column. */
const _d=new Date(); const today=`${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;   // LOCAL, like todayISO
globalThis.__SETTINGS__={options:{},offer:JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json','utf8')),onboarding:JSON.parse(fs.readFileSync('ONBOARDING-CONFIG.json','utf8'))};
globalThis.__LEADS__=[
 {id:'L1',name:'Jordan Reed',company:'Reed Realty Group',email:'jordan@reed.test',stage:'won',isClient:true,createdAt:'2026-09-01T12:00:00Z',activities:[],
  onboarding:{deposit_paid:{done:'2026-10-04',due:null},logo_received:{done:'2026-09-20',due:'2026-09-25'}}},
 {id:'L2',name:'Dee Service',company:'Dee Roofing',email:'dee@dee.test',stage:'won',isClient:true,createdAt:'2026-09-01T12:00:00Z',activities:[]},
];
globalThis.__TXNS__=[];
globalThis.__PROPOSALS__=[];
const SUB='2026-10-05T15:00:00.000Z';
const answers={'biz.industry':'realtor','biz.contact_name':'Jordan Reed','biz.email':'jordan@reed.test','biz.phone':'316-555-0100','biz.name':'Reed Realty Group',
 're.license':'SP1','re.brokerage':'Prairie Brokers','re.broker_name':'Pat','re.broker_email':'pat@p.test','web.domain_own':'yes','web.gbp_status':'have',
 'suite.goals':[{label:'Closings',target:'24'},{label:'GCI',target:'400k'},{label:'Leads',target:'40'}],'fl.rights':true};
globalThis.__ONBOARDINGS__=[
 {id:'00000000-0000-4000-9000-000000000001',lead_id:'L1',status:'submitted',products:['website','suite'],package_name:'Growth OS',answers,sections:{},
  outputs:{websitePrompt:'# Website build: Reed Realty Group\nSTORED PROMPT',suitePrompt:'# Business Suite setup: Reed Realty Group',generatedAt:SUB,snapshot:{answers,industry:'realtor',products:['website','suite'],files:[]}},
  submitted_at:SUB,applied_at:null,last_activity_at:SUB,updated_at:SUB,token:'T'.repeat(43),
  onboarding_files:[{id:'f1',slot:'logos',original_name:'logo.png',mime:'image/png',bytes:2048,state:'ok',path:'o1/logos/u1.png'},
                    {id:'f2',slot:'headshot',original_name:'me.jpg',mime:'image/jpeg',bytes:4096,state:'ok',path:'o1/photos/u2.jpg'},
                    {id:'f3',slot:'documents',original_name:'pending.pdf',mime:'application/pdf',bytes:1,state:'pending',path:'o1/documents/u3.pdf'}]},
 {id:'00000000-0000-4000-9000-000000000002',lead_id:'L2',status:'in_progress',products:['website'],package_name:'',answers:{'biz.industry':'service'},sections:{biz:{done:true}},
  outputs:{},submitted_at:null,applied_at:null,last_activity_at:SUB,updated_at:SUB,token:'U'.repeat(43),onboarding_files:[]},
];
const SENT=[]; let clip=''; let printed=0; let printedHtml='';
Object.defineProperty(dom.window.navigator,'clipboard',{value:{writeText:async t=>{clip=t;}},configurable:true});
dom.window.print=()=>{printed++; printedHtml=document.body.innerHTML;};
globalThis.fetch=async(u,o={})=>{
  const url=String(u);
  if(url.includes('google-status')) return {ok:true,json:async()=>({connected:false,email:''})};
  if(url.includes('/api/onboarding-admin')){ const b=JSON.parse(o.body); SENT.push({url,body:b,auth:(o.headers||{}).authorization||(o.headers||{}).Authorization});
    if(b.action==='files') return {ok:true,status:200,json:async()=>({ok:true,files:[
      {id:'f1',slot:'logos',name:'logo.png',mime:'image/png',bytes:2048,sensitive:false,path:'o1/logos/u1.png',url:'https://s/l?token=x',thumb:'https://s/l?token=x'},
      {id:'f2',slot:'headshot',name:'me.jpg',mime:'image/jpeg',bytes:4096,sensitive:false,path:'o1/photos/u2.jpg',url:'https://s/h?token=x',thumb:'https://s/h?token=x'}]})};
    if(b.action==='link') return {ok:true,status:200,json:async()=>({ok:true,link:'https://p.test/onboarding/reed-realty-group#t='+'T'.repeat(43)})};
    return {ok:true,status:200,json:async()=>({ok:true})}; }
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx','.json':'json'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/'+B_onbcrm,out.outputFiles[0].text);
const mod=await import('./'+B_onbcrm+'?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,200));});
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,300):''));}};
const tick=async(ms=90)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));}); await tick();};
const setVal=async(el,v)=>{ await act(async()=>{ const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v); el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); }); await tick(); };
const byText=(sel,re)=>[...document.querySelectorAll(sel)].find(e=>re.test(e.textContent||''));
const txt=()=>document.body.textContent.replace(/\s+/g,' ');
const W=()=>globalThis.__ONBOARDING_WRITES__||[];
const lastLead=id=>[...globalThis.__WRITES__].reverse().find(l=>l&&l.id===id);

console.log('\nthe poll applies a submit to the LEAD');
ok('the CRM renders at all', document.body.textContent.length>200);
const l1=lastLead('L1');
ok('lead L1 was written', !!l1, globalThis.__WRITES__.map(l=>l.id).join(','));
ok('  intake_form ticked today', l1&&l1.onboarding.intake_form&&l1.onboarding.intake_form.done===today, JSON.stringify(l1&&l1.onboarding));
ok('  logo_received keeps its earlier date and its due date', l1&&l1.onboarding.logo_received.done==='2026-09-20'&&l1.onboarding.logo_received.due==='2026-09-25');
ok('  headshot_received ticked (a headshot came in)', l1&&l1.onboarding.headshot_received&&l1.onboarding.headshot_received.done===today);
ok('  deposit untouched', l1&&l1.onboarding.deposit_paid.done==='2026-10-04');
ok('  one activity, naming what was ticked', l1&&l1.activities.filter(a=>/^onb-sub-/.test(a.id)).length===1&&/headshot received/.test(l1.activities[0].text));
ok('marked applied, for THAT submit', W().some(w=>w.op==='applied'&&w.id.endsWith('01')&&w.submittedAt===SUB));
ok('the in-progress one touched nothing', !globalThis.__WRITES__.some(l=>l.id==='L2'&&((l.onboarding||{}).intake_form||(l.activities||[]).some(a=>/^onb-sub-/.test(a.id))))&&!W().some(w=>w.op==='applied'&&w.id.endsWith('02')));
ok('nothing was written TO an onboarding by the poll', !W().some(w=>w.op==='update'));

console.log('\nthe tab');
const nav=byText('.sb button, nav button',/^\s*Onboarding\s*$/);
ok('owners see an Onboarding tab', !!nav);
await click(nav); await tick(150);
ok('both onboardings listed', /Reed Realty Group/.test(txt())&&/Dee Roofing/.test(txt()), txt().slice(0,400));
ok('  with status from the shared library', /Submitted/.test(txt())&&/In progress \(0 of 7\)/.test(txt()), (txt().match(/In progress[^A-Z]*/)||[''])[0]);
ok('  and the portal settings saved (no fallback warning for state or productMap)', !/built-in default for: [^.]*(state|productMap)/.test(txt()), (txt().match(/built-in default for[^.]*/)||[''])[0]);
await click(byText('.onbd-row',/Reed Realty Group/)); await tick(200);
ok('the detail opens', /Copy website prompt/.test(txt())&&/Download PDF/.test(txt()));
const dep=byText('.onbd-tog',/Deposit paid/).querySelector('input');
ok('"Deposit paid" reads the lead\'s checklist', dep.checked&&/Oct 4/.test(byText('.onbd-tog',/Deposit paid/).textContent));
const before=globalThis.__WRITES__.length;
await click(byText('.onbd-tog',/Domain access received/).querySelector('input')); await tick();
const l1b=lastLead('L1');
ok('ticking domain access writes the LEAD\'s access_dns', globalThis.__WRITES__.length>before&&l1b.onboarding.access_dns&&l1b.onboarding.access_dns.done===today, JSON.stringify(l1b&&l1b.onboarding.access_dns));
ok('  and nothing on the onboarding', !W().some(w=>w.op==='update'&&JSON.stringify(w.patch).includes('access')));
ok('the launch clock waits only on Google profile access now', /Waiting on: Google profile access/.test(txt()), (txt().match(/Waiting on:[^.]*/)||[''])[0]);
ok('files came from onboarding-admin with the owner\'s token', SENT.some(s=>s.body.action==='files'&&/Bearer/.test(s.auth||'')), JSON.stringify(SENT.map(s=>s.auth)));
ok('  thumbnails shown; the pending upload is not', document.querySelectorAll('.onbd-file img').length===2&&!/pending\.pdf/.test(txt()));

console.log('\nprompts');
await click(byText('button',/Copy website prompt/)); await tick();
ok('copies the STORED prompt', /STORED PROMPT/.test(clip));
await click(byText('button',/^\s*Regenerate\s*$/)); await tick(150);
const regen=W().find(w=>w.op==='update'&&w.patch.outputs);
ok('Regenerate saves fresh prompts', regen&&/# Website build: Reed Realty Group/.test(regen.patch.outputs.websitePrompt)&&!/STORED PROMPT/.test(regen.patch.outputs.websitePrompt));
ok('  with the storage paths from onboarding-admin', regen&&regen.patch.outputs.websitePrompt.includes('storage: onboarding/o1/logos/u1.png'));
ok('  and both prompts for Growth OS', regen&&/# Business Suite setup/.test(regen.patch.outputs.suitePrompt));

console.log('\nediting answers runs the server\'s clean');
await click(byText('button',/Edit answers/)); await tick();
const role=document.getElementById('f-biz-role');
ok('the editor uses the portal\'s fields', !!role);
const nW=W().length;
await setVal(role,'SSN 123-45-6789');
await click(byText('button',/Save answers/)); await tick();
ok('an SSN is refused, and NOTHING is written', /Social Security/.test(txt())&&W().length===nW);
await setVal(role,'Team lead');
await click(byText('button',/Save answers/)); await tick(120);
const ed=W().slice(nW).find(w=>w.op==='update'&&w.patch.answers);
ok('a clean value saves', ed&&ed.patch.answers['biz.role']==='Team lead'&&ed.patch.answers['biz.name']==='Reed Realty Group');

console.log('\nthe PDF');
await click(byText('button',/Download PDF/)); await tick(150);
ok('print opened', printed===1);
ok('  with the answers document mounted to print', /oa-print-root/.test(printedHtml)&&/Reed Realty Group/.test(printedHtml)&&/Prairie Brokers/.test(printedHtml));
await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('afterprint'));}); await tick();
ok('  and taken down after', !document.querySelector('.oa-print-root')&&!document.body.classList.contains('oa-printing'));

console.log('\nnew onboarding');
await click(byText('button',/All onboardings/)); await tick();
await click(byText('button',/New onboarding/)); await tick();
const sel=document.querySelector('.onbd-form select');
await setVal(sel,'L2');
await click(byText('.onbd-form label',/Automations/).querySelector('input'));
await click(byText('button',/^\s*Create\s*$/)); await tick(120);
const cr=W().find(w=>w.op==='create');
ok('creates with a 43-char token and the chosen products', cr&&/^[A-Za-z0-9_-]{43}$/.test(cr.row.token)&&JSON.stringify(cr.row.products)==='["automations"]'&&cr.row.lead_id==='L2', JSON.stringify(cr));

console.log('\nthe client record');
{
  const cv=await esbuild.build({entryPoints:['src/ClientView.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',loader:{'.js':'jsx','.jsx':'jsx'},
    external:['react','react-dom','react-dom/client','react/jsx-runtime'],define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={};'},logLevel:'silent'});
  fs.writeFileSync('tests/'+B_onbcv,cv.outputFiles[0].text);
  const CV=(await import('./'+B_onbcv+'?v='+Date.now())).default;
  const host=document.createElement('div'); document.body.appendChild(host);
  const r2=createRoot(host);
  const lead={id:'L1',name:'Jordan',company:'Reed',activities:[],isClient:true};
  await act(async()=>{r2.render(React.createElement(CV,{lead,settings:{},stages:[],tracks:[],invoices:[],team:[],onClose(){},renderOnboarding:l=>React.createElement('div',{id:'onb-marker'},'ONB for '+l.id)}));});
  const tab=[...host.querySelectorAll('button')].find(b=>/^Onboarding$/.test(b.textContent));
  ok('the client record has an Onboarding tab when App provides one', !!tab);
  if(tab) await click(tab);
  ok('  and it renders App\'s panel for that client', host.querySelector('#onb-marker')&&/ONB for L1/.test(host.textContent));
  await act(async()=>{r2.render(React.createElement(CV,{lead,settings:{},stages:[],tracks:[],invoices:[],team:[],onClose(){}}));});
  ok('  and none when it does not (a rep, or the module off)', ![...host.querySelectorAll('button')].some(b=>/^Onboarding$/.test(b.textContent)));
  r2.unmount(); fs.unlinkSync('tests/'+B_onbcv);
}

root.unmount(); fs.unlinkSync('tests/'+B_onbcrm);
console.log(`\nonboardingcrm: ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
