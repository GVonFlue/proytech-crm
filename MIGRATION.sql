-- ============================================================================
-- ProyTech CRM — sales team + commissions
-- Run this ONCE per install in Supabase → SQL Editor. It is idempotent:
-- running it again changes nothing.
--
-- What it does:
--   1. crm_users            — one row per person, with role / pools / commission
--   2. leads.owner_id, .pool — real columns RLS can actually read
--   3. helper functions      — is_owner(), my_pools(), no_users(), crm_active()
--   4. Row Level Security    — on leads, crm_users and app_settings
--   5. crm_leaderboard()     — names + conversion counts, never money
--
-- Commission fields are NOT columns: they live in the lead's existing jsonb
-- `data` blob as data->'commission' = {repId,repName,pct,base,amount,status,
-- convertedAt,approvedAt,approvedBy,voidedAt}. Same for the owner alert
-- (data->'onboardingAlert'), which is why there is no separate alerts table —
-- see BUILD-NOTES.md for why that choice was made.
-- ============================================================================

-- ---------------------------------------------------------------- 1. people
create table if not exists crm_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'rep',
  pools text[] not null default '{}',
  commission_pct numeric not null default 0,
  active boolean not null default true
);
-- columns added after the first version of this file — safe to re-run
alter table crm_users add column if not exists email text;
alter table crm_users add column if not exists tabs text[] not null default '{}';
alter table crm_users add column if not exists goal_conversions numeric not null default 0;
-- sidebar tab order, per person. Safe to re-run. The app degrades to the
-- default order if this hasn't been applied, so it is not a blocking migration.
alter table crm_users add column if not exists nav_order text[] not null default '{}';
alter table crm_users drop constraint if exists crm_users_role_chk;
alter table crm_users add constraint crm_users_role_chk check (role in ('owner','rep'));

-- ----------------------------------------------------------------- 2. leads
alter table leads add column if not exists owner_id uuid references auth.users(id);
alter table leads add column if not exists pool text;
create index if not exists leads_owner_id_idx on leads (owner_id);
create index if not exists leads_pool_idx on leads (pool);

-- ------------------------------------------------------------- 3. helpers
-- security definer so a rep can ask "am I an owner?" without being able to
-- read the crm_users rows the answer is derived from.
create or replace function is_owner() returns boolean language sql security definer stable as $$
  select exists (select 1 from crm_users where id = auth.uid() and role = 'owner' and active); $$;

create or replace function my_pools() returns text[] language sql security definer stable as $$
  select coalesce((select pools from crm_users where id = auth.uid() and active), '{}'); $$;

-- nobody has been set up yet → the install behaves exactly as it did before
create or replace function no_users() returns boolean language sql security definer stable as $$
  select not exists (select 1 from crm_users); $$;

-- a deactivated person keeps their data and loses their access
create or replace function crm_active() returns boolean language sql security definer stable as $$
  select coalesce((select active from crm_users where id = auth.uid()), true); $$;

-- --------------------------------------------------------------- 4. RLS
alter table leads enable row level security;
alter table crm_users enable row level security;

drop policy if exists leads_all on leads;
create policy leads_all on leads for all using (
  no_users() or ( crm_active() and (
    is_owner()
    or owner_id = auth.uid()
    or (pool is not null and pool = any (my_pools()))
  ))
) with check (
  no_users() or ( crm_active() and (
    is_owner()
    or owner_id = auth.uid()
    or (pool is not null and pool = any (my_pools()))
  ))
);

drop policy if exists users_read on crm_users;
create policy users_read on crm_users for select using (id = auth.uid() or is_owner());
drop policy if exists users_manage on crm_users;
create policy users_manage on crm_users for all using (is_owner()) with check (is_owner());
-- first-run bootstrap: with an empty table, the person signed in may create
-- their OWN row (and only their own). After that, owners manage everyone.
drop policy if exists users_bootstrap on crm_users;
create policy users_bootstrap on crm_users for insert with check (no_users() and id = auth.uid());

-- app_settings holds settings AND the team-wide tasks / invoices / txns /
-- huddle blobs. It is one row per key — it CANNOT be split per person, so any
-- signed-in user who has those tabs can read all of it. Stated plainly in
-- BUILD-NOTES.md; reps simply don't get those tabs.
-- Someone who is signed in but has NO crm_users row (a stray account) gets
-- nothing at all: not the settings, not a lead.
create or replace function crm_listed() returns boolean language sql security definer stable as $$
  select exists (select 1 from crm_users where id = auth.uid() and active); $$;

alter table app_settings enable row level security;
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select using (no_users() or crm_listed());
drop policy if exists settings_write on app_settings;
create policy settings_write on app_settings for all
  using (no_users() or crm_listed()) with check (no_users() or crm_listed());

-- ------------------------------------------------------------- 4b. whoami
-- The client cannot work its own role out from crm_users, because a rep can
-- only SEE their own row — "no owner rows visible" and "no owners exist" look
-- identical from the browser. This function answers it definitively.
--   role: 'owner' | 'rep' | 'none'   (none = signed in, not set up)
--   setup: has anyone been added yet
drop function if exists crm_whoami();
create or replace function crm_whoami()
returns table (role text, active boolean, setup boolean, name text, pools text[],
               commission_pct numeric, tabs text[], goal_conversions numeric)
language sql security definer stable as $$
  select
    coalesce(u.role, case when exists (select 1 from crm_users) then 'none' else 'owner' end),
    coalesce(u.active, true),
    exists (select 1 from crm_users),
    u.name, coalesce(u.pools, '{}'), coalesce(u.commission_pct, 0),
    coalesce(u.tabs, '{}'), coalesce(u.goal_conversions, 0)
  from (select 1) _ left join crm_users u on u.id = auth.uid();
$$;
revoke all on function crm_whoami() from public, anon;
grant execute on function crm_whoami() to authenticated;

-- ------------------------------------------------------- 5. leaderboard
-- A rep can only READ their own leads, so the ranking cannot be computed in
-- the browser. This returns reps + how many clients they closed. No money
-- crosses this boundary, by construction: there is no amount column here.
drop function if exists crm_leaderboard();
create or replace function crm_leaderboard()
returns table (user_id uuid, name text, clients_month bigint, clients_all bigint)
language sql security definer stable as $$
  select u.id, u.name,
    count(l.id) filter (where substr(coalesce(l.data->>'convertedAt',''),1,7) = to_char(now(), 'YYYY-MM')),
    count(l.id)
  from crm_users u
  left join leads l
    on l.owner_id = u.id
   and coalesce(l.data->>'isClient','false') = 'true'
   and coalesce(l.data->>'convertedAt','') <> ''
  where u.role = 'rep' and u.active
  group by u.id, u.name;
$$;
revoke all on function crm_leaderboard() from public, anon;
grant execute on function crm_leaderboard() to authenticated;

-- ------------------------------------------------------------- backfill
-- Existing leads carry the owner's NAME in data->>'owner'. Point owner_id at
-- the matching crm_users row wherever the names line up. Safe to re-run.
update leads l set owner_id = u.id
  from crm_users u
 where l.owner_id is null
   and u.name is not null
   and l.data->>'owner' = u.name;
