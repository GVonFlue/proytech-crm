/* STORAGE-TIGHTEN-2026-10, RUN AGAINST A REAL POSTGRES — locally, never production.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS), for the same reason as
   tests/rlsdb.mjs: PGlite is deliberately not a dependency. Run it with:

     npm i --no-save @electric-sql/pglite && node tests/storagerlsdb.mjs

   It builds a throwaway database with Supabase's roles, a stand-in storage
   schema (buckets, and objects under RLS, the way Supabase ships them), this
   repo's MIGRATION.sql for is_owner() and friends, and the open state the two
   buckets were in (receipts: any signed-in user does anything; site-media:
   public read, any signed-in user writes), PLUS an unscoped leftover policy
   and a properly scoped policy on an unrelated bucket. Then it proves, by
   trying each thing as each person:

     before: a rep reads, writes and deletes receipts; RLS-AUDIT.sql FAILS,
     naming the unscoped leftover · the tighten runs, its own check passes,
     the audit passes · owner: everything on receipts, write on site-media ·
     rep, a stray signed-in account and a deactivated owner: nothing on
     receipts, read-only on site-media · anon: no receipts, reads site-media,
     cannot write · the unscoped leftover is gone (it had opened the private
     onboarding bucket too) · the unrelated bucket's policy is untouched ·
     receipts is private · re-running changes nothing · the rollback reopens
     exactly what it says and leaves receipts private.

   It is not VERIFY-RLS.md §15: PGlite is real Postgres but not Supabase
   Storage (no storage API, no signed URLs). §15 is the proof on the install. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/storagerlsdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

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
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
create table leads (id text primary key, data jsonb not null default '{}'::jsonb);
create table app_settings (id text primary key, data jsonb);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;`;

/* the open state, as described: hand-made policies, plus the two shapes the
   tighten must handle (an unscoped leftover; another bucket's own policy) */
const BEFORE = `
insert into storage.buckets (id, name, public) values ('receipts','receipts',true),('site-media','site-media',true),('onboarding','onboarding',false),('avatars','avatars',false);
create policy "Authenticated users can do anything with receipts" on storage.objects for all to authenticated
  using (bucket_id = 'receipts') with check (bucket_id = 'receipts');
create policy "Public read site-media" on storage.objects for select using (bucket_id = 'site-media');
create policy "Authenticated upload site-media" on storage.objects for insert to authenticated with check (bucket_id = 'site-media');
create policy "Authenticated update site-media" on storage.objects for update to authenticated using (bucket_id = 'site-media');
create policy "Authenticated delete site-media" on storage.objects for delete to authenticated using (bucket_id = 'site-media');
create policy "leftover: signed-in users read files" on storage.objects for select to authenticated using (auth.uid() is not null);
create policy "avatars: own folder" on storage.objects for select to authenticated using (bucket_id = 'avatars' and name like auth.uid()::text || '/%');
insert into auth.users values ('${O}'),('${R}'),('${D}'),('${X}');
insert into crm_users (id, name, role, active) values ('${O}','Owner','owner',true),('${R}','Rep','rep',true),('${D}','Gone','owner',false);
insert into storage.objects (bucket_id, name) values ('receipts','2026/10/r1.pdf'),('site-media','hero.jpg'),('onboarding','o1/documents/ein.pdf');`;

const db = new PGlite();
await db.exec(SUPABASE);
await db.exec(read('MIGRATION.sql'));
await db.exec(BEFORE);
await db.exec(`select set_config('request.jwt.claims', '{}', false)`);

const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { return String(e.message || e); } };
async function as(who, sql) {
  await db.exec('begin');
  try {
    if (who === 'anon') await db.exec('set local role anon');
    else { await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`); await db.exec('set local role authenticated'); }
    const r = await db.query(sql);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
const count = async (who, bucket) => { const r = await as(who, `select count(*)::int n from storage.objects where bucket_id='${bucket}'`); return r.error ? 'ERR' : r.rows[0].n; };
const ins = (who, bucket) => as(who, `insert into storage.objects (bucket_id, name) values ('${bucket}', 'new-${Math.random().toString(36).slice(2)}')`);
const upd = (who, bucket) => as(who, `update storage.objects set name = name || '-x' where bucket_id='${bucket}'`);
const del = (who, bucket) => as(who, `delete from storage.objects where bucket_id='${bucket}'`);
const can = r => !r.error && (r.affected === undefined || r.affected > 0);
const policies = async () => (await db.query(`select polname from pg_policy where polrelid='storage.objects'::regclass order by 1`)).rows.map(r => r.polname);

console.log('\nbefore: as it was');
const AUDIT = read('RLS-AUDIT.sql'), TIGHTEN = read('STORAGE-TIGHTEN-2026-10.sql'), ROLLBACK = read('STORAGE-TIGHTEN-2026-10-ROLLBACK.sql');
let e = await run(AUDIT);
ok('RLS-AUDIT.sql FAILS on storage', /RLS-AUDIT FAILED: storage policies/.test(e), e);
ok('  naming the unscoped leftover', e.includes('leftover: signed-in users read files'), e);
ok('a rep reads receipts', await count(R, 'receipts') === 1);
ok('a rep uploads a receipt', can(await ins(R, 'receipts')));
ok('a rep deletes a receipt', can(await del(R, 'receipts')));
ok('a rep deletes website images', can(await del(R, 'site-media')));
ok('a rep reads the PRIVATE onboarding bucket through the leftover', await count(R, 'onboarding') === 1);

console.log('\nthe tighten');
e = await run(TIGHTEN);
ok('runs, and its own check passes', e === '', e);
const after = await policies();
ok('the eight intended policies, plus the other bucket\'s, and nothing else', JSON.stringify(after) === JSON.stringify([
  'avatars: own folder', 'storage_receipts_owner_delete', 'storage_receipts_owner_insert', 'storage_receipts_owner_select', 'storage_receipts_owner_update',
  'storage_site_media_owner_delete', 'storage_site_media_owner_insert', 'storage_site_media_owner_update', 'storage_site_media_read']), after.join(', '));
ok('receipts is private now; site-media still public', JSON.stringify((await db.query(`select id, public from storage.buckets where id in ('receipts','site-media') order by id`)).rows) === '[{"id":"receipts","public":false},{"id":"site-media","public":true}]');
e = await run(AUDIT);
ok('RLS-AUDIT.sql now PASSES', e === '', e);

console.log('\nwho can do what now');
ok('owner: reads receipts', await count(O, 'receipts') === 1);
ok('owner: uploads, overwrites and deletes receipts', can(await ins(O, 'receipts')) && can(await upd(O, 'receipts')) && can(await del(O, 'receipts')));
ok('owner: writes site-media', can(await ins(O, 'site-media')) && can(await upd(O, 'site-media')) && can(await del(O, 'site-media')));
for (const [who, label] of [[R, 'rep'], [X, 'stray signed-in account (no CRM row)'], [D, 'deactivated owner']]) {
  ok(`${label}: reads NO receipts`, await count(who, 'receipts') === 0);
  ok(`${label}: cannot upload a receipt`, !can(await ins(who, 'receipts')));
  ok(`${label}: an overwrite or delete of receipts changes nothing`, !can(await upd(who, 'receipts')) && !can(await del(who, 'receipts')));
  ok(`${label}: still reads site-media`, await count(who, 'site-media') === 1);
  ok(`${label}: cannot write site-media`, !can(await ins(who, 'site-media')) && !can(await upd(who, 'site-media')) && !can(await del(who, 'site-media')));
  ok(`${label}: reads nothing in onboarding`, await count(who, 'onboarding') === 0);
}
ok('anon: no receipts', await count('anon', 'receipts') === 0);
ok('anon: reads site-media', await count('anon', 'site-media') === 1);
ok('anon: cannot write site-media', !can(await ins('anon', 'site-media')) && !can(await del('anon', 'site-media')));

console.log('\nre-running');
e = await run(TIGHTEN);
ok('runs again cleanly', e === '', e);
ok('  same policies', JSON.stringify(await policies()) === JSON.stringify(after));

console.log('\nthe rollback');
e = await run(ROLLBACK);
ok('runs', e === '', e);
ok('a rep reads and uploads receipts again (that is what it restores)', await count(R, 'receipts') === 1 && can(await ins(R, 'receipts')));
ok('a rep writes site-media again', can(await ins(R, 'site-media')));
ok('receipts stays PRIVATE', (await db.query(`select public from storage.buckets where id='receipts'`)).rows[0].public === false);
ok('the unscoped leftover is NOT brought back', !(await policies()).some(p => p.startsWith('leftover')));
e = await run(TIGHTEN);
ok('and the tighten closes it again', e === '' && await count(R, 'receipts') === 0, e);

console.log(`\nstoragerlsdb: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
