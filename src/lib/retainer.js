/* ============================================================================
   RETAINER — telling recurring money apart from one-off money.
   ----------------------------------------------------------------------------
   Pure. No React, no Supabase, no fetch — the same rule src/lib/jarvis.js,
   src/lib/kb.js and src/lib/pocketmatch.js follow, and here for a sharper
   reason than usual: the rules that decide whether a payment settles a BALANCE
   or covers a MONTH have to be provable before any of them touch a screen.

   WHY TWO ARRAYS AND NOT ONE WITH A `kind`  (AUDIT #23, RETAINER-PLAN.md)

     lead.payments          [{id, amount, date, note}]           one-off work
     lead.retainerPayments  [{id, amount, date, period, note}]   period='YYYY-MM'

   A filter that can be forgotten is not a control. #23 exists precisely
   because paidTotal summed an array without filtering it; a `kind` would have
   left that sum spelled exactly as it was, still compiling and still wrong.
   Two arrays mean there is no single array to sum by accident.

   And a retainer payment carries a field a setup payment has no use for: the
   PERIOD it covers. August's retainer paid on 3 September still covers August,
   so "how many months have they paid" is unanswerable from a date alone the
   moment somebody pays two at once, pays late, or skips one.

   ONE PAYMENT CAN BE BOTH. Justus's $1,498.50 is $1,249.50 of package plus
   $249 for the first month of retainer, billed up front — not an edge case,
   it is how the invoicing works. So a payment that spans both categories is
   stored as TWO ROWS SHARING A `receipt` id: each row is unambiguously one
   thing, `setupPaid` and `retainerPaid` stay honest sums, and the screen can
   still show the one $1,498.50 that actually hit the bank.

   The alternative — one row carrying {setup, retainer} amounts — was rejected
   because it leaves `sum(p.amount)` available as an answer to a BALANCE
   question, and that expression being available is exactly AUDIT #23.

   WHAT DOES *NOT* SPLIT: REVENUE. Cash is cash — a retainer payment arriving is
   money in, exactly like a deposit. allPaid() exists for that question and is
   the ONLY reader that should ever see both. Everything else asks one of the
   two balance questions and reads one array.
   ========================================================================== */

const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n; };
const A = v => (Array.isArray(v) ? v : []);
const S = (v, cap = 300) => String(v == null ? '' : v).slice(0, cap);
const fmt = n => '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ readers */

export const setupPayments    = l => A(l && l.payments);
export const retainerPayments = l => A(l && l.retainerPayments);

const sum = rows => rows.reduce((a, p) => a + num(p && p.amount), 0);

/** Money against one-off work. This is what a BALANCE is measured with. */
export const setupPaid = l => sum(setupPayments(l));
/** Money against the recurring agreement. Never part of a balance. */
export const retainerPaid = l => sum(retainerPayments(l));
/** Every dollar that arrived, for REVENUE and the ledger. The only reader that
 *  should see both — asking a balance question with this is the bug. */
export const allPaid = l => setupPaid(l) + retainerPaid(l);

/** Every payment, flattened, for revenue by month. Tagged so a caller that
 *  needs to know can, without being able to sum the wrong subset by default. */
export const allPayments = l =>
  setupPayments(l).map(p => ({ ...p, kind: 'setup' }))
    .concat(retainerPayments(l).map(p => ({ ...p, kind: 'retainer' })));

/** Rows that arrived as ONE payment, grouped by their receipt id. Lets a screen
 *  show "$1,498.50 — $1,249.50 setup · $249 retainer" instead of two entries
 *  the owner cannot reconcile against a bank line. */
export function receipts(l) {
  const out = new Map();
  for (const p of allPayments(l)) {
    const key = S(p.receipt, 60) || ('solo:' + S(p.id, 60));
    if (!out.has(key)) out.set(key, { receipt: key, date: S(p.date, 10), total: 0, parts: [] });
    const g = out.get(key);
    g.total = Math.round((g.total + num(p.amount)) * 100) / 100;
    g.parts.push(p);
  }
  return [...out.values()].sort((a, b) => S(b.date).localeCompare(S(a.date)));
}

/* --------------------------------------------------------------- the months */

export const monthKeyOf = iso => S(iso, 10).slice(0, 7);

/** Inclusive list of month keys from a to b. Empty if either is missing or the
 *  range runs backwards. String maths on YYYY-MM, deliberately: Date objects
 *  drag a timezone into a question that has none. */
export function monthsFrom(a, b) {
  const s = S(a, 7), e = S(b, 7);
  if (!/^\d{4}-\d{2}$/.test(s) || !/^\d{4}-\d{2}$/.test(e) || s > e) return [];
  const out = [];
  let y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  const ey = Number(e.slice(0, 4)), em = Number(e.slice(5, 7));
  /* 600 is a fifty-year guard. A retainerStart typed as 1026 instead of 2026
     should not hang the render. */
  while ((y < ey || (y === ey && m <= em)) && out.length < 600) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* ---------------------------------------------------- rate vs actually billing

   A PRICE IS NOT A COMMITMENT. `retainerActive` currently means both "I have
   decided what to charge" and "I am charging it", and App.jsx auto-stamps
   retainerStart the moment the toggle flips — so setting a rate on a client who
   has not started invents a billing history for them.

   Two things follow, and they are the same gap from opposite ends:
     - MRR counts money that was never billed.
     - Arrears would count months that were never owed.

   So a retainer is only BILLING when there is evidence of billing: either a
   retainer payment exists, or the owner has confirmed the start explicitly.
   Until then the rate is QUOTED — set, but the clock has not started.

   That default is deliberately the cautious one. Under-counting MRR is a number
   you can go and confirm; over-counting is a number you plan on and then miss.

   `retainerEnd` gives a stopped retainer somewhere to live, which is the other
   half of the same problem: without it, a paused client reads as settled rather
   than as owing the months they were billed for. */
export function retainerState(l) {
  if (!l || num(l.retainer) <= 0) return 'none';
  if (S(l.retainerEnd, 10)) return 'ended';
  if (!l.retainerActive) return 'off';
  if (l.retainerConfirmed || retainerPayments(l).length) return 'active';
  return 'quoted';
}

/** Only a retainer that is actually being billed belongs in MRR. */
export const billsMrr = l => retainerState(l) === 'active';
/** Rate set, clock not started — counted separately so it is visible, not lost. */
export const isQuoted = l => retainerState(l) === 'quoted';

/** When the retainer began. retainerStart is auto-stamped when the toggle is
 *  flipped (App.jsx), but leads that predate that stamp fall back to when they
 *  converted rather than reading as having no history. */
export const retainerStartOf = l =>
  monthKeyOf((l && (l.retainerStart || l.convertedAt || l.closedAt)) || '');

/** Months the retainer has been running, inclusive of the current one.
 *
 *  KNOWN LIMIT: there is no END date. A retainer switched off is treated as no
 *  longer accruing (arrears stops), which is right for a cancellation and wrong
 *  for a client paused mid-term — that one reads as settled rather than as two
 *  months owed. If pausing turns out to be a real thing you do, the fix is a
 *  skipped-period list, not a new concept. */
export function monthsDue(l, nowKey) {
  /* Gated on BILLING, not on the toggle. A quoted rate owes nothing — that is
     the whole point of the distinction above. */
  if (!billsMrr(l)) return [];
  const start = retainerStartOf(l);
  if (!start) return [];
  /* Stops at retainerEnd, so a finished or paused retainer accrues nothing new
     while the months it WAS billed for stay owed. */
  const end = monthKeyOf(l.retainerEnd) || S(nowKey, 7);
  return monthsFrom(start, end < S(nowKey, 7) ? end : S(nowKey, 7));
}

/** DISTINCT periods covered — so paying two months at once credits two months,
 *  and paying late still credits the month it was for. */
export function monthsPaid(l) {
  const out = new Set();
  for (const p of retainerPayments(l)) {
    const k = monthKeyOf(p && (p.period || p.date));
    if (/^\d{4}-\d{2}$/.test(k)) out.add(k);
  }
  return out;
}

/** What is behind, and what that is worth.
 *
 *  KNOWN LIMIT: `amount` charges arrears at TODAY's rate. A retainer whose
 *  price changed mid-term will be slightly off in dollars; the month COUNT is
 *  exact either way. Storing a rate per expected period would fix it and costs
 *  more than it is worth until a price actually changes. */
export function arrears(l, nowKey) {
  const due = monthsDue(l, nowKey);
  if (!due.length) return { periods: [], months: 0, amount: 0, current: true, due: [], paid: 0 };
  const paid = monthsPaid(l);
  const missing = due.filter(k => !paid.has(k));
  return {
    periods: missing,
    months: missing.length,
    amount: missing.length * num(l.retainer),
    current: missing.length === 0,
    due,
    paid: due.length - missing.length,
  };
}

/* ------------------------------------------------- the retroactive question */

/* Notes people actually write. Retainer words first — a note saying "retainer"
   is stronger evidence than an amount that happens to match. */
const RETAINER_WORDS = /(retainer|monthly|month(ly)? fee|maintenance|\bmo\b|\/mo)/i;
const SETUP_WORDS    = /(deposit|setup|set-up|build|balance|final|install|onboard|website|project)/i;

export const isReviewed = l => !!(l && l.paymentsReviewed);

/**
 * Propose a class for every payment on a lead, WITH ITS REASON.
 *
 * Returns [{id, kind, why, certain, split?}] where kind is
 * 'setup' | 'retainer' | 'split' | ''. A 'split' carries {setup, retainer}
 * amounts, because one payment really can be both.
 *
 * An empty kind means NOTHING DISTINGUISHES IT and a human has to say. That is
 * deliberate and it is the whole point: the tempting default is "assume setup",
 * and assuming setup is exactly the bug — it applies retainer money to a
 * balance and makes an unpaid setup fee look settled. Defaulting that way would
 * preserve AUDIT #23 under a new name.
 */
export function proposeAll(lead) {
  const rows = setupPayments(lead);
  const hasRetainer = !!(lead && (lead.retainerActive || lead.retainerStart));
  const rate = num(lead && lead.retainer);
  const start = retainerStartOf(lead);

  /* Cross-payment evidence: the same amount, three or more times, on a lead
     that has a retainer. Cadence is not checked — real payments slip by weeks
     and a spacing rule rejects the honest ones. Repetition of an exact amount
     is the signal; the count is what makes it more than coincidence. */
  const counts = {};
  rows.forEach(p => { const k = String(num(p.amount)); counts[k] = (counts[k] || 0) + 1; });

  const first = rows.map(p => {
    const amt = num(p.amount);
    const note = S(p.note, 200);
    const when = monthKeyOf(p.date);

    if (!hasRetainer) return { id: p.id, kind: 'setup', why: 'this lead has never had a retainer', certain: true };
    if (start && when && when < start) return { id: p.id, kind: 'setup', why: `dated before the retainer started (${start})`, certain: true };

    /* A PAYMENT THAT IS BOTH. Billing the first month of retainer on top of a
       package deposit is normal practice, not an edge case, and it leaves a
       signal: take the retainer off and what remains matches another payment on
       the same lead — the two halves of the package.

           1,498.50 − 249 = 1,249.50, and 1,249.50 is the second payment

       Checked BEFORE the note rules on purpose. A split payment usually
       carries a setup-shaped note — Justus's reads "square deposit", because
       most of it is one — so a keyword would claim it first and the retainer
       inside would stay hidden. The arithmetic is the stronger signal: it needs
       another payment on the same lead to match to the cent, which a word in a
       note does not.

       Proposed, never assumed: offered with its arithmetic shown, and the owner
       confirms it. */
    if (rate > 0 && amt > rate) {
      const rest = Math.round((amt - rate) * 100) / 100;
      if (counts[String(rest)]) {
        return { id: p.id, kind: 'split',
          split: { setup: rest, retainer: rate },
          why: `${fmt(amt)} − ${fmt(rate)} retainer = ${fmt(rest)}, which matches another payment on this lead`,
          certain: false };
      }
    }
    if (RETAINER_WORDS.test(note)) return { id: p.id, kind: 'retainer', why: `the note says “${note}”`, certain: false };
    if (SETUP_WORDS.test(note))    return { id: p.id, kind: 'setup',    why: `the note says “${note}”`, certain: false };

    if (rate > 0 && amt === rate) {
      const n = counts[String(amt)] || 1;
      return { id: p.id, kind: 'retainer',
        why: n >= 3 ? `matches the retainer exactly, and ${n} payments share that amount`
                    : 'matches the retainer amount exactly',
        certain: false };
    }

    return { id: p.id, kind: '', why: 'nothing distinguishes it — needs a decision', certain: false };
  });

  /* SECOND PASS. If a split was proposed, the amount left over after the
     retainer is a package instalment — so another payment of that same amount
     is the OTHER instalment, not a mystery. Justus's second $1,249.50 is the
     back half of the $2,499 package, and saying so is the difference between
     one thing to confirm and two. */
  const halves = new Set(first.filter(x => x.kind === 'split' && x.split)
    .map(x => String(num(x.split.setup))));
  if (!halves.size) return first;
  return first.map((x, i) => {
    if (x.kind !== '' || !halves.has(String(num(rows[i].amount)))) return x;
    return { ...x, kind: 'setup',
      why: `matches the package instalment in the split above (${fmt(rows[i].amount)})`,
      certain: false };
  });
}

/** How much of a lead can be decided without a human. Drives "N need a look". */
export const needsReview = lead =>
  !isReviewed(lead) && proposeAll(lead).some(x => !x.certain);

/**
 * Turn a set of decisions into the two arrays, ready for ONE set() call.
 *
 * ENGINEERING §3: the caller writes both arrays in a single mutation. Two calls
 * would have the second overwrite the first from a stale draft — the closeDeal
 * bug, again.
 *
 * A payment with no decision stays in `payments`, so nothing is ever dropped on
 * the floor; the screen is expected to refuse to finish while any remain.
 */
export function applyProposals(lead, decisions) {
  const by = {};
  A(decisions).forEach(d => { if (d && d.id) by[d.id] = S(d.kind, 20); });
  const amounts = {};
  A(decisions).forEach(d => { if (d && d.id && d.split) amounts[d.id] = d.split; });

  const setup = [], retainer = [];
  setupPayments(lead).forEach(p => {
    const kind = by[p.id];
    /* The period a payment COVERS defaults to the month it arrived. Late or
       bulk payments are corrected on the review screen; this is the sane
       starting point, not an assertion. */
    const period = monthKeyOf(p.period || p.date);

    if (kind === 'split') {
      /* TWO ROWS, ONE RECEIPT. Each row is unambiguously one thing, and the
         receipt id keeps them reconcilable against the single amount that
         actually hit the bank. */
      const sp = amounts[p.id] || {};
      const rAmt = num(sp.retainer);
      const sAmt = num(sp.setup) || Math.round((num(p.amount) - rAmt) * 100) / 100;
      const rc = S(p.receipt, 60) || ('rc_' + S(p.id, 40));
      setup.push({ ...p, id: p.id, amount: sAmt, receipt: rc });
      retainer.push({ ...p, id: p.id + '_r', amount: rAmt, period: S(sp.period, 7) || period, receipt: rc });
      return;
    }
    if (kind === 'retainer') { retainer.push({ ...p, period }); return; }
    setup.push(p);
  });
  return {
    payments: setup,
    retainerPayments: retainerPayments(lead).concat(retainer),
    paymentsReviewed: true,
  };
}
