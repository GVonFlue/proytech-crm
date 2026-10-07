-- ============================================================================
-- AUTH-LISTED-2026-10.sql
--
-- WHAT THIS DOES
--   "Signed in" is not "on the team". A Supabase login with NO crm_users row
--   (a stray account today; a client of the portal tomorrow) must get nothing
--   from the CRM. Three places still treated any login as enough:
--
--   1. leads. Its policies used crm_active(), which is TRUE for a login with
--      no crm_users row (coalesce(..., true)), and `owner_id = auth.uid()`
--      then let such a login INSERT leads it owned and read, edit and delete
--      them. It could not see anyone else's lead, but it could write into
--      the table. Now: one set of four policies on crm_listed() (a row, and
--      active), delete owner-only. See section 1 for what production had.
--   2. crm_team() and crm_leaderboard() returned every active team member's
--      name and role, and each rep's conversion counts, to any login.
--      Now: nothing unless the caller is listed.
--   3. kb_mark_read() wrote a read receipt for any login. Now: refused.
--
--   Nothing changes for anyone on the team: crm_listed() is true for every
--   active owner and rep, and is_owner() already required a listed row.
--   First-run mode (no_users(): nobody set up yet) is untouched.
--
--   The 15 API routes that only checked "has a session" are closed in code,
--   by the same PR (api/_guard.js: requireAuth now means an active CRM user,
--   asked of Postgres through crm_whoami()).
--
-- WHEN TO RUN
--   Any time; before or after the code deploys (the code does not depend on
--   it, and nothing on the team notices). Re-running is safe. Then run
--   RLS-AUDIT.sql and VERIFY-RLS.md §16.
--
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

-- ---- 1. leads: ONE consistent set, whatever was there before ---------------
-- Production had FIVE policies on leads, not the one MIGRATION.sql creates:
-- leads_all (ALL), leads_select, leads_insert, leads_update (each the same
-- crm_active() expression) and leads_delete (owner-only). Permissive policies
-- are ORed, so every one of the four carried the hole, and leads_all (ALL)
-- also let a rep DELETE their own lead, which made leads_delete decoration.
-- Every policy on the table is dropped by name from the catalog (so a sixth
-- that nobody listed goes too), and four are created:
--   select / insert / update   a listed, active team member: an owner, or the
--                              lead's owner, or a rep in the lead's pool
--   delete                     an owner only (the app already says "Only an
--                              owner can delete a lead"; now Postgres does)
-- first-run mode (no_users(): nobody set up yet) keeps working as before.
do $$
declare p record;
begin
  for p in select polname from pg_policy where polrelid = 'public.leads'::regclass loop
    execute format('drop policy %I on leads', p.polname);
  end loop;
end $$;

create policy leads_select on leads for select using (
  no_users() or ( crm_listed() and (
    is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())) )));
create policy leads_insert on leads for insert with check (
  no_users() or ( crm_listed() and (
    is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())) )));
create policy leads_update on leads for update using (
  no_users() or ( crm_listed() and (
    is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())) ))
) with check (
  no_users() or ( crm_listed() and (
    is_owner() or owner_id = auth.uid() or (pool is not null and pool = any (my_pools())) )));
create policy leads_delete on leads for delete using (
  no_users() or ( crm_listed() and is_owner() ));

-- ---- 2. the team list and the leaderboard: team members only ---------------
create or replace function crm_team()
returns table (id uuid, name text, role text)
language sql security definer stable set search_path = public as $$
  select u.id, u.name, u.role
    from crm_users u
   where u.active and crm_listed()
   order by u.role, u.name;
$$;
revoke all on function crm_team() from public, anon;
grant execute on function crm_team() to authenticated;

create or replace function crm_leaderboard()
returns table (user_id uuid, name text, clients_month bigint, clients_all bigint)
language sql security definer stable set search_path = public as $$
  select u.id, u.name,
    count(l.id) filter (where substr(coalesce(l.data->>'convertedAt',''),1,7) = to_char(now(), 'YYYY-MM')),
    count(l.id)
  from crm_users u
  left join leads l
    on l.owner_id = u.id
   and coalesce(l.data->>'isClient','false') = 'true'
   and coalesce(l.data->>'convertedAt','') <> ''
  where u.role = 'rep' and u.active and crm_listed()
  group by u.id, u.name;
$$;
revoke all on function crm_leaderboard() from public, anon;
grant execute on function crm_leaderboard() to authenticated;

-- ---- 3. read receipts: team members only -----------------------------------
create or replace function kb_mark_read(p_note_id text, p_kind text default 'read')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not crm_listed() then
    raise exception 'kb_mark_read: not a team member';
  end if;
  if p_kind is null or p_kind not in ('read','ack') then
    raise exception 'kb_mark_read: kind must be read or ack, got %', p_kind;
  end if;
  if p_note_id is null or length(btrim(p_note_id)) = 0 then
    raise exception 'kb_mark_read: a note id is required';
  end if;
  if not exists (select 1 from kb_published p where p.id = p_note_id) then
    raise exception 'kb_mark_read: % is not a published note', p_note_id;
  end if;
  insert into kb_reads (rep_id, note_id, kind, by_id)
  values (auth.uid(), p_note_id, p_kind, auth.uid());
end $$;
revoke all on function kb_mark_read(text, text) from public, anon;
grant execute on function kb_mark_read(text, text) to authenticated;

-- ---- verify, and refuse to commit anything else ------------------------------
do $$
declare n int; bad text;
begin
  -- exactly the four, each for its own command
  select count(*) into n from pg_policy where polrelid = 'public.leads'::regclass;
  if n <> 4 then raise exception 'AUTH-LISTED: leads should have exactly 4 policies, has %', n; end if;
  select string_agg(polname || ':' || polcmd::text, ', ' order by polname) into bad from pg_policy
   where polrelid = 'public.leads'::regclass
     and (polname::text, polcmd::text) not in (('leads_select','r'), ('leads_insert','a'), ('leads_update','w'), ('leads_delete','d'));
  if bad is not null then raise exception 'AUTH-LISTED: unexpected policy on leads: %', bad; end if;
  -- NO policy on leads mentions crm_active(), and every expression requires
  -- crm_listed() or is_owner()
  select string_agg(polname, ', ') into bad from pg_policy
   where polrelid = 'public.leads'::regclass
     and (position('crm_active()' in coalesce(pg_get_expr(polqual, polrelid), '')) > 0
       or position('crm_active()' in coalesce(pg_get_expr(polwithcheck, polrelid), '')) > 0);
  if bad is not null then raise exception 'AUTH-LISTED: crm_active() still on leads: %', bad; end if;
  select string_agg(polname, ', ') into bad from pg_policy
   where polrelid = 'public.leads'::regclass
     and ((polqual is not null and position('crm_listed()' in pg_get_expr(polqual, polrelid)) = 0 and position('is_owner()' in pg_get_expr(polqual, polrelid)) = 0)
       or (polwithcheck is not null and position('crm_listed()' in pg_get_expr(polwithcheck, polrelid)) = 0 and position('is_owner()' in pg_get_expr(polwithcheck, polrelid)) = 0));
  if bad is not null then raise exception 'AUTH-LISTED: a leads policy requires neither crm_listed() nor is_owner(): %', bad; end if;
  -- the delete policy is owner-only: is_owner() and no owner_id/pool branch
  if exists (select 1 from pg_policy where polrelid = 'public.leads'::regclass and polname = 'leads_delete'
             and (position('owner_id' in pg_get_expr(polqual, polrelid)) > 0 or position('is_owner()' in pg_get_expr(polqual, polrelid)) = 0)) then
    raise exception 'AUTH-LISTED: leads_delete is not owner-only';
  end if;
  if position('crm_listed()' in (select prosrc from pg_proc where proname = 'crm_team')) = 0
     or position('crm_listed()' in (select prosrc from pg_proc where proname = 'crm_leaderboard')) = 0
     or position('crm_listed()' in (select prosrc from pg_proc where proname = 'kb_mark_read')) = 0 then
    raise exception 'AUTH-LISTED: a function is missing its crm_listed() check';
  end if;
  raise notice 'AUTH-LISTED OK: leads has 4 policies (select/insert/update for listed team members, delete for owners), none uses crm_active(); crm_team, crm_leaderboard and kb_mark_read require a listed team member.';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'public.leads'::regclass;
-- Expect 4 rows: leads_delete (no_users() OR (crm_listed() AND is_owner())),
-- leads_insert, leads_select, leads_update (crm_listed() AND (is_owner() OR
-- owner_id = auth.uid() OR pool ...)). crm_active() appears in none.
select proname, position('crm_listed()' in prosrc) > 0 as checks_listed
  from pg_proc where proname in ('crm_team', 'crm_leaderboard', 'kb_mark_read') order by 1;
-- Expect 3 rows, checks_listed true.
