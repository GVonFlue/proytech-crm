/* ============================================================================
   GOALS ENGINE — targets, backwards planning, and honest sample sizes.

   Pure functions only. No React, no Supabase, no DOM — everything in here is
   arithmetic on plain objects so it can be unit tested without mounting the
   app. tests/goals.test.mjs imports this file directly.

   THE POINT OF THIS FILE
   A target is a wish. "Book 1.6 meetings a day for the next nine working days"
   is a plan. Everything here exists to turn the first into the second using
   THIS INSTALL'S OWN HISTORY, and to be loudly honest when that history is too
   thin to support the answer.

   Every derived number below carries a worked example in a comment. Maths
   nobody can re-derive by hand is maths nobody trusts.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   0. Small shared helpers (duplicated from App.jsx on purpose — importing
   App.jsx here would drag React, recharts and the whole 6,500-line component
   tree into a unit test).
   ------------------------------------------------------------------------- */
export const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const clamp01 = v => Math.max(0, Math.min(1, v));
const iso = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/* Parse 'YYYY-MM-DD' as LOCAL midnight. new Date('2026-08-09') is parsed as
   UTC midnight, which in America/Chicago is 7pm on the 8th — so a naive parse
   makes every date in this file one day early for the user. */
const parseISO = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

/* ---------------------------------------------------------------------------
   1. THE GOAL TYPES

   Both leading and lagging on purpose. A revenue target you cannot act on is a
   wish; the leading ones (bookings, meetings held, new leads) are where the
   action actually is, and they're what backwards planning produces.

   `drives` marks the three the funnel maths runs through.
   ------------------------------------------------------------------------- */
export const GOAL_TYPES = [
  { key: 'revenue',   label: 'Revenue closed',    unit: '$', lagging: true,  drives: true  },
  { key: 'closed',    label: 'Deals closed',      unit: 'n', lagging: true,  drives: true  },
  { key: 'held',      label: 'Meetings held',     unit: 'n', lagging: false, drives: true  },
  { key: 'booked',    label: 'Meetings booked',   unit: 'n', lagging: false, drives: true  },
  { key: 'leads',     label: 'New leads',         unit: 'n', lagging: false, drives: false },
  { key: 'mrr',       label: 'MRR added',         unit: '$', lagging: true,  drives: false },
  { key: 'onboarded', label: 'Clients onboarded', unit: 'n', lagging: true,  drives: false },
];
export const GOAL_KEYS = GOAL_TYPES.map(t => t.key);
export const goalType = k => GOAL_TYPES.find(t => t.key === k) || null;

/* Below this many observations a rate is shown as a RANGE, never a point.
   Suggested and shipped at 10 — a close rate computed from 3 deals is not a
   close rate. Configurable per install; see normalizeGoals. */
export const DEFAULT_SAMPLE_MIN = 10;

/* Used ONLY when an install has no history at all, and only after the UI has
   told the user these are industry-neutral guesses rather than their numbers.
   Nothing here is ever applied silently — every plan built on one of these
   comes back with assumed:true and names which rate was assumed. */
export const NEUTRAL_RATES = { meetCloseRate: 0.2, showRate: 0.75 };

/* ---------------------------------------------------------------------------
   2. THE STORED SHAPE, AND NOT BREAKING ANYBODY

   Existing installs have settings.goals = five flat monthly numbers
   {booked, closed, onboarded, revenue, mrr}. Those numbers already drive
   progress bars on dashboard tiles, and the brief is explicit: existing
   numbers must be identical after this ships.

   So settings.goals is LEFT EXACTLY AS IT IS and keeps driving those bars.
   The planner reads a separate settings.goalPlan. When goalPlan is absent —
   i.e. every install that exists today — we build one FROM the legacy numbers,
   so an owner who already set targets opens the new screen and finds their
   own numbers waiting rather than an empty form.
   ------------------------------------------------------------------------- */
const emptyTargets = () => GOAL_KEYS.reduce((o, k) => (o[k] = 0, o), {});

export function normalizeGoals(settings, today = new Date()) {
  const legacy = (settings && settings.goals) || {};
  const raw = (settings && settings.goalPlan) || null;
  const base = {
    v: 1,
    period: 'month',                 // 'month' | 'quarter' | 'year'
    anchor: iso(today).slice(0, 7),  // 'YYYY-MM' for month; 'YYYY-Qn'; 'YYYY'
    sampleMin: DEFAULT_SAMPLE_MIN,
    weekMask: [0, 1, 1, 1, 1, 1, 0], // Sun..Sat — which days count as working
    seasonality: null,               // 12 weights, only used by an annual plan
    team: emptyTargets(),
    people: {},                      // { personKey: targets }
    assumedRates: null,              // { meetCloseRate, showRate, avgDeal } if the
  };                                 // owner accepted neutral defaults
  if (!raw) {
    /* migrate the five legacy monthly numbers across, unchanged */
    base.team = {
      ...emptyTargets(),
      booked: num(legacy.booked),
      closed: num(legacy.closed),
      onboarded: num(legacy.onboarded),
      revenue: num(legacy.revenue),
      mrr: num(legacy.mrr),
    };
    return base;
  }
  const plan = { ...base, ...raw };
  plan.period = ['month', 'quarter', 'year'].includes(raw.period) ? raw.period : 'month';
  /* NOT Math.max(1, num(x) || DEFAULT): a stored -3 is truthy, so that form
     silently ships a sample threshold of 1 — i.e. every rate on the install
     treated as trustworthy from a single data point, which is the exact
     failure this whole file exists to prevent. */
  const sm = Math.round(num(raw.sampleMin));
  plan.sampleMin = sm >= 1 ? sm : DEFAULT_SAMPLE_MIN;
  plan.weekMask = Array.isArray(raw.weekMask) && raw.weekMask.length === 7 ? raw.weekMask.map(v => (v ? 1 : 0)) : base.weekMask;
  /* coerce through num() rather than spreading raw values: a target that came
     back from jsonb as the STRING "9000" would otherwise reach the planner,
     where "9000" / 2500 happens to work but "9000" + 500 gives "9000500" */
  const targets = o => GOAL_KEYS.reduce((acc, k) => (acc[k] = Math.max(0, num((o || {})[k])), acc), {});
  plan.team = targets(raw.team);
  plan.people = {};
  Object.entries(raw.people || {}).forEach(([k, v]) => { plan.people[k] = targets(v); });
  plan.seasonality = Array.isArray(raw.seasonality) && raw.seasonality.length === 12
    ? raw.seasonality.map(v => Math.max(0, num(v))) : null;
  return plan;
}

/* Writing back. settings.goals is kept in sync FROM the plan for the five
   legacy keys so the old dashboard tiles and the Monday huddle digest — which
   both read settings.goals — agree with the new screen instead of quietly
   disagreeing with it. One source of truth, two readers. */
export function goalsToSettings(settings, plan, today = new Date()) {
  const monthly = monthlyTargets(plan, today);
  return {
    ...settings,
    goalPlan: plan,
    goals: {
      ...((settings && settings.goals) || {}),
      booked: Math.round(monthly.booked),
      closed: Math.round(monthly.closed),
      onboarded: Math.round(monthly.onboarded),
      revenue: Math.round(monthly.revenue),
      mrr: Math.round(monthly.mrr),
    },
  };
}

/* ---------------------------------------------------------------------------
   3. PERIODS

   A plan covers a month, a quarter or a year. Everything downstream needs the
   same three facts: when it starts, when it ends, and what to call it.
   ------------------------------------------------------------------------- */
export function periodRange(plan, today = new Date()) {
  const p = plan.period;
  const a = String(plan.anchor || '');
  if (p === 'year') {
    const y = Number(a.slice(0, 4)) || today.getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31), label: String(y), key: String(y) };
  }
  if (p === 'quarter') {
    const y = Number(a.slice(0, 4)) || today.getFullYear();
    const qm = /Q([1-4])/i.exec(a);
    const q = qm ? Number(qm[1]) : Math.floor(today.getMonth() / 3) + 1;
    const m0 = (q - 1) * 3;                       // Q3 -> month index 6 (July)
    return { start: new Date(y, m0, 1), end: new Date(y, m0 + 3, 0), label: `Q${q} ${y}`, key: `${y}-Q${q}` };
  }
  const y = Number(a.slice(0, 4)) || today.getFullYear();
  const m = (Number(a.slice(5, 7)) || today.getMonth() + 1) - 1;
  const start = new Date(y, m, 1);
  return {
    start,
    end: new Date(y, m + 1, 0),                   // day 0 of next month = last day of this one
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
  };
}

/* Working days in [from, to] inclusive, counting only days the weekMask says
   count. Never negative: a period that already ended has 0 working days left,
   not -4, and a plan that divides by -4 produces a negative daily number,
   which is how "you need to book -1.6 meetings a day" reaches a screen.

   WORKED EXAMPLE — August 2026, weekdays only, asked on Sunday 9 Aug:
   remaining days are Mon 10 ... Mon 31. That is three full weeks (Aug 10-14,
   17-21, 24-28 = 15 days) plus Mon 31 = 16 working days. Sunday the 9th
   itself is not a working day, so it contributes nothing. */
export function workingDays(from, to, weekMask = [0, 1, 1, 1, 1, 1, 0]) {
  const a = from instanceof Date ? from : parseISO(from);
  const b = to instanceof Date ? to : parseISO(to);
  if (!a || !b) return 0;
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  if (end < start) return 0;
  let n = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (weekMask[d.getDay()]) n++;
  }
  return n;
}

/* Working days left in the period, INCLUDING today when today is a working
   day — you can still do something about it this afternoon. */
export function remainingWorkingDays(plan, today = new Date()) {
  const r = periodRange(plan, today);
  const from = today > r.start ? today : r.start;
  return workingDays(from, r.end, plan.weekMask);
}

/* How far through the period we are, by WORKING days rather than calendar
   days. This is the honest version of monthPace(): on Saturday the 15th of a
   30-day month, calendar pace says 50% but nobody has worked since Friday, so
   working pace says 50% too — while on Monday the 3rd, calendar pace says 10%
   and working pace says 4.5%, and the second one is the one that should
   decide whether a tile calls you behind.

   WORKED EXAMPLE — August 2026 (21 weekdays), asked on Mon 17 Aug:
   elapsed working days Aug 3..17 inclusive = 11. 11/21 = 0.524. */
export function periodPace(plan, today = new Date()) {
  const r = periodRange(plan, today);
  const total = workingDays(r.start, r.end, plan.weekMask);
  if (total <= 0) return 1;
  if (today < r.start) return 0;
  if (today > r.end) return 1;
  const done = workingDays(r.start, today, plan.weekMask);
  return clamp01(done / total);
}

/* ---------------------------------------------------------------------------
   4. ANNUAL -> MONTHLY

   An annual target that lands as one twelfth per month is a lie in any
   business with a season. Weights are relative, not percentages, so [1,1,...]
   and [2,2,...] both mean "flat" and nobody has to make twelve numbers add to
   100.

   WORKED EXAMPLE — $120,000 annual, weights all 1:
   sum = 12, so each month = 120000 * 1/12 = $10,000.
   Same target with December weighted 3 and the rest 1: sum = 14, so
   December = 120000 * 3/14 = $25,714 and every other month = $8,571.
   Twelve months still add to $120,000. */
export function distributeAnnual(total, weights) {
  const w = Array.isArray(weights) && weights.length === 12 ? weights.map(x => Math.max(0, num(x))) : new Array(12).fill(1);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return new Array(12).fill(num(total) / 12);
  return w.map(x => num(total) * (x / sum));
}

/* The targets that apply to ONE calendar month, whatever period the plan is
   expressed in. Quarterly splits three ways evenly; annual respects
   seasonality. Used to keep legacy settings.goals in sync. */
export function monthlyTargets(plan, today = new Date()) {
  const t = plan.team || {};
  const out = {};
  const mIdx = (() => {
    const r = periodRange(plan, today);
    if (plan.period !== 'year') return today.getMonth();
    return today.getFullYear() === r.start.getFullYear() ? today.getMonth() : 0;
  })();
  GOAL_KEYS.forEach(k => {
    const v = num(t[k]);
    if (plan.period === 'month') out[k] = v;
    else if (plan.period === 'quarter') out[k] = v / 3;
    else out[k] = distributeAnnual(v, plan.seasonality)[mIdx];
  });
  /* MRR is a running total, not a monthly flow — a $5,000 MRR target for the
     year is $5,000 of MRR, not $5,000 every month. Slicing it would ask for
     $60,000. */
  out.mrr = num(t.mrr);
  return out;
}

/* ---------------------------------------------------------------------------
   5. HONEST RATES

   Every rate this app shows carries the sample it was computed from, without
   exception, and below plan.sampleMin it is shown as a RANGE rather than a
   point estimate. This one rule is what separates a tool people trust from a
   tool people quietly stop opening.
   ------------------------------------------------------------------------- */

/* Wilson score interval — the right interval for a proportion from a small
   sample, and unlike the textbook normal approximation it never returns a
   bound below 0 or above 1 (2 of 3 successes gives 0.208-0.939, whereas the
   normal approximation gives 0.13-1.20, and a 120% close rate on screen ends
   the conversation about whether this tool is trustworthy).

   WORKED EXAMPLE — 1 close from 3 meetings, z = 1.96:
     p = 0.3333, n = 3, z2 = 3.8415
     denom  = 1 + 3.8415/3            = 2.2805
     centre = (0.3333 + 3.8415/6)/2.2805 = (0.3333+0.6402)/2.2805 = 0.4269
     margin = 1.96/2.2805 * sqrt(0.3333*0.6667/3 + 3.8415/(4*9))
            = 0.8595 * sqrt(0.07407 + 0.10671) = 0.8595 * 0.4252 = 0.3655
     -> 0.061 to 0.792. Which is the honest answer: from three meetings you do
     not know your close rate. */
export function wilson(successes, trials, z = 1.96) {
  const n = Math.max(0, Math.round(num(trials)));
  const k = Math.max(0, Math.min(n, Math.round(num(successes))));
  if (n === 0) return { lo: 0, hi: 1 };
  const p = k / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: clamp01(centre - margin), hi: clamp01(centre + margin) };
}

/* A proportion, packaged with everything the UI needs to be honest about it. */
export function proportion(successes, trials, sampleMin = DEFAULT_SAMPLE_MIN) {
  const n = Math.max(0, Math.round(num(trials)));
  const k = Math.max(0, Math.min(n, Math.round(num(successes))));
  const value = n > 0 ? k / n : null;
  const thin = n < sampleMin;
  const w = wilson(k, n);
  return { kind: 'proportion', value, n, k, thin, lo: n > 0 ? w.lo : null, hi: n > 0 ? w.hi : null, sampleMin };
}

/* Average deal size is a mean, not a proportion, so Wilson does not apply and
   a normal confidence interval on 3 deals is false precision wearing a lab
   coat. Below the threshold we show the OBSERVED SPREAD instead — "your three
   deals ran $1,500 to $8,000" is a thing a salesperson can actually reason
   about, and it is literally true rather than modelled.

   WORKED EXAMPLE — deals [1500, 4200, 8000]:
     mean = 13700/3 = $4,566.67, n = 3, below 10 so thin
     lo = 1500 (smallest actual deal), hi = 8000 (largest actual deal) */
export function mean(values, sampleMin = DEFAULT_SAMPLE_MIN) {
  const v = (values || []).map(num).filter(x => x > 0);
  const n = v.length;
  if (!n) return { kind: 'mean', value: null, n: 0, thin: true, lo: null, hi: null, sampleMin };
  const value = v.reduce((a, b) => a + b, 0) / n;
  return {
    kind: 'mean', value, n, thin: n < sampleMin, sampleMin,
    lo: Math.min(...v), hi: Math.max(...v),
  };
}

/* Pull the three rates the funnel runs on out of whatever useMetrics returned.
   Kept here rather than in App.jsx so the planner can be tested against a
   hand-written metrics object. */
export function ratesFrom(m, plan) {
  const min = (plan && plan.sampleMin) || DEFAULT_SAMPLE_MIN;
  const decided = num(m && m.heldAll) + num(m && m.noShowAll);
  return {
    avgDeal: mean((m && m.wonValues) || [], min),
    meetCloseRate: proportion(num(m && m.metAndClosed), num(m && m.metLeads), min),
    showRate: proportion(num(m && m.heldAll), decided, min),
    avgDaysToClose: m && m.avgDaysToClose != null ? { value: m.avgDaysToClose, n: num(m.cycleN) } : { value: null, n: 0 },
  };
}

/* ---------------------------------------------------------------------------
   6. BACKWARDS PLANNING — the whole feature

     target ÷ avg deal size = deals needed
     deals  ÷ close rate    = qualifying meetings needed
     meets  ÷ show rate     = meetings to book
     book   ÷ working days left = the only number anybody can act on

   Everything divides, so everything can divide by zero, and every one of those
   zeros is a real state a young install is actually in. Each is handled by
   REFUSING to produce a number and naming what is missing, never by
   substituting a plausible one.
   ------------------------------------------------------------------------- */

/* Run the chain once at one set of rate values, entering at the rung this goal
   type sits on. Internal — plan() calls it up to three times (point estimate,
   optimistic, pessimistic) to produce a range.

   A missing rate stops the chain at that rung and leaves everything below it
   null rather than throwing the whole plan away: a revenue target with a known
   average deal but no show-rate history can still tell you how many deals and
   meetings you need, and saying "and we don't know your show rate yet" is more
   useful than saying nothing.

   WORKED EXAMPLE — 'revenue', remaining $10,000, avgDeal $2,500,
   closeRate 0.33, showRate 0.90:
     deals    = 10000 / 2500 = 4
     meetings = 4 / 0.33     = 12.1
     bookings = 12.1 / 0.90  = 13.5  -> "book 14" */
function chain(key, remaining, avgDeal, closeRate, showRate) {
  let deals = null, meetings = null, bookings = null;
  if (key === 'revenue') {
    deals = avgDeal > 0 ? remaining / avgDeal : null;
    meetings = deals != null && closeRate > 0 ? deals / closeRate : null;
    bookings = meetings != null && showRate > 0 ? meetings / showRate : null;
  } else if (key === 'closed') {
    deals = remaining;
    meetings = closeRate > 0 ? deals / closeRate : null;
    bookings = meetings != null && showRate > 0 ? meetings / showRate : null;
  } else if (key === 'held') {
    meetings = remaining;
    bookings = showRate > 0 ? meetings / showRate : null;
  } else {
    bookings = remaining;          // 'booked' is already the bottom rung
  }
  return { deals, meetings, bookings };
}

/**
 * Build the plan for one goal.
 *
 * @param {object} o
 * @param {string} o.key        which GOAL_TYPES key
 * @param {number} o.target     the target for the period
 * @param {number} o.achieved   what has actually happened so far this period
 * @param {object} o.rates      from ratesFrom()
 * @param {number} o.daysLeft   remaining working days
 * @param {number} o.pace       0..1, how far through the period (working days)
 *
 * @returns {object} status, remaining, and either a numeric plan or the list
 *                   of blockers that stopped one being produced.
 */
export function plan({ key, target, achieved, rates, daysLeft, pace }) {
  const t = num(target), done = num(achieved);
  const days = Math.max(0, Math.floor(num(daysLeft)));
  const out = {
    key, target: t, achieved: done, daysLeft: days,
    remaining: Math.max(0, t - done),
    pctOfTarget: t > 0 ? done / t : null,
    pace: clamp01(num(pace)),
    status: 'ok', blockers: [], assumed: [], steps: null, perDay: null, range: null,
  };

  if (t <= 0) { out.status = 'no_target'; return out; }
  if (done >= t) { out.status = 'hit'; out.perDay = 0; out.remaining = 0; return out; }

  /* "40% of target on day 20 of 30 is behind" — say by how much, and what it
     now takes to catch up, rather than just colouring it red.
     WORKED EXAMPLE — target 10, done 4, pace 0.667:
       expected by now = 10 * 0.667 = 6.67
       shortfall       = 6.67 - 4    = 2.67 behind where pace says you'd be */
  out.expected = t * out.pace;
  out.shortfall = out.expected - done;      // positive = behind
  out.behind = out.shortfall > 0;

  if (days <= 0) { out.status = 'period_over'; return out; }

  /* The straight-line answer, which always exists: the goal's own unit per
     remaining working day. For a revenue goal that is dollars a day, which is
     true but not actionable — the funnel below turns it into meetings. */
  out.perDay = out.remaining / days;

  const type = goalType(key);
  if (!type || !type.drives) { out.status = 'ok'; return out; }

  /* --- the funnel, entered at the right rung for this goal type --- */
  const ad = rates.avgDeal, cr = rates.meetCloseRate, sr = rates.showRate;
  let need = { deals: null, meetings: null, bookings: null };
  const needs = [];   // which rates this goal type actually depends on

  if (key === 'revenue') { needs.push('avgDeal', 'meetCloseRate', 'showRate'); }
  if (key === 'closed')  { needs.push('meetCloseRate', 'showRate'); }
  if (key === 'held')    { needs.push('showRate'); }
  /* 'booked' is already the bottom rung — nothing to divide by. */

  needs.forEach(r => {
    const v = rates[r];
    if (!v || v.value == null || v.value <= 0) out.blockers.push({ rate: r, reason: v && v.n === 0 ? 'no_history' : 'zero' });
  });

  const at = (a, c, s) => chain(key, out.remaining, num(a), num(c), num(s));

  need = at(ad.value, cr.value, sr.value);
  out.steps = need;
  out.perDayBookings = need.bookings != null ? need.bookings / days : null;

  /* Nothing on the chain computed at all -> genuinely blocked. Some rungs
     computed but not the bottom one -> partial, and the UI says which rate is
     missing instead of pretending the plan is complete. */
  if (need.deals == null && need.meetings == null && need.bookings == null) {
    out.status = 'blocked'; out.steps = null; return out;
  }
  if (out.blockers.length) { out.status = 'partial'; }

  /* --- the range, when any rate feeding this goal is thin ---
     A thin rate does not stop the plan, it widens it. We run the chain at both
     ends of every thin rate's interval. Note the direction: a HIGHER close
     rate means FEWER meetings needed, so the optimistic plan uses each rate's
     upper bound and the pessimistic plan uses its lower bound. */
  const thinNames = needs.filter(r => rates[r] && rates[r].thin);
  if (thinNames.length) {
    const bound = (r, side) => {
      const v = rates[r];
      if (!v || !v.thin) return v ? v.value : null;
      return side === 'hi' ? v.hi : v.lo;
    };
    const best = at(
      needs.includes('avgDeal') ? bound('avgDeal', 'hi') : ad.value,
      needs.includes('meetCloseRate') ? bound('meetCloseRate', 'hi') : cr.value,
      needs.includes('showRate') ? bound('showRate', 'hi') : sr.value);
    const worst = at(
      needs.includes('avgDeal') ? bound('avgDeal', 'lo') : ad.value,
      needs.includes('meetCloseRate') ? bound('meetCloseRate', 'lo') : cr.value,
      needs.includes('showRate') ? bound('showRate', 'lo') : sr.value);
    out.range = { best, worst, thin: thinNames };
    out.thin = true;
    if (out.status === 'ok') out.status = 'thin';   // 'partial' is the louder problem, keep it
  }
  return out;
}

/* ---------------------------------------------------------------------------
   7. RECONCILIATION

   If the individual targets do not sum to the team target, show the difference
   deliberately. Hiding it is how a team ends the quarter 18% short with every
   individual "on track".

   WORKED EXAMPLE — team revenue 100,000; Ana 40,000; Ben 35,000:
     sum = 75,000, gap = 100,000 - 75,000 = 25,000 unassigned (25% of the team
     number belongs to nobody).
   ------------------------------------------------------------------------- */
export function reconcile(plan) {
  const team = plan.team || {}, people = plan.people || {};
  const names = Object.keys(people);
  const out = {};
  GOAL_KEYS.forEach(k => {
    const teamV = num(team[k]);
    const sum = names.reduce((a, n) => a + num(people[n][k]), 0);
    out[k] = {
      team: teamV, sum, gap: teamV - sum,
      state: names.length === 0 ? 'none' : (Math.abs(teamV - sum) < 0.5 ? 'match' : (teamV > sum ? 'under' : 'over')),
    };
  });
  return out;
}

/* ---------------------------------------------------------------------------
   8. GAP TO GOAL, WITH NAMES

   "Follow up with these four proposals" beats "improve follow-up". Given the
   revenue still needed, name the specific open deals whose expected value
   covers it, best-odds-first.

   Expected value = deal value x stage probability, so a $20k deal at 25% and
   a $5k deal at 100% are ranked by what they are actually worth right now.

   WORKED EXAMPLE — need $10,000; open deals:
     A $8,000 @ 0.75 -> EV $6,000
     B $6,000 @ 0.50 -> EV $3,000
     C $9,000 @ 0.20 -> EV $1,800
   Sorted by EV, cumulative: 6,000 then 9,000 then 10,800 — so it takes all
   three, and the function returns all three with covered = true.
   ------------------------------------------------------------------------- */
export function gapLeads(needed, openDeals, limit = 6) {
  const need = num(needed);
  if (need <= 0) return { need: 0, picks: [], covered: true, ev: 0 };
  const ranked = (openDeals || [])
    .map(d => ({ ...d, ev: num(d.value) * clamp01(num(d.prob)) }))
    .filter(d => d.ev > 0)
    .sort((a, b) => b.ev - a.ev);
  const picks = [];
  let ev = 0;
  for (const d of ranked) {
    if (ev >= need || picks.length >= limit) break;
    picks.push(d); ev += d.ev;
  }
  return { need, picks, ev, covered: ev >= need, shortBy: Math.max(0, need - ev), pool: ranked.length };
}

/* ---------------------------------------------------------------------------
   9. FORMATTING THE EXPLANATION

   "Explain every number on tap" is a requirement, not a nicety — it is also
   the cheapest possible defence against a maths bug shipping unnoticed, since
   the formula and its inputs are on screen next to the answer.
   ------------------------------------------------------------------------- */
const r1 = n => Math.round(n * 10) / 10;
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const pct = n => Math.round(n * 100) + '%';

export function explain(p, rates) {
  if (!p) return [];
  const L = [];
  if (p.status === 'no_target') return [{ line: 'No target set for this one.' }];
  if (p.status === 'hit') return [{ line: `Target hit: ${r1(p.achieved)} of ${r1(p.target)}.` }];
  if (p.status === 'period_over') return [{ line: 'This period has ended — no working days left to plan across.' }];

  L.push({ line: `${r1(p.remaining)} to go`, sub: `${r1(p.target)} target − ${r1(p.achieved)} so far = ${r1(p.remaining)}` });
  L.push({ line: `${p.daysLeft} working day${p.daysLeft === 1 ? '' : 's'} left` });

  const blockerLines = () => (p.blockers || []).map(b => ({
    line: b.reason === 'no_history'
      ? `No ${label(b.rate)} history on this install yet, so the chain stops there.`
      : `Your ${label(b.rate)} is zero, so the maths would divide by nothing.`,
  }));
  if (p.status === 'blocked') return L.concat(blockerLines());
  const s = p.steps || {};
  if (s.deals != null) L.push({
    line: `${r1(s.deals)} deals needed`,
    /* for a 'deals closed' goal the deals ARE the target — there is no
       division to show, and printing "÷ $0 avg deal" would be a lie */
    sub: p.key === 'revenue'
      ? `${money(p.remaining)} ÷ ${money(rates.avgDeal.value)} avg deal = ${r1(s.deals)}  (n=${rates.avgDeal.n})`
      : `the target is deals, so this is the remainder itself`,
  });
  if (s.meetings != null) L.push({
    line: `${r1(s.meetings)} qualifying meetings`,
    sub: `${r1(s.deals != null ? s.deals : p.remaining)} ÷ ${pct(rates.meetCloseRate.value)} close rate = ${r1(s.meetings)}  (n=${rates.meetCloseRate.n})`,
  });
  if (s.bookings != null) L.push({
    line: `${r1(s.bookings)} to book`,
    sub: `${r1(s.meetings != null ? s.meetings : p.remaining)} ÷ ${pct(rates.showRate.value)} show rate = ${r1(s.bookings)}  (n=${rates.showRate.n})`,
  });
  if (p.perDayBookings != null) L.push({
    line: `${r1(p.perDayBookings)} bookings a day`,
    sub: `${r1(s.bookings)} ÷ ${p.daysLeft} working days = ${r1(p.perDayBookings)}`,
  });
  if (p.range && p.range.best.bookings != null && p.range.worst.bookings != null) L.push({
    line: `Range: ${r1(p.range.best.bookings)}–${r1(p.range.worst.bookings)} to book`,
    sub: `${p.range.thin.map(label).join(' and ')} computed from a thin sample, so this is a range, not a number.`,
  });
  return L.concat(blockerLines());
}
function label(r) {
  return r === 'avgDeal' ? 'average deal size'
    : r === 'meetCloseRate' ? 'meeting → close rate'
    : r === 'showRate' ? 'show rate' : r;
}

/* One-sentence version, for the daily number tile.
   "To hit $10,000 this month you need 4 more closes. At your 33% close rate
   that's 12 qualifying meetings, and at your 90% show rate you need to book
   14. Nine working days left — 1.6 bookings a day." */
export function sentence(p, rates, periodLabel) {
  if (!p || p.status === 'no_target') return '';
  if (p.status === 'hit') return `Target hit for ${periodLabel} — ${r1(p.achieved)} of ${r1(p.target)}.`;
  if (p.status === 'period_over') return `${periodLabel} is over. Ended at ${r1(p.achieved)} of ${r1(p.target)}.`;
  const t = goalType(p.key);
  const unit = t && t.unit === '$' ? money(p.remaining) : r1(p.remaining) + ' ' + (t ? t.label.toLowerCase() : '');
  if (p.status === 'blocked') {
    return `${unit} to go with ${p.daysLeft} working days left. Not enough history to work backwards yet — ${p.blockers.map(b => label(b.rate)).join(' and ')} missing.`;
  }
  const s = p.steps || {};
  const bits = [`${unit} to go in ${periodLabel}.`];
  if (s.deals != null) bits.push(`That's ${r1(s.deals)} more closes.`);
  if (s.meetings != null && rates.meetCloseRate.value) bits.push(`At your ${pct(rates.meetCloseRate.value)} close rate that's ${r1(s.meetings)} qualifying meetings,`);
  if (s.bookings != null && rates.showRate.value) bits.push(`and at your ${pct(rates.showRate.value)} show rate you need to book ${r1(s.bookings)}.`);
  bits.push(`${p.daysLeft} working day${p.daysLeft === 1 ? '' : 's'} left${p.perDayBookings != null ? ` — ${r1(p.perDayBookings)} bookings a day` : ''}.`);
  return bits.join(' ');
}
