/* ============================================================================
   THE CHART SERIES — twelve months of the four numbers that decide things.

   Pure. No React, no Supabase, no fetch, so every claim here is testable
   without a browser.

   THE RULE THESE FOLLOW

   A chart must not be a second opinion. Every figure here is built from the
   same primitives the tiles and the Money page read — anyPayments for cash in,
   retainerState for whether a retainer is really billing, dealsOf for what was
   sold. Nothing is recomputed from raw fields, because the first time a chart
   and a tile disagree about one month, you stop trusting both.
   ========================================================================== */

import { anyPayments, dealsOf, dealBits, num } from './lead';
import { retainerState } from './retainer';

const A = x => (Array.isArray(x) ? x : []);
const pad = n => String(n).padStart(2, '0');

/** The last `n` calendar months, oldest first, as {k:'2026-09', label:'Sep'}. */
export function monthKeys(n = 12, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      k: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      year: d.getFullYear(),
    });
  }
  return out;
}

/** Cash actually collected, by month. Payment rows only — a signed deal with
 *  nothing in the bank is pipeline, not revenue, and this chart is the one
 *  place that must never blur the two. */
export function collectedByMonth(leads, n = 12, now = new Date()) {
  const months = monthKeys(n, now);
  const bucket = Object.fromEntries(months.map(m => [m.k, 0]));
  A(leads).forEach(l => {
    anyPayments(l).forEach(p => {
      const k = String(p && p.date || '').slice(0, 7);
      if (k in bucket) bucket[k] += num(p.amount);
    });
  });
  return months.map(m => ({ ...m, value: Math.round(bucket[m.k] * 100) / 100 }));
}

/** Recurring revenue as it stood at the END of each month.
 *
 *  HONEST ABOUT WHAT THIS CANNOT KNOW: a retainer carries ONE rate, with no
 *  history of what it used to be. So a client whose rate went from $249 to
 *  $499 reads as $499 for every month they were active, including the months
 *  they paid $249. The shape of the line — when clients joined and left — is
 *  true; the height of the older months is today's rate applied backwards.
 *  Rate history would need its own field, and inventing one here would make
 *  this chart disagree with the MRR tile, which reads the same single rate. */
export function mrrByMonth(leads, n = 12, now = new Date()) {
  const months = monthKeys(n, now);
  return months.map(m => {
    const end = `${m.k}-31`;
    const start = `${m.k}-01`;
    let total = 0;
    A(leads).forEach(l => {
      const st = retainerState(l);
      if (st !== 'active' && st !== 'ended') return;
      const began = String(l.retainerStart || '').slice(0, 10);
      if (!began || began > end) return;                 // had not started yet
      const over = String(l.retainerEnd || '').slice(0, 10);
      if (over && over < start) return;                  // already finished
      total += num(l.retainer);
    });
    return { ...m, value: Math.round(total * 100) / 100 };
  });
}

/** What we have sold, split by service.
 *
 *  Counts BOTH open deals and closed ones, because the question this answers is
 *  "what do we actually sell", and a business this size would show an almost
 *  empty chart from closed deals alone.
 *
 *  Reads `service` off the deal row. A deal with no service set lands in
 *  "Unassigned" rather than being dropped — a chart that silently omits revenue
 *  is worse than one showing you a gap to go and fill in. Values come from
 *  dealBits, the same sum the deal panel and every money tile use. */
export function soldByService(leads) {
  const bucket = {};
  const add = (name, v) => {
    if (!v) return;
    const key = String(name || '').trim() || 'Unassigned';
    bucket[key] = (bucket[key] || 0) + v;
  };
  A(leads).forEach(l => {
    dealsOf(l).forEach(d => d && add(d.service, dealBits(d)));
    A(l && l.closedDeals).forEach(c => {
      if (!c) return;
      const svc = c.service || (c.deal && c.deal.service);
      add(svc, num(c.amount) || dealBits(c.deal || {}));
    });
  });
  return Object.entries(bucket)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

/** Money in against money out, by month.
 *
 *  In is collected cash (same function as the revenue chart, so the two can
 *  never disagree). Out is every ledger row whose type spends — passed in as
 *  `isOut` so this file never needs to know the transaction vocabulary. */
export function cashByMonth(leads, txns, isOut, n = 12, now = new Date()) {
  const inRows = collectedByMonth(leads, n, now);
  const bucket = Object.fromEntries(inRows.map(m => [m.k, 0]));
  A(txns).forEach(t => {
    if (!t || !isOut(t)) return;
    const k = String(t.date || '').slice(0, 7);
    if (k in bucket) bucket[k] += num(t.amount);
  });
  return inRows.map(m => {
    const out = Math.round(bucket[m.k] * 100) / 100;
    return { ...m, in: m.value, out, net: Math.round((m.value - out) * 100) / 100 };
  });
}
