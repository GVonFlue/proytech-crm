/* WHICH ENDPOINTS CHECK WHO IS CALLING.

   api/google-status.js shipped with no auth and handed the owner's email to
   anyone who asked. The fix is one file; the thing that stops it happening
   again is this test, which walks api/ and fails on any route that neither
   guards nor is on the KNOWN list below.

   Adding a route with no auth now breaks the build. Adding it to KNOWN_OPEN is
   deliberate, reviewed, and has to be justified in API-AUDIT.md — which this
   also checks, so the file cannot silently drift out of date.               */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : '')); } };

/* Routes that legitimately take no Supabase session. Each needs a reason, and
   the reason has to be one an attacker cannot use. */
const KNOWN_OPEN = {
  'pocket-hook.js':       'webhook — Pocket signs deliveries, verified by HMAC. A session is impossible here.',
  'google-auth.js':       'redirect to Google consent. Useless without authenticating AT Google.',
  'google-callback.js':   'Google redirects the browser here; a token cannot ride along. Needs `state`, not a session.',
};

const files = (await fs.readdir(path.join(root, 'api')))
  .filter(f => f.endsWith('.js') && !f.startsWith('_'));

console.log('\nevery route either checks a session or is a known exception');
const open = [];
for (const f of files.sort()) {
  const src = await fs.readFile(path.join(root, 'api', f), 'utf8');
  const guarded = /guard\(req,\s*res/.test(src) && /require(Auth|Admin):\s*true/.test(src);
  const signed  = /timingSafeEqual|createHmac/.test(src);
  if (guarded || signed) { ok(f + ' checks the caller', true); continue; }
  open.push(f);
  ok(f + ' is a DOCUMENTED exception, not a new hole', !!KNOWN_OPEN[f],
     'no auth and not in KNOWN_OPEN — add auth, or justify it here and in API-AUDIT.md');
}

console.log('\nthe audit document matches the code');
{
  const doc = await fs.readFile(path.join(root, 'API-AUDIT.md'), 'utf8');
  for (const f of open)
    ok('API-AUDIT.md names ' + f, doc.includes(f), 'unguarded route missing from the audit');
  /* the reverse: nothing claimed open that has since been fixed */
  for (const f of Object.keys(KNOWN_OPEN)) {
    const src = await fs.readFile(path.join(root, 'api', f), 'utf8').catch(() => '');
    const nowGuarded = /guard\(req,\s*res/.test(src) && /require(Auth|Admin):\s*true/.test(src);
    ok(f + ' is still open (remove it from KNOWN_OPEN once fixed)', !nowGuarded,
       'this route is guarded now — delete its KNOWN_OPEN entry so the list stays true');
  }
}

console.log('\ngoogle-status specifically — the one this PR closes');
{
  const src = await fs.readFile(path.join(root, 'api/google-status.js'), 'utf8');
  ok('it requires a session', /requireAuth:\s*true/.test(src));
  ok('  through the shared guard, not a second auth path', /from '@getproytech\/core\/guard'/.test(src));
  ok('  and it is rate limited like everything else', /perIp:/.test(src));
  ok('it still returns connected + email for a real session', /connected:.*refresh_token/.test(src));

  const app = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
  /* the half that is easy to forget: guarding the server 401s the client
     unless the client starts sending the token. apiPost is what attaches it. */
  ok('the client sends its token', /apiPost\('\/api\/google-status'\)/.test(app),
     (app.match(/refreshGcal=async[^;]{0,90}/) || [''])[0]);
  ok('  and no bare fetch to it remains', !/fetch\('\/api\/google-status'\)/.test(app));
}

console.log('\ngoogle-disconnect — owner-only, not merely signed-in');
{
  const src = await fs.readFile(path.join(root, 'api/google-disconnect.js'), 'utf8');
  /* There is ONE Google connection per install (ENGINEERING §6). A rep who can
     sever it switches booking off for everybody, so requireAuth is not enough
     here and requireOwner is the whole point of the change. */
  ok('it requires an ADMIN', /requireAdmin:\s*true/.test(src));
  ok('  through the shared guard, not a second auth path', /from '@getproytech\/core\/guard'/.test(src));

  /* WHAT USED TO BE ASSERTED HERE, AND WHY IT IS NOT ANY MORE.

     Two claims about _guard.js's internals: that the role came from a
     security-definer function rather than from the request body, and that the
     check failed CLOSED. Both are the PACKAGE's behaviour now, tested inside
     @getproytech/core once, against all three installs. Re-asserting them here
     against a copy this repo no longer owns is a duplicated test, which is a
     duplicated implementation one layer up: it keeps passing while the thing it
     claims to describe drifts out from under it.

     The role check also changed SHAPE in the move. It used to ask for
     role === 'owner' by name; the package asks whether the caller's role is in
     ADMIN_ROLES, set on the deployment. That is why nothing below spells a role
     — and it is why ADMIN_ROLES must be set on this install before this lands,
     because requireAdmin with no roles configured refuses everybody rather than
     erroring, which looks exactly like working software. */
  const bf = await fs.readFile(path.join(root, 'api/pocket-backfill.js'), 'utf8');
  ok('there is ONE admin check, not one per endpoint',
     /import\s*{[^}]*isAdmin[^}]*}\s*from '@getproytech\/core\/guard'/.test(bf),
     'pocket-backfill still defines its own copy');

  /* The bug this shape prevents shipped into Dwell: a route asking for 'owner'
     by name, on an install whose admins are called something else, does not
     error — it refuses everyone, quietly, for months. */
  for (const f of files) {
    const src = await fs.readFile(path.join(root, 'api', f), 'utf8')
      .then(t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
    ok('  ' + f + ' names no role for an AUTH decision',
       !/require(Owner|Manager|Leader)\s*:/.test(src) && !/\bisOwner\s*\(/.test(src),
       'use requireAdmin and set ADMIN_ROLES');
  }
}

console.log('\nthe half that is easy to forget: the client has to send the token');
{
  const app = await fs.readFile(path.join(root, 'src/App.jsx'), 'utf8');
  for (const [route, why] of [
    ['/api/google-status', 'hands out the owner’s Google address'],
    ['/api/google-disconnect', 'severs the integration for everyone'],
    ['/api/calendar-event', 'writes the calendar and mails invitations'],
    ['/api/notify', 'sends mail from a verified domain'],
  ]) {
    ok(`${route} goes through apiPost`, app.includes(`apiPost('${route}'`), why);
    ok(`  no bare fetch to ${route} remains`, !new RegExp(`fetch\\('${route}'`).test(app),
       'a bare fetch here 401s in production and the failure is silent');
  }
}

console.log('\nguarding is not the whole fix — see tests/relay.mjs');
{
  /* The point tests/relay.mjs exists to make: a session says WHO is calling,
     never WHERE the mail goes. If that file is ever deleted, this fails. */
  const relay = await fs.readFile(path.join(root, 'tests/relay.mjs'), 'utf8').catch(() => '');
  ok('the recipient-constraint tests still exist', relay.length > 0,
     'tests/relay.mjs is what proves an authenticated rep cannot aim these two endpoints');

  const n = await fs.readFile(path.join(root, 'api/notify.js'), 'utf8');
  ok('notify no longer claims "whatever is sent is used"', !/whatever is sent is used/.test(n));
  ok('  and the allowlist is not read from app_settings', !/app_settings/.test(n.replace(/\/\*[\s\S]*?\*\//g, '')),
     'app_settings is writable by any listed user — it cannot authorise a recipient');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
