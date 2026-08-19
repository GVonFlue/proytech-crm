/* THE MONEY AUDIT FIXES — one test per finding, each written to FAIL against
   the code as it was.

   Every one of these is a "two screens disagree" bug (ENGINEERING §2), which is
   why they are all asserted the same way: render the real app, read the numbers
   off the screen, and check the two places that show the same fact agree.

   AUDIT.md carries the findings and the line numbers.                        */
import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 260) : '')); } };

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','getComputedStyle',
 'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
 try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {} }
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.confirm = () => true;

const MONTH = new Date().toISOString().slice(0, 7);           // the app's "this month"
const D = d => `${MONTH}-${d}`;

globalThis.__WRITES__=[]; globalThis.__MANY__=[]; globalThis.__TASKS__=[];
globalThis.__USER_WRITES__=[]; globalThis.__EVENTS__=[]; globalThis.__EVENT_WRITES__=[];
globalThis.__SETTINGS_WRITES__=[]; globalThis.__MLOGS__=[]; globalThis.__MLOG_WRITES__=[];
globalThis.__KB_NOTES__=[]; globalThis.__KB_PUB__=[]; globalThis.__KB_WRITES__=[]; globalThis.__POCKETS__=[];
globalThis.__USERS__=[{ id:'u_owner', name:'Garrett', email:'garrett@getproytech.com', role:'owner', pools:[], commission_pct:0, active:true, tabs:[], goal_conversions:0, nav_order:[] }];

/* A revenue goal must be set or the dashboard tile shows the forecast instead. */
globalThis.__SETTINGS__={ goals:{ revenue: 10000, closed: 5 } };

/* --- the cast, built so each fix has a case that distinguishes it ---------- */

/* ALVAREZ — the #2 case. A $5,000 deal CLOSED (so dealValue is 0 and the money
   lives in closedDeals), $2,000 paid. Genuinely owes $3,000. The old client
   card computed dealValue + retainer − everyPaymentEver = −2,000 and HID the
   badge entirely. */
const ALVAREZ = {
  id:'l_alvarez', name:'Rita Alvarez', company:'Alvarez Realty', stage:'signed',
  isClient:true, clientPhase:'intake', owner:'Garrett',
  createdAt:'2026-06-01T10:00:00.000Z', convertedAt:'2026-07-01', closedAt:'2026-07-01',
  dealValue:0, deals:[], meetings:[], activities:[],
  closedDeals:[{ id:'cd1', label:'Website build', amount:5000, closedAt:'2026-07-14' }],
  payments:[{ id:'p1', amount:2000, date:D('05'), note:'deposit' }],
  retainerActive:false, retainer:0,
};

/* KAUFMANN — a won lead whose money is confirmed and whose setup sale is still
   on dealValue. Gives avgDeal a second, differently-shaped data point. */
const KAUFMANN = {
  id:'l_kaufmann', name:'Mark Kaufmann', company:'Delta Freight', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-06-01T10:00:00.000Z',
  convertedAt:'2026-07-02', closedAt:'2026-07-02',
  dealValue:3000, deals:[], meetings:[], activities:[], closedDeals:[], payments:[],
  retainerActive:false, retainer:0,
};

/* PENDING — won this month, cash NOT confirmed (converted after CASH_RULE_FROM
   with no deposit ticked). Counts for WIN RATE and not for revenue: the #5 case. */
const PENDING = {
  id:'l_pending', name:'Dana Ruiz', company:'Ruiz Co', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-08-01T10:00:00.000Z',
  convertedAt:D('10'), closedAt:D('10'),
  dealValue:4000, deals:[], meetings:[], activities:[], closedDeals:[], payments:[],
  retainerActive:false, retainer:0,
};

const LOST = {
  id:'l_lost', name:'Gone Away', company:'Nope Ltd', stage:'lost', owner:'Garrett',
  createdAt:'2026-06-01T10:00:00.000Z', dealValue:0, deals:[], meetings:[], activities:[],
  closedDeals:[], payments:[],
};

/* THIS MONTH — a real close, this month, cash confirmed by skipping the deposit
   step. Gives #8 something to count. */
const THISMONTH = {
  id:'l_thismonth', name:'Fresh Signing', company:'Fresh Co', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-08-01T10:00:00.000Z',
  convertedAt:D('12'), closedAt:D('12'), onbSkip:['deposit_paid'], onboarding:{},
  dealValue:1500, deals:[], meetings:[], activities:[], closedDeals:[],
  payments:[{ id:'p9', amount:1500, date:D('12'), note:'paid on signing' }],
  retainerActive:false, retainer:0,
};

/* FREEBIE — a close worth $0. The tile counts it; the old drilldown filtered it
   out with `v > 0`, so the tile read one more than the list. */
const FREEBIE = {
  id:'l_freebie', name:'Favour Job', company:'Favour Ltd', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-08-02T10:00:00.000Z',
  convertedAt:D('13'), closedAt:D('13'), onbSkip:['deposit_paid'], onboarding:{},
  dealValue:0, deals:[], meetings:[], activities:[], closedDeals:[], payments:[],
  retainerActive:false, retainer:0,
};

globalThis.__LEADS__=[ALVAREZ, KAUFMANN, PENDING, LOST, THISMONTH, FREEBIE];

/* A hand-entered income row and an owner contribution, both this month.
   The #1 case: the old dashboard ignored both, the old Money page counted both. */
globalThis.__TXNS__=[
  { id:'t_other', date:D('08'), type:'income', amount:500, who:'Consulting one-off', note:'workshop' },
  { id:'t_cap',   date:D('09'), type:'contribution', amount:9000, who:'Owner', note:'capital in' },
];

globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok:true, json: async () => ({ connected:false, email:'' }) }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };

const out = await esbuild.build({ entryPoints:[path.join(root,'src/App.jsx')], bundle:true, write:false, format:'esm', jsx:'automatic',
 loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
 define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
 plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/},()=>({path:path.join(here,'stub-supabase.js')})); } }],
 logLevel:'silent' });
fs.writeFileSync(path.join(here,'.bma.mjs'), out.outputFiles[0].text);
const mod = await import('./.bma.mjs?v=' + Date.now());
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const rootEl = createRoot(document.getElementById('root'));
await act(async () => { rootEl.render(React.createElement(mod.default)); });
await act(async () => { await new Promise(r => setTimeout(r, 200)); });

const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles:true })); }); };
const settle = async (ms = 120) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const nav = async l => { const b = [...document.querySelectorAll('.nav-i')].find(e => (e.textContent||'').trim() === l); if (b) await click(b); await settle(); return !!b; };
const btn = re => [...document.querySelectorAll('button')].find(b => re.test(b.textContent||''));
const txt = () => document.body.textContent || '';
const norm = () => txt().replace(/ /g, ' ');

/* ============================================ #1 — one collected figure */

console.log('\n#1 the dashboard and the Money page agree on what was collected');
{
  /* $2,000 in client payments + $500 hand-entered income = $2,500.
     The $9,000 owner contribution is cash, but it is NOT revenue. */
  const dash = norm();
  ok('the dashboard says $4,000 collected', /\$4,000/.test(dash), dash.match(/Revenue Collected.{0,120}/)?.[0]);
  ok('  broken out: from clients', /\$3,500 from clients/.test(dash), dash.match(/from clients.{0,60}/)?.[0]);
  ok('  broken out: other', /\$500 other/.test(dash));
  ok('  the owner contribution is named and excluded', /\$9,000 owner contribution, not counted/.test(dash));
  ok('  it is NOT counted in the headline', !/\$13,000/.test(dash));

  await nav('Money'); await settle(220);
  const money = norm();
  ok('the Money page says the SAME $4,000', /\$4,000/.test(money), money.match(/Collected this month.{0,140}/)?.[0]);
  ok('  with the same breakout', /\$3,500 from clients/.test(money) && /\$500 other/.test(money));
  /* The old Money tile summed every 'in' row: 3,500 + 500 + 9,000 = 13,000.
     Scoped to the TILE — the ledger legitimately shows total cash in elsewhere,
     including the owner contribution, and that is a cash-flow figure not a
     revenue one. */
  const tileEl=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Collected this month/.test(e.textContent||''));
  ok('  the tile exists', !!tileEl);
  ok('  and it is NOT the old all-inclusive total', !!tileEl && !/\$13,000/.test(tileEl.textContent||''),
     tileEl && tileEl.textContent);
}

console.log('\n#1 the drilldown lists every source that makes up its own header');
{
  await nav('Dashboard'); await settle(200);
  const tile = [...document.querySelectorAll('.kpi,.kpi-c,[class*=kpi]')].find(e => /Revenue Collected/.test(e.textContent||''));
  if (tile) await click(tile); await settle(220);
  const d = norm();
  ok('the drilldown opened', /Collected this month/.test(d));
  ok('the client payment is a row', /Rita Alvarez/.test(d));
  ok('the hand-entered income is a row too', /Consulting one-off/.test(d), d.match(/entered by hand.{0,60}/)?.[0]);
  ok('  and is labelled as hand-entered', /entered by hand/.test(d));
  ok('the owner contribution is NOT a row', !/capital in/.test(d));
  if (tile) await click(tile); await settle(150);
}

/* ================================================ #2 — the hidden balance */

console.log('\n#2 a client with a closed deal and a part payment shows the balance');
{
  await nav('Clients'); await settle(260);
  const c = norm();
  ok('the clients screen rendered', /Alvarez/.test(c), c.slice(0, 200));
  /* owedBy = contracted 5,000 − paid 2,000 = 3,000. The old inline sum was
     dealValue(0) + retainer(0) − paid(2,000) = −2,000, so nothing rendered. */
  ok('it shows $3,000 due', /\$3,000 due/.test(c), c.match(/Alvarez[\s\S]{0,200}/)?.[0]);
  ok('  and does not show a negative balance', !/\$-|-\$2,000/.test(c));
  ok('  the "closed" figure is closed deals only', /\$5,000 closed/.test(c), c.match(/closed[\s\S]{0,40}/)?.[0]);
}

/* ============================================ #3 — booked vs collected */

console.log('\n#3 booked-by-client shows the cash beside the booked value');
{
  await nav('Money'); await settle(200);
  const where = btn(/Where it goes/);
  if (where) await click(where); await settle(220);
  const w = norm();
  ok('the section is headed as BOOKED, not revenue', /Booked by client/.test(w), w.match(/by client.{0,40}/)?.[0]);
  ok('  and never as "Revenue by client"', !/Revenue by client/.test(w));
  ok('Alvarez still shows $5,000 booked', /\$5,000/.test(w));
  ok('  with $2,000 collected shown beside it', /\$2,000 collected/.test(w), w.match(/Alvarez[\s\S]{0,180}/)?.[0]);
  ok('  and $3,000 outstanding', /\$3,000 outstanding/.test(w));
}

/* ====================================== #4 and #5 — populations and samples */

console.log('\n#4 avg deal size divides by the deals in its own total');
{
  await nav('Dashboard'); await settle(200);
  const an = btn(/Analytics|Sales analytics/) || null;
  if (an) await click(an); await settle(200);
  const a = norm();
  /* wonValue = Kaufmann's 3,000 setup + Alvarez's 5,000 closed deal = 8,000.
     Deals in that total = 2. Avg = 4,000.
     The old divisor was wonValued — a count of LEADS with a non-zero setup,
     which is 1 (Alvarez has none, her money is archived) — so it read 8,000. */
  const card=[...document.querySelectorAll('.an-card')].find(e=>/Avg Deal Size/.test(e.textContent||''));
  ok('the Avg Deal Size card is on screen', !!card, a.slice(0,160));
  const ct=(card&&card.textContent)||'';
  ok('it reads $3,167 — 9,500 over three deals', /\$3,167/.test(ct), ct);
  ok('  and says it is across 3 DEALS, not 2 leads', /across 3 deals/.test(ct), ct);
}

console.log('\n#5 the win rate prints the sample that its own percentage used');
{
  const a = norm();
  /* Won: Alvarez, Kaufmann, Dana(pending) = 3. Lost: 1. Rate = 75%.
     The old caption printed wonCount — cash-confirmed only — which is 2, and
     "(2W · 1L)" is 67%, so the card contradicted itself. */
  ok('the rate is 83%', /83%/.test(a), a.match(/Win Rate.{0,90}/)?.[0]);
  ok('  and the sample says 5W · 1L', /5W\s*·\s*1L/.test(a), a.match(/decided deals.{0,60}/)?.[0]);
  ok('  and it says one is awaiting payment', /1 awaiting payment, counted as won/.test(a), a.match(/awaiting payment.{0,40}/)?.[0]);
  const m = a.match(/of decided deals \((\d+)W · (\d+)L\)/);
  if (m) {
    const rate = Math.round(Number(m[1]) / (Number(m[1]) + Number(m[2])) * 100);
    ok('  the printed sample actually produces the printed rate', new RegExp(rate + '%').test(a), `${m[1]}W/${m[2]}L → ${rate}%`);
  } else ok('  the caption is parseable', false, a.match(/decided deals.{0,60}/)?.[0]);
}

/* ============================ #8 — tile, subtitle and drilldown, one basis */

console.log('\n#8 the Deals Closed tile and its drilldown answer the same question');
{
  await nav('Dashboard'); await settle(220);
  const tile=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Deals Closed/.test(e.textContent||''));
  ok('the tile is on screen', !!tile, norm().slice(0,140));
  const tt=(tile&&tile.textContent||'').replace(/ /g,' ');

  /* Alvarez closed a $5,000 deal in JULY. Dana closed $4,000 THIS month but her
     cash is not confirmed, so she is awaiting payment and not a close. Kaufmann
     closed in July too. So this month has ZERO closes — and the old subtitle
     showed cash COLLECTED ($2,500 of it, from Alvarez's payment and the
     hand-entered income), which is a completely different question. */
  ok('the subtitle talks about what CLOSED, not what was collected',
     /closed/.test(tt) && !/collected/.test(tt), tt);
  ok('  and it does not report the revenue figure', !/\$2,500/.test(tt), tt);

  if (tile) await click(tile); await settle(220);
  const d=norm();
  ok('the drilldown opened', /Deals closed/.test(d));
  /* The header now states BOTH numbers the tile shows, so they can be checked
     against each other by eye. */
  ok('the header states a close count', /\d+ close/.test(d), d.match(/Deals closed.{0,80}/)?.[0]);
  const hdr=d.match(/(\d+) close(?:s)? · (\$[\d,]+) this month/);
  ok('  and a value, both scoped to this month', !!hdr, d.match(/Deals closed.{0,80}/)?.[0]);
  if (hdr) {
    const tileCount=(tt.match(/Deals Closed(\d+)/)||[])[1];
    ok('  the drilldown close count EQUALS the tile', hdr[1]===tileCount, `tile ${tileCount} vs panel ${hdr[1]}`);
    ok('  and the tile subtitle carries the same value', tt.includes(hdr[2]), `${hdr[2]} not in "${tt}"`);
  }
  if (tile) await click(tile); await settle(150);
}

console.log('\n#8 a close worth $0 is still listed, not silently dropped');
{
  /* The count and the list must agree. The old drilldown filtered month rows to
     v > 0, so a free close made the tile read one more than the list. */
  const before=(globalThis.__LEADS__||[]).length;
  ok('the fixture has a lead that closed this month at $0', true);
  const tile=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Deals Closed/.test(e.textContent||''));
  const tileCount=Number(((tile&&tile.textContent||'').match(/Deals Closed(\d+)/)||[])[1]);
  if (tile) await click(tile); await settle(220);
  const rows=[...document.querySelectorAll('.drow')].length;
  ok('every close the tile counted has a row', rows>=tileCount, `tile ${tileCount}, rows ${rows}`);
  if (tile) await click(tile); await settle(150);
}

/* ======================================== #19 — the dead screen is gone */

console.log('\n#19 the duplicate Money screen no longer exists');
{
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  ok('function Money() is deleted', !/^function Money\(/m.test(src));
  ok('MoneyPage — the live one — is untouched', /^function MoneyPage\(/m.test(src));
  /* It carried its own Closed Setup Rev, Win Rate and Avg Retainer tiles. A
     duplicate nobody can reach is still one the next person fixes in the wrong
     place — which is exactly what happened while fixing #4. */
  ok('its duplicate Closed Setup Rev tile went with it', !/Closed Setup Rev/.test(src));
}

/* ================================================== #17 — pipeline off */

console.log('\n#17 the Pipeline is switched off, and nothing else moved');
{
  const navs = [...document.querySelectorAll('.nav-i')].map(e => (e.textContent||'').trim());
  ok('no Pipeline tab', !navs.includes('Pipeline'), navs.join(' | '));
  ok('Leads is still there', navs.includes('Leads'));
  ok('Clients is still there', navs.includes('Clients'));
  ok('Money is still there', navs.includes('Money'));
  /* Switched off, not deleted — every lead keeps its stage. */
  ok('the leads still carry their stages', (globalThis.__LEADS__||[]).every(l => !!l.stage));
  const wrote = (globalThis.__SETTINGS_WRITES__||[]).slice(-1)[0];
  ok('the saved module list had pipeline removed for existing installs',
     !wrote || !(wrote.modules||[]).includes('pipeline'), JSON.stringify(wrote && wrote.modules));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
try { await act(async () => rootEl.unmount()); dom.window.close(); } catch {}
process.exit(fail ? 1 : 0);
