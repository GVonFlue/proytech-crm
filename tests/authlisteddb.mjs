/* AUTH-LISTED-2026-10.sql, RUN AGAINST A REAL POSTGRES — locally only.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS): it needs PGlite.
     npm i --no-save @electric-sql/pglite && node tests/authlisteddb.mjs

   Builds the database the way production was BEFORE the fix (leads_all on
   crm_active()), shows the hole by using it, applies AUTH-LISTED-2026-10.sql,
   and proves:
     - a login with no crm_users row cannot insert, read, edit or delete a
       lead, gets no team list and no leaderboard, and cannot write a read
       receipt
     - an active rep still reads and writes their own leads and the pool,
       sees the team list and the leaderboard; an owner sees everything
     - an inactive rep is shut out, as before
     - first-run mode (nobody set up yet) still behaves as it always has
     - re-running is clean, RLS-AUDIT.sql still passes

   It is not VERIFY-RLS.md §16: PGlite is Postgres, not Supabase.          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/authlisteddb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SUPABASE = read('tests/onbrlsdb.mjs').match(/const SUPABASE = `([\s\S]*?)`;/)[1];

const OWNER = '00000000-0000-4000-8000-00000000000a', REP = '00000000-0000-4000-8000-00000000000b',
  OLD = '00000000-0000-4000-8000-00000000000c', STRANGER = '00000000-0000-4000-8000-00000000000d';

const db = new PGlite();
const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { try { await db.exec('rollback'); } catch {} return String(e.message || e); } };
async function as(who, sql) {
  await db.exec('begin');
  try {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: who, role: 'authenticated' })}', true)`);
    await db.exec('set local role authenticated');
    const r = await db.query(sql);
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { return { error: String(e.message || e) }; }
  finally { await db.exec('rollback'); }
}
const n = async (who, sql) => { const r = await as(who, sql); return r.error ? 'ERR ' + r.error : r.rows.length; };

await db.exec(SUPABASE);
/* Supabase's auth.users has more columns; REP-ACTIVITY-MIGRATION.sql reads this one */
await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz;`);
/* every signed-in account is in auth.users (leads.owner_id references it), the
   stranger included: that is what made the hole real in production */
await db.exec(`insert into auth.users (id) values ('${OWNER}'),('${REP}'),('${OLD}'),('${STRANGER}');`);
ok('MIGRATION.sql', (await run(read('MIGRATION.sql'))) === '');
for (const f of ['TEAM-MIGRATION.sql', 'KB-MIGRATION.sql', 'REP-ACTIVITY-MIGRATION.sql']) ok(f, (await run(read(f))) === '', await run(read(f)));

console.log('\nfirst-run mode (nobody set up): unchanged');
ok('with no crm_users at all, a signed-in person still sees and writes leads, as before', (await as(STRANGER, `insert into leads (id, data, owner_id) values ('FR', '{}', '${STRANGER}') returning id`)).rows?.length === 1);

ok('(set up: the team)', (await run(`insert into crm_users (id, name, role, active, pools) values ('${OWNER}','Owner','owner',true,'{}'),('${REP}','Rep','rep',true,'{Inbound}'),('${OLD}','Old Rep','rep',false,'{}')`)) === '');
ok('(set up: leads)', (await run(`insert into leads (id, data, owner_id, pool) values ('L-own', '{}', '${OWNER}', null), ('L-rep', '{}', '${REP}', null), ('L-pool', '{}', null, 'Inbound'),
    ('L-client', '{"isClient":"true","convertedAt":"2026-10-01"}', '${REP}', null)`)) === '');
const kbErr = await run(`insert into kb_notes (id) values ('N1'); insert into kb_published (id, title, body) values ('N1', 'Note', 'Body')`);
ok('(set up: a published note)', kbErr === '', kbErr);

console.log('\nBEFORE: the policy as production had it (crm_active)');
await run(`drop policy if exists leads_all on leads;
  create policy leads_all on leads for all using (no_users() or (crm_active() and (is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())))))
  with check (no_users() or (crm_active() and (is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())))));
  create or replace function crm_team() returns table (id uuid, name text, role text) language sql security definer stable as $$ select u.id, u.name, u.role from crm_users u where u.active order by u.role, u.name $$;`);
const holeIns = await as(STRANGER, `insert into leads (id, data, owner_id) values ('SPAM', '{"name":"spam"}', '${STRANGER}') returning id`);
ok('the hole was real: a login with no crm_users row could insert a lead it owned', holeIns.rows && holeIns.rows.length === 1, JSON.stringify(holeIns));
ok('  and read the whole team list', (await n(STRANGER, `select * from crm_team()`)) === 2);

console.log('\nAUTH-LISTED-2026-10.sql');
const SQL = read('AUTH-LISTED-2026-10.sql');
ok('runs', (await run(SQL)) === '');
ok('  and again', (await run(SQL)) === '');

console.log('\na login with no crm_users row (a stray account; a portal client)');
{
  const ins = await as(STRANGER, `insert into leads (id, data, owner_id) values ('SPAM2', '{}', '${STRANGER}')`);
  ok('cannot insert a lead, even one it would own', /row-level security/.test(ins.error || ''), JSON.stringify(ins));
  await db.exec(`insert into leads (id, data, owner_id) values ('SPAM3', '{}', '${STRANGER}')`);   // as if one were already there
  ok('cannot read one, even one it "owns"', (await n(STRANGER, `select * from leads`)) === 0);
  ok('cannot edit it', (await as(STRANGER, `update leads set data = '{"x":1}' where id = 'SPAM3'`)).affected === 0);
  ok('cannot delete it', (await as(STRANGER, `delete from leads where id = 'SPAM3'`)).affected === 0);
  ok('gets no team list', (await n(STRANGER, `select * from crm_team()`)) === 0);
  ok('gets no leaderboard', (await n(STRANGER, `select * from crm_leaderboard()`)) === 0);
  const kb = await as(STRANGER, `select kb_mark_read('N1', 'read')`);
  ok('cannot write a read receipt', /not a team member/.test(kb.error || ''), JSON.stringify(kb));
}

console.log('\nthe team: unchanged');
{
  ok('a rep reads their own lead and the pool, not the owner\'s', (await n(REP, `select * from leads where id in ('L-own','L-rep','L-pool')`)) === 2);
  ok('  inserts a lead they own', (await as(REP, `insert into leads (id, data, owner_id) values ('R2', '{}', '${REP}') returning id`)).rows?.length === 1);
  ok('  sees the team list and the leaderboard', (await n(REP, `select * from crm_team()`)) === 2 && (await n(REP, `select * from crm_leaderboard()`)) === 1);
  ok('  and can mark a note read', !((await as(REP, `select kb_mark_read('N1', 'read')`)).error || '').includes('not a team member'));
  ok('an owner sees every lead (the four, the first-run one, the old spam row)', (await n(OWNER, `select * from leads`)) === (await db.query('select count(*)::int c from leads')).rows[0].c);
  ok('an inactive rep sees nothing, as before', (await n(OLD, `select * from leads`)) === 0 && (await n(OLD, `select * from crm_team()`)) === 0);
}

ok('RLS-AUDIT.sql still passes', (await run(read('RLS-AUDIT.sql'))) === '', await run(read('RLS-AUDIT.sql')));

await db.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
