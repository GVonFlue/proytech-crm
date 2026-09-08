/* INVOICING THE BALANCE — the number must be the same in both places.
   ============================================================================

   THE QUESTION THIS FILE EXISTS TO ANSWER

   "If I invoice the full owed amount and he pays, does owed go to zero, or does
   it now double-count because the invoice and the deal are two separate
   records?"

   It goes to zero, and the chain that makes that true is four links long, each
   in a different file:

     owedBy(l)              = contractedTotal(l) − setupPaid(l)   lib/lead.js
     setupPaid(l)           = sum(l.payments)                     lib/retainer.js
     applyInvoicePayment()  pushes {invoiceId, amount} into l.payments   App.jsx
     balanceItems(l)        sums to exactly owedBy(l)             lib/lead.js

   Break any one and the record and the invoice start disagreeing about the same
   money — the ENGINEERING §2 failure, arriving this time as a client billed
   twice for a deposit. So the chain is asserted end to end below, by simulating
   the payment write rather than trusting that it happens.

   Pure functions plus one simulated write. No DOM.
   lib/lead.js pulls lucide-react in through ACT_TYPES, so this bundles with
   esbuild exactly as tests/dispositions.mjs does.                            */
import fs from 'fs';
import esbuild from 'esbuild';

const bundle = async entry => {
  const out = await esbuild.build({ entryPoints:[entry], bundle:true, write:false,
    format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
    define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
    logLevel:'silent' });
  const f = 'tests/.bib' + Math.random().toString(36).slice(2,6) + '.mjs';
  fs.writeFileSync(f, out.outputFiles[0].text);
  return import('./' + f.slice(6) + '?v=' + Date.now());
};
const L = await bundle('src/lib/lead.js');
const R = await bundle('src/lib/retainer.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const STAGES = [
  { key:'new', label:'New', prob:.1, open:true, won:false, lost:false },
  { key:'signed', label:'Signed', prob:1, open:false, won:true, lost:false },
];

/* Alex's shape: one deal, part paid. */
const client = over => ({
  id:'alex', name:'Alex Colón', company:'Colón Co', email:'alex@example.com',
  stage:'signed', isClient:true, payments:[], retainerPayments:[],
  deals:[{ id:'d1', label:'', setup:0, website:2899, integration:0, extras:[] }],
  closedDeals:[], activities:[], ...over,
});

const sumItems = items => (items||[]).reduce((a,it)=>a+Number(it.qty)*Number(it.amount),0);

/* ------------------------------------------------------------------------- */
console.log('\nthe invoice total IS the owed figure, by construction');
{
  /* $2,899 contracted, $1,500 in, $1,399 owed — the case from the request. */
  const alex = client({ payments:[{ id:'p1', amount:1500, date:'2026-07-01' }] });
  const owed = L.owedBy(alex, STAGES);
  ok('owed is contracted minus paid', near(owed, 1399), owed);

  const items = L.balanceItems(alex, STAGES);
  ok('the items sum to exactly the owed figure', near(sumItems(items), owed),
     `${sumItems(items)} vs ${owed}: ` + JSON.stringify(items));

  /* And it says WHY it is not the contract value, on the invoice, so the client
     can see the deposit they already paid rather than querying the bill. */
  ok('the work is itemised at its contracted value',
     items.some(it => near(it.amount, 2899)), JSON.stringify(items));
  ok('and the money already received is credited back',
     items.some(it => near(it.amount, -1500)), JSON.stringify(items));
  ok('the credit line says what it is',
     /payments received/i.test(items.find(it => it.amount < 0).label));
}

console.log('\nnothing paid yet — bill the contract, with no phantom credit line');
{
  const fresh = client();
  const items = L.balanceItems(fresh, STAGES);
  ok('total still equals owed', near(sumItems(items), L.owedBy(fresh, STAGES)));
  ok('no credit line when nothing has been paid',
     !items.some(it => it.amount < 0), JSON.stringify(items));
  ok('one line for the work', items.length === 1 && near(items[0].amount, 2899), JSON.stringify(items));
}

console.log('\nnothing owed — the button must refuse rather than open a blank invoice');
{
  ok('paid in full yields no items',
     L.balanceItems(client({ payments:[{ id:'p1', amount:2899, date:'2026-07-01' }] }), STAGES) === null);
  ok('overpaid yields no items',
     L.balanceItems(client({ payments:[{ id:'p1', amount:4000, date:'2026-07-01' }] }), STAGES) === null);
  /* An OPEN lead has not bought anything, so it owes nothing and cannot be
     billed — the same rule owedBy states. */
  ok('an open lead at a non-won stage yields no items',
     L.balanceItems(client({ stage:'new', isClient:false }), STAGES) === null);
}

console.log('\nTHE DOUBLE-COUNT QUESTION — invoice the balance, mark it paid, owed hits zero');
{
  const alex = client({ payments:[{ id:'p1', amount:1500, date:'2026-07-01' }] });
  const owedBefore = L.owedBy(alex, STAGES);
  const items = L.balanceItems(alex, STAGES);

  /* What applyInvoicePayment() does in App.jsx, reproduced exactly: the whole
     invoice total, as ONE row in lead.payments, tagged with the invoice id. */
  const invoiceTotal = sumItems(items);          // taxRate 0, the shipped default
  const afterPaid = { ...alex, payments:[...alex.payments,
    { id:'p2', invoiceId:'inv1', amount:invoiceTotal, date:'2026-08-01', note:'Invoice INV-0007' }] };

  ok('the invoice was for the owed amount', near(invoiceTotal, owedBefore), invoiceTotal);
  ok('owed goes to ZERO, not to double', near(L.owedBy(afterPaid, STAGES), 0), L.owedBy(afterPaid, STAGES));
  /* The reason it cannot double: owedBy has never read an invoice. The invoice
     only ever reaches the balance THROUGH a payment row. */
  ok('the payment landed in the setup array, which is what a balance is measured with',
     near(R.setupPaid(afterPaid), 2899), R.setupPaid(afterPaid));
  ok('every dollar received is still 2,899 — nothing was counted twice',
     near(R.allPaid(afterPaid), 2899), R.allPaid(afterPaid));

  /* Unmarking paid removes only that row, so the balance comes straight back. */
  const unmarked = { ...afterPaid, payments: afterPaid.payments.filter(p => p.invoiceId !== 'inv1') };
  ok('unmarking the invoice restores the balance', near(L.owedBy(unmarked, STAGES), 1399));
}

console.log('\nAUDIT #23 — a balance invoice must never carry a retainer line');
{
  /* itemsFromLead() in App.jsx appends "Monthly retainer" when retainerActive.
     Here that would be actively harmful: applyInvoicePayment writes the whole
     invoice total into lead.payments — the SETUP array — so a retainer line on
     a balance invoice is a month of recurring money paying down a build. That
     is the Justus $249 bug PaymentReview exists to clean up after. */
  const onRetainer = client({
    payments:[{ id:'p1', amount:1500, date:'2026-07-01' }],
    retainer:249, retainerActive:true,
  });
  const items = L.balanceItems(onRetainer, STAGES);
  ok('no retainer line appears', !items.some(it => /retainer/i.test(it.label)), JSON.stringify(items));
  ok('no line carries the retainer amount', !items.some(it => near(it.amount, 249)), JSON.stringify(items));
  ok('the total is still exactly the one-off balance',
     near(sumItems(items), L.owedBy(onRetainer, STAGES)));
  /* And owedBy itself has no retainer in it, which is the invariant this rests
     on — asserted here too so the two cannot drift apart. */
  ok('owedBy is unmoved by an active retainer',
     near(L.owedBy(onRetainer, STAGES), 1399), L.owedBy(onRetainer, STAGES));
}

console.log('\nseveral deals, and archived closed deals, all reach the invoice');
{
  const many = client({
    deals:[
      { id:'d1', label:'Website', setup:500, website:2000, integration:0, extras:[] },
      { id:'d2', label:'Automations', setup:0, website:0, integration:1200,
        extras:[{ id:'e1', label:'Extra training', amount:300 }] },
    ],
    closedDeals:[{ id:'c1', label:'Original build', amount:1000, closedAt:'2026-01-10' }],
    payments:[{ id:'p1', amount:2000, date:'2026-07-01' }],
  });
  const owed = L.owedBy(many, STAGES);          // 5000 contracted − 2000 = 3000
  const items = L.balanceItems(many, STAGES);
  ok('contracted reads 5,000 across open and closed', near(L.contractedTotal(many), 5000), L.contractedTotal(many));
  ok('the total still equals owed', near(sumItems(items), owed), `${sumItems(items)} vs ${owed}`);
  ok('the archived closed deal is a line', items.some(it => /Original build/.test(it.label)), JSON.stringify(items));
  ok('the extra is a line', items.some(it => /Extra training/.test(it.label)), JSON.stringify(items));
  /* Multi-deal lines are prefixed so a client can tell which job a Setup line
     belongs to — the same wording itemsFromLead uses, so two invoices for the
     same client do not describe the same work differently. */
  ok('lines are prefixed by deal when there is more than one',
     items.some(it => /^Website — /.test(it.label)), JSON.stringify(items));
}

console.log('\na bare dealValue with no deal rows still bills something real');
{
  /* dealsOf() migrates a bare dealValue into a synthetic deal, so this should
     itemise — but if that ever changes, the balance must still be billable
     rather than coming out as an empty invoice. */
  const bare = client({ deals:[], dealValue:800, payments:[] });
  const owed = L.owedBy(bare, STAGES);
  const items = L.balanceItems(bare, STAGES);
  if (owed > 0) {
    ok('a bare dealValue produces items', !!items && items.length > 0, JSON.stringify(items));
    ok('and they sum to owed', near(sumItems(items), owed), `${sumItems(items)} vs ${owed}`);
  } else {
    ok('a bare dealValue owes nothing, so nothing is billed', items === null);
  }
}

console.log('\nrounding cannot leave the invoice a cent away from the figure clicked');
{
  const odd = client({
    deals:[{ id:'d1', label:'', setup:1011.75, website:0, integration:0,
             extras:[{ id:'e1', label:'Odd', amount:0.1 }] }],
    payments:[{ id:'p1', amount:249.33, date:'2026-07-01' }],
  });
  const owed = L.owedBy(odd, STAGES);
  const items = L.balanceItems(odd, STAGES);
  ok('the total matches to the cent', near(sumItems(items), owed), `${sumItems(items)} vs ${owed}`);
  ok('every line is rounded to real money',
     items.every(it => Math.abs(it.amount * 100 - Math.round(it.amount * 100)) < 1e-6), JSON.stringify(items));
}

/* ------------------------------------------------------------------------- */
console.log('\nthe duplicate guard — one predicate for "is a bill already out"');
{
  const inv = over => ({ id:'i1', clientId:'alex', number:'INV-0001', status:'sent',
    issueDate:'2026-08-01', dueDate:'2026-08-15', items:[], taxRate:0, ...over });

  ok('an unpaid invoice on this record is found',
     L.openInvoicesFor({ id:'alex' }, [inv()]).length === 1);
  ok('a paid one is not', L.openInvoicesFor({ id:'alex' }, [inv({ status:'paid' })]).length === 0);
  ok('someone else\'s is not', L.openInvoicesFor({ id:'alex' }, [inv({ clientId:'other' })]).length === 0);
  ok('a manual invoice with no client is not',
     L.openInvoicesFor({ id:'alex' }, [inv({ clientId:'' })]).length === 0);
  ok('a draft counts as already out — it exists and can be sent',
     L.openInvoicesFor({ id:'alex' }, [inv({ status:'draft' })]).length === 1);

  /* AN INVOICE WITH NO DUE DATE IS STILL A DUPLICATE. It is a bill that exists;
     it simply cannot be overdue. oldestUnpaidInvoice excludes it because that
     one dates the debt, and conflating the two questions is how a second bill
     gets raised against a client who already has one. */
  const undated = inv({ id:'i2', dueDate:'' });
  ok('an undated invoice still blocks a silent second bill',
     L.openInvoicesFor({ id:'alex' }, [undated]).length === 1);
  ok('but it cannot date the debt',
     L.oldestUnpaidInvoice({ id:'alex' }, [undated]) === null);

  /* The two readers still agree on the overlapping case, so the Money page's
     basis column and the record's guard cannot tell different stories. */
  const both = [inv({ id:'i2', dueDate:'2026-09-01' }), inv({ id:'i3', dueDate:'2026-08-02' })];
  ok('both invoices are duplicates', L.openInvoicesFor({ id:'alex' }, both).length === 2);
  ok('and the earliest due one dates the debt',
     L.oldestUnpaidInvoice({ id:'alex' }, both).id === 'i3');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
