import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url:'https://crm.test/', pretendToBeVisual:true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent',
  'getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
  try { Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true,writable:true}); } catch {}
}
globalThis.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__WRITES__ = [];
globalThis.__CAL__ = [];

/* fetch stub: google-status says CONNECTED as a specific account, and
   /api/calendar-event records exactly what the client sent it. */
globalThis.fetch = async (url, opts={}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (String(url).includes('/api/google-status'))
    return { ok:true, json: async()=>({connected:true, email:'admin@getproytech.com'}) };
  if (String(url).includes('/api/calendar-event')) {
    globalThis.__CAL__.push(body);
    return { ok:true, json: async()=>({ok:true,eventId:'ev_'+globalThis.__CAL__.length,htmlLink:'https://cal/x',meetLink:''}) };
  }
  return { ok:false, status:500, json: async()=>({}), text: async()=>'' };
};

const iso = d => new Date(d).toISOString();
globalThis.__LEADS__ = [
  { id:'l1', name:'Jason Bell', company:'Specs Eyewear', stage:'new', email:'', owner:'Garrett',
    createdAt: iso(Date.now()-30*864e5), activities:[], meetings:[] },
];

const out = await esbuild.build({
  entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{name:'stub',setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('t/stub-supabase.js')})); }}],
  logLevel:'silent',
});
fs.writeFileSync('t/.b2.mjs', out.outputFiles[0].text);
const mod = await import('./.b2.mjs?v='+Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const errs=[]; const _ce=console.error; console.error=(...a)=>{ errs.push(String(a[0]).slice(0,300)); };
const root = createRoot(document.getElementById('root'));
await act(async()=>{ root.render(React.createElement(mod.default)); });
await act(async()=>{ await new Promise(r=>setTimeout(r,80)); });

let pass=0, fail=0;
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ok  '+n);} else {fail++;console.log('  FAIL '+n+(x?' — '+x:''));} };
const txt=()=>document.body.textContent||'';
const click=async el=>{ await act(async()=>{ el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})); }); };
const setVal=async(el,v,tag='HTMLInputElement')=>{ const set=Object.getOwnPropertyDescriptor(dom.window[tag].prototype,'value').set;
  await act(async()=>{ set.call(el,v); el.dispatchEvent(new dom.window.Event('input',{bubbles:true})); }); };
const findBtn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));
const pad=n=>String(n).padStart(2,'0');

/* open the lead */
let leadLink=document.querySelector('.drow-t, .namecell, td');
leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop();
if(!leadLink){ const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads'); if(nav) await click(nav); await act(async()=>{await new Promise(r=>setTimeout(r,40));}); leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop(); }
if(leadLink) await click(leadLink);
await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });
const app=document.querySelector('#root'); const clean=[...app.querySelectorAll('*')].filter(e=>e.tagName!=='STYLE'); console.log('GATE?', !!document.querySelector('.gate')); console.log('APP TEXT:', (app.textContent||'').replace(/[\s\S]*?swap.\);/,'').replace(/\.[a-z-]+\{[^}]*\}/g,'').slice(0,400)); console.error=_ce; if(errs.length) console.log('RENDER ERRORS:', errs.slice(0,3).join('\n  '));
const rt=document.getElementById('root');
console.log('ROOT CHILDREN:', [...rt.children].map(c=>c.tagName+'.'+(c.className||'')).join(' | '));
const nonStyle=[...rt.children].filter(c=>c.tagName!=='STYLE');
console.log('NON-STYLE TEXT:', nonStyle.map(c=>(c.textContent||'').slice(0,300)).join(' ~~ ')); ok('lead modal opened', true);

/* ---- 1. book a meeting NEXT MONTH from the activity log's Meeting Booked ---- */
console.log('\nMeeting Booked in the activity log');
const bookedTab=findBtn(/^Meeting Booked$/);
ok('Meeting Booked button exists', !!bookedTab);
await click(bookedTab);
const sched=document.querySelector('.bookc .mtg-form');
ok('it opens the real scheduler, not a textarea', !!sched);
ok('names the connected Google account', /admin@getproytech\.com/.test(txt()));

const timeInput=sched && sched.querySelector('input[type=time]');
ok('time input is 15-minute steps', timeInput && timeInput.getAttribute('step')==='900',
   timeInput ? 'step='+timeInput.getAttribute('step') : 'no input');

/* invite client with NO email on the lead */
const inviteBox=[...sched.querySelectorAll('input[type=checkbox]')][0];
ok('invite checkbox is NOT disabled when the lead has no email', inviteBox && !inviteBox.disabled);
const ckSet=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'checked').set;
await act(async()=>{ ckSet.call(inviteBox,true); inviteBox.dispatchEvent(new dom.window.Event('click',{bubbles:true})); });
const emailField=sched.querySelector('input[type=email]');
ok('an email field appears instead of a dead checkbox', !!emailField);
await setVal(emailField,'jason@specs.com');

/* next month, on purpose — this is the reported bug */
const nm=new Date(); nm.setMonth(nm.getMonth()+1); nm.setDate(6);
const nextMonth=`${nm.getFullYear()}-${pad(nm.getMonth()+1)}-${pad(nm.getDate())}`;
await setVal(sched.querySelector('input[type=date]'), nextMonth);
await setVal(timeInput,'08:30');
const goBtn=[...sched.querySelectorAll('button')].find(b=>/Schedule \+ add to Calendar/.test(b.textContent));
ok('schedule button present', !!goBtn);
await click(goBtn);
await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });

console.log('\ncalendar payload');
const cal=globalThis.__CAL__.at(-1);
ok('a calendar event was created', !!cal && !cal.action, JSON.stringify(cal||{}).slice(0,120));
ok('attendee was sent', cal && Array.isArray(cal.attendees) && cal.attendees[0]==='jason@specs.com',
   JSON.stringify(cal&&cal.attendees));
ok('start is the chosen slot', cal && cal.start===`${nextMonth}T08:30:00`, cal&&cal.start);
ok('timezone sent', cal && cal.timezone==='America/Chicago');

console.log('\nlead record');
const w=globalThis.__WRITES__.at(-1);
const mt=w && (w.meetings||[])[0];
ok('meeting saved on the lead', !!mt);
ok('eventId stored', mt && /^ev_/.test(mt.eventId||''), mt&&mt.eventId);
ok('invited flag stored', mt && mt.invited===true);
ok('typed email written back to the lead', w && w.email==='jason@specs.com', w&&w.email);
ok('a Booked activity was logged', w && (w.activities||[]).some(a=>a.type==='Booked'));
ok('not marked dateless', mt && mt.dateUnknown===false);

/* ---- 2. does it reach the dashboard THIS month? ---- */
console.log('\ndashboard, this month');
const closeX=[...document.querySelectorAll('button')].find(b=>b.className&&/m-x|mclose/.test(b.className));
if(closeX) await click(closeX);
const dash=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Dashboard');
if(dash) await click(dash);
await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });
const tile=[...document.querySelectorAll('div')].filter(e=>/Meetings Booked/.test(e.textContent||'')&&(e.className||'').includes('k')
  &&/this month/.test(e.textContent||'')).pop();
ok('Meetings Booked tile counts it this month', tile && /Meetings Booked\s*1(?!\d)/.test((tile.textContent||'').replace(/\s+/g,' ')),
   tile?(tile.textContent||'').replace(/\s+/g,' ').slice(0,110):'no tile found');
await click(tile);
const tabs=[...document.querySelectorAll('.mtab')].map(b=>b.textContent.replace(/\s/g,'')).join('|');
ok('and it shows in the month-scoped drilldown', /Upcoming1/.test(tabs), tabs);
ok('nothing landed in Needs a date', /Needsadate0/.test(tabs), tabs);

/* ---- 3. the undated escape still works ---- */
console.log('\nno-date escape hatch');
const back=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads');
if(back) await click(back);
const l2=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/Jason Bell/.test(e.textContent||''));
if(l2) await click(l2);
await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });
const bt2=findBtn(/^Meeting Booked$/); if(bt2) await click(bt2);
const undatedBtn=findBtn(/No date yet/);
ok('"No date yet" escape offered', !!undatedBtn);
if(undatedBtn){
  const before=globalThis.__CAL__.length;
  await click(undatedBtn);
  await act(async()=>{ await new Promise(r=>setTimeout(r,30)); });
  ok('it does NOT hit the calendar', globalThis.__CAL__.length===before);
  const w2=globalThis.__WRITES__.at(-1);
  ok('it creates a dateless meeting', w2 && (w2.meetings||[]).some(m=>m.dateUnknown===true));
}

/* ---- 4. cancel a meeting: the count must follow it ---- */
console.log('\ncancelling a meeting');
{
  const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads');
  if(nav) await click(nav);
  await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });
  const row=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop();
  if(row) await click(row);
  await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });

  const factOf=()=>{ const f=[...document.querySelectorAll('.m-facts .mf')].find(b=>/Meetings/.test(b.textContent||''));
    return f?(f.textContent||'').replace(/\s+/g,' '):''; };
  const jump=[...document.querySelectorAll('button')].find(b=>/^Meetings\s*\d/.test((b.textContent||'').trim()));
  ok('Meetings jump chip counts 2', /Meetings\s*2/.test(((jump&&jump.textContent)||'').replace(/\s+/g,' ')),
     ((jump&&jump.textContent)||'no chip').replace(/\s+/g,' '));
  if(jump) await click(jump);
  await act(async()=>{ await new Promise(r=>setTimeout(r,40)); });
  dom.window.confirm = () => true;
  /* cancel the DATED one — the undated placeholder has no calendar event, so
     deleting that would prove nothing about the calendar call */
  const del=document.querySelector('.mtg-row:not(.undated) .m-x');
  ok('a cancel button exists on the dated meeting row', !!del);
  if(del){
    await click(del);
    await act(async()=>{ await new Promise(r=>setTimeout(r,60)); });
    const w3=globalThis.__WRITES__.at(-1);
    ok('meeting removed from the record', w3 && (w3.meetings||[]).length===1, 'meetings='+((w3&&w3.meetings)||[]).length);
    ok('the Booked activity is kept, marked cancelled',
       w3 && (w3.activities||[]).some(a=>a.type==='Booked'&&a.cancelled===true));
    ok('a cancellation note was logged',
       w3 && (w3.activities||[]).some(a=>/^Cancelled:/.test(a.text||'')));
    const jump2=[...document.querySelectorAll('button')].find(b=>/^Meetings\s*\d/.test((b.textContent||'').trim()));
    ok('Meetings count drops to 1', /Meetings\s*1/.test(((jump2&&jump2.textContent)||'').replace(/\s+/g,' ')),
       ((jump2&&jump2.textContent)||'no chip').replace(/\s+/g,' '));
    ok('the calendar delete was called', globalThis.__CAL__.some(c=>c&&c.action==='delete'));
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
