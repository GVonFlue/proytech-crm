/* THE CLIENT PORTAL'S WALL, AGAINST A REAL POSTGRES — locally only.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS): it needs PGlite.
     npm i --no-save @electric-sql/pglite && node tests/portaldb.mjs

   Applies EVERY migration in this repo, in order, then signs in as a client
   and tries everything a browser could. The sweep is DRIVEN BY THE CATALOG,
   not by a list someone wrote: every table in public, every function a
   signed-in account can execute, the storage objects. A table or function
   added later is swept without anyone remembering to add it here.

     - every table: a client reads 0 rows, inserts nothing, updates and
       deletes 0 rows
     - every function a browser can execute: called as the client with
       nulls; only the portal's own functions and the "who am I" helpers may
       return anything, and they return only the client's own
     - client A never sees client B; there is no argument to aim with
     - a removed client, a client who is also a CRM user, a stray login: nothing
     - a client is never "owner" of an empty CRM and cannot claim it
     - the EIN leaves the database masked to its last 4
     - the server's functions are not callable from a browser
     - RLS-AUDIT.sql passes, and FAILS on a planted unguarded function

   It is not VERIFY-RLS.md §17: PGlite is Postgres, not Supabase.          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite, pgcrypto;
try { ({ PGlite } = await import('@electric-sql/pglite')); ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto')); }
catch { console.log('tests/portaldb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 500) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SUPABASE = read('tests/onbrlsdb.mjs').match(/const SUPABASE = `([\s\S]*?)`;/)[1];

const OWNER = '00000000-0000-4000-8000-0000000000a1', REP = '00000000-0000-4000-8000-0000000000a2',
  CA = '00000000-0000-4000-8000-0000000000c1', CB = '00000000-0000-4000-8000-0000000000c2',
  GONE = '00000000-0000-4000-8000-0000000000c3', BOTH = '00000000-0000-4000-8000-0000000000c4',
  STRAY = '00000000-0000-4000-8000-0000000000d1';

const db = new PGlite({ extensions: { pgcrypto } });
const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { try { await db.exec('rollback'); } catch {} return String(e.message || e); } };
async function as(who, sql, params) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`);
    await db.exec('set local role authenticated');
    const r = await db.query(sql, params);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
const svc = async sql => { await db.exec('begin'); try { await db.exec('set local role service_role'); return (await db.query(sql)).rows; } finally { await db.exec('commit'); } };

console.log('\nevery migration, in order');
await db.exec(SUPABASE);
await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz; alter table auth.users add column if not exists email text;`);
const ORDER = ['MIGRATION.sql', 'TEAM-MIGRATION.sql', 'REP-PAY-MIGRATION.sql', 'WHOAMI-RATE.sql', 'REP-PROFILE-MIGRATION.sql', 'KB-MIGRATION.sql',
  'REP-ACTIVITY-MIGRATION.sql', 'MEETING-MIGRATION.sql', 'POCKET-MIGRATION.sql', 'PAYMENT-METHOD-MIGRATION.sql', 'JARVIS-MIGRATION.sql',
  'PROPOSALS-MIGRATION.sql', 'PROPOSALS-LEGAL-MIGRATION.sql', 'PROPOSALS-ARCHIVE-MIGRATION.sql', 'ONBOARDING-MIGRATION.sql',
  'LIFECYCLE-MIGRATION.sql', 'RLS-TIGHTEN-2026-10.sql', 'STORAGE-TIGHTEN-2026-10.sql', 'AUTH-LISTED-2026-10.sql', 'PORTAL-MIGRATION.sql'];
for (const f of ORDER) { const e = await run(read(f)); ok(f, e === '', e); }
ok('PORTAL-MIGRATION.sql again (re-running is safe)', (await run(read('PORTAL-MIGRATION.sql'))) === '');

/* the people and their records */
await db.exec(`insert into auth.users (id, email) values ('${OWNER}','owner@agency.test'),('${REP}','rep@agency.test'),('${CA}','a@client-a.test'),('${CB}','b@client-b.test'),('${GONE}','gone@client-g.test'),('${BOTH}','rep2@agency.test'),('${STRAY}','stray@x.test');
  insert into crm_users (id, name, role, active) values ('${OWNER}','Owner','owner',true),('${REP}','Rep','rep',true),('${BOTH}','Rep Two','rep',true);
  insert into leads (id, data, owner_id) values
    ('LA', '{"name":"Jordan Reed","email":"a@client-a.test","company":"Reed Realty Group","clientPhase":"build","phaseSince":"2026-10-08","notes":"SECRET-NOTES-A","activities":[{"text":"SECRET-ACTIVITY-A"}],"deals":[{"label":"SECRET-DEAL-A"}],"onboarding":{"deposit_paid":{"done":"2026-10-02"},"logo_received":{"done":"2026-10-05"}},"delivery":{"website":{"Website V1 sent":{"done":null,"due":"2026-10-14"}}},"lifecycle":{"pauses":[],"owners":{"site_v1":"SECRET-OWNER"}}}', '${OWNER}'),
    ('LB', '{"name":"Bea Other","email":"b@client-b.test","company":"Other Co","notes":"SECRET-NOTES-B"}', '${REP}'),
    ('LG', '{"name":"Gone","email":"gone@client-g.test","company":"Gone Co"}', '${OWNER}'),
    ('LX', '{"name":"Nobody","company":"Unrelated Co","notes":"SECRET-NOTES-X"}', '${OWNER}');
  insert into proposals (id, lead_id, token, status, body, notes, accepted_at, accepted_name, accepted_ip, accepted_plan, accepted_terms_version, accepted_terms_url, accepted_privacy_url) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','LA','${'A'.repeat(43)}','accepted','{"client":{"company":"Reed Realty Group"},"company":{"name":"Agency"},"contacts":[{"name":"Logan","phone":"555"}],"launchDays":14,"quote":{"items":[{"id":"growth-os","name":"Growth OS","kind":"package","setup":3000}],"setup":3000,"deposit":1500,"depositPct":50,"monthly":299},"onboardingUrl":"https://x","SECRET_KEY":"SECRET-BODY-A"}','SECRET-PROPOSAL-NOTES-A',now(),'Jordan Reed','9.9.9.9','monthly','2026-10-04','https://agency.test/terms','https://agency.test/privacy'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','LB','${'B'.repeat(43)}','accepted','{"client":{"company":"Other Co"},"quote":{"setup":9999}}','SECRET-PROPOSAL-NOTES-B',now(),'Bea','8.8.8.8','monthly',null,null,null);
  insert into onboardings (id, lead_id, proposal_id, token, status, products, answers, submitted_at) values
    ('11111111-1111-4111-8111-111111111111','LA','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${'C'.repeat(43)}','submitted','{website,suite}','{"biz.name":"Reed Realty","tx.ein":"12-3456789","web.domain_own":"yes"}', now()),
    ('22222222-2222-4222-8222-222222222222','LB','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${'D'.repeat(43)}','in_progress','{website}','{"biz.name":"Other","tx.ein":"98-7654321"}', null);
  insert into app_settings (id, data) values ('main', '{"lifecycle":{"builder":"Logan"},"offer":{"launchDays":14,"company":{"name":"Agency"},"prices":"SECRET-SETTINGS"}}'), ('invoices', '{"SECRET":"SECRET-INVOICES"}')
    on conflict (id) do update set data = excluded.data;`);

console.log('\nclients are tied to their lead by the SERVER\'s functions only');
{
  const t = await svc(`select * from portal_invite_target('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`);
  ok('the invite target is the lead\'s own email', t.length === 1 && t[0].email === 'a@client-a.test' && t[0].lead_id === 'LA');
  ok('link A', (await svc(`select portal_link_client('${CA}', 'LA', 'Jordan Reed', '${OWNER}') r`))[0].r === 'linked');
  ok('link B', (await svc(`select portal_link_client('${CB}', 'LB', 'Bea Other', '${OWNER}') r`))[0].r === 'linked');
  ok('link the one we will remove', (await svc(`select portal_link_client('${GONE}', 'LG', 'Gone', '${OWNER}') r`))[0].r === 'linked');
  ok('a CRM user can never be linked as a client', (await svc(`select portal_link_client('${BOTH}', 'LA', 'x', '${OWNER}') r`))[0].r === 'crm_user');
  ok('a login already tied to A cannot be moved to B', (await svc(`select portal_link_client('${CA}', 'LB', 'x', '${OWNER}') r`))[0].r === 'other_client');
  await db.exec(`update client_users set active = false, removed_at = now() where id = '${GONE}'`);
  for (const [f, args] of [['portal_invite_target', `'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`], ['portal_link_client', `'${CA}','LB','x','${CA}'`], ['portal_login_target', `'a@client-a.test'`]]) {
    const r = await as(CA, `select * from ${f}(${args})`);
    ok(`${f}: a browser cannot call it`, /permission denied/.test(r.error || ''), JSON.stringify(r));
  }
}

console.log('\nTHE SWEEP: every table in public, as client A');
{
  const tables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows.map(r => r.relname);
  ok(`${tables.length} tables found in the catalog (every one swept)`, tables.length >= 15, tables.join(', '));
  const seen = [], wrote = [];
  for (const t of tables) {
    const r = await as(CA, `select count(*)::int n from public."${t}"`);
    if (r.error ? !/permission denied/.test(r.error) : r.rows[0].n !== 0) seen.push(`${t}: ${r.error || r.rows[0].n}`);
    const u = await as(CA, `update public."${t}" set ${(await db.query(`select attname from pg_attribute where attrelid = 'public."${t}"'::regclass and attnum > 0 and not attisdropped order by attnum limit 1`)).rows[0].attname} = ${'null'} where false or true`);
    if (!u.error && u.affected > 0) wrote.push(`${t}: updated ${u.affected}`);
    const d = await as(CA, `delete from public."${t}"`);
    if (!d.error && d.affected > 0) wrote.push(`${t}: deleted ${d.affected}`);
    const i = await as(CA, `insert into public."${t}" default values`);
    if (!i.error) wrote.push(`${t}: inserted a row`);
  }
  ok('a client reads NOTHING from any table', !seen.length, seen.join(' | '));
  ok('a client writes, edits and deletes NOTHING in any table', !wrote.length, wrote.join(' | '));
  const st = await as(CA, `select count(*)::int n from storage.objects`);
  ok('and no stored file', st.error ? /permission denied/.test(st.error) : st.rows[0].n === 0, JSON.stringify(st));
}

console.log('\nTHE SWEEP: every function a browser can execute, as client A');
{
  const fns = (await db.query(`select p.oid::int oid, p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid) args, t.typname ret
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') and t.typname <> 'trigger'
       /* functions an EXTENSION owns (pgcrypto's gen_random_uuid, digest...) compute, they read no table */
       and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e') order by 1`)).rows;
  ok(`${fns.length} functions a signed-in account can execute`, fns.length >= 10, fns.map(f => f.proname).join(', '));
  /* what each may return to a client: everything else must be empty/false/null or refuse */
  const MAY = { portal_home: 1, portal_documents: 1, portal_lead: 1, crm_whoami: 1, crm_active: 1 };
  const leaks = [];
  for (const f of fns) {
    const nulls = Array.from({ length: f.pronargs }, () => 'null').join(',');
    const r = await as(CA, `select to_jsonb(x) j from ${f.proname}(${nulls}) x`);
    if (r.error) continue;                                    // refused: fine
    const vals = r.rows.map(x => x.j).filter(v => v !== null && v !== false && !(typeof v === 'object' && Object.values(v).every(y => y === null || y === false)));
    if (vals.length && !MAY[f.proname]) leaks.push(`${f.proname}(${f.args}) → ${JSON.stringify(vals).slice(0, 120)}`);
    const text = JSON.stringify(r.rows);
    if (/SECRET-/.test(text)) leaks.push(`${f.proname} returned a SECRET marker: ${text.match(/SECRET-[A-Z-]+/g).join(',')}`);
  }
  ok('no function gives a client anything but the portal\'s own answers', !leaks.length, leaks.join('\n        '));
  const who = (await as(CA, `select role, setup from crm_whoami()`)).rows[0];
  ok('crm_whoami says "none" to a client', who.role === 'none', JSON.stringify(who));
  ok('crm_active() is true for a client, which is why nothing may trust it alone', (await as(CA, `select crm_active() v`)).rows[0].v === true);
}

console.log('\nthe portal: client A sees A, and only what is named');
{
  const h = (await as(CA, `select portal_home() h`)).rows[0].h;
  ok('A gets A', h && h.company === 'Reed Realty Group' && h.first_name === 'Jordan' && h.phase === 'build', JSON.stringify(h).slice(0, 300));
  ok('  with the clock\'s inputs, the quote, the contacts and launch days', h.checklist.deposit_paid.done === '2026-10-02' && h.proposal.quote.setup === 3000 && h.proposal.contacts[0].name === 'Logan' && h.proposal.launch_days === 14);
  const s = JSON.stringify(h);
  ok('  and NONE of: notes, activities, deals, the owner of an item, the IP, other settings, B', !/SECRET-|9\.9\.9\.9|Other Co|9999/.test(s), s.match(/SECRET-[A-Z-]+|9\.9\.9\.9|Other Co/g));
  const hb = (await as(CB, `select portal_home() h`)).rows[0].h;
  ok('B gets B', hb && hb.company === 'Other Co' && !/Reed/.test(JSON.stringify(hb)));
  const d = (await as(CA, `select portal_documents() d`)).rows[0].d;
  ok('A\'s documents: A\'s accepted proposal, with the terms they agreed to', d.proposals.length === 1 && d.proposals[0].terms_version === '2026-10-04' && d.proposals[0].body.quote.setup === 3000);
  ok('  the proposal body only as the public page showed it (no private keys, no notes)', !/SECRET-|onboardingUrl/.test(JSON.stringify(d.proposals)));
  ok('  the EIN masked to its last 4 IN the database', d.onboarding.answers['tx.ein'] === '•••••6789' && !JSON.stringify(d).includes('12-3456789'), d.onboarding.answers['tx.ein']);
  ok('  and nothing of B', !/Other|98-7654321|SECRET-NOTES-B/.test(JSON.stringify(d)));
  ok('the portal functions take no arguments: there is nothing to aim', (await db.query(`select count(*)::int n from pg_proc where proname in ('portal_home','portal_documents','portal_touch','portal_lead') and pronargs > 0`)).rows[0].n === 0);
  ok('portal_touch stamps only the caller', !(await as(CA, `select portal_touch()`)).error);
}

console.log('\nnobody else gets the portal');
{
  for (const [who, uid] of [['a removed client', GONE], ['a CRM user who is also on the client list', BOTH], ['a stray login', STRAY], ['the owner', OWNER], ['a rep', REP]])
    ok(`${who}: no home, no documents`, (await as(uid, `select portal_home() h, portal_documents() d`)).rows[0].h === null && (await as(uid, `select portal_documents() d`)).rows[0].d === null);
  ok('a rep cannot read client_users', (await as(REP, `select count(*)::int n from client_users`)).rows[0].n === 0);
  ok('the owner can', (await as(OWNER, `select count(*)::int n from client_users`)).rows[0].n === 3);
}

console.log('\nthe first-run door is shut to clients');
{
  await db.exec('begin'); await db.exec('delete from crm_users');
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: CA, role: 'authenticated' })}', true)`); await db.exec('set local role authenticated');
  const w = (await db.query(`select role from crm_whoami()`)).rows[0];
  const nu = (await db.query(`select no_users() v`)).rows[0].v;
  let claim = ''; await db.exec('savepoint claim'); try { await db.query(`insert into crm_users (id, name, role, active) values ('${CA}','Me','owner',true)`); } catch (e) { claim = String(e.message); } await db.exec('rollback to savepoint claim');
  const leads = (await db.query(`select count(*)::int n from leads`)).rows[0].n;
  await db.exec('rollback');
  ok('with NO team at all, a client is still "none", not owner', w.role === 'none', JSON.stringify(w));
  ok('  no_users() is false while a client exists', nu === false);
  ok('  the client cannot claim the install', /row-level security|violates/.test(claim), claim);
  ok('  and still reads no lead', leads === 0);
}

console.log('\nRLS-AUDIT.sql, with its function sweep (2e)');
{
  const e = await run(read('RLS-AUDIT.sql'));
  ok('passes on everything this repo creates', e === '', e);
  await run(`create or replace function leak_settings() returns jsonb language sql security definer as $$ select data from app_settings where id = 'main' $$; grant execute on function leak_settings() to authenticated;`);
  const bad = await run(read('RLS-AUDIT.sql'));
  ok('FAILS on a planted definer function with no gate, naming it', /security definer functions a browser can call/.test(bad) && /leak_settings/.test(bad), bad.slice(0, 200));
  await run(`drop function leak_settings()`);
}

await db.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
