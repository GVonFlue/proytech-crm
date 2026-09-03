/* CLOCKWARP — run a test file with the process clock pinned to a chosen day.
   ============================================================================

   A TOOL, not a suite. It asserts nothing itself; `tests/all.mjs` lists it under
   HELPERS so it is never run as a test.

       node tests/clockwarp.mjs 2027-03-08 tests/moneyaudit.mjs
       node tests/clockwarp.mjs 2026-12-31 tests/dates.mjs

   Exit code is the test's own: 0 clean, non-zero if anything failed.

   WHY IT EXISTS

   On 1 September 2026 `tests/moneyaudit.mjs` went red on a clean checkout. The
   app was fine and the two screens it compares still agreed with each other —
   one fixture payment had been written as the literal '2026-08-07' while every
   other "this month" date in the cast was built from the real month, so
   $1,249.50 walked out of the window when the month rolled over and the only
   thing that broke was the number the test expected.

   That is the worst shape a failing test can have. It fails on a calendar
   boundary, for a reason unrelated to what it checks, so the red gets dismissed
   — and moneyaudit §1 is the test whose whole job is to shout the day the
   Dashboard and the Money page diverge. A test you have learned to ignore is
   worse than no test, because it still looks like coverage.

   The fix for that one file was to derive every date from an anchor. This is
   the thing that PROVES it, and that finds the next one before a calendar does:
   run the suite from the future and see what breaks.

       for f in tests/*.mjs; do node tests/clockwarp.mjs 2027-03-08 "$f" \
         </dev/null >/dev/null 2>&1 || echo "ROTS: $f"; done

   WHAT IT DOES NOT COVER

   It pins `Date` inside this process only. A test that shells out, or reads a
   real file's mtime, still sees the true clock. It also cannot tell a fixture
   that is WRONG in the future from one that is RIGHT to change in the future —
   a test asserting "this contract expires in 2027" is supposed to fail in 2028.
   Read the failure before assuming it is rot.                                */

const at = process.argv[2], target = process.argv[3];
if (!at || !target || !/^\d{4}-\d{2}-\d{2}$/.test(at)) {
  console.error('usage: node tests/clockwarp.mjs YYYY-MM-DD <test-file>');
  process.exit(2);
}
const AT = Date.parse(at + 'T12:00:00.000Z');
if (isNaN(AT)) { console.error('clockwarp: not a date: ' + at); process.exit(2); }

const RealDate = Date;
class FakeDate extends RealDate {
  /* `new Date()` is now; every other signature is untouched, so a fixture that
     builds a specific day still gets that day. */
  constructor(...a) { if (a.length === 0) super(AT); else super(...a); }
  static now() { return AT; }
}
FakeDate.parse = RealDate.parse;
FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;

/* The target owns argv from here. tests/run.mjs reads process.argv[2] as an
   entry point and tried to bundle the DATE as a module — a tool that changes
   what it measures. Rewritten so the test sees exactly what it would have seen
   if it had been invoked directly. */
process.argv = [process.argv[0], target];

await import(new URL(target, 'file://' + process.cwd() + '/').href);
