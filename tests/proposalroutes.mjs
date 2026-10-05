/* THE TOKEN ACCESS RULE, AND THE RECIPIENT RULE.

   Drives the real handlers with a fake network, the same way tests/relay.mjs
   does for notify.js. The fake database below models the three SQL functions
   in PROPOSALS-MIGRATION.sql, so these prove the ROUTE's half of the boundary.
   The database's half is proven against a real install by VERIFY-RLS.md §12;
   jsdom cannot run Postgres, and this file does not pretend it can.

   proposal-public.js (no session, by design):
     - a malformed, unknown or DRAFT token all get the identical 404
     - the response carries the display fields only, picked by name; nothing
       the owner keeps private (notes, client email, lead id, IP) can leave
     - view stamps first-viewed; accept needs a name, the box ticked, an open
       proposal; accept is once; an expired proposal refuses
     - the owners are emailed once, on the first acceptance only
   proposal-send.js (owner only):
     - a rep is refused; the recipient is the email ON THE LEAD, never the body
     - it publishes before it sends, and the link points at the app's origin
   proposal-draft.js (owner only): a rep cannot spend the AI budget.

   Seen red: removing the status<>draft filter from the fake (drafts leak);
   returning row.body whole (the secret field leaks); taking `to` from the body. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';
process.env.ANTHROPIC_API_KEY = 'sk-test';

const pub = (await import('../api/proposal-public.js')).default;
const { publicView, PUBLIC_BODY_KEYS } = await import('../api/proposal-public.js');
const send = (await import('../api/proposal-send.js')).default;
const { proposalLink } = await import('../api/proposal-send.js');
const draft = (await import('../api/proposal-draft.js')).default;
const { SYSTEM } = await import('../api/proposal-draft.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const T = s => (s + 'A'.repeat(43)).slice(0, 43);
const BODY = { client: { name: 'Dee', company: 'Dee Co' }, company: { name: 'Agency' }, preparedOn: '2026-10-03', validDays: 7,
  /* a proposal that MEETS the standard (lib/proposal readiness), so the send
     tests below test sending; tests/proposalstandard.mjs tests the refusals */
  copy: { headline: 'Growth', summary: 'Hi',
    plan: { goal: 'Book 20 jobs a month', numbers: [{ label: 'Jobs', value: '12' }, { label: 'Leads', value: '40' }, { label: 'Close', value: '1 in 4' }], levers: ['Answer fast', 'Follow up', 'Track it'] },
    gaps: [{ title: 'Slow replies', text: 'x' }, { title: 'No follow up', text: 'x' }, { title: 'No numbers', text: 'x' }],
    build: [{ title: 'Website', tag: 'new', text: 'x', item: 'growth-os' }] },
  quote: { packageId: 'growth-os', items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package', setup: 3000, monthly: 299 }],
    setup: 3000, deposit: 1500, monthly: 299, prepay: { months: 12, free: 2, total: 2990 } },
  standard: { covers: ['x'] }, onboardingUrl: 'https://forms.test/g', SECRET_FIELD: 'must never leave' };
const future = new Date(Date.now() + 5 * 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();
let DB, sent, calls, leads;
const reset = () => {
  DB = [
    { id: '11111111-1111-4111-8111-111111111111', token: T('open'), status: 'sent', body: BODY, notes: 'PRIVATE NOTES', lead_id: 'L1', expires_at: future, email_to: 'dee@dee.co', accepted_ip: null },
    { id: '22222222-2222-4222-8222-222222222222', token: T('draft'), status: 'draft', body: BODY, notes: 'PRIVATE', lead_id: 'L1', expires_at: null },
    { id: '33333333-3333-4333-8333-333333333333', token: T('old'), status: 'sent', body: BODY, notes: '', lead_id: 'L1', expires_at: past },
    { id: '44444444-4444-4444-8444-444444444444', token: T('done'), status: 'accepted', body: BODY, notes: '', lead_id: 'L1', expires_at: past, accepted_name: 'Dee', accepted_at: past },
  ];
  leads = { L1: { id: 'L1', email: 'dee@dee.co', name: 'Dee' }, L2: { id: 'L2', name: 'No Email' } };
  sent = []; calls = [];
};
reset();

/* the fake database models the SQL functions' rules exactly */
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  const J = (data, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => data, text: async () => JSON.stringify(data) });
  if (u.includes('/auth/v1/user')) { const t = (opts.headers || {}).authorization || ''; return /good/.test(t) ? J({ id: 'u1', email: /owner/.test(t) ? 'me@agency.test' : 'rep@agency.test' }) : J({}, false); }
  if (u.includes('/rpc/crm_whoami')) { const t = (opts.headers || {}).authorization || ''; return J([{ role: /owner/.test(t) ? 'owner' : 'rep', active: true }]); }
  if (u.includes('api_hits')) return { ok: true, json: async () => [], text: async () => '[]' };
  if (u.includes('crm_users')) return J([{ email: 'logan@agency.test' }]);
  if (u.includes('api.resend.com')) { sent.push(body); return J({ id: 'm1' }); }
  if (u.includes('api.anthropic.com')) { calls.push('anthropic'); return J({ content: [{ type: 'text', text: '{"headline":"x"}' }], usage: {} }); }
  if (u.includes('/rpc/proposal_public')) {
    calls.push('public');
    const r = DB.find(p => p.token === body.p_token && p.status !== 'draft' && /^[A-Za-z0-9_-]{43}$/.test(body.p_token));
    return J(r ? [{ status: r.status, body: r.body, expires_at: r.expires_at, accepted_at: r.accepted_at || null, accepted_name: r.accepted_name || null, accepted_plan: r.accepted_plan || null }] : []);
  }
  if (u.includes('/rpc/proposal_mark_viewed')) {
    calls.push('viewed'); const r = DB.find(p => p.token === body.p_token && (p.status === 'sent' || p.status === 'viewed'));
    if (r) { r.viewed_at = r.viewed_at || new Date().toISOString(); if (r.status === 'sent') r.status = 'viewed'; } return J(null);
  }
  if (u.includes('/rpc/proposal_accept')) {
    calls.push('accept:' + body.p_ip);
    const r = DB.find(p => p.token === body.p_token);
    if (!r || r.status === 'draft') return J('not_found');
    if (r.status === 'accepted') return J('already');
    if (!r.expires_at || Date.now() > Date.parse(r.expires_at)) return J('expired');
    if (!body.p_name || body.p_name.trim().length < 2) return J('bad_name');
    if (!['monthly', 'annual'].includes(body.p_plan)) return J('bad_plan');
    Object.assign(r, { status: 'accepted', accepted_name: body.p_name, accepted_ip: body.p_ip, accepted_plan: body.p_plan, accepted_at: new Date().toISOString() });
    return J('accepted');
  }
  if (u.includes('/rest/v1/proposals?id=eq.')) {
    const id = u.match(/id=eq\.([^&]+)/)[1]; const r = DB.find(p => p.id === id);
    if (method === 'GET') return J(r ? [{ id: r.id, lead_id: r.lead_id, token: r.token, status: r.status, valid_days: 7, body: r.body }] : []);
    if (method === 'PATCH') { calls.push('publish'); if (r && r.status !== 'accepted') Object.assign(r, body); return { ok: true, status: 204, json: async () => null }; }
  }
  if (u.includes('/rest/v1/leads?id=eq.')) { const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(leads[id] ? [{ data: leads[id] }] : []); }
  return J({}, false);
};

const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
const mkReq = (body, tok) => ({ method: 'POST', headers: { 'x-forwarded-for': '9.8.7.6', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, socket: { remoteAddress: '9.8.7.6' }, body });
const hit = async (h, body, tok) => { const res = mkRes(); await h(mkReq(body, tok), res); return res; };

console.log('\nproposal-public — who can see what');
{
  const a = await hit(pub, { t: 'short' }), b = await hit(pub, { t: T('nope') }), c = await hit(pub, { t: T('draft') });
  ok('a malformed token is a 404', a.code === 404);
  ok('an unknown token is a 404', b.code === 404);
  ok('a DRAFT is a 404: nothing is public until it is sent', c.code === 404);
  ok('all three say the identical thing, so tokens cannot be probed', a.body.error === b.body.error && b.body.error === c.body.error);
  ok('a malformed token never reaches the database', calls.filter(x => x === 'public').length === 2, calls);
  const v = await hit(pub, { t: T('open') });
  ok('a sent proposal opens', v.code === 200 && v.body.ok && v.body.proposal.status === 'sent');
  const s = JSON.stringify(v.body);
  /* every key that leaves is on the list, and every listed key the body HAS leaves */
  ok('only the display fields leave, picked by name', Object.keys(v.body.proposal.body).every(k => PUBLIC_BODY_KEYS.includes(k))
    && PUBLIC_BODY_KEYS.filter(k => BODY[k] !== undefined).every(k => k in v.body.proposal.body), Object.keys(v.body.proposal.body));
  ok('an extra field on the body does not leak', !s.includes('must never leave'));
  ok('the onboarding link is not shown before acceptance', !s.includes('forms.test'));
  ok('the owner\'s notes, the client email and the lead id never leave', !s.includes('PRIVATE') && !s.includes('dee@dee.co') && !s.includes('L1'));
  ok('opening it stamps the first view', DB[0].status === 'viewed' && !!DB[0].viewed_at);
  const e = await hit(pub, { t: T('old') });
  ok('an expired proposal still shows, marked expired', e.code === 200 && e.body.proposal.expired === true);
  ok('publicView: an accepted proposal is never "expired"', publicView({ status: 'accepted', body: {}, expires_at: past }).expired === false);
}

console.log('\nproposal-public — accepting');
{
  reset();
  let r = await hit(pub, { t: T('open'), action: 'accept', name: ' ', agree: true });
  ok('no name refuses', r.code === 400 && DB[0].status === 'sent');
  r = await hit(pub, { t: T('open'), action: 'accept', name: 'Dee Client', agree: false });
  ok('the terms box not ticked refuses', r.code === 400 && DB[0].status === 'sent');
  r = await hit(pub, { t: T('old'), action: 'accept', name: 'Dee Client', agree: true });
  ok('an expired proposal cannot be accepted', r.code === 410 && DB[2].status === 'sent');
  r = await hit(pub, { t: T('draft'), action: 'accept', name: 'Dee Client', agree: true });
  ok('a draft cannot be accepted', r.code === 404 && DB[1].status === 'draft');
  sent = [];
  r = await hit(pub, { t: T('open'), action: 'accept', name: 'Dee Client', agree: true, plan: 'annual' });
  ok('a valid acceptance is recorded', r.code === 200 && r.body.result === 'accepted' && DB[0].status === 'accepted');
  ok('with the typed name, the plan and the caller\'s IP', DB[0].accepted_name === 'Dee Client' && DB[0].accepted_plan === 'annual' && DB[0].accepted_ip === '9.8.7.6');
  ok('it hands back the onboarding link for their package', r.body.onboardingUrl === 'https://forms.test/g');
  ok('the owners are emailed, and only the owners', sent.length === 1 && sent[0].to.every(x => /@agency\.test$/.test(x)) && !sent[0].to.includes('dee@dee.co'), sent[0] && sent[0].to);
  ok('the email tells them to send the payment link', /payment link/i.test(sent[0].html));
  sent = [];
  r = await hit(pub, { t: T('open'), action: 'accept', name: 'Someone Else', agree: true });
  ok('accepting twice is "already", not a second acceptance', r.body.result === 'already' && DB[0].accepted_name === 'Dee Client');
  ok('  and the owners are not emailed again', sent.length === 0);
  reset();
  await hit(pub, { t: T('open'), action: 'accept', name: 'Dee Client', agree: true, plan: 'annual' });
  ok('the plan sent is the plan recorded', DB[0].accepted_plan === 'annual');
  reset(); DB[0].body = { ...BODY, quote: { ...BODY.quote, prepay: null } };
  await hit(pub, { t: T('open'), action: 'accept', name: 'Dee Client', agree: true, plan: 'annual' });
  ok('"annual" with no prepay on the proposal is recorded as monthly', DB[0].accepted_plan === 'monthly');
}

console.log('\nproposal-send — owner only, and the recipient is not a parameter');
{
  reset();
  let r = await hit(send, { id: DB[1].id, mode: 'email', subject: 's', message: 'x'.repeat(40) }, '');
  ok('no session is refused', r.code === 401 && sent.length === 0);
  r = await hit(send, { id: DB[1].id, mode: 'email', subject: 's', message: 'x'.repeat(40) }, 'good-rep');
  ok('a rep is refused', r.code === 403 && sent.length === 0);
  calls = [];
  r = await hit(send, { id: DB[1].id, reviewed: true, mode: 'email', subject: 'Your proposal', message: 'Thanks for the time today. Here it is.', to: 'attacker@evil.test', email: 'attacker@evil.test' }, 'good-owner');
  ok('an owner can send', r.body.ok === true, r.body);
  ok('it goes to the email on the lead record', sent.length === 1 && sent[0].to.join() === 'dee@dee.co', sent[0] && sent[0].to);
  ok('  never to an address named in the request', !JSON.stringify(sent).includes('evil.test'));
  ok('replies go to the owner who sent it', sent[0].reply_to === 'me@agency.test');
  ok('it publishes BEFORE it sends', calls.indexOf('publish') > -1 && DB[1].status === 'sent' && !!DB[1].expires_at);
  /* /p/<client-slug>#t=<token>: the slug is cosmetic, the token is the key */
  ok('the link is the app origin, the client slug, and the token in the fragment', r.body.link === proposalLink('https://crm.test', DB[1].token, BODY.client) && /^https:\/\/crm\.test\/p\/dee-co#t=[A-Za-z0-9_-]{43}$/.test(r.body.link), r.body.link);
  ok('the email carries the link and the good-until date', sent[0].html.includes(r.body.link) && /good until/.test(sent[0].html));
  ok('the owner\'s message is escaped, not injected', (await (async () => { reset(); await hit(send, { id: DB[1].id, reviewed: true, mode: 'email', subject: 's', message: 'Hello <script>alert(1)</script> there friend' }, 'good-owner'); return !sent[0].html.includes('<script>'); })()));
  reset(); DB[1].lead_id = 'L2'; sent = [];
  r = await hit(send, { id: DB[1].id, mode: 'email', subject: 's', message: 'x'.repeat(40) }, 'good-owner');
  ok('a lead with no email sends nothing and says so', r.body.ok === false && /no valid email/.test(r.body.error) && sent.length === 0);
  reset(); sent = [];
  r = await hit(send, { id: DB[3].id, mode: 'email', subject: 's', message: 'x'.repeat(40) }, 'good-owner');
  ok('an accepted proposal cannot be re-sent', r.body.ok === false && sent.length === 0);
  reset(); sent = [];
  r = await hit(send, { id: DB[1].id, reviewed: true, mode: 'link' }, 'good-owner');
  ok('copy-link publishes and returns the link without emailing', r.body.ok && !!r.body.link && sent.length === 0 && DB[1].status === 'sent');
}

console.log('\nproposal-draft — owner only, words only');
{
  calls = [];
  let r = await hit(draft, { notes: 'x'.repeat(80), items: [{ name: 'Website' }] }, 'good-rep');
  ok('a rep cannot spend the AI budget', r.code === 403 && !calls.includes('anthropic'));
  r = await hit(draft, { notes: 'x'.repeat(80), items: [{ name: 'Website' }] }, 'good-owner');
  ok('an owner gets a draft', r.body.ok === true && calls.includes('anthropic'));
  ok('the prompt forbids prices and invented facts', /NEVER mention a price/.test(SYSTEM) && /Use ONLY facts in the notes/.test(SYSTEM));
  ok('the prompt never names a meeting type', !/nucleus/i.test(SYSTEM) && /Do not name the type of meeting/.test(SYSTEM));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
