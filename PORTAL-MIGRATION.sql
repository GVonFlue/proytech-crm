-- ============================================================================
-- PORTAL-MIGRATION.sql  —  the client portal, step B-1
--
-- WHAT THIS DOES
--   A client signs in to /portal with a magic link and sees THEIR build:
--   stage, the 14-day clock, the road to Launch Day, what is waiting on them,
--   their crew, their accepted proposal, the Terms they agreed to and their
--   onboarding answers. Nothing else, ever.
--
--   1. client_users: a login (auth.users) → exactly ONE client (lead_id).
--      Owner-only under RLS. A client has no table access at all.
--   2. portal_lead(): the lead the CALLER may see, from auth.uid() alone:
--      an active client_users row, and NOT a CRM user (the two identities
--      never mix). Null otherwise. Every portal function starts here and takes
--      NO lead id or proposal id, so there is nothing a client can change to
--      reach another client.
--   3. portal_home() / portal_documents() / portal_touch(): named fields only,
--      built key by key. Never a lead's notes, activities, deals, owner, IPs
--      or anyone else's email. The EIN in the onboarding answers is masked to
--      its last 4 HERE, so the full number never reaches a browser.
--   4. The server's own door (service_role only): portal_invite_target(),
--      portal_link_client(), portal_login_target() for the invite at
--      acceptance, the owner's invites and the magic-link sign-in.
--   5. The first-run door is closed to clients: no_users() and crm_whoami()
--      treat an install with client logins as set up, so a client can never
--      be "owner" of an empty CRM, nor claim it (users_bootstrap).
--
-- WHEN TO RUN
--   BEFORE the code deploys (PR "Client portal B-1"). The deployed code never
--   calls any of this, so running it first breaks nothing. Re-running is
--   safe. Then RLS-AUDIT.sql (it now also sweeps functions, section 2e), then
--   VERIFY-RLS.md §17 with a real client login.
--
-- Requires: MIGRATION.sql, WHOAMI-RATE.sql (crm_whoami with appointment_rate),
-- PROPOSALS-MIGRATION.sql + PROPOSALS-LEGAL-MIGRATION.sql, ONBOARDING-MIGRATION.sql.
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

-- ---- 1. client_users ----------------------------------------------------------
create table if not exists client_users (
  id             uuid primary key references auth.users(id) on delete cascade,
  lead_id        text not null,
  email          text not null,
  name           text not null default '',
  active         boolean not null default true,
  invited_by     uuid,
  invited_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  removed_at     timestamptz
);
create unique index if not exists client_users_email on client_users (lower(email));
create index if not exists client_users_lead on client_users (lead_id);
comment on table client_users is
  'Client portal logins. OWNER ONLY under RLS. A client reads nothing here; the portal reads through portal_home()/portal_documents(), which find the lead from auth.uid() alone.';
alter table client_users enable row level security;
do $$ declare p record; begin
  for p in select polname from pg_policy where polrelid = 'public.client_users'::regclass loop
    execute format('drop policy %I on client_users', p.polname);
  end loop;
end $$;
create policy client_users_owner on client_users for all
  using (no_users() or (crm_listed() and is_owner()))
  with check (no_users() or (crm_listed() and is_owner()));
revoke all on client_users from anon;

-- ---- 5. the first-run door: not open to clients -------------------------------
-- no_users() opens every policy while nobody is set up (a fresh install). A
-- client login on such an install must not inherit that, so "set up" now
-- means a team member OR a client exists.
create or replace function no_users() returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from crm_users) and not exists (select 1 from client_users); $$;

drop function if exists crm_whoami();
create or replace function crm_whoami()
returns table (role text, active boolean, setup boolean, name text, pools text[],
               commission_pct numeric, tabs text[], goal_conversions numeric,
               appointment_rate numeric)
language sql security definer stable set search_path = public as $$
  select
    -- 'owner' only on a truly empty install; a client login is always 'none'
    coalesce(u.role, case when exists (select 1 from crm_users) or exists (select 1 from client_users) then 'none' else 'owner' end),
    coalesce(u.active, true),
    exists (select 1 from crm_users),
    u.name, coalesce(u.pools, '{}'), coalesce(u.commission_pct, 0),
    coalesce(u.tabs, '{}'), coalesce(u.goal_conversions, 0),
    coalesce(u.appointment_rate, 0)
  from (select 1) _ left join crm_users u on u.id = auth.uid();
$$;
revoke all on function crm_whoami() from public, anon;
grant execute on function crm_whoami() to authenticated;

-- ---- 2. the one door: which lead may the caller see ------------------------
create or replace function portal_lead() returns text
language sql security definer stable set search_path = public as $$
  select c.lead_id from client_users c
   where c.id = auth.uid() and c.active
     and not exists (select 1 from crm_users u where u.id = auth.uid());
$$;
revoke all on function portal_lead() from public, anon;
grant execute on function portal_lead() to authenticated;

-- ---- 3. what the portal reads ------------------------------------------------
-- Home. Every key named; nothing passed through whole except the client's own
-- checklist ticks, milestone dates and pause list (dates only).
create or replace function portal_home() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare lid text := portal_lead(); l jsonb; cname text; s jsonb; onbj jsonb; propj jsonb;
begin
  if lid is null then return null; end if;
  select data into l from leads where id = lid;
  if l is null then return null; end if;
  select c.name into cname from client_users c where c.id = auth.uid();
  select data into s from app_settings where id = 'main';
  -- each part is a sub-select, so "no onboarding yet" or "no accepted
  -- proposal" is simply null, never an unassigned record
  select jsonb_build_object(
       'status', o.status, 'submitted_at', o.submitted_at, 'products', to_jsonb(o.products), 'industry', o.industry,
       'answers', jsonb_build_object(
          'web.domain_own', o.answers->'web.domain_own', 'web.gbp_status', o.answers->'web.gbp_status',
          'brand.logo_status', o.answers->'brand.logo_status', 'biz.industry', o.answers->'biz.industry'))
    into onbj from onboardings o where o.lead_id = lid order by o.created_at desc limit 1;
  select jsonb_build_object(
       'accepted_at', p.accepted_at, 'plan', p.accepted_plan,
       'launch_days', p.body->'launchDays', 'contacts', p.body->'contacts',
       'quote', jsonb_build_object(
          'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i->'id', 'name', i->'name', 'kind', i->'kind')), '[]'::jsonb) from jsonb_array_elements(coalesce(p.body->'quote'->'items', '[]'::jsonb)) i),
          'packageName', p.body->'quote'->'packageName',
          'setup', p.body->'quote'->'setup', 'deposit', p.body->'quote'->'deposit', 'depositPct', p.body->'quote'->'depositPct',
          'monthly', p.body->'quote'->'monthly', 'prepay', p.body->'quote'->'prepay'))
    into propj from proposals p where p.lead_id = lid and p.status = 'accepted' order by p.accepted_at desc nulls last limit 1;
  return jsonb_build_object(
    'first_name', split_part(btrim(coalesce(nullif(cname, ''), l->>'name', '')), ' ', 1),
    'company',    coalesce(nullif(l->>'company', ''), l->>'name', ''),
    'phase',      coalesce(nullif(l->>'clientPhase', ''), 'intake'),
    'phase_since', l->>'phaseSince',
    'launched_at', l->>'launchedAt',
    'converted_at', l->>'convertedAt',
    'checklist', jsonb_build_object(
       'deposit_paid', l->'onboarding'->'deposit_paid', 'intake_form', l->'onboarding'->'intake_form',
       'access_dns', l->'onboarding'->'access_dns', 'access_gbp', l->'onboarding'->'access_gbp',
       'logo_received', l->'onboarding'->'logo_received', 'headshot_received', l->'onboarding'->'headshot_received',
       'kickoff_call', l->'onboarding'->'kickoff_call', 'onbSkip', coalesce(l->'onbSkip', '[]'::jsonb)),
    'delivery', jsonb_build_object(
       'website', l->'delivery'->'website', 'suite', l->'delivery'->'suite',
       'ai', l->'delivery'->'ai', 'gbp', l->'delivery'->'gbp'),
    'lifecycle', jsonb_build_object(
       'pauses', coalesce(l->'lifecycle'->'pauses', '[]'::jsonb),
       'items', coalesce(l->'lifecycle'->'items', '{}'::jsonb)),
    'onboarding', onbj,
    'proposal', propj,
    'config', jsonb_build_object(
       'template', s->'lifecycle'->'template', 'builder', s->'lifecycle'->'builder',
       'launch_days', s->'offer'->'launchDays', 'product_map', s->'onboarding'->'productMap',
       'company_name', s->'offer'->'company'->'name')
  );
end $$;
revoke all on function portal_home() from public, anon;
grant execute on function portal_home() to authenticated;

-- Documents: the accepted proposal(s) as the client saw them (the same keys
-- the public page shows, PUBLIC_BODY_KEYS), the terms they agreed to, and
-- their own onboarding answers with the EIN masked to its last 4.
create or replace function portal_documents() returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare lid text := portal_lead(); props jsonb; onb jsonb;
begin
  if lid is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'accepted_at', p.accepted_at, 'accepted_name', p.accepted_name, 'plan', p.accepted_plan,
           'terms_version', p.accepted_terms_version, 'terms_url', p.accepted_terms_url, 'privacy_url', p.accepted_privacy_url,
           'body', jsonb_build_object('client', p.body->'client', 'company', p.body->'company', 'preparedOn', p.body->'preparedOn',
                     'validDays', p.body->'validDays', 'copy', p.body->'copy', 'quote', p.body->'quote', 'standard', p.body->'standard',
                     'contacts', p.body->'contacts', 'launchDays', p.body->'launchDays', 'legal', p.body->'legal'))
           order by p.accepted_at desc), '[]'::jsonb)
    into props
    from proposals p where p.lead_id = lid and p.status = 'accepted';
  select jsonb_build_object('status', o.status, 'submitted_at', o.submitted_at, 'products', to_jsonb(o.products), 'industry', o.industry,
           'answers', case when o.answers ? 'tx.ein' and length(coalesce(o.answers->>'tx.ein', '')) > 0
                           then jsonb_set(o.answers, '{tx.ein}', to_jsonb('•••••' || right(regexp_replace(o.answers->>'tx.ein', '[^0-9]', '', 'g'), 4)))
                           else o.answers end)
    into onb
    from onboardings o where o.lead_id = lid order by o.created_at desc limit 1;
  return jsonb_build_object('proposals', props, 'onboarding', onb);
end $$;
revoke all on function portal_documents() from public, anon;
grant execute on function portal_documents() to authenticated;

-- "Last signed in", for the owner's Portal card. Only the caller's own row.
create or replace function portal_touch() returns void
language sql security definer volatile set search_path = public as $$
  update client_users set last_login_at = now() where id = auth.uid() and active and portal_lead() is not null;
$$;
revoke all on function portal_touch() from public, anon;
grant execute on function portal_touch() to authenticated;

-- ---- 4. the server's door (service_role only) --------------------------------
-- Who to invite for a proposal: its lead's own email, never one the caller
-- supplies. Null when the lead has no usable email.
drop function if exists portal_invite_target(uuid);
create or replace function portal_invite_target(p_proposal_id uuid)
returns table (lead_id text, email text, name text, company text, client_user_id uuid)
language sql security definer stable set search_path = public as $$
  select l.id, lower(btrim(l.data->>'email')), coalesce(l.data->>'name', ''), coalesce(nullif(l.data->>'company', ''), l.data->>'name', ''),
         (select c.id from client_users c where lower(c.email) = lower(btrim(l.data->>'email')))
    from proposals p join leads l on l.id = p.lead_id
   where p.id = p_proposal_id
     and coalesce(l.data->>'email', '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
$$;

-- Tie a login to a lead. The login's email must BE the address it was made
-- for (auth.users is the record), it must not be a CRM user, and an email
-- already tied to a different lead is refused rather than moved.
create or replace function portal_link_client(p_uid uuid, p_lead_id text, p_name text, p_invited_by uuid)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare em text; cur client_users%rowtype;
begin
  if exists (select 1 from crm_users where id = p_uid) then return 'crm_user'; end if;
  select lower(email) into em from auth.users where id = p_uid;
  if em is null then return 'no_login'; end if;
  if not exists (select 1 from leads where id = p_lead_id) then return 'no_lead'; end if;
  select * into cur from client_users where id = p_uid;
  if found then
    if cur.lead_id <> p_lead_id then return 'other_client'; end if;
    update client_users set active = true, removed_at = null where id = p_uid;
    return 'linked';
  end if;
  if exists (select 1 from client_users where lower(email) = em) then return 'other_client'; end if;
  insert into client_users (id, lead_id, email, name, invited_by) values (p_uid, p_lead_id, em, left(btrim(coalesce(p_name, '')), 120), p_invited_by);
  return 'linked';
end $$;

-- The magic-link sign-in: is this email an ACTIVE client login?
create or replace function portal_login_target(p_email text)
returns table (id uuid, email text)
language sql security definer stable set search_path = public as $$
  select c.id, c.email from client_users c
   where lower(c.email) = lower(btrim(p_email)) and c.active
     and not exists (select 1 from crm_users u where u.id = c.id);
$$;

revoke all on function portal_invite_target(uuid) from public, anon, authenticated;
revoke all on function portal_link_client(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function portal_login_target(text) from public, anon, authenticated;
grant execute on function portal_invite_target(uuid) to service_role;
grant execute on function portal_link_client(uuid, text, text, uuid) to service_role;
grant execute on function portal_login_target(text) to service_role;

-- ---- verify, and refuse to commit anything else ------------------------------
do $$
declare f text; bad text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.client_users'::regclass) then
    raise exception 'PORTAL: RLS is off on client_users';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.client_users'::regclass) <> 1 then
    raise exception 'PORTAL: client_users should have exactly one (owner) policy';
  end if;
  foreach f in array array['portal_home()', 'portal_documents()', 'portal_touch()', 'portal_lead()'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'PORTAL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'PORTAL: a client cannot execute %', f; end if;
  end loop;
  foreach f in array array['portal_invite_target(uuid)', 'portal_link_client(uuid,text,text,uuid)', 'portal_login_target(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'PORTAL: % is callable from a browser', f;
    end if;
  end loop;
  -- the portal functions take NO arguments: there is nothing to aim
  select string_agg(proname, ', ') into bad from pg_proc
   where proname in ('portal_home', 'portal_documents', 'portal_touch', 'portal_lead') and pronargs <> 0;
  if bad is not null then raise exception 'PORTAL: these take arguments: %', bad; end if;
  if position('client_users' in (select prosrc from pg_proc where proname = 'no_users')) = 0 then
    raise exception 'PORTAL: no_users() does not know about client logins';
  end if;
  raise notice 'PORTAL OK: client_users owner-only; portal_home/documents/touch read the caller''s own lead only (no arguments); the server functions are service_role only; a client is never owner of an empty install.';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as browser_can,
       has_function_privilege('service_role', p.oid, 'execute') as server_can
  from pg_proc p where p.proname like 'portal\_%' order by 1;
-- Expect 7 rows, all definer true, anon_can false. portal_home, portal_documents,
-- portal_touch, portal_lead: browser_can true. portal_invite_target,
-- portal_link_client, portal_login_target: browser_can false, server_can true.
select polname, pg_get_expr(polqual, polrelid) as using_expr from pg_policy where polrelid = 'public.client_users'::regclass;
-- Expect 1 row: client_users_owner, (no_users() OR (crm_listed() AND is_owner())).
