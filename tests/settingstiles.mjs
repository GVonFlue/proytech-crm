/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_tiles = bundleName('sttiles');
const B_app = bundleName('stapp');
/* SETTINGS AS TILES: layout only, every card in exactly one tile.

   Structural (the source): every card the Settings page renders is gated by
   show('<key>'), every key is in exactly one tile, and no tile names a card
   the page does not have. In the real app (jsdom, as the owner):
     - the grid: nine areas, every tile, no settings card until one is opened
     - each tile opens ONLY its own cards, and no card appears under two tiles
     - the URL: opening sets ?settings=<id>, "All settings" removes it, Back
       returns to the grid, and a deep link opens Settings on that tile
     - search filters tiles by a setting's name and Enter opens the match
     - layout only: opening and closing every tile writes no setting
     - the phone shortcuts name every area; the Team card no longer says
       sign-ups must be on (untrue since #104)
   Owner-only tiles are hidden from anyone else (visibleTiles); a rep has no
   Settings tab at all (tests/nav.mjs and ROLES.md), which is unchanged. */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };
const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };

/* ---------------------------------------------------------------- structure */
console.log('\nevery card in exactly one tile (the source)');
const src = fs.readFileSync('src/App.jsx', 'utf8');
const page = src.slice(src.indexOf('function SettingsPage('), src.indexOf('\n}\n', src.indexOf('function SettingsPage(')));
const gated = [...page.matchAll(/\{show\('([A-Za-z]+)'\)&&/g)].map(m => m[1]);
{ const t = await esbuild.build({ ...BUILD, entryPoints: ['src/SettingsTiles.jsx'], external: ['react', 'react/jsx-runtime', 'lucide-react'] }); fs.writeFileSync('tests/' + B_tiles, t.outputFiles[0].text); }
const T = await import('./' + B_tiles + '?v=' + Date.now());
const inTiles = T.TILES.flatMap(t => t.cards);
ok('the page gates 24 cards, each once (the onboarding portal\'s since Oct 2026)', gated.length === 24 && new Set(gated).size === 24, gated.join());
ok('every gated card is in a tile', gated.every(k => inTiles.includes(k)), gated.filter(k => !inTiles.includes(k)).join());
ok('  and in exactly one', inTiles.length === new Set(inTiles).size, inTiles.join());
ok('no tile names a card the page does not have', inTiles.every(k => gated.includes(k)), inTiles.filter(k => !gated.includes(k)).join());
ok('every tile is in one of the nine areas', T.TILES.every(t => T.GROUPS.some(([g]) => g === t.group)) && T.GROUPS.length === 9);
ok('owner-only tiles are hidden from a non-owner', T.visibleTiles(false).every(t => !t.owner) && T.visibleTiles(false).length < T.TILES.length && T.visibleTiles(true).length === T.TILES.length);
ok('search finds a setting by name inside a tile', T.searchTiles('launch days', T.TILES).map(x => x.tile.id).join() === 'proposals' && T.searchTiles('invoice', T.TILES)[0].tile.id === 'invoicing');

/* ------------------------------------------------------------------ the app */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/?settings=invoicing', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent', 'PopStateEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history', 'location', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.scrollTo = () => {}; globalThis.scrollTo = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async u => String(u).includes('google-status') ? { ok: true, json: async () => ({ connected: false, email: '' }) } : { ok: false, status: 500, json: async () => ({}), text: async () => '' };
globalThis.__USERS__ = [{ id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] }];
globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }];
globalThis.__LEADS__ = [];
globalThis.__ONBOARDINGS__ = [];
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'clients', 'onboarding', 'settings'], modulesV: 9, options: {}, pools: ['General'],
  stages: [{ key: 'new', label: 'New', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }] };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
{ const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text); }
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(80); };
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(1200);   /* the app's own boot migrations write settings once; the tile checks start after */
const writesBefore = globalThis.__SETTINGS_WRITES__.length;
const param = () => new URLSearchParams(window.location.search).get('settings');
const cards = () => [...el.querySelectorAll('.st-panel .card')].map(c => ((c.querySelector('.sec-title, h3') || c).textContent || '').trim().slice(0, 40));

console.log('\na deep link');
ok('?settings=invoicing opens Settings on the Invoicing tile', !!el.querySelector('.st-head') && /Invoicing/.test(el.querySelector('.st-title').textContent) && cards().length >= 1 && /Invoicing/.test(cards().join()), JSON.stringify(cards()));
ok('  and only its card', cards().length === 1, JSON.stringify(cards()));

console.log('\nthe grid');
await click(el.querySelector('.st-back'));
ok('"All settings" returns to the grid and drops the parameter', !!el.querySelector('.st-wrap') && !el.querySelector('.st-panel') && param() === null, window.location.search);
ok('  nine areas, all 24 tiles', el.querySelectorAll('.st-group').length === 9 && el.querySelectorAll('.st-tile').length === 24, el.querySelectorAll('.st-tile').length);
ok('  and no settings card until a tile is opened', el.querySelectorAll('.main .card, main .card').length === 0 || ![...el.querySelectorAll('.card')].some(c => c.closest('.st-wrap') === null && !c.closest('.nav, aside')));
ok('  status lines are there (client emails: 0 of 4 on)', /0 of 4 on/.test(el.querySelector('[data-tile="client-emails"]').textContent));
ok('the phone shortcuts name every area', el.querySelectorAll('.st-areas .st-area').length === 9);

console.log('\neach tile opens only its own cards');
{
  const seen = new Map(); const bad = [];
  for (const t of T.TILES) {
    const tileBtn = el.querySelector(`[data-tile="${t.id}"]`);
    if (!tileBtn) { bad.push(t.id + ': no tile'); continue; }
    await click(tileBtn);
    const got = cards();
    if (param() !== t.id) bad.push(t.id + ': url ' + param());
    if (got.length !== t.cards.length) bad.push(`${t.id}: ${got.length} cards, expected ${t.cards.length} (${got.join(' | ')})`);
    for (const c of got) { if (seen.has(c)) bad.push(`"${c}" under ${seen.get(c)} and ${t.id}`); seen.set(c, t.id); }
    await click(el.querySelector('.st-back'));
  }
  ok('every tile shows exactly its own card(s), with its id in the URL', bad.length === 0, bad.join('\n        '));
  ok('  and no card shows under two tiles', [...seen.keys()].length === 24, [...seen.keys()].length);
}

console.log('\nBack and search');
{
  await click(el.querySelector('[data-tile="client-emails"]'));
  ok('opening a tile', param() === 'client-emails' && /Client emails/.test(el.querySelector('.st-title').textContent));
  await act(async () => { window.history.back(); }); await settle(200);
  ok('Back returns to the grid', !el.querySelector('.st-panel') && !!el.querySelector('.st-wrap'), window.location.search);
  const input = el.querySelector('.st-search input');
  await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'launch days'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await settle(80);
  ok('search for a setting\'s name shows its tile, and says so', el.querySelectorAll('.st-tile').length === 1 && /Has "launch days"/.test(el.querySelector('.st-tile').textContent));
  await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await settle(150);
  ok('Enter opens it', param() === 'proposals' && /Proposals/.test(el.querySelector('.st-title').textContent));
  await click(el.querySelector('.st-back'));
}

console.log('\nlayout only');
await settle(900);
ok('opening and closing every tile wrote no setting', globalThis.__SETTINGS_WRITES__.length === writesBefore, globalThis.__SETTINGS_WRITES__.length - writesBefore);
await click(el.querySelector('[data-tile="team"]'));
ok('the Team card no longer says sign-ups must be on', !/sign-ups enabled/.test(el.textContent) && /sign-ups can stay off/i.test(el.textContent));

console.log('\nthe onboarding portal\'s settings live in Settings');
{
  await click(el.querySelector('.st-back'));
  ok('a tile for them, under Clients & Onboarding, saying what is on a default', !!el.querySelector('#st-g-clients [data-tile="onboarding-portal"]') && /Never saved: using defaults/.test(el.querySelector('[data-tile="onboarding-portal"]').textContent));
  await click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === 'Onboarding')); await settle(200);
  ok('the Onboarding page no longer has the settings editor', !document.querySelector('textarea[aria-label="Portal settings JSON"]') && !!document.querySelector('.onbd-moved'));
  ok('  it points to Settings, and warns while a default is in use', /built-in default/.test(document.querySelector('.onbd-moved').textContent));
  await click([...document.querySelectorAll('.onbd-moved button')].find(b => /Open in Settings/.test(b.textContent))); await settle(200);
  ok('"Open in Settings" lands on that tile, with the editor', param() === 'onboarding-portal' && /Onboarding portal/.test((el.querySelector('.st-title') || {}).textContent || '') && /Portal settings/.test(el.querySelector('.st-panel').textContent), window.location.search);
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
