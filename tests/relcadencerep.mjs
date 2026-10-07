/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_app = bundleName('rcrep');
/* "REACH OUT", AS A REP WITH THE RELATIONSHIPS TAB.

   ROLES.md: Relationships is off for a rep by default and can be switched on
   per rep. A rep who has it gets a "Reach out" card on their dashboard with
   ONLY the relationships they own, and nothing else from "What's due"
   (client delivery is an owner screen). Log touch works from it and writes
   one activity as the rep.

   The fixture hands the rep's session a relationship they do not own (a pool
   record their login can read) so "only their own" is a filter the app
   applies, not an accident of what RLS returned. A rep WITHOUT the tab is
   tests/lifecyclerep.mjs (no card at all). Seen red with the owner filter
   removed from ReachOutCard (the pool record appeared). */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__WRITES__ = []; globalThis.__CAL__ = []; globalThis.__TASKS__ = [];
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const at = n => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
const call = n => ({ id: 'c' + n, ts: at(-n), type: 'Call', text: 'spoke', who: 'Tony' });
const rel = o => ({ company: 'Co', isRelationship: true, createdAt: at(-200), meetings: [], deals: [], payments: [], custom: {}, serviceInterest: [], labels: [], keyDates: [], activities: [], ...o });

globalThis.__USERS__ = [{ id: 'u_rep', name: 'Tony', email: 'tony@agency.test', role: 'rep', pools: ['General'], commission_pct: 25, appointment_rate: 0, active: true,
  tabs: ['dash', 'leads', 'rels'], goal_conversions: 0, nav_order: [] }];
globalThis.__WHOAMI__ = { ...globalThis.__USERS__[0], setup: true };
globalThis.__UID__ = 'u_rep';
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'clients', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New Lead', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }] };
globalThis.__PROPOSALS__ = []; globalThis.__ONBOARDINGS__ = [];
globalThis.__LEADS__ = [
  rel({ id: 't1', name: 'Tony Overdue', relTier: 'champion', owner: 'Tony', ownerId: 'u_rep', owner_id: 'u_rep', activities: [call(20)] }),
  rel({ id: 't2', name: 'Tony Fine', relTier: 'new', owner: 'Tony', ownerId: 'u_rep', owner_id: 'u_rep', activities: [call(3)] }),
  /* readable by the rep (a pool record), owned by nobody: not theirs */
  rel({ id: 'p1', name: 'Pool Overdue', relTier: 'champion', owner: '', pool: 'General', activities: [] }),
];

const out = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel: 'silent' });
fs.writeFileSync('tests/' + B_app, out.outputFiles[0].text);
const mod = await import('./' + B_app + '?v=' + Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const root = createRoot(document.getElementById('root'));
await act(async () => { root.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 160)); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); } };
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await act(async () => { await new Promise(r => setTimeout(r, 60)); }); };
const names = sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim());
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ');

console.log('\na rep with the Relationships tab');
{
  const card = document.querySelector('.ro-card');
  ok('their dashboard has a "Reach out" card', !!card && /Reach out/.test(txt(card)), txt(document.querySelector('.main, main, body')).slice(0, 200));
  ok('  listing only relationships they own', JSON.stringify(names('.ro-card .ro-name')) === JSON.stringify(['Tony Overdue']), JSON.stringify(names('.ro-card .ro-name')));
  ok('  not a pool relationship their login can read', !names('.ro-card .ro-name').includes('Pool Overdue'));
  ok('nothing else from "What\'s due": no client work, no Everyone/Mine', !document.querySelector('.lc-due') && !/What's due/.test(txt(document.body)));
  const before = globalThis.__WRITES__.length;
  const row = [...document.querySelectorAll('.ro-card .ro-row')].find(r => /Tony Overdue/.test(r.textContent));
  await click(row.querySelector('.lt-b'));
  await click([...document.querySelectorAll('.ro-card .lt-k')].find(b => b.textContent === 'Call'));
  const w = globalThis.__WRITES__.slice(before).filter(x => x && x.id === 't1');
  ok('Log touch from the card: one write, one new activity, logged as Tony', w.length === 1 && w[0].activities.length === 2 && w[0].activities[0].type === 'Call' && w[0].activities[0].who === 'Tony', JSON.stringify(w.map(x => x.activities[0])));
  ok('  and nothing else was written', globalThis.__WRITES__.slice(before).every(x => x && x.id === 't1'));
  ok('  Tony Overdue leaves the card', !names('.ro-card .ro-name').includes('Tony Overdue'), JSON.stringify(names('.ro-card .ro-name')));
}
root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
