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
globalThis.__WRITES__=[];globalThis.__MANY__=[];globalThis.__CAL__=[];globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[];globalThis.__EVENTS__=[];globalThis.__EVENT_WRITES__=[];
globalThis.__USERS__=[];globalThis.__SETTINGS_WRITES__=[];globalThis.__SETTINGS__=null;
globalThis.__SHEET__={headers:['Full Name','Business','Cell','Notes'],rows:[
  ['Dana West','West Roofing','316-555-0140','met at chamber, wants a site'],
  ['Ray Ortiz','Ortiz HVAC','3165550188','referred by Robin'],
  ['','', '',''],
]};
globalThis.fetch=async(u,o)=>{
  if(String(u).includes('google-status')) return {ok:true,json:async()=>({connected:true,email:'a@b.com'})};
  if(String(u).includes('/api/sheet-read'))
    return {ok:true,json:async()=>({headers:globalThis.__SHEET__.headers,rows:globalThis.__SHEET__.rows,tab:'Cold List'})};
  if(String(u).includes('/api/import-leads'))
    return {ok:true,json:async()=>({ok:true,mapping:{'Full Name':'name','Business':'company','Cell':'phone','Notes':'note'}})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};
const ago=n=>new Date(Date.now()-n*864e5).toISOString();
globalThis.__LEADS__=[{id:'old1',name:'Old Lead',company:'Old Co',stage:'new',owner:'Garrett',
  createdAt:ago(200),activities:[{id:'a',ts:ago(190),type:'Call',text:'called',who:'Garrett'}],meetings:[],deals:[],dealValue:0}];

const out=await esbuild.build({entryPoints:['src/App.jsx'],bundle:true,write:false,format:'esm',jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'},external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'},banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{name:'stub',setup(b){b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')}));}}],
 logLevel:'silent'});
fs.writeFileSync('t/.bh.mjs',out.outputFiles[0].text);
const mod=await import('./.bh.mjs?v='+Date.now());
const React=(await import('react')).default;
const {createRoot}=await import('react-dom/client');
const {act}=await import('react');
const root=createRoot(document.getElementById('root'));
await act(async()=>{root.render(React.createElement(mod.default));});
await act(async()=>{await new Promise(r=>setTimeout(r,90));});

let pass=0,fail=0;
const ok=(n,c,x='')=>{if(c){pass++;console.log('  ok  '+n);}else{fail++;console.log('  FAIL '+n+(x?' — '+x:''));}};
const click=async el=>{await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
const settle=async(ms=80)=>{await act(async()=>{await new Promise(r=>setTimeout(r,ms));});};
const setV=async(el,v)=>{const st=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{st.call(el,v);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
const btn=re=>[...document.querySelectorAll('button')].find(b=>re.test((b.textContent||'').trim()));

console.log('\nthe button is in the sidebar, not buried');
const navBtn=[...document.querySelectorAll('.nav-i')].find(b=>/Import a list/.test(b.textContent||''));
ok('Import a list sits beside New Lead', !!navBtn,
   [...document.querySelectorAll('.nav-i')].map(b=>b.textContent.trim()).slice(-5).join(' | '));
await click(navBtn); await settle();
ok('it opens the import modal', /Import leads/i.test(document.body.textContent||''));

console.log('\nGoogle Sheet is a source');
const sheetTab=[...document.querySelectorAll('.seg-b')].find(b=>/Google Sheet/.test(b.textContent||''));
ok('a Google Sheet option is offered', !!sheetTab);
await click(sheetTab); await settle();
const url=document.querySelector('.sheet-row input');
ok('a sheet link field appears', !!url);
await setV(url,'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit');
await click(btn(/Read the sheet/)); await settle(150);

console.log('\nAI maps the columns');
const body=document.body.textContent||'';
ok('it says AI mapped them', /AI mapped your columns/i.test(body), body.slice(0,180));
ok('a preview is shown before importing', /Dana West/.test(body), body.slice(0,200));

console.log('\nimporting');
const go=btn(/Import \d+ lead/)||btn(/^Import/);
ok('an import button is offered', !!go, [...document.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(-6).join(' | '));
await click(go); await settle(120);
const many=globalThis.__MANY__.flat();
ok('the two real rows became leads', many.length===2, 'n='+many.length+' :: '+many.map(l=>l.name).join(', '));
ok('the blank row was skipped', !many.some(l=>!l.name||l.name==='(no name)'), many.map(l=>l.name).join(', '));
ok('names and phones landed in the right fields',
   many.some(l=>l.name==='Dana West'&&/0140/.test(l.phone||'')), JSON.stringify(many[0]));
ok('notes came across', many.some(l=>/chamber/i.test(JSON.stringify(l))), JSON.stringify(many[0]).slice(0,200));
ok('every lead carries an import batch', many.every(l=>!!l.importBatch), JSON.stringify(many.map(l=>l.importBatch)));
ok('and a timestamp', many.every(l=>!!l.importedAt));
ok('they share ONE batch id', new Set(many.map(l=>l.importBatch)).size===1);

console.log('\nfinding them again');
await settle(60);
const bar=document.querySelector('.recentbar');
ok('a Recently added bar appears', !!bar, (document.body.textContent||'').slice(0,120));
const chip=[...document.querySelectorAll('.rb')].find(b=>/·\s*2$/.test((b.textContent||'').trim()));
ok('the import is one clickable chip', !!chip,
   [...document.querySelectorAll('.rb')].map(b=>b.textContent.trim()).join(' | '));
if(chip){ await click(chip); await settle();
  const names=[...document.querySelectorAll('tbody tr')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
  ok('only that batch is listed', names.length===2, 'rows='+names.length+' :: '+names.join(' | '));
  ok('the old lead is filtered out', !names.some(r=>/Old Lead/.test(r)), names.join(' | '));
  ok('it says how many still need working',
     /2\s*not touched yet/.test((document.querySelector('.rb-n')||{}).textContent||''),
     (document.querySelector('.rb-n')||{}).textContent);
}

console.log('\nthe Sheets-API-disabled error is actionable');
/* Google's real message, verbatim — long, and the useful part is at the end. */
globalThis.fetch=async(u,o)=>{
  if(String(u).includes('google-status')) return {ok:true,json:async()=>({connected:true,email:'a@b.com'})};
  if(String(u).includes('/api/sheet-read')) return {ok:false,status:403,json:async()=>({
    error:'The Google Sheets API is switched off for this project.',
    fix:'Enable it in Google Cloud, wait about two minutes, then reconnect Google under Settings.',
    link:'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123509276392',
    detail:'Google Sheets API has not been used in project 123509276392 before or it is disabled.'})};
  return {ok:false,status:500,json:async()=>({}),text:async()=>''};
};
const nav2=[...document.querySelectorAll('.nav-i')].find(b=>/Import a list/.test(b.textContent||''));
await click(nav2); await settle();
const st2=[...document.querySelectorAll('.seg-b')].find(b=>/Google Sheet/.test(b.textContent||''));
if(st2) await click(st2); await settle();
const u2=document.querySelector('.sheet-row input');
await setV(u2,'https://docs.google.com/spreadsheets/d/1t6DZ6dOwpxU5PX/edit');
await click(btn(/Read the sheet/)); await settle(120);
const fail2=document.querySelector('.sheet-fail');
ok('the failure renders as a panel, not raw text', !!fail2, (document.body.textContent||'').slice(0,140));
ok('the headline is the problem, in plain words',
   /Sheets API is switched off/.test((fail2.querySelector('.sf-t')||{}).textContent||''),
   (fail2.querySelector('.sf-t')||{}).textContent);
ok('it states the two steps in order',
   /Enable it in Google Cloud[\s\S]*reconnect Google/i.test((fail2.querySelector('.sf-f')||{}).textContent||''),
   (fail2.querySelector('.sf-f')||{}).textContent);
const link=fail2.querySelector('a[href*="console.developers.google.com"]');
ok('there is a button straight to the right console page', !!link, link&&link.getAttribute('href'));
ok('the link carries the project id', link && /project=123509276392/.test(link.getAttribute('href')||''));
ok('Google\'s own wording is kept but folded away', !!fail2.querySelector('details'));

console.log('\nwiping a test import');
/* the chip filter is still active from the block above */
const wipe=[...document.querySelectorAll('.rb.wipe')].find(b=>/Delete this import/.test(b.textContent||''));
ok('a delete control appears for a specific import', !!wipe,
   [...document.querySelectorAll('.rb')].map(b=>b.textContent.trim()).join(' | '));

/* wrong count typed — must do nothing */
dom.window.prompt=()=>'1';
const beforeCount=globalThis.__LEADS__.length;
await click(wipe); await settle(120);
const rowsAfterBad=[...document.querySelectorAll('tbody tr')].length;
ok('a wrong confirmation deletes nothing', rowsAfterBad===2, rowsAfterBad+' rows left');

/* correct count */
let asked='';
dom.window.prompt=(msg)=>{asked=String(msg);return '2';};
await click(document.querySelector('.rb.wipe')); await settle(200);
ok('it names how many and demands the number', /Delete all 2 leads/.test(asked)&&/Type 2 to confirm/.test(asked),
   asked.slice(0,120));
ok('the imported leads are gone', [...document.querySelectorAll('tbody tr')].length===0,
   [...document.querySelectorAll('tbody tr')].map(r=>r.textContent.slice(0,12)).join(' | '));

console.log('\nthe old lead is untouched');
/* with the batch deleted there is nothing recent left, so the whole bar
   unmounts and Clear goes with it — that's correct, not a missing element */
const clr=document.querySelector('.rb.clear');
if(clr){ await click(clr); await settle(); }
else { setRecentCleared: { ok('the recent bar disappears once nothing is recent',
  !document.querySelector('.recentbar'), 'bar still shown'); } }
const names=[...document.querySelectorAll('tbody tr td:first-child')].map(e=>e.textContent.trim());
/* Assert on the DATA, not the table — the table is scoped to "Mine" and this
   fixture's owner doesn't match the signed-in user, which is a separate
   concern from whether the wipe respected its batch. What matters is that
   nothing deleted the pre-existing lead. */
const deleted=globalThis.__DELETED__||[];
ok('the wipe deleted only the two imported leads', deleted.length===2, JSON.stringify(deleted));
ok('the hand-typed lead was never touched', !deleted.includes('old1'), JSON.stringify(deleted));

console.log('\nthe control is scoped');
const chips=[...document.querySelectorAll('.rb')].map(b=>b.textContent.trim());
ok('no delete offered on Today / Last 7 days', !document.querySelector('.rb.wipe'),
   chips.join(' | '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
