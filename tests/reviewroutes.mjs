/* SITE REVIEW'S SERVER DOORS (B-2), driven with a fake network.
   ============================================================================
   The fake Supabase models REVIEW-MIGRATION.sql's server functions; the
   Postgres half is proven by tests/reviewdb.mjs.

   api/portal-review.js (a CLIENT session):
     - no token, a bad token, a login that is not an active client
       (portal_lead null): 401, and nothing else is called
     - the login id comes from Supabase Auth and the lead from portal_lead():
       a uid, lead id or address in the body is ignored
     - submit: "We got your notes" to THAT login's own address; the owners
       are told; nobody else gets mail
     - approve: the IP is the first x-forwarded-for, the browser is the
       request's; anything the body says about them is ignored
     - uploads: images only, 10 MB; one path the SERVER names
       (<lead>/<note>-<kind>-<12>.<ext>) in the review bucket; a file whose
       bytes are not an image is deleted, never recorded; a replaced file is
       removed
   api/review-admin.js (owner only):
     - a rep or a client is refused
     - the preview link must be https on an allowed host
     - "Send for review" emails every ACTIVE login of THAT client
     - status: won't do needs a reason; an open round cannot be marked; only
       status, reason and done date are written
   The two emails: escaped, with the review link.                          */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'Agency <hi@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const UA = '00000000-0000-4000-8000-0000000000c1', UA2 = '00000000-0000-4000-8000-0000000000c5', UB = '00000000-0000-4000-8000-0000000000c2', UGONE = '00000000-0000-4000-8000-0000000000c3';
const NOTE = '11111111-2222-4333-8444-555555555555';
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]), NOTJPG = Buffer.from('<?php evil ?>');
/* a session token is a long JWT; clientOf refuses anything shorter than 20 */
const T = s => s + '.' + 'x'.repeat(24);
let DB, sent, rpcs, calls, removed, patches, signs, stored;
const reset = () => {
  DB = {
    tokens: { [T('tok-a')]: UA, [T('tok-b')]: UB, [T('tok-gone')]: UGONE, [T('tok-crm')]: '00000000-0000-4000-8000-0000000000e1' },
    client_users: [{ id: UA, lead_id: 'LA', email: 'jordan@reed.test', name: 'Jordan Reed', active: true }, { id: UA2, lead_id: 'LA', email: 'office@reed.test', name: 'Office Mgr', active: true },
      { id: UB, lead_id: 'LB', email: 'bea@other.test', name: 'Bea', active: true }, { id: UGONE, lead_id: 'LA', email: 'gone@reed.test', name: 'Gone', active: false }],
    leads: { LA: { name: 'Jordan Reed', company: 'Reed <Realty>' }, LB: { name: 'Bea', company: 'Other Co' } },
    settings: { review: { hosts: ['*.vercel.app'] } },
    notes: [{ id: NOTE, lead_id: 'LA', round_id: 'r1', shot_path: `LA/${NOTE}-shot-oldoldoldold.jpg`, attach_path: null, review_rounds: { submitted_at: null } }],
    reply: {},
  };
  sent = []; rpcs = []; calls = []; removed = []; patches = []; signs = []; stored = {};
};
reset();
const lead = uid => { const c = DB.client_users.find(x => x.id === uid && x.active); return c ? c.lead_id : null; };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url).replace('https://x.supabase.co', ''); const m = (opts.method || 'GET').toUpperCase();
  let body = {}; try { body = opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : {}; } catch { body = {}; }
  const h = opts.headers || {}; const tok = String(h.authorization || h.Authorization || '').replace(/^Bearer /, '');
  const J = (d, okk = true, st) => ({ ok: okk, status: st || (okk ? 200 : 400), headers: { get: () => null }, json: async () => d, text: async () => JSON.stringify(d) });
  calls.push(m + ' ' + u.split('?')[0]);
  if (u.includes('api_hits')) return J([]);
  if (u.includes('api.resend.com')) { sent.push(body); return J({ id: 'm' + sent.length }); }
  if (u.includes('/auth/v1/user')) return DB.tokens[tok] ? J({ id: DB.tokens[tok] }) : /owner|rep/.test(tok) ? J({ id: 'u-' + tok }) : J({}, false, 401);
  if (u.includes('/rpc/crm_whoami')) return J([{ role: /owner/.test(tok) ? 'owner' : /rep/.test(tok) ? 'rep' : 'none', active: true }]);
  if (u.includes('/rpc/portal_lead')) { if (tok === 'svc') return J(null, false, 403); return J(lead(DB.tokens[tok]) || null); }
  if (u.includes('/rpc/review_') ) {
    const fn = u.split('/rpc/')[1]; rpcs.push({ fn, body, tok });
    if (tok !== 'svc') return J({ message: 'permission denied' }, false, 401);
    const lid = body.p_uid ? lead(body.p_uid) : null;
    if (fn === 'review_submit') return J(lid ? { lead_id: lid, number: 1, extra: false, notes: 3, included: 2 } : { error: 'not_a_client' });
    if (fn === 'review_request_extra') return J(lid ? { lead_id: lid, number: 3, extra: true, included: 2 } : { error: 'not_a_client' });
    if (fn === 'review_approve') return J(lid ? { lead_id: lid, approved_at: '2026-10-10T10:00:00Z', typed_name: body.p_name } : { error: 'not_a_client' });
    if (fn === 'review_note_delete') return J(lid === 'LA' && body.p_id === NOTE ? { shot_path: `LA/${NOTE}-shot-oldoldoldold.jpg`, attach_path: null } : null);
    if (fn === 'review_upload_target') return J(lid === 'LA' && body.p_note === NOTE ? 'LA' : null);
    if (fn === 'review_set_file') return J(lid === 'LA' && body.p_note === NOTE ? { ok: true, replaced: `LA/${NOTE}-shot-oldoldoldold.jpg` } : { error: 'not_editable' });
    if (fn === 'review_open_round') return J(DB.reply.open || { lead_id: body.p_lead, number: 1, extra: false, included: 2 });
    if (fn === 'review_state') return J({ preview_url: 'https://reed.vercel.app', included: 2, rounds: [], notes: [] });
    return J({ message: 'unknown' }, false, 404);
  }
  if (u.startsWith('/storage/v1/object/upload/sign/')) { signs.push(u); return J({ url: '/object/upload/sign/' + u.split('/sign/')[1] + '?token=t' }); }
  if (u.startsWith('/storage/v1/object/authenticated/')) {
    const p = decodeURIComponent(u.split('/authenticated/review/')[1] || '');
    const b = stored[p]; if (!b) return J({}, false, 404);
    return { ok: true, status: 206, headers: { get: k => (k === 'content-range' ? `bytes 0-${b.length - 1}/${b.length}` : null) }, body: null, arrayBuffer: async () => b };
  }
  if (u.startsWith('/storage/v1/object/sign/')) { signs.push(u); return J((body.paths || []).map(p => ({ path: p, signedURL: '/object/sign/review/' + p + '?token=s' }))); }
  if (u.startsWith('/storage/v1/object/review') && m === 'DELETE') { removed.push(...body.prefixes); return J([]); }
  if (u.startsWith('/rest/v1/client_users')) {
    const id = (u.match(/[?&]id=eq\.([^&]+)/) || [])[1], ld = decodeURIComponent((u.match(/[?&]lead_id=eq\.([^&]+)/) || [])[1] || '');
    let rows = DB.client_users.filter(c => (id ? c.id === id : true) && (ld ? c.lead_id === ld : true));
    if (/active=is\.true/.test(u)) rows = rows.filter(c => c.active);
    return J(rows.map(c => ({ ...c })));
  }
  if (u.startsWith('/rest/v1/leads')) { const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(DB.leads[id] ? [{ id, data: DB.leads[id] }] : []); }
  if (u.startsWith('/rest/v1/proposals')) return J([{ body: { contacts: [{ name: 'Logan Pratt', phone: '555' }] } }]);
  if (u.startsWith('/rest/v1/app_settings')) return J([{ data: DB.settings }]);
  if (u.startsWith('/rest/v1/review_notes')) {
    if (m === 'PATCH') { patches.push({ u, body }); return J(null); }
    const id = (u.match(/[?&]id=eq\.([^&]+)/) || [])[1], ld = decodeURIComponent((u.match(/[?&]lead_id=eq\.([^&]+)/) || [])[1] || '');
    return J(DB.notes.filter(n => (id ? n.id === id : true) && (ld ? n.lead_id === ld : true)));
  }
  if (u.startsWith('/rest/v1/review_sites')) { patches.push({ u, body, m }); return J(null); }
  if (u.startsWith('/rest/v1/site_approvals') || u.startsWith('/rest/v1/review_rounds')) return J([]);
  return J({}, false, 404);
};
const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
let n = 0;
const hit = async (h, body, tok, extraHeaders = {}) => { const ip = '10.9.1.' + (++n % 250); const res = mkRes(); await h({ method: 'POST', headers: { 'x-forwarded-for': `${ip}, 66.66.66.66`, 'user-agent': 'Mozilla/5.0 Test', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...extraHeaders }, socket: { remoteAddress: ip }, body }, res); return { res, ip }; };

const pr = (await import('../api/portal-review.js')).default;
const ra = (await import('../api/review-admin.js')).default;
const { reviewReady, notesReceived } = await import('../api/_clientemail-tpl.js');

console.log('\nportal-review: a client session or nothing');
{
  for (const [label, tok] of [['no token', null], ['a bad token', T('tok-nope')], ['a removed client', T('tok-gone')], ['a CRM user (portal_lead is null)', T('tok-crm')]]) {
    reset();
    const { res } = await hit(pr, { action: 'submit' }, tok);
    ok(`${label}: 401, and no review function was called`, res.code === 401 && rpcs.length === 0 && sent.length === 0, JSON.stringify([res.code, rpcs]));
  }
}

console.log('\nsubmit');
{
  reset();
  const { res } = await hit(pr, { action: 'submit', uid: UB, p_uid: UB, leadId: 'LB', to: 'evil@x.test', email: 'evil@x.test' }, T('tok-a'));
  ok('200, round 1, 3 notes', res.code === 200 && res.body.number === 1 && res.body.notes === 3, JSON.stringify(res.body));
  const call = rpcs.find(r => r.fn === 'review_submit');
  ok('review_submit got the login id FROM THE SESSION (A), with the service key', call && call.body.p_uid === UA && call.tok === 'svc' && Object.keys(call.body).join() === 'p_uid');
  const to = sent.map(s => s.to.join()).sort();
  ok('mail: "We got your notes" to A\'s own address, and the owners', to.join('|') === 'jordan@reed.test|owner@agency.test', to.join('|'));
  ok('  nobody named in the body got anything', !JSON.stringify(sent).includes('evil@x.test') && !JSON.stringify(sent).includes('bea@other.test'));
  const mine = sent.find(s => s.to[0] === 'jordan@reed.test');
  ok('  the client email: subject, escaped company, the review link', /We got your notes, Jordan/.test(mine.subject) && mine.html.includes('Reed &lt;Realty&gt;') && mine.html.includes('https://crm.test/portal?go=review'));
}

console.log('\napprove');
{
  reset();
  const { res, ip } = await hit(pr, { action: 'approve', name: '  Jordan\u0007 Reed  ', ip: '1.2.3.4', ua: 'forged' }, T('tok-a'));
  const call = rpcs.find(r => r.fn === 'review_approve');
  ok('200, approved', res.code === 200 && !!res.body.approved_at);
  ok('the IP is the FIRST x-forwarded-for entry, not the body\'s', call.body.p_ip === ip, JSON.stringify(call.body));
  ok('the browser is the request\'s user-agent', call.body.p_ua === 'Mozilla/5.0 Test');
  ok('the name: control characters gone, trimmed', call.body.p_name === 'Jordan  Reed');
  ok('owners told; no client mail', sent.length === 1 && sent[0].to.join() === 'owner@agency.test' && /approved their site/.test(sent[0].subject));
}

console.log('\nuploads');
{
  reset();
  let r = (await hit(pr, { action: 'upload', noteId: NOTE, kind: 'shot', ext: 'svg', bytes: 100 }, T('tok-a'))).res;
  ok('an SVG is refused', r.code === 400 && signs.length === 0);
  r = (await hit(pr, { action: 'upload', noteId: NOTE, kind: 'shot', ext: 'jpg', bytes: 11 * 1024 * 1024 }, T('tok-a'))).res;
  ok('over 10 MB is refused', r.code === 400 && signs.length === 0);
  r = (await hit(pr, { action: 'upload', noteId: NOTE, kind: 'shot', ext: 'jpg', bytes: 1000 }, T('tok-b'))).res;
  ok('client B cannot upload to A\'s note', r.code === 409 && signs.length === 0);
  r = (await hit(pr, { action: 'upload', noteId: NOTE, kind: 'shot', ext: 'jpg', bytes: 1000, path: 'LB/evil.jpg' }, T('tok-a'))).res;
  const path = r.body.path;
  ok('A gets ONE signed path the server named, in the review bucket', r.code === 200 && new RegExp(`^LA/${NOTE}-shot-[A-Za-z0-9]{12}\\.jpg$`).test(path) && signs[0].includes('/object/upload/sign/review/LA/'), JSON.stringify([r.body, signs]));
  stored[path] = NOTJPG;
  r = (await hit(pr, { action: 'attach', noteId: NOTE, kind: 'shot', path }, T('tok-a'))).res;
  ok('bytes that are not a JPEG: refused, DELETED, never recorded', r.code === 400 && removed.includes(path) && !rpcs.some(x => x.fn === 'review_set_file'));
  stored[path] = JPG; removed.length = 0; calls.length = 0;
  r = (await hit(pr, { action: 'attach', noteId: NOTE, kind: 'shot', path: `LB/${NOTE}-shot-abcdefabcdef.jpg` }, T('tok-a'))).res;
  ok('a path in another client\'s folder is refused before anything is read', r.code === 400 && !calls.some(c => c.includes('/authenticated/')));
  r = (await hit(pr, { action: 'attach', noteId: NOTE, kind: 'shot', path }, T('tok-a'))).res;
  ok('a real JPEG at the named path: recorded, and the file it replaced removed', r.code === 200 && rpcs.some(x => x.fn === 'review_set_file' && x.body.p_path === path && x.body.p_uid === UA) && removed.includes(`LA/${NOTE}-shot-oldoldoldold.jpg`));
}

console.log('\ndelete and files');
{
  reset();
  let r = (await hit(pr, { action: 'delete', id: NOTE }, T('tok-b'))).res;
  ok('B cannot delete A\'s note', r.code === 404 && removed.length === 0);
  r = (await hit(pr, { action: 'delete', id: NOTE }, T('tok-a'))).res;
  ok('A deletes their draft, and its screenshot leaves the review bucket', r.code === 200 && removed.includes(`LA/${NOTE}-shot-oldoldoldold.jpg`));
  r = (await hit(pr, { action: 'files', leadId: 'LB' }, T('tok-a'))).res;
  ok('files: links for A\'s OWN notes only (the body\'s leadId is ignored)', r.code === 200 && r.body.links[NOTE] && /\/object\/sign\/review\/LA\//.test(r.body.links[NOTE].shot) && calls.some(c => c === 'GET /rest/v1/review_notes'));
}

console.log('\nreview-admin: owners only');
{
  reset();
  for (const [label, tok] of [['a rep', 'tok-rep'], ['a client', T('tok-a')], ['nobody', null]]) {
    const r = (await hit(ra, { action: 'open', leadId: 'LA' }, tok)).res;
    ok(`${label} is refused`, r.code === 401 || r.code === 403, r.code);
  }
  ok('  and nothing was opened or sent', !rpcs.some(x => x.fn === 'review_open_round') && sent.length === 0);
  let r = (await hit(ra, { action: 'site', leadId: 'LA', url: 'https://reedrealty.com' }, 'tok-owner')).res;
  ok('a live domain is not an allowed preview host', r.code === 400 && /reedrealty\.com is not on the allowed preview hosts/.test(r.body.error));
  r = (await hit(ra, { action: 'site', leadId: 'LA', url: 'http://reed.vercel.app' }, 'tok-owner')).res;
  ok('http is refused', r.code === 400);
  r = (await hit(ra, { action: 'site', leadId: 'LA', url: 'https://reed-git-main.vercel.app/' }, 'tok-owner')).res;
  ok('an https preview on *.vercel.app is saved', r.code === 200 && patches.some(p => p.u.startsWith('/rest/v1/review_sites') && p.body.preview_url === 'https://reed-git-main.vercel.app/' && p.body.lead_id === 'LA'));
  sent = [];
  r = (await hit(ra, { action: 'open', leadId: 'LA' }, 'tok-owner')).res;
  const to = sent.map(s => s.to.join()).sort().join('|');
  ok('"Send for review": every ACTIVE login of THAT client, nobody else', r.code === 200 && r.body.emailed === 2 && to === 'jordan@reed.test|office@reed.test', to);
  ok('  the email: subject, escaped company, the review link', /Your site is ready for review/.test(sent[0].subject) && sent[0].html.includes('Reed &lt;Realty&gt;') && sent[0].html.includes('https://crm.test/portal?go=review'));
  DB.reply.open = { error: 'open' };
  r = (await hit(ra, { action: 'open', leadId: 'LA' }, 'tok-owner')).res;
  ok('a second open round: refused with a reason, nothing sent', r.code === 409 && /already open/.test(r.body.error));
}

console.log('\nreview-admin: note status');
{
  reset();
  let r = (await hit(ra, { action: 'status', noteId: NOTE, status: 'done' }, 'tok-owner')).res;
  ok('a note in a round the client has not submitted: refused', r.code === 409 && !patches.length);
  DB.notes[0].review_rounds.submitted_at = '2026-10-09T00:00:00Z';
  r = (await hit(ra, { action: 'status', noteId: NOTE, status: 'wont_do' }, 'tok-owner')).res;
  ok('won\'t do with no reason: refused', r.code === 400 && !patches.length);
  r = (await hit(ra, { action: 'status', noteId: NOTE, status: 'wont_do', reason: 'Out of scope', comment: 'rewritten', path: '/x' }, 'tok-owner')).res;
  const p = patches.find(x => x.u.startsWith('/rest/v1/review_notes'));
  ok('won\'t do + reason: ONLY status, reason, done date are written', r.code === 200 && Object.keys(p.body).sort().join() === 'done_at,reason,status' && p.body.reason === 'Out of scope' && !!p.body.done_at, JSON.stringify(p && p.body));
  patches = [];
  await hit(ra, { action: 'status', noteId: NOTE, status: 'open', reason: 'ignored' }, 'tok-owner');
  ok('reopening clears the done date and the reason', patches[0].body.done_at === null && patches[0].body.reason === '');
  r = (await hit(ra, { action: 'links', leadId: 'LA' }, 'tok-owner')).res;
  ok('links for the revision prompt last 7 days', r.code === 200 && signs.some(s => s.includes('/object/sign/review')) && r.body.links[NOTE]);
}

console.log('\nthe emails, rendered');
{
  const a = reviewReady({ agency: 'Agency', first: 'Jordan', company: 'Reed <b>', link: 'https://p/portal?go=review', round: { number: 3, extra: true }, included: 2 });
  ok('"ready for review": an extra round says quoted; HTML escaped; text has the link', /Change round 3 \(quoted\)/.test(a.html) && !a.html.includes('Reed <b>') && a.text.includes('https://p/portal?go=review'));
  const b = notesReceived({ agency: 'Agency', first: '', company: 'X', link: 'https://p', round: { number: 1 }, included: 2, count: 1 });
  ok('"we got your notes": 1 change, 1 included round left', /1 change</.test(b.html) && /Included rounds left/.test(b.html) && b.subject === '✅ We got your notes');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
