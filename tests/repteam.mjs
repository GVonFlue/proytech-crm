/* A REP CAN SEE WHO ELSE IS ON THE TEAM — and could not, until now.

   crm_users has `users_read using (id = auth.uid() or is_owner())`, so a rep
   selecting it gets exactly ONE row: their own. The browser then treated that
   array as "the team" in two places, and both quietly collapsed:

     1. the @mention picker built its list from it, filtered out the signed-in
        person, got an empty array, and returned null — so the control did not
        render AT ALL for a rep. Not empty. Absent. REP-AUDIT #3 calls flagging
        something to the owner the most useful thing a rep can do, and it has
        never once been reachable by one.

     2. calendarOwner() looked for role='owner' in that same array, found none,
        and fell back to "the owner's Google Calendar" with no name — which was
        reported as an email-mapping problem and is actually this. It would
        still have failed after the mapping was corrected.

   crm_team() (TEAM-MIGRATION.sql) returns id, name and role for every active
   person and nothing else. The tests below are written from the rep's side,
   because the owner's side never had the bug and passing as an owner would
   have proved nothing.

   THE BOUNDARY IS PART OF THE FIX, so it is asserted too: the roster must not
   become a back door to pay. There is no amount column in crm_team() by
   construction, and __TEAM__ in the stub carries none.                       */
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

let GCAL = { connected: false, email: '' };
globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok:true, json: async () => GCAL }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const LEADS = () => ([{ id:'l1', name:'Sarah Chen', company:'Chen Realty', stage:'new',
  owner:'Tony Porter', owner_id:'u_owner', createdAt:ago(6),
  meetings:[], deals:[], dealValue:0, activities:[] }]);

/* The signed-in person is __USERS__[0] (whoami mirrors it). For a REP the
   stub's getUsers must return ONLY their row — that is the RLS behaviour the
   bug came from, and a fixture that hands a rep the whole table would test a
   database that does not exist. */
const TONY_ONLY = [{ id:'u_owner', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General'], commission_pct:10, appointment_rate:75, active:true,
  tabs:['dash','leads','meetings'], goal_conversions:0, nav_order:[] }];

/* crm_team() sees past RLS: everyone active, names and roles, no money. */
const ROSTER = [
  { id:'u_owner', name:'Tony Porter', role:'rep' },
  { id:'u_g',     name:'Garrett',     role:'owner' },
  { id:'u_l',     name:'Logan',       role:'owner' },
];
const ROSTER_ONE_OWNER = [
  { id:'u_owner', name:'Tony Porter', role:'rep' },
  { id:'u_g',     name:'Garrett',     role:'owner' },
];

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.brt.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 90) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot({ users, roster, gcal }) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  GCAL = gcal || { connected:false, email:'' };
  globalThis.__USERS__ = users;
  if (roster === undefined) delete globalThis.__TEAM__; else globalThis.__TEAM__ = roster;
  globalThis.__LEADS__ = LEADS();
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS__ = null; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.brt.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(160);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async () => { await nav('Leads');
  const row = [...curEl.querySelectorAll('tbody tr')].find(e => /Sarah Chen/.test(e.textContent || ''));
  if (row) await click(row); await settle(140); };
const openComposer = async () => { const o = curEl.querySelector('.compose-open'); if (o) { await click(o); await settle(); } };
const chips = () => [...curEl.querySelectorAll('.tagchip')].map(b => (b.textContent || '').trim());
const openScheduler = async () => {
  const b = [...curEl.querySelectorAll('.act-t')].find(x => /^Meeting Booked$/.test((x.textContent || '').trim()));
  if (!b) throw new Error('no "Meeting Booked" chip');
  await click(b); await settle();
};
const schedText = () => {
  const el = curEl.querySelector('.mtg-acct') || curEl.querySelector('.mtg-warn');
  if (!el) throw new Error('scheduler line did not render');
  return el.textContent || '';
};

/* ==================================================================== */
console.log('\nthe bug: a rep sees a team of one');
{
  await boot({ users: TONY_ONLY, roster: undefined });   // no migration run
  await openLead(); await openComposer();
  ok('with no crm_team(), a rep is offered nobody to tag — the old behaviour',
     chips().length === 0, JSON.stringify(chips()));
}

console.log('\nthe fix: crm_team() gives a rep the roster');
{
  await boot({ users: TONY_ONLY, roster: ROSTER });
  await openLead(); await openComposer();
  const c = chips();
  ok('a rep can now tag somebody at all', c.length > 0, JSON.stringify(c));
  ok('  the owners are offered', c.includes('Garrett') && c.includes('Logan'), JSON.stringify(c));
  ok('  and he is not offered himself', !c.includes('Tony Porter'), JSON.stringify(c));
}

console.log('\nthe roster is not a back door to pay');
{
  /* The whole reason this is an RPC and not a widened policy. crm_team()
     returns id/name/role — there is no rate to leak because there is no
     column. Asserted on the rendered screen, which is where a leak would
     actually show up. */
  const body = curEl.textContent || '';
  ok('no other person\'s commission rate is on screen', !/\b(10|12|15|20)%\s*(commission|rate)/i.test(body));
  ok('no other person\'s email is on screen', !/@getproytech\.com/.test(body.replace(/tonyporter434@gmail\.com/g,'')),
     body.slice(0, 200));
  const roster = globalThis.__TEAM__ || [];
  ok('  and the roster itself carries no money field',
     roster.every(u => Object.keys(u).every(k => ['id','name','role'].includes(k))),
     JSON.stringify(roster[0]));
}

console.log('\ncalendarOwner: a rep is told where a booking lands');
{
  /* Two owners and a Google account matching neither — exactly the live data.
     It must refuse to NAME one (guessing states a falsehood about where the
     rep's work went) but must still name the ACCOUNT, which is the one thing
     a rep can always be told: gcalEmail comes from /api/google-status, which
     any signed-in user may call. */
  await boot({ users: TONY_ONLY, roster: ROSTER, gcal: { connected:true, email:'gvonflue@gmail.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('the account is named', /gvonflue@gmail\.com/.test(t), t);
  ok('  it does not guess between two owners', !/Garrett/.test(t) && !/Logan/.test(t), t);
  ok('  and it still says the calendar is not his', /not yours/i.test(t), t);
  ok('  the nameless fallback is gone', !/the owner’s Google Calendar/.test(t), t);
}
{
  /* One owner is unambiguous, so name the person AND the account. */
  await boot({ users: TONY_ONLY, roster: ROSTER_ONE_OWNER, gcal: { connected:true, email:'gvonflue@gmail.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('a single owner is named', /Garrett/.test(t), t);
  ok('  alongside the account, not instead of it', /gvonflue@gmail\.com/.test(t), t);
}
{
  /* Disconnected: there is no account to name, so the roster is the only
     source — and before this fix a rep got no name here either. */
  await boot({ users: TONY_ONLY, roster: ROSTER_ONE_OWNER, gcal: { connected:false, email:'' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('disconnected, a rep is told who can connect it', /Garrett/.test(t), t);
  ok('  and is still not sent to Settings, which a rep cannot open', !/Settings/.test(t), t);
}

console.log('\nan install without the migration still works');
{
  await boot({ users: TONY_ONLY, roster: undefined, gcal: { connected:true, email:'gvonflue@gmail.com' } });
  await openLead(); await openComposer(); await openScheduler();
  const t = schedText();
  ok('it degrades to naming the account, never to a crash', /gvonflue@gmail\.com/.test(t), t);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
