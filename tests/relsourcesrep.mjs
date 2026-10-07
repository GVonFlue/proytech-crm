/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_app = bundleName('rsrep');
/* SOURCES, AS A REP WITH THE RELATIONSHIPS TAB: no revenue roll-ups, and
   credit and channel locked once a lead exists.

   The spec: reps never see payouts or revenue roll-ups; "Referred by" is set
   at creation and editable by owners. So a rep gets:
     - no Sources view on Relationships
     - no "setup won" / "MRR now" on a relationship record they own
     - "Referred by" and "Arrived via" read-only on an existing lead (a screen
       lock: Postgres cannot stop a rep writing one field of a lead they own
       without a trigger, which is its own approved change)
     - both editable on a lead they are creating
   Seen red with lockSource forced false (the picker appeared). */
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
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__WRITES__ = []; globalThis.__CAL__ = []; globalThis.__TASKS__ = [];
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };

const at = n => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
const mine = o => ({ owner: 'Tony', ownerId: 'u_rep', owner_id: 'u_rep', company: '', stage: 'new', priority: 'low', createdAt: at(-30), activities: [], meetings: [], deals: [], payments: [], custom: {}, serviceInterest: [], labels: [], keyDates: [], ...o });
globalThis.__USERS__ = [{ id: 'u_rep', name: 'Tony', email: 'tony@agency.test', role: 'rep', pools: [], commission_pct: 25, appointment_rate: 0, active: true,
  tabs: ['dash', 'leads', 'rels'], goal_conversions: 0, nav_order: [] }];
globalThis.__WHOAMI__ = { ...globalThis.__USERS__[0], setup: true };
globalThis.__UID__ = 'u_rep';
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New Lead', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }, { key: 'won', label: 'Won', color: '#1F9D55', prob: 1, open: false, won: true, lost: false }] };
globalThis.__PROPOSALS__ = []; globalThis.__ONBOARDINGS__ = [];
globalThis.__LEADS__ = [
  mine({ id: 'r1', name: 'Rita Rel', isRelationship: true, relTier: 'champion' }),
  mine({ id: 'l1', name: 'Lee Lead', introducedBy: 'r1', source: 'Coffee page', stage: 'won', isClient: true, convertedAt: at(-3).slice(0, 10), payments: [{ id: 'p', amount: 900, date: at(-3).slice(0, 10) }] }),
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
await act(async () => { await new Promise(r => setTimeout(r, 180)); });

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); } };
const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await act(async () => { await new Promise(r => setTimeout(r, 80)); }); };
const nav = async l => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l));
const openSec = async k => { const sec = document.getElementById('msec-' + k); if (sec && !sec.classList.contains('open')) await click(sec.querySelector('.msec-h')); };
const fieldNamed = n => [...document.querySelectorAll('.field')].find(f => (f.querySelector('label') || {}).textContent === n);

console.log('\na rep with the Relationships tab');
await nav('Relationships');
ok('no Sources view on Relationships', ![...document.querySelectorAll('.seg button')].some(b => b.textContent === 'Sources') && !document.querySelector('.src-board'));
await click([...document.querySelectorAll('.rt-person')].find(p => /Rita Rel/.test(p.textContent)));
await openSec('refer');
const stats = [...document.querySelectorAll('.rl-stat')].map(s => s.textContent);
ok('their relationship record shows counts but no revenue roll-up', stats.length >= 2 && !stats.some(t => /setup won|MRR|\$/.test(t)), JSON.stringify(stats));
await click([...document.querySelectorAll('.rl-link')].find(b => b.textContent === 'Lee Lead'));
await openSec('type'); await openSec('qual');
const rb = fieldNamed('Referred by'), av = fieldNamed('Arrived via');
ok('on an existing lead, "Referred by" is read-only and names the person', !!rb && !rb.querySelector('.pp-face') && rb.querySelector('input[disabled]') && rb.querySelector('input').value === 'Rita Rel', rb && rb.innerHTML.slice(0, 200));
ok('  "Arrived via" too', !!av && !av.querySelector('select') && av.querySelector('input[disabled]') && av.querySelector('input').value === 'Coffee page', av && av.innerHTML.slice(0, 200));
const close = document.querySelector('.m-x, [aria-label="Close"]'); if (close) await click(close);

await click([...document.querySelectorAll('button')].find(b => /New Lead|New Relationship/.test(b.textContent)));
const more = [...document.querySelectorAll('button')].find(b => /Add more details/.test(b.textContent));
if (more) await click(more);
ok('on a lead they are creating, "Referred by" can be picked', !!fieldNamed('Referred by') && !!fieldNamed('Referred by').querySelector('.pp-face'));
root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
