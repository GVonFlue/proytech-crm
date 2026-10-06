-- ============================================================================
-- LIFECYCLE-MIGRATION.sql
--
-- WHAT THIS DOES
--   One thing: onboarding_public() also returns the lead's checklist ticks for
--   logo_received and headshot_received, beside the deposit and access items
--   it already returned. Nothing else changes: no table, no column, no policy.
--
-- WHY
--   Terms 6.2: the 14-day clock starts when the deposit has cleared, the
--   onboarding is submitted, AND the required access and assets are in (the
--   logo, the headshot). The launch clock (lib/onboarding launchState) now
--   waits on the assets. The CRM reads them from the lead; the client's portal
--   reads them through this function. Without it the portal would show
--   "waiting on your logo" after the CRM had started the clock.
--
-- WHEN TO RUN
--   BEFORE the code deploys (PR "Client lifecycle: stages, dates, What's
--   due"). The code already deployed ignores the two extra keys, so running
--   it first is safe. Re-running is safe. Then run RLS-AUDIT.sql.
--
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

create or replace function onboarding_public(p_token text)
returns table (id uuid, status text, industry text, lender_kind text, products text[], package_name text,
               answers jsonb, sections jsonb, submitted_at timestamptz, last_activity_at timestamptz,
               client_name text, client_email text, client_phone text, client_company text, client_website text,
               plan jsonb, contacts jsonb, launch_days int, checklist jsonb, files jsonb)
language sql security definer stable set search_path = public as $$
  select o.id, o.status, o.industry, o.lender_kind, o.products, o.package_name,
         o.answers, o.sections, o.submitted_at, o.last_activity_at,
         l.data->>'name', l.data->>'email', l.data->>'phone',
         coalesce(nullif(l.data->>'company',''), p.body->'client'->>'company'),
         coalesce(nullif(l.data->>'website',''), p.body->'client'->>'website'),
         p.body->'copy'->'plan',
         p.body->'contacts',
         case when (p.body->>'launchDays') ~ '^[0-9]{1,3}$' then (p.body->>'launchDays')::int end,
         jsonb_build_object(
           'deposit_paid', l.data->'onboarding'->'deposit_paid',
           'access_dns',   l.data->'onboarding'->'access_dns',
           'access_gbp',   l.data->'onboarding'->'access_gbp',
           'access_social',l.data->'onboarding'->'access_social',
           'logo_received',     l.data->'onboarding'->'logo_received',
           'headshot_received', l.data->'onboarding'->'headshot_received',
           'onbSkip',      l.data->'onbSkip'),
         coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'slot', f.slot, 'name', f.original_name,
                                                       'mime', f.mime, 'bytes', f.bytes, 'at', f.created_at,
                                                       'path', f.path, 'sensitive', f.sensitive)
                                    order by f.created_at)
                     from onboarding_files f where f.onboarding_id = o.id and f.state = 'ok'), '[]'::jsonb)
  from onboardings o
  left join leads l on l.id = o.lead_id
  left join proposals p on p.id = o.proposal_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and o.token = p_token
$$;

revoke all on function onboarding_public(text) from public, anon, authenticated;
grant execute on function onboarding_public(text) to service_role;

do $$
begin
  if has_function_privilege('anon', 'onboarding_public(text)', 'execute')
     or has_function_privilege('authenticated', 'onboarding_public(text)', 'execute') then
    raise exception 'LIFECYCLE: anon or authenticated can execute onboarding_public';
  end if;
  if not exists (select 1 from pg_proc where proname = 'onboarding_public' and prosecdef) then
    raise exception 'LIFECYCLE: onboarding_public is not security definer';
  end if;
  if position('headshot_received' in (select prosrc from pg_proc where proname = 'onboarding_public' limit 1)) = 0 then
    raise exception 'LIFECYCLE: onboarding_public does not return the asset ticks';
  end if;
  raise notice 'LIFECYCLE OK: onboarding_public returns logo_received and headshot_received, service_role only.';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can,
       has_function_privilege('service_role', p.oid, 'execute')  as server_can,
       position('logo_received' in p.prosrc) > 0 and position('headshot_received' in p.prosrc) > 0 as returns_assets
  from pg_proc p where p.proname = 'onboarding_public';
-- Expect 1 row: security_definer true, anon_can false, authed_can false,
-- server_can true, returns_assets true.
