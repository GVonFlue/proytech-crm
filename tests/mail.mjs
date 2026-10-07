/* MAIL LEAVES THIS DOMAIN IN ONE PLACE, AND THAT PLACE PICKS THE RECIPIENT.
   ============================================================================

   api/_mail.js holds the Resend call and the recipient allowlist. Two callers
   reach it: api/notify.js (signed-in only) and api/coffee-book.js (public,
   in-process, no session). Moving the send out of the route is only safe if:

   1. notify.js still refuses an anonymous caller — the helper must not have
      become a way around the guard;
   2. the helper itself refuses any address not on the allowlist, because
      coffee-book has no session to check and its form carries a guest email;
   3. a real coffee booking emails the owners, never the guest, and still
      succeeds when the email does not.

   tests/relay.mjs covers notify's signed-in recipient rules in depth; this
   file covers the helper directly and the new in-process caller.            */

/* env FIRST — the modules read process.env at module scope, and ES imports are
   hoisted. Same trap as tests/relay.mjs. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'ProyTech CRM <crm@getproytech.com>';
process.env.NOTIFY_TO = 'garrett@getproytech.com';
process.env.APP_URL = 'https://crm.test';
process.env.CALENDAR_TZ = 'America/Chicago';
delete process.env.CALENDAR_IDS;

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { sendMail, pickRecipients } = await import('../api/_mail.js');
const notify = (await import('../api/notify.js')).default;
const coffeeBook = (await import('../api/coffee-book.js')).default;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };

/* ---- the world these talk to -------------------------------------------- */
let sent = [];                                     // every message handed to Resend
let ownerRows = [{ email: 'logan@getproytech.com' }];
let resendMode = 'ok';                             // 'ok' | 'fail' | 'throw'
let notifyHttpCalls = 0;                           // any HTTP hop to /api/notify
let calendarPosts = [];
let leadUpserts = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const json = (body, status = 200) => ({
    ok: status < 300, status, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body, text: async () => JSON.stringify(body),
  });

  if (u.includes('/api/notify')) { notifyHttpCalls++; return json({}, 401); }
  // a real session, for any token containing "good"
  /* guard({requireAuth}) also asks Postgres whether the login is on the team (AUTH-LISTED-2026-10): a 'good' token is an active rep (an owner if it says so) */
  if (u.includes('/rpc/crm_whoami')) { const h = opts.headers || {}; const tok = h.authorization || h.Authorization || ''; return json(/good/.test(tok) ? [{ role: /owner/.test(tok) ? 'owner' : 'rep', active: true }] : [{ role: 'none', active: true }]); }
  if (u.includes('/auth/v1/user')) {
    const h = opts.headers || {};
    const tok = h.authorization || h.Authorization || '';
    return /good/.test(tok) ? json({ id: 'u1' }) : json({}, 401);
  }
  if (u.includes('api_hits')) return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
  if (u.includes('crm_users')) return ownerRows === null ? json({}, 500) : json(ownerRows);
  if (u.includes('api.resend.com')) {
    if (resendMode === 'throw') throw new Error('network down');
    sent.push(JSON.parse(opts.body));
    return resendMode === 'fail' ? json({ message: 'domain not verified' }, 422) : json({ id: 'msg_1' });
  }
  // Supabase via supabase-js: the stored Google token, and the leads table
  if (u.includes('/rest/v1/secrets')) return json({ data: { refresh_token: 'r' } });
  if (u.includes('/rest/v1/leads')) {
    if (method === 'GET') return json([]);
    leadUpserts.push(JSON.parse(opts.body)); return json([], 201);
  }
  // Google
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'g-tok' });
  if (u.includes('googleapis.com/calendar')) {
    if (method === 'GET') return json({ items: [] });
    calendarPosts.push(JSON.parse(opts.body));
    return json({ id: 'ev1', htmlLink: 'https://calendar.google.com/ev1' });
  }
  return json({}, 404);
};

const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
const mkReq = (body, tok) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '1.2.3.4', origin: 'https://www.getproytech.com', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
  socket: { remoteAddress: '1.2.3.4' },
  body: body || {},
});
const reset = () => { sent = []; resendMode = 'ok'; ownerRows = [{ email: 'logan@getproytech.com' }]; notifyHttpCalls = 0; calendarPosts = []; leadUpserts = []; };

/* ---- 1. notify.js still refuses an anonymous caller ---------------------- */
console.log('\nnotify.js — still signed-in only after the send moved out');
{
  reset();
  const res = mkRes(); await notify(mkReq({ kind: 'conversion', rep: 'A', client: 'B' }, ''), res);
  ok('no token is a 401', res.code === 401, 'code ' + res.code);
  ok('  and nothing was sent', sent.length === 0);

  reset();
  const res2 = mkRes(); await notify(mkReq({ kind: 'conversion', rep: 'A', client: 'B' }, 'forged-token'), res2);
  ok('a token that is not a session is a 401', res2.code === 401, 'code ' + res2.code);
  ok('  and nothing was sent', sent.length === 0);

  reset();
  const res3 = mkRes(); await notify(mkReq({ kind: 'conversion', rep: 'A', client: 'B', to: ['attacker@evil.test'] }, 'good-rep'), res3);
  ok('signed in, aiming at an outsider: nothing sent', sent.length === 0 && res3.body && res3.body.reason === 'no_recipients');

  reset();
  const res4 = mkRes(); await notify(mkReq({ kind: 'conversion', rep: 'A', client: 'B' }, 'good-rep'), res4);
  ok('signed in: it still sends, through the helper, to the allowlist',
     res4.body && res4.body.ok === true && sent.length === 1
     && JSON.stringify(sent[0].to.sort()) === JSON.stringify(['garrett@getproytech.com', 'logan@getproytech.com']),
     JSON.stringify(res4.body));
  const src = await fs.readFile(path.join(ROOT, 'api/notify.js'), 'utf8');
  ok('notify.js keeps requireAuth', /requireAuth:\s*true/.test(src));
  ok('notify.js no longer calls Resend itself', !src.includes('api.resend.com'));
}

/* ---- 2. the helper refuses recipients not on the allowlist --------------- */
console.log('\n_mail.js — the allowlist is enforced inside the helper');
{
  reset();
  const r = await sendMail({ to: ['attacker@evil.test'], subject: 's', html: 'h' });
  ok('an outsider alone: refused, nothing sent', r.ok === false && r.reason === 'no_recipients' && sent.length === 0, JSON.stringify(r));
  ok('  and it says how many were refused, not which would work', r.rejected === 1);

  reset();
  const r2 = await sendMail({ to: ['guest@example.com', 'garrett@getproytech.com'], subject: 's', html: 'h' });
  ok('a mixed list: only the allowed address receives it',
     r2.ok && sent.length === 1 && JSON.stringify(sent[0].to) === JSON.stringify(['garrett@getproytech.com']), JSON.stringify(sent[0] && sent[0].to));
  ok('  and the outsider is counted as rejected', r2.rejected === 1);

  reset();
  await sendMail({ to: ['garrett@getproytech.com.evil.test', 'xgarrett@getproytech.com'], subject: 's', html: 'h' });
  ok('look-alike addresses are refused', sent.length === 0);

  reset();
  const r3 = await sendMail({ to: ['  GARRETT@GetProyTech.com '], subject: 's', html: 'h' });
  ok('casing and whitespace on an allowed address still match', r3.ok && sent[0].to[0] === 'garrett@getproytech.com');

  reset();
  await sendMail({ subject: 's', html: 'h' });
  ok('no `to`: every allowed address, from NOTIFY_TO and active owners',
     sent.length === 1 && sent[0].to.length === 2);

  reset();
  const keep = process.env.NOTIFY_TO; delete process.env.NOTIFY_TO; ownerRows = null;
  const r4 = await sendMail({ to: ['guest@example.com'], subject: 's', html: 'h' });
  process.env.NOTIFY_TO = keep;
  ok('no provable recipient at all: nothing sent (fails closed, not open)', r4.reason === 'no_recipients' && sent.length === 0);

  ok('pickRecipients is the same function notify.js re-exports',
     (await import('../api/notify.js')).pickRecipients === pickRecipients);
}

console.log('\n_mail.js — delivery is fail-soft');
{
  reset(); resendMode = 'fail';
  let r, threw = false;
  try { r = await sendMail({ subject: 's', html: 'h' }); } catch { threw = true; }
  ok('Resend refusing: returns send_failed, does not throw', !threw && r.ok === false && r.reason === 'send_failed');

  reset(); resendMode = 'throw'; threw = false;
  try { r = await sendMail({ subject: 's', html: 'h' }); } catch { threw = true; }
  ok('network error: returns send_error, does not throw', !threw && r.ok === false && r.reason === 'send_error');

  reset();
  const keep = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  r = await sendMail({ subject: 's', html: 'h' });
  process.env.RESEND_API_KEY = keep;
  ok('unconfigured: not_configured, nothing sent', r.reason === 'not_configured' && sent.length === 0);
}

/* ---- 3. a real coffee booking -------------------------------------------- */
console.log('\ncoffee-book.js — emails the owners in-process, never the guest');
const BOOKING = {
  host: 'Logan', date: '2030-01-08', slot: '0730', shop: 'Mokas Coffee — Delano',
  name: 'Pat Guest', phone: '316-555-0100', email: 'pat.guest@example.com',
};
{
  reset();
  const res = mkRes(); await coffeeBook(mkReq(BOOKING), res);
  ok('the booking succeeds with no session', res.body && res.body.ok === true, JSON.stringify(res.body));
  ok('  without any HTTP call to /api/notify', notifyHttpCalls === 0);
  ok('  and exactly one email went out', sent.length === 1, 'sent ' + sent.length);
  const to = (sent[0] && sent[0].to) || [];
  ok('  to the owners only', JSON.stringify([...to].sort()) === JSON.stringify(['garrett@getproytech.com', 'logan@getproytech.com']), JSON.stringify(to));
  ok('  and NOT to the guest address from the form', !to.includes(BOOKING.email));
  ok('  carrying the coffee details, not a generic notice', /Coffee booked/.test(sent[0] && sent[0].subject) && /7:30–8:30 AM/.test(sent[0] && sent[0].html));
  ok('  with a readable date: "Tue, Jan 8 · 7:30–8:30 AM", not "2030-01-08"',
     /<b>When:<\/b> Tue, Jan 8 · 7:30–8:30 AM</.test(sent[0] && sent[0].html) && !/<b>When:<\/b> 2030-01-08/.test(sent[0] && sent[0].html),
     ((sent[0] && sent[0].html) || '').match(/When:<\/b>[^<]*/));
  const ev = calendarPosts[0] || {};
  ok('the calendar event is tagged with its host', ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.coffeeHost === 'Logan');
  ok('  and starts at 7:30 wall clock', ev.start && ev.start.dateTime === '2030-01-08T07:30:00', JSON.stringify(ev.start));

  reset(); resendMode = 'fail';
  const res2 = mkRes(); await coffeeBook(mkReq(BOOKING), res2);
  ok('Resend failing: the booking STILL succeeds', res2.body && res2.body.ok === true, JSON.stringify(res2.body));
  ok('  and the lead was still written', leadUpserts.length === 1);

  reset(); resendMode = 'throw';
  const res3 = mkRes(); await coffeeBook(mkReq(BOOKING), res3);
  ok('Resend unreachable: the booking STILL succeeds', res3.body && res3.body.ok === true, JSON.stringify(res3.body));

  const src = await fs.readFile(path.join(ROOT, 'api/coffee-book.js'), 'utf8');
  ok('coffee-book imports the helper', /import \{ sendMail \} from '\.\/_mail\.js'/.test(src));
  ok('  and makes no fetch to /api/notify', !/fetch\([^)]*\/api\/notify/.test(src) && !/['"`]\/api\/notify['"`]/.test(src));
  const call = src.slice(src.indexOf('sendMail({'), src.indexOf('})', src.indexOf('sendMail({')));
  ok('  and does not pass a `to` (the allowlist is the list)', call.length > 0 && !/\bto\s*:/.test(call), call);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
