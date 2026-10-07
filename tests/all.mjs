/* Run every test file. This is what `npm test` and CI both call.
   ============================================================================

   WHY THIS EXISTS

   `npm test` used to run tests/run.mjs — ONE of the suites. The other fifty-six
   were only ever run by hand, which is how main sat red across two merges
   without anyone noticing, and how a file could hang instead of failing for
   months.

   WHY EACH FILE GETS A TIMEOUT

   tests/dom.test.mjs once hung rather than failed: a thrown assertion skipped
   its own cleanup, jsdom's pretendToBeVisual kept a requestAnimationFrame timer
   alive, and the process never exited. On a laptop that looks like a slow test.
   On CI it burns the job's whole allowance and reports nothing. A file that
   overruns is FAILED here, with the word TIMEOUT, because a test that cannot
   finish is not a test that passed.

   WHY IT RUNS THEM IN PARALLEL BUT NOT ALL AT ONCE

   Each file esbuilds src/App.jsx and boots jsdom, so they are CPU-bound and
   memory-hungry. Unbounded parallelism on a 2-core CI runner makes every file
   slower and pushes some past the timeout — a green suite failing for the
   reason it was made fast.

   HELPERS ARE LISTED, NOT PATTERN-MATCHED. A regex over filenames is one
   rename away from silently skipping a real suite, and a skipped suite looks
   exactly like a passing one.                                                */
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* Not suites. Imported BY suites, or run by hand. */
const HELPERS = new Set([
  'all.mjs',              // this file
  'assert.mjs',           // the assertion helpers + report()
  'harness.mjs',          // the jsdom mount used by dom.test.mjs
  'tmpbundle.mjs',        // per-process bundle names, deleted on exit
  'stub-supabase.mjs',    // the fake database for harness.mjs
  'stub-supabase.js',     // the fake database for the older per-file suites
  'contrast.mjs',         // the contrast engine, imported by the per-screen
                          // contrast tests. Exports only — running it directly
                          // would assert nothing. contrastself.mjs proves it.
  'writefingerprint.mjs', // a TOOL, not a test: prints what the app writes so two
                          // commits can be diffed. Always exits 0, so running it
                          // here would only ever add noise.
  'rlsdb.mjs',            // a TOOL, not a test: runs RLS-TIGHTEN-2026-10 against
                          // real Postgres (PGlite), which is deliberately not a
                          // dependency. npm i --no-save @electric-sql/pglite first.
                          // tests/rlstighten.mjs is the half CI always runs.
  'portaldb.mjs',         // a TOOL, not a test: every migration on PGlite, then the client
                          // portal's wall swept from the catalog. portalsql.mjs is the CI half.
  'authlisteddb.mjs',     // a TOOL, not a test: runs AUTH-LISTED-2026-10.sql on PGlite
                          // (same install as rlsdb.mjs). tests/authlisted.mjs is the CI half.
  'proposalsdb.mjs',      // a TOOL, not a test: runs PROPOSALS-LEGAL-MIGRATION.sql
                          // on PGlite, same install as rlsdb.mjs. The half CI
                          // always runs is tests/proposallegal.mjs.
  'storagerlsdb.mjs',     // a TOOL, not a test: runs STORAGE-TIGHTEN-2026-10 against
                          // real Postgres (PGlite). tests/storagetighten.mjs is the
                          // half CI always runs.
  'onbrlsdb.mjs',         // a TOOL, not a test: runs ONBOARDING-MIGRATION against
                          // real Postgres (PGlite). tests/onbsql.mjs is the half
                          // CI always runs.
  'clock.mjs',            // the frozen test clock, imported by clock-dependent suites
  'clock-preload.mjs',    // a TOOL: freezes a whole process for a one-off sweep
  'clockwarp.mjs',        // a TOOL, not a test: runs another suite with the clock
                          // pinned to a chosen day, to find fixtures that only
                          // pass in the month they were written. Asserts nothing
                          // of its own; run directly with two arguments.
]);

/* Overridable so the hang path can be exercised quickly, and so a slower CI
   runner can be given more room without editing this file. */
const PER_FILE_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS) || 90_000;
/* a few files are many runs in one: clockguard is 48 child processes, two at
   a time, and inside a busy full run it needs longer than a single suite */
/* clockguard reruns a dozen suites at pinned clocks inside ONE lane, two at a
   time (never more: CLAUDE.md, Testing). At 6x it was taking 418-520s of its
   540s in CI and then timed out (PR #98). 10x (900s) is headroom for the time
   the work actually takes, not more parallelism. */
const LONGER = { 'clockguard.mjs': 10 };
/* Fixed at two, not cores-1. clockguard fans out its own lanes inside one of
   these, so cores-1 here meant ~14 jsdom processes on an 8-core laptop: load
   average 50, a fanless machine throttling, and nine suites killed at the
   timeout that pass alone. Two here and two in clockguard tops out at four. */
const LANES = 2;

/* TEST_SKIP=a.mjs,b.mjs leaves named files out, LOUDLY: they are listed as
   SKIPPED and never counted as passing. CI uses it once, for clockguard in
   the second (America/Chicago) run, because the guard sets its own TZ for
   every child and has already run in the first. */
const SKIP = new Set(String(process.env.TEST_SKIP || '').split(',').map(x => x.trim()).filter(Boolean));
const all = (await readdir(HERE))
  .filter(f => f.endsWith('.mjs') && !f.startsWith('.') && !HELPERS.has(f))
  .sort();
const skipped = all.filter(f => SKIP.has(f));
for (const f of SKIP) if (!all.includes(f)) { console.error(`TEST_SKIP names ${f}, which is not a test file here. Fix the name; a skip that matches nothing hides a typo.`); process.exit(1); }
const files = all.filter(f => !SKIP.has(f));
if (skipped.length) console.log(`SKIPPED by TEST_SKIP (not counted as passing): ${skipped.join(', ')}`);

if (!files.length) {
  console.error('No test files found in tests/ — that is a broken checkout, not a pass.');
  process.exit(1);
}

const run = file => new Promise(resolve => {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(HERE, file)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const limit = PER_FILE_TIMEOUT_MS * (LONGER[file] || 1);
  const timer = setTimeout(() => { child.kill('SIGKILL'); }, limit);
  let killed = false;
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    killed = signal === 'SIGKILL' && Date.now() - started >= limit;
    /* A PASS MUST SAY WHAT IT CHECKED. Four files once sat here that only
       exported a run() for another product's test runner: run as files they
       defined a function and exited 0, and this counted them as passing for a
       month while they checked nothing. A file that exits 0 without printing
       a tally ("N passed" / "N present") is NO RESULT, not a pass. */
    const tallied = /\b\d+ (passed|present)\b/.test(out);
    resolve({ file, ok: code === 0 && !killed && tallied, killed, silent: code === 0 && !killed && !tallied, code, out, ms: Date.now() - started });
  });
  child.on('error', err => {
    clearTimeout(timer);
    resolve({ file, ok: false, killed: false, code: -1, out: String(err), ms: Date.now() - started });
  });
});

/* a small work queue: LANES in flight, next one starts as a lane frees */
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(LANES, files.length) }, async () => {
  while (next < files.length) {
    const file = files[next++];
    const r = await run(file);
    results.push(r);
    const secs = (r.ms / 1000).toFixed(1) + 's';
    console.log(`${r.ok ? '  ok  ' : r.killed ? ' TIMEOUT ' : r.silent ? ' NO RESULT ' : ' FAIL '}${file.padEnd(26)}${secs}`);
  }
}));

results.sort((a, b) => a.file.localeCompare(b.file));
const failed = results.filter(r => !r.ok);

if (failed.length) {
  console.log('\n' + '='.repeat(66));
  for (const r of failed) {
    console.log(`\n--- ${r.file} ${r.killed ? `TIMED OUT after ${PER_FILE_TIMEOUT_MS * (LONGER[r.file] || 1) / 1000}s` : r.silent ? 'exited 0 WITHOUT A RESULT: it printed no "N passed" tally, so it checked nothing anyone can see' : `exited ${r.code}`} ---`);
    /* The tail is where a suite prints its own failures and its tally. Whole
       stdout would bury that under React's act() warnings. */
    const lines = r.out.split('\n').filter(l =>
      !/width\(0\)|please check the style|height and width|minWidth|not wrapped in act/.test(l));
    console.log(lines.slice(-40).join('\n').trimEnd());
  }
  console.log('\n' + '='.repeat(66));
}

const total = results.length;
const passed = total - failed.length;
console.log(`\n${passed} / ${total} test files passed` + (skipped.length ? ` (${skipped.length} SKIPPED by TEST_SKIP: ${skipped.join(', ')})` : '') +
            (failed.length ? `\nfailing: ${failed.map(r => r.file).join(', ')}\n` : '\n'));

/* NO BUNDLE LEFT BEHIND (tests/tmpbundle.mjs). Every suite has exited by now,
   so a tests/.b*.mjs or .b*.jsx whose process is gone is litter: 174 files and
   221MB of it had piled up before this check. A file whose pid is still alive
   belongs to a suite another session is running right now, and is left alone. */
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const litter = (await readdir(HERE))
  .filter(f => /^\.b.*\.(mjs|jsx)$/.test(f))
  .filter(f => { const m = f.match(/-(\d+)-[a-z0-9]+\.(mjs|jsx)$/); return !(m && alive(Number(m[1]))); });
if (litter.length) console.log(`LEFT BEHIND in tests/ (${litter.length}): ${litter.slice(0, 10).join(', ')}${litter.length > 10 ? ', …' : ''}\nA suite wrote a bundle without tests/tmpbundle.mjs, or did not exit cleanly.\n`);
process.exit(failed.length || litter.length ? 1 : 0);
