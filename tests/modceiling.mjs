/* ============================================================================
   modceiling.mjs — settings.modules may narrow the ceiling, never widen it.

   THE BUG THIS PINS IS COMMERCIAL, NOT TECHNICAL.

   modList used to be a FALLBACK chain: settings.modules was checked first and
   returned whole, so the row an install's own admin can WRITE did not narrow
   the deployment's VITE_MODULES — it replaced it. A Solo install could open
   Settings, tick a module belonging to a tier they had not bought, and have it.
   Not circumvention: a button.

   The four cases below are the whole contract. Case 3 is the one that used to
   fail; the other three are what must not regress while fixing it — in
   particular case 1, because an unset ceiling must leave EVERYTHING on rather
   than brick an install that never had tiers.

   Each case needs its own bundle when the ceiling changes, because BRAND.modules
   is read from import.meta.env at module load and cannot be changed afterwards.
   ========================================================================== */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};

/* Boot the app with a given VITE_MODULES ceiling and a given saved settings row,
   and return the module tabs the sidebar actually rendered. */
async function tabsFor(viteModules, settingsModules, tag){
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
    {url:'https://crm.test/',pretendToBeVisual:true});
  for(const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
   'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']){
   try{Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true});}catch{} }
  globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  dom.window.matchMedia=globalThis.matchMedia;
  globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  dom.window.ResizeObserver=globalThis.ResizeObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.__WRITES__=[]; globalThis.__CAL__=[]; globalThis.__TASKS__=[]; globalThis.__USER_WRITES__=[];
  globalThis.__SETTINGS_WRITES__=[];
  globalThis.fetch=async()=>({ok:false,status:500,json:async()=>({}),text:async()=>''});
  globalThis.__LEADS__=[];
  globalThis.__USERS__=[{id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',
    pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,nav_order:[]}];

  /* modulesV is parked past every backfill on purpose. The backfills ADD keys to
     settings.modules on load; letting one run here would silently rewrite the
     very row the case is about. */
  globalThis.__SETTINGS__ = settingsModules
    ? { modulesV: 99, modules: settingsModules }
    : { modulesV: 99 };

  const env = { MODE:'test', DEV:false, PROD:true };
  if (viteModules != null) env.VITE_MODULES = viteModules;

  const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
   loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
   define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__='+JSON.stringify(env)+';'},
   plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
   logLevel:'silent'});
  const f='tests/.mc-'+tag+'.mjs';
  fs.writeFileSync(f,out.outputFiles[0].text);
  const mod=await import('./'+path.basename(f)+'?v='+Date.now());
  const React=(await import('react')).default;
  const {createRoot}=await import('react-dom/client');
  const {act}=await import('react');
  const root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(mod.default));});
  await act(async()=>{await new Promise(r=>setTimeout(r,120));});
  const texts=[...document.querySelectorAll('aside .nav-i')].map(e=>(e.textContent||'').trim())
    .filter(t=>!/^(New Lead|Import a list|My account|Sign out|Reorder tabs|Done|Reset to default)/.test(t));
  await act(async()=>{root.unmount();});
  fs.unlinkSync(f);
  return texts;
}

console.log('\n1. no ceiling, no saved list — everything is on');
/* The default that must never regress. An unset entitlement is not a tier of
   zero; it is an install that never had tiers, and bricking it would be the
   opposite of what the operator meant by leaving the variable alone. */
const t1 = await tabsFor(null, null, 'a');
ok('Money is on',  t1.includes('Money'),  t1.join(' | '));
ok('Events is on', t1.includes('Events'), t1.join(' | '));
ok('Leads is on',  t1.includes('Leads'),  t1.join(' | '));
ok('Dashboard and Settings are always on', t1.includes('Dashboard')&&t1.includes('Settings'), t1.join(' | '));

console.log('\n2. no ceiling, a saved list — the client may still narrow');
const t2 = await tabsFor(null, ['leads'], 'b');
ok('Leads survives',    t2.includes('Leads'), t2.join(' | '));
ok('Money is off',     !t2.includes('Money'), t2.join(' | '));
ok('Settings is still reachable', t2.includes('Settings'), t2.join(' | '));

console.log('\n3. a ceiling, and a saved list that reaches ABOVE it');
/* THE REGRESSION. settings.modules asks for money; the ceiling never sold it.
   Before the intersection this returned the saved list whole and the tab
   appeared. */
const t3 = await tabsFor('leads,clients', ['leads','clients','money'], 'c');
ok('Leads is on',   t3.includes('Leads'),   t3.join(' | '));
ok('Clients is on', t3.includes('Clients'), t3.join(' | '));
ok('Money stays OFF — the saved row cannot widen the ceiling',
   !t3.includes('Money'), t3.join(' | '));

console.log('\n4. a ceiling, no saved list — the ceiling is what you get');
const t4 = await tabsFor('leads,clients', null, 'd');
ok('Leads is on',   t4.includes('Leads'),   t4.join(' | '));
ok('Clients is on', t4.includes('Clients'), t4.join(' | '));
ok('Money is off',  !t4.includes('Money'),  t4.join(' | '));
ok('Events is off', !t4.includes('Events'), t4.join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
