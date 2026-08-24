/* ============================================================================
   Supabase credentials come from exactly one place.

   api/_google.js used to read SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY with
   no fallbacks, while every other server file accepted either spelling of the
   key and fell back to VITE_SUPABASE_URL. That asymmetry is invisible at setup
   and expensive later: this repo's own docs said SUPABASE_SERVICE_KEY in four
   places — the spelling _google.js did NOT accept — so following them gave you
   a working assistant, a working rate limiter, and a Google Calendar
   integration that silently could not read its own token.

   Patching the one file fixes the instance. This kills the class: nothing under
   api/ may read the variables directly, so the next file to need Supabase
   credentials gets both spellings and both fallbacks by construction rather
   than by somebody remembering.

   Reads source. Runs anywhere.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n))
                                 : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };
const read = p => fs.readFileSync(p, 'utf8');

const direct = [];
for (const f of fs.readdirSync('api').filter(f => f.endsWith('.js'))) {
  if (f === '_env.js') continue;                    // the one place allowed to
  for (const m of read(path.join('api', f)).matchAll(/process\.env\.(VITE_)?SUPABASE[A-Z_]*/g)) {
    direct.push(`${f}: ${m[0]}`);
  }
}
ok('only _env.js reads the Supabase variables',
  direct.length === 0, direct.join(', '));

const env = read('api/_env.js');
ok('_env.js accepts both spellings of the URL',
  /[^_]SUPABASE_URL/.test(env) && /VITE_SUPABASE_URL/.test(env));
ok('and both spellings of the service key',
  /SUPABASE_SERVICE_KEY/.test(env) && /SUPABASE_SERVICE_ROLE_KEY/.test(env));

/* The one asymmetry that is deliberate: a VITE_ variable is compiled into the
   browser bundle, and the service-role key bypasses RLS entirely. Asserted so
   nobody adds it later for symmetry. */
ok('the service key has NO VITE_ fallback, and must never get one',
  !/VITE_SUPABASE_SERVICE/.test(env));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
