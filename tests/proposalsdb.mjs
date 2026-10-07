/* PROPOSALS-LEGAL-MIGRATION.sql, RUN AGAINST A REAL POSTGRES — locally only.
   ============================================================================

   A TOOL, not a suite (listed in tests/all.mjs HELPERS): it needs PGlite,
   real Postgres compiled to WebAssembly, which is not a project dependency.

     npm i --no-save @electric-sql/pglite && node tests/proposalsdb.mjs

   Builds a Supabase-shaped database (roles, auth.uid()), applies MIGRATION.sql,
   PROPOSALS-MIGRATION.sql and then PROPOSALS-LEGAL-MIGRATION.sql, and proves
   the rules by trying them:

   - a proposal WITH legal links cannot be accepted without the agreement —
     by the new function or the old one — and nothing is recorded;
   - with it, the record holds the terms URLs and version FROM THE STORED
     BODY (the request has no way to supply them);
   - a proposal WITHOUT legal links accepts exactly as before, through the old
     four-argument call the deployed code uses (so running the SQL first is
     safe);
   - only the server can call either function; re-running is clean.

   It is not VERIFY-RLS.md §12: PGlite is Postgres, not Supabase.          */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch { console.log('tests/proposalsdb.mjs needs PGlite: npm i --no-save @electric-sql/pglite'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SUPABASE = read('tests/rlsdb.mjs').match(/const SUPABASE = `([\s\S]*?)`;/)[1];
/* PGlite ships without the pgcrypto extension; gen_random_uuid() is built in */
const PROPOSALS = read('PROPOSALS-MIGRATION.sql').replace(/create extension if not exists pgcrypto;/, '');
const LEGAL = read('PROPOSALS-LEGAL-MIGRATION.sql');

const T = (s) => (s + 'A'.repeat(43)).slice(0, 43);
const LEGAL_BODY = { legal: { termsUrl: 'https://getproytech.com/terms', privacyUrl: 'https://getproytech.com/privacy', version: '2026-10-04' }, quote: {} };

const db = new PGlite();
const run = async sql => { try { await db.exec(sql); return ''; } catch (e) { try { await db.exec('rollback'); } catch {} return String(e.message || e); } };
const as = async (role, sql) => { await db.exec('begin'); try { await db.exec(`set local role ${role}`); const r = await db.query(sql); return { rows: r.rows }; } catch (e) { return { error: String(e.message || e) }; } finally { await db.exec('rollback'); } };
const server = async sql => { const r = await as('service_role', sql); return r.error ? 'ERR ' + r.error : Object.values(r.rows[0] || {})[0]; };
const rec = async tok => (await db.query(`select status, accepted_name, accepted_terms_version v, accepted_terms_url tu, accepted_privacy_url pu from proposals where token = '${tok}'`)).rows[0];

console.log('\nset up: Supabase shape, MIGRATION.sql, PROPOSALS-MIGRATION.sql');
await db.exec(SUPABASE);
ok('MIGRATION.sql', await run(read('MIGRATION.sql')) === '');
ok('PROPOSALS-MIGRATION.sql', await run(PROPOSALS) === '');
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;`);
const seed = async () => {
  await db.exec(`delete from proposals;`);
  for (const [tok, body] of [[T('legal'), LEGAL_BODY], [T('plain'), { quote: {} }], [T('legal2'), LEGAL_BODY], [T('emptylegal'), { legal: { termsUrl: '', privacyUrl: '', version: '' } }]])
    await db.query(`insert into proposals (lead_id, token, status, body, expires_at) values ('L', $1, 'sent', $2::jsonb, now() + interval '7 days')`, [tok, JSON.stringify(body)]);
};

console.log('\nbefore the legal migration: what the deployed code does today');
await seed();
ok('the old four-argument accept works on a plain proposal', await server(`select proposal_accept('${T('plain')}','Dee','1.1.1.1','monthly')`) === 'accepted');

console.log('\nthe legal migration');
ok('runs, and its verification passes', (await run(LEGAL)) === '');
ok('re-running is clean', (await run(LEGAL)) === '');
const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'proposals' and column_name like 'accepted_%' order by 1`)).rows.map(r => r.column_name).join();
ok('three new columns', cols === 'accepted_at,accepted_ip,accepted_name,accepted_plan,accepted_privacy_url,accepted_terms_url,accepted_terms_version', cols);

console.log('\nWITH legal links: no agreement, no acceptance');
await seed();
ok('new function, agreed = false: terms_required', await server(`select proposal_accept('${T('legal')}','Dee Client','1.1.1.1','monthly', false)`) === 'terms_required');
ok('new function, agreed = null: terms_required', await server(`select proposal_accept('${T('legal')}','Dee Client','1.1.1.1','monthly', null)`) === 'terms_required');
ok('the OLD four-argument function: terms_required (cannot bypass)', await server(`select proposal_accept('${T('legal')}','Dee Client','1.1.1.1','monthly')`) === 'terms_required');
let r = await rec(T('legal'));
ok('  and nothing was recorded: still sent, no name, no terms', r.status === 'sent' && !r.accepted_name && !r.v && !r.tu && !r.pu, JSON.stringify(r));
ok('the other rules still come first (bad name, bad plan)', await server(`select proposal_accept('${T('legal')}',' ','1.1.1.1','monthly', true)`) === 'bad_name' && await server(`select proposal_accept('${T('legal')}','Dee','1.1.1.1','weekly', true)`) === 'bad_plan');

console.log('\nWITH legal links, agreed: the record comes from the stored proposal');
await db.exec('begin'); await db.exec('set local role service_role');
const acc = (await db.query(`select proposal_accept('${T('legal')}','Dee Client','9.8.7.6','annual', true) as r`)).rows[0].r;
await db.exec('commit');
r = await rec(T('legal'));
ok('accepted', acc === 'accepted' && r.status === 'accepted');
ok('  version, Terms URL and Privacy URL copied from the body', r.v === '2026-10-04' && r.tu === 'https://getproytech.com/terms' && r.pu === 'https://getproytech.com/privacy', JSON.stringify(r));
ok('  alongside the name (and the existing time / IP / plan columns)', r.accepted_name === 'Dee Client' && (await db.query(`select accepted_ip, accepted_plan, accepted_at is not null t from proposals where token = '${T('legal')}'`)).rows[0].accepted_plan === 'annual');
ok('a second acceptance is "already" and changes nothing', await server(`select proposal_accept('${T('legal')}','Eve','2.2.2.2','monthly', true)`) === 'already' && (await rec(T('legal'))).accepted_name === 'Dee Client');
const fnSrc = (await db.query(`select prosrc from pg_proc where proname = 'proposal_accept' and pronargs = 5`)).rows[0].prosrc;
ok('the function takes no terms URL or version from its caller: they come from r.body', /legal := case when jsonb_typeof\(r\.body->'legal'\)/.test(fnSrc) && !/p_terms_url|p_version/.test(fnSrc));

console.log('\nWITHOUT legal links: exactly as before');
await db.exec(`begin; set local role service_role;`); const p1 = (await db.query(`select proposal_accept('${T('plain')}','Pat','1.1.1.1','monthly') as r`)).rows[0].r; await db.exec('commit');
r = await rec(T('plain'));
ok('the old four-argument call accepts it (the deployed code keeps working)', p1 === 'accepted' && r.status === 'accepted');
ok('  and records no terms', !r.v && !r.tu && !r.pu);
ok('an empty legal block counts as none', await server(`select proposal_accept('${T('emptylegal')}','Pat','1.1.1.1','monthly', false)`) === 'accepted');
ok('the new call with agreed = false also accepts a plain proposal', await server(`select proposal_accept('${T('legal2')}','Pat','1.1.1.1','monthly', false)`) === 'terms_required'
  && (await db.query(`update proposals set body = '{"quote":{}}'::jsonb where token = '${T('legal2')}'`), await server(`select proposal_accept('${T('legal2')}','Pat','1.1.1.1','monthly', false)`)) === 'accepted');

console.log('\nonly the server can call them');
for (const role of ['anon', 'authenticated']) {
  const a = await as(role, `select proposal_accept('${T('legal')}','X','1','monthly', true)`);
  const b = await as(role, `select proposal_accept('${T('legal')}','X','1','monthly')`);
  ok(`${role}: permission denied, both signatures`, /permission denied/.test(a.error || '') && /permission denied/.test(b.error || ''), JSON.stringify([a, b]));
}

console.log('\nPROPOSALS-ARCHIVE-MIGRATION.sql: an accepted proposal is kept (Terms 18.2)');
{
  const ARCH = read('PROPOSALS-ARCHIVE-MIGRATION.sql');
  /* the sections above left accepted rows; after this migration nothing can
     delete them, which is the point. Seed once, before it goes in. */
  await seed();
  ok('runs', (await run(ARCH)) === '');
  ok('  with accepted rows present, the old reset (delete everything) is now refused', /An accepted proposal is kept for the record/.test(await run(`update proposals set status = 'accepted', accepted_at = now() where token = '${T('legal2')}'; delete from proposals`)));
  await run(`alter table proposals disable trigger proposals_keep_accepted_upd`); await run(`alter table proposals disable trigger proposals_keep_accepted_del`);
  await seed();
  await run(`alter table proposals enable trigger proposals_keep_accepted_upd`); await run(`alter table proposals enable trigger proposals_keep_accepted_del`);
  ok('  and again (re-running is safe)', (await run(ARCH)) === '');
  /* one accepted, one sent, one draft: accept through the real function */
  await db.exec('begin'); await db.exec('set local role service_role');
  await db.query(`select proposal_accept('${T('legal')}','Dee Client','9.8.7.6','monthly', true)`);
  await db.exec('commit');
  await db.query(`update proposals set status = 'draft' where token = '${T('legal2')}'`);
  const tryAs = async (role, sql) => role === 'postgres' ? (await run(sql)) : ((await as(role, sql)).error || '');
  const kept = /An accepted proposal is kept for the record/;
  for (const role of ['service_role', 'postgres'])
    ok(`${role}: deleting the accepted proposal is refused`, kept.test(await tryAs(role, `delete from proposals where token = '${T('legal')}'`)));
  ok('  a bulk delete of everything is refused too (and deletes nothing)', kept.test(await run(`delete from proposals`)) && (await db.query(`select count(*)::int n from proposals`)).rows[0].n === 4);
  ok('the accepted row and its record are all still there', (await rec(T('legal'))).status === 'accepted' && (await rec(T('legal'))).accepted_name === 'Dee Client' && (await rec(T('legal'))).v === '2026-10-04');
  const changed = /An accepted proposal cannot be changed/;
  for (const [what, set] of [['its status', `status = 'sent'`], ['its body', `body = '{}'::jsonb`], ['the accepted name', `accepted_name = 'Someone Else'`], ['the IP', `accepted_ip = '0.0.0.0'`], ['the time', `accepted_at = now()`], ['the plan', `accepted_plan = 'annual'`], ['the terms version', `accepted_terms_version = 'X'`], ['the terms link', `accepted_terms_url = 'https://x.test'`], ['the privacy link', `accepted_privacy_url = 'https://x.test'`]])
    ok(`changing ${what} on an accepted proposal is refused`, changed.test(await run(`update proposals set ${set} where token = '${T('legal')}'`)));
  ok('archiving it works', (await run(`update proposals set archived_at = now() where token = '${T('legal')}'`)) === '' && !!(await db.query(`select archived_at from proposals where token = '${T('legal')}'`)).rows[0].archived_at);
  ok('  and so does unarchiving', (await run(`update proposals set archived_at = null where token = '${T('legal')}'`)) === '');
  ok('the CRM marking it applied still works', (await run(`update proposals set applied_at = now(), updated_at = now() where token = '${T('legal')}'`)) === '');
  ok('an archived accepted proposal still opens for the client', (await run(`update proposals set archived_at = now() where token = '${T('legal')}'`)) === '' && (await server(`select status from proposal_public('${T('legal')}')`)) === 'accepted');
  ok('archiving a draft is refused (delete it instead)', /Only an accepted proposal can be archived/.test(await run(`update proposals set archived_at = now() where token = '${T('legal2')}'`)));
  /* as() rolls back, so: allowed as the server, then really deleted */
  ok('a sent proposal deletes (as the server, and for real)', (await tryAs('service_role', `delete from proposals where token = '${T('plain')}'`)) === ''
    && (await run(`delete from proposals where token = '${T('plain')}'`)) === '' && !(await rec(T('plain'))));
  ok('a draft deletes', (await run(`delete from proposals where token = '${T('legal2')}'`)) === '' && !(await rec(T('legal2'))));
  ok('accepting a sent proposal still works under the trigger', (await server(`select proposal_accept('${T('emptylegal')}','Pat','1.1.1.1','monthly', false)`)) === 'accepted');
  ok('RLS-AUDIT.sql still passes', (await run(read('RLS-AUDIT.sql'))) === '');
}

await db.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
