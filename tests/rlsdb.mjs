/* RLS-TIGHTEN-2026-10, RUN AGAINST A REAL POSTGRES — locally, never production.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS): it needs PGlite,
   real Postgres compiled to WebAssembly, which is deliberately not a project
   dependency. Run it with:

     npm i --no-save @electric-sql/pglite && node tests/rlsdb.mjs

   It builds a throwaway database the way production is shaped — Supabase's
   roles and auth.uid(), this repo's MIGRATION.sql as it stood on main, and
   the four hand-added policies RLS-AUDIT.sql failed on — then proves:

     the audit fails on exactly those four · the tighten runs and its own
     verification passes · the audit then passes · what a rep, an owner, a
     stray signed-in account, a deactivated owner and an anonymous visitor
     can actually read and write, by trying it · re-running the tighten, and
     re-running the NEW MIGRATION.sql, keep the end state · the rollback
     reopens exactly what it says · a fresh install with no site_* tables
     runs the whole thing clean.

   It is not VERIFY-RLS.md §13. PGlite is real Postgres, but it is not
   Supabase: PostgREST, the API gateway and the production data are not here.
   §13 is still the proof against the real install.                          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/rlsdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const OLD_MIGRATION = execFileSync('git', ['show', 'origin/main:MIGRATION.sql'], { cwd: ROOT, encoding: 'utf8' });

const O = '00000000-0000-4000-8000-00000000000a', R = '00000000-0000-4000-8000-00000000000b',
      D = '00000000-0000-4000-8000-00000000000c', X = '00000000-0000-4000-8000-00000000000d';

/* Supabase's shape, as far as these policies can see it */
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

/* what production had beyond the repo's migrations (RLS-AUDIT, 4 Oct 2026) */
const PROD_LEFTOVERS = `
create policy settings_all_authenticated on app_settings for all to authenticated using (true) with check (true);
create table site_events (id text primary key, data jsonb);
create table site_settings (id text primary key, data jsonb);
grant all on site_events, site_settings to anon, authenticated, service_role;
alter table site_events enable row level security; alter table site_settings enable row level security;
create policy site_events_read on site_events for select using (true);
create policy site_settings_read on site_settings for select using (true);`;

const SEED = `
insert into auth.users values ('${O}'),('${R}'),('${D}'),('${X}');
insert into crm_users (id, name, role, active) values ('${O}','Owner','owner',true),('${R}','Rep','rep',true),('${D}','Gone','owner',false);
insert into app_settings values ('main','{"offer":{"price":1999}}'),('tasks','{"list":[]}'),('invoices','{"list":[]}'),('txns','{"list":[]}'),('installs','{"list":[]}');
insert into events (id, data) values ('ev1','{"sponsor":5000}');
insert into site_events values ('s1','{}'); insert into site_settings values ('s1','{}');`;

async function fresh(withLeftovers = true) {
  const db = new PGlite();
  await db.exec(SUPABASE);
  await db.exec(OLD_MIGRATION);
  if (withLeftovers) { await db.exec(PROD_LEFTOVERS); await db.exec(SEED); }
  return db;
}
/* run a script; return '' on success or the error message */
const run = async (db, sql) => { try { await db.exec(sql); return ''; } catch (e) { return String(e.message || e); } };
/* act as someone: inside a transaction that always rolls back */
async function as(db, who, sql) {
  const claims = who === 'anon' ? '' : `select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true);`;
  const role = who === 'anon' ? 'anon' : 'authenticated';
  await db.exec('begin');
  try {
    if (claims) await db.exec(claims);
    await db.exec(`set local role ${role}`);
    const r = await db.query(sql);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
const policySet = async db => (await db.query(`select c.relname||'.'||p.polname as p from pg_policy p join pg_class c on c.oid=p.polrelid
  where c.relname in ('app_settings','events','site_events','site_settings') order by 1`)).rows.map(r => r.p).join(', ');
const WANT = 'app_settings.settings_owner_delete, app_settings.settings_owner_insert, app_settings.settings_owner_update, app_settings.settings_read, app_settings.settings_tasks_insert, app_settings.settings_tasks_update, events.events_owner, site_events.site_events_owner, site_settings.site_settings_owner';
const AUDIT = read('RLS-AUDIT.sql'), TIGHTEN = read('RLS-TIGHTEN-2026-10.sql'), ROLLBACK = read('RLS-TIGHTEN-2026-10-ROLLBACK.sql'), NEW_MIGRATION = read('MIGRATION.sql');
const upsert = id => `insert into app_settings (id, data) values ('${id}', '{"x":1}') on conflict (id) do update set data = excluded.data`;

console.log('\nproduction as it was');
const db = await fresh();
let e = await run(db, AUDIT);
ok('the audit FAILS', /RLS-AUDIT FAILED/.test(e), e);
for (const name of ['app_settings.settings_all_authenticated', 'events.events_all', 'site_events.site_events_read', 'site_settings.site_settings_read'])
  ok(`  naming ${name}`, e.includes(name));
let r = await as(db, R, upsert('main'));
ok('before: a REP can rewrite the prices row', !r.error, r.error);
r = await as(db, X, `select count(*)::int n from app_settings`);
ok('before: a STRAY account (no crm_users row) reads every settings row', r.rows && r.rows[0].n === 5, JSON.stringify(r));
r = await as(db, 'anon', `select count(*)::int n from site_settings`);
ok('before: an anonymous visitor reads site_settings', r.rows && r.rows[0].n === 1, JSON.stringify(r));
r = await as(db, R, `select count(*)::int n from events`);
ok('before: a rep reads every event (sponsor amounts)', r.rows && r.rows[0].n === 1);

console.log('\nthe tighten');
e = await run(db, TIGHTEN);
ok('runs, and its own verification passes', e === '', e);
ok('exactly the nine intended policies', (await policySet(db)) === WANT, await policySet(db));
e = await run(db, AUDIT);
ok('the audit now PASSES', e === '', e);

console.log('\nwhat each person can do now');
const can = async (who, sql) => { const x = await as(db, who, sql); return !x.error && (x.affected === undefined || x.affected > 0 || /^select/i.test(sql)); };
const rows = async (who, sql) => { const x = await as(db, who, sql); return x.error ? 'ERR' : x.rows[0].n; };
ok('rep: reads settings (the app needs them)', await rows(R, `select count(*)::int n from app_settings`) === 5);
ok('rep: CANNOT upsert the prices row', !(await can(R, upsert('main'))));
ok('rep: an UPDATE of the prices row changes nothing', (await as(db, R, `update app_settings set data='{}' where id='main'`)).affected === 0);
for (const id of ['invoices', 'txns', 'installs']) ok(`rep: cannot write ${id}`, !(await can(R, upsert(id))));
ok('rep: CAN save tasks (upsert, as the app does)', await can(R, upsert('tasks')));
ok('rep: cannot delete the tasks row', (await as(db, R, `delete from app_settings where id='tasks'`)).affected === 0);
ok('rep: cannot create a new row called anything else', !(await can(R, upsert('sneaky'))));
ok('rep: reads NO events', await rows(R, `select count(*)::int n from events`) === 0);
ok('rep: cannot write an event', !(await can(R, `insert into events (id, data) values ('x','{}')`)));
ok('rep: reads nothing in site_events / site_settings', await rows(R, `select count(*)::int n from site_events`) === 0 && await rows(R, `select count(*)::int n from site_settings`) === 0);
ok('owner: writes the prices row', await can(O, upsert('main')));
ok('owner: writes invoices, txns, installs, tasks', (await Promise.all(['invoices', 'txns', 'installs', 'tasks'].map(id => can(O, upsert(id))))).every(Boolean));
ok('owner: reads and writes events', await rows(O, `select count(*)::int n from events`) === 1 && await can(O, `insert into events (id, data) values ('x','{}')`));
ok('owner: reads site_events / site_settings', await rows(O, `select count(*)::int n from site_settings`) === 1);
ok('stray account: reads NO settings', await rows(X, `select count(*)::int n from app_settings`) === 0);
ok('stray account: cannot write tasks', !(await can(X, upsert('tasks'))));
ok('deactivated owner: cannot write the prices row', !(await can(D, upsert('main'))));
ok('deactivated owner: reads no events', await rows(D, `select count(*)::int n from events`) === 0);
r = await as(db, 'anon', `select count(*)::int n from site_settings`);
ok('anonymous: site_settings is REFUSED, not just empty', /permission denied/.test(r.error || ''), JSON.stringify(r));
r = await as(db, 'anon', `insert into site_events values ('z','{}')`);
ok('anonymous: cannot write site_events', /permission denied/.test(r.error || ''), JSON.stringify(r));

console.log('\nre-running');
e = await run(db, TIGHTEN);
ok('the tighten again: clean, same nine', e === '' && (await policySet(db)) === WANT, e || await policySet(db));
e = await run(db, NEW_MIGRATION);
ok('the NEW MIGRATION.sql re-run: clean', e === '', e);
ok('  and it does not reopen anything (same nine policies)', (await policySet(db)) === WANT, await policySet(db));
e = await run(db, AUDIT);
ok('  the audit still passes', e === '', e);
ok('  a rep still cannot write the prices row', !(await can(R, upsert('main'))));

console.log('\nthe rollback');
e = await run(db, ROLLBACK);
ok('runs', e === '', e);
e = await run(db, AUDIT);
ok('and the audit FAILS again, on the same four', /RLS-AUDIT FAILED/.test(e) && ['settings_all_authenticated', 'events_all', 'site_events_read', 'site_settings_read'].every(n => e.includes(n)), e);
ok('a rep can write the prices row again (that is what it restores)', await can(R, upsert('main')));
r = await as(db, 'anon', `select count(*)::int n from site_settings`);
ok('anonymous can read site_settings again', r.rows && r.rows[0].n === 1, JSON.stringify(r));
e = await run(db, TIGHTEN);
ok('and the tighten closes it all again', e === '' && (await policySet(db)) === WANT, e);

console.log('\na fresh install: no site_* tables, the NEW MIGRATION.sql from scratch');
{
  const f = new PGlite();
  await f.exec(SUPABASE);
  e = await run(f, NEW_MIGRATION);
  ok('the new MIGRATION.sql runs from scratch', e === '', e);
  const set = await policySet(f);
  ok('  and creates no open policy on app_settings or events', !/settings_write|settings_all_authenticated|events_all/.test(set) && /events\.events_owner/.test(set), set);
  e = await run(f, TIGHTEN);
  ok('the tighten runs clean where site_* do not exist', e === '', e);
  e = await run(f, AUDIT);
  ok('the audit passes', e === '', e);
  await f.close();
}
await db.close();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
