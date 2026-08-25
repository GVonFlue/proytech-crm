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

/* ============================================================================
   POSITION AGAINST THE BENCHMARK — the part that says what to DO.
   ----------------------------------------------------------------------------
   A count tells you what happened. SOP-01 states what SHOULD happen, and the
   gap between the two is the only thing anybody acts on:

     Logan            1 booking per 13 dials
     weeks 1-2        1 per 25-30
     by week 4        1 per 15-18

   So the profile reads his rate AGAINST the band for the week he is actually
   in, and says on / behind / ahead rather than printing a number and leaving
   the arithmetic to whoever is looking.
   ========================================================================== */

/* WHICH DAY DID HE START?

   His FIRST DISPOSITIONED ACTIVITY, not his account creation. An account made
   three weeks before he dialled would put him at week four on day one, and the
   benchmark would call a brand-new rep "behind" on his first afternoon.

   Overridable, because a rep may have been dialling before the codes shipped —
   `rep.startedOn` wins when it is set. */
export const startedOn = (rep, acts) => {
  const override = S(rep && rep.startedOn, 20).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  let first = '';
  for (const a of A(acts)) {
    if (!a || !a.disp || !a.ts) continue;
    const d = S(a.ts, 40).slice(0, 10);
    if (!first || d < first) first = d;
  }
  return first;
};

export const daysSinceStart = (start, today) => {
  if (!start) return null;
  const a = new Date(start + 'T12:00:00').getTime();
  const b = new Date((today || new Date().toISOString().slice(0, 10)) + 'T12:00:00').getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 864e5));
};

/* Week 1 is days 0-6. Returns null when there is no start date, because "week
   one" for a rep who has never dialled is a claim about somebody who has not
   started. */
export const weekNo = days => (days == null ? null : Math.floor(days / 7) + 1);

/* SOP-02: "At day fourteen we sit down and decide whether this is working."
   The profile counts toward it so nobody has to remember. */
export const DECISION_DAY = 14;

/** The band he should be inside, for the week he is in. */
export function bandFor(week) {
  if (week == null) return null;
  if (week <= 2) return { from: 25, to: 30, label: 'weeks 1–2' };
  if (week === 3) return { from: 18, to: 25, label: 'week 3' };   /* between the two stated points */
  return { from: 15, to: 18, label: 'by week 4' };
}

/** Where he sits against it.
 *
 *  DIALS PER BOOKING IS INVERTED — lower is better — which is exactly the kind
 *  of comparison that gets written backwards once and then believed. `ahead`
 *  means FEWER dials per booking than the band's best.
 *
 *  Returns `{ state: 'unknown' }` rather than a verdict when the sample cannot
 *  support one. A confident "behind" off nine dials is worse than no answer:
 *  it is a judgement about a person made from noise. */
export function standing(dials, bookings, week, sampleMin = 30) {
  const band = bandFor(week);
  if (!band) return { state: 'unknown', why: 'no start date yet', band: null };
  if (dials < sampleMin) return { state: 'unknown', why: `only ${dials} dials — too early to say`, band };
  if (!bookings) {
    /* No bookings yet is only bad news once he has had enough dials to expect
       one. Past the band's worst, it IS the signal. */
    return dials > band.to
      ? { state: 'behind', why: `${dials} dials, none booked`, band, rate: null }
      : { state: 'unknown', why: `${dials} dials, none booked yet`, band, rate: null };
  }
  const rate = dials / bookings;
  const state = rate < band.from ? 'ahead' : rate <= band.to ? 'on' : 'behind';
  return { state, band, rate: Math.round(rate * 10) / 10 };
}

/* ---------------------------------------------------------------- the mix */

/* TWO NAMED CHECKS, NOT A MIX CHART.

   A chart invites reading noise as signal. These are the two readings SOP-02
   exists to make, and each carries a different action:

     no NF and no DNC   he is not qualifying — every call ends soft, so the
                        log cannot tell you whether the list or the offer is
                        the problem.
     almost nothing but he is dialling a bad list. That is not a coaching
     NA                 problem and coaching him harder will not fix it.

   BOTH ARE HELD until the sample can support them. A judgement the numbers
   cannot carry is worse than no judgement — it is the same failure as a
   confident booking rate off nine dials, aimed at a person. */
export const MIX_SAMPLE_MIN = 30;

export function mixChecks(byCode, sampleMin = MIX_SAMPLE_MIN) {
  const by = byCode || {};
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  if (total < sampleMin) return { ready: false, total, need: sampleMin - total, checks: [] };

  const checks = [];
  const na = (by.NA || 0) + (by.BAD || 0);
  const qualifying = (by.NF || 0) + (by.DNC || 0);

  if (!qualifying) checks.push({
    key: 'noQualify', bad: true,
    title: 'Nothing marked not-a-fit or do-not-call',
    body: `Across ${total} dials, not one was disqualified. Every call is ending soft, which means the log cannot tell you whether the list, the opener or the offer is the problem — the thing SOP-02 exists to answer.`,
  });

  if (total > 0 && na / total >= 0.9) checks.push({
    key: 'allNA', bad: true,
    title: 'Almost nothing but no-answers',
    body: `${Math.round((na / total) * 100)}% of ${total} dials never reached anybody. That is a list problem rather than a skill problem, and coaching the script will not move it.`,
  });

  return { ready: true, total, need: 0, checks };
}

/* ---- bookings that actually HELD ------------------------------------------

   DIALS-PER-BOOKING REWARDS BOOKING ANYTHING. A rep can hit the SOP-01 band on
   appointments that never happen, and the number would say he is on the curve
   while Logan sits on five no-shows. That is the failure mode the target
   itself creates, so the profile reads BOTH: booked, and booked-and-held.

   Read from the MEETING record, which carries Held/No-show, and not from the
   BK activity — the activity says an appointment was made, the meeting says
   what became of it. Those are different facts and only one of them is
   evidence the rep is booking real business. */
export function bookingOutcomes(leads, rep) {
  let booked = 0, held = 0, noshow = 0, undecided = 0;
  const id = S(rep && rep.id, 60);
  const name = S(rep && rep.name, 60).trim().toLowerCase();
  for (const l of A(leads)) {
    for (const m of A(l && l.meetings)) {
      if (!m) continue;
      const mine = (id && S(m.setById, 60)) ? S(m.setById, 60) === id
        : (!!name && S(m.setBy, 60).trim().toLowerCase() === name);
      if (!mine) continue;
      booked++;
      if (m.status === 'held') held++;
      else if (m.status === 'noshow') noshow++;
      else undecided++;
    }
  }
  return { booked, held, noshow, undecided };
}

/* The show rate, as a PROPORTION over decided meetings only — an appointment
   nobody has marked yet is not evidence either way and must not be counted as
   a failure. Same denominator the dashboard's showRate uses. */
export const decidedOf = o => (o ? o.held + o.noshow : 0);
