/* REP-AUDIT #9 and #3 — the two things a rep hits on every single lead.

   #9 THE COMPOSER DEFAULT IS NOT COSMETIC. REACHED_TYPES contains 'Call' and
      not 'Note', and it drives touch counts, the untouched filter and the
      conversion ratio. A call logged as a note is invisible to every number a
      rep is measured on, so a default of Note quietly corrupted them at the
      rate of one per call. This asserts on WHAT REACHES THE DATABASE, not on
      which chip looks highlighted — the write is the thing that counts.

   #3 A REP BOOKING A MEETING WRITES TO THE OWNER'S GOOGLE CALENDAR. One OAuth
      token app-wide (ENGINEERING §6), so the event lands somewhere the rep
      cannot see. Both branches of the scheduler have to say so, and the
      DISCONNECTED one especially: its owner copy says "Open Settings → Google
      Calendar", and canOpen() refuses Settings to a rep by role. Telling
      someone to do a thing the app will not let them do is worse than telling
      them nothing.

   Mounted as a REP throughout, except the last block, which re-mounts as the
   owner to prove their view did not move.                                    */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
  'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
}
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 240) : '')); } };

/* google-status is the only /api/* this screen calls. Each mount sets it. */
let GCAL = { connected: false, email: '' };
globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok: true, json: async () => GCAL }
  : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
/* The Leads view defaults to "Mine", so the lead has to belong to whoever is
   signed in or the row is not there to click. Parameterised rather than
   hardcoded to the rep — the owner blocks at the bottom sign in as someone
   else. */
/* email and phone are present because BK refuses to save without them — "a
   booked call with a missing mobile is a no-show" (SOP-03). A fixture without
   them tests the wrong gate. */
const LEAD = (ownerName, ownerId) => ([{ id:'l1', name:'Call Me', company:'Call Co', stage:'new',
  owner: ownerName, owner_id: ownerId, email:'call@co.test', phone:'3165550100',
  createdAt: ago(5), meetings:[], deals:[], dealValue:0, activities:[] }]);

/* ---- bundle once, remount per scenario --------------------------------- */
const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.brd.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 90) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const setV = async (el, v) => { const st = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => { st.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };

/* Mount with a given crm_users table. whoami in the stub reports users[0], so
   the person signed in is whoever is listed first.
   Each scenario gets a FRESH container and the previous root is unmounted:
   calling createRoot twice on one element leaves the old tree mounted, and
   every later assertion then reads a screen that never re-rendered. That
   failure looks exactly like a broken feature, which is how it wasted a pass
   here before this comment existed. */
let curRoot = null, curEl = null;
async function boot({ users, gcal }) {
  const me = users[0];
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  GCAL = gcal;
  globalThis.__USERS__ = users;
  globalThis.__LEADS__ = LEAD(me.name || 'Dana', me.id);
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS__ = null; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div');
  document.body.appendChild(curEl);
  const mod = await import('./.brd.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(140);
  return curRoot;
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async () => { await nav('Leads');
  const row = [...curEl.querySelectorAll('tbody tr')].find(e => /Call Me/.test(e.textContent || ''));
  if (row) await click(row); await settle(120); };
const openComposer = async () => { const o = curEl.querySelector('.compose-open'); if (o) { await click(o); await settle(); } };
/* Throws rather than returns '' when the line is missing. Half the assertions
   below are NEGATIVE ("does not say Settings"), and an empty string satisfies
   every one of them — a scheduler that failed to open would have reported a
   clean pass. */
const schedText = () => {
  const el = curEl.querySelector('.mtg-acct') || curEl.querySelector('.mtg-warn');
  if (!el) throw new Error('the scheduler account/warning line did not render');
  const t = el.textContent || '';
  if (!t.trim()) throw new Error('the scheduler line rendered empty');
  return t;
};
/* The chip reads "Meeting Booked" — actLabel() renames this one type and only
   this one, which is exactly the sort of thing a /^Booked$/ selector misses
   while looking correct. */
const openScheduler = async () => {
  const b = [...curEl.querySelectorAll('.act-t')].find(x => /^Meeting Booked$/.test((x.textContent || '').trim()));
  if (!b) throw new Error('no "Meeting Booked" chip: ' +
    [...curEl.querySelectorAll('.act-t')].map(x => (x.textContent || '').trim()).join(' | '));
  await click(b); await settle();
};

const REP   = { id:'u_owner', name:'Dana', email:'dana@getproytech.com', role:'rep', pools:['Inbound'],
                commission_pct:10, active:true, tabs:['dash','leads','meetings'], goal_conversions:0, nav_order:[] };
const OWNER = (over = {}) => ({ id:'u_boss', name:'Garrett', email:'garrett@getproytech.com', role:'owner',
                pools:[], commission_pct:0, active:true, tabs:[], goal_conversions:0, nav_order:[], ...over });

/* ======================================================================== */
/* Choose a disposition in the rep composer, and fill the callback time when the
   code needs one. The code lives in the <b> inside the button, so this matches
   on that rather than on the button's whole label. */
const setV2 = async (el, v) => {
  const st = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { st.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
};
const pickDisp = async (code, at) => {
  const b = [...curEl.querySelectorAll('.disp-b')].find(x => ((x.querySelector('b') || {}).textContent || '') === code);
  if (b) await click(b);
  /* setV above is hard-wired to the textarea prototype; the callback time is an
     <input type="datetime-local">, so it needs its own setter. */
  if (at) { const dt = curEl.querySelector('.disp-cb input');
    if (dt) { const st = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
      await act(async () => { st.call(dt, at); dt.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); } }
  return !!b;
};

console.log('\n#9 — the composer defaults to Call, and the WRITE says Call');
{
  await boot({ users: [REP, OWNER()], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer();

  const on = [...curEl.querySelectorAll('.act-t.on')].map(b => (b.textContent || '').trim());
  ok('Call is the selected type on open', on.includes('Call'), 'selected: ' + JSON.stringify(on));
  ok('  Note is not', !on.includes('Note'), 'selected: ' + JSON.stringify(on));

  const btn = [...curEl.querySelectorAll('button')].find(b => /^Log Call$/.test((b.textContent || '').trim()));
  ok('the save button says Log Call', !!btn,
     [...curEl.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => /^Log /.test(t)).join(' | '));

  const ta = curEl.querySelector('.act-input');
  ok('the placeholder asks for a call', /log a call/i.test((ta || {}).placeholder || ''), (ta || {}).placeholder);

  await setV(ta, 'Rang him, he wants a callback Thursday');

  /* A REP MUST NOW SAY WHAT HAPPENED ON THE CALL. `disp` is required at the
     write for rep-authored calls, because a stored row carries `who` — a
     display NAME — and no role, so this is the only moment the question "did a
     rep write this" has an answer. The refusal is asserted first: without it,
     the assertions below would pass on a disposition-less row and the whole
     no-answer correction would have a hole exactly the size of one rep. */
  await click(btn); await settle();
  const blocked = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  ok('a rep cannot log a call without saying what happened',
     !blocked || !((blocked.activities || [])[0] || {}).type,
     JSON.stringify(((blocked || {}).activities || [])[0]));

  ok('picked CB', await pickDisp('CB', '2026-09-03T14:00'));
  const btn2 = [...curEl.querySelectorAll('button')].find(b => /^Log /.test((b.textContent || '').trim()));
  await click(btn2); await settle();
  const w = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  const act1 = ((w || {}).activities || [])[0];
  ok('the activity is written as type Call', act1 && act1.type === 'Call', JSON.stringify(act1));
  ok('  carrying the disposition, not a new activity type', act1 && act1.disp === 'CB', JSON.stringify(act1));
  ok('  not as a Note', act1 && act1.type !== 'Note', JSON.stringify(act1));
  ok('  and the text is intact', act1 && /callback Thursday/.test(act1.text || ''), act1 && act1.text);
}

console.log('\n#9 — Call counts as a touch, which is the whole point');
{
  /* The bug was not the extra click. REACHED_TYPES drives the untouched
     filter, so a note left the lead reading as never contacted. */
  await boot({ users: [REP, OWNER()], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer();
  const ta = curEl.querySelector('.act-input');
  await setV(ta, 'Spoke to him');
  await pickDisp('CB', '2026-09-03T14:00');
  await click([...curEl.querySelectorAll('button')].find(b => /^Log /.test((b.textContent || '').trim())));
  await settle(120);
  const body = curEl.textContent || '';
  ok('the lead no longer reads as untouched', !/never contacted/i.test(body) || /1 call/.test(body), body.slice(0, 200));
  const w = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  ok('  because the stored type is one REACHED_TYPES knows',
     ['Call','Text','Email','Meeting','Booked','Payment'].includes(((w || {}).activities || [])[0]?.type),
     JSON.stringify(((w || {}).activities || [])[0]));
}

console.log('\n#9 — BK MAKES A MEETING, which it did not');
{
  /* THE BUG THIS PINS. logIt branched on `atype`, and the disposition bar only
     renders when atype==='Call' — so a rep marking BK fell through to the
     plain-activity branch and NO MEETING RECORD WAS EVER CREATED. No
     Held/No-show control, nothing in Upcoming, and nothing for the show rate
     or held-bookings to be true of. The disposition said "booked" and the app
     did not agree. */
  await boot({ users: [REP, OWNER()], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer();
  const ta = curEl.querySelector('.act-input');
  await setV(ta, 'Booked her for Thursday.');
  ok('picked BK', await pickDisp('BK', '2026-09-03T14:00'));

  /* And it refuses to save without the five things — the same reasoning that
     already gates name, email and mobile. */
  const btnNow = [...curEl.querySelectorAll('button')].find(b => /^Log /.test((b.textContent || '').trim()));
  await click(btnNow); await settle();
  const blocked = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  ok('BK will not save without what Logan needs to build it',
     !blocked || !(blocked.meetings || []).length,
     JSON.stringify((blocked || {}).meetings || []));

  const ins = [...curEl.querySelectorAll('.disp-brief input')].filter(i => i.type !== 'checkbox');
  ok('the brief asks for five things', ins.length === 5,
     String(ins.length) + ' | err: ' + ((curEl.querySelector('.disp-err') || {}).textContent || 'none'));
  for (const i of ins) await setV2(i, 'answered');

  const btn2 = [...curEl.querySelectorAll('button')].find(b => /^Log /.test((b.textContent || '').trim()));
  ok('the composer accepts it once the brief is complete', btn2 && !btn2.disabled,
     'err: ' + ((curEl.querySelector('.disp-err') || {}).textContent || 'none'));
  await click(btn2); await settle(140);
  const w = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  const mtgs = (w || {}).meetings || [];
  ok('now BK creates a MEETING record', mtgs.length === 1, JSON.stringify(mtgs));
  ok('  with the time the rep agreed, not the moment he typed',
     mtgs[0] && String(mtgs[0].start).startsWith('2026-09-03'), (mtgs[0] || {}).start);
  ok('  and a real date, so it lands in Upcoming rather than Needs a date',
     mtgs[0] && mtgs[0].dateUnknown === false);
  const act = ((w || {}).activities || [])[0];
  ok('  the activity is type Booked carrying disp BK',
     act && act.type === 'Booked' && act.disp === 'BK', JSON.stringify(act));
  ok('  the owners are tagged the way SO/HV/DNC already are',
     act && Array.isArray(act.tags) && act.tags.includes('Garrett'), JSON.stringify(act && act.tags));
  ok('  and the brief is on the lead', (w || {}).brief && (w || {}).brief.wants === 'answered',
     JSON.stringify((w || {}).brief));
}

console.log('\n#9 — Note is still one click away');
{
  await boot({ users: [REP, OWNER()], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer();
  const noteChip = [...curEl.querySelectorAll('.act-t')].find(b => /^Note$/.test((b.textContent || '').trim()));
  ok('there is still a Note chip', !!noteChip);
  await click(noteChip); await settle();
  const ta = curEl.querySelector('.act-input');
  await setV(ta, 'Background: his brother runs the listing');
  await click([...curEl.querySelectorAll('button')].find(b => /^Log Note$/.test((b.textContent || '').trim())));
  await settle();
  const w = globalThis.__WRITES__.filter(x => x.id === 'l1').at(-1);
  ok('choosing Note still writes a Note', ((w || {}).activities || [])[0]?.type === 'Note',
     JSON.stringify(((w || {}).activities || [])[0]));
}

/* ======================================================================== */
console.log('\n#3 CONNECTED — a rep is told whose calendar it lands on');
{
  await boot({ users: [REP, OWNER()], gcal: { connected:true, email:'garrett@getproytech.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('it names the owner', /Garrett/.test(t), t);
  ok('  and says it is not theirs', /not yours/i.test(t), t);
  /* REVERSED DELIBERATELY. This used to assert the rep was NOT shown the
     account address. That was my invention, not the spec, and it was the thing
     standing between a rep and a straight answer: gcalEmail is the only source
     a rep can actually read (crm_users gives them one row — their own), so
     hiding it left them with a nameless sentence. The address is the fact; the
     name is the nicety. See TEAM-MIGRATION.sql. */
  ok('  the rep IS shown the account, because it is the one thing always knowable',
     /garrett@getproytech\.com/.test(t), t);
}

console.log('\n#3 CONNECTED — a blank crm_users name falls back to the email');
{
  await boot({ users: [REP, OWNER({ name:'' })], gcal: { connected:true, email:'garrett@getproytech.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('the email stands in for the missing name', /garrett@getproytech\.com/.test(t), t);
  ok('  and it is never a bold nothing', !/Goes on\s*’s/.test(t) && !/Goes on\s+Google Calendar/.test(t), t);
}

console.log('\n#3 DISCONNECTED — the rep is not sent to a page they cannot open');
{
  await boot({ users: [REP, OWNER()], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('it still warns nothing reaches a calendar', /isn’t connected|isn't connected/.test(t), t);
  ok('it does NOT tell a rep to open Settings', !/Settings/.test(t), t);
  ok('  it names who can connect it instead', /Garrett/.test(t), t);
  ok('  and says the CRM keeps the meeting either way', /saved in the CRM/.test(t), t);
}

console.log('\n#3 DISCONNECTED — a blank name still names somebody');
{
  await boot({ users: [REP, OWNER({ name:'' })], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  /* gcalEmail is empty on this branch, so the fallback MUST come from
     crm_users — this is the case that decides where the fallback reads from. */
  ok('the owner email from crm_users is used', /garrett@getproytech\.com/.test(t), t);
  ok('  and Settings is still not suggested', !/Settings/.test(t), t);
}

console.log('\n#3 — two owners and no way to tell them apart says "the owner"');
{
  /* Naming the wrong person reads as a fact about where the rep's work went.
     With no matching email and more than one owner, refuse to pick. */
  await boot({ users: [REP, OWNER(), OWNER({ id:'u_boss2', name:'Logan', email:'logan@getproytech.com' })],
               gcal: { connected:true, email:'someone-else@gmail.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('it does not guess a name', !/Garrett/.test(t) && !/Logan/.test(t), t);
  /* It still refuses to NAME one of two owners — guessing would state a
     falsehood about where the rep's work went. But it now names the ACCOUNT,
     so the sentence is useful rather than merely honest. */
  ok('  it names the account instead of nobody', /someone-else@gmail\.com/.test(t), t);
}

console.log('\n#3 — two owners, one matching the connected account, IS resolvable');
{
  await boot({ users: [REP, OWNER(), OWNER({ id:'u_boss2', name:'Logan', email:'logan@getproytech.com' })],
               gcal: { connected:true, email:'logan@getproytech.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('the owner whose email matches is named', /Logan/.test(t), t);
  ok('  and the other owner is not', !/Garrett/.test(t), t);
}

/* ======================================================================== */
console.log('\nthe owner view did not move');
{
  await boot({ users: [OWNER({ id:'u_owner' })], gcal: { connected:true, email:'garrett@getproytech.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('an owner still sees the connected Google address', /garrett@getproytech\.com/.test(t), t);
  ok('  and is NOT told it is not theirs', !/not yours/i.test(t), t);
}
{
  await boot({ users: [OWNER({ id:'u_owner' })], gcal: { connected:false, email:'' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('a disconnected owner is still sent to Settings', /Settings/.test(t), t);
  ok('  and is not told somebody else has to do it', !/has to connect/.test(t), t);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
