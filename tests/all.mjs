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
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

/* Not suites. Imported BY suites, or run by hand. */
const HELPERS = new Set([
  'all.mjs',              // this file
  'assert.mjs',           // the assertion helpers + report()
  'harness.mjs',          // the jsdom mount used by dom.test.mjs
  'stub-supabase.mjs',    // the fake database for harness.mjs
  'stub-supabase.js',     // the fake database for the older per-file suites
  'writefingerprint.mjs', // a TOOL, not a test: prints what the app writes so two
                          // commits can be diffed. Always exits 0, so running it
                          // here would only ever add noise.
]);

/* Overridable so the hang path can be exercised quickly, and so a slower CI
   runner can be given more room without editing this file. */
const PER_FILE_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS) || 90_000;
/* Leave the machine a core to breathe on; never fewer than two lanes. */
const LANES = Math.max(2, Math.min(8, (cpus()?.length || 4) - 1));

const files = (await readdir(HERE))
  .filter(f => f.endsWith('.mjs') && !f.startsWith('.') && !HELPERS.has(f))
  .sort();

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
  const timer = setTimeout(() => { child.kill('SIGKILL'); }, PER_FILE_TIMEOUT_MS);
  let killed = false;
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    killed = signal === 'SIGKILL' && Date.now() - started >= PER_FILE_TIMEOUT_MS;
    resolve({ file, ok: code === 0 && !killed, killed, code, out, ms: Date.now() - started });
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
    console.log(`${r.ok ? '  ok  ' : r.killed ? ' TIMEOUT ' : ' FAIL '}${file.padEnd(26)}${secs}`);
  }
}));

results.sort((a, b) => a.file.localeCompare(b.file));
const failed = results.filter(r => !r.ok);

if (failed.length) {
  console.log('\n' + '='.repeat(66));
  for (const r of failed) {
    console.log(`\n--- ${r.file} ${r.killed ? `TIMED OUT after ${PER_FILE_TIMEOUT_MS / 1000}s` : `exited ${r.code}`} ---`);
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
console.log(`\n${passed} / ${total} test files passed` +
            (failed.length ? `\nfailing: ${failed.map(r => r.file).join(', ')}\n` : '\n'));
process.exit(failed.length ? 1 : 0);
