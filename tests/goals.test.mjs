/* Unit tests for the backwards-planning maths.

   Required by the brief's definition of done:
     zero history, single-deal sample, divide-by-zero, target already hit,
     negative remaining days.

   Every assertion here re-derives a worked example that also appears in a
   comment in src/lib/goals.js. If the two ever disagree, one of them is a bug.
   Dates are constructed with new Date(y, m, d) — LOCAL midnight — because
   new Date('2026-08-09') is UTC midnight, which is the previous evening in
   America/Chicago and shifts every working-day count by one. */
import { test, eq, near, ok } from './assert.mjs';
import {
  normalizeGoals, goalsToSettings, periodRange, workingDays, remainingWorkingDays,
  periodPace, distributeAnnual, monthlyTargets, wilson, proportion, mean, ratesFrom,
  plan, reconcile, gapLeads, explain, sentence, GOAL_KEYS, DEFAULT_SAMPLE_MIN,
  setPeriod, setTarget, setPersonTarget, serializeGoals,
} from '../src/lib/goals.js';

const AUG9 = new Date(2026, 7, 9);    // Sunday 9 August 2026
const AUG17 = new Date(2026, 7, 17);  // Monday 17 August 2026
const MONTH = (anchor = '2026-08') => normalizeGoals({ goalPlan: { period: 'month', anchor } }, AUG9);

/* ---------------------------------------------------------------- migration */

test('normalizeGoals migrates the five legacy flat goals onto the team', () => {
  const p = normalizeGoals({ goals: { booked: 12, closed: 4, onboarded: 2, revenue: 10000, mrr: 1500 } }, AUG9);
  eq(p.team.booked, 12);
  eq(p.team.revenue, 10000);
  eq(p.team.mrr, 1500);
  eq(p.period, 'month');
  eq(p.sampleMin, DEFAULT_SAMPLE_MIN);
  /* the new goal types the legacy shape never had default to 0 = no goal */
  eq(p.team.held, 0);
  eq(p.team.leads, 0);
});

test('normalizeGoals on a virgin install gives every goal key, all zero', () => {
  const p = normalizeGoals({}, AUG9);
  GOAL_KEYS.forEach(k => eq(p.team[k], 0, `expected ${k} to default to 0`));
});

test('an existing install with legacy goals sees IDENTICAL numbers round-tripped', () => {
  /* the parity guarantee: reading a legacy install and writing it straight
     back must not move a single number on the old dashboard tiles */
  const before = { goals: { booked: 12, closed: 4, onboarded: 2, revenue: 10000, mrr: 1500 }, other: 'untouched' };
  const after = goalsToSettings(before, normalizeGoals(before, AUG9), AUG9);
  eq(after.goals.booked, 12);
  eq(after.goals.closed, 4);
  eq(after.goals.onboarded, 2);
  eq(after.goals.revenue, 10000);
  eq(after.goals.mrr, 1500);
  eq(after.other, 'untouched');
});

test('a corrupt stored plan is repaired, not trusted', () => {
  const p = normalizeGoals({ goalPlan: { period: 'fortnight', sampleMin: -3, weekMask: [1, 1], team: { revenue: '9000' }, people: null, seasonality: [1, 2] } }, AUG9);
  eq(p.period, 'month');
  eq(p.sampleMin, DEFAULT_SAMPLE_MIN);
  eq(p.weekMask.length, 7);
  eq(p.team.revenue, 9000);
  eq(p.seasonality, null);
});

/* ------------------------------------------------------------------ periods */

test('periodRange: month, quarter, year', () => {
  const m = periodRange(MONTH('2026-08'), AUG9);
  eq(m.start.getDate(), 1); eq(m.start.getMonth(), 7);
  eq(m.end.getDate(), 31); eq(m.end.getMonth(), 7);
  const q = periodRange(normalizeGoals({ goalPlan: { period: 'quarter', anchor: '2026-Q3' } }, AUG9), AUG9);
  eq(q.start.getMonth(), 6);    // July
  eq(q.end.getMonth(), 8);      // September
  eq(q.end.getDate(), 30);
  eq(q.label, 'Q3 2026');
  const y = periodRange(normalizeGoals({ goalPlan: { period: 'year', anchor: '2026' } }, AUG9), AUG9);
  eq(y.start.getMonth(), 0); eq(y.end.getMonth(), 11); eq(y.end.getDate(), 31);
});

test('workingDays: August 2026 has 21 weekdays', () => {
  eq(workingDays(new Date(2026, 7, 1), new Date(2026, 7, 31)), 21);
});

test('workingDays counts today and never goes negative', () => {
  eq(workingDays(new Date(2026, 7, 10), new Date(2026, 7, 10)), 1);   // a Monday
  eq(workingDays(new Date(2026, 7, 9), new Date(2026, 7, 9)), 0);     // a Sunday
  eq(workingDays(new Date(2026, 7, 31), new Date(2026, 7, 1)), 0);    // end before start
});

test('workingDays respects a custom week mask (a realtor works Saturdays)', () => {
  /* Sun off, Mon-Sat on: August 2026 has 21 weekdays + 5 Saturdays (1,8,15,22,29) */
  eq(workingDays(new Date(2026, 7, 1), new Date(2026, 7, 31), [0, 1, 1, 1, 1, 1, 1]), 26);
});

test('remainingWorkingDays from Sunday 9 Aug 2026 is 16', () => {
  eq(remainingWorkingDays(MONTH('2026-08'), AUG9), 16);
});

test('remainingWorkingDays for a period that already ended is 0, not negative', () => {
  eq(remainingWorkingDays(MONTH('2026-06'), AUG9), 0);
});

test('periodPace on Mon 17 Aug 2026 is 11/21', () => {
  near(periodPace(MONTH('2026-08'), AUG17), 11 / 21);
});

test('periodPace clamps outside the period', () => {
  eq(periodPace(MONTH('2026-12'), AUG9), 0);   // hasn't started
  eq(periodPace(MONTH('2026-01'), AUG9), 1);   // long over
});

/* ---------------------------------------------------------- annual spread */

test('distributeAnnual flat: $120k over 12 months = $10k each', () => {
  const d = distributeAnnual(120000, null);
  eq(d.length, 12);
  d.forEach(v => near(v, 10000));
});

test('distributeAnnual with seasonality still sums to the annual target', () => {
  const w = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3];
  const d = distributeAnnual(120000, w);
  near(d[11], 120000 * 3 / 14);           // December = 25,714.29
  near(d[0], 120000 * 1 / 14);            // every other month = 8,571.43
  near(d.reduce((a, b) => a + b, 0), 120000, 1e-6);
});

test('distributeAnnual survives all-zero weights instead of dividing by zero', () => {
  distributeAnnual(120000, new Array(12).fill(0)).forEach(v => near(v, 10000));
});

test('monthlyTargets: MRR is a running total and is never sliced', () => {
  const p = normalizeGoals({ goalPlan: { period: 'year', anchor: '2026', team: { revenue: 120000, mrr: 5000 } } }, AUG9);
  const t = monthlyTargets(p, AUG9);
  near(t.revenue, 10000);
  near(t.mrr, 5000);              // NOT 5000/12
});

test('monthlyTargets: a quarterly target splits three ways', () => {
  const p = normalizeGoals({ goalPlan: { period: 'quarter', anchor: '2026-Q3', team: { revenue: 30000 } } }, AUG9);
  near(monthlyTargets(p, AUG9).revenue, 10000);
});

/* -------------------------------------------------------------- honest rates */

test('wilson on 1 of 3 is 0.061 to 0.792 — i.e. you do not know your close rate', () => {
  const w = wilson(1, 3);
  near(w.lo, 0.0615, 5e-4);
  near(w.hi, 0.7923, 5e-4);
});

test('wilson never returns a bound outside 0..1 (the reason it is used at all)', () => {
  [[0, 1], [1, 1], [3, 3], [0, 5], [5, 5], [0, 0]].forEach(([k, n]) => {
    const w = wilson(k, n);
    ok(w.lo >= 0 && w.lo <= 1, `lo out of range for ${k}/${n}`);
    ok(w.hi >= 0 && w.hi <= 1, `hi out of range for ${k}/${n}`);
    ok(w.hi >= w.lo, `hi < lo for ${k}/${n}`);
  });
});

test('proportion flags a thin sample and reports n', () => {
  const p = proportion(1, 3, 10);
  near(p.value, 1 / 3);
  eq(p.n, 3);
  eq(p.thin, true);
  const q = proportion(5, 20, 10);
  eq(q.thin, false);
  near(q.value, 0.25);
});

test('proportion with zero trials is null, not NaN, not zero', () => {
  const p = proportion(0, 0, 10);
  eq(p.value, null);
  eq(p.n, 0);
  eq(p.thin, true);
});

test('mean on a thin sample reports the observed spread, not a fake interval', () => {
  const m = mean([1500, 4200, 8000], 10);
  near(m.value, 4566.6667, 1e-3);
  eq(m.n, 3);
  eq(m.thin, true);
  eq(m.lo, 1500);
  eq(m.hi, 8000);
});

test('mean of a SINGLE deal is still reported, flagged thin, with lo === hi', () => {
  const m = mean([2500], 10);
  eq(m.value, 2500); eq(m.n, 1); eq(m.thin, true); eq(m.lo, 2500); eq(m.hi, 2500);
});

test('mean of nothing is null with n=0', () => {
  const m = mean([], 10);
  eq(m.value, null); eq(m.n, 0);
});

/* ------------------------------------------------------- backwards planning */

const RATES = ratesFrom({
  wonValues: [2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500],  // n=12, avg 2500
  metAndClosed: 33, metLeads: 100,     // 33% close rate, n=100
  heldAll: 90, noShowAll: 10,          // 90% show rate, n=100
}, MONTH());

test("the brief's worked example: $10,000 to go, 9 working days", () => {
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: RATES, daysLeft: 9, pace: 0.55 });
  eq(p.status, 'ok');
  near(p.steps.deals, 4);                       // 10000 / 2500
  near(p.steps.meetings, 4 / 0.33, 1e-6);       // 12.12
  near(p.steps.bookings, (4 / 0.33) / 0.9, 1e-6); // 13.47
  near(p.perDayBookings, ((4 / 0.33) / 0.9) / 9, 1e-6); // 1.497 a day
  eq(p.range, null);                            // every rate has n >= 10, so no range
});

test('a target already hit reports hit, zero remaining, and stops', () => {
  const p = plan({ key: 'revenue', target: 10000, achieved: 12000, rates: RATES, daysLeft: 9, pace: 0.55 });
  eq(p.status, 'hit');
  eq(p.remaining, 0);
  eq(p.perDay, 0);
  eq(p.steps, null);
});

test('a target hit EXACTLY counts as hit, not as 0 remaining and still planning', () => {
  eq(plan({ key: 'revenue', target: 10000, achieved: 10000, rates: RATES, daysLeft: 9, pace: 0.55 }).status, 'hit');
});

test('no target set produces no plan rather than a plan for zero', () => {
  const p = plan({ key: 'revenue', target: 0, achieved: 0, rates: RATES, daysLeft: 9, pace: 0.5 });
  eq(p.status, 'no_target');
  eq(p.perDay, null);
});

test('zero working days left does not divide by zero', () => {
  const p = plan({ key: 'revenue', target: 10000, achieved: 1000, rates: RATES, daysLeft: 0, pace: 1 });
  eq(p.status, 'period_over');
  eq(p.perDay, null);
  eq(p.steps, null);
});

test('NEGATIVE remaining days is floored at zero, never producing a negative daily number', () => {
  const p = plan({ key: 'revenue', target: 10000, achieved: 1000, rates: RATES, daysLeft: -4, pace: 1 });
  eq(p.status, 'period_over');
  eq(p.daysLeft, 0);
  ok(p.perDay === null || p.perDay >= 0, 'daily number must never be negative');
});

test('zero history: the chain stops and NAMES the missing rate instead of guessing', () => {
  const empty = ratesFrom({ wonValues: [], metAndClosed: 0, metLeads: 0, heldAll: 0, noShowAll: 0 }, MONTH());
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: empty, daysLeft: 9, pace: 0.5 });
  eq(p.status, 'blocked');
  eq(p.steps, null);
  eq(p.blockers.map(b => b.rate).sort(), ['avgDeal', 'meetCloseRate', 'showRate']);
  p.blockers.forEach(b => eq(b.reason, 'no_history'));
  /* but the plain daily number still exists — dollars a day is always knowable */
  near(p.perDay, 10000 / 9, 1e-6);
});

test('partial history: known rungs are computed, unknown ones are named', () => {
  /* avg deal known, close rate known, show rate has NO decided meetings yet */
  const partial = ratesFrom({
    wonValues: new Array(12).fill(2500), metAndClosed: 33, metLeads: 100, heldAll: 0, noShowAll: 0,
  }, MONTH());
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: partial, daysLeft: 9, pace: 0.5 });
  eq(p.status, 'partial');
  near(p.steps.deals, 4);
  near(p.steps.meetings, 4 / 0.33, 1e-6);
  eq(p.steps.bookings, null);
  eq(p.blockers.map(b => b.rate), ['showRate']);
  eq(p.perDayBookings, null);
});

test('a SINGLE-DEAL sample produces a range, not a point estimate', () => {
  const thin = ratesFrom({ wonValues: [2500], metAndClosed: 1, metLeads: 3, heldAll: 2, noShowAll: 1 }, MONTH());
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: thin, daysLeft: 9, pace: 0.5 });
  eq(p.status, 'thin');
  eq(p.thin, true);
  eq(p.range.thin.sort(), ['avgDeal', 'meetCloseRate', 'showRate']);
  ok(p.range.best.bookings < p.range.worst.bookings, 'the optimistic plan must need fewer bookings than the pessimistic one');
  ok(p.range.worst.bookings > p.steps.bookings, 'the point estimate must sit inside the range');
  ok(p.range.best.bookings < p.steps.bookings, 'the point estimate must sit inside the range');
});

test('a zero close rate (met people, closed nobody) is divide-by-zero and is refused', () => {
  const zero = ratesFrom({ wonValues: new Array(12).fill(2500), metAndClosed: 0, metLeads: 40, heldAll: 90, noShowAll: 10 }, MONTH());
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: zero, daysLeft: 9, pace: 0.5 });
  eq(p.blockers.map(b => b.rate), ['meetCloseRate']);
  eq(p.blockers[0].reason, 'zero');
  near(p.steps.deals, 4);
  eq(p.steps.meetings, null);
  eq(p.steps.bookings, null);
});

test('goal types enter the funnel at the right rung', () => {
  const closed = plan({ key: 'closed', target: 8, achieved: 2, rates: RATES, daysLeft: 10, pace: 0.5 });
  near(closed.steps.deals, 6);                       // the remainder IS the deals
  near(closed.steps.meetings, 6 / 0.33, 1e-6);
  const held = plan({ key: 'held', target: 20, achieved: 5, rates: RATES, daysLeft: 10, pace: 0.5 });
  eq(held.steps.deals, null);
  near(held.steps.meetings, 15);
  near(held.steps.bookings, 15 / 0.9, 1e-6);
  const booked = plan({ key: 'booked', target: 20, achieved: 5, rates: RATES, daysLeft: 10, pace: 0.5 });
  near(booked.steps.bookings, 15);                   // already the bottom rung
  near(booked.perDayBookings, 1.5);
});

test('a non-funnel goal (new leads) still gets an honest daily number', () => {
  const p = plan({ key: 'leads', target: 40, achieved: 10, rates: RATES, daysLeft: 15, pace: 0.5 });
  eq(p.status, 'ok');
  near(p.perDay, 2);
  eq(p.steps, null);
});

test('behind pace says BY HOW MUCH rather than just turning red', () => {
  /* 40% of target on day 20 of 30 */
  const p = plan({ key: 'closed', target: 10, achieved: 4, rates: RATES, daysLeft: 7, pace: 2 / 3 });
  eq(p.behind, true);
  near(p.expected, 6.6667, 1e-3);
  near(p.shortfall, 2.6667, 1e-3);
  near(p.pctOfTarget, 0.4);
});

test('ahead of pace is not reported as behind', () => {
  const p = plan({ key: 'closed', target: 10, achieved: 8, rates: RATES, daysLeft: 7, pace: 0.5 });
  eq(p.behind, false);
  near(p.shortfall, -3);
});

/* ------------------------------------------------------------ reconciliation */

test('individual targets that do not sum to the team target show the gap', () => {
  const p = normalizeGoals({ goalPlan: { team: { revenue: 100000 }, people: { Ana: { revenue: 40000 }, Ben: { revenue: 35000 } } } }, AUG9);
  const r = reconcile(p);
  eq(r.revenue.team, 100000);
  eq(r.revenue.sum, 75000);
  eq(r.revenue.gap, 25000);
  eq(r.revenue.state, 'under');
});

test('over-assigned and exactly-matched are distinguished, and no people is not a mismatch', () => {
  const over = reconcile(normalizeGoals({ goalPlan: { team: { closed: 5 }, people: { Ana: { closed: 4 }, Ben: { closed: 4 } } } }, AUG9));
  eq(over.closed.state, 'over');
  eq(over.closed.gap, -3);
  const match = reconcile(normalizeGoals({ goalPlan: { team: { closed: 8 }, people: { Ana: { closed: 4 }, Ben: { closed: 4 } } } }, AUG9));
  eq(match.closed.state, 'match');
  const none = reconcile(normalizeGoals({ goalPlan: { team: { closed: 8 } } }, AUG9));
  eq(none.closed.state, 'none');
});

/* --------------------------------------------------------------- gap to goal */

test('gap to goal names the specific deals that cover it, best odds first', () => {
  const g = gapLeads(10000, [
    { id: 'a', name: 'A', value: 8000, prob: 0.75 },
    { id: 'b', name: 'B', value: 6000, prob: 0.5 },
    { id: 'c', name: 'C', value: 9000, prob: 0.2 },
  ]);
  eq(g.picks.map(p => p.id), ['a', 'b', 'c']);
  near(g.ev, 10800);
  eq(g.covered, true);
});

test('gap to goal is honest when the open pipeline cannot cover the target', () => {
  const g = gapLeads(50000, [{ id: 'a', name: 'A', value: 8000, prob: 0.75 }]);
  eq(g.covered, false);
  near(g.shortBy, 44000);
  eq(g.pool, 1);
});

test('gap to goal on an empty pipeline returns nothing rather than crashing', () => {
  const g = gapLeads(10000, []);
  eq(g.picks, []); eq(g.covered, false); eq(g.pool, 0);
});

test('a zero-probability deal is never named as the thing that will close', () => {
  eq(gapLeads(1000, [{ id: 'z', value: 99000, prob: 0 }]).picks, []);
});

/* -------------------------------------------------------------- explanations */

test('explain shows the formula and the sample size for every rate', () => {
  const p = plan({ key: 'revenue', target: 10000, achieved: 0, rates: RATES, daysLeft: 9, pace: 0.5 });
  const lines = explain(p, RATES).map(l => `${l.line} :: ${l.sub || ''}`).join('\n');
  ok(/n=12/.test(lines), 'avg deal sample size must be shown');
  ok(/n=100/.test(lines), 'rate sample sizes must be shown');
  ok(/÷/.test(lines), 'the division must be shown, not just the answer');
});

test('explain never renders NaN, undefined or Infinity in any state', () => {
  const empty = ratesFrom({ wonValues: [], metAndClosed: 0, metLeads: 0, heldAll: 0, noShowAll: 0 }, MONTH());
  const thin = ratesFrom({ wonValues: [2500], metAndClosed: 1, metLeads: 3, heldAll: 2, noShowAll: 1 }, MONTH());
  const cases = [
    plan({ key: 'revenue', target: 10000, achieved: 0, rates: empty, daysLeft: 9, pace: 0.5 }),
    plan({ key: 'revenue', target: 10000, achieved: 0, rates: thin, daysLeft: 9, pace: 0.5 }),
    plan({ key: 'revenue', target: 0, achieved: 0, rates: RATES, daysLeft: 9, pace: 0.5 }),
    plan({ key: 'revenue', target: 10, achieved: 99, rates: RATES, daysLeft: 9, pace: 0.5 }),
    plan({ key: 'revenue', target: 10, achieved: 1, rates: RATES, daysLeft: -9, pace: 1 }),
    plan({ key: 'closed', target: 5, achieved: 1, rates: empty, daysLeft: 5, pace: 0.5 }),
  ];
  cases.forEach((p, i) => {
    const text = explain(p, p.blockers.length ? empty : RATES).map(l => `${l.line} ${l.sub || ''}`).join(' ')
      + ' ' + sentence(p, RATES, 'August');
    ok(!/NaN|undefined|Infinity/.test(text), `case ${i} (${p.status}) rendered: ${text}`);
  });
});

test('sentence reads like the brief asked it to', () => {
  const s = sentence(plan({ key: 'revenue', target: 10000, achieved: 0, rates: RATES, daysLeft: 9, pace: 0.5 }), RATES, 'August');
  ok(/\$10,000 to go in August/.test(s), s);
  ok(/33% close rate/.test(s), s);
  ok(/90% show rate/.test(s), s);
  ok(/9 working days left/.test(s), s);
});

/* ------------------------------------------- one set of numbers PER PERIOD */

test('monthly, quarterly and annual targets are SEPARATE numbers', () => {
  /* the bug: v1 stored one `team` and let `period` decide how to read it, so a
     $200,000 annual target was the same stored number as $200,000 monthly and
     the toggle relabelled the figure instead of showing a different one */
  let p = normalizeGoals({}, AUG9);
  p = setPeriod(p, 'year', AUG9);
  p = setTarget(p, 'revenue', 200000);
  eq(p.team.revenue, 200000);
  eq(p.targets.year.team.revenue, 200000);
  eq(p.targets.month.team.revenue, 0, 'typing an annual target must not fill the monthly box');

  p = setPeriod(p, 'month', AUG9);
  eq(p.team.revenue, 0, 'switching to Monthly must show the monthly target, not the annual one');
  p = setTarget(p, 'revenue', 16000);
  eq(p.targets.month.team.revenue, 16000);
  eq(p.targets.year.team.revenue, 200000, 'editing Monthly must not overwrite the annual target');

  p = setPeriod(p, 'year', AUG9);
  eq(p.team.revenue, 200000, 'the annual target comes back exactly as it was left');
});

test('switching period changes no number at all', () => {
  let p = setTarget(setPeriod(normalizeGoals({}, AUG9), 'quarter', AUG9), 'closed', 45);
  const before = JSON.stringify(p.targets);
  p = setPeriod(p, 'month', AUG9);
  p = setPeriod(p, 'year', AUG9);
  p = setPeriod(p, 'quarter', AUG9);
  eq(JSON.stringify(p.targets), before, 'toggling the period must be a pure view change');
  eq(p.team.closed, 45);
});

test('per-person targets are per-period too', () => {
  let p = setPeriod(normalizeGoals({}, AUG9), 'year', AUG9);
  p = setPersonTarget(p, 'Ana', 'revenue', 80000);
  eq(p.people.Ana.revenue, 80000);
  p = setPeriod(p, 'month', AUG9);
  eq((p.people.Ana || {}).revenue, undefined, "Ana's annual target must not appear as her monthly one");
  p = setPersonTarget(p, 'Ana', 'revenue', 7000);
  eq(p.targets.month.people.Ana.revenue, 7000);
  eq(p.targets.year.people.Ana.revenue, 80000);
});

test('a v1 plan migrates its single target set into the period it was saved for', () => {
  const v1 = { goalPlan: { v: 1, period: 'year', anchor: '2026', team: { revenue: 200000, closed: 180 }, people: { Ana: { revenue: 80000 } } },
               goals: { revenue: 10000, booked: 12, closed: 4, onboarded: 2, mrr: 1500 } };
  const p = normalizeGoals(v1, AUG9);
  eq(p.v, 2);
  eq(p.period, 'year');
  eq(p.targets.year.team.revenue, 200000);
  eq(p.targets.year.people.Ana.revenue, 80000);
  /* and the five legacy flat keys were always monthly, so they keep their slot */
  eq(p.targets.month.team.revenue, 10000);
  eq(p.targets.month.team.booked, 12);
  eq(p.targets.quarter.team.revenue, 0, 'a period never used stays empty rather than guessing');
});

test('a v1 MONTHLY plan does not double-count the legacy keys', () => {
  const v1 = { goalPlan: { v: 1, period: 'month', anchor: '2026-08', team: { revenue: 12000 } },
               goals: { revenue: 10000 } };
  const p = normalizeGoals(v1, AUG9);
  eq(p.targets.month.team.revenue, 12000, 'the saved plan wins over the mirrored legacy key');
});

test('what is stored never carries the derived views', () => {
  const stored = serializeGoals(setTarget(setPeriod(normalizeGoals({}, AUG9), 'year', AUG9), 'revenue', 200000));
  eq(stored.team, undefined, '`team` is derived — storing it lets it drift from `targets`');
  eq(stored.people, undefined);
  eq(stored.targets.year.team.revenue, 200000);
  /* and it round-trips */
  eq(normalizeGoals({ goalPlan: stored }, AUG9).team.revenue, 200000);
});

test('the legacy settings.goals mirror follows the ACTIVE period', () => {
  let p = setTarget(setPeriod(normalizeGoals({}, AUG9), 'year', AUG9), 'revenue', 120000);
  eq(goalsToSettings({}, p, AUG9).goals.revenue, 10000, 'an annual $120k mirrors as $10k this month');
  p = setPeriod(p, 'month', AUG9);
  p = setTarget(p, 'revenue', 15000);
  eq(goalsToSettings({}, p, AUG9).goals.revenue, 15000);
});
