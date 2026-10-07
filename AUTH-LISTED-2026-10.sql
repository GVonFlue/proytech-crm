-- ============================================================================
-- AUTH-LISTED-2026-10.sql
--
-- WHAT THIS DOES
--   "Signed in" is not "on the team". A Supabase login with NO crm_users row
--   (a stray account today; a client of the portal tomorrow) must get nothing
--   from the CRM. Three places still treated any login as enough:
--
--   1. leads_all. crm_active() is TRUE for a login with no crm_users row
--      (coalesce(..., true)), and `owner_id = auth.uid()` then let such a
--      login INSERT leads it owned and read, edit and delete them. It could
--      not see anyone else's lead, but it could write into the table.
--      Now: crm_listed() (a row, and active) instead of crm_active().
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

-- ---- 1. leads: a listed, active team member, or first-run mode --------------
drop policy if exists leads_all on leads;
create policy leads_all on leads for all using (
  no_users() or ( crm_listed() and (
    is_owner()
    or owner_id = auth.uid()
    or (pool is not null and pool = any (my_pools()))
  ))
) with check (
  no_users() or ( crm_listed() and (
    is_owner()
    or owner_id = auth.uid()
    or (pool is not null and pool = any (my_pools()))
  ))
);

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
declare q text; c text;
begin
  select pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) into q, c
    from pg_policy where polrelid = 'public.leads'::regclass and polname = 'leads_all';
  if q is null or position('crm_listed()' in q) = 0 or position('crm_listed()' in c) = 0
     or position('crm_active()' in q) > 0 or position('crm_active()' in c) > 0 then
    raise exception 'AUTH-LISTED: leads_all does not require crm_listed(): % / %', q, c;
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.leads'::regclass) <> 1 then
    raise exception 'AUTH-LISTED: leads has more than one policy; read every one (RLS-AUDIT.sql)';
  end if;
  if position('crm_listed()' in (select prosrc from pg_proc where proname = 'crm_team')) = 0
     or position('crm_listed()' in (select prosrc from pg_proc where proname = 'crm_leaderboard')) = 0
     or position('crm_listed()' in (select prosrc from pg_proc where proname = 'kb_mark_read')) = 0 then
    raise exception 'AUTH-LISTED: a function is missing its crm_listed() check';
  end if;
  raise notice 'AUTH-LISTED OK: leads, crm_team, crm_leaderboard and kb_mark_read require a listed team member.';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'public.leads'::regclass;
-- Expect 1 row, leads_all, with crm_listed() (not crm_active()) in both.
select proname, position('crm_listed()' in prosrc) > 0 as checks_listed
  from pg_proc where proname in ('crm_team', 'crm_leaderboard', 'kb_mark_read') order by 1;
-- Expect 3 rows, checks_listed true.
