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
  const guarded = /guard\(req,\s*res/.test(src) && /require(Auth|Owner):\s*true/.test(src);
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
    const nowGuarded = /guard\(req,\s*res/.test(src) && /require(Auth|Owner):\s*true/.test(src);
    ok(f + ' is still open (remove it from KNOWN_OPEN once fixed)', !nowGuarded,
       'this route is guarded now — delete its KNOWN_OPEN entry so the list stays true');
  }
}

console.log('\ngoogle-status specifically — the one this PR closes');
{
  const src = await fs.readFile(path.join(root, 'api/google-status.js'), 'utf8');
  ok('it requires a session', /requireAuth:\s*true/.test(src));
  ok('  through the shared guard, not a second auth path', /from '\.\/_guard\.js'/.test(src));
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
  ok('it requires an OWNER', /requireOwner:\s*true/.test(src));
  ok('  through the shared guard, not a second auth path', /from '\.\/_guard\.js'/.test(src));

  const g = await fs.readFile(path.join(root, 'api/_guard.js'), 'utf8');
  ok('the role comes from crm_whoami, not the request body', /crm_whoami/.test(g));
  ok('  and the owner check fails CLOSED', /catch\s*{\s*\n?\s*return false/.test(g), 'isOwner must return false when it cannot prove ownership');

  const bf = await fs.readFile(path.join(root, 'api/pocket-backfill.js'), 'utf8');
  ok('there is ONE owner check, not one per endpoint',
     /import\s*{[^}]*isOwner[^}]*}\s*from '\.\/_guard\.js'/.test(bf),
     'pocket-backfill still defines its own copy');
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
