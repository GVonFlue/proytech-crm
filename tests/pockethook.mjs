/* POCKET WEBHOOK — asserts on the STATUS CODE and WHAT REACHES THE DATABASE.

   This is the only endpoint in the CRM with no user session, so the signature
   is the entire authentication and these are the tests that stand in for it.
   RLS proves nothing here: the webhook writes with the service key and bypasses
   it by design (VERIFY-RLS.md §7 says so in those words).

   The status codes matter as much as the writes, because Pocket ACTS on them.
   200 means never retry. 401 means retry three times then drop — which is what
   we want for a forgery and a disaster for a real recording. So every assertion
   below checks the code, not just whether a row appeared.

   No DOM. Runs as `node tests/pockethook.mjs`.                              */
import { createHmac } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : '')); } };

const SECRET = 'whsec_test_secret';
const SUPA   = 'https://test.supabase.co';

process.env.SUPABASE_URL         = SUPA;
process.env.SUPABASE_SERVICE_KEY = 'service-key';

/* ------------------------------------------------ a small PostgREST stub */

let DB, HITS;
const reset = () => { DB = new Map(); HITS = []; };
reset();

const qparams = url => {
  const q = url.split('?')[1] || '';
  const out = {};
  for (const kv of q.split('&')) { if (!kv) continue; const [k, v] = kv.split('='); out[decodeURIComponent(k)] = decodeURIComponent(v || ''); }
  return out;
};
const eqval = v => (v && v.startsWith('eq.') ? v.slice(3) : null);

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  const reply = (status, rows) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(rows) });

  if (u.includes('/rest/v1/api_hits')) {
    if (method === 'GET')    return reply(200, HITS.filter(h => h.bucket === eqval(qparams(u).bucket)));
    if (method === 'POST')   { HITS.push(body); return reply(201, []); }
    if (method === 'DELETE') { HITS = []; return reply(200, []); }
  }

  if (u.includes('/rest/v1/pocket_recordings')) {
    const p = qparams(u);
    const id = eqval(p.id);
    if (method === 'GET') { const r = DB.get(id); return reply(200, r ? [r] : []); }
    if (method === 'POST') {
      if (DB.has(body.id)) return reply(409, { message: 'duplicate key' });
      DB.set(body.id, { ...body });
      return reply(201, [DB.get(body.id)]);
    }
    if (method === 'PATCH') {
      const row = DB.get(id);
      if (!row) return reply(200, []);
      // optimistic-concurrency filter, exactly as PostgREST would apply it
      const want = eqval(p.updated_at);
      if (want && row.updated_at !== want) return reply(200, []);
      DB.set(id, { ...row, ...body });
      return reply(200, [DB.get(id)]);
    }
  }
  return reply(404, {});
};

/* ------------------------------------------------------------- fixtures */

const sign = (raw, ts, secret = SECRET) => createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');

const makeReq = (raw, { ts = Date.now(), sig, method = 'POST', secret = SECRET, headers = {} } = {}) => ({
  method,
  headers: {
    'x-heypocket-timestamp': String(ts),
    'x-heypocket-signature': sig !== undefined ? sig : sign(raw, ts, secret),
    'content-type': 'application/json',
    'x-forwarded-for': '203.0.113.9',
    ...headers,
  },
  async *[Symbol.asyncIterator]() { yield Buffer.from(raw, 'utf8'); },
});

const makeRes = () => {
  const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; };
  r.json = o => { r.body = o; return r; };
  r.end = () => r;
  r.setHeader = () => {};
  return r;
};

const TRANSCRIPT_SENTINEL = 'SENTINEL-PAY-SPLIT-forty-percent';

const delivery = (over = {}) => JSON.stringify({
  event: 'summary.completed',
  timestamp: new Date().toISOString(),
  user: { id: 'u_pocket', email: 'garrett@getproytech.com' },
  recording: { id: 'rec_1', title: 'Sunday with Logan', description: 'weekly', duration: 2400, language: 'en', createdAt: '2026-08-17T15:00:00.000Z' },
  summarizations: { summary: 'Pricing and the Alvarez account.', actionItems: [{ title: 'Send the quote' }] },
  transcript: [
    { speaker: 'Garrett', text: 'So about Alvarez.', start: 0, end: 4 },
    { speaker: 'Logan', text: TRANSCRIPT_SENTINEL, start: 4, end: 9 },
  ],
  ...over,
});

const call = async (handler, raw, opts) => { const res = makeRes(); await handler(makeReq(raw, opts), res); return res; };

/* Fresh module per env change — SECRET/SUPA are module-level consts read at
   import, so a query string is the only way to get a second evaluation. */
let v = 0;
const load = async () => (await import('../api/pocket-hook.js?v=' + (++v))).default;

/* ============================================================ no secret */

console.log('\nwith no signing secret it refuses everything');
{
  delete process.env.POCKET_WEBHOOK_SECRET;
  reset();
  const h = await load();
  const res = await call(h, delivery());
  ok('returns 503, so Pocket retries rather than giving up', res.code === 503, res.code);
  ok('stored nothing', DB.size === 0);
}

process.env.POCKET_WEBHOOK_SECRET = SECRET;
const handler = await load();

/* ========================================================== the refusals */

console.log('\na forged or replayed delivery stores nothing');
{
  reset();
  let res = await call(handler, delivery(), { sig: 'deadbeef' });
  ok('wrong signature is 401', res.code === 401, res.code);
  ok('  and stored nothing', DB.size === 0);

  reset();
  res = await call(handler, delivery(), { sig: undefined, headers: { 'x-heypocket-signature': '' } });
  ok('missing signature is 401', res.code === 401, res.code);
  ok('  and stored nothing', DB.size === 0);

  reset();
  const raw = delivery();
  const old = Date.now() - 10 * 60 * 1000;
  res = await call(handler, raw, { ts: old, sig: sign(raw, old) });
  ok('a correctly signed but 10-minute-old delivery is 401', res.code === 401, res.code);
  ok('  and stored nothing — this is the replay window', DB.size === 0);

  reset();
  const future = Date.now() + 10 * 60 * 1000;
  res = await call(handler, raw, { ts: future, sig: sign(raw, future) });
  ok('a delivery from the future is 401', res.code === 401, res.code);

  reset();
  res = await call(handler, delivery(), { secret: 'whsec_the_wrong_secret' });
  ok('signed with the wrong secret is 401', res.code === 401, res.code);
  ok('  and stored nothing', DB.size === 0);

  /* The signature covers the RAW BYTES. Signing a re-serialised copy is what a
     handler that parsed before verifying would effectively be doing. */
  reset();
  const rawA = delivery();
  const rawB = JSON.stringify(JSON.parse(rawA));
  const tsx = Date.now();
  res = await call(handler, rawA, { ts: tsx, sig: sign(rawB + ' ', tsx) });
  ok('a signature over anything but the exact bytes is 401', res.code === 401, res.code);
}

console.log('\nmethod and size');
{
  reset();
  const res = await call(handler, delivery(), { method: 'GET' });
  ok('GET is 405, not 401 — a probe should not look like a forgery', res.code === 405, res.code);

  reset();
  const huge = JSON.stringify({ event: 'summary.completed', recording: { id: 'rec_big' }, pad: 'x'.repeat(5_200_000) });
  const t = Date.now();
  const res2 = await call(handler, huge, { ts: t, sig: sign(huge, t) });
  ok('a body past the raw ceiling is 413', res2.code === 413, res2.code);
  ok('  and stored nothing', DB.size === 0);
}

/* ============================================================== storing */

console.log('\na valid delivery is stored once, and again is still once');
{
  reset();
  const raw = delivery();
  const t = Date.now();
  const res = await call(handler, raw, { ts: t, sig: sign(raw, t) });
  ok('200', res.code === 200, JSON.stringify(res.body));
  ok('one row', DB.size === 1);

  const row = DB.get('rec_1');
  ok('keyed on Pocket\'s recording id', !!row);
  ok('status starts open', row.status === 'open');
  ok('the title is there', row.data.title === 'Sunday with Logan');
  ok('Pocket\'s summary is there', /Alvarez/.test(row.data.summary));
  ok('Pocket\'s action items are there', row.data.actionItems.length === 1);
  ok('the transcript was flattened with speakers', /Garrett: So about Alvarez\./.test(row.data.transcript));
  ok('the segments survive for the locator', row.data.segments.length === 2 && row.data.segments[0].end === 4);
  ok('the id was NOT guessed', !row.data.idGuessed);

  /* at-least-once: the identical delivery arrives again */
  const res2 = await call(handler, raw, { ts: t, sig: sign(raw, t) });
  ok('the same delivery twice is 200', res2.code === 200);
  ok('  and there is still exactly one row', DB.size === 1, DB.size);
  ok('  and it recorded both deliveries', DB.get('rec_1').data.events.length === 2);
}

console.log('\ntwo different events about one recording merge, and neither blanks the other');
{
  reset();
  /* transcription.completed first: transcript, no summary */
  const a = JSON.stringify({
    event: 'transcription.completed',
    timestamp: new Date().toISOString(),
    user: { id: 'u_pocket' },
    recording: { id: 'rec_2', title: 'Sunday with Logan', duration: 2400 },
    transcript: [{ speaker: 'Garrett', text: 'The whole transcript.' }],
  });
  let t = Date.now();
  await call(handler, a, { ts: t, sig: sign(a, t) });
  ok('transcript stored', /The whole transcript\./.test(DB.get('rec_2').data.transcript));
  ok('no summary yet', !DB.get('rec_2').data.summary);

  /* summary.completed second: summary, and NO transcript field at all */
  const b = JSON.stringify({
    event: 'summary.completed',
    timestamp: new Date().toISOString(),
    user: { id: 'u_pocket' },
    recording: { id: 'rec_2', title: 'Sunday with Logan' },
    summarizations: { summary: 'Pricing and Alvarez.', actionItems: [{ title: 'Send the quote' }] },
  });
  t = Date.now();
  await call(handler, b, { ts: t, sig: sign(b, t) });

  const row = DB.get('rec_2');
  ok('still one row', DB.size === 1);
  ok('the summary arrived', /Pricing and Alvarez/.test(row.data.summary));
  ok('THE TRANSCRIPT WAS NOT BLANKED', /The whole transcript\./.test(row.data.transcript), row.data.transcript);
  ok('the duration from the first delivery survived', row.data.duration === 2400, row.data.duration);
  ok('both events are recorded', row.data.events.length === 2);
}

console.log('\nan edited transcript replaces, because it arrives non-empty');
{
  const c = JSON.stringify({
    event: 'transcript.edited',
    timestamp: new Date().toISOString(),
    recording: { id: 'rec_2' },
    transcript: [{ speaker: 'Garrett', text: 'The corrected transcript.' }],
  });
  const t = Date.now();
  await call(handler, c, { ts: t, sig: sign(c, t) });
  const row = DB.get('rec_2');
  ok('the transcript is the corrected one', /corrected/.test(row.data.transcript));
  ok('the summary is still there', /Pricing and Alvarez/.test(row.data.summary));
}

console.log('\nan unknown event still stores, rather than being dropped by a list written today');
{
  const d = JSON.stringify({
    event: 'something.pocket.added.later',
    timestamp: new Date().toISOString(),
    recording: { id: 'rec_3', title: 'New event type' },
  });
  const t = Date.now();
  const res = await call(handler, d, { ts: t, sig: sign(d, t) });
  ok('200', res.code === 200);
  ok('stored', !!DB.get('rec_3'));
  ok('the event name is recorded as-is', DB.get('rec_3').data.events[0].event === 'something.pocket.added.later');
}

console.log('\nrecording.deleted marks, and does not destroy your only copy');
{
  const before = DB.get('rec_2').data.transcript;
  const e = JSON.stringify({ event: 'recording.deleted', timestamp: new Date().toISOString(), recording: { id: 'rec_2' } });
  const t = Date.now();
  const res = await call(handler, e, { ts: t, sig: sign(e, t) });
  ok('200', res.code === 200);
  const row = DB.get('rec_2');
  ok('THE ROW STILL EXISTS', !!row);
  ok('the transcript is untouched', row.data.transcript === before);
  ok('it is flagged as deleted in Pocket', row.data.deletedInPocket === true);
  ok('an open recording leaves the queue', row.status === 'dismissed', row.status);

  const f = JSON.stringify({ event: 'recording.deleted', timestamp: new Date().toISOString(), recording: { id: 'rec_nope' } });
  const t2 = Date.now();
  const res2 = await call(handler, f, { ts: t2, sig: sign(f, t2) });
  ok('deleting one we never had is 200, not a crash', res2.code === 200, res2.code);
}

console.log('\na recording you already finished with is not reopened by a redelivery');
{
  reset();
  const raw = delivery({ recording: { id: 'rec_done', title: 'Old one' } });
  let t = Date.now();
  await call(handler, raw, { ts: t, sig: sign(raw, t) });
  DB.get('rec_done').status = 'done';                 // the owner marked it done
  const raw2 = delivery({ event: 'summary.updated', recording: { id: 'rec_done', title: 'Old one' } });
  t = Date.now();
  await call(handler, raw2, { ts: t, sig: sign(raw2, t) });
  ok('status is still done', DB.get('rec_done').status === 'done', DB.get('rec_done').status);
  ok('but the content still merged', DB.get('rec_done').data.events.length === 2);
}

/* =========================================================== the id gap */

console.log('\nthe recording id: the documented gap, and the fallback');
{
  reset();
  const alt = JSON.stringify({ event: 'summary.completed', timestamp: new Date().toISOString(),
    recording: { recordingId: 'rec_alt', title: 'Alt spelling' } });
  let t = Date.now();
  await call(handler, alt, { ts: t, sig: sign(alt, t) });
  ok('recording.recordingId is found', !!DB.get('rec_alt'));

  reset();
  const noid = JSON.stringify({ event: 'summary.completed', timestamp: new Date().toISOString(),
    user: { id: 'u_pocket' }, recording: { title: 'No id at all', createdAt: '2026-08-17T15:00:00.000Z' } });
  t = Date.now();
  const res = await call(handler, noid, { ts: t, sig: sign(noid, t) });
  ok('a payload with no id anywhere is still stored', res.code === 200 && DB.size === 1, res.code);
  const key = [...DB.keys()][0];
  ok('  under a content hash', key.startsWith('sha:'), key);
  ok('  and flagged as a guess, so the UI can say so', DB.get(key).data.idGuessed === true);

  /* the fallback must be STABLE or at-least-once delivery duplicates forever */
  t = Date.now();
  await call(handler, noid, { ts: t, sig: sign(noid, t) });
  ok('  the same payload hashes to the same row, not a second one', DB.size === 1, DB.size);
}

console.log('\na transcript in a shape we do not recognise is kept, not dropped');
{
  reset();
  const odd = JSON.stringify({ event: 'transcription.completed', timestamp: new Date().toISOString(),
    recording: { id: 'rec_odd' }, transcript: [{ who: 'Garrett', words: 'shape we have never seen' }] });
  const t = Date.now();
  await call(handler, odd, { ts: t, sig: sign(odd, t) });
  const row = DB.get('rec_odd');
  ok('the row exists', !!row);
  ok('the content survived even unparsed', /shape we have never seen/.test(row.data.transcript));
  ok('and it is flagged for a human to look at', row.data.unknownTranscriptShape === true);
}

console.log('\nunparseable JSON with a valid signature is accepted and ignored, never retried');
{
  reset();
  const junk = 'not json at all';
  const t = Date.now();
  const res = await call(handler, junk, { ts: t, sig: sign(junk, t) });
  ok('200, so Pocket does not retry something that will never parse', res.code === 200, res.code);
  ok('stored nothing', DB.size === 0);
}

console.log('\ntwo deliveries landing at once do not lose one another');
{
  /* The read-merge-write is guarded by a conditional PATCH on updated_at. This
     simulates the race it exists for: something else writes the row between our
     GET and our PATCH, so the first attempt matches zero rows and must retry
     rather than silently doing nothing. */
  reset();
  const seed = delivery({ event: 'transcription.completed', recording: { id: 'rec_race', title: 'Race' } });
  let t = Date.now();
  await call(handler, seed, { ts: t, sig: sign(seed, t) });
  ok('seeded', !!DB.get('rec_race'));

  const realFetch = globalThis.fetch;
  let raced = 0;
  globalThis.fetch = async (u, o) => {
    const res = await realFetch(u, o);
    // after the handler reads the row, a competitor bumps it exactly once
    if (String(u).includes('pocket_recordings') && (!o || (o.method || 'GET') === 'GET') && raced === 0) {
      raced = 1;
      const row = DB.get('rec_race');
      if (row) DB.set('rec_race', { ...row, updated_at: new Date(Date.now() + 1).toISOString() });
    }
    return res;
  };
  const second = JSON.stringify({ event: 'summary.completed', timestamp: new Date().toISOString(),
    recording: { id: 'rec_race' }, summarizations: { summary: 'Arrived despite the race.' } });
  t = Date.now();
  const res = await call(handler, second, { ts: t, sig: sign(second, t) });
  globalThis.fetch = realFetch;

  ok('200', res.code === 200, res.code);
  ok('the competing write was detected and retried', raced === 1);
  ok('the summary landed anyway', /Arrived despite the race/.test(DB.get('rec_race').data.summary),
     JSON.stringify(DB.get('rec_race').data.summary));
  ok('and the transcript the first delivery brought is still there',
     /SENTINEL|Garrett/.test(DB.get('rec_race').data.transcript));
}

console.log('\nwhen the race never settles it writes anyway — a lost FIELD beats a lost RECORDING');
{
  reset();
  const seed = delivery({ event: 'transcription.completed', recording: { id: 'rec_storm', title: 'Storm' } });
  let t = Date.now();
  await call(handler, seed, { ts: t, sig: sign(seed, t) });

  const realFetch = globalThis.fetch;
  let bumps = 0;
  globalThis.fetch = async (u, o) => {
    const res = await realFetch(u, o);
    if (String(u).includes('pocket_recordings') && (!o || (o.method || 'GET') === 'GET')) {
      bumps++;                                   // a competitor on EVERY read
      const row = DB.get('rec_storm');
      if (row) DB.set('rec_storm', { ...row, updated_at: new Date(Date.now() + bumps).toISOString() });
    }
    return res;
  };
  const second = JSON.stringify({ event: 'summary.completed', timestamp: new Date().toISOString(),
    recording: { id: 'rec_storm' }, summarizations: { summary: 'Got through on the last attempt.' } });
  t = Date.now();
  const res = await call(handler, second, { ts: t, sig: sign(second, t) });
  globalThis.fetch = realFetch;

  ok('200 rather than a 500 that would drop the delivery', res.code === 200, res.code);
  ok('it retried the documented number of times', bumps === 4, 'reads=' + bumps);
  ok('the delivery was stored on the unconditional last attempt',
     /Got through on the last attempt/.test(DB.get('rec_storm').data.summary));
}

console.log('\nthe database failing is a 500, so Pocket retries — the one case retrying helps');
{
  reset();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).includes('pocket_recordings')
    ? { ok: false, status: 500, text: async () => '' }
    : realFetch(u, o));
  const raw = delivery();
  const t = Date.now();
  const res = await call(handler, raw, { ts: t, sig: sign(raw, t) });
  globalThis.fetch = realFetch;
  ok('500', res.code === 500, res.code);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
