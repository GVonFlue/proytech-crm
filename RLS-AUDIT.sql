-- ============================================================================
-- ProyTech CRM — whole-database RLS audit
--
-- Paste this into the Supabase SQL Editor and run it. It changes NOTHING. It
-- reads every policy on every table in `public` and tells you which tables are
-- open, by name.
--
-- Run it after any migration, before any release, and on every customer install
-- before handing it over.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
--
-- Twice in one day this database was found wide open by a check that had
-- always passed.
--
--   23 Aug 2026, eight content tables: RLS on, one policy each, expression
--   `true`. Every authenticated session had full read/write/delete on pricing,
--   unpublished marketing and the AI spend ledger.
--
--   23 Aug 2026, `leads`: FIVE CORRECT POLICIES plus one leftover called
--   `leads_all_authenticated` with `using = true` and `with check = true`.
--   Permissive policies are OR'd, so the leftover won and every authenticated
--   session could read and write every lead in the business.
--
-- The second one is the important one, and it is why "read the expression" is
-- not a strong enough rule on its own.
--
--   Counting policies on `leads` returned SIX. Reading the five correct ones —
--   which is what a careful person does, because they are the ones with
--   sensible names — returned five correct answers. The table was still open.
--
--   PERMISSIVE POLICIES ARE GRANTS, AND THEY OR TOGETHER. The WEAKEST policy
--   on a table decides what that table allows. Nothing else about the table
--   matters. Five perfect policies plus one `true` is a table with no security
--   at all, and it looks healthier than a table with one policy.
--
-- So the rule is: read EVERY policy on the table, and confirm that NONE of them
-- is permissive-and-true. That is what this file does, for every table, without
-- anyone having to remember which tables matter.
-- ============================================================================


-- ============================================================================
-- 1. THE REPORT — every table, every policy, worst case first
--
-- `verdict` is what to read. Anything that is not OK needs an answer.
-- ============================================================================

with pol as (
  select
    c.oid                                        as reloid,
    c.relname                                    as tbl,
    c.relrowsecurity                             as rls_on,
    p.polname                                    as policy,
    p.polpermissive                              as permissive,
    case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                  when 'w' then 'UPDATE' when 'd' then 'DELETE'
                  else 'ALL' end                 as cmd,
    case when p.polroles = '{0}'::oid[] then 'PUBLIC'
         else array_to_string(array(
                select r.rolname from pg_roles r where r.oid = any (p.polroles)), ', ')
    end                                          as roles,
    pg_get_expr(p.polqual,      p.polrelid)      as using_expr,
    pg_get_expr(p.polwithcheck, p.polrelid)      as with_check_expr
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
),
judged as (
  select pol.*,
    -- A permissive policy whose USING is literally `true` grants unrestricted
    -- read (and, on ALL/UPDATE/DELETE, unrestricted write) to whoever it names.
    --
    -- NULL is handled by command, and this distinction matters: an INSERT
    -- policy has no USING clause at all, so NULL there is NORMAL and must not
    -- be reported. A NULL USING on SELECT/UPDATE/DELETE/ALL is not normal.
    (
      permissive
      and cmd <> 'INSERT'
      and coalesce(using_expr, 'true') = 'true'
    ) as open_read,
    (
      permissive
      and cmd in ('ALL','INSERT','UPDATE')
      and coalesce(with_check_expr, 'true') = 'true'
      and with_check_expr is not null          -- absent is not the same as `true`
    ) as open_write
  from pol
)
select
  tbl                       as table_name,
  rls_on,
  coalesce(policy, '(none)') as policy,
  cmd,
  roles,
  case when permissive then 'permissive' else 'restrictive' end as kind,
  coalesce(using_expr,      '(none)')  as using_expr,
  coalesce(with_check_expr, '(none)')  as with_check_expr,
  case
    when policy is null and rls_on
      then 'RLS ON, NO POLICY — denies everything. Safe, but probably a mistake.'
    when policy is null and not rls_on
      then '>>> WIDE OPEN — RLS is OFF and there is no policy at all.'
    when not rls_on
      then '>>> WIDE OPEN — RLS is OFF, so this policy enforces nothing.'
    when open_read and open_write
      then '>>> WIDE OPEN — permissive, using=true AND with check=true.'
    when open_read
      then '>>> OPEN TO READ — permissive policy with using=true.'
    when open_write
      then '>>> OPEN TO WRITE — permissive policy with with check=true.'
    else 'OK'
  end as verdict
from judged
order by
  (case
     when not rls_on then 0
     when open_read or open_write then 0
     when policy is null then 1
     else 2
   end),
  tbl, policy;


-- ============================================================================
-- 2. THE VERDICT — raises if anything in `public` is open
--
-- Section 1 is for reading. This is for deciding. It never counts a policy.
-- ============================================================================

do $$
declare
  open_tables text;
  rls_off     text;
  no_policy   text;
  open_storage text;
  public_buckets text;
  open_functions text;
begin
  ------------------------------------------------- 2a. permissive `true` anywhere
  -- The shape found twice on 23 Aug 2026. ONE of these on a table overrides
  -- every correct policy beside it, because permissive policies OR.
  select string_agg(format('%s.%s (%s, to %s)', tbl, policy, cmd, roles), E'\n  '
                    order by tbl, policy)
    into open_tables
  from (
    select c.relname as tbl, p.polname as policy,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                         when 'w' then 'UPDATE' when 'd' then 'DELETE'
                         else 'ALL' end as cmd,
           case when p.polroles = '{0}'::oid[] then 'PUBLIC'
                else array_to_string(array(
                       select r.rolname from pg_roles r where r.oid = any (p.polroles)), ', ')
           end as roles
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and p.polpermissive
       and (
            (p.polcmd <> 'a' and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true')
         or (pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
       )
  ) x;

  ------------------------------------------------------- 2b. RLS switched off
  -- A table with RLS off is governed only by GRANTs, and Supabase grants the
  -- anon and authenticated roles by default. Off means open.
  select string_agg(c.relname, ', ' order by c.relname) into rls_off
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  --------------------------------------------- 2c. RLS on but no policy at all
  -- Denies everything, so it is SAFE — but it is usually a table someone meant
  -- to write a policy for. Reported, never raised.
  select string_agg(c.relname, ', ' order by c.relname) into no_policy
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if no_policy is not null then
    raise notice 'RLS-AUDIT note: RLS on with no policy (denies all, probably unfinished): %', no_policy;
  end if;

  ---------------------------------------------------- 2d. STORAGE (Oct 2026)
  -- Files are rows too. storage.objects holds EVERY bucket's files and its
  -- policies are ORed across buckets exactly like a table's, so one policy
  -- that does not name a bucket (or is `true`) opens every bucket at once,
  -- the private onboarding bucket included. This file used to sweep `public`
  -- only, which is how two buckets stayed open while it passed.
  --   RAISES on: a permissive storage policy that is `true`, or that does not
  --              mention bucket_id at all (so it is not scoped to a bucket).
  --   NOTES:     every public bucket (served by URL with no policy checked).
  -- An install with no storage schema (a plain Postgres) is skipped, said so.
  if to_regclass('storage.objects') is null then
    raise notice 'RLS-AUDIT note: no storage.objects here, so the storage sweep was skipped.';
  else
    select string_agg(format('storage.objects.%s (%s): using=%s check=%s', polname,
                             case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                                         when 'd' then 'DELETE' else 'ALL' end,
                             coalesce(pg_get_expr(polqual, polrelid), '(none)'),
                             coalesce(pg_get_expr(polwithcheck, polrelid), '(none)')), E'\n  ' order by polname)
      into open_storage
      from pg_policy
     where polrelid = to_regclass('storage.objects')
       and polpermissive
       and (
            (polcmd <> 'a' and coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true')
         or (pg_get_expr(polwithcheck, polrelid) = 'true')
         or coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') !~ 'bucket_id'
       );
    if to_regclass('storage.buckets') is not null then
      execute 'select string_agg(id, '', '' order by id) from storage.buckets where public' into public_buckets;
      if public_buckets is not null then
        raise notice 'RLS-AUDIT note: PUBLIC storage buckets (anyone with a file URL reads it, no policy checked): %', public_buckets;
      end if;
    end if;
    if open_storage is not null then
      raise exception E'RLS-AUDIT FAILED: storage policies that are `true` or not scoped to a bucket:\n  %\nstorage.objects holds every bucket''s files, so each of these opens EVERY bucket.', open_storage;
    end if;
  end if;

  ------------------------------------------------- 2e. FUNCTIONS (Oct 2026)
  -- A `security definer` function runs as its owner and bypasses RLS, so the
  -- GRANT and the function's own check ARE the access control. Supabase
  -- grants EXECUTE on new functions to anon and authenticated by default, and
  -- "authenticated" is not "on the team": a stray login, and every client of
  -- the portal, is authenticated (AUTH-LISTED-2026-10, PORTAL-MIGRATION).
  --   RAISES on: a definer function in `public` that anon or authenticated
  --              can execute, unless its body checks one of the gates
  --                crm_listed()  is_owner()   (a team member / an owner)
  --                portal_lead()               (a client, own lead only)
  --              or it is one of the identity helpers below, each of which
  --              answers only "who is the caller" about the caller.
  --   Server-only functions (granted to service_role, revoked from anon and
  --   authenticated) are not listed: a browser cannot call them.
  select string_agg(format('%s(%s)  anon=%s authenticated=%s', p.proname, pg_get_function_identity_arguments(p.oid),
                           has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute')),
                    E'\n  ' order by p.proname)
    into open_functions
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.proname not in ('crm_whoami', 'is_owner', 'crm_listed', 'crm_active', 'no_users', 'my_pools', 'portal_lead')
     and position('crm_listed()' in p.prosrc) = 0
     and position('is_owner()' in p.prosrc) = 0
     and position('portal_lead()' in p.prosrc) = 0;
  if open_functions is not null then
    raise exception E'RLS-AUDIT FAILED: security definer functions a browser can call with no team or portal check:\n  %\nEach bypasses RLS. Gate it on crm_listed()/is_owner() (team) or portal_lead() (client), or revoke it from anon and authenticated.', open_functions;
  end if;

  ------------------------------------------ 2f. SERVER-WRITE-ONLY tables (Oct 2026)
  -- Some tables are written only by the server (service role, which bypasses
  -- RLS) and READ by owners. For those, ANY insert/update/delete/all policy is
  -- a hole even if its expression looks right, and the read policy must
  -- require an owner. client_emails is the record that makes each client
  -- email send once: a write path from a browser could delete a claim and
  -- re-send, or claim one so it never sends.
  --   RAISES on: a non-SELECT policy, or a SELECT policy not naming is_owner().
  declare
    srv text;
  begin
    select string_agg(format('%s.%s (%s): using=%s', c.relname, p.polname,
             case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                           when 'd' then 'DELETE' else 'ALL' end,
             coalesce(pg_get_expr(p.polqual, p.polrelid), '(none)')), E'\n  ' order by c.relname, p.polname)
      into srv
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('client_emails')
       and (p.polcmd <> 'r' or coalesce(pg_get_expr(p.polqual, p.polrelid), '') !~ 'is_owner\(\)');
    if srv is not null then
      raise exception E'RLS-AUDIT FAILED: a server-write-only table has a write policy, or a read not limited to owners:\n  %', srv;
    end if;
  end;

  if rls_off is not null then
    raise exception E'RLS-AUDIT FAILED: row level security is OFF on:\n  %\nThese are governed only by GRANTs, and Supabase grants anon and authenticated by default.', rls_off;
  end if;

  if open_tables is not null then
    raise exception E'RLS-AUDIT FAILED: permissive policies with a `true` expression:\n  %\nPermissive policies OR together, so each of these overrides every correct policy on its table.', open_tables;
  end if;

  raise notice '----------------------------------------------------------------';
  raise notice 'RLS-AUDIT OK: every table in public has RLS on, no permissive policy';
  raise notice 'anywhere evaluates to true, every storage policy names a bucket, and';
  raise notice 'every security definer function a browser can call checks the team or the portal, and';
  raise notice 'server-write-only tables (client_emails) have no write policy.';
  raise notice 'Read section 1 anyway — this';
  raise notice 'proves nothing is WIDE open, not that every expression is RIGHT.';
  raise notice '----------------------------------------------------------------';
end $$;


-- ============================================================================
-- 3. WHAT THIS FILE DOES NOT PROVE
--
-- It proves no table is trivially open. It does NOT prove any policy is
-- CORRECT — an expression can be non-`true` and still wrong, e.g. one that
-- checks the wrong column or the wrong role. That is what VERIFY-RLS.md is
-- for: real logins, real sentinel rows, and a measured before/after.
--
-- Nor does it say anything about the api/ routes, which use
-- SUPABASE_SERVICE_KEY and bypass RLS by design. Those are guarded by
-- guard({requireOwner}) and audited in API-AUDIT.md. RLS governs the browser,
-- which is the only thing it can govern.
-- ============================================================================
