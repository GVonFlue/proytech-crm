/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lib = bundleName('pmlib');
const B_app = bundleName('pmapp');
/* THE PRODUCT MAP AS A FORM (Settings → Onboarding portal).

   One row per package and add-on in the saved offer (Settings → Proposals),
   a checkbox per portal product, and a warning while any offered PACKAGE has
   no mapping (the case that sent #109's "package not in your product map"
   email). Same storage as before (settings.onboarding.productMap, {itemId:
   [products]}), read by the same readOnbConfig; the raw JSON editor is behind
   "Advanced".

   Pure: rows from offer + map; a flip adds/removes one product, keeps every
   other key (ids no longer in the offer too), drops an emptied key, refuses
   an unknown product. In the real app: the warning names the unmapped
   package; ticking writes exactly the map the JSON would, the rest of the
   portal settings untouched; the warning clears; Advanced shows the JSON with
   the new map. Seen red with setMapping dropping the other keys. */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };
const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };
{ const a = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/onboarding.js'] }); fs.writeFileSync('tests/' + B_lib, a.outputFiles[0].text); }
const L = await import('./' + B_lib + '?v=' + Date.now());

const OFFER = { packages: [{ id: 'growth-os', name: 'Growth OS' }, { id: 'business-suite', name: 'Business Suite' }], addons: [{ id: 'automations', name: 'Automations' }] };
const MAP = { 'growth-os': ['website', 'suite'], 'old-package': ['website'] };

console.log('\nthe rows');
{
  const r = L.productMapRows(OFFER, MAP);
  ok('one row per package and add-on, in offer order', r.packages.map(x => x.id).join() === 'growth-os,business-suite' && r.addons.map(x => x.id).join() === 'automations');
  ok('  a mapped package shows its products', JSON.stringify(r.packages[0].products) === '["website","suite"]' && !r.packages[0].unmapped);
  ok('  an unmapped package is named for the warning', r.unmappedPackages.join() === 'Business Suite');
  ok('  an unmapped add-on is not (an add-on may add no section)', !r.unmappedPackages.includes('Automations') && r.addons[0].unmapped);
  ok('  a mapped id the offer no longer has is kept and listed', r.extra.join() === 'old-package');
}
console.log('\nflipping one box');
{
  const m1 = L.setMapping(MAP, 'business-suite', 'suite', true);
  ok('adds the product', JSON.stringify(m1['business-suite']) === '["suite"]');
  ok('  keeps every other key, the old one too', JSON.stringify(m1['growth-os']) === '["website","suite"]' && JSON.stringify(m1['old-package']) === '["website"]');
  ok('  and never edits the map it was given', !('business-suite' in MAP));
  const m2 = L.setMapping(m1, 'business-suite', 'suite', false);
  ok('unticking the last one drops the key (readOnbConfig ignores empty entries anyway)', !('business-suite' in m2));
  ok('products stay in canonical order', JSON.stringify(L.setMapping({ x: ['automations'] }, 'x', 'website', true).x) === '["website","automations"]');
  ok('an unknown product is refused', JSON.stringify(L.setMapping(MAP, 'growth-os', 'rocket', true)) === JSON.stringify(MAP));
  const cfg = L.readOnbConfig({ onboarding: { productMap: m1 } }, OFFER).config;
  ok('readOnbConfig reads the form\'s map exactly as it reads the JSON\'s', JSON.stringify(cfg.productMap['business-suite']) === '["suite"]' && JSON.stringify(cfg.productMap['growth-os']) === '["website","suite"]');
}

/* ------------------------------------------------------------------ the app */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/?settings=onboarding-portal', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'FocusEvent',
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
globalThis.__LEADS__ = []; globalThis.__ONBOARDINGS__ = [];
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'clients', 'onboarding', 'settings'], modulesV: 9, options: {}, pools: ['General'], retainerStartCleared: true,
  stages: [{ key: 'new', label: 'New', color: '#6B73C9', prob: .1, open: true, won: false, lost: false }],
  offer: { ...OFFER, company: { name: 'Agency' }, launchDays: 14 }, onboarding: { state: 'KS', kickoffUrl: 'https://cal.test/k', productMap: MAP } };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
{ const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text); }
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async e => { if (!e) throw new Error('click: element not found'); await act(async () => { e.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await settle(80); };
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(1200);

console.log('\nthe form, in Settings → Onboarding portal');
const box = (id, product) => el.querySelector(`.pm-row[data-item="${id}"] input[aria-label$="${product}"]`);
ok('the tile opens with the form', !!el.querySelector('.pm') && el.querySelectorAll('.pm-row').length === 3, (el.querySelector('.st-title') || {}).textContent);
ok('  the warning names the unmapped package', /No sections chosen for Business Suite/.test((el.querySelector('.pm-warn') || {}).textContent || ''));
ok('  Growth OS shows Website and Business Suite ticked', box('growth-os', 'Website').checked && box('growth-os', 'Business Suite').checked && !box('growth-os', 'Automations').checked);
ok('  the old mapped id is listed as kept', /not in your offer now: old-package/.test(el.querySelector('.pm').textContent));
ok('  and the JSON editor is behind Advanced, closed', !el.querySelector('textarea[aria-label="Portal settings JSON"]') && /Advanced: edit as JSON/.test(el.textContent));
const w0 = globalThis.__SETTINGS_WRITES__.length;
await click(box('business-suite', 'Business Suite'));
await settle(900);
const saved = (globalThis.__SETTINGS_WRITES__.slice(w0).pop() || {}).onboarding || {};
ok('ticking Business Suite for it saves productMap["business-suite"] = ["suite"]', JSON.stringify((saved.productMap || {})['business-suite']) === '["suite"]', JSON.stringify(saved));
ok('  every other mapping is kept, the old one too', JSON.stringify(saved.productMap['growth-os']) === '["website","suite"]' && JSON.stringify(saved.productMap['old-package']) === '["website"]');
ok('  and the rest of the portal settings are untouched', saved.state === 'KS' && saved.kickoffUrl === 'https://cal.test/k');
ok('  the warning clears', !el.querySelector('.pm-warn'));
await click([...el.querySelectorAll('button')].find(b => /Advanced: edit as JSON/.test(b.textContent)));
const ta = el.querySelector('textarea[aria-label="Portal settings JSON"]');
ok('Advanced shows the JSON, with the map the form just saved', !!ta && JSON.parse(ta.value).productMap['business-suite'][0] === 'suite', ta && ta.value.slice(0, 200));

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
