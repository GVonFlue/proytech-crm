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
globalThis.__LEADS__=[];

const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const task=(id,title,due,done)=>({id,title,owner:'Garrett',due:due===undefined?'':due,done:!!done,
  revenue:3,urgency:3,effort:3,createdAt:new Date(Date.now()-864e5).toISOString()});
globalThis.__TASKS__=[
  task('t1','Overdue by three days', day(-3)),
  task('t2','Overdue by one day',    day(-1)),
  task('t3','Due today',             day(0)),
  task('t4','Due tomorrow',          day(1)),
  task('t5','Due next week',         day(7)),
  task('t6','No date at all',        ''),
  task('t7','Another undated one',   ''),
  task('t8','Done and dusted',       day(0), true),
];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.b5.mjs',out.outputFiles[0].text);
const mod=await import('./.b5.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,80));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i, nav button, aside button, a')]
  .find(e=>(e.textContent||'').trim()===l); if(b) await click(b); await act(async()=>{await new Promise(r=>setTimeout(r,50));});};
const titles=()=>[...document.querySelectorAll('.card span')].map(e=>(e.textContent||'').trim())
  .filter(t=>/Overdue by|Due today|Due tomorrow|Due next week|No date at all|Another undated|Done and dusted/.test(t));
const segBtn=label=>[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim().startsWith(label));

await nav('Tasks');
console.log('\nthe control');
const today=segBtn('Today'), later=segBtn('Upcoming'), none=segBtn('No date');
ok('Today / Upcoming / No date chips exist', !!today&&!!later&&!!none);
ok('Today counts 3 (2 overdue + 1 due today, open only)',
   /Today\s*3(?!\d)/.test((today&&today.textContent||'').replace(/\s+/g,' ')), (today&&today.textContent||'').trim());
ok('Upcoming counts 2', /Upcoming\s*2(?!\d)/.test((later&&later.textContent||'').replace(/\s+/g,' ')), (later&&later.textContent||'').trim());
ok('No date counts 2', /No date\s*2(?!\d)/.test((none&&none.textContent||'').replace(/\s+/g,' ')), (none&&none.textContent||'').trim());

console.log('\nAll (default) is unchanged');
ok('shows all 7 open tasks', titles().length===7, 'n='+titles().length+' :: '+titles().join(' | '));

console.log('\nToday');
await click(today);
const tt=titles();
ok('shows exactly 3', tt.length===3, tt.join(' | '));
ok('future work is excluded', !tt.some(t=>/tomorrow|next week/i.test(t)), tt.join(' | '));
ok('undated work is excluded', !tt.some(t=>/undated|No date at all/i.test(t)), tt.join(' | '));
ok('overdue is included, not hidden', tt.filter(t=>/Overdue/.test(t)).length===2, tt.join(' | '));
ok('oldest overdue is first', /three days/.test(tt[0]||''), tt.join(' | '));
ok('a banner calls out the overdue count', /2 of these were due before today/.test(document.body.textContent||''));

console.log('\nUpcoming and No date');
await click(segBtn('Upcoming'));
const up=titles();
ok('Upcoming shows only future', up.length===2&&up.every(t=>/tomorrow|next week/i.test(t)), up.join(' | '));
ok('soonest first', /tomorrow/i.test(up[0]||''), up.join(' | '));
await click(segBtn('No date'));
const nd=titles();
ok('No date shows only undated', nd.length===2&&nd.every(t=>/undated|No date at all/i.test(t)), nd.join(' | '));

console.log('\nit combines with Done, it does not replace it');
await click(segBtn('Today'));
const doneBtn=[...document.querySelectorAll('.seg-b')].find(b=>(b.textContent||'').trim()==='Done');
if(doneBtn){ await click(doneBtn);
  const dn=titles();
  ok('Today + Done shows the completed one only', dn.length===1&&/Done and dusted/.test(dn[0]), dn.join(' | ')); }

console.log('\nliteral escape sequences are gone');
const body=document.body.textContent||'';
ok('no raw \\u00b7 on screen', !body.includes('\\u00b7'), body.match(/.{0,25}\\u00b7.{0,10}/)?.[0]||'');
ok('no raw \\u2026 on screen', !body.includes('\\u2026'));
ok('the middot actually renders', body.includes('Impact 3 \u00b7 Urgency 3'), 'not found');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
