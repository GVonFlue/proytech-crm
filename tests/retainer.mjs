/* RETAINER — the rules that decide whether money settles a BALANCE or covers a
   MONTH, proved before any of them touch a screen.

   AUDIT #23: a $249 retainer payment and a $1,012 setup payment landed in the
   same array, so a retainer payment silently covered an unpaid setup fee and
   made it look settled. Most of this file is about the two questions being
   answerable independently — and about the classifier refusing to guess.

   Pure, no DOM. `node tests/retainer.mjs`.                                   */
import {
  setupPaid, retainerPaid, allPaid, allPayments,
  monthsFrom, monthsDue, monthsPaid, arrears, retainerStartOf, monthKeyOf,
  proposeAll, applyProposals, needsReview, isReviewed,
} from '../src/lib/retainer.js';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : '')); } };

/* ------------------------------------------------------- THE REPORTED SHAPE */

/* JUSTUS, from the live data — not an invented fixture.
   A $1,011.75 build and a $249/mo retainer. ONE $249 retainer payment has been
   logged, and because it sits in the same array as setup money it has paid down
   the build: the screen reads $762.75 owed.

       1,011.75 − 249 = 762.75

   That subtraction is AUDIT #23 happening in production. The build has not been
   paid at all; a month of retainer arrived and was applied to it. */
const JUSTUS_BUILD = 1011.75;
const JUSTUS_RATE  = 249;

/* How the record looks TODAY: one array, retainer money inside it. */
const JUSTUS_NOW = {
  id: 'l_justus', retainer: JUSTUS_RATE, retainerActive: true, retainerStart: '2026-07-10',
  payments: [{ id: 'p1', amount: JUSTUS_RATE, date: '2026-08-16', note: '' }],
};

console.log('\nJustus, as the record reads today — the reported bug');
{
  /* Reproducing the wrong number first, so the fix has something to be a fix
     OF rather than an assertion in a vacuum. */
  const wrong = JUSTUS_BUILD - setupPaid(JUSTUS_NOW);
  ok('a retainer payment is currently paying down the build', wrong === 762.75, wrong);
  ok('  which is the number on the screen', wrong.toFixed(2) === '762.75');
  ok('the build looks part-paid when nothing has been paid for it',
     setupPaid(JUSTUS_NOW) === 249, setupPaid(JUSTUS_NOW));
}

console.log('\nJustus, classified — the fix');
{
  const p = proposeAll(JUSTUS_NOW);
  ok('one payment to classify', p.length === 1);
  ok('it is proposed as RETAINER', p[0].kind === 'retainer', JSON.stringify(p[0]));
  ok('  because it matches the rate exactly', /matches the retainer amount exactly/.test(p[0].why), p[0].why);
  ok('  and it is not certain, so you confirm it', p[0].certain === false);
  ok('the lead is flagged as needing a look', needsReview(JUSTUS_NOW) === true);

  const fixed = { ...JUSTUS_NOW, ...applyProposals(JUSTUS_NOW, p) };

  /* THE ASSERTION THIS WHOLE FILE EXISTS FOR. */
  ok('NOTHING has been paid toward the build', setupPaid(fixed) === 0, setupPaid(fixed));
  ok('so the balance is the full $1,011.75, not $762.75',
     JUSTUS_BUILD - setupPaid(fixed) === JUSTUS_BUILD, JUSTUS_BUILD - setupPaid(fixed));
  ok('the $249 is still money that arrived', retainerPaid(fixed) === 249);
  ok('  and cash in is unchanged by the reclassification',
     allPaid(fixed) === allPaid(JUSTUS_NOW), `${allPaid(JUSTUS_NOW)} -> ${allPaid(fixed)}`);
  ok('it covers the month it arrived in', monthsPaid(fixed).has('2026-08'));
  ok('and July is what is behind', arrears(fixed, '2026-08').periods.join(',') === '2026-07',
     arrears(fixed, '2026-08').periods.join(','));
  ok('  one month, at the real rate', arrears(fixed, '2026-08').amount === 249);
}

/* A fuller version of the same client, once a few months have run, so the two
   questions can be seen answering independently rather than one at a time. */
const JUSTUS = {
  id: 'l_justus', retainer: JUSTUS_RATE, retainerActive: true, retainerStart: '2026-06-10',
  payments: [{ id: 's1', amount: 237, date: '2026-06-15', note: 'deposit' }],
  retainerPayments: [
    { id: 'r1', amount: JUSTUS_RATE, date: '2026-06-20', period: '2026-06' },
    { id: 'r2', amount: JUSTUS_RATE, date: '2026-07-18', period: '2026-07' },
    { id: 'r3', amount: JUSTUS_RATE, date: '2026-08-16', period: '2026-08' },
  ],
};

console.log('\nthe two questions are answerable independently');
{
  ok('paid against the WORK is the setup array only', setupPaid(JUSTUS) === 237, setupPaid(JUSTUS));
  ok('paid against the RETAINER is the other array only', retainerPaid(JUSTUS) === 747, retainerPaid(JUSTUS));
  ok('and cash in is both, because cash is cash', allPaid(JUSTUS) === 984, allPaid(JUSTUS));
  ok('retainer money does NOT settle the build', setupPaid(JUSTUS) < JUSTUS_BUILD);
  ok('  and the shortfall is the real one',
     Math.round((JUSTUS_BUILD - setupPaid(JUSTUS)) * 100) / 100 === 774.75,
     JUSTUS_BUILD - setupPaid(JUSTUS));
}

console.log('\nrevenue sees every dollar, tagged, and can sum neither by accident');
{
  const all = allPayments(JUSTUS);
  ok('four payments in total', all.length === 4, all.length);
  ok('each is tagged', all.every(p => p.kind === 'setup' || p.kind === 'retainer'));
  ok('they add up to the cash that arrived', all.reduce((a, p) => a + p.amount, 0) === 984,
     all.reduce((a, p) => a + p.amount, 0));
}

/* -------------------------------------------------------------- the months */

console.log('\nmonths are counted on periods, not on dates');
{
  ok('an inclusive range', monthsFrom('2026-05', '2026-08').join(',') === '2026-05,2026-06,2026-07,2026-08');
  ok('a single month', monthsFrom('2026-08', '2026-08').join(',') === '2026-08');
  ok('backwards is empty, not a crash', monthsFrom('2026-08', '2026-05').length === 0);
  ok('rubbish is empty', monthsFrom('nope', '2026-08').length === 0 && monthsFrom('', '').length === 0);
  ok('it crosses a year end', monthsFrom('2025-11', '2026-02').join(',') === '2025-11,2025-12,2026-01,2026-02');
  ok('a wild start does not hang the render', monthsFrom('1026-01', '2026-08').length <= 600);

  ok('the start comes from retainerStart', retainerStartOf(JUSTUS) === '2026-06');
  ok('  falling back to convertedAt when it was never stamped',
     retainerStartOf({ convertedAt: '2026-03-04' }) === '2026-03');

  ok('due counts from the start, inclusive of this month',
     monthsDue(JUSTUS, '2026-08').join(',') === '2026-06,2026-07,2026-08');
  ok('paid is the DISTINCT periods covered', monthsPaid(JUSTUS).size === 3);
}

console.log('\npaying late, in bulk, or not at all');
{
  /* Two months paid on one day, tagged with the periods they cover. A date-only
     model would count this as one month. */
  const bulk = { retainer: 100, retainerActive: true, retainerStart: '2026-06-01', payments: [],
    retainerPayments: [
      { id: 'a', amount: 200, date: '2026-08-02', period: '2026-06' },
      { id: 'b', amount: 0, date: '2026-08-02', period: '2026-07' },
    ] };
  ok('two months paid on one day credits two months', monthsPaid(bulk).size === 2);
  const ar = arrears(bulk, '2026-08');
  ok('and August is what is left owing', ar.periods.join(',') === '2026-08', ar.periods.join(','));
  ok('  one month behind', ar.months === 1);
  ok('  worth one month', ar.amount === 100);
  ok('  so not current', ar.current === false);

  /* Paid late: July's money arrives in September, still covering July. */
  const late = { retainer: 100, retainerActive: true, retainerStart: '2026-07-01', payments: [],
    retainerPayments: [{ id: 'c', amount: 100, date: '2026-09-03', period: '2026-07' }] };
  ok('a late payment credits the month it was FOR', monthsPaid(late).has('2026-07'));
  ok('  and August is still behind', arrears(late, '2026-08').periods.join(',') === '2026-08');

  ok('a fully current client is current', arrears(JUSTUS, '2026-08').current === true);
  ok('  with nothing outstanding', arrears(JUSTUS, '2026-08').amount === 0);
}

console.log('\na retainer that is switched off stops accruing');
{
  const off = { retainer: 100, retainerActive: false, retainerStart: '2026-01-01', payments: [], retainerPayments: [] };
  ok('no months are due', monthsDue(off, '2026-08').length === 0);
  ok('  and no arrears — the documented limit is that a PAUSE reads the same way',
     arrears(off, '2026-08').months === 0);
  const zero = { retainer: 0, retainerActive: true, retainerStart: '2026-01-01', payments: [], retainerPayments: [] };
  ok('a $0 retainer accrues nothing', monthsDue(zero, '2026-08').length === 0);
}

/* ------------------------------------------------ the retroactive question */

console.log('\nwhat can be decided WITHOUT a human');
{
  const never = { retainerActive: false, retainer: 0, retainerStart: '',
    payments: [{ id: 'x', amount: 500, date: '2026-05-01', note: '' },
               { id: 'y', amount: 249, date: '2026-06-01', note: '' }] };
  const p = proposeAll(never);
  ok('a lead that never had a retainer: every payment is setup', p.every(r => r.kind === 'setup'));
  ok('  and it is CERTAIN, so it needs no confirmation', p.every(r => r.certain));
  ok('  even the one that looks like a retainer amount', p[1].kind === 'setup');
  ok('  so the lead needs no review at all', needsReview(never) === false);

  const before = { retainerActive: true, retainer: 100, retainerStart: '2026-06-01',
    payments: [{ id: 'z', amount: 100, date: '2026-04-11', note: '' }] };
  const q = proposeAll(before)[0];
  ok('a payment dated before the retainer started cannot be one', q.kind === 'setup');
  ok('  certainly', q.certain === true, JSON.stringify(q));
  ok('  and it says why', /before the retainer started/.test(q.why), q.why);
}

console.log('\nwhat is PROPOSED, with its reason');
{
  const lead = { retainerActive: true, retainer: 248.75, retainerStart: '2026-01-01',
    payments: [
      { id: 'a', amount: 248.75, date: '2026-02-01', note: '' },
      { id: 'b', amount: 500, date: '2026-02-02', note: 'monthly retainer' },
      { id: 'c', amount: 1012, date: '2026-02-03', note: 'website deposit' },
      { id: 'd', amount: 777, date: '2026-02-04', note: '' },
    ] };
  const p = proposeAll(lead);
  const by = Object.fromEntries(p.map(x => [x.id, x]));

  ok('an exact amount match proposes retainer', by.a.kind === 'retainer', JSON.stringify(by.a));
  ok('  and says so', /matches the retainer amount exactly/.test(by.a.why), by.a.why);
  ok('  but is NOT certain — an amount can coincide', by.a.certain === false);

  ok('a note beats the amount: "monthly retainer" on a $500 row', by.b.kind === 'retainer', JSON.stringify(by.b));
  ok('a setup-shaped note proposes setup', by.c.kind === 'setup', JSON.stringify(by.c));
  ok('  quoting the note back', /website deposit/.test(by.c.why), by.c.why);

  /* THE ONE THAT MATTERS. */
  ok('an unremarkable payment is NOT guessed', by.d.kind === '', JSON.stringify(by.d));
  ok('  it asks instead', /needs a decision/.test(by.d.why), by.d.why);
  ok('  so the lead needs a review', needsReview(lead) === true);

  /* Repetition strengthens the reason without changing the verdict. */
  const rep = { retainerActive: true, retainer: 100, retainerStart: '2026-01-01',
    payments: [1, 2, 3].map(i => ({ id: 'r' + i, amount: 100, date: `2026-0${i + 1}-05`, note: '' })) };
  const rp = proposeAll(rep);
  ok('three identical amounts still propose retainer', rp.every(r => r.kind === 'retainer'));
  ok('  and the reason cites the repetition', /3 payments share that amount/.test(rp[0].why), rp[0].why);
}

console.log('\nnothing is guessed toward the DANGEROUS side');
{
  /* Assuming setup is the tempting default and it is exactly the bug: it puts
     retainer money against a balance and makes an unpaid fee look settled. */
  const lead = { retainerActive: true, retainer: 300, retainerStart: '2026-01-01',
    payments: [{ id: 'u', amount: 450, date: '2026-05-05', note: '' }] };
  const p = proposeAll(lead)[0];
  ok('an ambiguous payment is not defaulted to setup', p.kind !== 'setup', JSON.stringify(p));
  ok('  nor to retainer', p.kind !== 'retainer');
  ok('  it is left for a human', p.kind === '');
}

console.log('\napplying decisions produces two arrays for ONE write');
{
  const lead = { retainerActive: true, retainer: 100, retainerStart: '2026-01-01',
    payments: [
      { id: 'a', amount: 100, date: '2026-02-11', note: '' },
      { id: 'b', amount: 900, date: '2026-02-12', note: 'build' },
      { id: 'c', amount: 55, date: '2026-03-01', note: '' },
    ],
    retainerPayments: [{ id: 'old', amount: 100, date: '2026-01-05', period: '2026-01' }] };
  const out = applyProposals(lead, [
    { id: 'a', kind: 'retainer' }, { id: 'b', kind: 'setup' }, { id: 'c', kind: '' },
  ]);
  ok('setup keeps the setup rows', out.payments.map(p => p.id).join(',') === 'b,c', out.payments.map(p => p.id).join(','));
  ok('  including the undecided one, so nothing is dropped', out.payments.some(p => p.id === 'c'));
  ok('retainer gains the moved row', out.retainerPayments.some(p => p.id === 'a'));
  ok('  and keeps what was already there', out.retainerPayments.some(p => p.id === 'old'));
  ok('a moved row gets the period it arrived in, as a starting point',
     out.retainerPayments.find(p => p.id === 'a').period === '2026-02');
  ok('the lead is marked reviewed', out.paymentsReviewed === true);
  ok('  and isReviewed reads it', isReviewed({ ...lead, ...out }) === true);
  /* One object, so the caller can hand it to a single set() — ENGINEERING §3. */
  ok('it returns ONE object for ONE write', Object.keys(out).sort().join(',') === 'payments,paymentsReviewed,retainerPayments');
  ok('no money went missing', out.payments.length + out.retainerPayments.length === 4);
}

console.log('\nrubbish in does not throw');
{
  ok('null lead', setupPaid(null) === 0 && retainerPaid(null) === 0 && allPaid(null) === 0);
  ok('no arrays', monthsPaid({}).size === 0 && proposeAll({}).length === 0);
  ok('arrears on nothing', arrears(null, '2026-08').months === 0);
  ok('a string amount is still money', setupPaid({ payments: [{ id: 'a', amount: '$1,200.50' }] }) === 1200.5);
  ok('monthKeyOf tolerates junk', monthKeyOf(null) === '' && monthKeyOf('2026-08-19') === '2026-08');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
