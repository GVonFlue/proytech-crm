/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lcui = bundleName('lcui');
/* THE CLIENT LIFECYCLE IN THE REAL APP, AS AN OWNER.
   ============================================================================

   Mounts App.jsx against tests/stub-supabase.js and asserts on what reaches
   the database (globalThis.__WRITES__), not only on what is drawn:

     - opening the CRM writes nothing for clients with nothing happening
       (due dates are derived, never stored)
     - a client whose clock has started moves Intake → Build by itself,
       logged once by "Automatic"
     - the client card: days in stage, Day X of 14 with the target, the
       orange/red warning, "Waiting on:", the point of contact, the next item
       and its owner, and the two hand moves
     - "What's due" on the dashboard: Overdue / Today / This week by client,
       "Mine", and one-click done writing to the item's own checklist home,
       with no task created (decision 3: only hand-assigned items are tasks)
     - Settings → Client lifecycle

   The pure rules are tests/lifecycle.mjs; a rep's view is
   tests/lifecyclerep.mjs. Dates are relative to today, so this passes on any
   day it runs. */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__WRITES__ = []; globalThis.__CAL__ = []; globalThis.__TASKS__ = [];
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const TODAY = ago(0);
const tick = d => ({ done: d, due: null, assignee: null, taskId: null });
const client = o => ({ stage: 'signed', owner: 'Garrett', isClient: true, createdAt: ago(40) + 'T12:00:00Z', activities: [], meetings: [], deals: [], dealValue: 0, serviceInterest: ['Web+CRM'], ...o });
const SIX = n => ({ deposit_paid: tick(ago(n + 3)), intake_form: tick(ago(n + 2)), access_dns: tick(ago(n + 1)), access_gbp: tick(ago(n + 1)), logo_received: tick(ago(n + 2)), headshot_received: tick(ago(n)) });

globalThis.__USERS__ = [{ id: 'u1', name: 'Garrett', email: 'g@agency.test', role: 'owner', active: true, pools: [], tabs: [], nav_order: [] },
  { id: 'u2', name: 'Logan', email: 'l@agency.test', role: 'owner', active: true, pools: [], tabs: [], nav_order: [] }];
globalThis.__WHOAMI__ = { ...globalThis.__USERS__[0], setup: true };
globalThis.__UID__ = 'u1';
/* the shipped offer: its launchDays (14) is what the clock counts to */
globalThis.__SETTINGS__ = { lifecycle: { builder: 'Logan' }, offer: JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8')) };
globalThis.__PROPOSALS__ = []; globalThis.__ONBOARDINGS__ = [];
globalThis.__LEADS__ = [
  /* Intake, four days after signing: onboarding (due +2) and the logo,
     access and headshot (due +3) are overdue; nothing has happened today */
  client({ id: 'c1', name: 'Jordan Reed', company: 'Reed Realty', clientPhase: 'intake', phaseSince: ago(4), convertedAt: ago(4), onboarding: { deposit_paid: tick(ago(4)) } }),
  /* Build, Day 11 of 14: orange */
  client({ id: 'c2', name: 'Bo Builder', company: 'Build Co', clientPhase: 'build', phaseSince: ago(11), convertedAt: ago(20), onboarding: SIX(11) }),
  /* Intake, but every Terms 6.2 piece is in: the clock started yesterday */
  client({ id: 'c3', name: 'Cee Ready', company: 'Ready Co', clientPhase: 'intake', phaseSince: ago(6), convertedAt: ago(6), onboarding: SIX(1) }),
];

const out = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel: 'silent' });
fs.writeFileSync('tests/'+B_lcui, out.outputFiles[0].text);
const mod = await import('./'+B_lcui+'?v=' + Date.now());
fs.unlinkSync('tests/'+B_lcui);
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 120)); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); } };
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await act(async () => { await new Promise(r => setTimeout(r, 40)); }); };
const nav = async l => { const b = [...document.querySelectorAll('.nav-i, nav button, aside button, a')].find(e => (e.textContent || '').trim() === l); if (b) await click(b); };
const writesFor = id => globalThis.__WRITES__.filter(w => w && w.id === id);
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ');

console.log('\nopening the CRM');
{
  ok('nothing is written for clients with nothing happening (dates are derived)', !writesFor('c1').length && !writesFor('c2').length, JSON.stringify(globalThis.__WRITES__.map(w => w.id)));
  const w = writesFor('c3').at(-1);
  ok('the client whose clock started moved Intake → Build by itself', w && w.clientPhase === 'build' && w.phaseSince === TODAY, w && JSON.stringify({ p: w.clientPhase, s: w.phaseSince }));
  const notes = w ? (w.activities || []).filter(a => /^Phase → /.test(a.text || '')) : [];
  ok('  logged once, by Automatic, naming why', notes.length === 1 && notes[0].who === 'Automatic' && /automatic: the clock started|automatic: the \d+-day clock started/.test(notes[0].text), notes.map(a => a.text).join(' | '));
  ok('  and only once', writesFor('c3').length === 1, writesFor('c3').length);
  ok('no task was created by any of it (decision 3)', !globalThis.__TASKS_SAVED__ || !JSON.stringify(globalThis.__TASKS_SAVED__).includes('Reed Realty'));
}

console.log('\n"What\'s due" on the dashboard');
{
  const card = document.querySelector('.lc-due');
  ok('the card is there', !!card);
  const t = txt(card);
  ok('Overdue: Reed Realty, its onboarding and logo', /Overdue/.test(t) && /Reed Realty/.test(t) && /Onboarding submitted/.test(t) && /Logo received/.test(t), t.slice(0, 400));
  ok('  each with an owner and a date', /Garrett · /.test(t));
  ok('the build item owned by the builder is there too', /Website V1 ready/.test(t) && /Logan · /.test(t));
  const grp = card.querySelector('.lc-grp.overdue');
  ok('grouped by client', grp && [...grp.querySelectorAll('.lc-cname')].map(e => e.firstChild.textContent).includes('Reed Realty'));
  const mine = [...card.querySelectorAll('.seg-b')].find(b => /Mine/.test(b.textContent));
  await click(mine);
  const tm = txt(document.querySelector('.lc-due'));
  ok('"Mine" (Garrett) drops the builder\'s items', !/Website V1 ready/.test(tm) && /Onboarding submitted/.test(tm), tm.slice(0, 300));
  await click([...document.querySelectorAll('.lc-due .seg-b')].find(b => /Everyone/.test(b.textContent)));
  const before = writesFor('c1').length;
  const logo = [...document.querySelectorAll('.lc-due .lc-item')].find(e => /Logo received/.test(e.textContent) && e.closest('.lc-client') && /Reed Realty/.test(e.closest('.lc-client').textContent));
  await click(logo.querySelector('.lc-done'));
  const w = writesFor('c1').at(-1);
  ok('one-click done writes the checklist item itself', writesFor('c1').length === before + 1 && w.onboarding && w.onboarding.logo_received && w.onboarding.logo_received.done === TODAY, w && JSON.stringify(w.onboarding));
  ok('  and creates no task', !w.onboarding.logo_received.taskId);
  ok('  and leaves the card', !/Logo received/.test(txt(document.querySelector('.lc-due .lc-grp.overdue'))));
}

console.log('\nthe client card');
{
  await nav('Clients');
  const card = name => [...document.querySelectorAll('.kcard')].find(c => (c.textContent || '').includes(name));
  const b = card('Bo Builder');
  const st = b && b.querySelector('.lc-strip');
  ok('days in stage', st && /11d in Build/.test(txt(st)), txt(st));
  const day = st && st.querySelector('.lc-day');
  ok('Day 11 of 14 with the target launch date', day && /Day 11 of 14 · launch /.test(txt(day)), txt(day));
  ok('  orange from day 10', day && day.classList.contains('warn'));
  ok('the point of contact and the next item with its owner', /Contact: Garrett/.test(txt(st)) && /Next: .+\((Logan|Garrett)\)/.test(txt(st)), txt(st));
  const r = card('Jordan Reed').querySelector('.lc-strip');
  /* the logo was ticked from "What's due" above, so the card stopped waiting
     on it: the two screens read the same checklist */
  ok('Intake: "Waiting on:" names what the clock still waits for', /Waiting on: onboarding, domain access, headshot/.test(txt(r)) && !/logo/.test(txt(r)), txt(r));
  ok('  and no day count before the clock starts', !r.querySelector('.lc-day'));
  const od = card('Jordan Reed').querySelector('.badge.over');
  ok('the card\'s overdue badge counts the same items as "What\'s due"', od && /^\d+ overdue$/.test(txt(od).trim()) && Number(txt(od).trim().split(' ')[0]) >= 3, txt(od));
  const send = [...st.querySelectorAll('button')].find(x => /Send for review/.test(x.textContent));
  ok('Build: a "Send for review" button', !!send);
  await click(send);
  const w = writesFor('c2').at(-1);
  ok('  it moves the client to Review, stamped and logged with who did it', w && w.clientPhase === 'review' && w.phaseSince === TODAY && (w.activities || []).some(a => /^Phase → Review$/.test(a.text) && a.who === 'Garrett'), w && JSON.stringify({ p: w.clientPhase, a: (w.activities || [])[0] }));
  const rv = card('Bo Builder');
  ok('Review: a "Mark launched" button', rv && [...rv.querySelectorAll('.lc-act')].some(x => /Mark launched/.test(x.textContent)));
}

console.log('\nSettings → Client lifecycle');
{
  await nav('Settings');
  const t = txt(document.body);
  ok('the card is there, with the builder', /Client lifecycle/.test(t) && !!document.querySelector('select[aria-label="Builder"]'));
  ok('  and every template stage with its dates', !!document.querySelector('input[aria-label="Day: site_v1"]') && /no date/.test(t));
  ok('the Review stage is in the phase editor', [...document.querySelectorAll('.phase-label')].some(i => i.value === 'Review'));
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
