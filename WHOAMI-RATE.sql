-- WHOAMI-RATE.sql — teach crm_whoami() about appointment_rate.
--
-- WHY THIS EXISTS
--
-- appointment_rate has two read paths in the browser:
--
--   1. getUsers()  — select from crm_users. The one everything uses.
--   2. crm_whoami() — the RPC, used to rebuild "my own row" in the moment a rep
--                    cannot read crm_users yet (right after a role change).
--
-- Path 2 carried commission_pct and NOT appointment_rate. So in that window a
-- rep read as $0 per appointment while Settings showed their real rate: one
-- value, two reads, two answers. ENGINEERING §2.
--
-- Safe to run more than once. Changes no data and no policy — it only widens
-- what the function returns. Run it AFTER REP-PAY-MIGRATION.sql, which is what
-- adds the column this reads.

drop function if exists crm_whoami();
create or replace function crm_whoami()
returns table (role text, active boolean, setup boolean, name text, pools text[],
               commission_pct numeric, tabs text[], goal_conversions numeric,
               appointment_rate numeric)
language sql security definer stable as $$
  select
    coalesce(u.role, case when exists (select 1 from crm_users) then 'none' else 'owner' end),
    coalesce(u.active, true),
    exists (select 1 from crm_users),
    u.name, coalesce(u.pools, '{}'), coalesce(u.commission_pct, 0),
    coalesce(u.tabs, '{}'), coalesce(u.goal_conversions, 0),
    coalesce(u.appointment_rate, 0)
  from (select 1) _ left join crm_users u on u.id = auth.uid();
$$;
revoke all on function crm_whoami() from public, anon;
grant execute on function crm_whoami() to authenticated;

-- It still returns only YOUR row. security definer bypasses RLS, so the
-- auth.uid() join is the whole access control — verify it did not widen:
--
--   select * from crm_whoami();
--
-- One row, your own rate. A rep running this must not see anybody else's.
