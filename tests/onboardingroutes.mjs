/* THE ONBOARDING ROUTES: THE TOKEN, THE FILES, THE RECIPIENT, THE OWNER.

   Drives the real handlers with a fake network, the way proposalroutes.mjs
   does. The fake database models the definer functions in
   ONBOARDING-MIGRATION.sql (their rules are proven on real Postgres by
   tests/onbrlsdb.mjs); the fake Storage models the four calls api/_storage.js
   makes. So this file proves the ROUTE's half of the boundary:

   onboarding-public.js (no session, by design):
     - malformed and unknown tokens get the identical 404, and nothing else is
       touched (no sign, no storage, no mail)
     - what comes back is picked by name: no onboarding id, no storage path,
       no token, no lead id, nothing private from the lead
     - save: unknown ids never reach the database; an SSN or a card number is
       refused and NOTHING is saved; a submitted onboarding refuses
     - upload-sign: only for a valid token, only an allowed slot, extension
       and size; the SERVER picks the path, inside this onboarding's folder
     - upload-done: a path from another onboarding is refused; a file whose
       bytes are not its extension, or over 50 MB, is DELETED from Storage and
       refused; a good one is listed without its path
     - resume-mail: goes to the email ON THE LEAD, never one in the request;
       once per ten minutes; the link carries the token on the configured base
     - submit: missing required answers refuse before Postgres is asked; a
       complete submit stores both prompts (Growth OS) and tells the OWNERS,
       once, and never the client's address
   onboarding-admin.js (owner only):
     - no session 401, a rep 403, neither reaches the database
     - signed links: sensitive files and SVGs download, never render, and get
       no thumbnail
     - delete removes the files from Storage BEFORE the row, and keeps the row
       when Storage refuses

   Seen red: returning row.files unpicked (paths leak); signing before the
   slot check; skipping fileKindOk; taking `to` from the body. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';
process.env.PROPOSAL_URL = 'https://proposals.agency.test';

const pub = (await import('../api/onboarding-public.js')).default;
const { PUBLIC_KEYS } = await import('../api/onboarding-public.js');
const admin = (await import('../api/onboarding-admin.js')).default;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const T = s => (s + 'A'.repeat(43)).slice(0, 43);
const OID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', OID2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
let DB, LEADS, OBJECTS, sent, calls, signed, storageDeleteOk;
const SETTINGS = { offer: { packages: [{ id: 'growth-os', name: 'Growth OS', seatsIncluded: 5 }], launchDays: 14,
  company: { name: 'Agency', email: 'hi@agency.test', logo: '/logo.png', contacts: [{ name: 'Garrett', phone: '316-555-0100', role: 'Strategy', photo: '/team/g.jpg' }] } },
  onboarding: { state: 'KS', productMap: { 'growth-os': ['website', 'suite'] } } };
const fullAnswers = {
  'biz.industry': 'realtor', 'biz.contact_name': 'Jordan Reed', 'biz.phone': '316-555-0199', 'biz.email': 'jordan@typed.test', 'biz.name': 'Reed Realty Group',
  're.license': 'SP1', 're.brokerage': 'Prairie', 're.broker_name': 'Pat', 're.broker_email': 'pat@p.test',
  'suite.goals': [{ label: 'Closings', target: '24' }, { label: 'GCI', target: '400k' }, { label: 'Leads', target: '40' }],
};
const reset = () => {
  DB = {
    [T('open')]: { id: OID, token: T('open'), lead_id: 'L1', status: 'in_progress', industry: null, lender_kind: null, products: ['website', 'suite'], package_name: 'Growth OS',
      answers: { 'biz.industry': 'realtor' }, sections: {}, files: [], resume_mailed_at: null, outputs: null, submitted_at: null,
      client_name: 'Jordan Reed', client_email: 'jordan@lead.test', client_phone: '316-555-0101', client_company: 'Reed Realty Group', client_website: '',
      plan: { goal: '24 closings', numbers: [{ label: 'Closings', value: '24' }] }, contacts: [{ name: 'Garrett', phone: '316-555-0100', email: '' }], launch_days: 14,
      checklist: { deposit_paid: { done: '2026-10-04' } } },
    [T('other')]: { id: OID2, token: T('other'), lead_id: 'L2', status: 'in_progress', products: ['website'], answers: {}, sections: {}, files: [], checklist: {} },
  };
  LEADS = { L1: { id: 'L1', email: 'jordan@lead.test', name: 'Jordan Reed', company: 'Reed Realty Group', notes: 'PRIVATE LEAD NOTES' }, L2: { id: 'L2', email: '' } };
  OBJECTS = {}; sent = []; calls = []; signed = []; storageDeleteOk = true;
};
reset();
const byId = id => Object.values(DB).find(o => o.id === id);

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const hdr = opts.headers || {};
  const body = typeof opts.body === 'string' && opts.body ? JSON.parse(opts.body) : {};
  const J = (data, okk = true, status) => ({ ok: okk, status: status || (okk ? 200 : 400), headers: new Map(), json: async () => data, text: async () => JSON.stringify(data) });
  if (u.includes('/auth/v1/user')) { const t = hdr.authorization || ''; return /good/.test(t) ? J({ id: 'u1', email: 'me@agency.test' }) : J({}, false, 401); }
  if (u.includes('/rpc/crm_whoami')) { const t = hdr.authorization || ''; return J([{ role: /owner/.test(t) ? 'owner' : 'rep', active: true }]); }
  if (u.includes('api_hits')) return J([]);
  if (u.includes('crm_users')) return J([{ email: 'logan@agency.test' }]);
  if (u.includes('api.resend.com')) { sent.push(body); return J({ id: 'm1' }); }
  if (u.includes('/rest/v1/app_settings')) { calls.push('settings'); return J([{ data: SETTINGS }]); }
  /* ---- the definer functions, modelled ---- */
  const m = u.match(/\/rpc\/(onboarding_\w+)/);
  if (m) {
    const fn = m[1]; calls.push(fn);
    const o = body.p_token && /^[A-Za-z0-9_-]{43}$/.test(body.p_token) ? DB[body.p_token] : null;
    if (fn === 'onboarding_public') return J(o ? [JSON.parse(JSON.stringify({ ...o, files: o.files.filter(f => f.state === 'ok') }))] : []);
    if (fn === 'onboarding_save') { if (!o) return J('not_found'); if (o.status === 'submitted') return J('locked'); o.answers = body.p_answers; o.sections = body.p_sections; return J('saved'); }
    if (fn === 'onboarding_file_begin') { if (!o) return J('not_found'); if (o.status === 'submitted') return J('locked'); if (!body.p_path.startsWith(o.id + '/')) return J('bad_path');
      o.files.push({ id: 'f' + (o.files.length + 1) + '0000000-0000-4000-8000-000000000000'.slice(0, 34), slot: body.p_slot, path: body.p_path, name: body.p_name, mime: body.p_mime, sensitive: body.p_sensitive, state: 'pending' }); return J('ok'); }
    if (fn === 'onboarding_file_finish') { const f = o && o.files.find(x => x.path === body.p_path && x.state === 'pending'); if (!f) return J('not_found'); f.state = 'ok'; f.bytes = body.p_bytes; return J('ok'); }
    if (fn === 'onboarding_file_drop') { if (!o || o.status === 'submitted') return J(null); const i = o.files.findIndex(x => x.id === body.p_file_id); if (i < 0) return J(null); return J(o.files.splice(i, 1)[0].path); }
    if (fn === 'onboarding_mark_mailed') { if (!o || o.status === 'submitted' || o.resume_mailed_at) return J(null); o.resume_mailed_at = Date.now(); return J(o.id); }
    if (fn === 'onboarding_submit') { if (!o) return J('not_found'); if (o.status === 'submitted') return J('already'); o.status = 'submitted'; o.submitted_at = new Date().toISOString(); o.outputs = body.p_outputs; return J('submitted'); }
    if (fn === 'onboarding_sweep_pending') return J([]);
  }
  /* ---- PostgREST reads the mail door and the admin route make ---- */
  if (u.includes('/rest/v1/onboardings?id=eq.')) {
    const id = u.match(/id=eq\.([^&]+)/)[1]; const o = byId(id);
    if (method === 'DELETE') { calls.push('row-delete'); if (o) delete DB[o.token]; return J(null); }
    return J(o ? [{ lead_id: o.lead_id, token: o.token }] : []);
  }
  if (u.includes('/rest/v1/onboarding_files?onboarding_id=eq.')) { const o = byId(u.match(/onboarding_id=eq\.([^&]+)/)[1]); return J(o ? o.files.filter(f => f.state === 'ok').map(f => ({ ...f, original_name: f.name })) : []); }
  if (u.includes('/rest/v1/leads?id=eq.')) { const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(LEADS[id] ? [{ data: LEADS[id] }] : []); }
  /* ---- Storage ---- */
  if (u.includes('/storage/v1/object/upload/sign/onboarding/')) { const p = decodeURIComponent(u.split('/upload/sign/onboarding/')[1]); signed.push(p); return J({ url: `/object/upload/sign/onboarding/${p}?token=tok` }); }
  if (u.includes('/storage/v1/object/authenticated/onboarding/')) {
    const p = decodeURIComponent(u.split('/authenticated/onboarding/')[1]); const obj = OBJECTS[p];
    if (!obj) return J({ error: 'not found' }, false, 400);
    return { ok: true, status: 206, headers: new Map([['content-range', `bytes 0-63/${obj.size}`]]), body: null, arrayBuffer: async () => new Uint8Array(obj.head).buffer };
  }
  if (u.endsWith('/storage/v1/object/onboarding') && method === 'DELETE') { calls.push('storage-delete'); if (!storageDeleteOk) return J({}, false, 500); for (const p of body.prefixes) delete OBJECTS[p]; return J([]); }
  if (u.endsWith('/storage/v1/object/sign/onboarding')) return J(body.paths.map(p => ({ path: p, signedURL: `/object/sign/onboarding/${p}?token=dl` })));
  return J({}, false, 404);
};

function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  r.end = () => r; r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
const call = async (h, body, auth) => { const res = mkRes(); await h({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body }, res); return res; };

console.log('\nthe token');
{
  reset();
  const a = await call(pub, { t: 'short' });
  const b = await call(pub, { t: T('nope') });
  ok('malformed and unknown: the same 404 text', a.code === 404 && b.code === 404 && a.body.error === b.body.error, JSON.stringify([a.body, b.body]));
  reset();
  await call(pub, { t: T('nope'), action: 'upload-sign', slot: 'logos', name: 'x.png', bytes: 100 });
  await call(pub, { t: T('nope'), action: 'resume-mail' });
  ok('  an unknown token signs nothing and sends nothing', signed.length === 0 && sent.length === 0 && !calls.includes('onboarding_file_begin'));
}

console.log('\nload: picked by name');
{
  reset();
  const r = await call(pub, { t: T('open') });
  const v = r.body.onboarding;
  ok('200 with the public view', r.code === 200 && v);
  ok('  exactly the PUBLIC_KEYS', JSON.stringify(Object.keys(v)) === JSON.stringify(PUBLIC_KEYS), Object.keys(v).join(','));
  const s = JSON.stringify(v);
  ok('  no onboarding id, token, lead id, or lead notes', !s.includes(OID) && !s.includes(T('open')) && !s.includes('"L1"') && !s.includes('PRIVATE LEAD NOTES'));
  ok('  prefilled from the lead and the proposal plan', v.answers['biz.email'] === 'jordan@lead.test' && v.answers['suite.goals'][0].target === '24');
  ok('  the proposal\'s contact, with role and photo from the offer', v.contacts.length === 1 && v.contacts[0].role === 'Strategy' && v.contacts[0].photo === '/team/g.jpg');
  ok('  deposit read from the lead checklist; launch waits for the rest', v.checklist.depositAt === '2026-10-04' && !v.launch.started && v.launch.waiting.includes('your onboarding'));
  ok('  the agency from the offer, white-label', v.agency.name === 'Agency' && v.config.state === 'KS');
}

console.log('\nsave');
{
  reset();
  let r = await call(pub, { t: T('open'), action: 'save', answers: { 'biz.name': 'Reed', 'evil.key': 'x', 'biz.industry': 'realtor' }, sections: { biz: { done: true }, nope: { done: true } } });
  ok('saved', r.code === 200 && r.body.ok, JSON.stringify(r.body));
  ok('  unknown ids never reached the database', !('evil.key' in DB[T('open')].answers) && DB[T('open')].answers['biz.name'] === 'Reed');
  ok('  unknown sections dropped', JSON.stringify(DB[T('open')].sections) === '{"biz":{"done":true}}');
  reset();
  r = await call(pub, { t: T('open'), action: 'save', answers: { 'biz.name': 'Reed', 'biz.role': 'ssn 123-45-6789' } });
  ok('an SSN is refused, naming the field', r.code === 400 && /Your role/.test(r.body.error) && r.body.field === 'biz.role', JSON.stringify(r.body));
  ok('  and NOTHING was saved', !calls.includes('onboarding_save') && DB[T('open')].answers['biz.name'] === undefined);
  r = await call(pub, { t: T('open'), action: 'save', answers: { 'biz.legal_name': '4111 1111 1111 1111' } });
  ok('a card number is refused', r.code === 400 && /card/.test(r.body.error));
  DB[T('open')].status = 'submitted';
  r = await call(pub, { t: T('open'), action: 'save', answers: { 'biz.name': 'Late' } });
  ok('a submitted onboarding refuses saves', r.code === 409 && r.body.locked);
}

console.log('\nuploads');
{
  reset();
  let r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'contacts', name: 'list.pdf', bytes: 1000 });
  ok('a PDF in the contact-list slot is refused before anything is signed', r.code === 400 && signed.length === 0 && !calls.includes('onboarding_file_begin'));
  r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'logos', name: 'big.png', bytes: 60 * 1048576 });
  ok('over 50 MB refused', r.code === 400 && /50 MB/.test(r.body.error) && signed.length === 0);
  r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'admin', name: 'x.png', bytes: 10 });
  ok('an unknown slot refused', r.code === 400 && signed.length === 0);
  r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'logos', name: '../../etc/Reed Logo.PNG', bytes: 2048 });
  const p = r.body.path || '';
  ok('a good one: signed', r.code === 200 && r.body.ok && /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/upload\/sign\/onboarding\//.test(r.body.uploadUrl), JSON.stringify(r.body));
  ok('  the SERVER chose the path: this onboarding, logos folder, a uuid, the real extension', new RegExp(`^${OID}/logos/[0-9a-f-]{36}\\.png$`).test(p), p);
  ok('  the client\'s name is not in the path', !/Reed|etc|\.\./.test(p));
  ok('  and the type is the canonical one for .png', r.body.mime === 'image/png');
  ok('  a pending row exists, not yet public', DB[T('open')].files.length === 1 && DB[T('open')].files[0].state === 'pending');

  r = await call(pub, { t: T('open'), action: 'upload-done', path: `${OID2}/logos/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png` });
  ok('upload-done for another onboarding\'s folder is refused', r.code === 400);

  OBJECTS[p] = { head: [0xFF, 0xD8, 0xFF, 0xE0], size: 2048 };       // a JPEG named .png
  r = await call(pub, { t: T('open'), action: 'upload-done', path: p });
  ok('a file whose bytes are not its extension is refused', r.code === 400 && /not really a \.png/.test(r.body.error), JSON.stringify(r.body));
  ok('  and DELETED from Storage', !OBJECTS[p] && calls.includes('storage-delete'));
  ok('  and never listed', DB[T('open')].files.every(f => f.state === 'pending'));

  reset();
  r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'logos', name: 'logo.png', bytes: 2048 });
  const p2 = r.body.path;
  OBJECTS[p2] = { head: PNG, size: 51 * 1048576 };
  r = await call(pub, { t: T('open'), action: 'upload-done', path: p2 });
  ok('over 50 MB once uploaded: deleted and refused', r.code === 400 && !OBJECTS[p2]);

  reset();
  r = await call(pub, { t: T('open'), action: 'upload-sign', slot: 'logos', name: 'logo.png', bytes: 2048 });
  const p3 = r.body.path;
  OBJECTS[p3] = { head: PNG, size: 2048 };
  r = await call(pub, { t: T('open'), action: 'upload-done', path: p3 });
  ok('a real PNG: listed', r.code === 200 && r.body.ok && r.body.files.length === 1 && r.body.files[0].name === 'logo.png', JSON.stringify(r.body));
  ok('  without its storage path', !JSON.stringify(r.body).includes(p3) && !('path' in r.body.files[0]));
  ok('  with the size Storage reported', DB[T('open')].files[0].bytes === 2048);
  r = await call(pub, { t: T('open'), action: 'file-remove', id: DB[T('open')].files[0].id });
  ok('remove: the row and the object both go', r.body.ok && r.body.files.length === 0 && !OBJECTS[p3]);
}

console.log('\nresume mail: the recipient comes from the record');
{
  reset();
  let r = await call(pub, { t: T('open'), action: 'resume-mail', to: 'attacker@evil.test', email: 'attacker@evil.test' });
  ok('sent', r.code === 200 && r.body.ok, JSON.stringify(r.body));
  ok('  to the email ON THE LEAD, never the request', sent.length === 1 && sent[0].to.join() === 'jordan@lead.test' && !JSON.stringify(sent).includes('evil.test'), JSON.stringify(sent[0] && sent[0].to));
  ok('  not to the address they typed into the form either', !sent[0].to.includes('jordan@typed.test'));
  ok('  the link: the configured base, the cosmetic slug, the token in the fragment', sent[0].html.includes(`https://proposals.agency.test/onboarding/reed-realty-group#t=${T('open')}`));
  ok('  the tone: "We saved your seat. You\'re X of Y sections in."', /saved your seat/.test(sent[0].html) && /You're 0 of 8 sections in/.test(sent[0].html), sent[0].html.slice(0, 400));
  r = await call(pub, { t: T('open'), action: 'resume-mail' });
  ok('a second ask inside ten minutes: too soon, nothing sent', r.body.tooSoon && sent.length === 1);
  reset();
  r = await call(pub, { t: T('other'), action: 'resume-mail' });
  ok('a lead with no email: nothing sent, says so', !r.body.ok && /do not have an email/.test(r.body.error) && sent.length === 0);
}

console.log('\nsubmit');
{
  reset();
  let r = await call(pub, { t: T('open'), action: 'submit' });
  ok('missing required answers: refused, listed, Postgres never asked', r.code === 400 && r.body.missing.length > 0 && !calls.includes('onboarding_submit'), JSON.stringify(r.body).slice(0, 200));
  DB[T('open')].answers = fullAnswers;
  r = await call(pub, { t: T('open'), action: 'submit' });
  ok('complete: submitted', r.code === 200 && r.body.result === 'submitted', JSON.stringify(r.body).slice(0, 300));
  const out = DB[T('open')].outputs;
  ok('  both prompts stored (Growth OS)', out && out.websitePrompt.startsWith('# Website build: Reed Realty Group') && out.suitePrompt.startsWith('# Business Suite setup'));
  ok('  the owners were told, once, by the owners door', sent.length === 1 && sent[0].to.slice().sort().join() === 'logan@agency.test,owner@agency.test' && /Reed Realty Group finished onboarding/.test(sent[0].subject), JSON.stringify(sent.map(s => s.to)));
  ok('  and never the client', !JSON.stringify(sent).includes('jordan@'));
  ok('  the view now shows submitted', r.body.onboarding.status === 'submitted' && r.body.onboarding.submittedAt);
  r = await call(pub, { t: T('open'), action: 'submit' });
  ok('submitting again: already, no second email', r.body.result === 'already' && sent.length === 1);
}

console.log('\nadmin: owners only');
{
  reset();
  let r = await call(admin, { action: 'files', id: OID });
  ok('no session: 401', r.code === 401);
  const before = calls.length;
  r = await call(admin, { action: 'files', id: OID }, 'good-rep');
  ok('a rep: 403, and the database is never read', r.code === 403 && calls.length === before);
  DB[T('open')].files = [
    { id: 'f1', slot: 'logos', path: `${OID}/logos/l.png`, name: 'logo.png', mime: 'image/png', bytes: 10, sensitive: false, state: 'ok' },
    { id: 'f2', slot: 'documents', path: `${OID}/documents/e.pdf`, name: 'EIN letter.pdf', mime: 'application/pdf', bytes: 10, sensitive: true, state: 'ok' },
    { id: 'f3', slot: 'logos', path: `${OID}/logos/v.svg`, name: 'vector.svg', mime: 'image/svg+xml', bytes: 10, sensitive: false, state: 'ok' },
    { id: 'f4', slot: 'logos', path: `${OID}/logos/p.png`, name: 'pending.png', mime: 'image/png', bytes: 10, sensitive: false, state: 'pending' },
  ];
  r = await call(admin, { action: 'files', id: OID }, 'good-owner');
  const f = r.body.files || [];
  ok('owner: signed links for checked files only', r.body.ok && f.length === 3 && f.every(x => /token=dl/.test(x.url)), JSON.stringify(r.body).slice(0, 300));
  ok('  a PNG gets a thumbnail and renders', f[0].thumb && !/download=/.test(f[0].url));
  ok('  the EIN letter downloads, no thumbnail', /download=EIN%20letter\.pdf/.test(f[1].url) && f[1].thumb === null);
  ok('  an SVG downloads, no thumbnail', /download=vector\.svg/.test(f[2].url) && f[2].thumb === null);
  r = await call(admin, { action: 'link', id: OID }, 'good-owner');
  ok('link: built on the configured base with the token', r.body.link === `https://proposals.agency.test/onboarding/reed-realty-group#t=${T('open')}`, r.body.link);
  storageDeleteOk = false;
  r = await call(admin, { action: 'delete', id: OID }, 'good-owner');
  ok('delete: Storage refuses -> the row is KEPT', !r.body.ok && !!DB[T('open')] && !calls.includes('row-delete'));
  storageDeleteOk = true; calls = [];
  r = await call(admin, { action: 'delete', id: OID }, 'good-owner');
  ok('delete: files first, then the row', r.body.ok && calls.indexOf('storage-delete') >= 0 && calls.indexOf('storage-delete') < calls.indexOf('row-delete') && !DB[T('open')], calls.join(','));
  r = await call(admin, { action: 'files', id: "x' or 1=1" }, 'good-owner');
  ok('a malformed id never reaches the database', r.code === 400);
}

console.log(`\nonboardingroutes: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
