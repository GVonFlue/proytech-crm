/* A SESSION IS NOT A CONSTRAINT ON THE RECIPIENT.

   api/notify.js and api/calendar-event.js both send mail on the owner's behalf
   — one through Resend from a verified domain, one as a Google Calendar invite
   from the connected account. Both took the recipient list off the request
   body.

   Adding guard({requireAuth}) to those two closes the anonymous hole and NOT
   the relay: it narrows "anyone on the internet can aim this" to "any signed-in
   rep can aim this", and the recipient's mail server cannot tell those apart.
   The domain reputation that gets burned is the same one either way.

   So this file tests the second half. Every case below runs as a VALID,
   SIGNED-IN session. If a test here fails, an authenticated rep can send mail
   to an address of their choosing.

   tests/apiauth.mjs proves the routes are guarded. This proves the guard is
   not the whole answer.                                                     */

/* env FIRST — _guard.js and the handlers read process.env at module scope, and
   ES imports are hoisted. Same trap as tests/guard.mjs. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'ProyTech CRM <crm@getproytech.com>';
process.env.NOTIFY_TO = 'garrett@getproytech.com';
process.env.APP_URL = 'https://crm.test';

const notify = (await import('../api/notify.js')).default;
const { pickRecipients, safeLink } = await import('../api/notify.js');
const { inviteList, sendUpdatesFor, MAX_ATTENDEES } = await import('../api/calendar-event.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };

/* ---- the world the handler talks to ------------------------------------- */
let sent = [];          // every message handed to Resend
let ownerRows = [{ email: 'logan@getproytech.com' }];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();

  // a real session, for any token containing "good"
  if (u.includes('/auth/v1/user')) {
    const tok = (opts.headers || {}).authorization || '';
    return /good/.test(tok) ? { ok: true, json: async () => ({ id: 'u1' }) } : { ok: false, json: async () => ({}) };
  }
  // rate-limit counters: always allow, never the thing under test here
  if (u.includes('api_hits')) return { ok: true, text: async () => '[]' };
  // the owner allowlist
  if (u.includes('crm_users')) return { ok: true, json: async () => ownerRows };
  // Resend
  if (u.includes('api.resend.com')) {
    sent.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ id: 'msg_1' }) };
  }
  return { ok: false, json: async () => ({}), text: async () => '' };
};

const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
const mkReq = (body, tok = 'good-rep-token') => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '1.2.3.4', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
  socket: { remoteAddress: '1.2.3.4' },
  body: body || {},
});
const call = async (body, tok) => { sent = []; const res = mkRes(); await notify(mkReq(body, tok), res); return res; };

const BASE = { kind: 'conversion', rep: 'A Rep', client: 'Acme' };

console.log('\nnotify.js — an anonymous caller is refused at all');
{
  const res = await call(BASE, '');
  ok('no token is a 401', res.code === 401, 'code ' + res.code);
  ok('  and nothing was sent', sent.length === 0);
}

console.log('\nnotify.js — a SIGNED-IN caller still cannot choose the recipient');
{
  const res = await call({ ...BASE, to: ['victim@example.com'] });
  ok('an off-list address sends nothing at all',
     res.body && res.body.ok === false && res.body.reason === 'no_recipients', JSON.stringify(res.body));
  ok('  and Resend was never called', sent.length === 0,
     'a message went out to ' + JSON.stringify(sent.map(m => m.to)));
}
{
  const res = await call({ ...BASE, to: ['victim@example.com', 'garrett@getproytech.com'] });
  ok('a mixed list keeps only the allowed address', sent.length === 1
     && JSON.stringify(sent[0].to) === JSON.stringify(['garrett@getproytech.com']),
     JSON.stringify(sent[0] && sent[0].to));
  ok('  the drop is reported as a count, not as addresses',
     res.body && res.body.rejected === 1 && !JSON.stringify(res.body).includes('victim'),
     JSON.stringify(res.body));
}
{
  /* the attack that survives a naive allowlist: casing and padding */
  const res = await call({ ...BASE, to: ['  VICTIM@Example.COM  '] });
  ok('case and whitespace do not smuggle an address through',
     sent.length === 0 && res.body.reason === 'no_recipients', JSON.stringify(sent));
}
{
  const res = await call(BASE);
  ok('no `to` at all falls back to the allowlist, not to nothing', sent.length === 1, JSON.stringify(res.body));
  ok('  which is NOTIFY_TO plus the owners on crm_users',
     sent[0].to.includes('garrett@getproytech.com') && sent[0].to.includes('logan@getproytech.com'),
     JSON.stringify(sent[0].to));
}
{
  /* crm_users is owner-managed (MIGRATION.sql users_manage → is_owner()), so a
     rep cannot add themselves to the list this way. If that read fails, the
     allowlist must shrink to NOTIFY_TO, never widen. */
  ownerRows = [];
  const res = await call(BASE);
  ok('with no owner emails on file it still sends to NOTIFY_TO',
     sent.length === 1 && JSON.stringify(sent[0].to) === JSON.stringify(['garrett@getproytech.com']),
     JSON.stringify(sent[0] && sent[0].to));
  ownerRows = [{ email: 'logan@getproytech.com' }];
  void res;
}
{
  const saved = process.env.NOTIFY_TO;
  process.env.NOTIFY_TO = '';
  ownerRows = [];
  const res = await call(BASE);
  ok('an install with NO provable recipient sends nowhere, rather than anywhere',
     sent.length === 0 && res.body.reason === 'no_recipients', JSON.stringify(res.body));
  process.env.NOTIFY_TO = saved;
  ownerRows = [{ email: 'logan@getproytech.com' }];
}

console.log('\nnotify.js — the link in that mail cannot be aimed either');
{
  await call({ ...BASE, link: 'https://phishing.example/login' });
  ok('an off-origin link is replaced with the app URL',
     !sent[0].html.includes('phishing.example') && sent[0].html.includes('https://crm.test'),
     sent[0].html);
}
{
  await call({ ...BASE, link: 'https://crm.test/leads/42' });
  ok('a real in-app link survives', sent[0].html.includes('https://crm.test/leads/42'), sent[0].html);
}
ok('safeLink rejects a prefix that only LOOKS like the origin',
   safeLink('https://crm.test.evil.com/x', 'https://crm.test') === 'https://crm.test',
   safeLink('https://crm.test.evil.com/x', 'https://crm.test'));

console.log('\nnotify.js — pickRecipients on its own');
{
  const a = ['owner@x.com'];
  ok('empty ask means the whole allowlist', JSON.stringify(pickRecipients([], a).to) === JSON.stringify(a));
  ok('an ask can only ever narrow', pickRecipients(['a@b.com', 'owner@x.com'], a).to.length === 1);
  ok('  and what it loses is reported', pickRecipients(['a@b.com'], a).dropped.length === 1);
  ok('a non-array ask is not trusted either', JSON.stringify(pickRecipients('owner@x.com', a).to) === JSON.stringify(a));
}

console.log('\ncalendar-event.js — the invite list is capped, not open');
{
  ok('the booking screen sends one address, and one is fine',
     inviteList(['lead@example.com']).attendees.length === 1 && !inviteList(['lead@example.com']).tooMany);
  const many = Array.from({ length: MAX_ATTENDEES + 1 }, (_, i) => `p${i}@example.com`);
  ok(`${MAX_ATTENDEES + 1} addresses is refused, not truncated`, inviteList(many).tooMany === true);
  ok('  and the cap is well below a mailing list', MAX_ATTENDEES <= 10, String(MAX_ATTENDEES));
  ok('duplicates collapse to one invitee',
     inviteList(['A@x.com', 'a@x.com', ' a@x.com ']).attendees.length === 1,
     JSON.stringify(inviteList(['A@x.com', 'a@x.com', ' a@x.com ']).attendees));
  ok('junk is dropped rather than handed to Google',
     inviteList(['not-an-email', '', null, 'ok@x.com']).attendees.length === 1);
}

console.log('\ncalendar-event.js — an event with no guests notifies nobody');
{
  ok('no attendees means sendUpdates=none', sendUpdatesFor([]) === 'none');
  ok('attendees means sendUpdates=all', sendUpdatesFor(['a@x.com']) === 'all');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
