/* THE CLIENT PORTAL'S SERVER DOORS (B-1), driven with a fake network.
   ============================================================================

   The fake Supabase below models PORTAL-MIGRATION.sql's server functions
   (portal_login_target, portal_invite_target, portal_link_client) and the
   admin API. The Postgres half is proven by tests/portaldb.mjs.

   api/portal-login.js (public):
     - the reply is byte-identical for an unknown, an inactive and a known
       email, so the page cannot be used to learn who has a portal
     - a link is made only for an active client, and emailed to the address
       ON THE ROW, whatever the request carries
     - the link lands on the portal: redirect_to is fixed by the server
     - it never creates a login (no /auth/v1/signup, no admin create)
   proposal-public.js, at acceptance:
     - makes the login and sends "your portal is ready" to the LEAD's email
     - once: a lead that already has a portal gets nothing new
     - a CRM user's address is refused by the link, and nothing is sent
     - fail-soft: a failure never undoes the acceptance
   api/portal-admin.js (owner only):
     - a rep is refused; an owner invites, resends, removes
     - remove switches the row off AND bans the login
     - resend is refused for someone removed

   Seen red: reading the recipient from the request; answering "no such
   email" differently; dropping requireOwner from portal-admin.             */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'Agency <hi@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const UA = '00000000-0000-4000-8000-0000000000c1', UGONE = '00000000-0000-4000-8000-0000000000c3', UNEW = '00000000-0000-4000-8000-0000000000c9';
let DB, sent, links, calls, patches, bans;
const reset = () => {
  DB = {
    client_users: [{ id: UA, lead_id: 'LA', email: 'jordan@reed.test', name: 'Jordan Reed', active: true }, { id: UGONE, lead_id: 'LG', email: 'gone@x.test', name: 'Gone', active: false }],
    crm_emails: ['rep@agency.test'],
    leads: { LA: { name: 'Jordan Reed', email: 'jordan@reed.test', company: 'Reed Realty Group' }, LB: { name: 'Bea', email: 'bea@other.test', company: 'Other Co' }, LR: { name: 'Rep As Client', email: 'rep@agency.test' } },
    proposals: [
      { id: '11111111-1111-4111-8111-111111111111', token: 'T'.repeat(43), lead_id: 'LB', status: 'sent', body: { client: { company: 'Other Co' }, company: { name: 'Agency' }, quote: { setup: 3000, deposit: 1500 } }, expires_at: new Date(Date.now() + 864e5).toISOString() },
      { id: '22222222-2222-4222-8222-222222222222', token: 'U'.repeat(43), lead_id: 'LA', status: 'sent', body: { client: { company: 'Reed' }, company: { name: 'Agency' }, quote: {} }, expires_at: new Date(Date.now() + 864e5).toISOString() },
      { id: '33333333-3333-4333-8333-333333333333', token: 'V'.repeat(43), lead_id: 'LR', status: 'sent', body: { client: { company: 'R' }, company: { name: 'Agency' }, quote: {} }, expires_at: new Date(Date.now() + 864e5).toISOString() },
    ],
  };
  sent = []; links = []; calls = []; patches = []; bans = [];
};
reset();
const uidFor = email => (DB.client_users.find(c => c.email === email) || {}).id || (email === 'rep@agency.test' ? '00000000-0000-4000-8000-0000000000e1' : UNEW);
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url).replace('https://x.supabase.co', ''); const m = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  const h = opts.headers || {}; const tok = String(h.authorization || h.Authorization || '').replace(/^Bearer /, '');
  const J = (d, okk = true, st) => ({ ok: okk, status: st || (okk ? 200 : 400), json: async () => d, text: async () => JSON.stringify(d) });
  calls.push(m + ' ' + u.split('?')[0]);
  if (u.includes('api_hits')) return J([]);
  if (u.includes('/auth/v1/user')) return /owner|rep/.test(tok) ? J({ id: 'u-' + tok }) : J({}, false, 401);
  if (u.includes('/rpc/crm_whoami')) return J([{ role: /owner/.test(tok) ? 'owner' : /rep/.test(tok) ? 'rep' : 'none', active: true }]);
  if (u.includes('api.resend.com')) { sent.push(body); return J({ id: 'm' + sent.length }); }
  if (u.includes('/auth/v1/signup') || (u.endsWith('/auth/v1/admin/users') && m === 'POST')) { calls.push('CREATED A LOGIN'); return J({ id: 'x' }); }
  if (u.includes('/auth/v1/admin/generate_link')) { links.push(body); return J({ id: uidFor(body.email), action_link: `https://x.supabase.co/auth/v1/verify?token=tok-${links.length}&type=${body.type}&redirect_to=${encodeURIComponent(body.redirect_to)}` }); }
  if (/\/auth\/v1\/admin\/users\/[0-9a-f-]+$/.test(u) && m === 'PUT') { bans.push({ id: u.split('/').pop(), body }); return J({}); }
  if (u.includes('/rpc/portal_login_target')) { const r = DB.client_users.find(c => c.email === String(body.p_email).toLowerCase() && c.active); return J(r ? [{ id: r.id, email: r.email }] : []); }
  if (u.includes('/rpc/portal_invite_target')) {
    const p = DB.proposals.find(x => x.id === body.p_proposal_id); const l = p && DB.leads[p.lead_id];
    if (!l || !l.email) return J([]);
    const c = DB.client_users.find(x => x.email === l.email);
    return J([{ lead_id: p.lead_id, email: l.email, name: l.name, company: l.company || l.name, client_user_id: c ? c.id : null }]);
  }
  if (u.includes('/rpc/portal_link_client')) {
    const email = (links[links.length - 1] || {}).email;
    if (DB.crm_emails.includes(email)) return J('crm_user');
    const cur = DB.client_users.find(c => c.id === body.p_uid);
    if (cur && cur.lead_id !== body.p_lead_id) return J('other_client');
    if (!cur) DB.client_users.push({ id: body.p_uid, lead_id: body.p_lead_id, email, name: body.p_name, active: true }); else cur.active = true;
    return J('linked');
  }
  if (u.startsWith('/rest/v1/client_users')) {
    const id = (u.match(/[?&]id=eq\.([^&]+)/) || [])[1], lead = decodeURIComponent((u.match(/[?&]lead_id=eq\.([^&]+)/) || [])[1] || '');
    if (m === 'PATCH') { patches.push({ id, body }); const r = DB.client_users.find(c => c.id === id); if (r) Object.assign(r, body); return { ok: true, status: 204, json: async () => null }; }
    let rows = DB.client_users.filter(c => (id ? c.id === id : true) && (lead ? c.lead_id === lead : true));
    if (/active=is\.true/.test(u)) rows = rows.filter(c => c.active);
    return J(rows.map(c => ({ ...c })));
  }
  if (u.startsWith('/rest/v1/leads')) { const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(DB.leads[id] ? [{ data: DB.leads[id] }] : []); }
  /* proposal-public's own calls */
  if (u.includes('/rpc/proposal_public')) { const p = DB.proposals.find(x => x.token === body.p_token); return J(p ? [{ status: p.status, body: p.body, expires_at: p.expires_at }] : []); }
  if (u.includes('/rpc/proposal_mark_viewed')) return J(null);
  if (u.includes('/rpc/proposal_accept')) { const p = DB.proposals.find(x => x.token === body.p_token); if (p.status === 'accepted') return J('already'); p.status = 'accepted'; p.accepted_at = new Date().toISOString(); return J('accepted'); }
  if (u.includes('/rpc/onboarding_for_proposal')) return J([]);
  if (u.startsWith('/rest/v1/proposals')) {
    const tk = (u.match(/token=eq\.([^&]+)/) || [])[1], id = (u.match(/id=eq\.([^&]+)/) || [])[1];
    const p = DB.proposals.find(x => (tk && x.token === decodeURIComponent(tk)) || (id && x.id === id));
    return J(p ? [{ id: p.id, lead_id: p.lead_id, accepted_at: p.accepted_at }] : []);
  }
  return J({}, false, 404);
};
const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
let n = 0;
const hit = async (h, body, tok) => { const ip = '10.9.0.' + (++n % 250); const res = mkRes(); await h({ method: 'POST', headers: { 'x-forwarded-for': ip, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, socket: { remoteAddress: ip }, body }, res); return res; };

const login = (await import('../api/portal-login.js')).default;
const { SAME_REPLY } = await import('../api/portal-login.js');
const admin = (await import('../api/portal-admin.js')).default;
const pub = (await import('../api/proposal-public.js')).default;
const { portalUrl } = await import('../api/_portal.js');

console.log('\nportal-login: the same reply for everyone');
{
  reset();
  const known = await hit(login, { email: ' Jordan@Reed.test ' });
  const unknown = await hit(login, { email: 'nobody@nowhere.test' });
  const removed = await hit(login, { email: 'gone@x.test' });
  ok('known, unknown and removed all get the identical reply', [known, unknown, removed].every(r => r.code === 200 && JSON.stringify(r.body) === JSON.stringify({ ok: true, message: SAME_REPLY })), [known, unknown, removed].map(r => JSON.stringify(r.body)).join(' | '));
  ok('only the known, active client got a link', links.length === 1 && links[0].email === 'jordan@reed.test' && links[0].type === 'magiclink');
  ok('  emailed to the address on their row', sent.length === 1 && JSON.stringify(sent[0].to) === '["jordan@reed.test"]');
  ok('  landing on the portal, fixed by the server', links[0].redirect_to === 'https://crm.test/portal' && portalUrl() === 'https://crm.test/portal');
  ok('no login was ever created', !calls.includes('CREATED A LOGIN'));
  reset();
  const r = await hit(login, { email: 'jordan@reed.test', to: 'attacker@evil.test', redirect_to: 'https://evil.test', redirectTo: 'https://evil.test' });
  ok('a request carrying to / redirect_to changes nothing', r.code === 200 && JSON.stringify(sent[0].to) === '["jordan@reed.test"]' && links[0].redirect_to === 'https://crm.test/portal' && !JSON.stringify(sent).includes('evil'));
  const bad = await hit(login, { email: 'not an email' });
  ok('a malformed email: 400, nothing looked up', bad.code === 400 && links.length === 1);
}

console.log('\nat acceptance: the client\'s login and invite');
{
  reset();
  const r = await hit(pub, { t: 'T'.repeat(43), action: 'accept', name: 'Bea Other', agree: true });
  ok('accepted', r.code === 200 && r.body.result === 'accepted', JSON.stringify(r.body));
  ok('an invite link was made for the LEAD\'s email', links.length === 1 && links[0].type === 'invite' && links[0].email === 'bea@other.test');
  ok('  the login is tied to that lead', DB.client_users.some(c => c.lead_id === 'LB' && c.email === 'bea@other.test' && c.active));
  const inv = sent.find(s => /portal is ready/.test(s.subject || ''));
  ok('  and "your portal is ready" went to that address only', inv && JSON.stringify(inv.to) === '["bea@other.test"]' && /Open my portal/.test(inv.html) && inv.html.includes('tok-1'));
  ok('  no login was made any other way', !calls.includes('CREATED A LOGIN'));
  reset();
  await hit(pub, { t: 'U'.repeat(43), action: 'accept', name: 'Jordan Reed', agree: true });
  ok('a lead that already has a portal gets no new login or invite', !links.length && !sent.some(s => /portal is ready/.test(s.subject || '')));
  reset();
  const rr = await hit(pub, { t: 'V'.repeat(43), action: 'accept', name: 'Rep As Client', agree: true });
  ok('a CRM user\'s address is refused, nothing is sent, and the acceptance stands', rr.body.result === 'accepted' && !sent.some(s => /portal is ready/.test(s.subject || '')) && !DB.client_users.some(c => c.lead_id === 'LR'));
}

console.log('\nportal-admin: owner only');
{
  reset();
  let r = await hit(admin, { action: 'list', leadId: 'LA' }, 'rep-token');
  ok('a rep: 403', r.code === 403);
  r = await hit(admin, { action: 'list', leadId: 'LA' });
  ok('nobody signed in: 401', r.code === 401);
  r = await hit(admin, { action: 'list', leadId: 'LA' }, 'owner-token');
  ok('an owner lists who has access', r.code === 200 && r.body.users.length === 1 && r.body.users[0].email === 'jordan@reed.test');
  r = await hit(admin, { action: 'invite', leadId: 'LA', email: 'Office@Reed.test', name: 'Office Manager' }, 'owner-token');
  ok('an owner invites another person', r.code === 200 && r.body.ok && DB.client_users.some(c => c.email === 'office@reed.test' && c.lead_id === 'LA'));
  ok('  emailed at the address on the new row', sent.some(s => JSON.stringify(s.to) === '["office@reed.test"]' && /portal is ready/.test(s.subject)));
  r = await hit(admin, { action: 'invite', leadId: 'LA', email: 'rep@agency.test' }, 'owner-token');
  ok('a team member\'s address is refused, with the reason', r.code === 409 && /team/.test(r.body.error));
  r = await hit(admin, { action: 'remove', id: UA }, 'owner-token');
  ok('remove switches the row off', r.code === 200 && DB.client_users.find(c => c.id === UA).active === false && patches.some(p => p.id === UA && p.body.active === false));
  ok('  and bans the login', bans.some(b => b.id === UA && b.body.ban_duration === '876000h'));
  r = await hit(admin, { action: 'resend', id: UA }, 'owner-token');
  ok('resend is refused for someone removed', r.code === 409);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
