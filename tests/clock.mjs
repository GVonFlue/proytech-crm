/* THE TEST CLOCK — freeze "now" at a fixed LOCAL time, so a suite gives the
   same answer at 9 am and at 11:30 pm, in Wichita and in UTC.
   ============================================================================

   A HELPER, not a suite (listed in tests/all.mjs HELPERS).

   WHY IT EXISTS. monthpicker and revmonth went red every evening in Kansas
   and green in CI. Their fixtures built dates with toISOString(), which is
   UTC, while the app ages a debt from the LOCAL date (lib/lead isoOf). After
   about 7 pm Central, UTC is already tomorrow, so "19 days ago" in the
   fixture was "20 days" to the app. CI runs in UTC, where the two agree, so
   the failure only ever happened on the laptop of the person reading it:
   a test you learn to ignore.

   THE RULES, for any suite whose answer depends on today:
     1. freezeClock() first, before building fixtures or importing the app.
     2. Build calendar dates with localISO() and daysAgo(), which do calendar
        arithmetic in local time. Never n * 86400000 (wrong across DST) and
        never toISOString().slice(0, 10) (UTC, not the user's day).

   TEST_NOW overrides the default (a LOCAL stamp, "2026-10-14T23:30").
   tests/clockguard.mjs reruns the clock-dependent suites under several
   timezones and hours with it; tests/clock-preload.mjs freezes a WHOLE
   process (node --import ./tests/clock-preload.mjs) for a one-off sweep. */

const RealDate = globalThis.__REAL_DATE__ || Date;
globalThis.__REAL_DATE__ = RealDate;

/* 23:30 local on a Wednesday mid-month: late enough that UTC is tomorrow for
   every timezone west of Greenwich, far from a month or a DST boundary. And
   AFTER the app's dated rules (CASH_RULE_FROM, PAYMENTS_FROM: 2026-08-01):
   ENGINEERING §4 says new money rules apply from a dated cutoff, so a clock
   frozen before one runs the OLD rules against fixtures written for the new
   ones. A first cut used June 2026 and 'found' eleven money failures that
   were only that. Any TEST_NOW must be on or after 2026-08-01. */
export const DEFAULT_NOW = '2026-10-14T23:30';
export const EARLIEST_NOW = '2026-08-01';

export function parseLocal(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(stamp || ''));
  if (!m) throw new Error(`TEST_NOW must look like 2026-10-14T23:30 (local time); got ${JSON.stringify(stamp)}`);
  return new RealDate(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), 0, 0).getTime();
}

/** Freeze Date at a fixed local time. Returns the frozen epoch ms.
 *  `new Date()` and Date.now() return it; every other Date use is untouched. */
export function freezeClock(stamp = process.env.TEST_NOW || DEFAULT_NOW) {
  if (String(stamp).slice(0, 10) < EARLIEST_NOW) throw new Error(`TEST_NOW ${stamp} is before ${EARLIEST_NOW}, the app's dated money rules; a clock frozen there tests the old rules (tests/clock.mjs)`);
  const fixed = parseLocal(stamp);
  class FrozenDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  FrozenDate.UTC = RealDate.UTC; FrozenDate.parse = RealDate.parse;
  globalThis.Date = FrozenDate;
  return fixed;
}

const pad = n => String(n).padStart(2, '0');
/** YYYY-MM-DD of a Date in LOCAL time, the way the app's isoOf() reads it. */
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The local calendar date n days before today (calendar arithmetic, DST-safe). */
export const daysAgo = n => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12)); };
