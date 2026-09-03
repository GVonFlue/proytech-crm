/* REVENUE BY MONTH, AND WHAT "STILL OWED" IS MADE OF
   ============================================================================

   Two questions the Dashboard could not answer before, asserted on the pure
   functions rather than through jsdom, because both are arithmetic and a DOM
   test tells you a string appeared, not that a sum is right.

   WHY THIS FILE EXISTS AT ALL

   The month picker is one argument to revenueForMonth(). It HAD to be, because
   the alternative — a second copy of the revenue arithmetic that takes a month
   — is the exact bug MONEY-SPLIT-FINDING.md is about: two screens, one label,
   two numbers. So the property that matters is not "the picker works", it is
   "there is only one definition", and the way to check that is to call the one
   function with today's month and get back what useMetrics reports.

   The second half is about a WORD. "Still owed" was described on the Money page
   as both "sold, not collected" (true) and "Invoiced, not yet paid" (false, and
   in the 90-day cash view where it mattered most). owedBy() has never read the
   invoices table. These assertions pin the meaning down so the label cannot
   drift back: quoted work is out, won work is in, an invoice changes only how
   the AGE is described and never the amount.                                 */
import esbuild from 'esbuild';
const out = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', platform:'neutral', external:['lucide-react','react'], define:{'import.meta.env':'{}'} });
const { writeFile } = await import('node:fs/promises');
await writeFile('tests/.brm.mjs', out.outputFiles[0].text);
const { revenueForMonth, owedRows, owedFromMonth, owedSince, daysOld, owedBy, todayISO }
  = await import('./.brm.mjs?v=' + Date.now());

let p = 0, f = 0;
const ok = (n, c, x = '') => { c ? (p++, console.log('  ok  ' + n))
  : (f++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };

const pad = n => String(n).padStart(2, '0');
const now = new Date();
const THIS = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const PREV = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
const daysAgoISO = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const STAGES = [
  { key:'discovery', label:'Discovery', open:true },
  { key:'signed',    label:'Signed',    won:true },
  { key:'lost',      label:'Lost',      lost:true },
];

/* HALF — won last month, $1,000 of work, $400 paid last month and $200 this.
   Splits across both months and still owes $400, which is the shape that makes
   "revenue this month" and "still owed" two genuinely different questions. */
const HALF = { id:'half', name:'Half Paid', stage:'signed', isClient:true,
  closedAt:`${PREV}-03`, convertedAt:`${PREV}-03`, dealValue:1000,
  deals:[{ id:'d', setup:1000 }], closedDeals:[],
  payments:[{ id:'p1', amount:400, date:`${PREV}-03` },
            { id:'p2', amount:200, date:`${THIS}-02` }] };

/* QUOTED — an open lead with a $9,000 proposal out. Not a debtor: nobody who
   has not bought anything owes anything. This is the whole of the difference
   between "invoiced-and-unpaid" and "quoted work never invoiced". */
const QUOTED = { id:'quo', name:'Big Prospect', stage:'discovery', dealValue:9000,
  deals:[{ id:'dq', setup:9000 }], closedDeals:[], payments:[] };

/* LOST — a dead deal owes nothing either. */
const LOST = { id:'lost', name:'Gone', stage:'lost', dealValue:4000,
  deals:[{ id:'dl', setup:4000 }], closedDeals:[], payments:[] };

/* INVOICED — won 60 days ago, invoice raised and 10 days past due. The only
   row entitled to the word "overdue".

   TEN days, not thirty. The ordering case below has to show a past-due invoice
   outranking an OLDER un-billed sale, and the un-billed one (HALF) is aged from
   `${PREV}-03` — which is 26 days out on the 1st of a short month and 33 on the
   28th. Against a flat 30 it crossed over and the demonstration inverted on
   some days of the month and not others. Ten clears the floor on every
   calendar. Caught by tests/clockwarp.mjs at 2026-10-01. */
/* 120 DAYS, NOT 60. "Last month" reaches back (day-of-month + length of last
   month) days, which is as much as 62 — so a flat 60 lands INSIDE last month
   whenever you run this late in a long month. On 2026-12-31 it did: Late
   Payer's $1 joined last month's revenue (401, not 400) and its whole $1,999
   balance joined owedFromMonth(PREV) (2,399, not 400). Four assertions, wrong
   for the calendar rather than for the code — the same shape as the bug this
   PR is about, in the test written to prove that bug was fixed.
   120 clears 62 on every calendar, so this record is always strictly older than
   the month before this one. Caught by tests/clockwarp.mjs at 2026-12-31. */
const SALE_LONG_AGO = 120;
const INVOICED = { id:'inv', name:'Late Payer', stage:'signed', isClient:true,
  closedAt:daysAgoISO(SALE_LONG_AGO), convertedAt:daysAgoISO(SALE_LONG_AGO), dealValue:2000,
  deals:[{ id:'di', setup:2000 }], closedDeals:[],
  payments:[{ id:'pi', amount:1, date:daysAgoISO(SALE_LONG_AGO) }] };
const INVOICE_PAST_DUE_DAYS = 10;
const INVOICES = [
  { id:'iv1', number:'INV-0007', clientId:'inv', status:'sent', dueDate:daysAgoISO(INVOICE_PAST_DUE_DAYS) },
  { id:'iv2', number:'INV-0001', clientId:'half', status:'paid', dueDate:daysAgoISO(90) },
];

/* NODATE — owes money with no close date, no converted date and no invoice.
   Its age is UNKNOWN, and the one thing it must never render is 0. */
const NODATE = { id:'nod', name:'No Dates', stage:'signed', isClient:true,
  dealValue:500, deals:[{ id:'dn', setup:500 }], closedDeals:[],
  payments:[{ id:'pn', amount:100, date:`${THIS}-01` }] };

const LEADS = [HALF, QUOTED, LOST, INVOICED, NODATE];
const TXNS = [
  { id:'t1', date:`${THIS}-04`, type:'income',       amount:300 },
  { id:'t2', date:`${THIS}-05`, type:'contribution', amount:5000 },
  { id:'t3', date:`${PREV}-11`, type:'income',       amount:70  },
];

/* ============================================ revenue is an argument away */

console.log('\nrevenue for a month is one function taking the month');
{
  const t = revenueForMonth(LEADS, STAGES, TXNS, THIS);
  const l = revenueForMonth(LEADS, STAGES, TXNS, PREV);

  /* This month: Half's $200 + No Dates' $100 = $300 client, plus $300
     hand-entered income. Late Payer's $1 is dated 60 days ago and belongs to
     whatever month that was (SALE_LONG_AGO ago, deliberately older than last
     month too) — which is the point of a cash-basis figure.
     The $5,000 contribution is cash and is NOT revenue. */
  ok('this month counts only this month\'s payments', t.clientRevenueMonth === 300, String(t.clientRevenueMonth));
  ok('  plus hand-entered income',                    t.otherIncomeMonth === 300, String(t.otherIncomeMonth));
  ok('  the owner contribution is excluded',          t.revenueMonth === 600, String(t.revenueMonth));
  ok('  but it is returned, not hidden',              t.contribMonth === 5000, String(t.contribMonth));

  /* Last month: Half's $400 deposit and the $70 income row. */
  ok('last month is a different answer',              l.clientRevenueMonth === 400, String(l.clientRevenueMonth));
  ok('  with its own income row',                     l.revenueMonth === 470, String(l.revenueMonth));
  ok('  and none of this month\'s money',             l.collectedMonth === 400, String(l.collectedMonth));

  /* The property the whole feature rests on: picking a month cannot invent a
     second definition, because there is no second copy to disagree with. */
  ok('the month is the only thing that varies',
     JSON.stringify({ ...t, mKey:0 }) !== JSON.stringify({ ...l, mKey:0 })
     && JSON.stringify(revenueForMonth(LEADS, STAGES, TXNS, THIS)) === JSON.stringify(t));
  ok('an empty month is zero, not a fallback to today',
     revenueForMonth(LEADS, STAGES, TXNS, '2019-01').revenueMonth === 0);
  ok('null leads and null txns are safe',
     revenueForMonth(null, STAGES, null, THIS).revenueMonth === 0);
}

/* ================================================== what "still owed" is */

console.log('\n"still owed" is sold-and-unpaid, never quoted and never invoice-driven');
{
  const rows = owedRows(LEADS, STAGES, INVOICES);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));

  ok('a won lead with a balance is a debtor',   !!byId.half && byId.half.amount === 400, JSON.stringify(byId.half));
  ok('an OPEN lead with a live quote is not',   !byId.quo, JSON.stringify(byId.quo));
  ok('a lost lead is not either',               !byId.lost);
  ok('the invoiced client is in for its BALANCE, not its invoice',
     !!byId.inv && byId.inv.amount === 1999, JSON.stringify(byId.inv));

  /* THE INVARIANT. Every amount is owedBy() and only zeroes are dropped, so the
     panel's rows and the tile's total are the same number by construction —
     they cannot drift the way the Dashboard and the Money page did. */
  const total = LEADS.reduce((a, l) => a + owedBy(l, STAGES), 0);
  ok('the rows sum EXACTLY to the outstanding total',
     rows.reduce((a, r) => a + r.amount, 0) === total, `${rows.reduce((a,r)=>a+r.amount,0)} vs ${total}`);
  ok('  and the quoted $9,000 is in neither',   total === 400 + 1999 + 400, String(total));
}

console.log('\nage is two different facts and the row says which');
{
  const rows = owedRows(LEADS, STAGES, INVOICES);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));

  ok('an unpaid invoice makes it genuinely overdue', byId.inv.basis === 'invoice', byId.inv.basis);
  ok('  aged from the DUE date, not the sale',
     byId.inv.days === INVOICE_PAST_DUE_DAYS && byId.inv.days !== SALE_LONG_AGO, String(byId.inv.days));
  ok('  and it names the invoice',                   byId.inv.invoice === 'INV-0007', byId.inv.invoice);

  ok('no invoice means aged from the sale',          byId.half.basis === 'sale', byId.half.basis);
  ok('  which is old, not late',                     byId.half.days > 0 && byId.half.invoice === '');

  /* A PAID invoice must not be picked up as a due date — that would report a
     client as overdue on paperwork they have already settled. */
  ok('a PAID invoice is not treated as a due date',  byId.half.since === `${PREV}-03`, byId.half.since);

  /* ENGINEERING §2 — a missing value that renders as a plausible one is the
     worst kind. "Nobody knows how old this is" must not look like "due today". */
  ok('no date at all gives null, never 0',           byId.nod.days === null, String(byId.nod.days));
  ok('  and says so through its basis',              byId.nod.basis === 'unknown', byId.nod.basis);

  /* ORDERED BY WHAT YOU WOULD DO, not by a single number, because the two ages
     are not the same measurement. Half Paid is OLDER than Late Payer in raw
     days, and still ranks below it: somebody who was billed and ignored it is a
     different job from somebody who was never billed, and sorting the two
     against each other would have put a bill nobody sent above a bill somebody
     is ignoring. */
  ok('a past-due invoice outranks an older un-billed sale',
     rows[0].id === 'inv', rows.map(r => `${r.id}:${r.basis}:${r.days}`).join(','));
  ok('  even though the un-billed one is older in raw days',
     byId.half.days > byId.inv.days, `${byId.half.days} vs ${byId.inv.days}`);
  ok('  and the un-billed sale is next',             rows[1].id === 'half', rows.map(r => r.id).join(','));
  ok('  and the ageless row is last',                rows[rows.length - 1].id === 'nod', rows.map(r => r.id).join(','));
}

console.log('\nthe age of a debt is the LATEST close, and understates rather than overstates');
{
  const repeat = { id:'rep', name:'Repeat', stage:'signed', isClient:true,
    closedAt:'2025-01-05', convertedAt:'2025-01-05', dealValue:0, deals:[],
    closedDeals:[{ id:'a', amount:100, closedAt:'2025-01-05' },
                 { id:'b', amount:100, closedAt:'2026-02-20' }], payments:[] };
  ok('the newest close dates the balance', owedSince(repeat) === '2026-02-20', owedSince(repeat));
  ok('  a record with nothing dated returns empty', owedSince({ id:'x' }) === '');
  ok('  and daysOld refuses an empty date',         daysOld('') === null);
  ok('  today is zero days old, and that is a real 0', daysOld(todayISO()) === 0);
}

console.log('\na past month links to the debt without redefining it');
{
  /* The tile keeps the all-time total on every month — a debt does not belong
     to the month you are looking at — and this is the clause that ties the two
     together instead. It must be a SUBSET, always. */
  const total = LEADS.reduce((a, l) => a + owedBy(l, STAGES), 0);
  const fromPrev = owedFromMonth(LEADS, STAGES, PREV);
  ok('the month-scoped share is the work won that month', fromPrev === 400, String(fromPrev));
  ok('  and is never more than the total',                fromPrev <= total);
  ok('a month with no debts in it is zero',               owedFromMonth(LEADS, STAGES, '2019-01') === 0);
  ok('  which is a real zero, not a missing one',         owedFromMonth([], STAGES, PREV) === 0);
}

console.log(`\n${p} passed, ${f} failed\n`);
process.exit(f ? 1 : 0);
