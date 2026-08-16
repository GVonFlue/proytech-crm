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
globalThis.__WRITES__=[]; globalThis.__CAL__=[]; globalThis.__TASKS__=[]; globalThis.__USER_WRITES__=[];
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
globalThis.__LEADS__=[];
/* an owner row that already has a saved order with one key out of place, plus a
   stale key and a missing one — the repair path */
globalThis.__USERS__=[{id:'u_owner',name:'Garrett',email:'garrett@getproytech.com',role:'owner',
  pools:[],commission_pct:0,active:true,tabs:[],goal_conversions:0,
  nav_order:['tasks','dash','gone_tab']}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.b9.mjs',out.outputFiles[0].text);
const mod=await import('./.b9.mjs?v='+Date.now());
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
const navTexts=()=>[...document.querySelectorAll('aside .nav-i')].map(e=>(e.textContent||'').trim());
/* "Import a list" is an ACTION in the pinned block, not a reorderable tab —
   same as New Lead. It must never appear in the drag list. */
const tabs=()=>navTexts().filter(t=>!/^(New Lead|Import a list|My account|Sign out|Reorder tabs|Done|Reset to default)/.test(t));
const btn=re=>[...document.querySelectorAll('aside .nav-i')].find(b=>re.test((b.textContent||'').trim()));

console.log('\nsaved order is honoured and repaired');
const t0=tabs();
ok('the saved keys lead', t0[0]==='Tasks'&&t0[1]==='Dashboard', t0.slice(0,3).join(' | '));
ok('a stale key is dropped', !t0.some(t=>/gone_tab/.test(t)), t0.join(' | '));
ok('every real tab still appears', t0.includes('Settings')&&t0.includes('Pipeline')&&t0.includes('Leads'),
   t0.length+' tabs');

console.log('\nnormal mode still navigates');
const leadsBtn=btn(/^Leads$/);
await click(leadsBtn); await settle();
ok('clicking a tab still changes page', /Every contact, every conversation/i.test(document.body.textContent||''));

console.log('\nreorder mode');
const reorder=btn(/^Reorder tabs$/);
ok('a Reorder tabs control exists', !!reorder);
await click(reorder); await settle();
ok('rows become draggable handles', document.querySelectorAll('.nav-i.nav-edit').length===tabs().length,
   document.querySelectorAll('.nav-i.nav-edit').length+' vs '+tabs().length);
ok('a reset control appears', !!btn(/Reset to default/));
ok('the toggle now reads Done', !!btn(/^Done$/));

console.log('\nmove one');
const rowFor=name=>[...document.querySelectorAll('.nav-i.nav-edit')]
  .find(r=>((r.querySelector('.nav-l')||{}).textContent||'').trim()===name);
const down=rowFor('Tasks').querySelectorAll('.nav-mv button')[1];
await click(down); await settle();
const t1=tabs();
ok('it moved down one', t1[0]==='Dashboard'&&t1[1]==='Tasks', t1.slice(0,3).join(' | '));
const w=globalThis.__USER_WRITES__.at(-1);
ok('it saved to the USER row, not settings', w && w.id==='u_owner' && Array.isArray(w.nav_order),
   JSON.stringify(w&&{id:w.id,n:w.nav_order&&w.nav_order.slice(0,3)}));
ok('the saved order matches the screen', w && w.nav_order[0]==='dash' && w.nav_order[1]==='tasks',
   JSON.stringify(w&&w.nav_order.slice(0,3)));
ok('the stale key is not written back', w && !w.nav_order.includes('gone_tab'));
ok('the full order is persisted, not just the moved part', w && w.nav_order.length>=14, 'len='+(w&&w.nav_order.length));

console.log('\nup is disabled at the top');
const topRow=[...document.querySelectorAll('.nav-i.nav-edit')][0];
ok('first row cannot move up', topRow.querySelectorAll('.nav-mv button')[0].disabled);
const lastRow=[...document.querySelectorAll('.nav-i.nav-edit')].pop();
ok('last row cannot move down', lastRow.querySelectorAll('.nav-mv button')[1].disabled);

console.log('\ndone and reset');
await click(btn(/^Done$/)); await settle();
ok('handles gone', document.querySelectorAll('.nav-i.nav-edit').length===0);
ok('the new order held', tabs()[0]==='Dashboard'&&tabs()[1]==='Tasks', tabs().slice(0,3).join(' | '));
await click(btn(/^Reorder tabs$/)); await settle();
await click(btn(/Reset to default/)); await settle();
const w2=globalThis.__USER_WRITES__.at(-1);
ok('reset writes the default order', w2 && w2.nav_order[0]==='dash' && w2.nav_order[1]==='board',
   JSON.stringify(w2&&w2.nav_order.slice(0,3)));

console.log('\nit degrades if the column was never added');
globalThis.__USER_SAVE_FAILS__=true;
const before=tabs().slice(0,2).join('|');
/* the reset above left us in edit mode, so the toggle reads Done, not Reorder */
if(btn(/^Reorder tabs$/)){ await click(btn(/^Reorder tabs$/)); await settle(); }
ok('still in reorder mode', document.querySelectorAll('.nav-i.nav-edit').length>0);
const d2=rowFor('Dashboard');
if(d2){ await click(d2.querySelectorAll('.nav-mv button')[1]); await settle(); }
ok('the order still changes on screen when the save fails', tabs().slice(0,2).join('|')!==before,
   before+' -> '+tabs().slice(0,2).join('|'));
ok('and nothing threw', true);

console.log('\nthe sidebar scrolls, the actions stay put');
{
  const scroller=document.querySelector('aside .sb-scroll');
  const fixed=document.querySelector('aside .sb-fixed');
  ok('the tab list has its own scroll container', !!scroller);
  ok('the action buttons sit outside it', !!fixed);
  ok('every tab lives inside the scroller',
     [...document.querySelectorAll('aside .nav-i')].filter(b=>/^(Dashboard|Leads|Pipeline|Settings)$/.test((b.textContent||'').trim()))
       .every(b=>scroller&&scroller.contains(b)));
  const signout=[...document.querySelectorAll('aside .nav-i')].find(b=>/^Sign out/.test((b.textContent||'').trim()));
  ok('Sign out is present', !!signout);
  ok('Sign out is NOT in the scroller — it can never scroll away',
     signout && scroller && !scroller.contains(signout));
  ok('and it is in the pinned block', signout && fixed && fixed.contains(signout));
  const acct=[...document.querySelectorAll('aside .nav-i')].find(b=>/My account/.test(b.textContent||''));
  const nl=[...document.querySelectorAll('aside .nav-i')].find(b=>/New Lead/.test(b.textContent||''));
  ok('My account and New Lead are pinned too', acct&&nl&&fixed.contains(acct)&&fixed.contains(nl));
  const imp=[...document.querySelectorAll('aside .nav-i')].find(b=>/Import a list/.test(b.textContent||''));
  ok('Import a list is pinned beside New Lead', imp && fixed.contains(imp));
  ok('and it is not a draggable tab', imp && !scroller.contains(imp));
  ok('the tagline footer moved with them', !!(fixed&&fixed.querySelector('.sb-foot')));
  /* the CSS rule that actually makes it work — a flex child won't shrink below
     its content without min-height:0, and the list would overflow instead */
  const css=[...document.querySelectorAll('style')].map(e=>e.textContent||'').join('');
  ok('the scroller can actually shrink (min-height:0)', /\.sb-scroll\{[^}]*min-height:0/.test(css),
     (css.match(/\.sb-scroll\{[^}]*\}/)||[''])[0].slice(0,120));
  ok('and it scrolls on the Y axis', /\.sb-scroll\{[^}]*overflow-y:auto/.test(css));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
