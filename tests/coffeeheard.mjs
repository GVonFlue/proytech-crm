/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lib = bundleName('chlib');
const B_app = bundleName('chapp');
/* WHAT THE COFFEE VISITOR SAID, AND WHO THEY MIGHT HAVE MEANT.

   A coffee booking stores the visitor's "how did you hear" answer as its own
   field, `heard` (tests/coffee.mjs proves the route writes it, with source
   'Coffee page' and no guessed introducedBy). This suite is the CRM side:

   the rules (lib/sources)
     - heardOf reads the field, and recovers an older "Intro from X" source
     - a named introducer nobody has linked gets its own "not linked" credit
       row, so the leaderboard does not hand a referral to the coffee page
     - referrerSuggestions: exact name or company first, then every typed word
       in a name; several when several match; never the lead itself; nothing
       once somebody is linked
   the record
     - shows "How they heard" and the suggestions; one click links, as ONE
       write: the person, the channel untouched, the change noted
     - says so when nobody matches
   (A rep's link button is hidden by the same lockSource as "Referred by",
   which tests/relsourcesrep.mjs covers; not re-proved here.)

   Seen red with the suggestions applied automatically in coffee-book (the
   coffee.mjs check), and with the link button writing source too (here). */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 500) : '')); } };
const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };
{ const a = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/sources.js'] }); fs.writeFileSync('tests/' + B_lib, a.outputFiles[0].text); }
const SRC = await import('./' + B_lib + '?v=' + Date.now());

const at = n => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
const base = o => ({ owner: 'Garrett', owner_id: 'u_owner', company: '', stage: 'new', priority: 'low', createdAt: at(-5), activities: [], meetings: [], deals: [], payments: [],
  custom: {}, serviceInterest: [], labels: [], keyDates: [], ...o });
const DANA_R = base({ id: 'danaR', name: 'Dana Realtor', company: 'Realtor Co', isRelationship: true, relTier: 'champion' });
const DANA_S = base({ id: 'danaS', name: 'Dana Smith', company: 'Smith Homes', isClient: true });
const PAT = base({ id: 'pat', name: 'Pat Hollis', company: 'Prairie Brokers', isRelationship: true });
const C1 = base({ id: 'c1', name: 'Coffee One', source: 'Coffee page', labels: ['Coffee'], heard: { answer: 'Someone introduced us', referrer: 'Dana Realtor', on: '2026-10-09' } });
const C2 = base({ id: 'c2', name: 'Coffee Two', source: 'Coffee page', labels: ['Coffee'], heard: { answer: 'Someone introduced us', referrer: 'dana' } });
const C3 = base({ id: 'c3', name: 'Coffee Three', source: 'Coffee page', labels: ['Coffee'], heard: { answer: 'Someone introduced us', referrer: 'Nobody Known' } });
const C4 = base({ id: 'c4', name: 'Coffee Four', source: 'Coffee page', labels: ['Coffee'], heard: { answer: 'Facebook' } });
const OLD = base({ id: 'old', name: 'Old Coffee', source: 'Intro from Pat Hollis', labels: ['Coffee'] });
const LINKED = base({ id: 'lk', name: 'Already Linked', source: 'Coffee page', introducedBy: 'pat', heard: { answer: 'Someone introduced us', referrer: 'Dana Realtor' } });
const ALL = [DANA_R, DANA_S, PAT, C1, C2, C3, C4, OLD, LINKED];
const byId = new Map(ALL.map(l => [l.id, l]));

console.log('\nthe rules');
ok('heardOf reads the field', JSON.stringify(SRC.heardOf(C1)) === JSON.stringify({ answer: 'Someone introduced us', referrer: 'Dana Realtor', on: '2026-10-09' }));
ok('  and recovers an older "Intro from" source', SRC.heardOf(OLD).referrer === 'Pat Hollis');
ok('  and is null with nothing said', SRC.heardOf(base({ id: 'x' })) === null);
ok('a named introducer nobody linked: their own "not linked" credit row, not the coffee page',
  SRC.referredBy(C1, byId).kind === 'unlinked' && SRC.referredBy(C1, byId).label === 'Intro from Dana Realtor (not linked)', JSON.stringify(SRC.referredBy(C1, byId)));
ok('  an answer with no name credits the channel', SRC.referredBy(C4, byId).label === 'Coffee page');
ok('  once linked, the person gets it', SRC.referredBy(LINKED, byId).kind === 'person' && SRC.referredBy(LINKED, byId).id === 'pat');
ok('every coffee lead arrived via the coffee page', [C1, C2, C3, C4].every(l => SRC.arrivedVia(l).label === 'Coffee page'));
const names = l => SRC.referrerSuggestions(l, ALL).map(x => x.name);
ok('an exact name: just that person', JSON.stringify(names(C1)) === JSON.stringify(['Dana Realtor']), JSON.stringify(names(C1)));
ok('  marked as what they are', SRC.referrerSuggestions(C1, ALL)[0].kind === 'Relationship');
ok('"dana": both Danas, for a person to choose', JSON.stringify(names(C2).sort()) === JSON.stringify(['Dana Realtor', 'Dana Smith']), JSON.stringify(names(C2)));
ok('nobody matching: no suggestion', names(C3).length === 0);
ok('an older "Intro from Pat Hollis" lead is offered Pat', JSON.stringify(names(OLD)) === JSON.stringify(['Pat Hollis']));
ok('a company name matches too', JSON.stringify(SRC.referrerSuggestions(base({ id: 'y', heard: { referrer: 'smith homes' } }), ALL).map(x => x.id)) === JSON.stringify(['danaS']));
ok('never the lead itself', SRC.referrerSuggestions(base({ id: 'danaS', name: 'Dana Smith', heard: { referrer: 'Dana Smith' } }), ALL).every(x => x.id !== 'danaS'));
ok('nothing once somebody is linked', names(LINKED).length === 0);

/* ---------------------------------------------------------- the app ---- */
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
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };
globalThis.__USERS__ = [{ id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] }];
globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }];
globalThis.__LEADS__ = ALL;
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'clients', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New Lead', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }, { key: 'won', label: 'Won', color: '#1F9D55', prob: 1, open: false, won: true, lost: false }] };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
{ const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text); }
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(70); };
const nav = async label => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === label));
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(260);
const openLead = async name => { await nav('Leads');
  const s = [...el.querySelectorAll('.scope-seg button')].find(b => /^All/.test(b.textContent || '')); if (s) await click(s);
  const row = [...el.querySelectorAll('tbody tr')].find(e => (e.textContent || '').includes(name));
  if (!row) throw new Error('no row for ' + name);
  await click(row); await settle(170);
  const sec = document.getElementById('msec-type'); if (sec && !sec.classList.contains('open')) await click(sec.querySelector('.msec-h'));
};
const closeLead = async () => { const c = document.querySelector('.m-x, [aria-label="Close"]'); if (c) await click(c); await settle(80); };

console.log('\nthe record');
{
  await openLead('Coffee One');
  const h = document.querySelector('.heard');
  ok('it shows how they heard and the name they gave', !!h && /How they heard:\s*Someone introduced us/.test(h.textContent) && /they named\s*Dana Realtor/.test(h.textContent), h && h.textContent);
  ok('  and offers Dana Realtor, marked as a relationship', !!h && /Dana Realtor.*Relationship/.test(h.querySelector('.heard-p').textContent), h && h.innerHTML.slice(0, 300));
  const before = globalThis.__WRITES__.length;
  await click(h.querySelector('.heard-link'));
  const w = globalThis.__WRITES__.slice(before).filter(x => x.id === 'c1');
  ok('one click, one write', w.length === 1, w.length);
  const x = w[0] || {};
  ok('  Dana gets the credit', x.introducedBy === 'danaR');
  ok('  the channel is untouched', x.source === 'Coffee page', x.source);
  ok('  and the link is noted', x.activities && x.activities[0] && x.activities[0].text === 'Referred by: — → Dana Realtor', JSON.stringify(x.activities && x.activities[0]));
  ok('  the suggestion is gone once linked', !document.querySelector('.heard .heard-link'));
  await closeLead();
}
{
  await openLead('Coffee Two');
  const ps = [...document.querySelectorAll('.heard-p')].map(p => p.textContent);
  ok('"dana": both offered, nothing chosen for you', ps.length === 2 && /Could be one of these/.test(document.querySelector('.heard').textContent) && globalThis.__WRITES__.every(w => w.id !== 'c2'), JSON.stringify(ps));
  await closeLead();
  await openLead('Coffee Three');
  ok('no match: it says so', /Nobody in the CRM matches "Nobody Known"/.test((document.querySelector('.heard') || {}).textContent || ''));
  await closeLead();
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
