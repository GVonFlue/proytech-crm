/* POCKET BACKFILL — the 403, and the reasons the rest could be cut.

   This is the first endpoint where a BROWSER can cause a service-key write, so
   the role check is the most important test in the file: a valid session is not
   an owner, and the service key bypasses RLS by design.

   Everything else here is about idempotency, because idempotency is what let
   the date picker, the pagination and the select-and-pick list be dropped. If
   re-importing were not safe, all three would have to come back.

   No DOM. `node tests/pocketbackfill.mjs`.                                   */

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 220) : '')); } };

const SUPA = 'https://test.supabase.co';
process.env.SUPABASE_URL = SUPA;
process.env.SUPABASE_SERVICE_KEY = 'service-key';
/* The package asks whether the caller's role is in ADMIN_ROLES rather than
   asking for 'owner' by name. Unset, it correctly refuses everybody — which
   here would look like a broken route instead of an unconfigured install. */
process.env.ADMIN_ROLES = 'owner';
process.env.POCKET_API_KEY = 'pk_test';
/* Set BEFORE any import of pocket-hook.js — it reads the secret at module
   scope, so setting it later gives a module that refuses everything. */
process.env.POCKET_WEBHOOK_SECRET = 'whsec';

/* -------------------------------- stubs: PostgREST, core_whoami, Pocket API */

let DB, ROLE, POCKET_LIST, POCKET_DETAIL, POCKET_STATUS, CALLS;
const reset = () => {
  DB = new Map(); ROLE = 'owner'; POCKET_STATUS = 200; CALLS = [];
  POCKET_LIST = [{ recording: { id: 'rec_sunday', title: 'Sunday with Logan', createdAt: '2026-08-17T15:00:00.000Z', duration: 2400, language: 'en' } }];
  POCKET_DETAIL = {
    recording: { id: 'rec_sunday', title: 'Sunday with Logan', description: 'weekly', createdAt: '2026-08-17T15:00:00.000Z', duration: 2400, language: 'en' },
    summarizations: { summary: 'Pricing and the Alvarez account.', actionItems: [{ title: 'Send the quote' }] },
    transcript: [{ speaker: 'Garrett', text: 'So about Alvarez.' }, { speaker: 'Logan', text: TRANSCRIPT_SENTINEL }],
  };
};
const TRANSCRIPT_SENTINEL = 'SENTINEL-PAY-SPLIT-forty-percent';

const qparams = url => { const q = url.split('?')[1] || ''; const o = {};
  for (const kv of q.split('&')) { if (!kv) continue; const [k, v] = kv.split('='); o[decodeURIComponent(k)] = decodeURIComponent(v || ''); } return o; };
const eqval = v => (v && v.startsWith('eq.') ? v.slice(3) : null);

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  CALLS.push({ u, method });
  const reply = (status, out) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(out), json: async () => out });

  if (u.includes('/rest/v1/rpc/core_whoami')) return reply(200, [{ role: ROLE, active: true, setup: true, name: 'Garrett' }]);
  if (u.includes('/rest/v1/api_hits')) { if (method === 'GET') return reply(200, []); return reply(201, []); }
  if (u.includes('/auth/v1/user')) return reply(200, { id: 'u_owner' });

  if (u.includes('/rest/v1/pocket_recordings')) {
    const p = qparams(u), id = eqval(p.id);
    if (method === 'GET') { const r = DB.get(id); return reply(200, r ? [r] : []); }
    if (method === 'POST') { if (DB.has(body.id)) return reply(409, {}); DB.set(body.id, { ...body }); return reply(201, [DB.get(body.id)]); }
    if (method === 'PATCH') {
      const row = DB.get(id); if (!row) return reply(200, []);
      const want = eqval(p.updated_at);
      if (want && row.updated_at !== want) return reply(200, []);
      DB.set(id, { ...row, ...body }); return reply(200, [DB.get(id)]);
    }
  }

  if (u.includes('public.heypocketai.com')) {
    if (POCKET_STATUS !== 200) return reply(POCKET_STATUS, { error: 'nope' });
    if (/\/public\/recordings\?/.test(u)) return reply(200, { success: true, data: POCKET_LIST, pagination: { page: 1, total: POCKET_LIST.length, has_more: false } });
    return reply(200, { success: true, data: POCKET_DETAIL });
  }
  return reply(404, {});
};

const handler = (await import('../api/pocket-backfill.js')).default;
const makeRes = () => { const r = { code: 0, body: null };
  r.status = c => { r.code = c; return r; }; r.json = o => { r.body = o; return r; }; r.end = () => r; r.setHeader = () => {}; return r; };
const call = async (body, { token = 'tok' } = {}) => {
  const res = makeRes();
  await handler({ method: 'POST', headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'x-forwarded-for': '203.0.113.9' }, body }, res);
  return res;
};

/* ================================================== the check that matters */

console.log('\nonly an owner can import — a valid session is not enough');
{
  reset(); ROLE = 'rep';
  let res = await call({ action: 'import', id: 'rec_sunday' });
  ok('a rep is 403', res.code === 403, res.code);
  ok('and NOTHING was written', DB.size === 0);
  ok('  the service key never touched pocket_recordings',
     !CALLS.some(c => c.u.includes('pocket_recordings')), JSON.stringify(CALLS.filter(c => c.u.includes('pocket_recordings'))));

  reset(); ROLE = 'rep';
  res = await call({ action: 'list' });
  ok('a rep cannot even list', res.code === 403, res.code);
  ok('  and Pocket was never called on their behalf', !CALLS.some(c => c.u.includes('heypocketai')));

  reset(); ROLE = 'none';
  res = await call({ action: 'import', id: 'rec_sunday' });
  ok('a signed-in stranger with no crm_users row is 403', res.code === 403);

  reset();
  res = await call({ action: 'list' }, { token: '' });
  ok('no token at all is 401 from the guard', res.code === 401, res.code);
  ok('  and nothing was written', DB.size === 0);
}

console.log('\nthe role is asked of POSTGRES, not taken from the request');
{
  reset(); ROLE = 'rep';
  const res = await call({ action: 'import', id: 'rec_sunday', role: 'owner', who: { role: 'owner' } });
  ok('claiming to be an owner in the body changes nothing', res.code === 403, res.code);
  ok('  core_whoami was actually called', CALLS.some(c => c.u.includes('core_whoami')));
}

console.log('\nfailing to PROVE ownership is not permission');
{
  reset();
  const real = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).includes('core_whoami') ? { ok: false, status: 500, json: async () => ({}), text: async () => '' } : real(u, o));
  const res = await call({ action: 'import', id: 'rec_sunday' });
  globalThis.fetch = real;
  ok('the check failing closes the door rather than opening it', res.code === 403, res.code);
  ok('  and nothing was written', DB.size === 0);
}

/* ============================================================ list, import */

console.log('\nlist writes nothing, ever');
{
  reset();
  const res = await call({ action: 'list' });
  ok('200', res.code === 200, JSON.stringify(res.body).slice(0, 120));
  ok('the recording is listed', res.body.recordings.length === 1 && res.body.recordings[0].id === 'rec_sunday');
  ok('with what the screen needs', res.body.recordings[0].title === 'Sunday with Logan' && res.body.recordings[0].duration === 2400);
  ok('hasMore is reported so a subset can never look like everything', res.body.hasMore === false);
  ok('NOTHING was written', DB.size === 0);
  ok('  no write of any kind reached the table', !CALLS.some(c => c.u.includes('pocket_recordings') && c.method !== 'GET'));
  ok('the list never carries the transcript', !JSON.stringify(res.body).includes(TRANSCRIPT_SENTINEL));
}

console.log('\nimport stores one recording, with its transcript');
{
  reset();
  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('200', res.code === 200, JSON.stringify(res.body));
  ok('created', res.body.created === true);
  ok('one row', DB.size === 1);
  const row = DB.get('rec_sunday');
  ok('keyed on Pocket\'s id', !!row);
  ok('status is open, so it lands in Your day', row.status === 'open', row.status);
  ok('the title came through', row.data.title === 'Sunday with Logan');
  ok('Pocket\'s summary came through', /Alvarez/.test(row.data.summary));
  ok('the transcript came through', row.data.transcript.includes(TRANSCRIPT_SENTINEL));
  ok('flagged as a backfill, so provenance is visible', !!row.data.importedAt);
  ok('the event is recorded as a backfill', row.data.events[0].event === 'backfill');
}

/* ================================ idempotency — what let everything else go */

console.log('\nimporting something the webhook already delivered makes ONE row, not two');
{
  reset();
  /* the webhook got there first */
  const hook = (await import('../api/pocket-hook.js')).default;
  const { createHmac } = await import('node:crypto');
  const raw = JSON.stringify({ event: 'summary.completed', timestamp: new Date().toISOString(),
    recording: { id: 'rec_sunday', title: 'Sunday with Logan', duration: 2400 },
    summarizations: { summary: 'From the webhook.' },
    transcript: [{ speaker: 'Garrett', text: 'From the webhook transcript.' }] });
  const ts = Date.now();
  const hres = makeRes();
  await hook({ method: 'POST', headers: {
    'x-heypocket-timestamp': String(ts),
    'x-heypocket-signature': createHmac('sha256', 'whsec').update(`${ts}.${raw}`).digest('hex'),
    'x-forwarded-for': '203.0.113.9',
  }, async *[Symbol.asyncIterator]() { yield Buffer.from(raw); } }, hres);
  ok('the webhook stored it', DB.size === 1 && hres.code === 200, hres.code);

  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('the backfill returns 200', res.code === 200);
  ok('STILL ONE ROW', DB.size === 1, DB.size);
  ok('  and it reports that it did not create one', res.body.created === false);
  const row = DB.get('rec_sunday');
  ok('both arrivals are recorded', row.data.events.length === 2 &&
     row.data.events.map(e => e.event).join(',') === 'summary.completed,backfill', JSON.stringify(row.data.events));
  ok('the backfill refreshed the summary', /Alvarez/.test(row.data.summary), row.data.summary);
}

console.log('\nthe transcript is found wherever Pocket actually puts it');
{
  /* Pocket's docs have never named the fields inside `data`, and a direct
     rec.transcript read came back EMPTY against the real API — titles and
     durations mapped, the transcript did not. So the finder searches the
     plausible names at the plausible depths, and reports the path it used. */
  const shapes = [
    ['webhook shape (known good)',     { recording:{id:'r'}, transcript:[{speaker:'G',text:'hello there this is the recording'}] }, 'transcript'],
    ['nested under recording',         { recording:{id:'r', transcript:[{speaker:'G',text:'hello there this is the recording'}]} }, 'recording.transcript'],
    ['named transcription',            { recording:{id:'r'}, transcription:[{speaker:'G',text:'hello there this is the recording'}] }, 'transcription'],
    ['an object with segments',        { recording:{id:'r'}, transcript:{ segments:[{speaker:'G',text:'hello there this is the recording'}] } }, 'transcript.segments'],
    ['called utterances',              { recording:{id:'r'}, utterances:[{speaker:'G',text:'hello there this is the recording'}] }, 'utterances'],
    ['a plain string',                 { recording:{id:'r'}, transcript:'a long plain string transcript that is definitely long enough' }, 'transcript'],
  ];
  for (const [name, detail, path] of shapes) {
    reset();
    POCKET_DETAIL = { ...detail, recording: { ...detail.recording, id: 'rec_sunday', title: 'T' } };
    const res = await call({ action: 'import', id: 'rec_sunday' });
    const row = DB.get('rec_sunday');
    ok(name + ' → transcript stored', !!(row && row.data.transcript && row.data.transcript.length > 10),
       row && JSON.stringify(row.data.transcript).slice(0, 60));
    ok('  found at ' + path, res.body.transcriptPath === path, res.body.transcriptPath);
  }
}

console.log('\na title is not mistaken for a transcript');
{
  reset();
  POCKET_DETAIL = { recording: { id: 'rec_sunday', title: 'Short', text: 'tiny' } };
  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('a four-character string is not treated as a transcript', res.body.transcript === false, res.body.transcriptPath);
}

console.log('\nwhen no transcript is found, the SHAPE is reported — names only');
{
  reset();
  POCKET_DETAIL = { recording: { id: 'rec_sunday', title: 'Sunday with Logan' },
                    mystery: { deeplyNested: { audioUrl: 'https://x/y.mp3' } } };
  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('the import still succeeds — a recording without a transcript is worth having',
     res.code === 200 && res.body.ok === true);
  ok('it says there is no transcript', res.body.transcript === false);
  ok('and reports the shape it DID get', Array.isArray(res.body.shape) && res.body.shape.length > 0,
     JSON.stringify(res.body.shape));
  ok('  as key names and types', res.body.shape.some(x => /^recording:object$/.test(x)), JSON.stringify(res.body.shape));
  ok('  reaching nested keys', res.body.shape.some(x => /mystery\.deeplyNested/.test(x)), JSON.stringify(res.body.shape));
  const dump = JSON.stringify(res.body.shape);
  ok('  and NO VALUES — a shape report must never carry transcript text',
     !dump.includes('Sunday with Logan') && !dump.includes('audioUrl.*mp3') && !dump.includes('https://'), dump);
  reset();
  POCKET_DETAIL = { recording: { id: 'rec_sunday', title: 'T' },
                    transcript: [{ speaker: 'G', text: 'a real transcript with plenty of words in it' }] };
  const good = await call({ action: 'import', id: 'rec_sunday' });
  ok('no shape is reported when a transcript WAS found', good.body.shape === null, JSON.stringify(good.body.shape));
  ok('  and the path it used is reported instead', good.body.transcriptPath === 'transcript');
}

console.log('\nre-importing does not resurrect something you finished with');
{
  reset();
  await call({ action: 'import', id: 'rec_sunday' });
  DB.get('rec_sunday').status = 'done';                 // the owner worked it
  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('200', res.code === 200);
  ok('IT IS STILL DONE', DB.get('rec_sunday').status === 'done', DB.get('rec_sunday').status);
  ok('but the content still merged', DB.get('rec_sunday').data.events.length === 2);
}

console.log('\na field the import does not mention is not blanked');
{
  reset();
  await call({ action: 'import', id: 'rec_sunday' });
  ok('the summary is there first', /Alvarez/.test(DB.get('rec_sunday').data.summary));
  /* Pocket returns the same recording with no summarizations this time */
  POCKET_DETAIL = { recording: { id: 'rec_sunday', title: 'Sunday with Logan' } };
  await call({ action: 'import', id: 'rec_sunday' });
  const row = DB.get('rec_sunday');
  ok('the summary SURVIVED — the shared merge really is shared', /Alvarez/.test(row.data.summary), row.data.summary);
  ok('and so did the transcript', row.data.transcript.includes(TRANSCRIPT_SENTINEL));
}

/* ============================================================ the failures */

console.log('\none recording failing does not take the run down');
{
  reset(); POCKET_STATUS = 404;
  const res = await call({ action: 'import', id: 'rec_gone' });
  ok('200 with ok:false, so the browser can mark that row and carry on', res.code === 200 && res.body.ok === false, res.code);
  ok('it names the recording', res.body.id === 'rec_gone');
  ok('and says what happened', /no longer has/.test(res.body.error), res.body.error);
  ok('nothing was written', DB.size === 0);
}

console.log('\nPocket rate limiting is a message, not a retry storm');
{
  reset(); POCKET_STATUS = 429;
  const res = await call({ action: 'import', id: 'rec_sunday' });
  ok('flagged as rate limited', res.body.rateLimited === true);
  ok('with something a human can act on', /wait a minute/i.test(res.body.error), res.body.error);
  ok('and only ONE call was made to Pocket', CALLS.filter(c => c.u.includes('heypocketai')).length === 1);
  ok('nothing written', DB.size === 0);
}

console.log('\nno API key says so plainly');
{
  reset();
  const saved = process.env.POCKET_API_KEY;
  delete process.env.POCKET_API_KEY;
  const fresh = (await import('../api/pocket-backfill.js?v=2')).default;
  const res = makeRes();
  await fresh({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { action: 'list' } }, res);
  ok('a clear message rather than an obscure failure', res.body.ok === false && /POCKET_API_KEY/.test(res.body.error), res.body.error);
  process.env.POCKET_API_KEY = saved;
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
