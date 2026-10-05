-- ============================================================================
-- PROPOSALS-LEGAL-MIGRATION.sql
--
-- WHAT THIS DOES
--   Records that a client agreed to the Terms of Service and Privacy Policy
--   when they accepted a proposal — and makes Postgres REFUSE an acceptance
--   without that agreement, whenever the proposal carries legal links.
--
--   1. proposals gets three columns: accepted_terms_version,
--      accepted_terms_url, accepted_privacy_url.
--   2. proposal_accept(token, name, ip, plan, agreed_terms) — NEW, five
--      arguments. If the proposal's STORED body has a legal block and
--      agreed_terms is not true, it returns 'terms_required' and records
--      nothing. On acceptance it copies the terms URLs and version FROM THE
--      STORED BODY into the record: what the proposal showed, never anything
--      the request supplied.
--   3. proposal_accept(token, name, ip, plan) — the OLD four arguments, kept
--      so the code already deployed keeps working, now calling the new one
--      with agreed_terms = false. A proposal with no legal block accepts
--      exactly as before; one WITH a legal block cannot be accepted this way.
--   4. Both callable ONLY by the server (service_role), like the rest.
--
-- WHEN TO RUN
--   BEFORE the code that uses it is deployed (PR "Proposals: legal
--   acceptance"). The deployed code calls the four-argument function, which
--   this keeps working; the new code calls the five-argument one, which only
--   exists after this runs. Running it first means no window where accepting
--   a proposal fails. Re-running is safe.
--   Then run RLS-AUDIT.sql, then VERIFY-RLS.md §12 (the legal checks).
--
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

alter table proposals add column if not exists accepted_terms_version text;
alter table proposals add column if not exists accepted_terms_url     text;
alter table proposals add column if not exists accepted_privacy_url   text;

-- ---- acceptance, with the terms: every rule enforced here, under a row lock
create or replace function proposal_accept(p_token text, p_name text, p_ip text, p_plan text, p_agreed_terms boolean)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r proposals%rowtype; legal jsonb; needs_terms boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select * into r from proposals where token = p_token for update;
  if not found or r.status = 'draft' then return 'not_found'; end if;
  if r.status = 'accepted' then return 'already'; end if;
  if r.expires_at is null or now() > r.expires_at then return 'expired'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then return 'bad_name'; end if;
  if p_plan is null or p_plan not in ('monthly','annual') then return 'bad_plan'; end if;
  -- The same test the app makes (lib/proposal hasLegal): either link present.
  legal := case when jsonb_typeof(r.body->'legal') = 'object' then r.body->'legal' else null end;
  needs_terms := legal is not null and (coalesce(legal->>'termsUrl','') <> '' or coalesce(legal->>'privacyUrl','') <> '');
  if needs_terms and p_agreed_terms is distinct from true then return 'terms_required'; end if;
  update proposals
     set status = 'accepted', accepted_at = now(),
         accepted_name = left(btrim(p_name), 120), accepted_ip = left(coalesce(p_ip,''), 64),
         accepted_plan = p_plan, viewed_at = coalesce(viewed_at, now()), updated_at = now(),
         -- from the STORED proposal, never from the request
         accepted_terms_version = case when needs_terms then left(legal->>'version', 40) end,
         accepted_terms_url     = case when needs_terms then left(legal->>'termsUrl', 500) end,
         accepted_privacy_url   = case when needs_terms then left(legal->>'privacyUrl', 500) end
   where id = r.id;
  return 'accepted';
end $$;

-- ---- the old signature: still works for proposals without legal text, and
--      can never accept one that has it (agreed_terms is always false here)
create or replace function proposal_accept(p_token text, p_name text, p_ip text, p_plan text)
returns text
language sql security definer volatile set search_path = public as $$
  select proposal_accept(p_token, p_name, p_ip, p_plan, false)
$$;

-- ---- who may call them: the server only --------------------------------------
revoke all on function proposal_accept(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function proposal_accept(text, text, text, text)          from public, anon, authenticated;
grant execute on function proposal_accept(text, text, text, text, boolean) to service_role;
grant execute on function proposal_accept(text, text, text, text)          to service_role;

-- ---- verify, and refuse to commit anything else ------------------------------
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'proposals'
     and column_name in ('accepted_terms_version','accepted_terms_url','accepted_privacy_url');
  if n <> 3 then raise exception 'PROPOSALS-LEGAL: expected 3 new columns on proposals, found %', n; end if;

  if to_regprocedure('proposal_accept(text,text,text,text,boolean)') is null
     or to_regprocedure('proposal_accept(text,text,text,text)') is null then
    raise exception 'PROPOSALS-LEGAL: a proposal_accept signature is missing';
  end if;

  if has_function_privilege('anon', 'proposal_accept(text,text,text,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'proposal_accept(text,text,text,text,boolean)', 'execute')
     or has_function_privilege('anon', 'proposal_accept(text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'proposal_accept(text,text,text,text)', 'execute') then
    raise exception 'PROPOSALS-LEGAL: anon or authenticated can execute proposal_accept';
  end if;

  if not exists (select 1 from pg_proc p where p.proname = 'proposal_accept' and p.prosecdef
                  and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_name text, p_ip text, p_plan text, p_agreed_terms boolean') then
    raise exception 'PROPOSALS-LEGAL: the five-argument proposal_accept is not security definer';
  end if;

  raise notice 'PROPOSALS-LEGAL OK: 3 columns, proposal_accept (4 and 5 arguments) for service_role only, terms enforced.';
end $$;

commit;

-- ---- read back what you just made -------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can,
       has_function_privilege('service_role', p.oid, 'execute')  as server_can
  from pg_proc p where p.proname = 'proposal_accept' order by args;
-- Expect 2 rows (4 and 5 arguments): security_definer true, anon_can false,
-- authed_can false, server_can true.

select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'proposals' and column_name like 'accepted_%' order by 1;
-- Expect accepted_at, accepted_ip, accepted_name, accepted_plan, and the three
-- new ones: accepted_privacy_url, accepted_terms_url, accepted_terms_version.
