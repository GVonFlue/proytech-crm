-- ============================================================================
-- RLS-TIGHTEN-2026-10-ROLLBACK.sql
--
-- !!! THIS RE-OPENS THE HOLES RLS-TIGHTEN-2026-10.sql CLOSED. !!!
--
-- It puts back the policies production had on 4 Oct 2026, including the
-- three that RLS-AUDIT.sql fails on:
--   app_settings.settings_all_authenticated  ALL, to authenticated, true/true
--   events.events_all                        ALL, to authenticated, true/true
--   site_events.site_events_read             SELECT, to PUBLIC, true
--   site_settings.site_settings_read         SELECT, to PUBLIC, true
-- plus the two app_settings policies MIGRATION.sql used to create
-- (settings_read and settings_write, both "any listed user").
--
-- Use it ONLY if the tightened policies break something you cannot fix
-- forward, and only for as long as it takes to fix it. While it is in place,
-- any signed-in account — a rep, or a stray sign-up with no crm_users row —
-- can rewrite the offer and its prices, the invoices and the books, and
-- anyone on the internet can read site_events and site_settings.
--
-- If section 0 of RLS-TIGHTEN-2026-10.sql printed a policy that is NOT in the
-- list above, that policy was removed by the tighten and is not restored here:
-- recreate it from the grid you saved.
--
-- Safe to re-run. One transaction. RLS-AUDIT.sql WILL FAIL after this runs —
-- that is correct, and is the reason not to leave it in place.
-- ============================================================================

begin;

-- the tightened policies out
drop policy if exists settings_owner_insert on app_settings;
drop policy if exists settings_owner_update on app_settings;
drop policy if exists settings_owner_delete on app_settings;
drop policy if exists settings_tasks_insert on app_settings;
drop policy if exists settings_tasks_update on app_settings;
drop policy if exists events_owner          on events;

-- app_settings, as before
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select using (no_users() or crm_listed());
drop policy if exists settings_write on app_settings;
create policy settings_write on app_settings for all
  using (no_users() or crm_listed()) with check (no_users() or crm_listed());
drop policy if exists settings_all_authenticated on app_settings;
create policy settings_all_authenticated on app_settings for all to authenticated using (true) with check (true);

-- events, as before (the shape MIGRATION.sql used to create)
drop policy if exists events_all on events;
create policy events_all on events for all to authenticated using (true) with check (true);

-- site_events, site_settings, as before, where they exist
do $$
declare t text;
begin
  foreach t in array array['site_events','site_settings'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;

commit;

select c.relname as tbl, p.polname as policy,
       case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                     when 'd' then 'DELETE' else 'ALL' end as cmd,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('app_settings','events','site_events','site_settings')
 order by 1, 2;
