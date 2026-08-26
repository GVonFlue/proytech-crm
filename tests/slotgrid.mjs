/* WHAT A REP CAN ACTUALLY TAP.
   ============================================================================

   availability.mjs proves the rule is right. This proves the screen obeys it —
   that a blocked slot cannot be clicked, that an unreachable calendar does not
   stop a rep booking but does stop him believing it was checked, and that a
   slot taken while he was talking fails the booking instead of double-booking
   it.

   Mounted AS A REP, because every one of those behaviours is rep-only. The
   other half of the rule — that the OWNER keeps the free time field, so the
   person a rep escalates 3:45 to is not himself blocked — is asserted by
   booking.mjs, which mounts as an owner and checks that input is still there.
   Two files because it is two mounts, not because it is two rules.           */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { slotsForDay } from '../src/lib/availability.js';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url:'https://crm.test/', pretendToBeVisual:true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent',
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

const TZ = 'America/Chicago';
/* WHICH DAY IS UNDER TEST IS LEARNED FROM THE REQUEST, not computed here.
   WhenPicker offers weekdays from today, so a fixed date is a date no chip can
   reach — and reimplementing its weekend-skipping in the test would be a second
   copy of the rule, free to drift from the first. Instead the stub records the
   date the app asked about, and the fixtures are built for that day. */
let askedFor = null, availCalls = 0;
const at = (hhmm, day) => slotsForDay(day, TZ).find(s => s.hhmm === hhmm);
const busy = (hhmm, soft, day) => ({ start: at(hhmm, day).start, end: at(hhmm, day).end, soft: !!soft });
/* `now` is supplied by the stub, so nothing is ever 'past' by accident and the
   assertions do not rot as the calendar advances. */
const free = day => ({ ok:true, tz:TZ, now: at('08:00', day).start - 3600000, intervals: [] });
const withBusy = (...mk) => day => ({ ...free(day), intervals: mk.map(f => f(day)) });

/* The answer the NEXT read will get — an object, or a function of the day.
   Tests reach in and change it between render and click, which is the entire
   race being modelled. */
globalThis.__AVAIL__ = free;

globalThis.fetch = async (url, opts={}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (String(url).includes('/api/google-status'))
    return { ok:true, json: async()=>({connected:true, email:'admin@getproytech.com'}) };
  if (String(url).includes('/api/calendar-availability')) {
    availCalls++;
    askedFor = body && body.date;
    const a = globalThis.__AVAIL__;
    const ans = typeof a === 'function' ? a(askedFor) : a;
    return { ok:true, json: async()=>({ ...ans, date: askedFor }) };
  }
  if (String(url).includes('/api/calendar-event')) {
    globalThis.__CAL__.push(body);
    return { ok:true, json: async()=>({ok:true,eventId:'ev_'+globalThis.__CAL__.length,htmlLink:'https://cal/x',meetLink:''}) };
  }
  return { ok:false, status:500, json: async()=>({}), text: async()=>'' };
};

const iso = d => new Date(d).toISOString();
globalThis.__USERS__ = [{ id:'u_tony', name:'Tony', role:'rep', active:true, pools:[], tabs:[], nav_order:[] }];
globalThis.__WHOAMI__ = { role:'rep', active:true, setup:true, name:'Tony', pools:[], commission_pct:0, tabs:[], nav_order:[], goal_conversions:0 };
globalThis.__LEADS__ = [
  /* name + email + phone, because BK refuses without all three — see dispErr in
     LeadView: "a booked call with a missing mobile is a no-show". */
  { id:'l1', name:'Jason Bell', company:'Specs Eyewear', stage:'new', email:'jason@specs.com',
    phone:'555-0100', owner:'Tony', ownerId:'u_tony',
    createdAt: iso(Date.now()-30*864e5), activities:[], meetings:[] },
];

const out = await esbuild.build({
  entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{name:'stub',setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.resolve('tests/stub-supabase.js')})); }}],
  logLevel:'silent',
});
fs.writeFileSync('tests/.slot.mjs', out.outputFiles[0].text);
const mod = await import('./.slot.mjs?v='+Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const _ce = console.error; console.error = () => {};
const root = createRoot(document.getElementById('root'));
await act(async()=>{ root.render(React.createElement(mod.default)); });
await act(async()=>{ await new Promise(r=>setTimeout(r,120)); });
console.error = _ce;

let pass=0, fail=0;
const ok=(n,c,x='')=>{ if(c){pass++;console.log('  ok  '+n);} else {fail++;console.log('  FAIL '+n+(x?' — '+x:''));} };
const txt=()=>document.body.textContent||'';
const settle=async(ms=90)=>{ await act(async()=>{ await new Promise(r=>setTimeout(r,ms)); }); };
const click=async el=>{ await act(async()=>{ el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})); }); await settle(60); };
const setVal=async(el,v)=>{ const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
  await act(async()=>{ set.call(el,v); el.dispatchEvent(new dom.window.Event('input',{bubbles:true})); }); await settle(80); };
const findBtn=re=>[...document.querySelectorAll('button')].find(b=>re.test(b.textContent||''));
/* SCOPED TO THE GATED PICKER. Once the lead has an upcoming meeting the
   Meetings section auto-opens and mounts the OTHER scheduler, which draws its
   own lattice for its own day — a document-wide query then reports both and the
   assertions quietly describe the wrong control. */
const chips=()=>[...document.querySelectorAll('.whenp.gated .slot')];
const chip=label=>chips().find(b=>(b.textContent||'').trim()===label);
const dayChip=i=>[...document.querySelectorAll('.whenp-c')].filter(b=>!b.classList.contains('t'))[i];
/* Re-reading means selecting another day and coming back. React fires no
   change for a value that did not change, and the point of this grid is that it
   re-reads on the day — so the round trip is made real rather than simulated,
   through the same chips a rep taps. */
const pickDay=async i=>{ await click(dayChip(i)); };
const reload=async avail=>{
  await pickDay(0);
  globalThis.__AVAIL__=avail;
  await pickDay(1);
};

/* open the lead, open the composer, reach the scheduler */
let leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop();
if(!leadLink){ const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads');
  if(nav) await click(nav); leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop(); }
if(leadLink) await click(leadLink);
/* A REP'S REAL BOOKING PATH IS THE DISPOSITION BAR: log a call, mark BK, pick
   the time you agreed. WhenPicker, not MeetingScheduler.

   THIS NAVIGATION IS THE TEST. The availability lattice was first built into
   MeetingScheduler — the owner's control — shipped green with eighty-four
   assertions, and did nothing whatsoever on this screen. Every assertion below
   is worthless if it is pointed at the wrong component again, so the walk to
   get here is deliberately the one a rep makes. */
const callTab=findBtn(/^Call$/);
if(callTab) await click(callTab);
await settle(120);
const bk=[...document.querySelectorAll('.disp-b')].find(b=>/^BK/.test((b.textContent||'').trim()));
ok('the BK disposition exists on the call composer', !!bk, [...document.querySelectorAll('.disp-b')].map(b=>b.textContent.trim().slice(0,6)).join(','));
if(bk) await click(bk);
await settle(160);

const sched=document.querySelector('.whenp');
ok('the when-picker is on screen', !!sched);

console.log('\nA rep gets the lattice, not the curated list');
ok('it is the gated variant', !!document.querySelector('.whenp.gated'));
/* THE BYPASSES ARE GONE. A grid that can be sidestepped is not a gate. */
ok('no +15 quarter-hour expander', !findBtn(/^\+15$/));
ok('no "Another time…" escape', !findBtn(/Another time/));
ok('no raw datetime-local input', !document.querySelector('.whenp input[type=datetime-local]'));
/* the curated DEFAULT_TIMES list skipped 11:30, noon and 12:30 */
ok('noon is offered — 8 to 8 means 8 to 8', !!chip('12:00 PM'), chips().map(c=>c.textContent.trim()).join(' '));
ok('and 12:30', !!chip('12:30 PM'));
ok('and 11:30', !!chip('11:30 AM'));
ok('and 8:00 AM, which the curated list never offered', !!chip('8:00 AM'));
ok('a grid of slots is rendered', chips().length > 0, 'chips='+chips().length);
ok('8am to 8pm in half hours is 24 chips', chips().length===24, 'chips='+chips().length);
ok('it starts at 8:00 AM', chips()[0] && chips()[0].textContent.trim()==='8:00 AM', chips()[0]&&chips()[0].textContent);
ok('and ends at 7:30 PM', chips().at(-1) && chips().at(-1).textContent.trim()==='7:30 PM', chips().at(-1)&&chips().at(-1).textContent);
ok('3:45 is not offered at all', !chips().some(b=>/3:45/.test(b.textContent||'')));
ok('the calendar was actually read', availCalls>0, 'calls='+availCalls);

console.log('\nThe day it shows is the day it asked about');
const callsBefore=availCalls;
await pickDay(1);
ok('picking another day re-reads live', availCalls>callsBefore, 'calls='+availCalls);

console.log('\nHard blocks cannot be tapped');
await reload(withBusy(d=>busy('10:00',0,d), d=>busy('10:30',0,d), d=>busy('14:00',1,d)));
ok('a booked slot is disabled', chip('10:00 AM') && chip('10:00 AM').disabled, chip('10:00 AM')&&chip('10:00 AM').className);
ok('  and marked blocked', chip('10:00 AM') && /blocked/.test(chip('10:00 AM').className));
ok('the half hour after it is blocked too', chip('10:30 AM') && chip('10:30 AM').disabled);
ok('an empty slot is enabled', chip('11:00 AM') && !chip('11:00 AM').disabled);
ok('  and marked open', chip('11:00 AM') && /\bopen\b/.test(chip('11:00 AM').className));

console.log('\nA Banana block is bookable, and says so');
ok('a soft slot is NOT disabled', chip('2:00 PM') && !chip('2:00 PM').disabled);
ok('  and is drawn differently from an empty one', chip('2:00 PM') && /\bsoft\b/.test(chip('2:00 PM').className));
ok('  and from a blocked one', chip('2:00 PM') && !/blocked/.test(chip('2:00 PM').className));
/* A chip says the time and nothing else. What is being displaced is the
   owner's business, and a rep is deciding WHETHER, never which. */
ok('no chip leaks what is in the calendar',
   chips().every(b=>/^\d{1,2}:\d{2} (AM|PM)$/.test((b.textContent||'').trim())),
   chips().map(b=>(b.textContent||'').trim()).find(t=>!/^\d{1,2}:\d{2} (AM|PM)$/.test(t)));

/* The composer closes after a booking, so each scenario re-opens it the way a
   rep would: Call, then BK. */
const openBK=async()=>{
  /* a booking collapses the composer (setComposeOpen(false)), so reopen it
     before reaching for anything inside */
  const o=document.querySelector('.compose-open'); if(o) await click(o);
  const c=findBtn(/^Call$/); if(c) await click(c);
  /* IDEMPOTENT. The disposition chips toggle, so clicking BK when BK is already
     selected turns it OFF — after a refused booking the composer is still open
     on BK, and a blind click would close the very picker being tested. */
  const b=[...document.querySelectorAll('.disp-b')].find(x=>/^BK/.test((x.textContent||'').trim()));
  if(b && !b.classList.contains('on')) await click(b);
  await settle(140);
  await fillBrief();
};
const logBtn=()=>findBtn(/^Log Booked$/)||findBtn(/^Log /);
/* BK refuses without the build brief — four answers plus a website or the "they
   have none" tick. Filled the way a rep fills it, because a test that stubbed
   past this would not be exercising the button a rep actually presses. */
const fillBrief=async()=>{
  const inputs=[...document.querySelectorAll('.disp-brief input[type=text], .disp-brief input:not([type])')];
  for(const el of inputs) if(!el.value) await setVal(el,'x');
  const none=document.querySelector('.disp-none input[type=checkbox]');
  if(none&&!none.checked){
    const set=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'checked').set;
    await act(async()=>{ set.call(none,true); none.dispatchEvent(new dom.window.Event('click',{bubbles:true})); });
    await settle(60);
  }
};

console.log('\nBooking an open slot');
await fillBrief();
await click(chip('11:00 AM'));
/* the day the grid was showing WHEN THE CHIP WAS TAPPED — later reads move
   askedFor, and asserting against the moved value tests nothing */
const bookedDay=askedFor;
ok('the log button is there', !!logBtn());
await click(logBtn());
await settle(160);
let cal=globalThis.__CAL__.at(-1);
ok('a calendar event was created', !!cal && !cal.action, JSON.stringify(cal||{}).slice(0,90));
/* THE INSTANT, not a string parsed in the browser's zone. 11:00 in the
   calendar's zone is what the availability check approved, so it is what must
   reach Google — asserted against the slot's own instant rather than against a
   reconstruction, which would just repeat any bug in the reconstruction. */
const want=at('11:00', bookedDay);
ok('start is the slot instant the check approved',
   cal && new Date(cal.start).getTime()===want.start, cal&&cal.start);
/* TEN MINUTES, not thirty. The prospect was promised ten and the buffer is the
   gap between lattice slots, not a longer meeting — see DEMO_MIN in lead.js. */
ok('the demo is ten minutes, as the script promises',
   cal && (new Date(cal.end)-new Date(cal.start))/60000===10, cal&&cal.end);
ok('the availability read happened again before booking', availCalls>2, 'calls='+availCalls);

console.log('\nThe CALENDAR\'s zone decides the instant, not the browser\'s');
/* THE PROOF THAT THE FIX IS THE FIX. This machine's zone happens to match
   America/Chicago, so booking 11:00 by parsing the local string and booking
   11:00 in the calendar's zone give the same answer — the assertion above
   passes either way and proves nothing about which code ran.

   Move the CALENDAR to New York and they diverge by an hour: the browser-parsed
   string would still say 16:00Z, the calendar's own zone says 15:00Z. Whichever
   comes out names which code path is live. */
await openBK();
const NY='America/New_York';
await pickDay(0);
globalThis.__AVAIL__=day=>({ ok:true, tz:NY, now: at('08:00',day).start-9e6, intervals:[] });
await pickDay(1);
const nyDay=askedFor;
await fillBrief();
await click(chip('11:00 AM'));
const nBefore=globalThis.__CAL__.length;
await click(logBtn());
await settle(180);
const nyCal=globalThis.__CAL__.at(-1);
ok('an event was created', globalThis.__CAL__.length>nBefore);
ok('the instant follows the calendar\'s zone, not this machine\'s',
   nyCal && new Date(nyCal.start).getTime()===slotsForDay(nyDay,NY).find(x=>x.hhmm==='11:00').start,
   'got '+(nyCal&&nyCal.start)+' — browser-parsed would be '+new Date(`${nyDay}T11:00`).toISOString());
globalThis.__AVAIL__=free;

console.log('\nA slot taken while the rep was talking');
const before=globalThis.__CAL__.length;
await openBK();
await reload(free);
await click(chip('4:00 PM'));
/* Someone accepts something between the rep seeing 4:00 and tapping Log.
   No re-render, no day change — exactly the window the re-check exists for. */
globalThis.__AVAIL__=withBusy(d=>busy('16:00',0,d));
await click(logBtn());
await settle(180);
ok('NO event was created', globalThis.__CAL__.length===before, 'created '+(globalThis.__CAL__.length-before));
ok('the rep is told the time filled', /just filled/i.test(txt()));
/* AND NOTHING WAS WRITTEN. A refused booking that still left a meeting record
   would have the dashboard counting a demo that does not exist. */
const wrote=[...(globalThis.__WRITES__||[])].reverse().find(x=>x&&Array.isArray(x.meetings));
ok('and no meeting record was written for it',
   !wrote || !wrote.meetings.some(m=>String(m.start).includes('T21:00')||/4:00/.test(m.title||'')));

console.log('\nWhen Google is unreachable');
await openBK();
await reload({ ok:false, tz:TZ, error:'Calendar unreachable.' });
ok('the rep is NOT blocked — slots stay tappable', chips().some(b=>!b.disabled));
ok('but nothing claims to be checked', /not checked|Couldn.t reach|Calendar unreachable/i.test(txt()));
ok('and the chips are drawn as unknown, not as open',
   chips().some(b=>/unknown/.test(b.className)) && !chips().some(b=>/\bopen\b/.test(b.className)));
const n2=globalThis.__CAL__.length;
await click(chip('1:00 PM'));
await click(logBtn());
await settle(180);
ok('he can still book', globalThis.__CAL__.length>n2, 'before '+n2+' after '+globalThis.__CAL__.length);

console.log('\nWhat the owner sees afterwards');
const w=[...(globalThis.__WRITES__||[])].reverse().find(x=>x&&Array.isArray(x.meetings)&&x.meetings.length);
const mtgs=(w&&w.meetings)||[];
ok('the unverified booking is flagged on the meeting',
   mtgs.some(m=>m.availabilityChecked===false),
   JSON.stringify(mtgs.map(m=>({s:m.start,c:m.availabilityChecked,d:m.displacedSoft}))));
ok('and a checked one is not flagged', mtgs.some(m=>m.availabilityChecked===undefined));

console.log('\nDisplacing a soft block is recorded');
await openBK();
await reload(withBusy(d=>busy('09:00',1,d)));
await click(chip('9:00 AM'));
await click(logBtn());
await settle(180);
const w2=[...(globalThis.__WRITES__||[])].reverse().find(x=>x&&Array.isArray(x.meetings)&&x.meetings.some(m=>m.displacedSoft));
ok('displacedSoft is stamped on the meeting', !!w2);

console.log('\nSOP-01 emphasises, it never adds');
await openBK();
await reload(withBusy(d=>busy('09:00',0,d)));
ok('a preferred time that is booked is not marked',
   chip('9:00 AM') && !/pref/.test(chip('9:00 AM').className));
ok('and is still blocked', chip('9:00 AM') && chip('9:00 AM').disabled);
ok('a preferred time that is free IS marked',
   chip('10:00 AM') && /pref/.test(chip('10:00 AM').className), chip('10:00 AM')&&chip('10:00 AM').className);
/* 11:30 and noon are outside DEFAULT_TIMES. They are offered anyway — the
   ordering may emphasise, never restrict. */
ok('a free time outside the SOP list is still offered',
   chip('12:00 PM') && !chip('12:00 PM').disabled);
ok('  just without the mark', chip('12:00 PM') && !/pref/.test(chip('12:00 PM').className));
ok('the lattice is still in clock order, not reordered',
   chips().map(b=>b.textContent.trim())[0]==='8:00 AM');

try { fs.unlinkSync('tests/.slot.mjs'); } catch {}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
