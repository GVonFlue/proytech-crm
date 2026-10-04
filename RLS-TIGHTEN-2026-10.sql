-- ============================================================================
-- RLS-TIGHTEN-2026-10.sql
--
-- WHAT THIS DOES
--   Closes the four policies RLS-AUDIT.sql failed on in production
--   (4 Oct 2026), and sets each table to the narrowest access the app uses:
--
--   app_settings   read: listed CRM users (the app loads settings for everyone)
--                  write: OWNERS ONLY — it holds the offer and its prices,
--                         invoices, the books and the Build Console —
--                         EXCEPT the one `tasks` row, which listed users may
--                         insert and update, because Tasks is a rep tab.
--   events         OWNERS ONLY, read and write. Events carry sponsor amounts:
--                  company money, which ROLES.md keeps off a rep's screen.
--   site_events    OWNERS ONLY, and no access at all for anon. Nothing reads
--   site_settings  these (checked: this repo, the getproytech.com repo and
--                  live site, and the Supabase API logs), so the public read
--                  they carried was an open door with nothing behind it.
--
--   The owner expression is the reference one (VERIFY-RLS.md §9,
--   pocket_recordings_owner):  no_users() OR (crm_active() AND is_owner())
--
-- WHY IT DROPS *EVERY* POLICY ON THESE FOUR TABLES, NOT JUST THE FOUR NAMED
--   ENGINEERING.md §4c: permissive policies are grants and Postgres ORs them,
--   so the weakest policy on a table decides what it allows. Three of these
--   four were never in any migration in this repo — they were added by hand —
--   so there may be others nobody has listed. Dropping only the known names
--   would leave any unknown leftover in place, ORed beside the new policies.
--   Section 0 prints what is there BEFORE, so nothing is lost without a record.
--
-- SAFE TO RE-RUN. One transaction: if anything fails, nothing changes.
--
-- WHEN TO RUN
--   AFTER the matching code is deployed (PR "RLS: tighten app_settings,
--   events, site_*"). That build stops reps' screens writing app_settings
--   outside Tasks; running this first would make those screens fail silently
--   for reps until the deploy lands. Then run RLS-AUDIT.sql, then
--   VERIFY-RLS.md §13.
--
-- TO UNDO: RLS-TIGHTEN-2026-10-ROLLBACK.sql (it re-opens the holes — read it).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. BEFORE: every policy on the four tables, as it stands. Copy this grid
--    somewhere before running the rest if you want a record.
-- ---------------------------------------------------------------------------
select c.relname as tbl, p.polname as policy, p.polpermissive as permissive,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                     when 'd' then 'DELETE' else 'ALL' end as cmd,
       case when p.polroles = '{0}'::oid[] then 'PUBLIC'
            else array_to_string(array(select r.rolname from pg_roles r where r.oid = any (p.polroles)), ', ') end as roles,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
 order by 1, 2;


begin;

-- ---------------------------------------------------------------------------
-- 1. Remove every policy on the four tables (see the header for why ALL)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, p.polname as policy
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
  loop
    execute format('drop policy if exists %I on public.%I', r.policy, r.tbl);
  end loop;
end $$;

alter table app_settings  enable row level security;
alter table events        enable row level security;

-- ---------------------------------------------------------------------------
-- 2. app_settings: listed users read; owners write; the tasks row is shared
-- ---------------------------------------------------------------------------
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select
  using (no_users() or crm_listed());

drop policy if exists settings_owner_insert on app_settings;
create policy settings_owner_insert on app_settings for insert
  with check (no_users() or (crm_active() and is_owner()));

drop policy if exists settings_owner_update on app_settings;
create policy settings_owner_update on app_settings for update
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

drop policy if exists settings_owner_delete on app_settings;
create policy settings_owner_delete on app_settings for delete
  using (no_users() or (crm_active() and is_owner()));

-- Tasks: one shared row, written by whoever saves a task. The app saves it as
-- an upsert, which needs BOTH an insert and an update policy. Scoped to the
-- row id, so a rep can never write 'main' (prices), 'invoices', 'txns' or
-- 'installs' through these. No delete: the app never deletes the row.
drop policy if exists settings_tasks_insert on app_settings;
create policy settings_tasks_insert on app_settings for insert
  with check (crm_listed() and id = 'tasks');

drop policy if exists settings_tasks_update on app_settings;
create policy settings_tasks_update on app_settings for update
  using      (crm_listed() and id = 'tasks')
  with check (crm_listed() and id = 'tasks');

-- ---------------------------------------------------------------------------
-- 3. events: owners only, read and write
-- ---------------------------------------------------------------------------
drop policy if exists events_owner on events;
create policy events_owner on events for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

-- ---------------------------------------------------------------------------
-- 4. site_events, site_settings: owners only; anon gets nothing at all
--    These two exist on the ProyTech install only (created by hand, in no
--    migration), so each step runs only where the table exists. On any other
--    install this section does nothing and the file still runs clean.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['site_events','site_settings'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'RLS-TIGHTEN: % does not exist on this install; skipped.', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all '
                || 'using (no_users() or (crm_active() and is_owner())) '
                || 'with check (no_users() or (crm_active() and is_owner()))', t || '_owner', t);
    -- A signed-out visitor has no business with either table. Revoked at the
    -- privilege level, so even a policy added by hand later cannot reopen
    -- them to anon without someone also re-granting.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Verify, and refuse to commit if the end state is not exactly this
-- ---------------------------------------------------------------------------
do $$
declare
  got text; want text; bad text; t text;
  owner_expr text := '(no_users() OR (crm_active() AND is_owner()))';
begin
  -- exactly the intended policies, by name, on the four tables
  select string_agg(c.relname || '.' || p.polname, ', ' order by c.relname, p.polname) into got
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings');
  want := 'app_settings.settings_owner_delete, app_settings.settings_owner_insert, app_settings.settings_owner_update, '
       || 'app_settings.settings_read, app_settings.settings_tasks_insert, app_settings.settings_tasks_update, '
       || 'events.events_owner'
       || case when to_regclass('public.site_events')   is not null then ', site_events.site_events_owner'     else '' end
       || case when to_regclass('public.site_settings') is not null then ', site_settings.site_settings_owner' else '' end;
  if got is distinct from want then
    raise exception E'RLS-TIGHTEN: unexpected policy set.\n  got:  %\n  want: %', got, want;
  end if;

  -- no permissive `true` anywhere on them (ENGINEERING §4c)
  select string_agg(c.relname || '.' || p.polname, ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
     and p.polpermissive
     and ((p.polcmd <> 'a' and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true')
       or  pg_get_expr(p.polwithcheck, p.polrelid) = 'true');
  if bad is not null then raise exception 'RLS-TIGHTEN: permissive true survived on: %', bad; end if;

  -- every owner policy carries the reference expression, both ways
  select string_agg(c.relname || '.' || p.polname, ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and p.polname in ('settings_owner_update','events_owner','site_events_owner','site_settings_owner')
     and (pg_get_expr(p.polqual, p.polrelid) is distinct from owner_expr
       or pg_get_expr(p.polwithcheck, p.polrelid) is distinct from owner_expr);
  if bad is not null then raise exception 'RLS-TIGHTEN: owner policies do not use the reference expression: %', bad; end if;

  -- the tasks policies can only ever reach the tasks row
  select string_agg(p.polname, ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'app_settings' and p.polname like 'settings_tasks_%'
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') not like '%id = ''tasks''%';
  if bad is not null then raise exception 'RLS-TIGHTEN: a tasks policy is not scoped to the tasks row: %', bad; end if;

  -- RLS on, and anon has no privilege on the two site tables
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
                and not c.relrowsecurity) then
    raise exception 'RLS-TIGHTEN: row level security is off on one of the four tables';
  end if;
  for t in select unnest(array['site_events','site_settings']) loop
    if to_regclass('public.' || t) is not null
       and (has_table_privilege('anon', 'public.' || t, 'select') or has_table_privilege('anon', 'public.' || t, 'insert')
         or has_table_privilege('anon', 'public.' || t, 'update') or has_table_privilege('anon', 'public.' || t, 'delete')) then
      raise exception 'RLS-TIGHTEN: anon still holds a privilege on %', t;
    end if;
  end loop;

  raise notice 'RLS-TIGHTEN OK: % policies, none permissive-true, owners write, tasks row shared, site_* closed to anon.', array_length(string_to_array(got, ', '), 1);
end $$;

commit;


-- ---------------------------------------------------------------------------
-- 6. AFTER: read every expression (CLAUDE.md — never count them)
-- ---------------------------------------------------------------------------
select c.relname as tbl, p.polname as policy, p.polpermissive as permissive,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                     when 'd' then 'DELETE' else 'ALL' end as cmd,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
 order by 1, 2;
-- Expect 9 rows:
--   app_settings  settings_owner_delete  DELETE  owner expr / (none)
--   app_settings  settings_owner_insert  INSERT  (none) / owner expr
--   app_settings  settings_owner_update  UPDATE  owner expr / owner expr
--   app_settings  settings_read          SELECT  (no_users() OR crm_listed())
--   app_settings  settings_tasks_insert  INSERT  (none) / (crm_listed() AND (id = 'tasks'::text))
--   app_settings  settings_tasks_update  UPDATE  same both ways
--   events        events_owner           ALL     owner expr both ways
--   site_events   site_events_owner      ALL     owner expr both ways
--   site_settings site_settings_owner    ALL     owner expr both ways
