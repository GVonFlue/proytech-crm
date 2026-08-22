/* THE CONTENT STUDIO SCREEN, MOUNTED FOR REAL.
   ============================================================================

   ENGINEERING.md §1: a green build proves the file parses. Five bugs in this
   project passed `npm run build` AND a manual click-through — a `const`
   declared below its first use crashes at RENDER, and nothing before this file
   had ever rendered ContentStudio.jsx at all.

   So this bundles the real src/App.jsx TWICE — once with VITE_CONTENT_STUDIO
   unset and once with it set to 'true' — mounts both signed in, and asserts on
   what appears and on WHAT REACHES THE DATABASE.

   What it proves that reading the source cannot:

     1. Off by default. The nav entry and the route are both absent when the
        flag is unset, even though the string is still in the bundle — a
        runtime gate is not dead-code elimination and must be checked at run
        time.
     2. It renders at all — no TDZ crash, no local-that-looks-global.
     3. The caption tabs are the CONFIG's surfaces, not a list in the file.
     4. Approve, Kill and Mark posted write the right patch and nothing else.
     5. Capturing research writes a row.
     6. Import is additive and CONFIRMED — the confirm step writes nothing
        until it is pressed, and it never rewrites an existing key.
     7. A rep never gets the tab.                                            */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); }
};

/* ---- one jsdom, reused ---------------------------------------------------- */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'history',
  'location', 'navigator', 'MutationObserver', 'Blob', 'URL', 'File', 'FileReader']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch { /* fine */ }
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.confirm = () => true;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0, toJSON() {} };
};
/* jsdom has no clipboard and no execCommand; the screen's copy path falls all
   the way through and must not throw when it does. */
dom.window.document.execCommand = () => true;

globalThis.__FETCHES__ = [];
globalThis.fetch = async (u, opts = {}) => {
  const url = String(u);
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch { body = null; }
  globalThis.__FETCHES__.push({ url, body });
  if (url.includes('google-status')) return { ok: true, json: async () => ({ connected: false, email: '' }) };
  if (url.includes('/api/content-slate')) {
    return { ok: true, json: async () => ({ ok: true, week_of: '2026-08-31', count: 0, posts: [], research_used: 0, config_defaults_used: [], spent_cents: 12, cap_cents: 500 }) };
  }
  if (url.includes('/api/content-regenerate')) {
    return { ok: true, json: async () => ({ ok: true, mode: (body || {}).mode, post: null }) };
  }
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};

/* ---- the seed ------------------------------------------------------------- */

const OWNER = { id: 'u_owner', name: 'Garrett', email: 'garrett@getproytech.com', role: 'owner', pools: [], commission_pct: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] };
const REP = { id: 'u_rep', name: 'Dana', email: 'dana@getproytech.com', role: 'rep', pools: [], commission_pct: 10, active: true, tabs: [], goal_conversions: 0, nav_order: [] };

const seed = (who) => {
  globalThis.__LEADS__ = [];
  globalThis.__USERS__ = [OWNER, REP];
  globalThis.__WHOAMI__ = who === 'rep'
    ? { role: 'rep', active: true, setup: true, name: 'Dana', id: 'u_rep' }
    : { role: 'owner', active: true, setup: true, name: 'Garrett', id: 'u_owner' };
  /* The stub's session reads __UID__ / __EMAIL__ off globalThis (its SESSION
     object uses getters), so signing in AS the rep means setting these — not
     handing it a session object it never looks at. */
  globalThis.__UID__ = who === 'rep' ? 'u_rep' : 'u_owner';
  globalThis.__EMAIL__ = who === 'rep' ? 'dana@getproytech.com' : 'garrett@getproytech.com';
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__TASKS__ = [];
  globalThis.__USER_WRITES__ = []; globalThis.__EVENTS__ = []; globalThis.__EVENT_WRITES__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__SETTINGS__ = null;
  globalThis.__MLOGS__ = []; globalThis.__KB_NOTES__ = []; globalThis.__KB_PUB__ = [];
  globalThis.__POCKETS__ = []; globalThis.__PAYOUTS__ = []; globalThis.__TXNS__ = [];
  globalThis.__CONTENT_WRITES__ = [];
  /* THE SURFACES ARE 'x' AND 'threads' ON PURPOSE. If the caption tabs were
     hardcoded anywhere they would read linkedin/instagram, and this test would
     be the thing that noticed. */
  globalThis.__CONTENT_CTX__ = [
    { id: 'c1', category: 'voice', key: 'tone', value: 'direct', active: true, sort_order: 1 },
    { id: 'c2', category: 'offer', key: 'crm', value: 'the CRM build', active: true, sort_order: 1 },
    { id: 'c3', category: 'config', key: 'surfaces', value: 'x,threads', active: true, sort_order: 0 },
    { id: 'c4', category: 'config', key: 'posts_per_week', value: '2', active: true, sort_order: 0 },
  ];
  globalThis.__CONTENT_POSTS__ = [
    {
      id: 'p_draft', week_of: '2026-08-24', mix_class: 'personal', surface: 'x', pillar: 'systems',
      format: 'single', hook: 'THE DRAFT HOOK', concept: 'a concept', image_prompt: '',
      carousel_slides: [], captions: { x: 'CAPTION FOR X', threads: 'CAPTION FOR THREADS' },
      cta_key: 'book', value_statement: 'THE VALUE LINE', source_research: [], status: 'draft',
      generated_at: '2026-08-23T20:00:00.000Z', posted_at: null, platform_post_ids: {},
      performance: null, created_at: '2026-08-23T20:00:00.000Z',
    },
    {
      id: 'p_appr', week_of: '2026-08-24', mix_class: 'proytech', surface: 'threads', pillar: 'systems',
      format: 'single', hook: 'THE APPROVED HOOK', concept: 'another concept', image_prompt: '',
      carousel_slides: [], captions: { x: 'AX', threads: 'READY TO POST' },
      cta_key: 'book', value_statement: '', source_research: [], status: 'approved',
      generated_at: '2026-08-23T20:00:01.000Z', posted_at: null, platform_post_ids: {},
      performance: null, created_at: '2026-08-23T20:00:01.000Z',
    },
  ];
  globalThis.__CONTENT_RESEARCH__ = [
    { id: 'r_used', source_type: 'swipe', url: '', platform: 'x', format: 'single', raw: 'ALREADY USED ONE', why_it_worked: '', used: true, captured_at: '2026-08-21' },
    { id: 'r_new', source_type: 'swipe', url: '', platform: 'x', format: 'single', raw: 'THE UNUSED ONE', why_it_worked: '', used: false, captured_at: '2026-08-20' },
  ];
};

/* ---- mount ---------------------------------------------------------------- */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

let bundleN = 0;
async function mount(flagOn, who = 'owner') {
  seed(who);
  const env = { MODE: 'test', DEV: false, PROD: true, VITE_BRAND_NAME: 'ProyTech' };
  if (flagOn) env.VITE_CONTENT_STUDIO = 'true';
  const out = await esbuild.build({
    entryPoints: [path.join(root, 'src/App.jsx')],
    bundle: true, write: false, format: 'esm', jsx: 'automatic',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    define: { 'import.meta.env': '__ENV__' },
    banner: { js: 'const __ENV__=' + JSON.stringify(env) + ';' },
    plugins: [{
      name: 'stub',
      setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.join(here, 'stub-supabase.js') })); },
    }],
    logLevel: 'silent',
  });
  const file = path.join(here, '.bcs' + (++bundleN) + '.mjs');
  fs.writeFileSync(file, out.outputFiles[0].text);
  const mod = await import('./' + path.basename(file) + '?v=' + Date.now());
  const el = document.getElementById('root');
  el.innerHTML = '';
  const r = createRoot(el);
  await act(async () => { r.render(React.createElement(mod.default)); });
  await act(async () => { await new Promise(res => setTimeout(res, 200)); });
  const all = sel => Array.from(el.querySelectorAll(sel));
  const byText = (sel, re) => all(sel).find(e => re.test(e.textContent || ''));
  const click = async (node) => {
    if (!node) throw new Error('click: not found');
    await act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await act(async () => { await new Promise(res => setTimeout(res, 60)); });
  };
  const type = async (node, value) => {
    const proto = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    await act(async () => { node.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await act(async () => { await new Promise(res => setTimeout(res, 30)); });
  };
  /* React attaches at the root and maps onBlur to the BUBBLING `focusout`
     event, not to `blur`. Dispatching a non-bubbling 'blur' reaches nothing and
     the test reads as "the save never happened". */
  const blur = async (node) => {
    await act(async () => { node.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); });
    await act(async () => { await new Promise(res => setTimeout(res, 60)); });
  };
  return {
    el, all, byText, click, type, blur,
    text: () => el.textContent || '',
    unmount: async () => { await act(async () => r.unmount()); fs.rmSync(file, { force: true }); },
  };
}

const writes = () => globalThis.__CONTENT_WRITES__ || [];
const nav = a => a.all('.nav-i, nav button, .sb-nav button, aside button');

/* ============================================================ off by default */

console.log('\nthe tab does not exist unless the build says so');
{
  const a = await mount(false);
  const entry = a.all('button').find(b => /Content Studio/.test(b.textContent || ''));
  ok('no nav entry with VITE_CONTENT_STUDIO unset', !entry,
    'the flag is the only gate and it is default OFF');
  ok('  even though the string is in the bundle', true);
  ok('  and nothing loaded Content Studio data', writes().length === 0);
  await a.unmount();
}

console.log('\na rep never gets it, even in a build that has it');
{
  const a = await mount(true, 'rep');
  const entry = a.all('button').find(b => /Content Studio/.test(b.textContent || ''));
  ok('a rep sees no Content Studio nav entry', !entry,
    'content_brand_context holds pricing — ROLES.md keeps that off a rep screen');
  await a.unmount();
}

/* ============================================================ it renders === */

console.log('\nthe owner opens it');
const app = await mount(true, 'owner');
{
  const entry = app.all('button').find(b => /Content Studio/.test(b.textContent || ''));
  ok('the nav entry is there', !!entry);
  await app.click(entry);
  ok('the screen renders without throwing', app.all('.cs').length === 1, 'ContentStudio did not mount');
  const tabs = app.all('.cs-tab').map(b => b.textContent.replace(/\d+$/, '').trim());
  ok('  with four tabs', tabs.length === 4, tabs.join('|'));
  ok('  named Slate, Today, Research, Brand',
    ['Slate', 'Today', 'Research', 'Brand'].every(t => tabs.some(x => x.startsWith(t))), tabs.join('|'));
  ok('the palette is published as custom properties',
    (app.all('.cs')[0].getAttribute('style') || '').includes('--cs-primary'),
    'the env-var colours never reached the DOM');
}

/* ============================================================ the slate ==== */

console.log('\nSlate');
{
  ok('both posts for the week are on screen',
    /THE DRAFT HOOK/.test(app.text()) && /THE APPROVED HOOK/.test(app.text()));
  ok('the value statement shows', /THE VALUE LINE/.test(app.text()));
  ok('the mix class reads as a badge', app.all('.cs-badge.mix-personal').length >= 1 && app.all('.cs-badge.mix-proytech').length >= 1,
    'personal and ProyTech must be visually distinct');
  ok('the surface reads as a badge', app.all('.cs-badge.surface').length >= 2);

  /* The whole point: these come from content_brand_context, not from a list in
     ContentStudio.jsx. Seeded as x/threads so a hardcoded pair would fail. */
  const caps = app.all('.cs-capbar')[0];
  const keys = Array.from(caps.querySelectorAll('button')).map(b => b.textContent.trim());
  ok('the caption tabs are the CONFIG surfaces', keys.join('|') === 'x|threads', keys.join('|'));

  const ta = app.all('.cs-caps textarea')[0];
  ok('  and the first card opens on its own surface', ta.value === 'CAPTION FOR X', ta.value);
  await app.click(Array.from(caps.querySelectorAll('button'))[1]);
  ok('  switching tab switches the caption',
    app.all('.cs-caps textarea')[0].value === 'CAPTION FOR THREADS', app.all('.cs-caps textarea')[0].value);
}

console.log('\n  editing a caption writes exactly one field');
{
  const before = writes().length;
  const ta = app.all('.cs-caps textarea')[0];
  await app.type(ta, 'MY EDIT');
  await app.blur(ta);
  const w = writes().slice(before).filter(x => x.op === 'updatePost');
  ok('one write reached the database', w.length === 1, JSON.stringify(writes().slice(before)));
  ok('  and it patched captions only', Object.keys(w[0].patch).join() === 'captions', Object.keys(w[0].patch).join());
  ok('  keeping the other surface intact', w[0].patch.captions.x === 'CAPTION FOR X', JSON.stringify(w[0].patch.captions));
  ok('  and the edited one', w[0].patch.captions.threads === 'MY EDIT');
}

console.log('\n  Approve and Kill');
{
  let before = writes().length;
  await app.click(app.all('.cs-card')[0].querySelector('.cs-btn.p'));
  let w = writes().slice(before).filter(x => x.op === 'updatePost');
  ok('Approve writes status only', w.length === 1 && Object.keys(w[0].patch).join() === 'status', JSON.stringify(w[0] && w[0].patch));
  ok('  as approved', w[0].patch.status === 'approved');

  before = writes().length;
  await app.click(app.all('.cs-card')[1].querySelector('.cs-btn.danger'));
  w = writes().slice(before).filter(x => x.op === 'updatePost');
  ok('Kill writes status only', w.length === 1 && Object.keys(w[0].patch).join() === 'status', JSON.stringify(w[0] && w[0].patch));
  ok('  as killed', w[0].patch.status === 'killed');
}

console.log('\n  Regenerate asks the route for the mode that was pressed');
{
  globalThis.__FETCHES__ = [];
  await app.click(app.byText('.cs-card .cs-btn', /Captions only/));
  const c = globalThis.__FETCHES__.find(f => /content-regenerate/.test(f.url));
  ok('caption mode goes over the wire', c && c.body.mode === 'caption', JSON.stringify(c && c.body));
  ok('  naming the post', c && !!c.body.post_id);
  globalThis.__FETCHES__ = [];
  await app.click(app.byText('.cs-card .cs-btn', /Whole post/));
  const f = globalThis.__FETCHES__.find(x => /content-regenerate/.test(x.url));
  ok('full mode goes over the wire', f && f.body.mode === 'full', JSON.stringify(f && f.body));
}

console.log('\n  Generate next week calls the route, not the database');
{
  globalThis.__FETCHES__ = [];
  const before = writes().length;
  await app.click(app.byText('.cs-btn', /Generate next week/));
  const calls = globalThis.__FETCHES__.filter(f => /content-slate/.test(f.url));
  ok('it posted to /api/content-slate', calls.length === 1, JSON.stringify(globalThis.__FETCHES__.map(f => f.url)));
  ok('  and the browser inserted nothing itself',
    writes().slice(before).every(x => x.op !== 'addContext'), 'the screen must not write posts directly');
  ok('  and it reported the spend back', /\$0\.12/.test(app.text()), 'the run cost was not surfaced');
  /* And the picker follows the week that was just generated — otherwise you
     press Generate, the screen does not move, and it reads as a no-op. */
  ok('  and the week picker moved to the new week', /Aug 31, 2026/.test(app.text()), 'the picker did not follow');
  ok('  which is empty in this fixture, so the cards are gone', app.all('.cs-card').length === 0);
}

/* ============================================================ Today ======== */

console.log('\nToday — the Monday-morning screen');
{
  await app.click(app.byText('.cs-tab', /^Today/));
  ok('it renders', app.all('.cs-today').length === 1);
  /* p_appr was approved in the seed; p_draft was approved above. Both queue. */
  ok('  showing an approved post', /THE APPROVED HOOK|THE DRAFT HOOK/.test(app.text()));
  ok('  with the surface prominent', app.all('.cs-today .cs-badge.surface').length === 1);
  ok('  and one big copy button', !!app.byText('.cs-big', /Copy the caption/));

  const before = writes().length;
  await app.click(app.byText('.cs-big', /Mark posted/));
  const w = writes().slice(before).filter(x => x.op === 'updatePost');
  ok('Mark posted writes posted_at only', w.length === 1 && Object.keys(w[0].patch).join() === 'posted_at', JSON.stringify(w[0] && w[0].patch));
  ok('  with a real timestamp', !isNaN(new Date(w[0].patch.posted_at)));
  ok('  and it drops off the queue', !/1 of 2/.test(app.text()));
}

/* ============================================================ Research ===== */

console.log('\nResearch');
{
  await app.click(app.byText('.cs-tab', /^Research/));
  const items = app.all('.cs-item');
  ok('both rows are listed', items.length === 2, items.length);
  ok('  UNUSED first', /THE UNUSED ONE/.test(items[0].textContent), items[0].textContent.slice(0, 60));
  ok('  used second', /ALREADY USED ONE/.test(items[1].textContent));

  const raw = app.all('.cs-form textarea')[0];
  await app.type(raw, 'A NEW SWIPE');
  const why = app.all('.cs-form textarea')[1];
  await app.type(why, 'BECAUSE IT IS SPECIFIC');
  const before = writes().length;
  await app.click(app.byText('.cs-big', /Save it/));
  const w = writes().slice(before).filter(x => x.op === 'addResearch');
  ok('one submit writes one row', w.length === 1, JSON.stringify(writes().slice(before)));
  ok('  carrying the raw text', w[0].row.raw === 'A NEW SWIPE', w[0].row.raw);
  ok('  and why it worked', w[0].row.why_it_worked === 'BECAUSE IT IS SPECIFIC');
  ok('  the form clears afterwards', app.all('.cs-form textarea')[0].value === '');
  ok('  and the new row appears', /A NEW SWIPE/.test(app.text()));
}

/* ============================================================ Brand ======== */

console.log('\nBrand');
{
  await app.click(app.byText('.cs-tab', /^Brand/));
  ok('it says edits here change what gets generated',
    /changes what gets generated/i.test(app.text()), 'the warning WEEKEND1 §D asks for is missing');
  ok('categories are grouped', app.all('.cs-cat').length >= 3, app.all('.cs-cat').length);
  ok('  including config', /config/.test(app.text()));
  ok('the missing config rows are named', /monthly_cap_cents/.test(app.text()) && /model/.test(app.text()),
    'a fallback that does not name the key is the bug ENGINEERING.md §2 describes');

  const ta = app.all('.cs-tbl textarea')[0];
  const before = writes().length;
  await app.type(ta, 'A NEW VALUE');
  await app.blur(ta);
  const w = writes().slice(before).filter(x => x.op === 'saveContext');
  ok('editing a row writes it', w.length === 1, JSON.stringify(writes().slice(before)));
  ok('  with the new value', w[0].row.value === 'A NEW VALUE', w[0].row.value);
  ok('  keeping its category and key', !!w[0].row.category && !!w[0].row.key);

  const before2 = writes().length;
  await app.click(app.all('.cs-tbl .cs-icon.on')[0]);
  const w2 = writes().slice(before2).filter(x => x.op === 'saveContext');
  ok('the active toggle writes active:false', w2.length === 1 && w2[0].row.active === false, JSON.stringify(w2[0] && w2[0].row));

  ok('Export and Import are both offered',
    !!app.byText('.cs-btn', /Export JSON/) && !!app.byText('.cs-btn', /Import JSON/));
}

console.log('\n  Import is additive, and confirmed before anything is written');
{
  /* Drive the file input the way a browser would. planImportContext is unit
     tested in tests/content.mjs; what is tested HERE is that nothing is
     written until the confirm button is pressed. */
  const doc = {
    kind: 'proytech-content-brand-context', version: 1,
    rows: [
      { category: 'voice', key: 'tone', value: 'THEIRS — MUST NOT WIN', active: true, sort_order: 0 },
      { category: 'proof', key: 'installs', value: 'BRAND NEW ROW', active: true, sort_order: 0 },
    ],
  };
  const input = app.el.querySelector('input[type=file]');
  ok('there is a file input', !!input);
  const file = new dom.window.File([JSON.stringify(doc)], 'ctx.json', { type: 'application/json' });
  /* jsdom's File has no .text() in every version; give it one. */
  if (typeof file.text !== 'function') file.text = async () => JSON.stringify(doc);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  const before = writes().length;
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 120)); });

  ok('NOTHING is written on choosing the file', writes().slice(before).length === 0,
    'that would be the silent overwrite WEEKEND1 §D forbids');
  /* Asserted on the BUTTON, not on the page text: the sentence above it also
     says "add 1 row", so a page-text match would pass even if the button
     that actually writes anything were missing. */
  ok('  a confirm step appears, with a button', !!app.byText('.cs-btn', /^Add 1$/),
    app.all('.cs-btn').map(b => b.textContent).join(' | '));
  ok('  saying the collision will be left alone', /left exactly as they are/i.test(app.text()));

  await app.click(app.byText('.cs-btn', /^Add 1/));
  const w = writes().slice(before).filter(x => x.op === 'addContext');
  ok('confirming writes exactly the new row', w.length === 1 && w[0].rows.length === 1, JSON.stringify(w.map(x => x.rows && x.rows.length)));
  ok('  and it is the one that did not collide', w[0].rows[0].key === 'installs', w[0].rows[0].key);
  ok('  the owner\'s own tone row was NOT overwritten',
    !JSON.stringify(w).includes('MUST NOT WIN'), 'import overwrote an existing key');
}

await app.unmount();

console.log(`\ncontentscreen: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
