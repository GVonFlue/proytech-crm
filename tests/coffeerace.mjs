/* THE /api/coffee-race ROUTE, CALLED AS A ROUTE.
   ============================================================================

   tests/coffee.mjs proved countRace() and shipped green, while every request to
   the route in production was a 405. The handler required GET and guard()
   required POST, so no request could satisfy both. Testing the counting
   function did not test the route. This file runs the real handler against a
   stubbed Supabase.

   The leads below carry sentinel names, emails and phones. The scoreboard is
   public, so the assertion that matters most is that none of them come back
   out.                                                                       */

/* env FIRST: the modules read process.env at module scope, and ES imports are
   hoisted. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.CALENDAR_TZ = 'America/Chicago';
delete process.env.RACE_START; delete process.env.RACE_END; delete process.env.RACE_GOAL;

const handler = (await import('../api/coffee-race.js')).default;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + x : ''))); };

const SENTINELS = ['SENTINEL-NAME-Pat', 'sentinel.guest@example.com', '316-555-0199', 'SENTINEL-COMPANY', 'SENTINEL-NOTE'];
const leadRow = (id, meetings) => ({
  data: {
    id, name: SENTINELS[0], email: SENTINELS[1], phone: SENTINELS[2], company: SENTINELS[3],
    dealValue: 9000, activities: [{ type: 'Note', text: SENTINELS[4] }], meetings,
  },
});
const ROWS = [
  leadRow('a', [
    { mtype: 'Coffee', status: 'held', host: 'Garrett', start: '2026-10-05T07:30:00', title: 'Coffee with ' + SENTINELS[0] },
    { mtype: 'Coffee', status: 'scheduled', host: 'Garrett', start: '2026-10-06T09:00:00' },
  ]),
  leadRow('b', [
    { mtype: 'Coffee', status: 'held', host: 'Logan', start: '2026-10-07T09:00:00' },
    { mtype: 'Coffee', status: 'held', host: 'Logan', start: '2026-10-11T00:30:00.000Z' },   // 7:30 PM Sat Oct 10 Central
    { mtype: 'Discovery Call', status: 'held', host: 'Logan', start: '2026-10-08T10:00:00' },
  ]),
];

let leadReads = 0, leadsMode = 'ok';
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (body, status = 200) => ({
    ok: status < 300, status, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body, text: async () => JSON.stringify(body),
  });
  if (u.includes('api_hits')) return { ok: true, status: 200, text: async () => '[]', json: async () => [] };
  if (u.includes('/rest/v1/leads')) {
    leadReads++;
    return leadsMode === 'error' ? json({ message: 'boom', code: 'XX000' }, 500) : json(ROWS);
  }
  return json({}, 404);
};

const mkRes = () => { const r = { code: 0, body: null, headers: {}, ended: false };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.end = () => { r.ended = true; return r; }; return r; };
const mkReq = (method, ip = '7.7.7.7') => ({
  method, headers: { 'x-forwarded-for': ip, origin: 'https://www.getproytech.com' },
  socket: { remoteAddress: ip }, body: undefined,
});
const call = async (method, ip) => { const res = mkRes(); await handler(mkReq(method, ip), res); return res; };

console.log('\nGET — the scoreboard');
{
  leadReads = 0;
  const res = await call('GET');
  ok('GET is 200 and ok:true', res.code === 200 && res.body && res.body.ok === true, res.code + ' ' + JSON.stringify(res.body));
  const b = res.body || {};
  ok('counts are {Garrett, Logan} and nothing else',
     JSON.stringify(Object.keys(b.counts || {}).sort()) === JSON.stringify(['Garrett', 'Logan']), JSON.stringify(b.counts));
  ok('  with the right numbers (held coffees only, Saturday evening UTC included)',
     b.counts && b.counts.Garrett === 1 && b.counts.Logan === 2, JSON.stringify(b.counts));
  ok('the body has only the scoreboard fields',
     JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['counts', 'end', 'goal', 'ok', 'start', 'updated']), JSON.stringify(Object.keys(b)));
  const wire = JSON.stringify(b);
  ok('no lead field leaves the server', SENTINELS.every(s => !wire.includes(s)) && !wire.includes('9000'), wire);
  ok('the race dates and goal are the defaults', b.start === '2026-10-03' && b.end === '2026-10-10' && b.goal === 20);
  ok('it read the leads once', leadReads === 1, 'reads ' + leadReads);
  ok('the 60-second CDN cache header is set', /s-maxage=60/.test(res.headers['cache-control'] || ''), res.headers['cache-control']);
  ok('CORS is locked to getproytech.com', res.headers['access-control-allow-origin'] === 'https://www.getproytech.com');
}

console.log('\nother methods');
{
  leadReads = 0;
  const res = await call('POST', '7.7.7.8');
  ok('POST is rejected with 405', res.code === 405, 'code ' + res.code);
  ok('  and the leads were never read', leadReads === 0);

  const res2 = await call('OPTIONS', '7.7.7.9');
  ok('OPTIONS is 204', res2.code === 204 && res2.ended, 'code ' + res2.code);
  ok('  and the leads were never read', leadReads === 0);

  const res3 = await call('DELETE', '7.7.7.10');
  ok('DELETE is rejected with 405', res3.code === 405, 'code ' + res3.code);
}

console.log('\na failed read');
{
  leadsMode = 'error';
  const res = await call('GET', '7.7.7.11');
  leadsMode = 'ok';
  ok('a database error is ok:false, not a plausible zero',
     res.body && res.body.ok === false && res.body.error === 'read_failed' && !('counts' in res.body), JSON.stringify(res.body));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
