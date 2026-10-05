/* ONBOARDING-MIGRATION.sql, READ AS TEXT — the half CI always runs.

   tests/onbrlsdb.mjs runs the migration against real Postgres, but PGlite is
   not a dependency, so that file is a tool. This one needs nothing and pins
   the parts of the file that make the boundary, so a later edit that drops
   one fails here even on a machine that never runs the tool:

     - every onboarding_* function is SECURITY DEFINER with a fixed
       search_path, revoked from public/anon/authenticated and granted to
       service_role only — a function created and not revoked is executable
       by anyone (Postgres grants EXECUTE to PUBLIC by default)
     - both tables enable RLS and have exactly ONE policy, is_owner() both
       ways; nothing anywhere says `using (true)`
     - no `force row level security` (it would break the definer functions)
     - the bucket is created private, and no policy touches storage.objects
     - onboarding_public() never returns token, lead_id, outputs or notes

   Seen red: deleting one revoke line; adding `using (true)`; adding
   `token` to onboarding_public's RETURNS TABLE. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = fs.readFileSync(path.join(ROOT, 'ONBOARDING-MIGRATION.sql'), 'utf8');
/* comments stripped, so prose that MENTIONS a forbidden phrase is not code */
const CODE = SQL.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const fns = [...CODE.matchAll(/create or replace function (onboarding_\w+)\s*\(([^)]*)\)/g)].map(m => ({
  name: m[1], sig: m[2].split(',').map(a => a.trim().split(/\s+/).pop()).filter(Boolean).join(', '),
}));
ok('nine functions', fns.length === 9, fns.map(f => f.name).join(', '));
for (const f of fns) {
  const body = CODE.slice(CODE.indexOf(`create or replace function ${f.name}(`));
  const head = body.slice(0, body.indexOf('$$'));
  ok(`${f.name}: security definer, fixed search_path`, /security definer/.test(head) && /set search_path = public/.test(head), head);
  const sig = `${f.name}(${f.sig})`.replace(/\s+/g, ' ');
  const flat = CODE.replace(/\s+/g, ' ');
  ok(`${f.name}: revoked from public, anon, authenticated`, flat.includes(`revoke all on function ${sig} from public, anon, authenticated;`), sig);
  ok(`${f.name}: granted to service_role only`, flat.includes(`grant execute on function ${sig} to service_role;`)
    && !new RegExp(`grant execute on function ${f.name}\\b[^;]*to (anon|authenticated|public)`).test(flat), sig);
}

for (const t of ['onboardings', 'onboarding_files']) {
  ok(`${t}: RLS enabled`, CODE.includes(`alter table ${t} enable row level security;`));
  const pols = [...CODE.matchAll(new RegExp(`create policy (\\w+) on ${t}\\b([^;]*);`, 'g'))];
  ok(`${t}: exactly one policy`, pols.length === 1, pols.map(p => p[1]).join(','));
  ok(`${t}: is_owner() both ways`, pols[0] && /using \(is_owner\(\)\) with check \(is_owner\(\)\)/.test(pols[0][2].replace(/\s+/g, ' ')), pols[0] && pols[0][2]);
  ok(`${t}: anon has no table privileges`, CODE.includes(`revoke all on ${t} from anon;`));
}
ok('nothing says using (true) or with check (true)', !/(using|with check)\s*\(\s*true\s*\)/i.test(CODE));
ok('no force row level security', !/force row level security/i.test(CODE));
ok('no policy on storage.objects', !/create policy[^;]*storage\.objects/i.test(CODE));
ok('bucket created private', /insert into storage\.buckets[^;]*values \('onboarding', 'onboarding', false,/.test(CODE.replace(/\s+/g, ' ')));

const pub = CODE.slice(CODE.indexOf('create or replace function onboarding_public('));
const ret = pub.slice(pub.indexOf('returns table'), pub.indexOf('language'));
for (const col of ['token', 'lead_id', 'outputs', 'notes', 'created_by', 'resume_mailed_at'])
  ok(`onboarding_public does not return ${col}`, !new RegExp(`\\b${col}\\b`).test(ret), ret);

console.log(`\nonbsql: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
