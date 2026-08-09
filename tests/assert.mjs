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

export async function testAsync(name, fn) {
  try { await fn(); state.pass++; process.stdout.write('.'); }
  catch (e) { state.fail++; state.failures.push([name, e]); process.stdout.write('F'); }
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
