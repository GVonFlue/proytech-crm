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
   api/ may read the variables directly.

   THE ONE PLACE IS NOW @getproytech/core/env, NOT api/_env.js.
   ---------------------------------------------------------
   The rule did not change, its address did. What the resolver accepts — both
   spellings of each name, the VITE_ fallback on the URL and deliberately not on
   the key — is asserted in the package, once, against all three installs rather
   than re-asserted here against a copy. A duplicated test is a duplicated
   implementation one layer up: it passes while the thing it claims to describe
   drifts out from under it.

   WHAT IS STILL THIS REPO'S TO GET WRONG, and so is still checked here:
   that no file under api/ has quietly gone back to reading process.env itself,
   and that the module-scope capture is not reintroduced — see below.

   Reads source. Runs anywhere.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n))
                                 : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };
const read = p => fs.readFileSync(p, 'utf8');
const apiFiles = fs.readdirSync('api').filter(f => f.endsWith('.js'));

const direct = [];
for (const f of apiFiles) {
  for (const m of read(path.join('api', f)).matchAll(/process\.env\.(VITE_)?SUPABASE[A-Z_]*/g)) {
    direct.push(`${f}: ${m[0]}`);
  }
}
ok('nothing under api/ reads the Supabase variables directly',
  direct.length === 0, direct.join(', '));

/* Every file that needs credentials takes them from the package. Checked by
   import rather than by absence, so deleting the import and hardcoding a URL
   fails here too. */
const needsCreds = apiFiles.filter(f => /\bsupaUrl\(\)|\bsupaKey\(\)/.test(read(path.join('api', f))));
const unsourced = needsCreds.filter(f =>
  !/from '@getproytech\/core\/(env|guard)'/.test(read(path.join('api', f))));
ok('and every file that uses them imports them from @getproytech/core/env',
  unsourced.length === 0, unsourced.join(', '));
ok('at least one file actually uses them (the check above cannot pass vacuously)',
  needsCreds.length > 0, needsCreds.length + ' files');

/* READ AT CALL TIME, NOT AT IMPORT TIME.

   supaUrl() and supaKey() are functions for a reason the package states: a
   serverless runtime may populate the environment AFTER a module graph is first
   evaluated, so a module-scope constant can capture an empty string and then
   serve 401s for the life of the warm instance while the dashboard plainly
   shows the variable set.

   `const SUPA = supaUrl()` at module scope re-freezes exactly what the function
   was introduced to thaw, and it looks completely correct while doing it. It
   was in three files during this migration. */
const frozen = apiFiles.filter(f =>
  /^(const|let|var)\s+\w+\s*=\s*supa(Url|Key)\(\)/m.test(read(path.join('api', f))));
ok('no file re-freezes them into a module-scope constant',
  frozen.length === 0, frozen.join(', '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
