/* jsdom harness — mounts the REAL app, signed in, against a fake Supabase, and
   records everything that reaches the database.

   Why this exists: several bugs in this project passed `npm run build` and a
   manual click-through and were caught only by asserting on writes — a const
   declared below its use (TDZ crash at render, clean build), a helper called
   from the wrong scope, a str.replace that matched nothing. A green build
   proves the file parses. It proves nothing about what the app does.

   HOW IT WORKS
   esbuild (already present as a Vite dependency — no new package) bundles
   src/App.jsx with ./lib/supabase swapped for tests/stub-supabase.mjs. The
   bundle is written to a temp file and imported. The stub records every write
   on globalThis.__DB__.

   Run with:  npm i --no-save jsdom && node tests/run.mjs                     */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* ---- the fake database, shared with the stub through globalThis ---------- */
export function resetDb(initial = {}) {
  globalThis.__DB__ = {
    leads: initial.leads || [],
    settings: initial.settings || null,
    invoices: [], txns: [], tasks: [], events: [], mlogs: initial.mlogs || [],
    users: initial.users || [],
    whoami: initial.whoami !== undefined ? initial.whoami : { role: 'owner', active: true, setup: true, name: 'Garrett' },
    session: { user: { id: 'uid-owner', email: 'garrett@proytech.io' } },
    /* every write, in order */
    writes: [],
  };
  return globalThis.__DB__;
}

/* ---- bundle once, reuse across tests ------------------------------------ */
let bundlePromise = null;
function bundle() {
  if (bundlePromise) return bundlePromise;
  bundlePromise = (async () => {
    const stub = join(here, 'stub-supabase.mjs');
    const out = await build({
      /* a virtual entry so the bundle re-exports React, createRoot and act
         from the SAME React instance the app closed over. Importing react
         separately in this file would give a second copy, and hooks called
         against one copy while rendered by the other fail with
         "Invalid hook call" — which reads like an app bug and isn't. */
      stdin: {
        contents: `
          import App from ${JSON.stringify(join(root, 'src/App.jsx'))};
          import * as React from 'react';
          import * as ReactDOMClient from 'react-dom/client';
          import * as ReactTestUtils from 'react-dom/test-utils';
          export default App;
          export const __React = React;
          export const __ReactDOMClient = ReactDOMClient;
          export const __ReactTestUtils = ReactTestUtils;
        `,
        resolveDir: root,
        sourcefile: 'test-entry.js',
        loader: 'jsx',
      },
      bundle: true, write: false, format: 'esm', platform: 'browser',
      loader: { '.js': 'jsx', '.jsx': 'jsx' },
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"test"',
        /* src/lib/brand.js reads import.meta.env.* — Vite replaces those at
           build time and Node has no such object, so define it here. Brand
           name matters: it appears in the DOM and tests read the DOM. */
        'import.meta.env': JSON.stringify({
          VITE_BRAND_NAME: 'ProyTech', VITE_SUPABASE_URL: 'https://test.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'test-key', MODE: 'test', DEV: false, PROD: true,
        }),
      },
      /* App.jsx does `import { auth, db, configured } from './lib/supabase'`.
         Redirect that one specifier at resolve time so the real client — and
         the network call it would make — never loads. */
      plugins: [{
        name: 'stub-supabase',
        setup(b) {
          b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: stub }));
        },
      }],
      logLevel: 'silent',
    });
    const dir = mkdtempSync(join(tmpdir(), 'proytech-test-'));
    const file = join(dir, 'app.mjs');
    writeFileSync(file, out.outputFiles[0].text);
    return file;
  })();
  return bundlePromise;
}

/* ---- mount ---------------------------------------------------------------
   Returns { dom, container, act, text, click, find, findAll, type }.
   `act` flushes React effects AND the promise microtask queue, because the
   app's whole boot is an async effect chain: session -> whoami -> users ->
   leads -> settings -> render. */
export async function mount(initial = {}) {
  resetDb(initial);
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://crm.test/', pretendToBeVisual: true,
  });
  const w = dom.window;

  /* React + the app read these off the global scope */
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
    'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame', 'localStorage', 'sessionStorage', 'DOMParser', 'Blob', 'URL', 'FileReader', 'SVGElement']) {
    /* defineProperty, not assignment: modern Node defines `navigator` as a
       getter-only global, so `globalThis.navigator = ...` throws outright */
    if (w[k] !== undefined) {
      try { Object.defineProperty(globalThis, k, { value: w[k], writable: true, configurable: true }); }
      catch { /* a global we cannot override is a global the app can live without */ }
    }
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  /* jsdom has no layout engine; recharts asks for element sizes and would
     otherwise render nothing at all and warn on every chart */
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 800, height: 400, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0, toJSON() {} };
  };
  w.ResizeObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  w.alert = m => { globalThis.__DB__.writes.push({ op: 'alert', message: String(m) }); };
  w.confirm = () => true;
  w.prompt = () => null;

  /* every /api/* call is recorded and answered from a table the test sets, so
     nothing in a test run can reach the network */
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = opts.body; }
    globalThis.__DB__.writes.push({ op: 'fetch', url: u, body });
    const routes = initial.api || {};
    const key = Object.keys(routes).find(k => u.includes(k));
    const payload = key ? (typeof routes[key] === 'function' ? routes[key](body) : routes[key]) : { ok: false, error: 'no route' };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };

  const file = await bundle();
  const mod = await import('file://' + file + '?t=' + (globalThis.__DB__.writes.length + Math.floor(performance.now())));
  const React = mod.__React;
  const { createRoot } = mod.__ReactDOMClient;
  /* React.act on 18.3+, ReactDOMTestUtils.act on older — the latter warns
     loudly on every call, which drowns real output */
  const act = React.act || (mod.__ReactTestUtils && mod.__ReactTestUtils.act);

  const container = w.document.getElementById('root');
  const root_ = createRoot(container);

  /* flush effects and the async boot chain */
  const flush = async (times = 12) => {
    for (let i = 0; i < times; i++) {
      await act(async () => { await Promise.resolve(); });
    }
  };

  await act(async () => { root_.render(React.createElement(mod.default)); });
  await flush();

  const findAll = sel => Array.from(container.querySelectorAll(sel));
  const byText = (sel, re) => findAll(sel).find(e => re.test(e.textContent || ''));
  const click = async el => { if (!el) throw new Error('click: element not found'); await act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); }); await flush(4); };
  /* let real timers fire — settings saves are debounced 700ms, so without this
     a test asserts on a write that has not happened yet */
  const wait = async ms => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); await flush(3); };
  const type = async (el, value) => {
    if (!el) throw new Error('type: element not found');
    /* React installs its own value setter on the element; calling the native
       prototype setter is the only way to make React see the change */
    const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    await act(async () => { el.dispatchEvent(new w.Event('input', { bubbles: true })); });
    await flush(3);
  };

  return {
    dom, window: w, container, act, flush, wait, findAll, byText, click, type,
    text: () => container.textContent || '',
    db: globalThis.__DB__,
    /* close the jsdom window too: pretendToBeVisual keeps a requestAnimationFrame
       timer alive, and a test process that never exits looks exactly like a
       hung test suite */
    unmount: async () => { await act(async () => root_.unmount()); w.close(); },
  };
}
