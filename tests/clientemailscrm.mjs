/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_app = bundleName('cecrm');
/* THE CLIENT EMAILS, FROM THE CRM'S SIDE.

   The server sends (tests/clientemails.mjs). The owner's CRM does three things:
     - when a deposit goes from unticked to ticked it asks /api/client-email
       to send "You're locked in", with the lead id only, ONCE; opening the
       CRM with deposits already ticked asks nothing. (Proven through the
       client's onboarding checklist; the watcher reads the leads, not the
       control, so "Mark payment collected" and a paid invoice take the same
       road, but those two are not driven here.)
     - it turns the server's day-10 claim into ONE "Call [client]" task for
       the point of contact (the accepted proposal's first contact), and
       stamps the lead so it is never made twice
     - Settings → Client emails: never saved reads off, by name; switching one
       on stamps today as its switch-on day
   Seen red with the watcher's first-pass guard removed (it asked for every
   already-ticked client on load). */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const CALLS = [];
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.includes('google-status')) return { ok: true, json: async () => ({ connected: false, email: '' }) };
  if (url.includes('/api/client-email')) { CALLS.push(JSON.parse(o.body || '{}')); return { ok: true, json: async () => ({ ok: true, sent: 'locked_in' }) }; }
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const client = o => ({ company: 'Co', owner: 'Garrett', owner_id: 'u_owner', isClient: true, stage: 'won', convertedAt: TODAY, createdAt: new Date().toISOString(),
  priority: 'low', activities: [], meetings: [], deals: [], payments: [], custom: {}, serviceInterest: ['Web+CRM'], labels: [], keyDates: [], onboarding: {}, ...o });
globalThis.__USERS__ = [{ id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] }];
globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }];
globalThis.__LEADS__ = [
  client({ id: 'paid', name: 'Already Paid', company: 'Paid Co', onboarding: { deposit_paid: { done: '2030-01-02' } } }),
  client({ id: 'new', name: 'New Client', company: 'New Co', dealValue: 3000 }),
  client({ id: 'stalled', name: 'Stalled Client', company: 'Stall Co' }),
];
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'clients', 'onboarding', 'proposals', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }, { key: 'won', label: 'Won', color: '#1F9D55', prob: 1, open: false, won: true, lost: false }] };
globalThis.__PROPOSALS__ = [{ id: 'p1', lead_id: 'stalled', status: 'accepted', accepted_at: '2030-01-01T00:00:00Z', body: { contacts: [{ name: 'Logan Sell' }] } }];
globalThis.__ONBOARDINGS__ = [{ id: '22222222-2222-4222-8222-222222222222', lead_id: 'new', status: 'in_progress', products: ['website'], answers: {}, sections: {}, onboarding_files: [], created_at: '2030-01-02T00:00:00Z', updated_at: '2030-01-02T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', lead_id: 'stalled', status: 'in_progress', products: ['website'], answers: {}, sections: {}, onboarding_files: [], created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z' }];
globalThis.__CLIENT_EMAILS__ = [{ lead_id: 'stalled', kind: 'stall_10d', sent_at: '2030-01-12T15:00:00Z', detail: 'Call Stall Co: onboarding stalled 10 days' }];
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = []; globalThis.__TASK_WRITES__ = []; globalThis.__TASKS__ = [];

const app = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }], logLevel: 'silent' });
fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text);
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 150) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(80); };
const nav = async label => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === label));
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(500);

console.log('\nopening the CRM sends nothing');
ok('a client whose deposit was already ticked is not emailed on load', CALLS.length === 0, JSON.stringify(CALLS));

console.log('\nthe day-10 task');
{
  const writes = globalThis.__TASK_WRITES__;
  const last = writes[writes.length - 1] || [];
  const t = last.filter(x => x.fromStall);
  ok('one "Call" task, from the server\'s claim', t.length === 1 && t[0].title === 'Call Stall Co: onboarding stalled 10 days', JSON.stringify(t));
  ok('  for the point of contact (the accepted proposal\'s first contact)', t[0] && t[0].owner === 'Logan Sell', t[0] && t[0].owner);
  ok('  linked to the lead, due today', t[0] && t[0].leadId === 'stalled' && t[0].due === TODAY);
  const stamped = globalThis.__WRITES__.filter(w => w.id === 'stalled' && w.onbStallTaskId);
  ok('  and the lead is stamped with it', stamped.length >= 1 && stamped[stamped.length - 1].onbStallTaskId === (t[0] && t[0].id));
  const n = writes.length;
  await settle(300);
  ok('  made once: nothing more on the next render', globalThis.__TASK_WRITES__.slice(n).every(l => l.filter(x => x.fromStall).length <= 1) && globalThis.__TASK_WRITES__.flat().filter(x => x.fromStall).map(x => x.id).filter((v, i, a) => a.indexOf(v) === i).length === 1);
}

console.log('\na deposit ticked now');
{
  /* the deposit, ticked on the client's onboarding checklist */
  dom.window.prompt = (msg, def) => (/YYYY-MM-DD/.test(msg) ? TODAY : /How much/i.test(msg) ? '1500' : 'deposit');
  globalThis.prompt = dom.window.prompt;
  await nav('Clients'); await settle(200);
  const card = [...document.querySelectorAll('.kcard')].find(c => /New Co|New Client/.test(c.textContent || ''));
  if (card) await click(card.querySelector('.kn') || card);
  await settle(300);
  /* the client view's Onboarding tab: the checklist, where the deposit is ticked */
  const tab = [...document.querySelectorAll('.modal .seg-b')].find(b => (b.textContent || '').trim() === 'Onboarding');
  if (tab) await click(tab);
  await settle(250);
  const dl = [...document.querySelectorAll('.onbd-tog')].find(e => /Deposit/i.test(e.textContent || ''));
  const tickEl = dl && dl.querySelector('input[type=checkbox]');
  const box = tickEl;
  if (box) await click(box);
  await settle(800);
  ok('asks the server once, with the lead id only', CALLS.length === 1 && JSON.stringify(CALLS[0]) === JSON.stringify({ leadId: 'new' }), JSON.stringify(CALLS) + (box ? '' : ' (no deposit checkbox found)'));
  const note = (globalThis.__WRITES__.filter(w => w.id === 'new').pop() || {}).activities || [];
  ok('  and leaves a note on the lead', note.some(a => /^Client email sent: "You're locked in"/.test(a.text || '')), JSON.stringify(note.slice(0, 2)));
  await settle(300);
  ok('  only once, however many renders follow', CALLS.length === 1);
}

console.log('\nSettings → Client emails');
{
  await nav('Settings'); await settle(200);
  /* Settings is a grid of tiles now (SettingsTiles.jsx): open the one this card lives in */
  { const tl = document.querySelector('[data-tile="client-emails"]'); if (tl) await click(tl); await settle(150); }
  const card = [...el.querySelectorAll('.card')].find(c => /Client emails/.test(c.querySelector('.sec-title') ? c.querySelector('.sec-title').textContent : ''));
  ok('the card is on the owner\'s Settings', !!card);
  ok('  never saved: all four named, off', !!card && /Never switched on, so off/.test(card.textContent) && /"You're locked in", "We saved your seat", Day-10 call task, "Launch Day Ticket"/.test(card.textContent), card && card.textContent.slice(0, 300));
  const box = card && card.querySelector('input[aria-label^="\\"You\'re locked in\\""]');
  const w0 = globalThis.__SETTINGS_WRITES__.length;
  if (box) await click(box);
  await settle(900);
  const sw = (globalThis.__SETTINGS_WRITES__.slice(w0).pop() || {}).clientEmails || {};
  ok('switching one on saves it on, from today', sw.lockedIn && sw.lockedIn.on === true && sw.lockedIn.since === TODAY, JSON.stringify(sw));
  ok('  and the others stay unsaved (off)', !sw.seat && !sw.ticket);
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
