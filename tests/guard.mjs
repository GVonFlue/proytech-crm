/* ============================================================================
   tests/guard.mjs — is THIS repo wired to the shared platform correctly?

   WHAT MOVED, AND WHY THIS FILE SHRANK FROM 130 LINES.

   The BEHAVIOUR of the guard — per-IP and global rate limits, 413 on an
   oversized body and the numbers in its hint, 401 on a missing or bad token,
   failing open on an unreachable ledger and closed on an unprovable role — is
   now tested inside @getproytech/core, once, against all three installs' rules.
   It was tested here too, against a local copy, and that copy would have drifted
   from the package the first time either changed. A duplicated test is a
   duplicated implementation one layer up: it keeps passing while the thing it
   describes moves out from under it.

   WHAT STAYED IS WHAT ONLY THIS REPO CAN GET WRONG:

     * a route that reaches for the deleted local copies, which resolves to
       nothing and fails at RUNTIME, in production, on the first request rather
       than at build time
     * a local platform file creeping back in, which is how the four copies
       happened the first time
     * a sellable route that declares no module, which makes the tier sold on it
       unenforceable — the tab hides and the endpoint keeps answering
     * the .npmrc that resolves the private package going missing

   Auth coverage lives in tests/apiauth.mjs and is not repeated here.

   Reads source. Runs anywhere. Run with: npm test
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n))
                                 : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };
const read = f => fs.readFileSync(path.join('api', f), 'utf8');
const routes = fs.readdirSync('api').filter(f => f.endsWith('.js') && !f.startsWith('_')).sort();

console.log('\nthe local platform copies are gone and nothing reaches for them');
{
  const gone = ['_guard.js', '_env.js', '_spend.js'];
  const back = gone.filter(f => fs.existsSync(path.join('api', f)));
  ok('no local copy has crept back in', back.length === 0,
     `these will drift from the package: ${back.join(', ')}`);

  const stale = fs.readdirSync('api').filter(f => f.endsWith('.js'))
    .filter(f => /from '\.\/_(guard|env|spend)\.js'/.test(read(f)));
  ok('nothing still imports one', stale.length === 0,
     `${stale.join(', ')} import a file that no longer exists — this fails at runtime, not at build`);
}

console.log('\nplatform code comes from the package');
{
  const users = fs.readdirSync('api').filter(f => f.endsWith('.js'))
    .filter(f => /\bguard\(req|\bsupaUrl\(\)|\bcostOf\(/.test(read(f)));
  const unsourced = users.filter(f => !/from '@getproytech\/core\//.test(read(f)));
  ok('every file using platform code imports it from @getproytech/core',
     unsourced.length === 0, unsourced.join(', '));
  ok('  and that is a real set, not an empty one', users.length >= 10, users.length + ' files');
}

/* ---------------------------------------------------------------------------
   THE SELLABLE SURFACE.

   Every route is in exactly one of these two lists, asserted below, so adding a
   route forces the question "is this something a tier is sold on?" to be
   answered by a person rather than defaulted to "no" by silence.

   A route with no `module:` can never be gated. The tab hides in the browser and
   the endpoint keeps answering, which is the difference between packaging and a
   claim of enforcement.
   --------------------------------------------------------------------------- */
const SELLABLE = {
  'jarvis.js':         'jarvis',
  'kb-draft.js':       'playbook',
  'huddle.js':         'huddle',
  'meeting-log.js':    'mlog',
  'calendar-event.js': 'meetings',
  'calendar-availability.js': 'meetings',
  'import-leads.js':   'leads',
  'parse-receipt.js':  'money',
  'rank-tasks.js':     'tasks',
};

const NOT_SELLABLE = {
  /* Content Studio is gated by the BUILD (CONTENT_STUDIO_ON), not by the module
     list — see canOpen() in src/App.jsx, which says why. A `module:` here would
     be a second, disagreeing switch for one feature. */
  'content-slate.js':      'gated by CONTENT_STUDIO_ON, not by the module list',
  'content-regenerate.js': 'gated by CONTENT_STUDIO_ON, not by the module list',
  'content-usage.js':      'gated by CONTENT_STUDIO_ON, not by the module list',
  /* Pocket has no key in ALL_MODULES, so there is nothing for a ceiling to
     name. If it ever becomes sellable it needs the key FIRST, then the module:
     here — in that order, or the endpoint gates against a name no tier sells. */
  'pocket-segment.js':  'no ALL_MODULES key exists for Pocket',
  'pocket-backfill.js': 'no ALL_MODULES key exists for Pocket',
  'pocket-hook.js':     'webhook, no session and no tab — HMAC signed',
  /* Integrations and plumbing. Connecting Google is not a section on the price
     list; the sections that USE it (meetings, mlog) are gated instead. */
  'google-auth.js':       'OAuth handshake',
  'google-callback.js':   'OAuth handshake, hit by Google itself',
  'google-status.js':     'integration status, not a sellable section',
  'google-disconnect.js': 'integration teardown, not a sellable section',
  'sheet-read.js':        'reads through the connected Google account; plumbing',
  /* Admin-only diagnostics for the Google connection. Gating them on the
     section they diagnose would switch off the tool you reach for when that
     section is the thing misbehaving. */
  'calendar-debug.js':    'admin-only diagnostic for the calendar integration',
  'calendar-probe.js':    'admin-only diagnostic for the calendar integration',
  'notify.js':            'transactional mail, not a section',
  /* Has no call site anywhere in src/. Left ungated deliberately rather than
     guessed at: gating an endpoint whose caller you cannot find is how a live
     feature you forgot about starts answering 403. */
  'conversation.js':      'no call site in src/ — see the note in tests/guard.mjs',
};

console.log('\nevery sellable route declares the module it belongs to');
for (const [f, key] of Object.entries(SELLABLE)) {
  const src = read(f);
  ok(f + " declares module: '" + key + "'",
     new RegExp("module:\\s*'" + key + "'").test(src),
     'belongs to a sellable section but the endpoint cannot be gated');
}

console.log('\nthe two lists together cover every route, so a new one forces a decision');
{
  const unclassified = routes.filter(f => !SELLABLE[f] && !NOT_SELLABLE[f]);
  ok('no route is unclassified', unclassified.length === 0,
     `${unclassified.join(', ')} — add to SELLABLE with a module, or to NOT_SELLABLE with a reason`);

  const ghosts = [...Object.keys(SELLABLE), ...Object.keys(NOT_SELLABLE)].filter(f => !routes.includes(f));
  ok('and neither list names a route that no longer exists', ghosts.length === 0, ghosts.join(', '));

  /* The reverse: a route declaring a module while sitting in NOT_SELLABLE means
     the two lists disagree, and the code wins at runtime. */
  const contradictory = Object.keys(NOT_SELLABLE).filter(f => /module:\s*'/.test(read(f)));
  ok('nothing in NOT_SELLABLE quietly declares a module anyway',
     contradictory.length === 0, contradictory.join(', '));
}

console.log('\nthe keys the server gates on are keys the client actually ships');
{
  /* THE HALF THAT CANNOT BE CHECKED FROM EITHER SIDE ALONE.

     guard({ module: 'x' }) compares against the MODULES ceiling; the sidebar
     compares against ALL_MODULES. Nothing makes those two agree, so a route
     gating on a key no tier sells — a typo, or a key renamed on one side only —
     is invisible: the endpoint 403s for every install whose ceiling is set, and
     the tab it belongs to is fine, so it reads as a broken feature rather than
     as a gate. */
  const app = fs.readFileSync(path.join('src', 'App.jsx'), 'utf8');
  const line = (app.match(/^const ALL_MODULES=.*$/m) || [''])[0];
  const known = [...line.matchAll(/\['([a-z-]+)'/g)].map(m => m[1]);
  ok('ALL_MODULES was found and parsed', known.length > 5, known.length + ' keys');
  const orphans = Object.entries(SELLABLE).filter(([, key]) => !known.includes(key));
  ok('every module: a route gates on exists in ALL_MODULES',
     orphans.length === 0,
     orphans.map(([f, k]) => `${f} gates on '${k}'`).join(', ') + ` — known: ${known.join(',')}`);
}

console.log('\nthe .npmrc that resolves the private package is committed');
{
  /* Without it npm falls through to PUBLIC npm, where the @getproytech scope is
     ours — which is what keeps that fall-through a clean 404 rather than an
     install of somebody else's code next to a service key. */
  const npmrc = fs.readFileSync('.npmrc', 'utf8');
  ok('the scope points at GitHub Packages', /@getproytech:registry=https:\/\/npm\.pkg\.github\.com/.test(npmrc));
  ok('the token comes from the environment', /_authToken=\$\{NPM_TOKEN\}/.test(npmrc));
  ok('and no real token is committed', !/ghp_|github_pat_/.test(npmrc));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
