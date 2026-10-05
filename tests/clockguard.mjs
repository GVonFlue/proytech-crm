/* THE CLOCK GUARD — the clock-dependent suites, at every hour that has broken
   a date before, in timezones on both sides of UTC.
   ============================================================================

   monthpicker and revmonth were red every evening in Kansas and green in CI
   (UTC), because their fixtures were UTC dates and the app reads LOCAL dates.
   A test that fails by time of day gets ignored, and then it is not a test.
   Both now freeze the clock (tests/clock.mjs); this proves the freeze holds
   by running each one, as a child process, under:

     TZ   America/Chicago (the business), Pacific/Kiritimati (UTC+14),
          Pacific/Pago_Pago (UTC-11), UTC (CI)
     NOW  23:30 and 00:30 local on a plain mid-month day; the last night of
          October into 1 November (also the day US DST ends); New Year's Eve
          into 1 January (the previous month is in the previous YEAR); and
          the night US DST starts in 2027

   Every combination must pass. A failure names the TZ, the time and the
   suite, so the reproduction is one command:
     TZ=<tz> TEST_NOW=<now> node tests/<suite>.mjs

   Seen red: putting monthpicker's dAgo back to toISOString() fails under
   America/Chicago at 23:30. */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* every suite whose answer depends on today. monthpicker and revmonth were
   the two that failed in the evening; the other five were found by sweeping
   the WHOLE suite under a frozen clock (tests/clock-preload.mjs) and fixed in
   the same change. A new date-dependent suite belongs on this list. */
const SUITES = ['monthpicker.mjs', 'revmonth.mjs', 'closedmonth.mjs', 'moneyaudit.mjs', 'upsell.mjs', 'run.mjs', 'proposaldesign.mjs'];
const ZONES = ['America/Chicago', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'];
/* all on or after 2026-08-01, the app's dated money rules (tests/clock.mjs) */
const NOWS = ['2026-10-14T23:30', '2026-10-14T00:30', '2026-10-31T23:30', '2026-11-01T00:30', '2026-12-31T23:30', '2027-01-01T00:30', '2027-03-14T23:30'];

const runs = [];
for (const s of SUITES) for (const tz of ZONES) for (const now of NOWS) runs.push({ s, tz, now });

function one({ s, tz, now }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(HERE, s)], { env: { ...process.env, TZ: tz, TEST_NOW: now }, cwd: path.resolve(HERE, '..') });
    let out = '';
    child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.on('close', code => { clearTimeout(timer); resolve({ s, tz, now, code, out }); });
  });
}

/* the same lanes rule as tests/all.mjs: leave a core free, never fewer than
   two, never more than eight. Each child boots jsdom, and unbounded
   parallelism on a small runner would push a passing suite past its timeout. */
const LANES = Math.max(2, Math.min(8, (cpus()?.length || 4) - 1));
const results = [];
let next = 0;
await Promise.all(Array.from({ length: LANES }, async () => { while (next < runs.length) { const r = runs[next++]; results.push(await one(r)); } }));
results.sort((a, b) => runs.indexOf(runs.find(x => x.s === a.s && x.tz === a.tz && x.now === a.now)) - runs.indexOf(runs.find(x => x.s === b.s && x.tz === b.tz && x.now === b.now)));

let pass = 0, fail = 0;
for (const r of results) {
  const tally = (r.out.match(/(\d+) passed, (\d+) failed/) || [])[0] || 'no tally';
  const good = r.code === 0 && /\b0 failed/.test(tally);
  if (good) pass++; else fail++;
  console.log(`  ${good ? 'ok  ' : 'FAIL'} ${r.s.padEnd(16)} TZ=${r.tz.padEnd(18)} TEST_NOW=${r.now}  ${tally}`);
  if (!good) console.log(r.out.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 6).map(l => '        ' + l.trim()).join('\n'));
}
console.log(`\nclockguard: ${pass} passed, ${fail} failed (${SUITES.length} suites x ${ZONES.length} zones x ${NOWS.length} times)\n`);
process.exit(fail ? 1 : 0);
