/* Assertions + the result collector. Test files import THIS; tests/run.mjs
   imports this too and then dynamically imports the test files.

   Why the split: if the test files imported run.mjs while run.mjs was itself
   awaiting import() of those same files, ESM deadlocks on the circular
   top-level await ("Detected unsettled top-level await") and the whole suite
   silently reports nothing. Found the hard way. */
export const state = { pass: 0, fail: 0, failures: [] };

export function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') throw new Error('test returned a promise — use testAsync');
    state.pass++; process.stdout.write('.');
  } catch (e) { state.fail++; state.failures.push([name, e]); process.stdout.write('F'); }
}

/* `fn` may return a cleanup function, or set one on the object it is given.
   THE CLEANUP RUNS WHETHER THE TEST PASSED OR FAILED, and that is the whole
   point of it existing.

   A jsdom test that mounts the app and then fails an assertion never reaches
   its own app.unmount(). The window stays open, pretendToBeVisual keeps a
   requestAnimationFrame timer on the event loop, and the process never exits —
   so the suite HANGS instead of reporting the failure. A hang is strictly
   worse than a failure: it has no message, no exit code, and it looks
   identical to a slow test.

   Passing `t` in means a test can register its teardown at the moment it
   acquires the resource, not at the end of a body it may never reach. */
export async function testAsync(name, fn) {
  const teardowns = [];
  /* after() ACCUMULATES. A single cleanup slot silently leaks every resource
     but the last one, and several tests here mount the app more than once. */
  const t = { after: fn2 => { teardowns.push(fn2); return fn2; } };
  try { await fn(t); state.pass++; process.stdout.write('.'); }
  catch (e) { state.fail++; state.failures.push([name, e]); process.stdout.write('F'); }
  finally {
    /* reverse order, like a stack: the last thing acquired is released first */
    for (const fn2 of teardowns.reverse()) {
      /* A broken teardown must not mask the result the test just produced. */
      try { await fn2(); }
      catch (e) { process.stdout.write('\n  [cleanup failed in "' + name + '"] ' + (e && e.message) + '\n'); }
    }
  }
}

/* Print the tally and exit non-zero on failure. Call it at the end of a test
   file that uses test()/testAsync().

   dom.test.mjs had no reporter at all: it wrote dots to stdout and then simply
   ended, so a failing run and a clean run were indistinguishable, and no exit
   code ever told CI which it was. */
export function report(label = '') {
  const { pass, fail, failures } = state;
  if (fail) {
    console.log('\n');
    for (const [name, e] of failures) {
      console.log('  FAIL  ' + name);
      console.log('        ' + String((e && e.stack) || e).split('\n').slice(0, 6).join('\n        '));
    }
  }
  console.log(`\n${label ? label + ': ' : ''}${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || ''}\n  expected: ${b}\n  actual:   ${a}`);
}

/* floats compare to a tolerance so a worked example in a comment can be
   written the way a human would write it */
export function near(actual, expected, tol = 1e-4, msg) {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg || ''}\n  expected ~${expected}\n  actual    ${actual}`);
}

export function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${JSON.stringify(v)}`); }

export function throws(fn, msg) {
  try { fn(); } catch { return; }
  throw new Error(msg || 'expected a throw, got none');
}
