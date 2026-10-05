/* ONBOARDING-MIGRATION, RUN AGAINST A REAL POSTGRES — locally, never production.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS), for the same reason
   as tests/rlsdb.mjs: it needs PGlite, which is deliberately not a project
   dependency. Run it with:

     npm i --no-save @electric-sql/pglite && node tests/onbrlsdb.mjs

   It builds a throwaway database shaped like production (Supabase's roles and
   auth.uid(), a stand-in storage schema, MIGRATION.sql, PROPOSALS-MIGRATION.sql)
   and then runs ONBOARDING-MIGRATION.sql and proves, by trying it:

     the migration runs, twice · RLS-AUDIT.sql still passes · every policy on
     both tables is the one intended (read with pg_get_expr, not counted) ·
     anon and a rep read zero rows and cannot write · neither can call any
     onboarding_* function · the owner reads and writes · the service role's
     functions keep their own rules: drafts and unknown tokens get nothing, a
     submitted onboarding refuses saves, a path outside the onboarding's
     folder is refused, files need the rights box, a second submit is
     'already', an unaccepted proposal makes no onboarding and an accepted one
     makes exactly one, however often it is asked · the bucket is private and
     has no storage policy.

   It is not VERIFY-RLS.md §14. PGlite is real Postgres, but it is not
   Supabase: PostgREST, the API gateway, real Storage and the production data
   are not here. §14 is still the proof against the real install.          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/onbrlsdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const O = '00000000-0000-4000-8000-00000000000a', R = '00000000-0000-4000-8000-00000000000b';
const T = s => (s + 'x'.repeat(43)).slice(0, 43);

const SUPABASE = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create table leads (id text primary key, data jsonb not null default '{}'::jsonb);
create table app_settings (id text primary key, data jsonb);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;`;

/* pgcrypto (gen_random_bytes) ships with PGlite as an opt-in extension */
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(SUPABASE);
await db.exec(read('MIGRATION.sql'));
await db.exec(read('PROPOSALS-MIGRATION.sql'));
await db.exec(`insert into auth.users values ('${O}'),('${R}');
  insert into crm_users (id, name, role, active) values ('${O}','Owner','owner',true),('${R}','Rep','rep',true);
  insert into leads values ('L1', '{"name":"Jordan Reed","email":"jordan@reed.test","company":"Reed Realty Group","onboarding":{"deposit_paid":{"done":"2026-10-04"}},"notes":"PRIVATE LEAD NOTES"}');
  insert into proposals (id, lead_id, token, status, body, notes) values
    ('11111111-1111-4111-8111-111111111111','L1','${T('ACC')}','accepted','{"client":{"company":"Reed Realty Group"},"copy":{"plan":{"goal":"20 closings"}},"contacts":[{"name":"Garrett"}],"launchDays":14}','PROPOSAL NOTES'),
    ('22222222-2222-4222-8222-222222222222','L1','${T('SENT')}','sent','{}','');`);

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
/* the service role's calls persist (no rollback), like the real server's */
async function svc(sql) {
  await db.exec('set role service_role');
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role'); }
}

console.log('\nthe migration');
const MIG = read('ONBOARDING-MIGRATION.sql');
let e = await run(MIG);
ok('runs on a fresh database', e === '', e);
e = await run(MIG);
ok('runs again (re-running is safe)', e === '', e);
e = await run(read('RLS-AUDIT.sql'));
ok('RLS-AUDIT.sql still passes', e === '', e);

console.log('\nevery policy, read');
const pols = (await db.query(`select c.relname t, p.polname n, p.polcmd cmd, p.polpermissive perm,
  pg_get_expr(p.polqual, p.polrelid) u, pg_get_expr(p.polwithcheck, p.polrelid) w
  from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname in ('onboardings','onboarding_files') order by 1`)).rows;
ok('exactly two policies', pols.length === 2, JSON.stringify(pols));
for (const p of pols) ok(`  ${p.t}.${p.n}: ALL, is_owner() both ways`, p.cmd === '*' && /^is_owner\(\)$/.test(p.u) && /^is_owner\(\)$/.test(p.w), JSON.stringify(p));
const fns = (await db.query(`select proname, has_function_privilege('anon', oid, 'execute') a, has_function_privilege('authenticated', oid, 'execute') b
  from pg_proc where proname like 'onboarding\\_%' order by 1`)).rows;
ok('nine onboarding_* functions', fns.length === 9, fns.map(f => f.proname).join(','));
ok('  none executable by anon or authenticated', fns.every(f => !f.a && !f.b), JSON.stringify(fns.filter(f => f.a || f.b)));
const bucket = (await db.query(`select public, file_size_limit from storage.buckets where id = 'onboarding'`)).rows[0];
ok('bucket exists, private, 50 MB', bucket && bucket.public === false && Number(bucket.file_size_limit) === 52428800, JSON.stringify(bucket));
ok('no policy on storage.objects', (await db.query(`select count(*)::int n from pg_policy where polrelid = 'storage.objects'::regclass`)).rows[0].n === 0);

console.log('\nthe owner makes one by hand');
const mk = await as(O, `insert into onboardings (lead_id, token, products, industry) values ('L1','${T('MAN')}','{website}','service') returning id`);
ok('owner can insert', !mk.error, mk.error);
/* auth.uid() casts the claims to json; a session after a rolled-back
   set_config holds '' there, which is not json. Supabase always sets it. */
await db.exec(`select set_config('request.jwt.claims', '{}', false)`);
await db.exec(`insert into onboardings (id, lead_id, token, products, answers) values
  ('33333333-3333-4333-8333-333333333333','L1','${T('OPEN')}','{website,suite}','{}'),
  ('44444444-4444-4444-8444-444444444444','L1','${T('DONE')}','{suite}','{"biz.contact_name":"Dee","biz.email":"d@d.test","biz.name":"Dee Co"}');`);
ok('owner reads them', (await as(O, `select count(*)::int n from onboardings`)).rows[0].n === 2);
ok('owner can update answers', (await as(O, `update onboardings set answers='{"x":1}' where token='${T('OPEN')}'`)).affected === 1);
ok('owner rejected for a product outside the vocabulary', /check/i.test((await as(O, `insert into onboardings (lead_id, token, products) values ('L1','${T('BAD')}','{seo}')`)).error || ''));

console.log('\nanon and a rep');
for (const [who, label] of [['anon', 'anon'], [R, 'rep']]) {
  const sel = await as(who, `select count(*)::int n from onboardings`);
  ok(`${label}: reads no onboardings`, sel.error ? /permission denied/.test(sel.error) : sel.rows[0].n === 0, JSON.stringify(sel));
  const fsel = await as(who, `select count(*)::int n from onboarding_files`);
  ok(`${label}: reads no files`, fsel.error ? /permission denied/.test(fsel.error) : fsel.rows[0].n === 0, JSON.stringify(fsel));
  const ins = await as(who, `insert into onboardings (lead_id, token) values ('L1','${T('SNEAK')}')`);
  ok(`${label}: cannot insert`, !!ins.error, JSON.stringify(ins));
  const up = await as(who, `update onboardings set status='submitted'`);
  ok(`${label}: an update changes nothing`, !!up.error || up.affected === 0, JSON.stringify(up));
  for (const call of [`select * from onboarding_public('${T('OPEN')}')`, `select onboarding_save('${T('OPEN')}','{}','{}')`,
    `select * from onboarding_for_proposal('${T('ACC')}','{website}','x')`, `select onboarding_submit('${T('OPEN')}','{}')`]) {
    const r = await as(who, call);
    ok(`${label}: cannot call ${call.match(/onboarding_\w+/)[0]}`, /permission denied/.test(r.error || ''), JSON.stringify(r));
  }
}

console.log('\nthe server: the functions keep their own rules');
let rows = await svc(`select * from onboarding_public('${T('NOPE')}')`);
ok('unknown token: no row', rows.length === 0);
rows = await svc(`select * from onboarding_public('short')`);
ok('malformed token: no row', rows.length === 0);
rows = await svc(`select * from onboarding_public('${T('OPEN')}')`);
ok('known token: one row', rows.length === 1);
const cols = Object.keys(rows[0] || {});
ok('  named columns only: no token, lead_id, outputs or notes', !cols.some(c => /token|lead_id|outputs|notes|created_by/.test(c)), cols.join(','));
ok('  carries the deposit date from the LEAD checklist', rows[0].checklist.deposit_paid.done === '2026-10-04', JSON.stringify(rows[0].checklist));
ok('  never the lead\'s private notes', !JSON.stringify(rows[0]).includes('PRIVATE LEAD NOTES'));
ok('save works', (await svc(`select onboarding_save('${T('OPEN')}','{"biz.name":"Reed"}','{"biz":{"done":true}}') r`))[0].r === 'saved');
ok('  and moves not_started -> in_progress', (await db.query(`select status from onboardings where token='${T('OPEN')}'`)).rows[0].status === 'in_progress');
const OPEN_ID = '33333333-3333-4333-8333-333333333333';
const goodPath = `${OPEN_ID}/logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
const otherPath = `44444444-4444-4444-8444-444444444444/logos/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;
ok('file begin: own folder ok', (await svc(`select onboarding_file_begin('${T('OPEN')}','logos','${goodPath}','logo.png','image/png',false) r`))[0].r === 'ok');
ok('file begin: another onboarding\'s folder refused', (await svc(`select onboarding_file_begin('${T('OPEN')}','logos','${otherPath}','x.png','image/png',false) r`))[0].r === 'bad_path');
ok('pending files are not public', (await svc(`select files from onboarding_public('${T('OPEN')}')`))[0].files.length === 0);
ok('file finish', (await svc(`select onboarding_file_finish('${T('OPEN')}','${goodPath}',1234) r`))[0].r === 'ok');
const listed = (await svc(`select files from onboarding_public('${T('OPEN')}')`))[0].files;
ok('  one file, named logo.png, no path key', listed.length === 1 && listed[0].name === 'logo.png' && !('path' in listed[0]), JSON.stringify(listed));
ok('submit refused without name/email/business', (await svc(`select onboarding_submit('${T('OPEN')}','{}') r`))[0].r === 'incomplete');
await svc(`select onboarding_save('${T('OPEN')}','{"biz.contact_name":"Jordan","biz.email":"j@r.test","biz.name":"Reed"}','{}')`);
ok('submit refused: files without the rights box', (await svc(`select onboarding_submit('${T('OPEN')}','{}') r`))[0].r === 'rights');
await svc(`select onboarding_save('${T('OPEN')}','{"biz.contact_name":"Jordan","biz.email":"j@r.test","biz.name":"Reed","fl.rights":true}','{}')`);
ok('submit', (await svc(`select onboarding_submit('${T('OPEN')}','{"websitePrompt":"x"}') r`))[0].r === 'submitted');
ok('submit again: already', (await svc(`select onboarding_submit('${T('OPEN')}','{}') r`))[0].r === 'already');
ok('save after submit: locked', (await svc(`select onboarding_save('${T('OPEN')}','{}','{}') r`))[0].r === 'locked');
ok('file begin after submit: locked', (await svc(`select onboarding_file_begin('${T('OPEN')}','logos','${OPEN_ID}/logos/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png','x','image/png',false) r`))[0].r === 'locked');
ok('file drop after submit: nothing', (await svc(`select onboarding_file_drop('${T('OPEN')}', (select id from onboarding_files limit 1)) r`))[0].r === null);
ok('resume mail: once, then too soon', (await svc(`select onboarding_mark_mailed('${T('DONE')}') r`))[0].r !== null
  && (await svc(`select onboarding_mark_mailed('${T('DONE')}') r`))[0].r === null);
ok('resume mail refused once submitted', (await svc(`select onboarding_mark_mailed('${T('OPEN')}') r`))[0].r === null);

console.log('\ncreated at acceptance');
rows = await svc(`select * from onboarding_for_proposal('${T('SENT')}','{website}','Website')`);
ok('a proposal that is not accepted makes nothing', rows.length === 0 && (await db.query(`select count(*)::int n from onboardings where proposal_id='22222222-2222-4222-8222-222222222222'`)).rows[0].n === 0);
const a1 = await svc(`select * from onboarding_for_proposal('${T('ACC')}','{website,suite}','Growth OS')`);
const a2 = await svc(`select * from onboarding_for_proposal('${T('ACC')}','{website,suite}','Growth OS')`);
ok('an accepted one makes one, with a 43-char token', a1.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(a1[0].token), JSON.stringify(a1));
ok('  asking again returns the SAME onboarding', a2.length === 1 && a2[0].token === a1[0].token);
ok('  exactly one row for that proposal', (await db.query(`select count(*)::int n from onboardings where proposal_id='11111111-1111-4111-8111-111111111111'`)).rows[0].n === 1);
const fromProp = (await svc(`select * from onboarding_public('${a1[0].token}')`))[0];
ok('  prefill from the proposal: plan, contacts, launch days', fromProp.plan.goal === '20 closings' && fromProp.contacts[0].name === 'Garrett' && fromProp.launch_days === 14, JSON.stringify(fromProp));
ok('  never the proposal\'s notes', !JSON.stringify(fromProp).includes('PROPOSAL NOTES'));
const pend = await svc(`select * from onboarding_sweep_pending()`);
ok('sweep: nothing young is swept', pend.length === 0);

console.log(`\nonbrlsdb: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
