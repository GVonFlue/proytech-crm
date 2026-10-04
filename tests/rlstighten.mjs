/* RLS-TIGHTEN-2026-10: the SQL, read as text, on every CI run.
   ============================================================================

   tests/rlsdb.mjs RUNS these files against real Postgres (PGlite) and proves
   what each person can do; it is a tool, because PGlite is not a dependency.
   This file is the half CI can always run: it holds the SHAPE of the change
   in place, so a later edit cannot quietly reopen what it closed —

   - the migration drops EVERY policy on the four tables (a leftover nobody
     listed is the failure ENGINEERING §4c records), in ONE transaction, and
     refuses to commit an end state it did not intend;
   - owners write app_settings; the shared `tasks` row is the only thing a
     listed user may write; events and site_* are owner-only; anon gets no
     privilege on site_*;
   - MIGRATION.sql, which is re-runnable, can no longer put events_all or the
     any-listed-user settings_write back, and never calls is_owner() before
     defining it;
   - the rollback says, loudly, that it reopens the holes.               */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : ''))); };
/* code only: comments stripped, so prose that QUOTES the old policy never counts */
const code = sql => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const OWNER = "no_users() or (crm_active() and is_owner())";

const T = read('RLS-TIGHTEN-2026-10.sql'), TC = code(T);
const RB = read('RLS-TIGHTEN-2026-10-ROLLBACK.sql');
const M = read('MIGRATION.sql'), MC = code(M);

console.log('\nRLS-TIGHTEN-2026-10.sql');
{
  ok('one transaction: begin before the first change, commit after the verification',
    TC.indexOf('begin;') > -1 && TC.indexOf('begin;') < TC.indexOf('drop policy') && TC.lastIndexOf('commit;') > TC.indexOf("RLS-TIGHTEN OK"));
  ok('prints every policy BEFORE changing anything', TC.indexOf('pg_get_expr(p.polqual') < TC.indexOf('begin;'));
  ok('drops EVERY policy on the four tables, not just the four named',
    /for r in\s+select c\.relname as tbl, p\.polname as policy[\s\S]*?c\.relname in \('app_settings','events','site_events','site_settings'\)[\s\S]*?execute format\('drop policy if exists %I on public\.%I', r\.policy, r\.tbl\)/.test(TC));
  ok('every create policy is preceded by a drop if exists for the same name (safe to re-run)',
    [...TC.matchAll(/create policy (\w+) on (\w+)/g)].every(([, n, t]) => new RegExp(`drop policy if exists ${n} on ${t};\\s*create policy ${n} on ${t}`).test(TC)));
  ok('settings_read: listed users read', /create policy settings_read on app_settings for select\s+using \(no_users\(\) or crm_listed\(\)\);/.test(TC));
  for (const [n, cmd] of [['settings_owner_insert', 'insert'], ['settings_owner_update', 'update'], ['settings_owner_delete', 'delete']])
    ok(`${n}: owners only`, new RegExp(`create policy ${n} on app_settings for ${cmd}[^;]*\\(${OWNER.replace(/[()]/g, '\\$&')}\\)`).test(TC));
  ok('the tasks policies can only reach the tasks row', /create policy settings_tasks_insert on app_settings for insert\s+with check \(crm_listed\(\) and id = 'tasks'\);/.test(TC)
    && /create policy settings_tasks_update on app_settings for update\s+using\s+\(crm_listed\(\) and id = 'tasks'\)\s+with check \(crm_listed\(\) and id = 'tasks'\);/.test(TC));
  ok('no tasks DELETE policy (the app never deletes the row)', !/settings_tasks_delete/.test(TC));
  ok('events: owners only, read and write', /create policy events_owner on events for all\s+using\s+\(no_users\(\) or \(crm_active\(\) and is_owner\(\)\)\)\s+with check \(no_users\(\) or \(crm_active\(\) and is_owner\(\)\)\);/.test(TC));
  ok('site_events / site_settings: owners only, and only where they exist', /if to_regclass\('public\.' \|\| t\) is null then[\s\S]*?continue;/.test(TC) && /t \|\| '_owner'/.test(TC) && /using \(no_users\(\) or \(crm_active\(\) and is_owner\(\)\)\)/.test(TC));
  ok('anon loses every privilege on site_*', /revoke all on public\.%I from anon/.test(TC));
  ok('no policy is created with a true expression', !/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(TC));
  ok('no policy grants to PUBLIC or anon by name', !/create policy[^;]*\bto (public|anon)\b/i.test(TC));
  ok('it refuses to commit an unexpected policy set', /raise exception E'RLS-TIGHTEN: unexpected policy set/.test(TC));
  ok('it refuses a surviving permissive true', /raise exception 'RLS-TIGHTEN: permissive true survived on/.test(TC));
  ok('it refuses owner policies without the reference expression', /owner_expr text := '\(no_users\(\) OR \(crm_active\(\) AND is_owner\(\)\)\)'/.test(TC));
  ok('it refuses an unscoped tasks policy', /a tasks policy is not scoped to the tasks row/.test(TC));
  ok('it refuses if anon still has a privilege on site_*', /anon still holds a privilege on/.test(TC));
  ok('it prints every expression AFTER', TC.lastIndexOf('pg_get_expr(p.polqual') > TC.lastIndexOf('commit;'));
  ok('the header says when to run it: after the code deploys', /AFTER the matching code is deployed/.test(T));
}

console.log('\nRLS-TIGHTEN-2026-10-ROLLBACK.sql');
{
  ok('says, loudly, that it re-opens the holes', /THIS RE-OPENS THE HOLES/.test(RB) && /RLS-AUDIT\.sql WILL FAIL after this runs/.test(RB));
  ok('restores the four policies the audit failed on', ['settings_all_authenticated', 'events_all'].every(n => code(RB).includes(`create policy ${n}`)) && /t \|\| '_read'/.test(code(RB)));
  ok('removes every tightened policy', ['settings_owner_insert', 'settings_owner_update', 'settings_owner_delete', 'settings_tasks_insert', 'settings_tasks_update', 'events_owner'].every(n => code(RB).includes(`drop policy if exists ${n}`)));
  ok('one transaction', /begin;[\s\S]*commit;/.test(code(RB)));
}

console.log('\nMIGRATION.sql (re-runnable, so it must not put the holes back)');
{
  ok('creates no policy with a true expression', !/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(MC));
  ok('no longer creates events_all', !/create policy events_all/.test(MC) && /drop policy if exists events_all on events;/.test(MC));
  ok('no longer creates the any-listed-user settings_write', !/create policy settings_write/.test(MC) && /drop policy if exists settings_write on app_settings;/.test(MC));
  ok('creates the same owner + tasks policies as the tighten', ['settings_owner_insert', 'settings_owner_update', 'settings_owner_delete', 'settings_tasks_insert', 'settings_tasks_update', 'events_owner'].every(n => MC.includes(`create policy ${n}`)));
  const firstUse = MC.search(/create policy[^;]*is_owner\(\)/), defined = MC.indexOf('create or replace function is_owner()');
  ok('never calls is_owner() in a policy before defining it (fresh installs)', defined > -1 && firstUse > defined, `${firstUse} vs ${defined}`);
  const evPolicy = MC.indexOf('create policy events_owner'), crmListed = MC.indexOf('create or replace function crm_listed()');
  ok('events_owner comes after every helper it calls', evPolicy > crmListed && evPolicy > MC.indexOf('create or replace function crm_active()'));
}

console.log('\nthe tool that runs it all against real Postgres is wired up');
{
  const all = read('tests/all.mjs');
  ok('tests/rlsdb.mjs exists', fs.existsSync(path.join(ROOT, 'tests/rlsdb.mjs')));
  ok('and is listed as a tool in all.mjs (it needs PGlite, not a dependency)', /'rlsdb\.mjs'/.test(all));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
