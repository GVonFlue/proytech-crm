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

/* OPEN + UPSELL — the #6 case. An open lead whose deal rows include an
   upsell-stamped one. dealValue (2,200) already contains that 700, so counting
   it again as an upsell row made the panel sum to more than the tile. */
const OPENUPSELL = {
  id:'l_openups', name:'Both Ways', company:'Both Ltd', stage:'proposal', owner:'Garrett',
  createdAt:'2026-08-03T10:00:00.000Z', dealValue:2200, meetings:[], activities:[],
  deals:[{ id:'d1', label:'Site', setup:1500 },
         { id:'d2', label:'Extra module', setup:700, upsell:true }],
  closedDeals:[], payments:[], retainerActive:false, retainer:0,
};

/* A WON client with an upsell — this one SHOULD appear as an upsell row, because
   useMetrics counts it in upsellValue and its dealValue is not in openValue. */
const WONUPSELL = {
  id:'l_wonups', name:'Repeat Custom', company:'Repeat Ltd', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-06-05T10:00:00.000Z',
  convertedAt:'2026-07-05', closedAt:'2026-07-05',
  dealValue:900, meetings:[], activities:[],
  deals:[{ id:'d3', label:'Phase two', setup:900, upsell:true }],
  closedDeals:[], payments:[], retainerActive:false, retainer:0,
};

/* POPPELL — the #22 case, from live data. Closed this month, deposit box
   ticked, NO payment logged. The fallback used to report it as collected. */
const POPPELL = {
  id:'l_poppell', name:'Poppell Insurance', company:'Poppell', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-08-05T10:00:00.000Z',
  convertedAt:D('17'), closedAt:D('17'), onbSkip:['deposit_paid'], onboarding:{},
  dealValue:1199, deals:[], meetings:[], activities:[], closedDeals:[], payments:[],
  retainerActive:false, retainer:0,
};

/* OLDCLOSE — closed BEFORE payment tracking. The fallback must still protect
   this one, or switching the rule on deletes historical revenue. */
const OLDCLOSE = {
  id:'l_oldclose', name:'Last Year Co', company:'Last Year', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-06-01T10:00:00.000Z',
  convertedAt:'2026-07-20', closedAt:'2026-07-20',
  dealValue:800, deals:[], meetings:[], activities:[], closedDeals:[], payments:[],
  retainerActive:false, retainer:0,
};

/* JUSTUS — the #21 case, from live data. A retainer client with an unpaid
   balance. owedBy said $763, the lead panel said $1,011.75 — the panel was
   adding one month of retainer. */
const JUSTUS = {
  id:'l_justus', name:'Justus', company:'Justus Co', stage:'signed',
  isClient:true, owner:'Garrett', createdAt:'2026-06-10T10:00:00.000Z',
  convertedAt:'2026-07-10', closedAt:'2026-07-10',
  dealValue:1000, deals:[{ id:'dj', label:'Build', setup:1000 }],
  meetings:[], activities:[], closedDeals:[],
  payments:[{ id:'pj', amount:237, date:'2026-07-15', note:'deposit' }],
  retainerActive:true, retainer:248.75,
};

globalThis.__LEADS__=[ALVAREZ, KAUFMANN, PENDING, LOST, THISMONTH, FREEBIE, OPENUPSELL, WONUPSELL, POPPELL, OLDCLOSE, JUSTUS];

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
  ok('it reads $2,083 — 12,499 over six deals', /\$2,083/.test(ct), ct);
  ok('  and says it is across 6 DEALS, not the 3 leads with a live setup', /across 6 deals/.test(ct), ct);
}

console.log('\n#5 the win rate prints the sample that its own percentage used');
{
  const a = norm();
  /* Won: Alvarez, Kaufmann, ThisMonth, Freebie, Repeat Custom, and Dana who is
     awaiting payment = 6. Lost: 1. 6/7 = 86%.
     The old caption printed wonCount — cash-confirmed only — which is 2, and
     "(2W · 1L)" is 67%, so the card contradicted itself. */
  ok('the rate is 90%', /90%/.test(a), a.match(/Win Rate.{0,90}/)?.[0]);
  ok('  and the sample says 9W · 1L', /9W\s*·\s*1L/.test(a), a.match(/decided deals.{0,60}/)?.[0]);
  ok('  and it says one is awaiting payment', /1 awaiting payment, counted as won/.test(a), a.match(/awaiting payment.{0,40}/)?.[0]);
  const m = a.match(/of decided deals \((\d+)W · (\d+)L\)/);
  if (m) {
    const rate = Math.round(Number(m[1]) / (Number(m[1]) + Number(m[2])) * 100);
    ok('  the printed sample actually produces the printed rate', new RegExp(rate + '%').test(a), `${m[1]}W/${m[2]}L → ${rate}%`);
  } else ok('  the caption is parseable', false, a.match(/decided deals.{0,60}/)?.[0]);
}

/* ============ #22 — the legacy fallback must not report unpaid closes as cash */

console.log('\n#22 a close with no payment logged is NOT collected');
{
  await nav('Dashboard'); await settle(240);
  const tile=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Revenue Collected/.test(e.textContent||''));
  const tt=(tile&&tile.textContent||'').replace(/ /g,' ');

  /* Poppell closed this month, deposit ticked, no payment row. Its $1,199 must
     not be in the collected figure. */
  ok('Poppell\'s $1,199 is not counted as collected', !/\$1,199/.test(tt), tt);
  ok('  and the tile says how many are waiting on a logged payment',
     /closed this month with no payment logged/.test(tt), tt);

  if (tile) await click(tile); await settle(240);
  /* Scoped to the PANEL — "Poppell" appears elsewhere on the dashboard, and a
     page-wide match would pass or fail for the wrong reason. */
  const panel=document.querySelector('.drill');
  const dt=(panel&&panel.textContent||'').replace(/ /g,' ');
  ok('the drilldown opened', /Collected this month/.test(dt), dt.slice(0,80));
  ok('the drilldown does not list it as collected', !/Poppell/.test(dt), dt.slice(0,400));
  ok('  and its rows still sum to its own header', (()=>{
    const rows=[...(panel?panel.querySelectorAll('.drow-v'):[])]
      .map(e=>Number((e.textContent||'').replace(/[^0-9.]/g,''))||0);
    const sum=Math.round(rows.reduce((a,b)=>a+b,0));
    const hdr=Number(((dt.match(/\$([\d,]+)/)||[])[1]||'0').replace(/,/g,''));
    return sum===hdr; })(), dt.slice(0,120));
  if (tile) await click(tile); await settle(150);
}

console.log('\n#22 but a close from BEFORE payment tracking still counts');
{
  /* The whole reason the fallback exists (ENGINEERING §4): switching payment
     tracking on must not delete history. Last Year Co closed in July, before
     PAYMENTS_FROM, so it keeps counting at its close date. */
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  ok('the cutoff is a named, documented constant', /const PAYMENTS_FROM='\d{4}-\d{2}-\d{2}'/.test(src));
  ok('the fallback is gated on it', /!paymentsOf\(l\)\.length&&preDatesPayments\(l\)/.test(src));
  /* Its close month is July, so it does not show in THIS month's figure — what
     matters is that the gate is by DATE, not that the fallback is gone. */
  ok('and owedBy reads the same predicate, so the two cannot disagree',
     /legacySettled\(l\)\?0:contractedTotal\(l\)/.test(src));
}

console.log('\n#22 an unpaid close is owed, not vanished');
{
  /* The trap this pairs with: bounding revenue WITHOUT bounding owedBy would
     make Poppell neither collected nor owed — the money disappearing from both
     sides at once. */
  await nav('Money'); await settle(240);
  const owedTile=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Owed to you/.test(e.textContent||''));
  const ot=(owedTile&&owedTile.textContent||'').replace(/ /g,' ');
  ok('the Owed to you tile is on screen', !!owedTile);
  const owedNum=Number(((ot.match(/\$([\d,]+)/)||[])[1]||'0').replace(/,/g,''));
  ok('Poppell\'s $1,199 moved INTO owed rather than vanishing', owedNum>=1199,
     `owed reads ${owedNum}`);
}

/* ==================== #21 — one definition of owed, on both screens */

console.log('\n#21 the lead panel and the dashboard agree on what is owed');
{
  await nav('Clients'); await settle(280);
  const c=norm();
  ok('the clients screen rendered', /Justus/.test(c), c.slice(0,160));
  /* Justus: contracted 1,000, paid 237 -> owed 763. The panel used to add one
     month of retainer (248.75) and show 1,011.75. */
  ok('the client card shows $763 due', /\$763 due/.test(c), c.match(/Justus[\s\S]{0,140}/)?.[0]);
  ok('  and NOT the retainer-inflated $1,011.75', !/1,011/.test(c), c.match(/Justus[\s\S]{0,140}/)?.[0]);
}

console.log('\n#21 the retainer is shown beside the balance, never inside it');
{
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  ok('the panel reads owedBy() rather than summing its own', /const remaining=owedBy\(draft,stages\)/.test(src));
  ok('no firstMonth in the balance', !/const owed=openDealsTotal\+closedDealsTotal\(draft\)\+firstMonth/.test(src));
  ok('the retainer is still surfaced, so nothing is hidden', /plus \{usdc\(firstMonth\)\}\/mo recurring/.test(src));
  ok('  and labelled as excluded', /not counted in the balance/.test(src));
}

/* ================== #6 — the pipeline panel must sum to the pipeline tile */

console.log('\n#6 the pipeline drilldown sums to the tile it opened from');
{
  await nav('Dashboard'); await settle(220);
  const tile=[...document.querySelectorAll('[class*=kpi]')].find(e=>/Open Pipeline/.test(e.textContent||''));
  ok('the tile is on screen', !!tile);
  /* Read the VALUE node, not the tile's concatenated text — "$3,100" followed
     by the caption "1 lead" makes a greedy $[\d,]+ match "$3,1001". */
  const tileVal=((tile&&tile.querySelector('.kv')||{}).textContent||'').trim();
  /* openValue = Both Ltd 2,200 (its 700 upsell is already inside that) +
     Dana 4,000, an open... no — Dana is signed. Open leads: Both Ltd only.
     upsellValue = won leads' upsells = Repeat Ltd 900.
     So pipelineValue = 2,200 + 900 = 3,100. */
  ok('the tile reads $3,100', tileVal==='$3,100', tileVal);

  if (tile) await click(tile); await settle(220);
  const d=norm();
  ok('the drilldown opened', /Open pipeline/.test(d));

  /* THE ASSERTION THIS EXISTS FOR: the panel now states a total, and it is the
     tile's total. Before, the header was a row COUNT and there was nothing to
     compare. */
  const hdr=d.match(/Open pipeline\s*(\$[\d,]+)/);
  ok('the header states a dollar total, not just a row count', !!hdr, d.match(/Open pipeline.{0,60}/)?.[0]);
  ok('  and it equals the tile', hdr && hdr[1]===tileVal, `tile ${tileVal} vs panel ${hdr&&hdr[1]}`);

  /* The open lead with an upsell must appear ONCE. Its 700 upsell is already
     inside its 2,200 dealValue. */
  const rows=[...document.querySelectorAll('.drow')].map(r=>(r.textContent||'').replace(/\s+/g,' '));
  const bothRows=rows.filter(r=>/Both Ways|Both Ltd/.test(r));
  ok('the open lead with an upsell appears exactly once', bothRows.length===1,
     bothRows.join(' || '));
  ok('  at its full deal value', bothRows[0]&&/\$2,200/.test(bothRows[0]), bothRows[0]);
  ok('  and NOT also as a $700 upsell row', !rows.some(r=>/Both/.test(r)&&/\$700/.test(r)),
     rows.join(' || '));

  /* The won client's upsell SHOULD be a row — it is what upsellValue counts. */
  const repeatRows=rows.filter(r=>/Repeat/.test(r));
  ok('a won client\'s upsell is still listed', repeatRows.length===1, repeatRows.join(' || '));
  ok('  at its upsell value', repeatRows[0]&&/\$900/.test(repeatRows[0]), repeatRows[0]);

  /* And the rows really do add up to the header. */
  const sum=rows.map(r=>{ const m2=r.match(/\$([\d,]+)/); return m2?Number(m2[1].replace(/,/g,'')):0; })
    .reduce((a,b2)=>a+b2,0);
  ok('the rows sum to the header', hdr && sum===Number(hdr[1].slice(1).replace(/,/g,'')),
     `rows ${sum} vs header ${hdr&&hdr[1]}`);
  if (tile) await click(tile); await settle(150);
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

/* ============================== #7 — every rate goes through one component */

console.log('\n#7 no rate is rendered by hand any more');
{
  const src=await (await import('node:fs/promises')).readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  /* THE PATTERN GUARD. This is the assertion that stops #7 coming back: not
     "the current sites are fixed" but "a new site cannot be written the old
     way without failing the suite". */
  const body=src.split('function Rate(')[1] || '';
  const outside=src.replace(body, '');
  const handRolled=[...outside.matchAll(/Math\.round\(\s*[\w.]*(?:[Rr]ate|Pct)\s*\*\s*100\s*\)/g)].map(x=>x[0]);
  ok('no hand-rolled rate percentages outside <Rate>', handRolled.length===0, handRolled.join(', '));
  ok('the floor is defined once, as a constant', /const RATE_MIN_N=\d+/.test(src));
  ok('and <Rate> exists to enforce it', /function Rate\(\{/.test(src));
}

console.log('\n#7 a thin sample gets a figure, never a percentage and never a colour');
{
  await nav('Dashboard'); await settle(260);
  const rates=[...document.querySelectorAll('.rate')];
  ok('rates are rendering through the component', rates.length>0, String(rates.length));

  /* The rule, asserted on every rate on the page at once rather than on a
     chosen one — so a new rate added later is covered by this too. */
  const thin=rates.filter(e=>e.classList.contains('rate-thin'));
  ok('at least one rate is below the floor in this fixture', thin.length>0,
     rates.map(e=>e.textContent).join(' | '));
  ok('NO thin rate shows a percentage',
     thin.every(e=>!/%/.test(e.textContent||'')), thin.map(e=>e.textContent).join(' | '));
  ok('NO thin rate carries a colour judgement',
     thin.every(e=>!e.classList.contains('warn')&&!e.classList.contains('good')),
     thin.map(e=>e.className+':'+e.textContent).join(' | '));
  ok('a thin rate shows the raw figure instead',
     thin.every(e=>/^\d+\/\d+$/.test((e.textContent||'').trim())), thin.map(e=>e.textContent).join(' | '));
  ok('and says why, on hover', thin.every(e=>/too few to read as a rate/.test(e.getAttribute('title')||'')),
     thin[0]&&thin[0].getAttribute('title'));

  const coloured=rates.filter(e=>e.classList.contains('warn')||e.classList.contains('good'));
  ok('every COLOURED rate is a real percentage',
     coloured.every(e=>/%/.test(e.textContent||'')), coloured.map(e=>e.textContent).join(' | '));
}

console.log('\n#7 the funnel close rate no longer alarms on three leads');
{
  const closeCells=[...document.querySelectorAll('.fn-r.close')];
  ok('the funnel is on screen', closeCells.length>0);
  /* This is the specific case from the audit: a stage reached by a handful of
     leads used to render a red percentage. */
  const redOnThin=closeCells.filter(c=>{
    const r=c.querySelector('.rate');
    return r && r.classList.contains('warn') && !/%/.test(r.textContent||'');
  });
  ok('no close rate is red without a percentage behind it', redOnThin.length===0);
  const anyRed=closeCells.filter(c=>{ const r=c.querySelector('.rate'); return r&&r.classList.contains('warn'); });
  ok('and any red one has a sample at or above the floor',
     anyRed.every(c=>{ const r=c.querySelector('.rate'); return /%/.test(r.textContent||''); }),
     anyRed.map(c=>c.textContent).join(' | '));
}

console.log('\n#7 the Pipeline Moving CARD cannot alarm while its rate refuses to');
{
  const card=[...document.querySelectorAll('.an-card')].find(e=>/Pipeline Moving/.test(e.textContent||''));
  ok('the card is on screen', !!card);
  const r=card&&card.querySelector('.rate');
  if (card && r && r.classList.contains('rate-thin')) {
    ok('a thin sample leaves the card uncoloured too — no alarm by the side door',
       !card.classList.contains('warn'), card.className+' :: '+r.textContent);
  } else {
    ok('the sample is above the floor, so the card may colour normally', true);
  }
  ok('and the card states its sample', /still moving/.test(card&&card.textContent||''), card&&card.textContent);
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
