/* PORTAL-MIGRATION.sql and the RLS-AUDIT function sweep: the shape, in CI.
   ============================================================================

   tests/portaldb.mjs runs both against a real Postgres (PGlite, a local tool);
   this is the half that runs on every push, so a change that loosens the
   wall fails the build even when nobody runs the tool.

     - the portal functions take NO arguments and start from portal_lead()
     - portal_lead() is an active client_users row and never a CRM user
     - every key portal_home returns is named; nothing returns a whole lead
     - the EIN is masked in SQL; the server functions are service_role only
     - no_users() and crm_whoami() know about client logins
     - RLS-AUDIT.sql 2e fails on a definer function with no gate
     - the CRM's Portal tab is owner-only                                    */
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const sql = fs.readFileSync('PORTAL-MIGRATION.sql', 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = name => { const i = code.indexOf(`create or replace function ${name}(`); return i < 0 ? '' : code.slice(i, code.indexOf('$$;', i) + 3); };

console.log('\nthe one door');
{
  const pl = fn('portal_lead');
  ok('portal_lead(): an ACTIVE client_users row for auth.uid(), and NOT a CRM user', /from client_users c\s+where c\.id = auth\.uid\(\) and c\.active/.test(pl) && /not exists \(select 1 from crm_users u where u\.id = auth\.uid\(\)\)/.test(pl));
  for (const f of ['portal_home', 'portal_documents', 'portal_touch']) {
    const b = fn(f);
    ok(`${f}() takes no arguments`, new RegExp(`create or replace function ${f}\\(\\) returns`).test(b));
    ok(`  and starts from portal_lead()`, /portal_lead\(\)/.test(b));
  }
  ok('the migration checks itself that they take no arguments', /pronargs <> 0/.test(code));
}

console.log('\nnamed fields only');
{
  const h = fn('portal_home');
  ok('portal_home never returns the lead\'s data whole', !/'[a-z_]+',\s*l\s*[,)]/.test(h) && !/to_jsonb\(l\)/.test(h) && !/'data',/.test(h));
  ok('  nor the notes, activities, deals, owners or IP', !/notes|activities|deals|owner_id|accepted_ip|'owners'/.test(h));
  ok('  the checklist keys are named one by one', ['deposit_paid', 'intake_form', 'access_dns', 'access_gbp', 'logo_received', 'headshot_received', 'kickoff_call'].every(k => h.includes(`'${k}', l->'onboarding'->'${k}'`)));
  const d = fn('portal_documents');
  ok('portal_documents returns the proposal body by its public keys only', ['client', 'company', 'preparedOn', 'validDays', 'copy', 'quote', 'standard', 'contacts', 'launchDays', 'legal'].every(k => d.includes(`'${k}', p.body->'${k}'`)) && !/'body', p\.body[,)]/.test(d));
  ok('  and never the proposal\'s notes or IP', !/p\.notes|accepted_ip/.test(d));
  ok('the EIN is masked to its last 4 in SQL', /jsonb_set\(o\.answers, '\{tx\.ein\}', to_jsonb\('•••••' \|\| right\(/.test(d));
}

console.log('\nthe server\'s door, and first-run');
{
  for (const f of ['portal_invite_target(uuid)', 'portal_link_client(uuid, text, text, uuid)', 'portal_login_target(text)'])
    ok(`${f}: revoked from the browser, granted to service_role`, code.includes(`revoke all on function ${f} from public, anon, authenticated`) && code.includes(`grant execute on function ${f} to service_role`));
  ok('portal_link_client refuses a CRM user and refuses to move a login between clients', /return 'crm_user'/.test(fn('portal_link_client')) && /return 'other_client'/.test(fn('portal_link_client')));
  ok('no_users() is false once a client login exists', /not exists \(select 1 from crm_users\) and not exists \(select 1 from client_users\)/.test(fn('no_users')));
  ok('crm_whoami() is "owner" only on a truly empty install', /when exists \(select 1 from crm_users\) or exists \(select 1 from client_users\) then 'none' else 'owner'/.test(fn('crm_whoami')));
  ok('client_users: RLS on, one owner-only policy', /alter table client_users enable row level security/.test(code) && /create policy client_users_owner on client_users for all\s+using \(no_users\(\) or \(crm_listed\(\) and is_owner\(\)\)\)/.test(code));
}

console.log('\nRLS-AUDIT.sql 2e: every definer function a browser can call is gated');
{
  const a = fs.readFileSync('RLS-AUDIT.sql', 'utf8');
  ok('it sweeps definer functions anon or authenticated can execute', /p\.prosecdef/.test(a) && /has_function_privilege\('anon', p\.oid, 'execute'\) or has_function_privilege\('authenticated', p\.oid, 'execute'\)/.test(a));
  ok('  passing only crm_listed() / is_owner() / portal_lead() or the named identity helpers', /position\('crm_listed\(\)' in p\.prosrc\) = 0/.test(a) && /position\('is_owner\(\)' in p\.prosrc\) = 0/.test(a) && /position\('portal_lead\(\)' in p\.prosrc\) = 0/.test(a)
    && /p\.proname not in \('crm_whoami', 'is_owner', 'crm_listed', 'crm_active', 'no_users', 'my_pools', 'portal_lead'\)/.test(a));
  ok('  and RAISES naming them', /RLS-AUDIT FAILED: security definer functions a browser can call/.test(a));
}

console.log('\nthe CRM side');
{
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  ok('the Portal tab is rendered for an owner only', /renderPortal=\{isOwner\?\(c=><PortalAccess lead=\{c\} apiPost=\{apiPost\}\/>\):null\}/.test(app));
  const pa = fs.readFileSync('src/PortalAccess.jsx', 'utf8');
  ok('  and every action goes through the owner-only route', (pa.match(/apiPost\('\/api\/portal-admin'/g) || []).length === 1 && !/supabase|from\('client_users'\)/.test(pa));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
