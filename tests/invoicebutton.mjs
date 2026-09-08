/* THE INVOICE BUTTON ON THE RECORD — asserting on WHAT REACHES THE DATABASE.
   ============================================================================

   tests/invoicebalance.mjs owns the arithmetic. This file owns the claims that
   arithmetic cannot make: that the button is actually on the screen next to the
   figure, that pressing it stores an invoice whose total is that figure, and
   that pressing it a second time does not quietly raise a second bill.

   THE ONE THAT WOULD HURT MOST IS THE THIRD. A duplicate invoice is not a
   crash and not a wrong pixel — it is a client receiving two bills for the same
   $1,399, discovered by them rather than by us.

   Requires jsdom. Run directly:  node tests/invoicebutton.mjs                 */
import { testAsync, eq, ok, report } from './assert.mjs';
import { mount } from './harness.mjs';

const STAGES = [
  { key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
  { key:'signed', label:'Signed', color:'#1F9D55', prob:1, open:false, won:true, lost:false },
  { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
  { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true },
];
/* modulesV 10 so the one-time module backfills do not run and count as writes. */
const SETTINGS = extra => ({
  modules:['dash','leads','settings','invoices','money'], modulesV:10, stages:STAGES,
  retainerStartCleared:'2026-01-01T00:00:00.000Z', ...extra,
});

/* $2,899 contracted, $1,500 paid, $1,399 owed — the case from the request. */
const ALEX = over => ({
  id:'alex', name:'Alex Colon', company:'Colon Co', email:'alex@example.com', phone:'555-0100',
  stage:'signed', isClient:true, owner:'Garrett', priority:'medium',
  deals:[{ id:'d1', label:'', setup:0, website:2899, integration:0, extras:[] }],
  payments:[{ id:'p1', amount:1500, date:'2026-07-01' }],
  closedDeals:[], createdAt:'2026-04-01T10:00:00.000Z',
  activities:[], meetings:[], custom:{}, labels:[], keyDates:[], ...over,
});

const btn = (app, re) => [...app.container.querySelectorAll('button')].find(b => re.test((b.textContent||'').trim()));
const invTotalOf = inv => (inv.items||[]).reduce((a,it)=>a+Number(it.qty)*Number(it.amount),0)
  * (1 + Number(inv.taxRate||0)/100);

/* Leads -> the record -> its Deal section, which is where the money lives. */
async function openDeal(app) {
  await app.click(btn(app, /^Leads$/));
  await app.click([...app.container.querySelectorAll('.namecell')].find(e => /Alex/.test(e.textContent||'')));
  const deal = [...app.container.querySelectorAll('.modal button')]
    .filter(b => /^Deal$/.test((b.textContent||'').trim()));
  for (const d of deal) { await app.click(d); if (app.container.querySelector('.pay-panel')) break; }
  ok(!!app.container.querySelector('.pay-panel'), 'the payments panel should be open');
}

/* ------------------------------------------------------------------------- */

await testAsync('the button sits next to the amount owed and names it', async tc => {
  const app = await mount({ leads:[ALEX()], settings:SETTINGS() });
  tc.after(() => app.unmount());
  await openDeal(app);

  const head = app.container.querySelector('.pay-head');
  ok(/\$1,399/.test(head.textContent), 'the head should show the balance: ' + head.textContent);

  const b = app.container.querySelector('.pay-inv');
  ok(!!b, 'the invoice button should render');
  /* It names the amount rather than saying "Invoice". The figure on the button
     and the figure beside it are the same number, and the button says so, so
     there is nothing to find out by clicking. */
  ok(/\$1,399/.test(b.textContent), 'the button should name the amount: ' + b.textContent);
  ok(head.contains(b), 'and it should sit in the same row as the balance');
});

await testAsync('clicking it stores an invoice whose total IS the owed figure', async tc => {
  const app = await mount({ leads:[ALEX()], settings:SETTINGS() });
  tc.after(() => app.unmount());
  await openDeal(app);

  eq(app.db.invoices.length, 0, 'no invoice before the click');
  await app.click(app.container.querySelector('.pay-inv'));
  await app.wait(50);

  eq(app.db.invoices.length, 1, 'exactly one invoice after one click');
  const inv = app.db.invoices[0];

  /* THE WHOLE POINT. Not $2,899 — the contract — but $1,399, the balance. */
  ok(Math.abs(invTotalOf(inv) - 1399) < 0.005, 'the invoice total is the balance, not the contract: ' + invTotalOf(inv));

  /* Prefilled from the record, which is the other half of the ask. */
  eq(inv.clientId, 'alex', 'it is linked to the record');
  eq(inv.billTo.name, 'Alex Colon', 'the name is prefilled');
  eq(inv.billTo.email, 'alex@example.com', 'the email is prefilled');
  eq(inv.billTo.company, 'Colon Co', 'the company is prefilled');
  eq(inv.status, 'draft', 'it arrives as a draft to edit, not as something already sent');
  ok(!!inv.number, 'it takes a number from the shared sequence');
  ok(!!inv.dueDate && inv.dueDate > inv.issueDate, 'it has a due date after the issue date');

  /* The line items describe the work, not just "balance". */
  const labels = inv.items.map(i => i.label).join(' | ');
  ok(/Website/.test(labels), 'the work is described: ' + labels);
  ok(/payments received/i.test(labels), 'and the deposit is credited: ' + labels);
});

await testAsync('THE DUPLICATE GUARD — a second click does not quietly bill again', async tc => {
  const app = await mount({ leads:[ALEX()], settings:SETTINGS() });
  tc.after(() => app.unmount());
  await openDeal(app);

  await app.click(app.container.querySelector('.pay-inv'));
  await app.wait(50);
  eq(app.db.invoices.length, 1, 'one invoice after the first click');

  /* Second click: nothing is created, and the screen NAMES what is already out
     rather than refusing with no explanation. */
  await app.click(app.container.querySelector('.pay-inv'));
  await app.wait(50);
  eq(app.db.invoices.length, 1, 'the second click must not create a second invoice');

  const dupe = app.container.querySelector('.pay-dupe');
  ok(!!dupe, 'the duplicate prompt should appear');
  const t = dupe.textContent || '';
  ok(/already an unpaid invoice/i.test(t), 'it should say one is already out: ' + t.slice(0,120));
  ok(new RegExp(app.db.invoices[0].number).test(t), 'and name it: ' + t.slice(0,160));
  ok(/on top of/i.test(t), 'and say what raising another would do');

  /* Cancel leaves the record exactly as it was. */
  await app.click(btn(app, /^Cancel$/));
  await app.wait(20);
  eq(app.db.invoices.length, 1, 'cancelling creates nothing');
  ok(!app.container.querySelector('.pay-dupe'), 'and closes the prompt');
});

await testAsync('but a deliberate second invoice is still possible', async tc => {
  const app = await mount({ leads:[ALEX()], settings:SETTINGS() });
  tc.after(() => app.unmount());
  await openDeal(app);

  await app.click(app.container.querySelector('.pay-inv'));
  await app.wait(50);
  await app.click(app.container.querySelector('.pay-inv'));
  await app.wait(20);
  await app.click(btn(app, /anyway/i));
  await app.wait(50);

  /* The guard is a speed bump, not a lock — billing twice is a legitimate thing
     to do on purpose, and a control that cannot be overridden gets worked
     around outside the product. */
  eq(app.db.invoices.length, 2, 'confirming raises the second one');
  const nums = app.db.invoices.map(i => i.number);
  eq(new Set(nums).size, 2, 'and the two carry different numbers: ' + nums.join(','));
});

await testAsync('a record with nothing owed offers no button at all', async tc => {
  /* Paid in full. There is nothing to bill, and a button that opens a $0
     invoice looks exactly like a button that worked. */
  const app = await mount({
    leads:[ALEX({ payments:[{ id:'p1', amount:2899, date:'2026-07-01' }] })],
    settings:SETTINGS(),
  });
  tc.after(() => app.unmount());
  await openDeal(app);

  ok(/paid in full/i.test(app.container.querySelector('.pay-head').textContent),
     'the panel should read paid in full');
  ok(!app.container.querySelector('.pay-inv'), 'and offer no invoice button');
  eq(app.db.invoices.length, 0, 'nothing was created');
});

await testAsync('MERELY OPENING THE RECORD BILLS NOBODY', async tc => {
  /* The parity guarantee for this change: a record with a balance must look
     exactly as it did, and write exactly what it did, until the button is
     pressed. */
  const app = await mount({ leads:[ALEX()], settings:SETTINGS() });
  tc.after(() => app.unmount());
  await openDeal(app);

  eq(app.db.invoices.length, 0, 'opening the record creates no invoice');
  const writes = app.db.writes.filter(w => w.op === 'saveInvoices');
  eq(writes, [], 'and writes nothing to the invoice store');
});

report('invoice button');
