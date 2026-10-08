-- ============================================================================
-- ONBOARDING-ACCEPT-FIX-2026-10.sql — onboardings were never created at acceptance
--
-- Run ONCE in the Supabase SQL Editor. Safe to re-run. Changes one function.
--
-- WHAT WAS WRONG
--   onboarding_for_proposal() makes the onboarding's token with
--   gen_random_bytes(), from pgcrypto. It is pinned to `search_path = public`,
--   and on Supabase pgcrypto is installed in the `extensions` schema, so inside
--   the function gen_random_bytes did not exist. Every call failed with
--   "function gen_random_bytes(integer) does not exist", so NO acceptance ever
--   got an onboarding, and the server hid the error (fixed in the same PR: it
--   now logs it, creates the onboarding itself, and emails the owners if it
--   cannot).
--
-- THE FIX
--   The same function with `search_path = public, extensions`. Nothing else
--   changes: same arguments, same rules (accepted proposals only, one per
--   proposal), same grants (service role only; re-stated below).
--
-- PASS
--   select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where p.proname = 'gen_random_bytes';                        -- extensions
--   select proconfig from pg_proc where proname = 'onboarding_for_proposal';
--                                    -- {"search_path=public, extensions"}
-- ============================================================================

-- search_path includes `extensions`: on Supabase pgcrypto (gen_random_bytes)
-- lives there, not in public, and with public alone this function failed on
-- every call (fixed Oct 2026: ONBOARDING-ACCEPT-FIX-2026-10.sql).
create or replace function onboarding_for_proposal(p_token text, p_products text[], p_package text)
returns table (token text, client jsonb)
language plpgsql security definer volatile set search_path = public, extensions as $$
#variable_conflict use_column
declare pr proposals%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  select * into pr from proposals p where p.token = p_token;
  if not found or pr.status <> 'accepted' then return; end if;
  insert into onboardings (lead_id, proposal_id, token, products, package_name, created_by)
  values (pr.lead_id, pr.id,
          rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '='),
          coalesce(p_products, '{}'), left(coalesce(p_package, ''), 120), pr.created_by)
  on conflict (proposal_id) do nothing;
  return query select o.token, coalesce(pr.body->'client', '{}'::jsonb)
                 from onboardings o where o.proposal_id = pr.id;
end $$;

revoke all on function onboarding_for_proposal(text, text[], text) from public, anon, authenticated;
grant execute on function onboarding_for_proposal(text, text[], text) to service_role;
