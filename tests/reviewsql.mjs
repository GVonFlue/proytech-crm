/* REVIEW-MIGRATION.sql: the shape, in CI.
   ============================================================================
   tests/reviewdb.mjs runs it against a real Postgres (PGlite, a local tool);
   this is the half that runs on every push, so a change that loosens the
   wall fails the build even when nobody runs the tool.

     - four tables, RLS on, ONE select policy each, owner-only; no write
       policy; anon and authenticated lose every write grant
     - the client's two functions start from portal_lead(); portal_review()
       takes no argument; neither returns a storage path, an author or an IP
     - every server function is revoked from the browser and granted to
       service_role, and finds the lead from a login id (review_client)
     - the locks: approvals permanent, submitted notes frozen, one open round
     - the bucket is private, images only
     - RLS-AUDIT.sql lists the review tables as server-write-only
     - the rollback drops what the migration made                           */
import fs from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const sql = fs.readFileSync('REVIEW-MIGRATION.sql', 'utf8');
const code = sql.replace(/--[^\n]*/g, '');
const fn = name => { const i = code.indexOf(`create or replace function ${name}(`); return i < 0 ? '' : code.slice(i, code.indexOf('$$;', i) + 3); };
const TABLES = ['review_sites', 'review_rounds', 'review_notes', 'site_approvals'];

console.log('\nthe tables: owner read, server write');
{
  for (const t of TABLES) ok(`${t} is created`, new RegExp(`create table if not exists ${t} \\(`).test(code));
  ok('one loop sets RLS, drops EVERY existing policy, and creates one SELECT policy, owner-only', /foreach t in array array\['review_sites', 'review_rounds', 'review_notes', 'site_approvals'\]/.test(code)
    && /enable row level security/.test(code) && /for p in select polname from pg_policy where polrelid/.test(code)
    && /create policy %I on %I for select using \(crm_listed\(\) and is_owner\(\)\)/.test(code));
  ok('no insert / update / delete / all policy anywhere', !/create policy[^;]+for (insert|update|delete|all)/i.test(code));
  ok('anon loses everything, authenticated loses every write', /revoke all on %I from anon/.test(code) && /revoke insert, update, delete, truncate on %I from authenticated/.test(code));
  ok('the migration refuses to commit with a write policy or a non-owner read', /has a write policy or a read not limited to owners/.test(code));
  ok('one open round per client (a partial unique index)', /create unique index if not exists review_rounds_one_open on review_rounds \(lead_id\) where submitted_at is null/.test(code));
  ok('rounds are unique per client and number', /unique \(lead_id, number\)/.test(code));
  ok('won\'t do needs a reason, in the table itself', /check \(status <> 'wont_do' or length\(btrim\(reason\)\) > 0\)/.test(code));
  ok('the preview URL is https, in the table itself', /preview_url ~ '\^https:\/\//.test(code));
}

console.log('\nthe client\'s door');
{
  const pr = fn('portal_review');
  ok('portal_review() takes no arguments and starts from portal_lead()', /create or replace function portal_review\(\) returns jsonb/.test(pr) && /review_state\(portal_lead\(\)\)/.test(pr));
  const ns = fn('portal_note_save');
  ok('portal_note_save starts from portal_lead() and refuses a non-client', /lid text := portal_lead\(\)/.test(ns) && /if lid is null then raise exception 'not_a_client'/.test(ns));
  ok('  writes only into the caller\'s OPEN round', /select id into rid from review_rounds where lead_id = lid and submitted_at is null/.test(ns) && /'no_open_round'/.test(ns));
  ok('  an edit changes the comment only, on the caller\'s own draft', /update review_notes set comment = c, updated_at = now\(\)\s+where id = \(p_note->>'id'\)::uuid and lead_id = lid and round_id = rid/.test(ns));
  ok('  refused once approved', /if exists \(select 1 from site_approvals where lead_id = lid\) then raise exception 'approved'/.test(ns));
  ok('  the author is auth.uid(), never the request', /values \(lid, rid, k, auth\.uid\(\),/.test(ns));
  const st = fn('review_state');
  ok('review_state returns no storage path, author or IP', !/'shot_path'|'attach_path'|'author'|'ip'|user_agent/.test(st) && /'has_shot', n\.shot_path is not null/.test(st));
  ok('the browser may call exactly portal_review, portal_note_save and review_summary', /grant execute on function portal_review\(\) to authenticated/.test(code) && /grant execute on function portal_note_save\(jsonb\) to authenticated/.test(code)
    && /grant execute on function review_summary\(\) to authenticated/.test(code) && (code.match(/to authenticated;/g) || []).length === 3);
  ok('review_summary() answers an owner only', /where crm_listed\(\) and is_owner\(\);/.test(fn('review_summary')));
}

console.log('\nthe server\'s door');
{
  const SERVER = ['review_client(uuid)', 'review_included(text)', 'review_dates(text)', 'review_state(text)', 'review_submit(uuid)', 'review_request_extra(uuid)',
    'review_open_round(text)', 'review_approve(uuid, text, text, text)', 'review_note_delete(uuid, uuid)', 'review_upload_target(uuid, uuid)', 'review_set_file(uuid, uuid, text, text)'];
  for (const f of SERVER) ok(`${f}: revoked from the browser, granted to service_role`, code.includes(`revoke all on function ${f} from public, anon, authenticated`) && code.includes(`grant execute on function ${f} to service_role`));
  ok('review_client is portal_lead()\'s rule for a login id: active, never a CRM user', /where c\.id = p_uid and c\.active\s+and not exists \(select 1 from crm_users u where u\.id = p_uid\)/.test(fn('review_client')));
  for (const f of ['review_submit', 'review_request_extra', 'review_approve', 'review_note_delete'])
    ok(`${f} finds the lead from the login id`, /lid text := review_client\(p_uid\)/.test(fn(f)));
  ok('review_approve: permanent once, refused with unsubmitted notes, IP from the server', /'already'/.test(fn('review_approve')) && /'unsubmitted'/.test(fn('review_approve')) && /left\(coalesce\(p_ip, ''\), 64\)/.test(fn('review_approve')));
  ok('review_submit refuses an empty round', /if n = 0 then return jsonb_build_object\('error', 'empty'\)/.test(fn('review_submit')));
  ok('review_request_extra only after the included rounds', /if n < inc then return jsonb_build_object\('error', 'not_yet'\)/.test(fn('review_request_extra')));
  ok('review_set_file accepts only the path the server names for that note', /position\(lid \|\| '\/' \|\| p_note::text \|\| '-' \|\| p_kind \|\| '-' in p_path\) <> 1/.test(fn('review_set_file')) && /p_path ~ '\\\.\\\.'/.test(fn('review_set_file')));
  ok('Terms 3.4: the proposal\'s revisionRounds 0..10, else 2', /p\.body->'quote'->'revisionRounds'/.test(fn('review_included')) && /between 0 and 10/.test(fn('review_included')) && /, 2\);/.test(fn('review_included')));
}

console.log('\nthe locks, and the bucket');
{
  ok('site_approvals: no update, no delete, for anyone', /create trigger site_approvals_lock before update or delete on site_approvals/.test(code) && /A site approval is permanent/.test(fn('site_approvals_lock')));
  ok('review_notes: what the client wrote freezes when the round is submitted', /create trigger review_notes_lock before update or delete on review_notes/.test(code)
    && /new\.comment, new\.shot_path, new\.attach_path/.test(fn('review_notes_lock')) && /A submitted note cannot be deleted/.test(fn('review_notes_lock')));
  ok('  status, reason and done date are NOT in the frozen list', !/new\.status|new\.reason|new\.done_at/.test(fn('review_notes_lock')));
  ok('the review bucket: private, 10 MB, images only, and verified private', /values \('review', 'review', false, 10485760, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/.test(code) && /the review bucket is public/.test(code));
  ok('no policy on storage.objects is created', !/on storage\.objects/i.test(code));
}

console.log('\nRLS-AUDIT and the rollback');
{
  const a = fs.readFileSync('RLS-AUDIT.sql', 'utf8');
  ok('RLS-AUDIT 2f lists every review table as server-write-only', /c\.relname in \('client_emails', 'review_sites', 'review_rounds', 'review_notes', 'site_approvals'\)/.test(a));
  const rb = fs.readFileSync('REVIEW-MIGRATION-ROLLBACK.sql', 'utf8');
  for (const t of TABLES) ok(`the rollback drops ${t}`, rb.includes(`drop table if exists ${t};`));
  const made = [...code.matchAll(/create or replace function (\w+)\(/g)].map(m => m[1]);
  ok('the rollback drops every function the migration makes', made.every(f => new RegExp(`drop function if exists ${f}\\(`).test(rb)), made.filter(f => !new RegExp(`drop function if exists ${f}\\(`).test(rb)).join());
  ok('and warns that it drops the approvals', /SITE APPROVAL/.test(rb));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
