/* THE TWO ROUTES, ACTUALLY RUN.
   ============================================================================

   tests/content.mjs asserts on the pure functions and on the SOURCE of the
   routes. That catches a rule being deleted; it does not catch the handler
   being wired up wrong. This file invokes the real exported handlers with a
   fake req/res and a fake network, and asserts on WHAT REACHED THE DATABASE —
   the only assertion that has ever caught a bug in this project.

   What it proves that reading the file cannot:

     - the spend cap actually refuses, with a 429, before the model is called
     - an unreachable ledger refuses too, rather than spending
     - the cron leg lets Vercel in and keeps everyone else out
     - a dry run inserts NOTHING and does not burn the research queue
     - a real run inserts the posts and only then marks the research used
     - an unparseable answer writes no rows but still bills the ledger
     - a caption regenerate patches captions and nothing else
     - a full regenerate cannot move week_of, mix_class or pillar

   env FIRST: _guard.js and _content.js read process.env at MODULE SCOPE, and
   ES imports are hoisted. Setting them after a static import leaves both
   unconfigured, where they fail open and every test passes for the wrong
   reason. tests/guard.mjs found that the hard way.                          */

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ANTHROPIC_API_KEY_CONTENT = 'sk-ant-test-key-not-real';
process.env.CRON_SECRET = 'the-cron-secret';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => {
  if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); }
};

/* ---- the fake world ------------------------------------------------------ */

const W = {
  context: [], research: [], perf: [], usage: [],
  answer: '', anthropicStatus: 200,
  ledgerDown: false, calls: [],
};

const reset = (over = {}) => {
  W.context = over.context !== undefined ? over.context : [
    { id: 'c1', category: 'voice', key: 'tone', value: 'direct', active: true, sort_order: 1 },
    { id: 'c2', category: 'mix', key: 'ratio', value: '4:3', active: true, sort_order: 1 },
    { id: 'c3', category: 'config', key: 'posts_per_week', value: '2', active: true, sort_order: 0 },
    { id: 'c4', category: 'config', key: 'monthly_cap_cents', value: '500', active: true, sort_order: 0 },
    { id: 'c5', category: 'config', key: 'surfaces', value: 'linkedin,instagram', active: true, sort_order: 0 },
    { id: 'c6', category: 'config', key: 'model', value: 'claude-opus-5', active: true, sort_order: 0 },
  ];
  W.research = over.research !== undefined ? over.research : [
    { id: 'r1', source_type: 'swipe', url: '', platform: 'linkedin', format: 'carousel', raw: 'a hook', why_it_worked: 'specific', used: false, captured_at: '2026-08-20' },
  ];
  W.perf = over.perf || [];
  W.usage = over.usage || [];
  W.answer = over.answer !== undefined ? over.answer : JSON.stringify({
    posts: [
      { mix_class: 'personal', surface: 'linkedin', pillar: 'systems', format: 'carousel', hook: 'H1', concept: 'C1', value_statement: 'V1', cta_key: 'book', captions: { linkedin: 'L1', instagram: 'I1' } },
      { mix_class: 'proytech', surface: 'instagram', pillar: 'systems', format: 'single', hook: 'H2', concept: 'C2', value_statement: 'V2', cta_key: 'book', captions: { linkedin: 'L2', instagram: 'I2' } },
    ],
  });
  W.anthropicStatus = over.anthropicStatus || 200;
  W.ledgerDown = !!over.ledgerDown;
  W.calls = [];
};

const seen = re => W.calls.filter(c => re.test(c.url));
const wrote = (re, method) => W.calls.filter(c => re.test(c.url) && c.method === method);

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch { body = opts.body; }
  W.calls.push({ url: u, method, body });
  const json = v => ({ ok: true, status: 200, text: async () => JSON.stringify(v), json: async () => v });

  if (u.includes('api.anthropic.com')) {
    if (W.anthropicStatus !== 200) {
      return { ok: false, status: W.anthropicStatus, json: async () => ({ error: { message: 'model unavailable' } }), text: async () => '' };
    }
    return json({
      content: [{ type: 'text', text: W.answer }],
      usage: { input_tokens: 1200, output_tokens: 800 },
      model: 'claude-opus-5',
    });
  }
  /* guard()'s own plumbing */
  if (u.includes('/auth/v1/user')) return json({ id: 'uid-owner' });
  if (u.includes('/rpc/crm_whoami')) return json([{ role: 'owner', active: true }]);
  if (u.includes('api_hits')) return method === 'POST' ? json([]) : json([]);

  if (u.includes('content_usage')) {
    if (W.ledgerDown) return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    if (method === 'POST') { W.usage.push(body); return json([body]); }
    return json(W.usage.map(r => ({ est_cents: r.est_cents })));
  }
  if (u.includes('content_brand_context')) return json(W.context.filter(r => r.active !== false));
  if (u.includes('content_research')) {
    if (method === 'PATCH') return json([]);
    return json(W.research.filter(r => !r.used));
  }
  if (u.includes('content_posts')) {
    if (method === 'POST') return json((body || []).map((r, i) => ({ id: 'new' + i, ...r })));
    if (method === 'PATCH') return json([{ id: 'p1', ...(W.thePost || {}), ...body }]);
    if (u.includes('id=eq.')) return json(W.thePost ? [W.thePost] : []);
    return json(W.perf);   // the performance lookback
  }
  return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
};

const mkRes = () => {
  const r = { code: 0, body: null, headers: {}, ended: false };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; r.ended = true; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = () => { r.ended = true; return r; };
  return r;
};
const ownerReq = (body) => ({
  method: 'POST',
  headers: { authorization: 'Bearer a-real-session', 'x-forwarded-for': '1.2.3.4' },
  socket: { remoteAddress: '1.2.3.4' },
  body: body || {},
});
const cronReq = () => ({
  method: 'GET',
  headers: { authorization: 'Bearer ' + process.env.CRON_SECRET, 'x-forwarded-for': '10.0.0.1' },
  socket: { remoteAddress: '10.0.0.1' },
});

/* Silence the routes' deliberate console noise; a couple of these tests drive
   the paths that log a raw response on purpose. */
const quiet = () => {
  const e = console.error, w = console.warn;
  console.error = () => {}; console.warn = () => {};
  return () => { console.error = e; console.warn = w; };
};

const slate = (await import('../api/content-slate.js')).default;
const regenerate = (await import('../api/content-regenerate.js')).default;

/* ========================================================== the happy path  */

console.log('\nan owner presses Generate');
{
  reset();
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('it returns 200', res.code === 200, res.code + ' ' + JSON.stringify(res.body).slice(0, 200));
  ok('  with the coming Monday', /^\d{4}-\d{2}-\d{2}$/.test(res.body.week_of || ''), res.body.week_of);
  ok('  and both posts', res.body.count === 2, res.body.count);

  const ins = wrote(/content_posts/, 'POST');
  ok('two rows reached content_posts', ins.length === 1 && ins[0].body.length === 2, JSON.stringify(ins.map(i => i.body && i.body.length)));
  const row = ins[0].body[0];
  ok('  status is draft', row.status === 'draft', row.status);
  ok('  week_of is stamped by us, not the model', row.week_of === res.body.week_of);
  ok('  the research it used is recorded', (row.source_research || []).join() === 'r1');
  ok('  a caption exists for every configured surface',
    Object.keys(row.captions).join('|') === 'linkedin|instagram', Object.keys(row.captions).join('|'));
  for (const c of ['idea_id', 'parent_id', 'series_key', 'series_index', 'source_insights', 'recycled_from']) {
    ok('  the insert leaves ' + c + ' alone', !(c in row));
  }

  ok('the research was marked used', wrote(/content_research/, 'PATCH').length === 1);
  ok('  AFTER the insert, not before',
    W.calls.findIndex(c => /content_posts/.test(c.url) && c.method === 'POST')
    < W.calls.findIndex(c => /content_research/.test(c.url) && c.method === 'PATCH'));

  const bill = wrote(/content_usage/, 'POST');
  ok('one usage row was written', bill.length === 1, bill.length);
  ok('  against the anthropic provider', bill[0].body.provider === 'anthropic');
  ok('  counting every billable token', bill[0].body.units === 2000, bill[0].body.units);
  ok('  in whole cents', Number.isInteger(bill[0].body.est_cents) && bill[0].body.est_cents > 0, bill[0].body.est_cents);
  ok('  labelled with the operation', bill[0].body.operation === 'slate', bill[0].body.operation);

  const ask = seen(/api\.anthropic\.com/)[0];
  ok('the model was asked for the configured count', /exactly 2 posts/.test(ask.body.messages[0].content), 'posts_per_week not honoured');
  ok('  using the configured model', ask.body.model === 'claude-opus-5', ask.body.model);
  ok('  with the brand voice in the system prompt', ask.body.system.includes('direct'));
  ok('  and the mix ratio, which is not a suggestion', ask.body.system.includes('4:3'));
  ok('  and the config category kept out of it', !ask.body.system.includes('monthly_cap_cents'));
  ok('the key rode in the header, never the body',
    !JSON.stringify(ask.body).includes(process.env.ANTHROPIC_API_KEY_CONTENT));
}

/* ========================================================== the dry run === */

console.log('\ndry_run does everything except the writes');
{
  reset();
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({ dry_run: true }), res);
  un();
  ok('it returns the parsed posts', res.code === 200 && res.body.dry_run === true && res.body.posts.length === 2,
    res.code + ' ' + JSON.stringify(res.body).slice(0, 160));
  ok('NOTHING was inserted', wrote(/content_posts/, 'POST').length === 0);
  ok('the research queue was NOT burned', wrote(/content_research/, 'PATCH').length === 0,
    'a dry run that retires research is useless the second time you reach for it');
  ok('but the tokens are still billed — they were still spent', wrote(/content_usage/, 'POST').length === 1);
}

/* ========================================================== the spend cap = */

console.log('\nthe cap is a cap, not a report');
{
  reset({ usage: [{ est_cents: 500 }] });     // exactly the configured cap
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('a spent budget returns 429', res.code === 429, res.code);
  ok('  and says so in money', /\$5\.00/.test(res.body.error || ''), res.body.error);
  ok('  the model was never called', seen(/api\.anthropic\.com/).length === 0, 'the cap ran AFTER the spend');
  ok('  and nothing was inserted', wrote(/content_posts/, 'POST').length === 0);
}
{
  reset({ usage: [{ est_cents: 499 }] });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('one cent under the cap still runs', res.code === 200, res.code);
}
{
  reset({ ledgerDown: true });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('an unreachable ledger FAILS CLOSED with a 503', res.code === 503, res.code);
  ok('  spending nothing', seen(/api\.anthropic\.com/).length === 0,
    'a cap that cannot see the ledger is not a cap');
}

/* ========================================================== the cron leg == */

console.log('\nthe scheduled run');
{
  reset();
  const un = quiet();
  const res = mkRes();
  await slate(cronReq(), res);
  un();
  ok('Vercel\'s cron gets in with CRON_SECRET on a GET', res.code === 200, res.code + ' ' + JSON.stringify(res.body).slice(0, 160));
  ok('  and it generated a real slate', wrote(/content_posts/, 'POST').length === 1);
  ok('  without asking Postgres who it is', seen(/crm_whoami/).length === 0);
}
{
  reset();
  const un = quiet();
  const res = mkRes();
  await slate({ method: 'GET', headers: { authorization: 'Bearer wrong-secret' }, socket: {} }, res);
  un();
  ok('a WRONG secret is refused', res.code === 401 || res.code === 405, res.code);
  ok('  and generates nothing', seen(/api\.anthropic\.com/).length === 0);
}
{
  reset();
  const un = quiet();
  const res = mkRes();
  await slate({ method: 'GET', headers: {}, socket: {} }, res);
  un();
  ok('no credential at all is refused', res.code === 401 || res.code === 405, res.code);
  ok('  and generates nothing', seen(/api\.anthropic\.com/).length === 0);
}
{
  /* An unset CRON_SECRET must close the door, not open it. */
  const keep = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  reset();
  const un = quiet();
  const res = mkRes();
  await slate({ method: 'GET', headers: { authorization: 'Bearer anything' }, socket: {} }, res);
  un();
  process.env.CRON_SECRET = keep;
  ok('an UNSET CRON_SECRET refuses everyone rather than letting everyone in',
    res.code !== 200 && seen(/api\.anthropic\.com/).length === 0, res.code);
}

/* ================================================== a broken model answer = */

console.log('\nwhen the answer comes back wrong');
{
  reset({ answer: 'I would rather write you a poem about content.' });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('an unparseable answer returns an error', res.code === 502, res.code);
  ok('  and writes NO rows', wrote(/content_posts/, 'POST').length === 0, 'garbage reached content_posts');
  ok('  and does not burn the research', wrote(/content_research/, 'PATCH').length === 0);
  ok('  but still bills what was spent', wrote(/content_usage/, 'POST').length === 1,
    'a ledger that only records successes under-reports the bill');
}
{
  reset({ answer: JSON.stringify({ posts: [] }) });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('an empty posts array is an error, not an empty insert', res.code === 502, res.code);
  ok('  with nothing inserted', wrote(/content_posts/, 'POST').length === 0);
}
{
  reset({ answer: '```json\n' + JSON.stringify({ posts: [{ mix_class: 'personal', hook: 'H', concept: 'C', captions: {} }] }) + '\n```' });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('a fenced answer is unwrapped and saved', res.code === 200 && res.body.count === 1, res.code);
}
{
  reset({ anthropicStatus: 500 });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('a model outage returns 502 and writes nothing',
    res.code === 502 && wrote(/content_posts/, 'POST').length === 0, res.code);
  ok('  and bills nothing, because nothing was spent', wrote(/content_usage/, 'POST').length === 0);
}

/* ========================================================== regenerate ==== */

const STORED = {
  id: 'p1', week_of: '2026-08-24', mix_class: 'personal', surface: 'linkedin',
  pillar: 'systems', format: 'carousel', hook: 'KEEP THIS HOOK', concept: 'KEEP THIS CONCEPT',
  image_prompt: '', carousel_slides: [], captions: { linkedin: 'old L', instagram: 'old I' },
  cta_key: 'book', value_statement: 'KEEP THIS VALUE', source_research: ['r1'],
  status: 'approved', generated_at: '2026-08-23T20:00:00.000Z', posted_at: null,
  platform_post_ids: {}, performance: null, created_at: '2026-08-23T20:00:00.000Z',
};

console.log('\nregenerate: captions only');
{
  reset({ answer: JSON.stringify({ captions: { linkedin: 'new L', instagram: 'new I' } }) });
  W.thePost = STORED;
  const un = quiet();
  const res = mkRes();
  await regenerate(ownerReq({ post_id: 'p1', mode: 'caption' }), res);
  un();
  ok('it returns 200', res.code === 200, res.code + ' ' + JSON.stringify(res.body).slice(0, 200));
  const patch = wrote(/content_posts/, 'PATCH')[0];
  ok('exactly ONE field is patched', patch && Object.keys(patch.body).join() === 'captions', patch && Object.keys(patch.body).join());
  ok('  the captions are the new ones', patch.body.captions.linkedin === 'new L');
  ok('  the hook was NOT touched', !('hook' in patch.body), 'a caption fix that rewrites the hook is not a caption fix');
  ok('  and neither was the status', !('status' in patch.body), 'a rewrite must not silently un-approve');
  const ask = seen(/api\.anthropic\.com/)[0];
  ok('the model was told what it may not change',
    /week_of: 2026-08-24/.test(ask.body.messages[0].content) && /pillar: systems/.test(ask.body.messages[0].content));
  ok('  and given the same brand voice as the slate', ask.body.system.includes('direct'));
  ok('the usage row names the mode', wrote(/content_usage/, 'POST')[0].body.operation === 'regenerate:caption');
}
{
  reset({ answer: JSON.stringify({ captions: {} }) });
  W.thePost = STORED;
  const un = quiet();
  const res = mkRes();
  await regenerate(ownerReq({ post_id: 'p1', mode: 'caption' }), res);
  un();
  ok('empty captions leave the post ALONE rather than blanking it',
    res.code === 502 && wrote(/content_posts/, 'PATCH').length === 0, res.code);
}

console.log('\nregenerate: the whole post');
{
  reset({
    answer: JSON.stringify({
      posts: [{
        mix_class: 'proytech', surface: 'instagram', pillar: 'SOMETHING ELSE',
        format: 'reel', hook: 'NEW HOOK', concept: 'NEW CONCEPT', value_statement: 'NEW VALUE',
        cta_key: 'dm', captions: { linkedin: 'nL', instagram: 'nI' },
      }],
    }),
  });
  W.thePost = STORED;
  const un = quiet();
  const res = mkRes();
  await regenerate(ownerReq({ post_id: 'p1', mode: 'full' }), res);
  un();
  ok('it returns 200', res.code === 200, res.code + ' ' + JSON.stringify(res.body).slice(0, 200));
  const p = wrote(/content_posts/, 'PATCH')[0].body;
  ok('the hook IS rewritten', p.hook === 'NEW HOOK', p.hook);
  ok('week_of comes from the stored row', p.week_of === '2026-08-24', p.week_of);
  ok('mix_class comes from the stored row, not the model',
    p.mix_class === 'personal', p.mix_class + ' — the model tried to change it and was overruled');
  ok('pillar comes from the stored row, not the model',
    p.pillar === 'systems', p.pillar + ' — the model tried to change it and was overruled');
  ok('status is left alone, so an approved post stays approved', !('status' in p));
  ok('posted_at is left alone — a rewrite cannot un-post something', !('posted_at' in p));
  ok('performance is left alone — it is a fact about the world', !('performance' in p));
}
{
  reset();
  W.thePost = STORED;
  const un = quiet();
  for (const [body, why] of [
    [{ mode: 'caption' }, 'no post_id'],
    [{ post_id: 'p1' }, 'no mode'],
    [{ post_id: 'p1', mode: 'everything' }, 'an unknown mode'],
  ]) {
    const res = mkRes();
    await regenerate(ownerReq(body), res);
    ok(why + ' is a 400', res.code === 400, res.code);
  }
  un();
  ok('  and none of them called the model', seen(/api\.anthropic\.com/).length === 0);
}
{
  reset();
  W.thePost = null;
  const un = quiet();
  const res = mkRes();
  await regenerate(ownerReq({ post_id: 'gone', mode: 'full' }), res);
  un();
  ok('a post that is no longer there is a 404, not a crash', res.code === 404, res.code);
  ok('  and costs nothing', seen(/api\.anthropic\.com/).length === 0);
}

/* ================================================ config drives everything = */

console.log('\nthe config rows really are what drives it');
{
  reset({
    context: [
      { id: 'c1', category: 'config', key: 'posts_per_week', value: '5', active: true },
      { id: 'c2', category: 'config', key: 'model', value: 'claude-haiku-4-5-20251001', active: true },
      { id: 'c3', category: 'config', key: 'monthly_cap_cents', value: '9999', active: true },
      { id: 'c4', category: 'config', key: 'surfaces', value: 'x,threads,bluesky', active: true },
      { id: 'c5', category: 'config', key: 'instructions', value: 'MY OWN WRAPPER TEXT', active: true },
      { id: 'c6', category: 'config', key: 'output_contract', value: 'MY OWN CONTRACT', active: true },
    ],
    answer: JSON.stringify({ posts: [{ mix_class: 'personal', surface: 'threads', hook: 'H', concept: 'C', captions: { threads: 'T' } }] }),
  });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  const ask = seen(/api\.anthropic\.com/)[0];
  ok('the model id came from a row', ask.body.model === 'claude-haiku-4-5-20251001', ask.body.model);
  ok('the post count came from a row', /exactly 5 posts/.test(ask.body.messages[0].content));
  ok('the owner\'s wrapper is FIRST', ask.body.system.startsWith('MY OWN WRAPPER TEXT'), ask.body.system.slice(0, 40));
  ok('the owner\'s contract is LAST', ask.body.system.trimEnd().endsWith('MY OWN CONTRACT'), ask.body.system.slice(-40));
  ok('  and the built-in contract is nowhere in it', !ask.body.system.includes('carousel_slides'));
  ok('the surfaces came from a row', ask.body.system.includes('- bluesky') && !ask.body.system.includes('- linkedin'));
  const row = wrote(/content_posts/, 'POST')[0].body[0];
  ok('  and the caption keys follow them',
    Object.keys(row.captions).join('|') === 'x|threads|bluesky', Object.keys(row.captions).join('|'));
}
{
  reset({ context: [] });
  const un = quiet();
  const res = mkRes();
  await slate(ownerReq({}), res);
  un();
  ok('an empty brand table still runs on defaults', res.code === 200, res.code);
  ok('  and reports every key that fell back, BY NAME',
    (res.body.config_defaults_used || []).includes('posts_per_week')
    && (res.body.config_defaults_used || []).includes('model'),
    JSON.stringify(res.body.config_defaults_used));
}

console.log(`\ncontentroutes: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
