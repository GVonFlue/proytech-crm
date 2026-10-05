/* TERMS OF SERVICE AND PRIVACY POLICY, AGREED AT ACCEPTANCE.
   ============================================================================

   The rules, each proven here (the page's checkbox is in tests/proposalpage.mjs,
   the SQL itself against real Postgres in tests/proposalsdb.mjs):

   - Settings: offer.legal is all-or-nothing, https only, with a version. No
     URL is in the code; the shipped PROPOSAL-OFFER.json carries them.
   - It is frozen into the proposal body at send, like every other term, and
     it reaches the public page (PUBLIC_BODY_KEYS).
   - The route refuses an acceptance without agreeTerms when the proposal has
     legal links, and never calls the database for it; it passes the agreement
     to proposal_accept, and a 'terms_required' from Postgres is a 400.
   - The client gets a copy ("You're in") ONLY at the email on the lead,
     whatever the request says; once, on a new acceptance; and a mail failure
     never undoes the acceptance.
   - The CRM shows who, when, from where, and which version, from one function.
   - The migration: the static shape (proposalsdb.mjs runs it for real).

   Seen red: removing the route's agreeTerms check; sending the client copy on
   'already'; reading `to` from the request body.                           */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';
process.env.PROPOSAL_URL = 'https://proposals.test';

import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const P = await import('../src/lib/proposal.js');
const pub = (await import('../api/proposal-public.js')).default;
const { PUBLIC_BODY_KEYS, clientAcceptedEmail } = await import('../api/proposal-public.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const clone = v => JSON.parse(JSON.stringify(v));
const RAW = JSON.parse(read('PROPOSAL-OFFER.json'));
const LEGAL = { termsUrl: 'https://getproytech.com/terms', privacyUrl: 'https://getproytech.com/privacy', version: '2026-10-04' };

console.log('\nSettings: offer.legal');
{
  ok('the shipped offer carries the Terms, Privacy and version', JSON.stringify(RAW.legal) === JSON.stringify(LEGAL), JSON.stringify(RAW.legal));
  ok('  and is still valid', P.validateOffer(RAW).ok, JSON.stringify(P.validateOffer(RAW).errors));
  const { offer } = P.readOffer({ offer: RAW });
  ok('readOffer keeps it', JSON.stringify(offer.legal) === JSON.stringify(LEGAL));
  const none = clone(RAW); delete none.legal;
  ok('no legal block: valid, and legal is null (no box on the page)', P.validateOffer(none).ok && P.readOffer({ offer: none }).offer.legal === null);
  const blank = clone(RAW); blank.legal = { termsUrl: '', privacyUrl: '', version: '' };
  ok('an all-blank block counts as none', P.validateOffer(blank).ok && P.readOffer({ offer: blank }).offer.legal === null);
  const half = clone(RAW); half.legal = { termsUrl: LEGAL.termsUrl, privacyUrl: '', version: '' };
  const hv = P.validateOffer(half);
  ok('all-or-nothing: a Terms link alone is refused, naming the missing fields', !hv.ok && hv.errors.some(e => e.path === 'legal.privacyUrl') && hv.errors.some(e => e.path === 'legal.version'), JSON.stringify(hv.errors));
  const http = clone(RAW); http.legal = { ...LEGAL, privacyUrl: 'http://getproytech.com/privacy' };
  ok('https only', P.validateOffer(http).errors.some(e => e.path === 'legal.privacyUrl'));
  const js = clone(RAW); js.legal = { ...LEGAL, termsUrl: 'javascript:alert(1)' };
  ok('  a javascript: link is refused', P.validateOffer(js).errors.some(e => e.path === 'legal.termsUrl'));
  const nov = clone(RAW); nov.legal = { ...LEGAL, version: '  ' };
  ok('a version is required', P.validateOffer(nov).errors.some(e => e.path === 'legal.version'));
  ok('no ProyTech URL is in the code', !/getproytech\.com\/(terms|privacy)/.test(read('src/lib/proposal.js') + read('api/proposal-public.js') + read('src/proposal/main.jsx') + read('src/Proposals.jsx')));
}

console.log('\nfrozen into the proposal at send');
{
  const { offer } = P.readOffer({ offer: RAW });
  const q = P.quote(offer, { packageId: 'growth-os', addonIds: [], seats: 5 });
  const body = P.buildBody({ offer, q, copy: { headline: 'H' }, client: { name: 'C', company: 'C Co' }, preparedOn: '2026-10-04', validDays: 7 });
  ok('the body carries the legal block', JSON.stringify(body.legal) === JSON.stringify(LEGAL));
  const before = JSON.stringify(body.legal);
  offer.legal.version = '2027-01-01'; offer.legal.termsUrl = 'https://elsewhere.test/t';
  ok('changing Settings afterwards does not reach a sent proposal', JSON.stringify(body.legal) === before);
  ok('hasLegal: yes with links, no without', P.hasLegal(body) && !P.hasLegal({}) && !P.hasLegal({ legal: null }) && !P.hasLegal({ legal: { termsUrl: '', privacyUrl: '' } }));
  ok('the public page receives it (PUBLIC_BODY_KEYS)', PUBLIC_BODY_KEYS.includes('legal'));
}

/* ---- the route, against a fake database modelling PROPOSALS-LEGAL-MIGRATION.sql */
const T = s => (s + 'A'.repeat(43)).slice(0, 43);
const future = new Date(Date.now() + 5 * 864e5).toISOString();
const BODY = { client: { name: 'Dee Client', company: 'Dee Co' }, company: { name: 'Agency', website: 'agency.test' }, preparedOn: '2026-10-04', validDays: 7,
  quote: { packageId: 'growth-os', items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package' }, { id: 'automations', name: 'Automations', kind: 'addon' }],
    setup: 3000, deposit: 1500, depositPct: 50, monthly: 299, prepay: { months: 12, free: 2, total: 2990 } }, legal: LEGAL };
let DB, sent, calls, leads, resendFails;
const reset = () => {
  DB = [
    { id: '11111111-1111-4111-8111-111111111111', token: T('legal'), status: 'sent', body: clone(BODY), lead_id: 'L1', expires_at: future },
    { id: '22222222-2222-4222-8222-222222222222', token: T('plain'), status: 'sent', body: (({ legal, ...b }) => clone(b))(BODY), lead_id: 'L1', expires_at: future },
    { id: '33333333-3333-4333-8333-333333333333', token: T('noemail'), status: 'sent', body: clone(BODY), lead_id: 'L2', expires_at: future },
  ];
  leads = { L1: { id: 'L1', email: 'dee@dee.co', name: 'Dee Client' }, L2: { id: 'L2', name: 'No Email' } };
  sent = []; calls = []; resendFails = false;
};
reset();
const needs = b => !!(b && b.legal && typeof b.legal === 'object' && (b.legal.termsUrl || b.legal.privacyUrl));
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  const J = (data, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => data, text: async () => JSON.stringify(data) });
  if (u.includes('api_hits')) return J([]);
  if (u.includes('crm_users')) return J([]);
  if (u.includes('api.resend.com')) { if (resendFails) return J({ message: 'resend down' }, false); sent.push(body); return J({ id: 'm' + sent.length }); }
  if (u.includes('/rpc/proposal_public')) {
    const r = DB.find(p => p.token === body.p_token && p.status !== 'draft');
    return J(r ? [{ status: r.status, body: r.body, expires_at: r.expires_at, accepted_at: r.accepted_at || null, accepted_name: r.accepted_name || null, accepted_plan: r.accepted_plan || null }] : []);
  }
  if (u.includes('/rpc/proposal_mark_viewed')) return J(null);
  if (u.includes('/rpc/proposal_accept')) {
    calls.push({ fn: 'accept', args: body });
    const r = DB.find(p => p.token === body.p_token);
    if (!r) return J('not_found');
    if (r.status === 'accepted') return J('already');
    if (!body.p_name || body.p_name.trim().length < 2) return J('bad_name');
    if (needs(r.body) && body.p_agreed_terms !== true) return J('terms_required');
    Object.assign(r, { status: 'accepted', accepted_name: body.p_name, accepted_ip: body.p_ip, accepted_plan: body.p_plan, accepted_at: '2026-10-05T19:14:00.000Z',
      ...(needs(r.body) ? { accepted_terms_version: r.body.legal.version, accepted_terms_url: r.body.legal.termsUrl, accepted_privacy_url: r.body.legal.privacyUrl } : {}) });
    return J('accepted');
  }
  if (u.includes('/rest/v1/proposals?token=eq.')) { const t = decodeURIComponent(u.match(/token=eq\.([^&]+)/)[1]); const r = DB.find(p => p.token === t); return J(r ? [{ id: r.id, accepted_at: r.accepted_at || null }] : []); }
  if (u.includes('/rest/v1/proposals?id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; const r = DB.find(p => p.id === id); return J(r ? [{ lead_id: r.lead_id }] : []); }
  if (u.includes('/rest/v1/leads?id=eq.')) { const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(leads[id] ? [{ data: leads[id] }] : []); }
  return J({}, false);
};
const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
let ipN = 0;
const hit = async body => { const res = mkRes(); const ip = '10.0.0.' + (++ipN % 250);
  await pub({ method: 'POST', headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: ip }, body }, res); return res; };
const clientMail = () => sent.filter(m => /You're in/.test(m.subject || ''));
const ownerMail = () => sent.filter(m => /accepted their proposal/.test(m.subject || ''));

console.log('\nthe route: no agreement, no acceptance');
{
  reset();
  let r = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true });
  ok('no agreeTerms: 400, with the reason', r.code === 400 && /Terms of Service and Privacy Policy/.test(r.body.error), JSON.stringify(r.body));
  ok('  and the database was never asked', !calls.length);
  r = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true, agreeTerms: 'yes' });
  ok('agreeTerms must be exactly true ("yes" is not)', r.code === 400 && !calls.length);
  ok('  nothing recorded, nobody emailed', DB[0].status === 'sent' && !sent.length);
  r = await hit({ t: T('plain'), action: 'accept', name: 'Pat Plain', agree: true });
  ok('a proposal WITHOUT legal links accepts without it, as before', r.code === 200 && r.body.result === 'accepted' && calls[0].args.p_agreed_terms === false);
}

console.log('\nthe route: Postgres is the boundary');
{
  reset();
  /* a body that hides its legal block from the route (as if the route's
     check were bypassed): the fake database still refuses, and the route
     turns that into a 400, not a success */
  const saved = DB[0].body; DB[0].body = { ...saved }; const real = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { if (String(url).includes('/rpc/proposal_public')) { const res = await real(url, opts); const rows = await res.json(); rows.forEach(x => { x.body = { ...x.body, legal: null }; }); return { ok: true, status: 200, json: async () => rows }; } return real(url, opts); };
  const r = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true });
  globalThis.fetch = real;
  ok('terms_required from proposal_accept is a 400', r.code === 400 && /Terms of Service/.test(r.body.error), JSON.stringify(r.body));
  ok('  nothing recorded, no mail', DB[0].status === 'sent' && !sent.length);
}

console.log('\nthe route: agreed');
{
  reset();
  const r = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true, agreeTerms: true, plan: 'monthly',
    to: 'attacker@evil.test', email: 'attacker@evil.test', termsUrl: 'https://evil.test/t', version: 'X' });
  ok('accepted', r.code === 200 && r.body.result === 'accepted', JSON.stringify(r.body));
  ok('p_agreed_terms: true reaches proposal_accept', calls[0].args.p_agreed_terms === true);
  ok('  and NO terms URL or version is passed: Postgres copies them from the stored body', !('p_terms_url' in calls[0].args) && !('p_version' in calls[0].args) && !JSON.stringify(calls[0].args).includes('evil'));
  ok('the record holds the stored version and links', DB[0].accepted_terms_version === '2026-10-04' && DB[0].accepted_terms_url === LEGAL.termsUrl && DB[0].accepted_privacy_url === LEGAL.privacyUrl);
  const cm = clientMail();
  ok('the client gets one copy', cm.length === 1, sent.map(m => m.subject));
  ok('  ONLY at the email on the lead (the to/email in the request are ignored)', cm[0] && JSON.stringify(cm[0].to) === '["dee@dee.co"]' && !JSON.stringify(sent).includes('evil.test'), cm[0] && cm[0].to);
  ok('the owners are still told, separately', ownerMail().length === 1 && !ownerMail()[0].to.includes('dee@dee.co'));
  const h = cm[0].html, t = cm[0].text;
  ok('subject: "You\'re in"', /^You're in, Dee\./.test(cm[0].subject), cm[0].subject);
  ok('it names the package', /Growth OS \+ Automations/.test(t));
  ok('  setup, deposit and monthly', /Setup: \$3,000/.test(t) && /Deposit \(50%\): \$1,500 due now/.test(t) && /Monthly: \$299\/mo from launch/.test(t), t);
  ok('  the date and time, in the calendar zone, with the zone named', /Accepted: Oct 5, 2026, 2:14 PM CDT by Dee Client/.test(t), t);
  ok('  the link back to the proposal', /View your proposal: https:\/\/proposals\.test\/p\//.test(t) && h.includes('https://proposals.test/p/'), t);
  ok('  the Terms and Privacy links with the version', h.includes(`href="${LEGAL.termsUrl}"`) && h.includes(`href="${LEGAL.privacyUrl}"`) && /version 2026-10-04/.test(h) && t.includes(LEGAL.termsUrl) && t.includes(LEGAL.privacyUrl));
  sent = [];
  const again = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true, agreeTerms: true });
  ok('accepting again: "already", and NO second copy', again.body.result === 'already' && !sent.length);
}

console.log('\nthe route: the copy is fail-soft');
{
  reset(); resendFails = true;
  let r = await hit({ t: T('legal'), action: 'accept', name: 'Dee Client', agree: true, agreeTerms: true });
  ok('the mail service failing does not undo the acceptance', r.code === 200 && r.body.result === 'accepted' && DB[0].status === 'accepted');
  resendFails = false;
  r = await hit({ t: T('noemail'), action: 'accept', name: 'No Email', agree: true, agreeTerms: true });
  ok('a lead with no email: accepted, and no client copy is sent anywhere', r.code === 200 && r.body.result === 'accepted' && !clientMail().length, sent.map(m => m.to));
}

console.log('\nthe email itself');
{
  const m = clientAcceptedEmail({ body: BODY, name: 'Dee Client', plan: 'annual', acceptedAt: '2026-10-05T19:14:00.000Z', link: 'https://proposals.test/p/x', tz: 'America/Chicago' });
  ok('the prepay plan is named when chosen', /Your plan: 12 months up front: \$2,990 at launch/.test(m.text), m.text);
  const plain = clientAcceptedEmail({ body: (({ legal, ...b }) => b)(BODY), name: 'Pat', plan: 'monthly', acceptedAt: '2026-10-05T19:14:00.000Z', link: 'https://x' });
  ok('no legal block: no Terms paragraph', !/Terms of Service/.test(plain.html) && !/Terms of Service/.test(plain.text));
  const evil = clientAcceptedEmail({ body: { ...BODY, client: { company: '<script>x</script>' } }, name: '<b>Dee</b>', plan: 'monthly', acceptedAt: '2026-10-05T19:14:00.000Z', link: 'https://x' });
  ok('names are escaped in the html', !evil.html.includes('<script>') && !evil.html.includes('<b>Dee'));
}

console.log('\nthe CRM record');
{
  const p = { accepted_name: 'Dee Client', accepted_at: '2026-10-05T19:14:00.000Z', accepted_ip: '9.8.7.6', accepted_terms_version: '2026-10-04', accepted_terms_url: LEGAL.termsUrl, accepted_privacy_url: LEGAL.privacyUrl };
  const r = P.acceptanceRecord(p);
  ok('"Accepted by [name] on [date, time] from IP [ip]."', r.base === 'Accepted by Dee Client on Oct 5, 2026, 2:14 PM CDT from IP 9.8.7.6.', r.base);
  ok('"Agreed to Terms of Service and Privacy Policy, version [version]."', r.agreed === 'Agreed to Terms of Service and Privacy Policy, version 2026-10-04.');
  ok('  with the links', r.termsUrl === LEGAL.termsUrl && r.privacyUrl === LEGAL.privacyUrl && r.text.includes(LEGAL.termsUrl) && r.text.includes(LEGAL.privacyUrl));
  const old = P.acceptanceRecord({ accepted_name: 'Pat', accepted_at: '2026-10-05T19:14:00.000Z', accepted_ip: '1.1.1.1' });
  ok('an acceptance without terms says only who, when, where', old.text === old.base && !/Agreed/.test(old.text));
  const bad = P.acceptanceRecord({ ...p, accepted_terms_url: 'javascript:alert(1)' });
  ok('a stored link that is not https is not shown as a link', bad.termsUrl === '' && !bad.text.includes('javascript'));
  const patch = P.acceptancePatch({ id: 'L1', activities: [] }, { ...p, id: 'P1', status: 'accepted', accepted_plan: 'monthly', body: BODY }, [{ key: 'won', won: true }], '2026-10-05');
  const act = JSON.stringify((patch || {}).activities || []);
  ok('the lead activity says the same, from the same function', act.includes(r.base) && act.includes(r.agreed) && act.includes(LEGAL.termsUrl) && act.includes(LEGAL.privacyUrl), act.slice(0, 400));
  const ui = read('src/Proposals.jsx');
  ok('the proposal detail screen renders acceptanceRecord, with both links', /acceptanceRecord\(/.test(ui) && /rec\.termsUrl/.test(ui) && /rec\.privacyUrl/.test(ui));
  ok('Settings has the Legal card (Terms, Privacy, version)', ['legal.termsUrl', 'legal.privacyUrl', 'legal.version'].every(k => ui.includes(k)));
  const sb = read('src/lib/supabase.js');
  ok('the CRM list selects the three columns', ['accepted_terms_version', 'accepted_terms_url', 'accepted_privacy_url'].every(c => sb.includes(`'${c}'`)));
  ok('  and falls back, by name, if the migration has not run', /accepted_\(terms\|privacy\)/.test(sb) && /PROPOSALS-LEGAL-MIGRATION\.sql/.test(sb));
}

console.log('\nthe migration (shape; tests/proposalsdb.mjs runs it)');
{
  const sql = read('PROPOSALS-LEGAL-MIGRATION.sql');
  ok('one transaction', /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && sql.indexOf('begin;') < sql.indexOf('commit;'));
  ok('three columns, idempotent', ['accepted_terms_version', 'accepted_terms_url', 'accepted_privacy_url'].every(c => new RegExp(`add column if not exists ${c}\\s`).test(sql)));
  ok('the five-argument function is security definer with a fixed search_path', /proposal_accept\(p_token text, p_name text, p_ip text, p_plan text, p_agreed_terms boolean\)[\s\S]*?security definer[\s\S]*?set search_path = public/.test(sql));
  ok('it refuses with terms_required unless agreed is exactly true', /p_agreed_terms is distinct from true then return 'terms_required'/.test(sql));
  ok('the terms check comes before the update', sql.indexOf("'terms_required'") < sql.indexOf('update proposals'));
  ok('the record is copied from the stored body', /legal := case when jsonb_typeof\(r\.body->'legal'\)/.test(sql) && /accepted_terms_url\s*= case when needs_terms then left\(legal->>'termsUrl'/.test(sql));
  ok('the old four-argument function calls the new one with false', /select proposal_accept\(p_token, p_name, p_ip, p_plan, false\)/.test(sql));
  ok('both revoked from anon/authenticated, granted to service_role', /revoke all on function proposal_accept\(text, text, text, text, boolean\) from public, anon, authenticated/.test(sql)
    && /revoke all on function proposal_accept\(text, text, text, text\)\s+from public, anon, authenticated/.test(sql)
    && /grant execute on function proposal_accept\(text, text, text, text, boolean\) to service_role/.test(sql));
  ok('it verifies itself before commit', sql.indexOf('PROPOSALS-LEGAL OK') < sql.indexOf('commit;') && /raise exception/.test(sql));
  ok('VERIFY-RLS §12 has the legal checks', /terms_required/.test(read('VERIFY-RLS.md')) && /accepted_terms_version/.test(read('VERIFY-RLS.md')));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
