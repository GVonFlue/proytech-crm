/* ============================================================================
   REP PAY — what a rep has earned, and what has actually been paid.
   ----------------------------------------------------------------------------
   Pure. No React, no Supabase, no fetch — the same rule the other lib/ files
   follow, and for the usual reason: these numbers become somebody's wages, so
   they have to be provable without a browser.

   TWO STRUCTURES, EITHER OR BOTH. A rep is on a model when its rate is
   non-zero, so there is no enum to keep in sync with two numbers that already
   say everything:

     crm_users.appointment_rate   flat, per meeting HELD      0 = not on it
     crm_users.commission_pct     % of the closed deal        0 = not on it

   PAID ON HELD, NOT BOOKED. A meeting that did not happen is worth nothing, and
   paying on booked rewards setting appointments that never happen.

   THE FEE FOLLOWS THE SETTER, NOT THE LEAD'S OWNER. Leads get reassigned, and a
   rep must not lose a fee they earned because a lead moved. `setById` is
   stamped on the meeting when it is created and never changes.

   WHO MARKED IT HELD IS RECORDED. Marking held used to be neutral bookkeeping;
   it is now a claim for money, so `heldBy` and `heldAt` go on the record. The
   rep marks, the owner approves — the same Pending / Earned / Voided machine
   commission already uses, because two pay models that behaved differently
   would be two things to learn and two places for the numbers to disagree.

   DERIVED WHILE PENDING, FROZEN ON APPROVAL, NEVER REVERSED ONCE PAID.
   ENGINEERING §4 pointed outward: money that has left does not get rewritten,
   it gets corrected with a new line.
   ========================================================================== */

const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const A = v => (Array.isArray(v) ? v : []);
const S = (v, cap = 200) => String(v == null ? '' : v).slice(0, cap);

export const APPT_STATES = ['pending', 'approved', 'paid', 'void'];

/* ------------------------------------------------------------ the stamps */

/** Stamped onto a meeting when it is CREATED. The fee follows this, not the
 *  lead's owner, so reassigning a lead never moves a fee somebody earned. */
export const setterOf = m => S((m && (m.setById || m.setBy)) || '', 60);

/** Stamped when somebody marks it held. This is the evidence behind a payment,
 *  so it records who and when rather than only that it happened. */
export const heldMark = m => (m && m.status === 'held')
  ? { by: S(m.heldBy, 120), byId: S(m.heldById, 60), at: S(m.heldAt, 40) }
  : null;

/** The rate this meeting pays at. Frozen at approval so a rate change never
 *  restates what was already approved — the same reason commission snapshots
 *  its pct and base at conversion. */
export const rateOf = (m, currentRate) =>
  (m && m.payRate != null && m.payRate !== '') ? num(m.payRate) : num(currentRate);

/* --------------------------------------------------------- the state machine */

/** pending -> approved -> paid, or void.
 *
 *  A meeting that is no longer marked held has NO state while pending — the
 *  fee was derived and simply stops existing. Once approved it keeps its state
 *  and is flagged instead, because silently clawing back approved pay is how a
 *  working relationship ends. Once paid it never reverses at all. */
export function feeState(m) {
  if (!m) return '';
  if (m.payVoidedAt) return 'void';
  if (m.payPaidAt) return 'paid';
  if (m.payApprovedAt) return 'approved';
  return m.status === 'held' ? 'pending' : '';
}

/** Approved (or beyond) but no longer marked held. Not reversed — surfaced, so
 *  a human decides. */
export const feeStale = m => !!m && !!m.payApprovedAt && m.status !== 'held' && !m.payVoidedAt;

/* ------------------------------------------------------------- the earnings */

/** Every meeting across every lead, flattened, with the lead it belongs to. */
export function meetingRows(leads) {
  const out = [];
  A(leads).forEach(l => A(l && l.meetings).forEach(m => { if (m && m.id) out.push({ lead: l, m }); }));
  return out;
}

/**
 * Appointment fees for one rep.
 *
 * ONE FEE PER APPOINTMENT, NOT PER ATTEMPT — meetings are unique records, and a
 * rescheduled meeting is the same record with a new date, so this falls out of
 * keying on the meeting rather than on the attempt. If rescheduling ever
 * created a NEW meeting, that rule would have to be enforced here instead.
 */
export function apptEarnings(leads, repId, rate) {
  const rows = meetingRows(leads).filter(({ m }) => setterOf(m) === S(repId, 60));
  const buckets = { pending: [], approved: [], paid: [], void: [], stale: [] };
  rows.forEach(({ lead, m }) => {
    const st = feeState(m);
    if (!st) return;
    const row = { leadId: lead.id, lead, m, amount: rateOf(m, rate), state: st };
    buckets[st].push(row);
    if (feeStale(m)) buckets.stale.push(row);
  });
  const sum = k => buckets[k].reduce((a, r) => a + r.amount, 0);
  return {
    ...buckets,
    pendingTotal: sum('pending'),
    approvedTotal: sum('approved'),
    paidTotal: sum('paid'),
    /* What is owed RIGHT NOW: approved and not yet paid. Pending is a claim the
       owner has not agreed to and is deliberately not counted as a debt. */
    owed: sum('approved'),
    count: buckets.pending.length + buckets.approved.length + buckets.paid.length,
  };
}

/** The lines an owner is being asked to approve, for one rep. */
export const awaitingApproval = (leads, repId, rate) => apptEarnings(leads, repId, rate).pending;

/* ------------------------------------------------------------- the payouts */

export const payoutsFor = (payouts, repId) =>
  A(payouts).filter(p => p && S(p.rep_id || p.repId, 60) === S(repId, 60));

export const paidOut = (payouts, repId) =>
  payoutsFor(payouts, repId).reduce((a, p) => a + num(p.amount), 0);

/** Approved-and-unpaid, minus what has already been paid out.
 *
 *  Payouts are a separate ledger from the lines they cover, so this is the
 *  honest balance rather than a per-line reconciliation: a payout is a lump you
 *  actually sent, and matching it line-by-line would invent a precision the
 *  bank transfer never had. */
export function repBalance(leads, rep, payouts) {
  const rate = num(rep && rep.appointment_rate);
  const appt = apptEarnings(leads, (rep && rep.id) || '', rate);
  const paid = paidOut(payouts, (rep && rep.id) || '');
  const owed = Math.max(0, appt.approvedTotal + appt.paidTotal - paid);
  return { appt, paidOut: paid, owed, rate };
}

/* ------------------------------------------------------------- commission */

/** Commission already lives on the lead as data.commission, snapshotted at
 *  conversion. Read here only so one screen can show both models together. */
export function commissionEarnings(leads, repId) {
  const rows = A(leads).map(l => ({ l, c: l && l.commission })).filter(x => x.c && S(x.c.repId, 60) === S(repId, 60));
  const by = st => rows.filter(x => S(x.c.status, 20) === st);
  const sum = st => by(st).reduce((a, x) => a + num(x.c.amount), 0);
  return { rows, pending: sum('pending'), earned: sum('earned'), voided: sum('void'), pendingRows: by('pending'), earnedRows: by('earned') };
}

/** Which models a rep is actually on. Zero means "not on it" — no enum. */
export const payModels = rep => ({
  appointment: num(rep && rep.appointment_rate) > 0,
  commission: num(rep && rep.commission_pct) > 0,
  none: num(rep && rep.appointment_rate) <= 0 && num(rep && rep.commission_pct) <= 0,
});

/* --------------------------------------------------------- what a write looks like */

/** Marking a meeting held. Returns the PATCH, so the caller writes it in one
 *  set() with anything else it is changing (ENGINEERING §3). */
export const markHeld = (m, who, whoId, now) => ({
  ...m, status: 'held',
  heldBy: S(who, 120), heldById: S(whoId, 60), heldAt: S(now, 40) || new Date().toISOString(),
});

/** Approving a fee freezes its rate. After this, changing the rep's rate does
 *  not restate it. */
export const approveFee = (m, rate, who, now) => ({
  ...m, payRate: num(rate), payApprovedAt: S(now, 40) || new Date().toISOString(), payApprovedBy: S(who, 120),
});

export const voidFee = (m, who, now) => ({
  ...m, payVoidedAt: S(now, 40) || new Date().toISOString(), payVoidedBy: S(who, 120),
});
