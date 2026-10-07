/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_lib = bundleName('rslib');
const B_lead = bundleName('rslead');
const B_app = bundleName('rsapp');
/* REVENUE BY RELATIONSHIP SOURCE (Relationships & Referrals spec, Part 2).
   ============================================================================

   TWO FACTS: referredBy (who gets credit: a person via introducedBy, else a
   non-person source) and arrivedVia (the channel, the lead's `source`).
   Picking a person never overwrites the channel.

   THE RULES, pure (lib/sources):
     - every existing shape maps without a migration: a linked person, a
       person whose record is gone, "Intro from Dana" unlinked, "Referral"
       with nobody recorded, any other source, nothing at all
     - the coffee page's "Intro from" line arrived via the coffee page
     - credit is direct only (a chain credits the last link, once)
     - roll-ups from real-shaped lead data: leads referred, clients won,
       conversion, setup won, MRR, and the channel breakdown under each row
     - reassigning who referred a lead moves its revenue, and the total does
       not move
     - THE MONEY IS THE MONEY PAGE'S: for every month, the rows sum to
       revenueForMonth's client revenue for the same leads; setup + retainer
       cash = revenue; MRR is billsMrr's; nothing is counted twice
     - periods: this month / quarter / year / all time
     - a change to either fact is noted, and the note is not a touch

   THE REAL APP, as the owner:
     - Relationships has a Sources view; the dashboard's Lead source ROI card
       is the top of the same board and opens it
     - a relationship record's "setup won" is its leaderboard row
     - changing "Referred by" on a record writes ONE patch: the person, the
       channel untouched, and the note
   The rep side is tests/relsourcesrep.mjs. */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 500) : '')); } };
const BUILD = { bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' };

const isoD = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const TODAY = isoD(new Date());
const Y = +TODAY.slice(0, 4), M = TODAY.slice(5, 7);
const THIS_MONTH = `${Y}-${M}`;
const day1 = `${THIS_MONTH}-01`;
const LAST_YEAR = `${Y - 1}-06-15`;

{ const a = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/sources.js'] }); fs.writeFileSync('tests/' + B_lib, a.outputFiles[0].text);
  const b = await esbuild.build({ ...BUILD, entryPoints: ['src/lib/lead.js'] }); fs.writeFileSync('tests/' + B_lead, b.outputFiles[0].text); }
const SRC = await import('./' + B_lib + '?v=' + Date.now());
const LEAD = await import('./' + B_lead + '?v=' + Date.now());

const STAGES = [{ key: 'new', label: 'New', open: true, won: false, lost: false, prob: .1 }, { key: 'won', label: 'Won', open: false, won: true, lost: false, prob: 1 }, { key: 'lost', label: 'Lost', open: false, won: false, lost: true, prob: 0 }];
const base = o => ({ stage: 'new', createdAt: `${day1}T12:00:00Z`, activities: [], meetings: [], payments: [], retainerPayments: [], labels: [], keyDates: [], ...o });
/* a client: converted, deposit ticked (so cash is confirmed), payments dated */
const client = (o, pays = [], ret = []) => base({ stage: 'won', isClient: true, convertedAt: day1, closedAt: day1, onboarding: { deposit_paid: { done: day1 } },
  payments: pays.map((p, i) => ({ id: o.id + 'p' + i, amount: p[0], date: p[1] })), retainerPayments: ret.map((p, i) => ({ id: o.id + 'r' + i, amount: p[0], date: p[1] })), ...o });

const DANA = base({ id: 'dana', name: 'Dana Realtor', isRelationship: true, relTier: 'champion' });
const MARCUS = base({ id: 'marcus', name: 'Marcus Title', isRelationship: true, relTier: 'b' });
const LEADS = [
  DANA, MARCUS,
  client({ id: 'c1', name: 'Coffee Client', introducedBy: 'dana', source: 'Coffee page', retainer: 300, retainerActive: true, retainerStart: day1 }, [[2000, day1]], [[300, day1]]),
  client({ id: 'c2', name: 'Event Client', introducedBy: 'dana', source: 'Event' }, [[1000, day1], [500, LAST_YEAR]]),
  base({ id: 'l3', name: 'Dana Open Lead', introducedBy: 'dana', source: 'Coffee page' }),
  client({ id: 'c4', name: 'Web Client', source: 'Website' }, [[1500, day1]]),
  base({ id: 'l5', name: 'Web Lead', source: 'Website' }),
  base({ id: 'l6', name: 'Intro Lead', source: 'Intro from Pat', labels: ['Coffee'] }),
  base({ id: 'l7', name: 'Mystery Referral', source: 'Referral' }),
  base({ id: 'l8', name: 'Nobody Knows' }),
  base({ id: 'l9', name: 'Ghost Ref', introducedBy: 'deleted-person', source: 'Networking' }),
  /* a chain: Sam was referred by Marcus, who was referred by Dana */
  client({ id: 'sam', name: 'Sam Chain', introducedBy: 'marcus', source: 'Referral' }, [[800, day1]]),
];
const byId = new Map(LEADS.map(l => [l.id, l]));
const find = (ro, key) => ro.rows.find(x => x.key === key);

console.log('\nreferredBy: every existing shape, no migration');
{
  const rb = id => SRC.referredBy(byId.get(id), byId);
  ok('a linked person gets the credit', rb('c1').kind === 'person' && rb('c1').label === 'Dana Realtor');
  ok('a person whose record is gone is still a person, "(removed contact)"', rb('l9').kind === 'person' && rb('l9').gone && rb('l9').label === '(removed contact)');
  ok('"Intro from Pat" with nobody linked is its own row', rb('l6').kind === 'unlinked' && rb('l6').label === 'Intro from Pat (not linked)');
  ok('"Referral" with nobody recorded is its own row, never folded into a person', rb('l7').kind === 'unrecorded' && rb('l7').key === SRC.UNRECORDED_KEY);
  ok('any other source is a channel', rb('c4').kind === 'source' && rb('c4').label === 'Website');
  ok('nothing at all is Unknown, not dropped', rb('l8').kind === 'unknown');
  ok('a record pointed at itself is not its own referrer', SRC.referredBy({ id: 'x', introducedBy: 'x', source: 'Website' }, byId).kind === 'source');
}

console.log('\narrivedVia: the channel, kept when a person is picked');
{
  ok('Dana gets credit for c1, and c1 still arrived via the coffee page', SRC.referredBy(byId.get('c1'), byId).id === 'dana' && SRC.arrivedVia(byId.get('c1')).label === 'Coffee page');
  ok('the coffee page\'s "Intro from Pat" arrived via the coffee page', SRC.arrivedVia(byId.get('l6')).label === 'Coffee page');
  ok('  without the coffee label, an "Intro from" line arrived as a referral', SRC.arrivedVia({ source: 'Intro from Pat' }).label === 'Referral');
  ok('nothing: Unknown', SRC.arrivedVia({}).label === 'Unknown');
}

console.log('\nthe roll-up, all time');
const all = SRC.sourceRollup(LEADS, STAGES, { period: 'all', today: TODAY });
{
  const d = find(all, 'person:dana');
  ok('Dana: 3 leads referred, 2 clients won', d && d.leads === 3 && d.won === 2, JSON.stringify(d && { leads: d.leads, won: d.won }));
  ok('  conversion 2 of 3', d && Math.abs(d.rate - 2 / 3) < 1e-9);
  ok('  setup won $3,500 (2000 + 1000 + 500 last year), retainer cash kept out of it', d && d.setup === 3500 && d.retainerCash === 300, JSON.stringify(d && { setup: d.setup, ret: d.retainerCash }));
  ok('  MRR $300, from the active retainer', d && d.mrr === 300);
  const chs = d ? d.channels.map(c => c.label) : [];
  ok('  broken down by how they arrived: Coffee page and Event', chs.includes('Coffee page') && chs.includes('Event') && chs.length === 2, JSON.stringify(chs));
  const cp = d && d.channels.find(c => c.label === 'Coffee page');
  ok('    the coffee page brought 2 of her leads, 1 won, $2,000 setup', cp && cp.leads === 2 && cp.won === 1 && cp.setup === 2000, JSON.stringify(cp));
  ok('Dana ranks first (most setup won)', all.rows[0].key === 'person:dana', all.rows[0].key);
  const w = find(all, 'source:website');
  ok('Website: 2 leads, 1 won, $1,500', w && w.leads === 2 && w.won === 1 && w.setup === 1500);
  ok('direct credit only: Sam is Marcus\'s, and not Dana\'s too', find(all, 'person:marcus') && find(all, 'person:marcus').won === 1 && !find(all, 'person:dana').ids.includes('sam'));
  ok('relationships themselves are not counted as referred leads', !all.rows.some(r => r.ids.includes('dana') || r.ids.includes('marcus')));
  ok('the unlinked, unrecorded and unknown rows are all there', ['unlinked:pat', SRC.UNRECORDED_KEY, SRC.UNKNOWN_KEY].every(k => find(all, k)), JSON.stringify(all.rows.map(r => r.key)));
}

console.log('\nthe money is the Money page\'s');
{
  const moneyLeads = LEADS;
  const months = [THIS_MONTH, LAST_YEAR.slice(0, 7)];
  for (const k of months) {
    const page = LEAD.revenueForMonth(moneyLeads, STAGES, [], k).clientRevenueMonth;
    const mine = moneyLeads.reduce((a, l) => a + SRC.leadRevenue(l, STAGES, { from: k + '-01', to: k + '-31' }).total, 0);
    ok(`${k}: per-lead revenue sums to the Money page's client revenue (${page})`, page > 0 && Math.abs(page - mine) < 1e-9, `${page} vs ${mine}`);
  }
  ok('every row\'s setup + retainer cash is its revenue', all.rows.every(r => Math.abs(r.setup + r.retainerCash - r.revenue) < 1e-9));
  const allRev = months.reduce((a, k) => a + LEAD.revenueForMonth(moneyLeads, STAGES, [], k).clientRevenueMonth, 0);
  ok('the board\'s total revenue is the Money page\'s, every month added (nothing twice)', Math.abs(all.totals.revenue - allRev) < 1e-9, `${all.totals.revenue} vs ${allRev}`);
  const mrrPage = moneyLeads.filter(l => LEAD.billsMrr ? LEAD.billsMrr(l) : false).reduce((a, l) => a + Number(l.retainer || 0), 0);
  ok('total MRR is the active retainers', all.totals.mrr === 300 && (!LEAD.billsMrr || mrrPage === 300), `${all.totals.mrr} / ${mrrPage}`);
}

console.log('\nreassigning a source moves its revenue');
{
  const moved = LEADS.map(l => (l.id === 'c2' ? { ...l, introducedBy: 'marcus' } : l));
  const after = SRC.sourceRollup(moved, STAGES, { period: 'all', today: TODAY });
  ok('Dana loses c2\'s $1,500', find(after, 'person:dana').setup === 2000, find(after, 'person:dana').setup);
  ok('Marcus gains it', find(after, 'person:marcus').setup === 800 + 1500, find(after, 'person:marcus').setup);
  ok('the total does not move', after.totals.setup === all.totals.setup && after.totals.revenue === all.totals.revenue);
  ok('c2 still arrived via the event', SRC.arrivedVia(moved.find(l => l.id === 'c2')).label === 'Event');
}

console.log('\nperiods');
{
  const month = SRC.sourceRollup(LEADS, STAGES, { period: 'month', today: TODAY });
  ok('this month: Dana\'s setup leaves out last year\'s $500', find(month, 'person:dana').setup === 3000, find(month, 'person:dana').setup);
  const yr = SRC.periodRange('year', TODAY), q = SRC.periodRange('quarter', TODAY), mo = SRC.periodRange('month', TODAY);
  ok('ranges: year from Jan 1, quarter from its first month, month from the 1st, all to today',
    yr.from === `${Y}-01-01` && mo.from === day1 && /^\d{4}-(01|04|07|10)-01$/.test(q.from) && yr.to === TODAY && SRC.periodRange('all', TODAY).from === null);
  ok('a lead added last year is not "referred" this month', SRC.sourceRollup([...LEADS, base({ id: 'old', introducedBy: 'dana', createdAt: `${LAST_YEAR}T12:00:00Z` })], STAGES, { period: 'month', today: TODAY }).rows.find(r => r.key === 'person:dana').leads === 3);
}

console.log('\nthe change note');
{
  const c = SRC.sourceChange(byId.get('c1'), { introducedBy: 'marcus', source: 'Event' }, byId);
  ok('both facts noted, with names', JSON.stringify(c) === JSON.stringify({ referred: ['Dana Realtor', 'Marcus Title'], arrived: ['Coffee page', 'Event'] }), JSON.stringify(c));
  const same = SRC.sourceChange(byId.get('c1'), { introducedBy: 'dana' }, byId);
  ok('nothing noted when nothing changed', !same.referred && !same.arrived);
  const a = { id: 'n', ts: new Date().toISOString(), type: 'Note', text: `Referred by: ${c.referred[0]} → ${c.referred[1]}`, who: 'Garrett' };
  ok('the notes are app-written and never a touch', LEAD.isSystemNote(a) && !LEAD.isRealTouch(a) && LEAD.isSystemNote({ ...a, text: 'Arrived via: Coffee page → Event' }));
}

console.log('\nthe referrals ledger is styled on the light record');
{
  /* Same check as tests/reachout.mjs: comments stripped, and each rule must
     exist OUTSIDE the retired .modal.lead scope, where it rendered as raw
     browser buttons. Seen red with the .leadfs block removed. */
  const css = fs.readFileSync('src/Sources.jsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const c of ['rl-head', 'rl-stat', 'rl-sep', 'rl-row', 'rl-link', 'rl-empty', 'rl-add', 'rl-form', 'rl-in'])
    ok(`.leadfs .${c} has a rule`, new RegExp('\\.leadfs \\.' + c + '\\b[^{]*\\{').test(css));
}

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
const own = l => ({ owner: 'Garrett', owner_id: 'u_owner', company: '', priority: 'low', deals: [], custom: {}, serviceInterest: [], ...l });
globalThis.__USERS__ = [{ id: 'u_owner', name: 'Garrett', email: 'admin@getproytech.com', role: 'owner', pools: [], commission_pct: 0, appointment_rate: 0, active: true, tabs: [], goal_conversions: 0, nav_order: [] }];
globalThis.__TEAM__ = [{ id: 'u_owner', name: 'Garrett', role: 'owner' }];
globalThis.__LEADS__ = LEADS.map(own);
globalThis.__SETTINGS__ = { modules: ['dash', 'leads', 'rels', 'clients', 'settings'], modulesV: 9, options: {}, pools: ['General'], stages: STAGES.map(s => ({ ...s, color: '#6B73C9' })) };
globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = []; globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
{ const app = await esbuild.build({ ...BUILD, entryPoints: ['src/App.jsx'], external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }] });
  fs.writeFileSync('tests/' + B_app, app.outputFiles[0].text); }
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const fire = async (el, type) => { if (!el) throw new Error(type + ': element not found'); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true })); }); await settle(60); };
const click = el => fire(el, 'click');
const nav = async label => click([...document.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === label));
const el = document.getElementById('root');
const root = createRoot(el);
await act(async () => { root.render(React.createElement((await import('./' + B_app + '?v=' + Date.now())).default)); });
await settle(260);
const usd0 = n => '$' + Math.round(n).toLocaleString('en-US');

console.log('\nthe dashboard card is the top of the same board');
{
  const card = [...el.querySelectorAll('.src-top')][0];
  ok('the dashboard has the Lead source ROI card', !!card);
  const names = card ? [...card.querySelectorAll('.src-row:not(.src-head) .src-name')].map(e => e.textContent) : [];
  ok('its rows are the leaderboard\'s top five, in order', JSON.stringify(names) === JSON.stringify(all.rows.slice(0, 5).map(r => r.label)), JSON.stringify({ names, board: all.rows.slice(0, 5).map(r => r.label) }));
  ok('  Dana first, at $3,500 setup won', card && /Dana Realtor/.test(card.querySelector('.src-row:not(.src-head)').textContent) && card.querySelector('.src-row:not(.src-head)').textContent.includes('$3,500'));
  await click(card && [...card.querySelectorAll('button')].find(b => /See every source/.test(b.textContent)));
  await settle(150);
  ok('"See every source" opens Relationships on the Sources view', !!el.querySelector('.src-board') && /Top sources/.test(el.querySelector('.src-board').textContent));
}

console.log('\nthe Sources view');
{
  const rows = [...el.querySelectorAll('.src-tbl tbody tr.src-r')];
  ok('one row per referrer, Dana first', rows.length === all.rows.length && /Dana Realtor/.test(rows[0].textContent), rows.length + ' vs ' + all.rows.length);
  ok('  her row: 3 leads, 2 won, 67%, $3,500, $300 MRR', /^1Dana Realtor32\s*67%\$3,500\$300$/.test(rows[0].textContent.replace(/\s+/g, '')) || (rows[0].textContent.includes('67%') && rows[0].textContent.includes('$3,500') && rows[0].textContent.includes('$300')), rows[0].textContent);
  await click(rows[0]);
  const sub = el.querySelector('.src-sub');
  ok('opening a row shows how those leads arrived', !!sub && /Coffee page/.test(sub.textContent) && /Event/.test(sub.textContent), sub && sub.textContent);
  await click([...el.querySelectorAll('.src-periods button')].find(b => b.textContent === 'This month'));
  ok('This month: Dana drops to $3,000', [...el.querySelectorAll('.src-tbl tbody tr.src-r')][0].textContent.includes('$3,000'));
  ok('non-person rows say what they are', /link a person/.test(el.textContent) && /no person/.test(el.textContent) && /channel/.test(el.textContent));
}

console.log('\na relationship record');
{
  await click([...el.querySelectorAll('.src-person')].find(b => b.textContent === 'Dana Realtor'));
  await settle(200);
  const openSec = async k => { const sec = document.getElementById('msec-' + k); if (sec && !sec.classList.contains('open')) await click(sec.querySelector('.msec-h')); };
  await openSec('refer');
  const stat = [...document.querySelectorAll('.rl-stat')].map(s => s.textContent);
  ok('her record shows "setup won" from the same row: $3,500, and $300 MRR', stat.some(t => /\$3,500(\.00)?setup won/.test(t)) && stat.some(t => /\$300(\.00)?MRR now/.test(t)), JSON.stringify(stat));
  ok('  and no longer the old booked "collected" figure', !stat.some(t => /collected/.test(t)));
}

console.log('\nchanging "Referred by" on a record');
{
  /* Dana's "Sent to you" links to the leads she sent: open Coffee Client */
  await click([...document.querySelectorAll('.rl-link')].find(b => b.textContent === 'Coffee Client'));
  await settle(220);
  const openSec2 = async k => { const sec = document.getElementById('msec-' + k); if (sec && !sec.classList.contains('open')) await click(sec.querySelector('.msec-h')); };
  await openSec2('type'); await openSec2('qual');
  const field = [...document.querySelectorAll('.field')].find(f => (f.querySelector('label') || {}).textContent === 'Referred by');
  ok('the record has "Referred by"', !!field, [...document.querySelectorAll('.field label')].map(l => l.textContent).join(' | ').slice(0, 300));
  ok('  and "Arrived via" in place of "Lead Source"', [...document.querySelectorAll('.field label')].some(l => l.textContent === 'Arrived via') && ![...document.querySelectorAll('.field label')].some(l => l.textContent === 'Lead Source'));
  if (field) {
    const before = globalThis.__WRITES__.length;
    await click(field.querySelector('.pp-face'));
    const row = [...field.querySelectorAll('.pp-row')].find(r => /Marcus Title/.test(r.textContent));
    await fire(row, 'mousedown');
    await settle(120);
    const w = globalThis.__WRITES__.slice(before).filter(x => x.id === 'c1');
    ok('one write', w.length === 1, w.length);
    const x = w[0] || {};
    ok('  credit moves to Marcus', x.introducedBy === 'marcus');
    ok('  the channel is untouched: still the coffee page', x.source === 'Coffee page', x.source);
    ok('  and the change is noted in the same write', x.activities && x.activities[0] && x.activities[0].text === 'Referred by: Dana Realtor → Marcus Title', JSON.stringify(x.activities && x.activities[0]));
  }
}

root.unmount();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
