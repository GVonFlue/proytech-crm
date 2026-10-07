/* DELETING AND ARCHIVING PROPOSALS, IN THE REAL APP.
   ============================================================================

   Mounts App.jsx against tests/stub-supabase.js, whose deleteProposal and
   archiveProposal model PROPOSALS-ARCHIVE-MIGRATION.sql (an accepted proposal
   is refused, only an accepted one archives). Asserts on what reaches the
   database (__PROPOSAL_DELETES__, __PROPOSAL_ARCHIVES__, __WRITES__):

     - a draft: delete after "Delete this draft?"
     - sent, viewed or expired: Delete, with a confirm that NAMES the client;
       Cancel deletes nothing; OK deletes it and notes the lead
     - accepted: no Delete anywhere; Archive / Unarchive instead
     - the list: archived ones hidden by default, "Show archived" brings them
       back, the stat tiles still count them
     - the data layer never asks to delete an accepted row

   Postgres's own refusal is tests/proposalsdb.mjs (PGlite) and VERIFY-RLS
   §12c. Dates are relative to today.                                       */
/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_parch = bundleName('parch');
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

const ago = n => new Date(Date.now() - n * 864e5).toISOString();
const ahead = n => new Date(Date.now() + n * 864e5).toISOString();
const OFFER = JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8'));
const body = (headline, company) => ({ client: { name: 'C', company }, company: { name: 'Agency' }, copy: { headline },
  quote: { packageId: 'growth-os', items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package', setup: 3000, monthly: 299 }], setup: 3000, deposit: 1500, depositPct: 50, monthly: 299 } });
const P = (id, o) => ({ id, token: (id + 'T'.repeat(43)).slice(0, 43), valid_days: 7, notes: '', created_at: ago(9), updated_at: ago(1), ...o });
globalThis.__USERS__ = [{ id: 'u1', name: 'Garrett', email: 'g@agency.test', role: 'owner', active: true, pools: [], tabs: [], nav_order: [] }];
globalThis.__WHOAMI__ = { ...globalThis.__USERS__[0], setup: true }; globalThis.__UID__ = 'u1';
globalThis.__SETTINGS__ = { offer: OFFER };
globalThis.__ONBOARDINGS__ = [];
globalThis.__LEADS__ = ['L1', 'L2', 'L3', 'L4', 'L5'].map((id, i) => ({ id, name: ['Dee Draft', 'Sam Sent', 'Ann Accepted', 'Ora Old', 'Vic Viewed'][i], company: ['Draft Co', 'Reed Realty', 'Accept Co', 'Archive Co', 'View Co'][i],
  stage: 'proposal', owner: 'Garrett', activities: [], meetings: [], deals: [], dealValue: 0, createdAt: ago(20) }));
globalThis.__PROPOSALS__ = [
  P('p-draft', { lead_id: 'L1', status: 'draft', body: body('Draft one', 'Draft Co') }),
  P('p-sent', { lead_id: 'L2', status: 'sent', body: body('Sent one', 'Reed Realty'), sent_at: ago(3), expires_at: ahead(4) }),
  P('p-acc', { lead_id: 'L3', status: 'accepted', body: body('Accepted one', 'Accept Co'), sent_at: ago(8), viewed_at: ago(7), accepted_at: ago(6), accepted_name: 'Ann', accepted_ip: '1.1.1.1', accepted_plan: 'monthly', applied_at: ago(6), expires_at: ago(1) }),
  P('p-arch', { lead_id: 'L4', status: 'accepted', body: body('Archived one', 'Archive Co'), sent_at: ago(40), accepted_at: ago(38), accepted_name: 'Ora', accepted_ip: '1.1.1.1', accepted_plan: 'monthly', applied_at: ago(38), expires_at: ago(30), archived_at: ago(5) }),
  P('p-exp', { lead_id: 'L5', status: 'viewed', body: body('Expired one', 'View Co'), sent_at: ago(20), viewed_at: ago(19), expires_at: ago(10) }),
];
let confirms = [], answer = true;
const confirmStub = m => { confirms.push(String(m)); return answer; };
globalThis.confirm = confirmStub; dom.window.confirm = confirmStub;

const out = await esbuild.build({ entryPoints: ['src/App.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' },
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel: 'silent' });
fs.writeFileSync('tests/'+B_parch, out.outputFiles[0].text);
const mod = await import('./'+B_parch+'?v=' + Date.now());
fs.unlinkSync('tests/'+B_parch);
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

const rows = () => [...document.querySelectorAll('.pp-row')];
const row = re => rows().find(r => re.test(txt(r)));
const btn = re => [...document.querySelectorAll('button')].find(b => re.test(txt(b).trim()));
const back = async () => { const b = btn(/All proposals/); if (b) await click(b); await act(async () => { await new Promise(r => setTimeout(r, 80)); }); };

await nav('Proposals');

console.log('\nthe list');
{
  ok('an archived proposal is not in the default list', !row(/Archive Co/) && !!row(/Accept Co/) && rows().length === 4, rows().map(txt).join(' | ').slice(0, 300));
  const chip = btn(/Show archived/);
  ok('a "Show archived" chip, with the count', chip && /1$/.test(txt(chip).trim()));
  ok('the Accepted tile still counts it (history)', /Accepted\s*2\b/.test(txt(document.querySelector('.pp-stats'))), txt(document.querySelector('.pp-stats')));
  await click(chip);
  const ar = row(/Archive Co/);
  ok('Show archived brings it back, marked Archived', ar && /Archived/.test(txt(ar)));
  await click(btn(/Hide archived/));
  ok('and Hide archived puts it away again', !row(/Archive Co/));
}

console.log('\nan ACCEPTED proposal: archive, never delete');
{
  await click(row(/Accept Co/));
  ok('no Delete button anywhere', !btn(/^Delete$/) && !document.querySelector('[title="Delete this draft"]'));
  const a = btn(/^Archive$/);
  ok('an Archive button', !!a);
  await click(a);
  const w = (globalThis.__PROPOSAL_ARCHIVES__ || []).at(-1);
  ok('Archive writes archived_at on that proposal, nothing else', w && w.id === 'p-acc' && w.on === true && !(globalThis.__PROPOSAL_DELETES__ || []).length, JSON.stringify(globalThis.__PROPOSAL_ARCHIVES__));
  ok('  and it leaves the default list', !row(/Accept Co/));
  await click(btn(/Show archived/));
  await click(row(/Archive Co/));
  ok('an archived one offers Unarchive', !!btn(/^Unarchive$/));
  await click(btn(/^Unarchive$/));
  ok('Unarchive clears it', (globalThis.__PROPOSAL_ARCHIVES__ || []).at(-1).id === 'p-arch' && (globalThis.__PROPOSAL_ARCHIVES__ || []).at(-1).on === false);
  const stillThere = globalThis.__PROPOSALS__.filter(p => p.status === 'accepted').map(p => p.id).sort().join();
  ok('both accepted proposals are still in the database', stillThere === 'p-acc,p-arch', stillThere);
}

console.log('\na SENT proposal: delete, with a confirm that names the client');
{
  await click(btn(/Hide archived/) || btn(/Show archived/));
  await click(row(/Reed Realty/));
  const d = btn(/^Delete$/);
  ok('a Delete button', !!d);
  confirms = []; answer = false;
  await click(d);
  ok('the confirm names the client and says the link stops working', confirms.length === 1 && /Delete the proposal you sent to Reed Realty\?/.test(confirms[0]) && /link will stop working/.test(confirms[0]) && /can't be undone/.test(confirms[0]), confirms[0]);
  ok('Cancel deletes nothing', !(globalThis.__PROPOSAL_DELETES__ || []).length && globalThis.__PROPOSALS__.some(p => p.id === 'p-sent'));
  answer = true; globalThis.__WRITES__.length = 0;
  await click(btn(/^Delete$/));
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
  ok('OK deletes it', (globalThis.__PROPOSAL_DELETES__ || []).includes('p-sent') && !globalThis.__PROPOSALS__.some(p => p.id === 'p-sent'));
  const lw = globalThis.__WRITES__.filter(w => w.id === 'L2').at(-1);
  const n = lw && (lw.activities || [])[0];
  ok('the lead gets a note: who deleted it, and when it was sent', n && /^Proposal deleted by Garrett \(it was sent [A-Z][a-z]{2} \d{1,2}\)\.$/.test(n.text) && n.who === 'Garrett', n && n.text);
  ok('back on the list, it is gone', !row(/Reed Realty/));
}

console.log('\nan EXPIRED (viewed) proposal: same stronger confirm');
{
  await click(row(/View Co/));
  confirms = []; answer = true;
  await click(btn(/^Delete$/));
  ok('names the client', /sent to View Co\?/.test(confirms[0] || ''), confirms[0]);
  ok('deleted', !globalThis.__PROPOSALS__.some(p => p.id === 'p-exp'));
}

console.log('\na DRAFT: delete after "Delete this draft?"');
{
  await click(row(/Draft Co/));
  const d = document.querySelector('[title="Delete this draft"]');
  ok('the draft delete button', !!d);
  confirms = []; answer = true;
  await click(d);
  ok('the plain confirm', confirms[0] === 'Delete this draft?', confirms[0]);
  ok('deleted', !globalThis.__PROPOSALS__.some(p => p.id === 'p-draft'));
  ok('and no stronger "Delete" on a draft', true);
}

console.log('\nthe data layer');
{
  const sb = fs.readFileSync('src/lib/supabase.js', 'utf8');
  const del = sb.slice(sb.indexOf('async deleteProposal('), sb.indexOf('async archiveProposal('));
  ok('deleteProposal never targets an accepted row', /\.neq\('status', 'accepted'\)/.test(del) && /\.is\('accepted_at', null\)/.test(del));
  ok('  and throws when nothing was deleted (never reports a row as gone that is not)', /if \(!Array\.isArray\(data\) \|\| !data\.length\) throw/.test(del));
  const arc = sb.slice(sb.indexOf('async archiveProposal('), sb.indexOf('async archiveProposal(') + 700);
  ok('archiveProposal only touches an accepted row, and only archived_at', /\.eq\('status', 'accepted'\)/.test(arc) && /update\(\{ archived_at:/.test(arc));
  ok('the list reads archived_at, with a named fallback', /const ARCHIVE = \['archived_at'\]/.test(sb) && /run PROPOSALS-ARCHIVE-MIGRATION\.sql/.test(sb));
}

console.log('\nthe migration (shape; tests/proposalsdb.mjs runs it)');
{
  const sql = fs.readFileSync('PROPOSALS-ARCHIVE-MIGRATION.sql', 'utf8');
  ok('one transaction that checks itself', /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && sql.indexOf('PROPOSALS-ARCHIVE OK') < sql.indexOf('commit;'));
  ok('BEFORE DELETE and BEFORE UPDATE triggers', /before delete on proposals/.test(sql) && /before update on proposals/.test(sql));
  ok('a trigger, so it binds every role (no policy change)', !/create policy|drop policy|grant /i.test(sql.replace(/--[^\n]*/g, '')));
  for (const col of ['status', 'body', 'accepted_at', 'accepted_name', 'accepted_ip', 'accepted_plan', 'accepted_terms_version', 'accepted_terms_url', 'accepted_privacy_url'])
    ok(`  an accepted proposal's ${col} cannot change`, new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`).test(sql));
  ok('  archived_at is not in that list (archiving still works)', !/new\.archived_at\s+is distinct from old\.archived_at/.test(sql));
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
