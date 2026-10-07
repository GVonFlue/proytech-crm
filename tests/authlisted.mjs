/* SIGNED IN IS NOT ON THE TEAM (AUTH-LISTED-2026-10).
   ============================================================================

   A Supabase login with no crm_users row (a stray account, or a client of the
   coming portal) used to pass guard({requireAuth}) on 15 routes: Jarvis (AI
   spend), calendar events, owner emails, lead import and more. Now
   requireAuth asks Postgres (crm_whoami, with the caller's own token) and
   only an active owner or rep gets in. Drives the real guard and real
   handlers with a fake network.

     - role 'none' (no crm_users row): 403 on a requireAuth route, before any
       work and before any budget is spent
     - an inactive rep: 403; an active rep or owner: in
     - crm_whoami failing or unreachable: 403 (fails closed)
     - every route that says requireAuth gets this, because it is the guard
     - api/team-login.js: owner only; makes the login through the ADMIN API
       with the service key (works with sign-ups OFF), never /auth/v1/signup
     - the browser no longer calls the public sign-up endpoint
     - AUTH-LISTED-2026-10.sql: shape (tests/authlisteddb.mjs runs it)

   Seen red: dropping the isListed check in guard(); team-login without
   requireOwner; createLogin still calling /auth/v1/signup.                */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

/* tokens: who they are, as crm_whoami would say */
const WHO = {
  stranger: { role: 'none', active: true },       // signed in, no crm_users row
  rep: { role: 'rep', active: true },
  oldrep: { role: 'rep', active: false },
  owner: { role: 'owner', active: true },
  broken: 'ERR',
};
let calls, admin;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const h = opts.headers || {};
  const tok = String(h.authorization || h.Authorization || '').replace(/^Bearer /, '');
  const J = (d, okk = true, st) => ({ ok: okk, status: st || (okk ? 200 : 400), json: async () => d, text: async () => JSON.stringify(d) });
  calls.push(u.replace('https://x.supabase.co', ''));
  if (u.includes('/auth/v1/user')) return WHO[tok] ? J({ id: 'uid-' + tok, email: tok + '@x.test' }) : J({}, false, 401);
  if (u.includes('/rpc/crm_whoami')) { if (WHO[tok] === 'ERR') return J({ message: 'boom' }, false, 500); return J([WHO[tok]]); }
  if (u.includes('api_hits')) return J([]);
  if (u.includes('/auth/v1/admin/users')) { admin.push({ key: tok, body: JSON.parse(opts.body || '{}') }); const b = JSON.parse(opts.body || '{}'); return b.email === 'taken@x.test' ? J({ msg: 'A user with this email address has already been registered' }, false, 422) : J({ id: 'new-uid', email: b.email }); }
  if (u.includes('/auth/v1/signup')) return J({ id: 'should-not-happen' });
  return J({}, false, 404);
};
const mkRes = () => { const r = { code: 0, body: null, headers: {} };
  r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => r; return r; };
let n = 0;
const req = (tok, body = {}) => { const ip = '10.1.0.' + (++n % 250); return { method: 'POST', headers: { 'x-forwarded-for': ip, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, socket: { remoteAddress: ip }, body }; };

const { guard } = await import('../api/_guard.js');
const g = async (tok, opts) => { calls = []; const res = mkRes(); const r = await guard(req(tok), res, { name: 't', ...opts }); return { r, res, calls }; };

console.log('\nguard({requireAuth}): a session is not enough');
{
  let x = await g('stranger', { requireAuth: true });
  ok('a login with no crm_users row: 403', !x.r.ok && x.res.code === 403 && /not on the team/.test(x.res.body.error), JSON.stringify(x.res.body));
  ok('  turned away before the rate counters (no budget spent)', !x.calls.some(c => /api_hits/.test(c)), x.calls.join(' '));
  x = await g('oldrep', { requireAuth: true });
  ok('an inactive rep: 403', !x.r.ok && x.res.code === 403);
  x = await g('broken', { requireAuth: true });
  ok('crm_whoami failing: 403 (fails closed)', !x.r.ok && x.res.code === 403);
  x = await g('rep', { requireAuth: true });
  ok('an active rep: in', x.r.ok);
  x = await g('owner', { requireAuth: true });
  ok('an owner: in', x.r.ok);
  x = await g('', { requireAuth: true });
  ok('no token: 401, as before', x.res.code === 401);
  x = await g('stranger', { requireOwner: true });
  ok('requireOwner still refuses a stranger (403)', x.res.code === 403);
  x = await g('rep', { requireOwner: true });
  ok('  and a rep', x.res.code === 403);
}

console.log('\nreal routes, called by a stranger');
for (const f of ['notify.js', 'import-leads.js', 'google-status.js', 'jarvis.js', 'calendar-event.js']) {
  const h = (await import('../api/' + f)).default;
  calls = []; const res = mkRes();
  await h(req('stranger', { leads: [], text: 'x', messages: [{ role: 'user', content: 'x' }] }), res);
  ok(`${f}: 403 for a login that is not on the team`, res.code === 403, res.code + ' ' + JSON.stringify(res.body));
  ok(`  and it did no work (only the two identity checks went out)`, calls.every(c => /auth\/v1\/user|crm_whoami/.test(c)), calls.join(' '));
}

console.log('\nevery requireAuth route gets this from the guard');
{
  const routes = fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  const authOnly = routes.filter(f => { const s = read('api/' + f); return /requireAuth:\s*true/.test(s) && !/requireOwner:\s*true/.test(s); });
  ok(`${authOnly.length} routes use requireAuth (the 15 this closes, give or take new ones)`, authOnly.length >= 15, authOnly.join(', '));
  ok('none of them builds its own session check instead of guard()', authOnly.every(f => /await guard\(req,\s*res/.test(read('api/' + f))));
  const gs = read('api/_guard.js');
  ok('guard checks the listing for requireAuth, not only the JWT', /if \(!requireOwner && !\(await isListed\(tok\)\)\)/.test(gs));
  ok('  and isListed means an active owner or rep', /me\.role === 'owner' \|\| me\.role === 'rep'\) && me\.active !== false/.test(gs));
}

console.log('\napi/team-login.js: adding a team member, with sign-ups OFF');
{
  const h = (await import('../api/team-login.js')).default;
  const call = async (tok, body) => { calls = []; admin = []; const res = mkRes(); await h(req(tok, body), res); return res; };
  let r = await call('rep', { email: 'new@x.test', password: 'Temp-pass-1' });
  ok('a rep cannot: 403', r.code === 403 && !admin.length);
  r = await call('stranger', { email: 'new@x.test', password: 'Temp-pass-1' });
  ok('a stranger cannot: 403', r.code === 403 && !admin.length);
  r = await call('owner', { email: 'nope', password: 'Temp-pass-1' });
  ok('a bad email: 400, nothing created', r.code === 400 && !admin.length);
  r = await call('owner', { email: 'new@x.test', password: 'short' });
  ok('a short password: 400', r.code === 400 && !admin.length);
  r = await call('owner', { email: ' New@X.test ', password: 'Temp-pass-1' });
  ok('an owner: created, id returned', r.code === 200 && r.body.ok && r.body.id === 'new-uid', JSON.stringify(r.body));
  ok('  through the ADMIN API with the service key', admin.length === 1 && admin[0].key === 'svc');
  ok('  email confirmed, lowercased and trimmed', admin[0].body.email === 'new@x.test' && admin[0].body.email_confirm === true);
  ok('  never the public sign-up endpoint', !calls.some(c => /\/auth\/v1\/signup/.test(c)));
  r = await call('owner', { email: 'taken@x.test', password: 'Temp-pass-1' });
  ok('an email that already has a login: 409 with a way forward', r.code === 409 && /already has a login/.test(r.body.error));
  const sb = read('src/lib/supabase.js');
  const fn = sb.slice(sb.indexOf('async createLogin('), sb.indexOf('async createLogin(') + 900);
  ok('the browser calls /api/team-login with the owner\'s token, not /auth/v1/signup', /fetch\('\/api\/team-login'/.test(fn) && /authorization: `Bearer \$\{token\}`/.test(fn) && !/auth\/v1\/signup/.test(sb));
}

console.log('\nAUTH-LISTED-2026-10.sql (shape; tests/authlisteddb.mjs runs it)');
{
  const sql = read('AUTH-LISTED-2026-10.sql');
  const sec = sql.slice(sql.indexOf('-- ---- 1. leads'), sql.indexOf('-- ---- 2.'));
  ok('every policy on leads is dropped from the catalog, whatever its name (production had five)', /for p in select polname from pg_policy where polrelid = 'public\.leads'::regclass loop\s*execute format\('drop policy %I on leads'/.test(sec));
  ok('four created: select, insert, update on crm_listed(), delete owner-only', ['leads_select on leads for select', 'leads_insert on leads for insert', 'leads_update on leads for update', 'leads_delete on leads for delete'].every(x => sec.includes('create policy ' + x)) && (sec.match(/create policy/g) || []).length === 4);
  ok('no crm_active() in any of them', !/crm_active\(\)/.test(sec.replace(/--[^\n]*/g, '')));
  ok('delete is owner-only', /leads_delete on leads for delete using \(\s*no_users\(\) or \( crm_listed\(\) and is_owner\(\) \)\)/.test(sec));
  ok('the self-check refuses: not exactly 4, any crm_active(), any policy without crm_listed()/is_owner(), a non-owner delete', /should have exactly 4 policies/.test(sql) && /crm_active\(\) still on leads/.test(sql) && /requires neither crm_listed\(\) nor is_owner\(\)/.test(sql) && /leads_delete is not owner-only/.test(sql));
  ok('crm_team, crm_leaderboard and kb_mark_read check crm_listed()', ['crm_team', 'crm_leaderboard', 'kb_mark_read'].every(f => { const i = sql.indexOf(`create or replace function ${f}`); return i > 0 && /crm_listed\(\)/.test(sql.slice(i, sql.indexOf('$$;', i))); }));
  ok('one transaction that verifies itself', /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && sql.indexOf('AUTH-LISTED OK') < sql.indexOf('commit;'));
  const mig = read('MIGRATION.sql');
  const msec = mig.slice(mig.indexOf("for p in select polname from pg_policy where polrelid = 'public.leads'"), mig.indexOf('drop policy if exists users_read'));
  ok('MIGRATION.sql creates the same four and drops whatever else is there (re-running it cannot reopen leads)', msec.length > 0 && (msec.match(/create policy leads_(select|insert|update|delete)/g) || []).length === 4 && !/crm_active\(\)/.test(msec.replace(/--[^\n]*/g, '')) && mig.indexOf('create or replace function crm_listed()') < mig.indexOf('create policy leads_select'));
  ok('  and so do TEAM-MIGRATION.sql and REP-ACTIVITY-MIGRATION.sql', /where u\.active and crm_listed\(\)/.test(read('TEAM-MIGRATION.sql')) && /if not crm_listed\(\) then/.test(read('REP-ACTIVITY-MIGRATION.sql')));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
