/* ============================================================================
   A REP'S WORK, COMPUTED FROM THE LOG — never from presence.
   ----------------------------------------------------------------------------
   WHAT THIS DELIBERATELY DOES NOT MEASURE

   No session length, no time-in-CRM, no "online". Two reasons, and the second
   is the one that would still apply if the first did not:

     1. A rep here is an independent contractor. SALES-SOPS.md says it in its
        own words — "nothing in here sets your hours", "you set your own hours".
        An hours-logged record is evidence against that agreement.

     2. IT WOULD BE THE WRONG NUMBER ANYWAY. Time-in-CRM measures a browser tab.
        A rep with the app open all day and twelve dials would outrank one who
        dialled sixty in two focused hours, so it rewards precisely the opposite
        of what SOP-01 asks for.

   What replaces it is BLOCK DETECTION. SOP-01 defines a calling block as two
   sets of twenty with short breaks, sixty to ninety minutes, and two blocks as
   a full day. Clustering real dials by the gaps between them answers "did he
   run two blocks" from work he actually did:

     Tue 26 Aug — 2 blocks · 41 dials
       09:12-10:38  22 dials
       16:05-17:20  19 dials

   Pure. No React, no Supabase, no clock of its own — every function takes the
   day or the time it should reason about, so a test can pin them.
   ========================================================================== */

import { isRealTouch } from './lead';

const A = v => (Array.isArray(v) ? v : []);
const S = (v, cap = 200) => String(v == null ? '' : v).slice(0, cap);

/* A gap this long ends a block. SOP-01's own rhythm is five minutes between
   sets, so twenty is comfortably clear of a break inside one block and well
   under the hours between a morning and an afternoon session. It is a
   PARAMETER, not a constant, so the profile can say what it assumed. */
export const BLOCK_GAP_MIN = 20;

/* ------------------------------------------------------------- attribution */

/* WHOSE ACTIVITY IS THIS?

   `whoId` is exact and is stamped on everything written from now on. `who` is
   a display NAME and is all that older rows have — it breaks on a rename and
   on two people sharing a first name. Both are checked, id first, so the
   answer gets better as new rows arrive without older ones going blank.

   Matching on name is the weak link in every rep number on the profile screen,
   which is why it is isolated here rather than repeated at each call site. */
export const actIsBy = (a, rep) => {
  if (!a || !rep) return false;
  const id = S(rep.id, 60);
  if (id && S(a.whoId, 60)) return S(a.whoId, 60) === id;
  const name = S(rep.name, 60).trim().toLowerCase();
  return !!name && S(a.who, 60).trim().toLowerCase() === name;
};

/** Every activity a rep wrote, newest first, across all leads the caller can
 *  see. An owner sees every lead, so for an owner this is complete. */
export function repActivities(leads, rep) {
  const out = [];
  for (const l of A(leads)) {
    for (const a of A(l && l.activities)) {
      if (actIsBy(a, rep) && a.ts) out.push({ ...a, leadId: l.id, lead: l.company || l.name || '' });
    }
  }
  return out.sort((x, y) => S(y.ts, 40).localeCompare(S(x.ts, 40)));
}

/* ------------------------------------------------------------------ a day */

const dayOf = ts => S(ts, 40).slice(0, 10);

/** Group a rep's activities by calendar day, newest day first. */
export function byDay(acts) {
  const m = new Map();
  for (const a of A(acts)) {
    const d = dayOf(a.ts);
    if (!d) continue;
    if (!m.has(d)) m.set(d, []);
    m.get(d).push(a);
  }
  return Array.from(m.entries())
    .map(([day, list]) => ({ day, acts: list.slice().sort((x, y) => S(x.ts, 40).localeCompare(S(y.ts, 40))) }))
    .sort((x, y) => y.day.localeCompare(x.day));
}

/** Split one day's activities into blocks on the gap.
 *
 *  Given rows in ascending time. Returns [{ from, to, n }] — every block has at
 *  least one dial, and a day with no dials has no blocks rather than one empty
 *  one, because "he ran a block of zero" is not a thing that happened. */
export function blocksOf(acts, gapMin = BLOCK_GAP_MIN) {
  const rows = A(acts).filter(a => a && a.ts).slice()
    .sort((x, y) => S(x.ts, 40).localeCompare(S(y.ts, 40)));
  const out = [];
  let cur = null;
  for (const a of rows) {
    const t = new Date(a.ts).getTime();
    if (isNaN(t)) continue;
    if (cur && (t - cur.last) / 6e4 <= gapMin) { cur.n++; cur.last = t; cur.to = a.ts; }
    else { if (cur) out.push(cur); cur = { from: a.ts, to: a.ts, n: 1, last: t }; }
  }
  if (cur) out.push(cur);
  return out.map(({ from, to, n }) => ({ from, to, n }));
}

/* ---------------------------------------------------------------- the numbers */

/** One day of a rep's work, as the profile shows it.
 *
 *  `dials` counts activities carrying a disposition — that is what a dial IS in
 *  SOP-02, and it deliberately excludes an owner's undisposed call and every
 *  note, text and email. `conversations` counts the dials where somebody was
 *  actually reached, which is the disposition vocabulary and NOT isRealTouch:
 *  the two answer different questions and must not be collapsed. */
export function dayStats(acts, contactSet, gapMin = BLOCK_GAP_MIN) {
  /* SORTED HERE, not assumed. byDay() hands these over in order, but `first`
     and `last` read the ends of the array, so a caller passing the raw feed
     (which is newest-first) would report the day starting when it ended. A
     function whose answer depends on the caller having sorted is a function
     that will eventually be called wrong. */
  const rows = A(acts).filter(a => a && a.ts)
    .slice().sort((x, y) => S(x.ts, 40).localeCompare(S(y.ts, 40)));
  const dialed = rows.filter(a => a && a.disp);
  const by = {};
  for (const a of dialed) by[a.disp] = (by[a.disp] || 0) + 1;

  const isContact = d => (contactSet && typeof contactSet.has === 'function') ? contactSet.has(d) : false;
  const conversations = dialed.filter(a => isContact(a.disp) && a.disp !== 'VM').length;
  const blocks = blocksOf(dialed, gapMin);

  return {
    dials: dialed.length,
    conversations,
    bookings: dialed.filter(a => a.disp === 'BK').length,
    byCode: by,
    blocks,
    /* The honest shape of the day: when he started, when he stopped. NOT how
       long he was signed in, and not the difference between them presented as
       "hours worked" — a rep is free to do something else in the middle. */
    first: rows.length ? rows[0].ts : '',
    last: rows.length ? rows[rows.length - 1].ts : '',
    /* Every touch he logged, dispositioned or not, so a day spent on follow-up
       texts does not read as a day with nothing on it. */
    touches: rows.filter(isRealTouch).length,
  };
}

/** Dials per booking, the number SOP-01 sets a benchmark against.
 *  Returns null rather than 0 when there is nothing to divide — a rep with no
 *  bookings yet has an UNKNOWN rate, and rendering that as "0" would read as a
 *  measured failure rather than as too early to say. */
export const dialsPerBooking = (dials, bookings) =>
  (!bookings || !dials) ? null : Math.round((dials / bookings) * 10) / 10;

/* SOP-01's own curve, so the profile plots against what the rep was told
   rather than against a number invented on the screen. */
export const SOP_BENCHMARK = [
  { key: 'logan',  label: 'Logan',            perBooking: 13 },
  { key: 'wk12',   label: 'Weeks 1-2',        perBooking: 27.5, from: 25, to: 30 },
  { key: 'wk4',    label: 'By week 4',        perBooking: 16.5, from: 15, to: 18 },
];
