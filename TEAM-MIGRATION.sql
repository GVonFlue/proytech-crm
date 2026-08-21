-- ============================================================================
-- TEAM-MIGRATION.sql — let a rep learn WHO ELSE IS ON THE TEAM, and nothing more.
--
-- THE BUG THIS FIXES
--
--   crm_users has:
--       create policy users_read on crm_users
--         for select using (id = auth.uid() or is_owner());
--
--   so a rep selecting crm_users gets exactly ONE row: their own. The browser
--   then treats that array as "the team", and two features quietly collapse:
--
--     1. THE @MENTION TAG PICKER NEVER RENDERS FOR A REP.
--        src/App.jsx builds  team = users.filter(active).map(name).filter(n => n !== me)
--        and then  if (!team.length) return null.
--        For a rep that list is [me] minus me = [], so the control is not
--        merely empty — it is absent. REP-AUDIT #3 calls flagging something to
--        the owner "one of the most useful things you can do" for a rep, and it
--        has never once been reachable by one.
--
--     2. calendarOwner() CAN NEVER RESOLVE FOR A REP.
--        It looks for role='owner' rows in that same array. There are none, so
--        the meeting scheduler always falls back to "the owner's Google
--        Calendar" with no name — which was reported as an email-mapping
--        problem and is actually this.
--
--   Both are the same mistake in two places: the client assumes `users` is the
--   team. For a rep it is a list of one.
--
-- WHY A FUNCTION AND NOT A WIDER POLICY
--
--   Widening users_read would hand every rep the whole crm_users row —
--   commission_pct, appointment_rate, email, pools. That is the company's pay
--   structure, and ROLES.md is explicit that a rep never sees it.
--
--   crm_leaderboard() already solved this exact shape, and says so in its own
--   comment: "A rep can only READ their own leads, so the ranking cannot be
--   computed in the browser... No money crosses this boundary, by
--   construction: there is no amount column here."
--
--   crm_team() is the same trade. It returns id, name and role. There is no
--   money column, no email, no pools, no rate — not filtered out, ABSENT, so
--   no future edit can leak one by adding a field to a select list.
--
-- SAFE TO RE-RUN. Creates a function, changes no data and no policy.
-- ============================================================================

drop function if exists crm_team();
create or replace function crm_team()
returns table (id uuid, name text, role text)
language sql security definer stable as $$
  select u.id, u.name, u.role
    from crm_users u
   where u.active
   order by u.role, u.name;
$$;

-- security definer bypasses RLS, so the grant IS the access control here.
-- anon must never reach it: an unauthenticated caller learning the staff list
-- of every install is exactly the shape of the google-status leak.
revoke all on function crm_team() from public, anon;
grant execute on function crm_team() to authenticated;

-- ----------------------------------------------------------------- verify
--
-- As an OWNER — every active person:
--
--   select * from crm_team();
--
-- As a REP — the SAME rows. That is the point, and it is also the thing to
-- check has not gone further than intended:
--
--   select * from crm_team();
--
-- Then confirm the boundary still holds for that rep. This must still return
-- exactly one row, their own, because the policy is untouched:
--
--   select id, name, commission_pct from crm_users;
--
-- If that second query returns more than one row for a rep, something widened
-- users_read and this file is not the cause — check MIGRATION.sql.
