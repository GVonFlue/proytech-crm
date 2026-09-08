/* FIXTURE CLOCKS — a test must build a day the way the app builds a day.
   ============================================================================

   THE BUG THIS EXISTS TO STOP, FOUND 2026-09-07

   `tests/revmonth.mjs` and `tests/monthpicker.mjs` were red on a clean checkout
   of main. They had been red every evening for days, and the failure read
   "aged from the DUE date, not the sale — 9" — money-shaped, so it looked like
   the money code.

   It was not. The fixtures built a day with

       new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)     // UTC

   while the app builds one with

       isoOf = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`  // LOCAL

   Those agree for most of the day and disagree for the hours between midnight
   UTC and midnight local — every evening in the Americas. `daysOld()` measures
   from `todayISO()`, which is local, against a fixture day that was UTC, so
   every day-count came out one short. Ten became nine, and three tests became
   tests nobody read.

   WHY A SOURCE SCAN AND NOT A BEHAVIOUR TEST

   Because the behaviour test only fails in a window. Run it at 09:00 and it is
   green; the same code at 21:00 is red. A guard that is itself time-dependent
   is the thing that let this survive. This one reads the source and fails at
   any hour, in any timezone — the same trick tests/systemnotes.mjs uses to keep
   a hand-maintained list honest.

   HOW TO REPRODUCE THE ORIGINAL FAILURE ON DEMAND

       TZ=Pacific/Midway node tests/revmonth.mjs          # any evening, UTC-11
       node tests/clockwarp.mjs 2026-09-08T02:00 tests/revmonth.mjs   # UTC-5 runner

   The clockwarp instant has to be one where the UTC date and the RUNNER'S local
   date disagree, which depends on the runner's offset — 02:00 UTC works on a
   UTC-5 machine, 23:30 UTC does not. TZ= is the lever that needs no arithmetic.

   WHAT IS ALLOWED

   UTC is correct for an INSTANT — an activity timestamp, a createdAt. It is
   only wrong for a CALENDAR DAY that will be compared against the app's own.
   So `.toISOString()` on its own is fine and only the `.slice(0, 10)` day form
   is flagged. Arithmetic on an explicit ISO string is fine too, and deliberately
   still allowed: tests/moneyaudit.mjs's BEFORE() walks back from a given close
   date entirely in UTC, which is self-consistent and never touches "now".      */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 600) : '')); } };

/* A day derived from NOW through UTC. `new Date()` or `Date.now()` on the left,
   `.toISOString()` and a 10-character slice on the right. An explicit date
   string in the constructor is not matched — that is calendar arithmetic. */
const NOW_UTC_DAY = /new Date\(\s*(?:Date\.now\(\)[^)]*|)\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/;

console.log('\nno test builds a calendar day from now through UTC');
{
  const files = (await readdir(HERE)).filter(f => f.endsWith('.mjs')).sort();
  ok('there are test files to scan', files.length > 50, String(files.length));

  const offenders = [];
  for (const f of files) {
    if (f === 'fixtureclock.mjs') continue;          // the pattern is documented above
    const src = await readFile(path.join(HERE, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (NOW_UTC_DAY.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 110)}`);
    });
  }
  ok('none found', offenders.length === 0,
     'These build a UTC calendar day from the current moment and compare it against\n'
     + '        the app\'s LOCAL days. Build them with getFullYear/getMonth/getDate instead:\n\n        '
     + offenders.join('\n        '));
}

console.log('\nthe convention being enforced is the app\'s actual one');
{
  /* If isoOf ever moves to UTC, the rule above inverts and this file becomes
     the thing enforcing the bug. Read it rather than assume it. */
  const src = await readFile(path.join(ROOT, 'src/lib/lead.js'), 'utf8');
  const m = src.match(/export const isoOf\s*=\s*d\s*=>([^;]+);/);
  ok('isoOf is still exported from lib/lead.js', !!m);
  const body = m ? m[1] : '';
  ok('and still builds a LOCAL day', /getFullYear\(\)/.test(body) && /getDate\(\)/.test(body), body.trim());
  ok('  not a UTC one', !/getUTC/.test(body) && !/toISOString/.test(body), body.trim());

  /* todayISO is what every day-count in the app measures from, so it is the
     reason the fixtures have to match. */
  ok('todayISO derives from isoOf', /export const todayISO\s*=\s*\(\)\s*=>\s*isoOf\(new Date\(\)\)/.test(src));
}

console.log('\nclockwarp can reproduce a timezone boundary, not just a calendar one');
{
  /* The original tool pinned every run to noon UTC, where local and UTC agree
     in every populated timezone — so it could not see this class of bug at all,
     and reported both files green while npm test reported them red. */
  const src = await readFile(path.join(HERE, 'clockwarp.mjs'), 'utf8');
  ok('it accepts a time of day, not only a date', /T\\?\?\(\\d\{2\}|HH:MM|T\(\\d/.test(src) || /timeOfDay|hh|HH/.test(src),
     'clockwarp must accept YYYY-MM-DDThh:mm so a boundary can be pinned');
  ok('and it says so in its usage line', /YYYY-MM-DD\[Thh:mm\]/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
