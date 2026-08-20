/* DOES THE APPOINTMENT RATE FIELD ACTUALLY RENDER?

   grep proves a string is in the file. It does not prove React puts it on the
   screen, and "the code is there, your browser is stale" is a guess until
   something mounts the real component and looks.

   The specific worry worth testing: if the input were gated on a TRUTHY rate
   rather than on role, then a rep with no appointment pay — value 0, or
   undefined because getUsers never selected the column — would render no field
   at all, and setting a rate for the first time would be impossible. The field
   would be missing exactly for the people who need it. So the rep in this
   fixture has appointment_rate 0 on purpose.                                  */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,240):''));}};

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver'])
 { try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}; dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true; dom.window.confirm=()=>true;

globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__TASKS__=[];globalThis.__USER_WRITES__=[];
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__MLOGS__=[];globalThis.__MLOG_WRITES__=[];globalThis.__KB_NOTES__=[];globalThis.__KB_PUB__=[];globalThis.__KB_WRITES__=[];globalThis.__POCKETS__=[];
globalThis.__SETTINGS__={};
globalThis.__LEADS__=[];
/* an owner, and a rep on NEITHER pay model — both rates zero, the new-hire shape */
globalThis.__USERS__=[
  {id:'u_owner',name:'Garrett',email:'g@x.com',role:'owner',pools:[],commission_pct:0,appointment_rate:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
  {id:'u_rep',name:'Sales Rep 1',email:'rep@x.com',role:'rep',pools:['Inbound'],commission_pct:0,appointment_rate:0,active:true,tabs:[],goal_conversions:0,nav_order:[]},
];

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],logLevel:'silent'});
fs.writeFileSync(path.join(here,'.bar.mjs'),out.outputFiles[0].text);
const mod=await import('./.bar.mjs?v='+Date.now());
const React=(await import('react')).default; const {createRoot}=await import('react-dom/client'); const {act}=await import('react');
const rootEl=createRoot(document.getElementById('root'));
await act(async()=>{rootEl.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,200));});

const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});await act(async()=>{await new Promise(r=>setTimeout(r,150));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l); if(b) await click(b); return !!b;};
const labelled=re=>[...document.querySelectorAll('.field')].find(f=>re.test((f.querySelector('label')||{}).textContent||''));

console.log('\nreaching the team screen as owner');
ok('Settings is reachable', await nav('Settings'));
const teamTab=[...document.querySelectorAll('button,.seg-b,.set-tab')].find(b=>/^Team$/.test((b.textContent||'').trim()));
if (teamTab) await click(teamTab);
const rows=[...document.querySelectorAll('.tm-row')];
ok('the team rows render', rows.length>=2, rows.length+' rows');

console.log('\nthe collapsed row says which pay model, before anything is opened');
{
  const repRow=rows.find(r=>/Sales Rep 1/.test(r.textContent||''));
  ok('the rep row is on screen', !!repRow);
  ok('a rep on neither model reads "no pay model", not a bare 0%',
     repRow && /no pay model/i.test(repRow.textContent||''), repRow&&repRow.textContent.slice(0,140));
  ok('and it does NOT show a percentage it was never set',
     repRow && !/\d+%/.test((repRow.querySelector('.tm-head')||{}).textContent||''),
     repRow&&(repRow.querySelector('.tm-head')||{}).textContent);
}

console.log('\nopening the rep — BOTH fields must be there, at zero');
const repRow=rows.find(r=>/Sales Rep 1/.test(r.textContent||''));
await click(repRow.querySelector('.tm-head'));
{
  const appt=labelled(/Per appointment/i), pct=labelled(/Commission %/i);
  /* the actual claim under test */
  ok('the "Per appointment $" field RENDERS', !!appt);
  ok('the "Commission %" field renders', !!pct);
  ok('BOTH are present together — one is not replacing the other', !!appt && !!pct);

  const ai=appt&&appt.querySelector('input'), pi=pct&&pct.querySelector('input');
  ok('the appointment field is an editable number input',
     ai && ai.type==='number' && !ai.disabled && !ai.readOnly);
  /* the gate proof: the rate is 0 and the field is on screen anyway. A truthy
     gate would have hidden it here, and a rate could never be set the first
     time. */
  ok('it renders AT ZERO — the gate is role, not a truthy rate',
     !!ai && String(ai.value)==='0', ai&&ai.value);
  ok('so does commission at zero', !!pi && String(pi.value)==='0', pi&&pi.value);
  ok('the two inputs are separate elements — independently settable', ai&&pi&&ai!==pi);
  ok('the appointment field explains when it is earned',
     appt && /held/i.test(appt.textContent||''), appt&&appt.textContent.slice(0,160));
  ok('a heading says both are optional',
     /Zero means they are not on that model/i.test(document.body.textContent||''));
}

console.log('\ntyping a rate reaches the database with the rate in it');
{
  const ai=labelled(/Per appointment/i).querySelector('input');
  const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{ setter.call(ai,'75'); ai.dispatchEvent(new dom.window.Event('input',{bubbles:true})); });
  await act(async()=>{await new Promise(r=>setTimeout(r,200));});
  const w=(globalThis.__USER_WRITES__||[]).filter(u=>u&&u.id==='u_rep').at(-1);
  ok('a write reached the user row', !!w, JSON.stringify(globalThis.__USER_WRITES__||[]).slice(0,200));
  ok('and it carried appointment_rate 75', w && Number(w.appointment_rate)===75,
     w&&JSON.stringify({a:w.appointment_rate,c:w.commission_pct}));
  ok('without disturbing commission', w && Number(w.commission_pct)===0, w&&String(w.commission_pct));
}

console.log('\nthe owner row has no pay fields at all');
{
  await click(repRow.querySelector('.tm-head'));
  const ownerRow=[...document.querySelectorAll('.tm-row')].find(r=>/Garrett/.test(r.textContent||''));
  await click(ownerRow.querySelector('.tm-head'));
  ok('an owner shows no appointment rate', !labelled(/Per appointment/i));
  ok('an owner shows no commission %',    !labelled(/Commission %/i));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
