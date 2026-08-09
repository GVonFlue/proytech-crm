/* Tiny test runner. No framework, no config file.

   Usage:  node tests/run.mjs            every tests/*.test.mjs
           node tests/run.mjs goals      tests/goals.test.mjs only

   Why not vitest/jest: this repo ships as one Vite app per client and the
   brief says no new dependency without justifying it. The runner is 30 lines.
   The DOM tests need jsdom, which is installed on demand and NOT saved:
       npm i --no-save jsdom && node tests/run.mjs                             */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { state } from './assert.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(here)
  .filter(f => f.endsWith('.test.mjs'))
  .filter(f => !only || f.startsWith(only))
  .sort();

if (!files.length) { console.error(`no test files matched "${only || '*'}"`); process.exit(1); }

for (const f of files) {
  process.stdout.write(`\n${f.padEnd(28)}`);
  await import(join(here, f));
}

console.log('\n');
state.failures.forEach(([n, e]) => console.log(`FAIL  ${n}\n      ${String(e.message).split('\n').join('\n      ')}\n`));
console.log(`${state.pass} passed, ${state.fail} failed`);
process.exit(state.fail ? 1 : 0);
