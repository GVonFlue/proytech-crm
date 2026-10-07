/* CLIENT-EMAILS-MIGRATION, RUN AGAINST A REAL POSTGRES — locally, never production.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS), for the same reason as
   tests/storagerlsdb.mjs: PGlite is deliberately not a dependency. Run it with:

     npm i --no-save @electric-sql/pglite && node tests/clientemailsdb.mjs

   It builds a throwaway database with Supabase's roles and this repo's
   MIGRATION.sql (is_owner, crm_active, no_users), runs the migration, and
   proves, as each person:

     the owner reads every row and writes none · a rep, a stray signed-in
     account and a deactivated owner read nothing and write nothing · anon
     reads and writes nothing · the service role claims a (lead, kind) once:
     the second claim returns no row · an unknown kind is refused · RLS-AUDIT
     passes, and FAILS (naming the policy) when a write policy is added ·
     re-running the migration changes nothing · the rollback drops the table.

   It is not VERIFY-RLS.md §17: PGlite is real Postgres but not Supabase.
   tests/clientemails.mjs is the half CI always runs (the SQL as text). */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/clientemailsdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const O = '00000000-0000-4000-8000-00000000000a', R = '00000000-0000-4000-8000-00000000000b',
      D = '00000000-0000-4000-8000-00000000000c', X = '00000000-0000-4000-8000-00000000000d';

const SUPABASE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create table leads (id text primary key, data jsonb not null default '{}'::jsonb);
create table app_settings (id text primary key, data jsonb);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;`;

const db = new PGlite();
await db.exec(SUPABASE);
await db.exec(read('MIGRATION.sql'));
await db.exec(`insert into auth.users values ('${O}'),('${R}'),('${D}'),('${X}');
insert into crm_users (id, name, role, active) values ('${O}','Owner','owner',true),('${R}','Rep','rep',true),('${D}','Gone','owner',false);`);
await db.exec(`select set_config('request.jwt.claims', '{}', false)`);
const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { return String(e.message || e); } };
async function as(who, sql) {
  await db.exec('begin');
  try {
    if (who === 'anon') await db.exec('set local role anon');
    else if (who === 'service') await db.exec('set local role service_role');
    else { await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`); await db.exec('set local role authenticated'); }
    const r = await db.query(sql);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
const can = r => !r.error && (r.affected === undefined || r.affected > 0);

console.log('\nthe migration');
let e = await run(read('CLIENT-EMAILS-MIGRATION.sql'));
ok('runs', e === '', e);
await db.exec(`insert into client_emails (lead_id, kind, sent_at) values ('L1','locked_in',now()),('L2','ticket',now())`);
const pols = (await db.query(`select polname, polcmd, pg_get_expr(polqual, polrelid) q from pg_policy where polrelid='client_emails'::regclass`)).rows;
ok('exactly one policy: owners SELECT', pols.length === 1 && pols[0].polname === 'client_emails_owner_read' && pols[0].polcmd === 'r' && /is_owner\(\)/.test(pols[0].q), JSON.stringify(pols));

console.log('\nwho can do what');
const count = async who => { const r = await as(who, 'select count(*)::int n from client_emails'); return r.error ? 'ERR' : r.rows[0].n; };
ok('owner: reads every row', await count(O) === 2);
ok('owner: cannot insert, update or delete', !can(await as(O, `insert into client_emails (lead_id, kind) values ('L3','ticket')`))
  && !can(await as(O, `update client_emails set sent_at = null`)) && !can(await as(O, `delete from client_emails`)));
for (const [who, label] of [[R, 'rep'], [X, 'stray signed-in account'], [D, 'deactivated owner']]) {
  ok(`${label}: reads nothing`, await count(who) === 0, await count(who));
  ok(`${label}: cannot insert, update or delete`, !can(await as(who, `insert into client_emails (lead_id, kind) values ('L3','ticket')`))
    && !can(await as(who, `update client_emails set sent_at = null`)) && !can(await as(who, `delete from client_emails`)));
}
ok('anon: reads nothing (permission denied or 0)', (await count('anon')) === 'ERR' || (await count('anon')) === 0);
ok('anon: cannot insert or delete', !can(await as('anon', `insert into client_emails (lead_id, kind) values ('L3','ticket')`)) && !can(await as('anon', `delete from client_emails`)));

console.log('\nonce, never twice (the service role, as the server)');
{
  await db.exec('begin'); await db.exec('set local role service_role');
  const first = await db.query(`insert into client_emails (lead_id, kind) values ('L9','seat_1d') on conflict (lead_id, kind) do nothing returning id`);
  const second = await db.query(`insert into client_emails (lead_id, kind) values ('L9','seat_1d') on conflict (lead_id, kind) do nothing returning id`);
  const other = await db.query(`insert into client_emails (lead_id, kind) values ('L9','seat_3d') on conflict (lead_id, kind) do nothing returning id`);
  await db.exec('rollback');
  ok('the first claim returns its row', first.rows.length === 1);
  ok('the same claim again returns NOTHING', second.rows.length === 0);
  ok('a different kind for the same lead is its own claim', other.rows.length === 1);
  ok('an unknown kind is refused', !can(await as('service', `insert into client_emails (lead_id, kind) values ('L9','spam')`)));
}

console.log('\nRLS-AUDIT.sql');
const AUDIT = read('RLS-AUDIT.sql');
e = await run(AUDIT);
ok('passes as migrated', e === '', e);
await db.exec(`create policy sneaky_write on client_emails for insert to authenticated with check (is_owner())`);
e = await run(AUDIT);
ok('FAILS when a write policy appears, even one requiring an owner', /server-write-only table/.test(e) && e.includes('sneaky_write'), e);
await db.exec(`drop policy sneaky_write on client_emails`);
await db.exec(`drop policy client_emails_owner_read on client_emails; create policy client_emails_owner_read on client_emails for select using (auth.uid() is not null)`);
e = await run(AUDIT);
ok('FAILS when the read is not limited to owners', /server-write-only table/.test(e), e);

console.log('\nre-run and rollback');
e = await run(read('CLIENT-EMAILS-MIGRATION.sql'));
ok('re-running restores the one owner policy and keeps the rows', e === '' && (await db.query(`select count(*)::int n from pg_policy where polrelid='client_emails'::regclass`)).rows[0].n === 1
  && (await db.query(`select count(*)::int n from client_emails`)).rows[0].n === 2, e);
e = await run(read('CLIENT-EMAILS-MIGRATION-ROLLBACK.sql'));
ok('the rollback drops the table', e === '' && (await db.query(`select to_regclass('client_emails') t`)).rows[0].t === null, e);

console.log(`\nclientemailsdb: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
