/* AN OWNER'S NOTES ABOUT A REP — proved from the REP'S side.
   ============================================================================

   THE FAILURE THIS EXISTS TO PREVENT

     Garrett writes "not sure he is going to make it past week two" on Tony's
     profile. Tony reads it.

   That is not a hypothetical shape. crm_users.users_read is
   `id = auth.uid() or is_owner()`, so a rep reads his OWN crm_users row WHOLE —
   which is exactly why the note is a separate table and not a column there.
   The same reasoning as the coordinator/commission boundary: the app is not
   the boundary, Postgres is.

   WHAT ENFORCES IT, AND WHAT THIS FILE IS

   rep_notes has ONE policy, `for all using (is_owner()) with check
   (is_owner())`, so a rep's login gets zero rows — not a filtered list,
   nothing. That is proved against real Postgres in VERIFY-RLS.md and cannot be
   proved from jsdom.

   So this suite is the SECOND line, and it is deliberately adversarial: the
   fixture hands a REP'S BROWSER a note about himself, as though the policy had
   been dropped. Nothing may surface it — not the screen, not the assistant.
   Read that the right way round: the app is not the control. This is what
   happens when the control fails.
*/
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,240):''));}};

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://crm.test/',pretendToBeVisual:true});
for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','KeyboardEvent',
 'getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver'])
 {try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{}}
globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia=globalThis.matchMedia;
globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.ResizeObserver=globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.confirm=()=>true;

for(const k of ['__WRITES__','__MANY__','__TASKS__','__USER_WRITES__','__EVENTS__','__EVENT_WRITES__',
  '__SETTINGS_WRITES__','__MLOG_WRITES__','__KB_WRITES__','__KB_PUBLISHED__','__KB_PREVIEWS__',
  '__MLOGS__','__KB_NOTES__','__KB_PUB__']) globalThis[k]=[];
globalThis.__SETTINGS__=null;
globalThis.__KB_READS__=[];
globalThis.__LAST_SEEN__=[{id:'u_rep',last_sign_in_at:'2026-08-26T08:02:00.000Z'}];

/* signed in as a REP */
globalThis.__USERS__=[
  {id:'u_rep',name:'Tony',email:'tony@getproytech.com',role:'rep',pools:[],
   commission_pct:25,appointment_rate:0,active:true,tabs:[],goal_conversions:0,nav_order:[],onboarding:{}},
];
globalThis.__WHOAMI__={id:'u_rep',name:'Tony',email:'tony@getproytech.com',role:'rep',pools:[],
  commission_pct:25,appointment_rate:0,active:true,tabs:[],goal_conversions:0,nav_order:[],setup:true};

const ASSESSMENT='ASSESSMENTSENTINEL-not-sure-he-makes-it-past-week-two';
/* THE ADVERSARIAL BIT. In a correctly migrated install this array is EMPTY for
   a rep, because rep_notes RLS returns them nothing. Putting a note here models
   the policy having been dropped. */
globalThis.__REP_NOTES__=[
  {id:1,rep_id:'u_rep',body:ASSESSMENT,by_id:'u_owner',by_name:'Garrett',at:'2026-08-26T09:00:00.000Z'},
];

const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[{id:'l1',name:'Rita Alvarez',company:'Alvarez Roofing',stage:'new',
  owner:'Tony',owner_id:'u_rep',createdAt:ago(3),meetings:[],deals:[],dealValue:0,payments:[],
  activities:[{id:'a1',ts:ago(1),type:'Call',disp:'NA',text:'No answer.',who:'Tony',whoId:'u_rep'}]}];

globalThis.__FETCHES__=[];
globalThis.fetch=async(u,opts={})=>{
  const url=String(u);
  globalThis.__FETCHES__.push({url,body:opts&&opts.body?String(opts.body):''});
  if(url.includes('google-status')) return {ok:true,json:async()=>({connected:false,email:''})};
  if(url.includes('/api/jarvis')) return {ok:true,json:async()=>({ok:true,text:JSON.stringify({answer:'ok',actions:[],cited:[]}),usage:{},cost:0,spent:0,budget:20})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};

const out=await esbuild.build({entryPoints:[path.join(root,'src/App.jsx')],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync(path.join(here,'.brn.mjs'),out.outputFiles[0].text);
const mod=await import('./.brn.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const rootEl=createRoot(document.getElementById('root'));
await act(async()=>{rootEl.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,180));});

const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=110)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const txt=()=>document.body.textContent||'';

console.log('\nthe assessment never reaches the rep, on any screen');
{
  ok('the app mounted as a rep', /Tony/.test(txt()), txt().slice(0,140));
  ok('the assessment is not on the dashboard', !txt().includes(ASSESSMENT));

  /* Walk every tab this rep can actually open. The leak that matters is not on
     a screen somebody thought of — it is on the one nobody did. */
  const navs=[...document.querySelectorAll('.nav-i')];
  for(const n of navs){
    const label=(n.textContent||'').trim();
    await click(n); await settle();
    if(txt().includes(ASSESSMENT)){ ok(`${label} leaks the assessment`, false, label); break; }
  }
  ok('no tab a rep can open shows it', !txt().includes(ASSESSMENT));
  ok('  and there is no team table for a rep to tap',
     !document.querySelector('.tapname'), 'rep should not see the team scorecard');
  ok('  nor any rep profile rendered', !document.querySelector('.modal.lead.rp'));
}

console.log('\nand it never reaches the assistant either');
{
  /* The tier-3 shape from tests/kb.mjs: a rep's browser may legitimately hold
     things Postgres would not hand over if a policy regressed, so the OUTBOUND
     payload is asserted directly rather than trusting the screen. */
  const jv=await import('../src/lib/jarvis.js');
  const {payload}=jv.buildPayload({
    leads:globalThis.__LEADS__, question:'what does garrett think of me',
    rep:true, me:'Tony', role:'rep', kb:globalThis.__KB_PUB__,
  });
  const body=JSON.stringify(payload);
  ok('the assistant payload does not carry the assessment', !body.includes(ASSESSMENT));
  ok('  and names no rep_notes field at all', !/rep_note|repNote|assessment/i.test(body));
  const sent=globalThis.__FETCHES__.filter(f=>f.url.includes('/api/jarvis'));
  ok('  nor did anything already sent to the model', !sent.some(f=>f.body.includes(ASSESSMENT)),
     String(sent.length)+' jarvis calls');
}

console.log('\nthe rep wrote nothing while all of that happened');
{
  ok('no note was written', (globalThis.__REP_NOTE_WRITES__||[]).length===0,
     JSON.stringify(globalThis.__REP_NOTE_WRITES__||[]));
  ok('and the note that was planted is still the only one',
     (globalThis.__REP_NOTES__||[]).length===1);
}

console.log('\nwhere the boundary actually is');
{
  const sql=fs.readFileSync(path.join(root,'REP-PROFILE-MIGRATION.sql'),'utf8');
  /* ONE policy, is_owner() on BOTH sides. `for all` leaves no verb to forget,
     and permissive policies are ORed — so a second policy here is a rep
     reading his own assessment, and counting them would not catch it. */
  ok('rep_notes has row level security', /alter table rep_notes enable row level security/.test(sql));
  ok('  exactly one policy is created', (sql.match(/create policy .* on rep_notes/g)||[]).length===1,
     JSON.stringify(sql.match(/create policy .* on rep_notes/g)));
  ok('  it is `for all`, so no verb is left unguarded', /create policy rep_notes_owner\s+on rep_notes\s+for all/.test(sql));
  ok('  with is_owner() on the read side', /for all using \(is_owner\(\)\)/.test(sql));
  ok('  and on the write side', /with check \(is_owner\(\)\)/.test(sql));

  /* The reason it is not a column on crm_users, stated where somebody widening
     that policy would read it. */
  ok('the file says why it is not a column on crm_users', /users_read/.test(sql));

  const app=fs.readFileSync(path.join(root,'src/App.jsx'),'utf8');
  ok('the profile is routed owner-only as well', /repOpen&&isOwner&&<RepProfile/.test(app));
  const prof=fs.readFileSync(path.join(root,'src/RepProfile.jsx'),'utf8');
  ok('and the component says the routing is NOT the protection',
     /not a security one|routing decision/.test(prof));
}

console.log('\n'+pass+' passed, '+fail+' failed');
try{ await act(async()=>{rootEl.unmount()}); dom.window.close(); }catch{}
process.exit(fail?1:0);
