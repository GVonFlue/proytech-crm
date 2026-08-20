/* REP PAY — the rules that turn a meeting into somebody's wages.

   Proved before any of it touches a screen. Three decisions are encoded here
   and each has a test named after it:

     PAID ON HELD, NOT BOOKED
     THE FEE FOLLOWS THE SETTER, NOT THE LEAD'S OWNER
     DERIVED WHILE PENDING, FROZEN ON APPROVAL, NEVER REVERSED ONCE PAID

   `node tests/reppay.mjs`.                                                   */
import {
  setterOf, heldMark, rateOf, feeState, feeStale, meetingRows,
  apptEarnings, awaitingApproval, payoutsFor, paidOut, repBalance,
  commissionEarnings, payModels, markHeld, approveFee, voidFee,
} from '../src/lib/reppay.js';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : '')); } };

const DANA = { id: 'u_dana', name: 'Dana', appointment_rate: 75, commission_pct: 0 };
const SAM  = { id: 'u_sam',  name: 'Sam',  appointment_rate: 0,  commission_pct: 10 };
const NEW  = { id: 'u_new',  name: 'Pat',  appointment_rate: 0,  commission_pct: 0 };

const mtg = (id, o = {}) => ({ id, title: 'Discovery', mtype: 'Discovery',
  start: '2026-08-10T15:00:00.000Z', status: '', setById: 'u_dana', setBy: 'Dana', ...o });

console.log('\npaid on HELD, not booked');
{
  ok('a booked meeting earns nothing', feeState(mtg('m1')) === '');
  ok('a held meeting is pending', feeState(mtg('m2', { status: 'held' })) === 'pending');
  ok('a no-show earns nothing', feeState(mtg('m3', { status: 'noshow' })) === '');
  ok('a cancelled meeting earns nothing', feeState(mtg('m4', { status: 'cancelled' })) === '');
  const leads = [{ id: 'l1', meetings: [mtg('a'), mtg('b', { status: 'held' }), mtg('c', { status: 'noshow' })] }];
  const e = apptEarnings(leads, 'u_dana', 75);
  ok('only the held one is counted', e.pending.length === 1, String(e.pending.length));
  ok('  at the rate', e.pendingTotal === 75, String(e.pendingTotal));
}

console.log('\nthe fee follows the SETTER, not the lead owner');
{
  /* Dana set it. The lead has since been reassigned to Sam — which happens, and
     must not cost Dana a fee she earned. */
  const leads = [{ id: 'l1', owner: 'Sam', owner_id: 'u_sam',
    meetings: [mtg('m', { status: 'held', setById: 'u_dana', setBy: 'Dana' })] }];
  ok('Dana is owed it', apptEarnings(leads, 'u_dana', 75).pendingTotal === 75);
  ok('Sam is not, even though he owns the lead', apptEarnings(leads, 'u_sam', 75).pendingTotal === 0);
  ok('the setter is readable off the meeting', setterOf(leads[0].meetings[0]) === 'u_dana');
  ok('a meeting with no setter belongs to nobody', setterOf(mtg('x', { setById: '', setBy: '' })) === '');
}

console.log('\nwho marked it held is on the record — it is a claim for money now');
{
  const m = markHeld(mtg('m'), 'Dana', 'u_dana', '2026-08-11T09:00:00.000Z');
  ok('the status is held', m.status === 'held');
  ok('  by a named person', heldMark(m).by === 'Dana');
  ok('  with their id', heldMark(m).byId === 'u_dana');
  ok('  and a timestamp', heldMark(m).at === '2026-08-11T09:00:00.000Z');
  ok('an unheld meeting has no mark', heldMark(mtg('m2')) === null);
  ok('markHeld returns a PATCH rather than writing', typeof m === 'object' && m.id === 'm');
}

console.log('\nderived while pending — the rate is live');
{
  const m = mtg('m', { status: 'held' });
  ok('it pays at the current rate', rateOf(m, 75) === 75);
  ok('  which moves if the rate moves', rateOf(m, 100) === 100);
  /* And it stops existing entirely if the status is corrected. */
  ok('correcting the status removes the fee', feeState({ ...m, status: 'noshow' }) === '');
}

console.log('\nfrozen on approval — a rate change never restates it');
{
  const held = markHeld(mtg('m'), 'Dana', 'u_dana', '2026-08-11T09:00:00.000Z');
  const appr = approveFee(held, 75, 'Garrett', '2026-08-12T09:00:00.000Z');
  ok('the state is approved', feeState(appr) === 'approved');
  ok('the rate is frozen at 75', rateOf(appr, 999) === 75, String(rateOf(appr, 999)));
  ok('  and says who approved it', appr.payApprovedBy === 'Garrett');
  /* Approved, then the status is changed. It must NOT silently vanish. */
  const moved = { ...appr, status: 'noshow' };
  ok('unmarking held does not reverse an approved fee', feeState(moved) === 'approved');
  ok('  it is FLAGGED instead, for a human', feeStale(moved) === true);
  ok('a still-held approved fee is not flagged', feeStale(appr) === false);
  ok('voiding is explicit', feeState(voidFee(appr, 'Garrett', '2026-08-13T09:00:00.000Z')) === 'void');
  ok('  and a voided fee stops being flagged', feeStale(voidFee(moved, 'G', '2026-08-13T09:00:00.000Z')) === false);
}

console.log('\nnever reversed once paid');
{
  const paid = { ...approveFee(markHeld(mtg('m'), 'Dana', 'u_dana', ''), 75, 'G', ''), payPaidAt: '2026-08-20' };
  ok('the state is paid', feeState(paid) === 'paid');
  ok('changing the status does not touch it', feeState({ ...paid, status: 'noshow' }) === 'paid');
  ok('  because money that has left is corrected, not rewritten', true);
}

console.log('\none fee per appointment, not per attempt');
{
  /* Rescheduling moves the SAME meeting record, so the fee cannot multiply.
     If rescheduling ever created a new record, this is the test that would
     start failing — which is the point of asserting it. */
  const m = mtg('m', { status: 'held', start: '2026-08-20T15:00:00.000Z' });
  const leads = [{ id: 'l1', meetings: [m] }];
  ok('one held meeting is one fee', apptEarnings(leads, 'u_dana', 75).pendingTotal === 75);
  const rescheduled = [{ id: 'l1', meetings: [{ ...m, start: '2026-08-27T15:00:00.000Z' }] }];
  ok('rescheduling it is still one fee', apptEarnings(rescheduled, 'u_dana', 75).pendingTotal === 75);
}

console.log('\nwhat is OWED is what has been approved, not what has been claimed');
{
  const leads = [{ id: 'l1', meetings: [
    mtg('p1', { status: 'held' }),
    mtg('p2', { status: 'held' }),
    approveFee(markHeld(mtg('a1'), 'Dana', 'u_dana', ''), 75, 'G', '2026-08-12'),
  ] }];
  const e = apptEarnings(leads, 'u_dana', 75);
  ok('two pending', e.pending.length === 2 && e.pendingTotal === 150);
  ok('one approved', e.approved.length === 1 && e.approvedTotal === 75);
  /* A pending claim is not a debt — the owner has not agreed to it. */
  ok('owed counts approved ONLY', e.owed === 75, String(e.owed));
  ok('awaitingApproval is the pending list', awaitingApproval(leads, 'u_dana', 75).length === 2);
}

console.log('\npayouts are a separate ledger, and the balance is honest about it');
{
  const leads = [{ id: 'l1', meetings: [
    approveFee(markHeld(mtg('a1'), 'Dana', 'u_dana', ''), 75, 'G', '2026-08-12'),
    approveFee(markHeld(mtg('a2'), 'Dana', 'u_dana', ''), 75, 'G', '2026-08-12'),
  ] }];
  const payouts = [{ id: 'po1', rep_id: 'u_dana', amount: 75, paid_on: '2026-08-15' }];
  ok('only this rep\'s payouts count', payoutsFor(payouts, 'u_dana').length === 1);
  ok('  and somebody else\'s do not', payoutsFor(payouts, 'u_sam').length === 0);
  ok('paid out so far', paidOut(payouts, 'u_dana') === 75);
  const b = repBalance(leads, DANA, payouts);
  ok('approved 150, paid 75, owed 75', b.owed === 75, `${b.appt.approvedTotal}/${b.paidOut}/${b.owed}`);
  ok('overpaying does not go negative', repBalance(leads, DANA, [{ rep_id: 'u_dana', amount: 500 }]).owed === 0);
  ok('a rep with no payouts is owed the lot', repBalance(leads, DANA, []).owed === 150);
}

console.log('\nwhich models a rep is on — zero means not on it, no enum');
{
  ok('Dana is on appointments only', payModels(DANA).appointment && !payModels(DANA).commission);
  ok('Sam is on commission only', payModels(SAM).commission && !payModels(SAM).appointment);
  ok('a new hire is on neither', payModels(NEW).none === true);
  ok('  and neither flag is set', !payModels(NEW).appointment && !payModels(NEW).commission);
  const both = { id: 'u_b', appointment_rate: 50, commission_pct: 5 };
  ok('both is a valid, ordinary state', payModels(both).appointment && payModels(both).commission);
  ok('  and is not "none"', payModels(both).none === false);
}

console.log('\ncommission is read, not reinvented');
{
  const leads = [
    { id: 'l1', commission: { repId: 'u_sam', amount: 500, status: 'pending' } },
    { id: 'l2', commission: { repId: 'u_sam', amount: 300, status: 'earned' } },
    { id: 'l3', commission: { repId: 'u_dana', amount: 900, status: 'earned' } },
    { id: 'l4' },
  ];
  const c = commissionEarnings(leads, 'u_sam');
  ok('only their own rows', c.rows.length === 2);
  ok('pending', c.pending === 500);
  ok('earned', c.earned === 300);
  ok('another rep is untouched', commissionEarnings(leads, 'u_dana').earned === 900);
}

console.log('\nrubbish in does not throw');
{
  ok('no leads', apptEarnings(null, 'u_dana', 75).pendingTotal === 0);
  ok('no meetings', apptEarnings([{ id: 'l' }], 'u_dana', 75).count === 0);
  ok('no rep', repBalance([], null, []).owed === 0);
  ok('meetingRows on junk', meetingRows(null).length === 0 && meetingRows([null, { meetings: null }]).length === 0);
  ok('feeState on nothing', feeState(null) === '');
  ok('a string rate is money', apptEarnings([{ id: 'l', meetings: [mtg('m', { status: 'held' })] }], 'u_dana', '$75.50').pendingTotal === 75.5);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
