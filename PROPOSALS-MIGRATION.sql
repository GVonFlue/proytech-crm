-- ============================================================================
-- PROPOSALS-MIGRATION.sql
--
-- WHAT THIS DOES
--   1. Creates `proposals`: one row per proposal. OWNER ONLY under RLS. A rep's
--      login and an anonymous visitor both get zero rows.
--   2. Creates three SECURITY DEFINER functions the public proposal page uses,
--      callable ONLY by the server (service_role). Anonymous and signed-in
--      sessions cannot call them directly.
--
-- WHY THE PUBLIC PAGE DOES NOT READ THE TABLE
--   ENGINEERING.md §4b: RLS is row-level, so a policy that let a stranger read
--   "their" row would hand them every column of it, including the owner's raw
--   meeting notes and the client's email. The public surface is instead a
--   function that returns NAMED columns and refuses drafts. A column that is
--   not in its RETURNS TABLE cannot be published by accident.
--
-- THE RULES ARE ENFORCED HERE, AT THE WRITE (CLAUDE.md)
--   proposal_accept() refuses a draft, an expired proposal, a second
--   acceptance, a blank name and an unknown plan, inside one row lock. The page
--   and the route check too, but those are courtesy; this is the boundary.
--
-- WHEN TO RUN
--   Once, in the Supabase SQL editor, after the code that uses it is deployed
--   (the Proposals tab says "not set up" until then, and nothing else breaks).
--   Re-running is safe. Then run RLS-AUDIT.sql, then VERIFY-RLS.md §12.
--
-- NO force row level security: the definer functions reach the table as its
-- owner, exactly like kb_publish (ENGINEERING §4b). Forcing RLS would break
-- them.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists proposals (
  id            uuid primary key default gen_random_uuid(),
  lead_id       text not null,
  token         text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  status        text not null default 'draft' check (status in ('draft','sent','viewed','accepted')),
  body          jsonb not null default '{}'::jsonb,   -- what the client sees, frozen at send
  notes         text not null default '',             -- the owner's raw notes. NEVER returned publicly.
  valid_days    int  not null default 7 check (valid_days between 1 and 60),
  email_to      text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  expires_at    timestamptz,
  viewed_at     timestamptz,
  accepted_at   timestamptz,
  accepted_name text,
  accepted_ip   text,
  accepted_plan text check (accepted_plan is null or accepted_plan in ('monthly','annual')),
  applied_at    timestamptz                            -- when the CRM applied the acceptance to the lead
);
create index if not exists proposals_lead on proposals (lead_id);
create index if not exists proposals_status on proposals (status, updated_at desc);
comment on table proposals is
  'Client proposals. OWNER ONLY under RLS. The public page reads ONLY through proposal_public(), which returns named columns and never `notes`, `email_to`, `lead_id` or `accepted_ip`.';

alter table proposals enable row level security;
drop policy if exists proposals_owner on proposals;
create policy proposals_owner on proposals
  for all using (is_owner()) with check (is_owner());
revoke all on proposals from anon;

-- ---- the public read: one proposal, named columns, never a draft ----------
create or replace function proposal_public(p_token text)
returns table (status text, body jsonb, expires_at timestamptz,
               accepted_at timestamptz, accepted_name text, accepted_plan text)
language sql security definer stable set search_path = public as $$
  select p.status, p.body, p.expires_at, p.accepted_at, p.accepted_name, p.accepted_plan
  from proposals p
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and p.token = p_token
    and p.status <> 'draft'
$$;

-- ---- first view: stamps the time once, moves sent -> viewed ----------------
create or replace function proposal_mark_viewed(p_token text)
returns void
language sql security definer volatile set search_path = public as $$
  update proposals
     set viewed_at = coalesce(viewed_at, now()),
         status = case when status = 'sent' then 'viewed' else status end,
         updated_at = now()
   where p_token ~ '^[A-Za-z0-9_-]{43}$'
     and token = p_token
     and status in ('sent','viewed')
$$;

-- ---- acceptance: every rule enforced here, under a row lock ----------------
create or replace function proposal_accept(p_token text, p_name text, p_ip text, p_plan text)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r proposals%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select * into r from proposals where token = p_token for update;
  if not found or r.status = 'draft' then return 'not_found'; end if;
  if r.status = 'accepted' then return 'already'; end if;
  if r.expires_at is null or now() > r.expires_at then return 'expired'; end if;
  if p_name is null or length(btrim(p_name)) < 2 then return 'bad_name'; end if;
  if p_plan is null or p_plan not in ('monthly','annual') then return 'bad_plan'; end if;
  update proposals
     set status = 'accepted', accepted_at = now(),
         accepted_name = left(btrim(p_name), 120), accepted_ip = left(coalesce(p_ip,''), 64),
         accepted_plan = p_plan, viewed_at = coalesce(viewed_at, now()), updated_at = now()
   where id = r.id;
  return 'accepted';
end $$;

-- ---- who may call them: the server only -----------------------------------
revoke all on function proposal_public(text)                     from public, anon, authenticated;
revoke all on function proposal_mark_viewed(text)                from public, anon, authenticated;
revoke all on function proposal_accept(text, text, text, text)   from public, anon, authenticated;
grant execute on function proposal_public(text)                   to service_role;
grant execute on function proposal_mark_viewed(text)              to service_role;
grant execute on function proposal_accept(text, text, text, text) to service_role;

-- ---- read back what you just made (CLAUDE.md: read EVERY policy) -----------
select polname, polcmd, polpermissive,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'public.proposals'::regclass;
-- Expect exactly one row: proposals_owner, cmd *, permissive, is_owner() / is_owner().

select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can
  from pg_proc p where p.proname in ('proposal_public','proposal_mark_viewed','proposal_accept');
-- Expect anon_can = false and authed_can = false on all three.
