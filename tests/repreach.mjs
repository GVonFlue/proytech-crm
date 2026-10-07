/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_rr = bundleName('rr');
/* WHAT A REP'S SCREENS MAY WRITE, NOW THAT app_settings IS OWNER-ONLY.
   ============================================================================

   RLS-TIGHTEN-2026-10 makes app_settings owner-only to write (it holds the
   offer and its prices, invoices, the books, the Build Console), except the
   shared `tasks` row; and events owner-only to read and write (sponsor
   amounts). Postgres refuses a rep's write — but the app saves these with a
   fire-and-forget catch, so a refused write is SILENT: the change shows,
   then vanishes on reload. So every rep path that wrote them had to go:

   - the lead modal's "add custom" controls (Next Action, Service Interest,
     a key-date label, a label), which also add to the install vocabulary;
   - Leads → Columns, which rewrites the install-wide column layout;
   - the tabs that write settings / invoices / txns / events — Settings,
     Monday Huddle, Invoices, Money, Build Console, Events — plus Sponsors,
     which only reads events and would render empty for a rep.

   This mounts the REAL app twice. As an OWNER first, so "absent for a rep"
   cannot pass because a control was simply never rendered; then as a REP
   whose own tab list names every owner-only tab (canOpen must still refuse),
   with NO events (what RLS now returns them), opening a lead that has
   sponsorship history. Asserted on what reaches the database: no settings
   write at all from the rep's session. RLS itself is proved against real
   Postgres in tests/rlsdb.mjs and VERIFY-RLS.md §13.                        */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 260) : '')); } };
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.confirm = () => true;
globalThis.fetch = async u => (String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' });

/* every console.error during the run: a rep with no events must not throw */
const errors = []; const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const OWNER_ONLY = ['Settings', 'Monday Huddle', 'Invoices', 'Money', 'Build Console', 'Events', 'Sponsors'];
const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const person = (id, name, role, tabs) => ({ id, name, email: id + '@x.test', role, pools: [], commission_pct: 10, appointment_rate: 0, active: true, tabs, goal_conversions: 0, nav_order: [], onboarding: {} });
/* a lead with sponsorship history: some on the lead, some in an event's slots */
const LEAD = { id: 'l1', name: 'Rita Alvarez', company: 'Alvarez Roofing', stage: 'new', owner: 'Tony', owner_id: 'u_rep', createdAt: ago(3),
  meetings: [], deals: [], dealValue: 0, payments: [], keyDates: [], labels: [], activities: [],
  sponsorships: [{ id: 'sp1', event: 'Spring Gala 2025', amount: 2500, paid: true }] };
const EVENT = { id: 'ev1', name: 'Summer Classic', date: '2026-07-01', slots: [{ id: 'sl1', leadId: 'l1', tier: 'Gold', amount: 5000, paid: false }] };

function reset(role) {
  for (const k of ['__WRITES__', '__MANY__', '__TASKS__', '__USER_WRITES__', '__EVENT_WRITES__', '__SETTINGS_WRITES__', '__MLOGS__', '__KB_NOTES__', '__KB_PUB__']) globalThis[k] = [];
  globalThis.__SETTINGS__ = null;
  /* the lead is the signed-in person's own, so it is in their default "Mine" view */
  globalThis.__LEADS__ = [{ ...JSON.parse(JSON.stringify(LEAD)), ...(role === 'rep' ? { owner: 'Tony', owner_id: 'u_rep' } : { owner: 'Garrett', owner_id: 'u_owner' }) }];
  if (role === 'rep') {
    /* the rep's own tab list names every owner-only tab: canOpen must still refuse */
    const tabs = ['dash', 'leads', 'tasks', 'settings', 'huddle', 'invoices', 'money', 'build', 'events', 'sponsors'];
    globalThis.__USERS__ = [person('u_rep', 'Tony', 'rep', tabs)];
    globalThis.__WHOAMI__ = { ...person('u_rep', 'Tony', 'rep', tabs), setup: true };
    globalThis.__EVENTS__ = [];                 // RLS: events are owner-only now
  } else {
    globalThis.__USERS__ = [person('u_owner', 'Garrett', 'owner', [])];
    globalThis.__WHOAMI__ = { ...person('u_owner', 'Garrett', 'owner', []), setup: true };
    globalThis.__EVENTS__ = [JSON.parse(JSON.stringify(EVENT))];
  }
}

const out = await esbuild.build({ entryPoints: [path.join(root, 'src/App.jsx')], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.join(here, 'stub-supabase.js') })); } }], logLevel: 'silent' });
fs.writeFileSync(path.join(here, B_rr), out.outputFiles[0].text);
const mod = await import('./'+B_rr+'?v=' + Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const navLabels = () => [...document.querySelectorAll('.nav-i')].map(n => (n.textContent || '').trim());
const nav = async label => { const b = [...document.querySelectorAll('.nav-i')].find(n => (n.textContent || '').trim() === label); if (b) await click(b); await settle(); return !!b; };

/* what the lead modal offers, with every section opened */
async function leadControls() {
  await nav('Leads');
  const columns = !![...document.querySelectorAll('button')].find(b => /^\s*Columns\s*$/.test(b.textContent || ''));
  const row = [...document.querySelectorAll('tbody tr')].find(e => /Alvarez/.test(e.textContent || ''));
  if (row) await click(row); await settle(160);
  const modalOpen = !!document.querySelector('.modal');
  for (const h of [...document.querySelectorAll('.msec-h')]) { if (!h.closest('.msec.open')) { await click(h); await settle(40); } }
  const btn = re => !![...document.querySelectorAll('button, span.chip')].find(b => re.test(b.textContent || ''));
  const res = {
    modalOpen, columns,
    customAction: btn(/Add custom Next Action/),
    customService: !!document.querySelector('span.chip.add'),
    keyDateNew: [...document.querySelectorAll('.kd-add option')].some(o => o.value === '__new'),
    newLabel: !!document.querySelector('.lblchip.add'),
    text: document.body.textContent || '',
  };
  const close = document.querySelector('.modal .mclose, .modal [aria-label="Close"], .modal .x');
  if (close) await click(close); await settle();
  return res;
}

const rootEl = createRoot(document.getElementById('root'));
async function mountAs(role) {
  reset(role);
  await act(async () => { rootEl.render(React.createElement('div', { key: role }, React.createElement(mod.default))); });
  await settle(220);
}

console.log('\nas the OWNER (so "absent for a rep" means something)');
{
  await mountAs('owner');
  const labels = navLabels();
  ok('the owner sees every owner-only tab', OWNER_ONLY.every(t => labels.includes(t)), labels.join(' | '));
  const c = await leadControls();
  ok('the lead opens', c.modalOpen);
  ok('the owner has Leads → Columns', c.columns);
  ok('the owner can add a custom Next Action', c.customAction);
  ok('the owner can add a custom Service Interest', c.customService);
  ok('the owner can add a new key-date label ("Something else…")', c.keyDateNew);
  ok('the owner can add a new label', c.newLabel);
}

console.log('\nas a REP whose tab list names every owner-only tab');
{
  await act(async () => { rootEl.render(null); }); await settle(40);
  const errsBefore = errors.length;
  await mountAs('rep');
  ok('the app mounted as the rep', /Tony/.test(document.body.textContent || ''));
  const labels = navLabels();
  for (const t of OWNER_ONLY) ok(`no ${t} tab, even though their tab list says so`, !labels.includes(t), labels.join(' | '));
  ok('Leads and Tasks are still there', labels.includes('Leads') && labels.includes('Tasks'), labels.join(' | '));
  const c = await leadControls();
  ok('the rep opens their lead, with no events loaded', c.modalOpen);
  ok('no Leads → Columns (the layout is install-wide)', !c.columns);
  ok('no "Add custom Next Action"', !c.customAction);
  ok('no custom Service Interest chip', !c.customService);
  ok('no "Something else…" key-date label', !c.keyDateNew);
  ok('no "New" label chip', !c.newLabel);
  ok('no sponsor amount from an event reaches the rep', !/5,000|\$5000/.test(c.text));
  const errs = errors.slice(errsBefore);
  ok('no errors with no events loaded (just no event sponsorship history)', !errs.some(e => /TypeError|Cannot read|is not a function|undefined/.test(e)), errs.join(' || '));
  await nav('Tasks');
  ok('the rep can open Tasks (the one shared settings row they write)', /Task/.test(document.body.textContent || ''));
  ok('NOTHING this rep did wrote app_settings', globalThis.__SETTINGS_WRITES__.length === 0, JSON.stringify(globalThis.__SETTINGS_WRITES__).slice(0, 200));
}

console.log('\nthe gate itself');
{
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  const set = (app.match(/const OWNER_ONLY_TABS=new Set\(\[([^\]]*)\]\)/) || [])[1] || '';
  ok('OWNER_ONLY_TABS names settings, clients, huddle, invoices, money, events, sponsors',
    ['settings', 'clients', 'huddle', 'invoices', 'money', 'events', 'sponsors'].every(k => set.includes(`'${k}'`)), set);
  ok('canOpen refuses them for a rep before reading the rep\'s tab list', app.indexOf('if(OWNER_ONLY_TABS.has(k)) return false;') > -1
    && app.indexOf('if(OWNER_ONLY_TABS.has(k)) return false;') < app.indexOf('return tabsOf(user).includes(k);'));
  ok('Build Console stays owner-only', /if\(k==='build'\) return modOn\(settings,'build'\)&&!isRep\(user\);/.test(app));
  ok('and none of them can be offered as a rep tab', /const REP_TABS=[^\n]*!OWNER_ONLY_TABS\.has\(k\)/.test(app));
}

await act(async () => { rootEl.unmount(); });
try { fs.unlinkSync(path.join(here, B_rr)); } catch {}
console.error = origErr;
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
