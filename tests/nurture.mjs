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
globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5}};
globalThis.fetch=async u=>String(u).includes('google-status')
  ?{ok:true,json:async()=>({connected:false,email:''})}
  :{ok:false,status:500,json:async()=>({}),text:async()=>''};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
const pad=n=>String(n).padStart(2,'0');
const day=n=>{const d=new Date(Date.now()+n*864e5);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
globalThis.__LEADS__=[
  {id:'c1',name:'Cold Call Co',company:'Cold Call Co',stage:'new',owner:'Garrett',priority:'medium',
   createdAt:ago(10),activities:[],meetings:[],deals:[],dealValue:3000},
  /* a fresh lead for the one-tap test — c1 gets parked earlier in this suite,
     and the button correctly hides on an already-parked lead */
  {id:'c3',name:'Fresh Call Co',company:'Fresh Call Co',stage:'new',owner:'Garrett',priority:'medium',
   createdAt:ago(2),activities:[],meetings:[],deals:[],dealValue:1500},
  /* already nurtured, revisit date in the past — must show as a follow-up */
  {id:'c2',name:'Parked Co',company:'Parked Co',stage:'nurture',owner:'Garrett',priority:'low',
   createdAt:ago(60),followUp:day(-4),activities:[],meetings:[],deals:[],dealValue:2000},
];
const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('tests/.bg.mjs',out.outputFiles[0].text);
const mod=await import('./.bg.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=70)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const nav=async l=>{const b=[...document.querySelectorAll('.nav-i')].find(e=>(e.textContent||'').trim()===l);
  if(b) await click(b); await settle();};
const openLead=async name=>{ await nav('Leads');
  const r=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&new RegExp(name).test(e.textContent||'')).pop();
  if(r) await click(r); await settle(); };
const kpi=lab=>{const k=[...document.querySelectorAll('.kpi')].find(e=>
  ((e.querySelector('.kl')||{}).textContent||'').trim().toLowerCase()===lab.toLowerCase());
  return k?{v:((k.querySelector('.kv')||{}).textContent||'').trim(),d:((k.querySelector('.kd')||{}).textContent||'').trim()}:null;};
const W=id=>globalThis.__WRITES__.filter(w=>w.id===id).at(-1);

console.log('\nstage and priority are on the fact strip');
await openLead('Cold Call Co');
const sels=[...document.querySelectorAll('.m-facts .mf-sel')];
ok('two pickers are in the header', sels.length===2,
   [...document.querySelectorAll('.m-facts .mf i')].map(e=>e.textContent).join(' | '));
ok('one of them is Stage', sels.some(e=>/Stage/.test(e.textContent||'')));
ok('one of them is Priority', sels.some(e=>/Priority/.test(e.textContent||'')));
const stageSel=sels.find(e=>/Stage/.test(e.textContent||'')).querySelector('select');
ok('"Not right now" is an option', [...stageSel.options].some(o=>/Not right now/.test(o.textContent)),
   [...stageSel.options].map(o=>o.textContent).join(' | '));

console.log('\nparking a cold call asks when to come back');
let asked='';
dom.window.prompt=(m,def)=>{asked=String(m);return day(90);};
await act(async()=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set;
  st.call(stageSel,'nurture'); stageSel.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
await settle();
ok('it asks for a revisit date', /come back to you/.test(asked), asked.slice(0,80));
const w=W('c1');
ok('stage moved to nurture', w && w.stage==='nurture', w&&w.stage);
ok('the revisit date was saved', w && w.followUp===day(90), w&&w.followUp);
ok('and a next action was set', w && /not right now/i.test(w.nextAction||''), w&&w.nextAction);

console.log('\nit leaves the pipeline without being counted as lost');
await nav('Dashboard');
const pipe=kpi('Open Pipeline');
ok('their $3,000 is out of open pipeline', pipe && !/\$5,000|\$3,000/.test(pipe.v), pipe&&pipe.v);
const wr=[...document.querySelectorAll('.an-card')].find(e=>/Win Rate/.test(e.textContent||''));
ok('win rate is untouched — they never refused', wr && !/0%/.test((wr.querySelector('.an-v')||{}).textContent||''),
   wr&&(wr.querySelector('.an-v')||{}).textContent);

console.log('\nbut the revisit date still surfaces them');
const fu=kpi('Follow-Up Health');
ok('an overdue nurtured lead counts as a follow-up', fu && /overdue/.test(fu.d), fu&&fu.d);
await nav('Follow-Up');
ok('and it is listed on the follow-up page', /Parked Co/.test(document.body.textContent||''),
   (document.body.textContent||'').slice(0,160));

console.log('\nmobile layout rules exist');
const css=[...document.querySelectorAll('style')].map(e=>e.textContent||'').join('');
ok('the modal header stacks on a phone', /\.m-head\{flex-direction:column/.test(css));
ok('the fact strip is not capped narrower than the screen', /\.m-facts\{max-width:100%/.test(css));
ok('nothing inside can exceed the screen', /\.modal,\.m-head,\.m-grid,\.m-left,\.m-right\{max-width:100%/.test(css));

console.log('\none-tap Not right now');
await openLead('Fresh Call Co');
const btn=document.querySelector('.notnow');
ok('the button sits by the activity log', !!btn, (document.querySelector('.m-right')||{}).textContent?.slice(0,80));
ok('it says what it will do', btn && /revisit/.test(btn.textContent||''), btn&&btn.textContent);
let prompted=false; dom.window.prompt=()=>{prompted=true;return null;};
const pad2=n=>String(n).padStart(2,'0');
const in45=(()=>{const d=new Date();d.setDate(d.getDate()+45);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;})();
await click(btn); await settle();
ok('one tap — it does NOT prompt', !prompted);
const nw=W('c3');
ok('stage parked', nw && nw.stage==='nurture', nw&&nw.stage);
ok('revisit set 45 days out', nw && nw.followUp===in45, (nw&&nw.followUp)+' vs '+in45);
ok('the call was logged', nw && (nw.activities||[]).some(a=>a.type==='Call'&&/Not interested right now/.test(a.text||'')),
   JSON.stringify((nw&&nw.activities||[]).map(a=>a.type+':'+a.text).slice(0,2)));
ok('a next action was set', nw && /not right now/i.test(nw.nextAction||''), nw&&nw.nextAction);
ok('all of it landed in ONE write, not three',
   nw && nw.stage==='nurture' && !!nw.followUp && (nw.activities||[]).length>0,
   'stage='+(nw&&nw.stage)+' fu='+(nw&&nw.followUp)+' acts='+((nw&&nw.activities)||[]).length);
ok('the button is gone once parked', !document.querySelector('.notnow'));

console.log('\nan install with SAVED stages gets the new one backfilled');
/* settings.stages overrides DEFAULT_STAGES entirely, so without a backfill the
   new stage ships invisible for anyone who has ever edited their pipeline. */
globalThis.__SETTINGS__={goals:{revenue:10000,closed:5},stages:[
  {key:'new',label:'New Lead',color:'#6B73C9',prob:.1,open:true,won:false,lost:false},
  {key:'signed',label:'Signed',color:'#2b965e',prob:1,open:false,won:true,lost:false},
  {key:'lost',label:'Lost',color:'#B0606A',prob:0,open:false,won:false,lost:true}]};
globalThis.__SETTINGS_WRITES__=[];
await act(async()=>{root.unmount();});
document.getElementById('root').innerHTML='';
const root2=createRoot(document.getElementById('root'));
await act(async()=>{root2.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,900));});
const sw=(globalThis.__SETTINGS_WRITES__||[]).find(x=>Array.isArray(x.stages)&&x.stages.some(y=>y.key==='nurture'));
ok('the nurture stage was backfilled', !!sw,
   JSON.stringify((globalThis.__SETTINGS_WRITES__||[]).map(x=>(x.stages||[]).map(y=>y.key))));
ok('it sits before Lost, not after', sw && sw.stages.findIndex(x=>x.key==='nurture')<sw.stages.findIndex(x=>x.lost),
   sw&&sw.stages.map(x=>x.key).join(' > '));
ok('the existing stages are untouched', sw && sw.stages.filter(x=>x.key!=='nurture').length===3,
   sw&&sw.stages.map(x=>x.key).join(' > '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
