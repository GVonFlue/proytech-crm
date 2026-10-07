/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lcrep = bundleName('lcrep');
/* THE CLIENT LIFECYCLE, AS A REP: nothing.
   ============================================================================

   Client delivery is an owner screen (ROLES.md). A rep who converted a client
   still owns that lead and can read it, so this proves the APP never builds
   lifecycle rows for a rep: no "What's due" on their dashboard (not even in
   Rearrange), no lifecycle strip anywhere, no Clients tab, and no automatic
   write to their client's lead from their session.

   Two gates keep a rep's session from writing: lcRows is empty for a rep, and
   the reconcile only runs for an owner (lcReady). Each covers the other, so
   dropping one alone stays green; seen red with both dropped (the rep's
   session moved their client to Build).                                    */
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

globalThis.__USERS__ = [{ id: 'u_rep', name: 'Tony', email: 'tony@agency.test', role: 'rep', pools: [], commission_pct: 25, appointment_rate: 0, active: true,
  tabs: ['leads', 'dash', 'tasks'], goal_conversions: 0, nav_order: [] }];
globalThis.__WHOAMI__ = { ...globalThis.__USERS__[0], setup: true };
globalThis.__UID__ = 'u_rep';
globalThis.__SETTINGS__ = { lifecycle: { builder: 'Logan' }, offer: JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8')) };
globalThis.__PROPOSALS__ = []; globalThis.__ONBOARDINGS__ = [];
/* the rep's own converted client, with every Terms 6.2 piece in: an owner's
   CRM would move it to Build. The rep's must not touch it. */
globalThis.__LEADS__ = [client({ id: 'r1', name: 'Rep Client', company: 'Rep Co', owner: 'Tony', ownerId: 'u_rep', owner_id: 'u_rep', clientPhase: 'intake', phaseSince: ago(6), convertedAt: ago(6), onboarding: SIX(1) })];

const out = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel: 'silent' });
fs.writeFileSync('tests/'+B_lcrep, out.outputFiles[0].text);
const mod = await import('./'+B_lcrep+'?v=' + Date.now());
fs.unlinkSync('tests/'+B_lcrep);
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

console.log('\na rep');
{
  ok('no "What\'s due" card', !document.querySelector('.lc-due') && !/What's due/.test(txt(document.body)));
  ok('no lifecycle strip anywhere', !document.querySelector('.lc-strip'));
  ok('no "Reach out" card either: this rep does not have the Relationships tab', !document.querySelector('.ro-card') && !document.querySelector('.lc-reach'));
  ok('no Clients tab', ![...document.querySelectorAll('.nav-i, nav button, aside button, a')].some(e => (e.textContent || '').trim() === 'Clients'));
  ok('their client\'s lead is not written by the lifecycle', !writesFor('r1').some(w => w.clientPhase === 'build'), JSON.stringify(writesFor('r1').map(w => w.clientPhase)));
  const arr = [...document.querySelectorAll('button')].find(b => /^Rearrange$/.test((b.textContent || '').trim()));
  if (arr) { await click(arr); ok('  not even as a heading in Rearrange', !/What's due/.test(txt(document.body))); }
  else ok('  (no Rearrange for a rep)', true);
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
