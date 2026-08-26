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
/* A fixed future weekday, so nothing in the grid is ever 'past' by accident and
   the assertions do not rot as the calendar advances. */
const DAY = '2027-04-14';
const SLOTS = slotsForDay(DAY, TZ);
const at = hhmm => SLOTS.find(s => s.hhmm === hhmm);
const busy = (hhmm, soft = false) => ({ start: at(hhmm).start, end: at(hhmm).end, soft });

/* The availability answer the next read will get. Tests reach in and change it
   between render and click — which is the entire race being modelled. */
globalThis.__AVAIL__ = { ok:true, tz:TZ, now: at('08:00').start - 3600000, intervals: [] };
let availCalls = 0;

globalThis.fetch = async (url, opts={}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (String(url).includes('/api/google-status'))
    return { ok:true, json: async()=>({connected:true, email:'admin@getproytech.com'}) };
  if (String(url).includes('/api/calendar-availability')) {
    availCalls++;
    return { ok:true, json: async()=>({ ...globalThis.__AVAIL__, date: body && body.date }) };
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
  { id:'l1', name:'Jason Bell', company:'Specs Eyewear', stage:'new', email:'', owner:'Tony', ownerId:'u_tony',
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
const chips=()=>[...document.querySelectorAll('.slot')];
const chip=label=>chips().find(b=>(b.textContent||'').trim()===label);
const dateInput=()=>document.querySelector('.mtg-form input[type=date]');
/* Re-reading means changing the date and changing it back: React fires no
   change for a value that did not change, and the whole point of this grid is
   that it re-reads on the day. A spare day in between makes the round trip
   real rather than simulated. */
const SPARE='2027-04-15';
const reload=async avail=>{
  await setVal(dateInput(), SPARE);
  globalThis.__AVAIL__=avail;
  await setVal(dateInput(), DAY);
};

/* open the lead, open the composer, reach the scheduler */
let leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop();
if(!leadLink){ const nav=[...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e=>(e.textContent||'').trim()==='Leads');
  if(nav) await click(nav); leadLink=[...document.querySelectorAll('*')].filter(e=>!e.children.length&&/Jason Bell/.test(e.textContent||'')).pop(); }
if(leadLink) await click(leadLink);
/* A REP'S BOOKING PATH IS THE MEETINGS SECTION, not the activity composer:
   LeadView filters the 'Meeting Booked' compose tab out for reps
   (ACT_TYPES.filter(t=>!(rep&&t.key==='Booked'))). So this opens the section
   the way a rep does, and fails loudly if that path ever disappears. */
for (const b of [...document.querySelectorAll('button')]) {
  if (!/^Meetings/.test((b.textContent||'').trim())) continue;
  await click(b);
  if (document.querySelector('.mtg-form')) break;
}
await settle(160);

const sched=document.querySelector('.mtg-form');
ok('the scheduler is on screen', !!sched);

console.log('\nA rep gets a lattice, not a time field');
ok('no free time input', !document.querySelector('.mtg-form input[type=time]'));
ok('no length dropdown either', !/Length/.test(sched?sched.textContent:''));
ok('a grid of slots is rendered', chips().length > 0, 'chips='+chips().length);
ok('8am to 8pm in half hours is 24 chips', chips().length===24, 'chips='+chips().length);
ok('it starts at 8:00 AM', chips()[0] && chips()[0].textContent.trim()==='8:00 AM', chips()[0]&&chips()[0].textContent);
ok('and ends at 7:30 PM', chips().at(-1) && chips().at(-1).textContent.trim()==='7:30 PM', chips().at(-1)&&chips().at(-1).textContent);
ok('3:45 is not offered at all', !chips().some(b=>/3:45/.test(b.textContent||'')));
ok('the calendar was actually read', availCalls>0, 'calls='+availCalls);

console.log('\nThe day it shows is the day it asked about');
await setVal(document.querySelector('.mtg-form input[type=date]'), DAY);
ok('changing the date re-reads live', availCalls>1, 'calls='+availCalls);

console.log('\nHard blocks cannot be tapped');
await reload({ ok:true, tz:TZ, now: at('08:00').start-3600000,
  intervals:[ busy('10:00'), busy('10:30'), busy('14:00',true) ] });
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

console.log('\nBooking an open slot');
await click(chip('11:00 AM'));
const goBtn=findBtn(/Schedule \+ add to Calendar/);
ok('the schedule button is there', !!goBtn);
await click(goBtn);
await settle(120);
let cal=globalThis.__CAL__.at(-1);
ok('a calendar event was created', !!cal && !cal.action);
ok('start is the slot, in the calendar owner\'s wall clock', cal && cal.start===`${DAY}T11:00:00`, cal&&cal.start);
ok('and it spans the whole 30-minute hold, not just the 10-minute demo',
   cal && cal.end===`${DAY}T11:30:00`, cal&&cal.end);
ok('the availability read happened again before booking', availCalls>2, 'calls='+availCalls);

console.log('\nA slot taken while the rep was talking');
const before=globalThis.__CAL__.length;
await reload({ ok:true, tz:TZ, now: at('08:00').start-3600000, intervals:[] });
await click(chip('4:00 PM'));
/* Logan accepts something between the rep seeing 4:00 and tapping Schedule.
   No date change, no re-render — exactly the window the re-check exists for. */
globalThis.__AVAIL__={ ok:true, tz:TZ, now: at('08:00').start-3600000, intervals:[ busy('16:00') ] };
await click(findBtn(/Schedule \+ add to Calendar/));
await settle(160);
ok('NO event was created', globalThis.__CAL__.length===before, 'created '+(globalThis.__CAL__.length-before));
ok('the rep is told the time filled', /just filled|no longer/i.test(txt()));
ok('and the grid now shows it blocked', chip('4:00 PM') && chip('4:00 PM').disabled);

console.log('\nWhen Google is unreachable');
await reload({ ok:false, tz:TZ, error:'Calendar unreachable.' });
ok('the rep is NOT blocked — slots stay tappable', chips().some(b=>!b.disabled));
ok('but nothing claims to be checked', /not checked|Couldn.t reach|Calendar unreachable/i.test(txt()));
ok('and the chips are drawn as unknown, not as open',
   chips().some(b=>/unknown/.test(b.className)) && !chips().some(b=>/\bopen\b/.test(b.className)));
const n2=globalThis.__CAL__.length;
await click(chip('1:00 PM'));
await click(findBtn(/Schedule/));
await settle(160);
ok('he can still book', globalThis.__CAL__.length>n2, 'before '+n2+' after '+globalThis.__CAL__.length);

console.log('\nWhat the owner sees afterwards');
const w=[...(globalThis.__WRITES__||[])].reverse().find(x=>x&&Array.isArray(x.meetings)&&x.meetings.length);
const mtgs=(w&&w.meetings)||[];
const unver=mtgs.find(m=>m.availabilityChecked===false);
ok('the unverified booking is flagged on the meeting', !!unver, JSON.stringify(mtgs.map(m=>({s:m.start,c:m.availabilityChecked,d:m.displacedSoft}))));
ok('and the checked one is not flagged', mtgs.some(m=>m.start===`${DAY}T11:00:00`&&m.availabilityChecked===undefined));

console.log('\nDisplacing a soft block is recorded');
await reload({ ok:true, tz:TZ, now: at('08:00').start-3600000, intervals:[ busy('09:00',true) ] });
await click(chip('9:00 AM'));
await click(findBtn(/Schedule \+ add to Calendar/));
await settle(160);
const w2=[...(globalThis.__WRITES__||[])].reverse().find(x=>x&&Array.isArray(x.meetings)&&x.meetings.some(m=>m.displacedSoft));
ok('displacedSoft is stamped on the meeting', !!w2);
ok('and it shows on the meeting row where the owner already looks',
   /displaced a soft block/i.test(txt()));

console.log('\nThe escalation hatch is still there');
ok('no date yet — just log it', !!findBtn(/No date yet/));

try { fs.unlinkSync('tests/.slot.mjs'); } catch {}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
