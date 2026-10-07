/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_onbrep = bundleName('onbrep');
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

/* A REP NEVER SEES ONBOARDING — not even when their tab list asks for it.

   Boots the real App signed in as a rep whose saved tab list INCLUDES
   'onboarding' (the way an owner could hand-edit it), with onboardings in the
   stubbed database as though RLS had been dropped. Proves:
     - no Onboarding tab in the rep's navigation
     - the CRM never even asks for the onboardings table (no poll for a rep)
     - no onboarding answer or business name reaches the rep's screen
     - the rep's lead is not touched by the apply-a-submit poll

   The database half (a rep's login reads zero rows) is VERIFY-RLS §14 and
   tests/onbrlsdb.mjs. Seen red: dropping the canOpen gate (the tab appears
   from the rep's own tab list). */
globalThis.__SETTINGS__=null; globalThis.__TXNS__=[]; globalThis.__PROPOSALS__=[];
globalThis.__USERS__=[{id:'u_rep',name:'Tony',email:'tony@getproytech.com',role:'rep',pools:[],commission_pct:25,appointment_rate:0,active:true,
  tabs:['leads','onboarding','proposals','dash'],goal_conversions:0,nav_order:[],onboarding:{}}];
globalThis.__WHOAMI__={id:'u_rep',name:'Tony',email:'tony@getproytech.com',role:'rep',pools:[],commission_pct:25,appointment_rate:0,active:true,
  tabs:['leads','onboarding','proposals','dash'],goal_conversions:0,nav_order:[],setup:true};
globalThis.__UID__='u_rep';
globalThis.__LEADS__=[{id:'R1',name:'Rep Lead',company:'Rep Co',stage:'won',isClient:true,ownerId:'u_rep',owner_id:'u_rep',activities:[],createdAt:'2026-09-01T12:00:00Z'}];
globalThis.__ONBOARDINGS__=[{id:'00000000-0000-4000-9000-000000000009',lead_id:'R1',status:'submitted',products:['website'],answers:{'biz.name':'SECRET-ONB-BUSINESS','biz.role':'SECRET-ANSWER'},
  sections:{},outputs:{websitePrompt:'SECRET-PROMPT'},submitted_at:'2026-10-05T12:00:00Z',applied_at:null,onboarding_files:[]}];
globalThis.fetch=async u=>String(u).includes('google-status')?{ok:true,json:async()=>({connected:false,email:''})}:{ok:false,status:500,json:async()=>({}),text:async()=>''};
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx','.json':'json'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/'+B_onbrep,out.outputFiles[0].text);
const mod=await import('./'+B_onbrep+'?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,250));});
let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+String(x).slice(0,300):''));}};
const txt=()=>document.body.textContent.replace(/\s+/g,' ');
const navs=[...document.querySelectorAll('.sb button, nav button')].map(b=>b.textContent.trim());
ok('the CRM rendered for the rep', document.body.textContent.length>100 && navs.length>0, navs.join('|'));
ok('no Onboarding tab, though their tab list names it', !navs.some(n=>/^Onboarding$/.test(n)), navs.join('|'));
ok('  and no Proposals tab either (the same gate)', !navs.some(n=>/^Proposals$/.test(n)));
ok('the onboardings table is never asked for', !globalThis.__ONB_LIST_CALLS__, String(globalThis.__ONB_LIST_CALLS__));
ok('nothing from an onboarding reaches the screen', !/SECRET-ONB-BUSINESS|SECRET-ANSWER|SECRET-PROMPT/.test(document.body.innerHTML));
ok('the rep\'s lead is not touched by the poll', !globalThis.__WRITES__.some(l=>l.id==='R1'&&(l.activities||[]).some(a=>/^onb-sub-/.test(a.id))));
root.unmount(); fs.unlinkSync('tests/'+B_onbrep);
console.log(`\nonboardingrep: ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
