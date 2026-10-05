-- ============================================================================
-- ONBOARDING-MIGRATION.sql
--
-- WHAT THIS DOES
--   1. Creates `onboardings`: one row per client onboarding. OWNER ONLY under
--      RLS. A rep's login and an anonymous visitor both get zero rows.
--   2. Creates `onboarding_files`: one row per uploaded file. OWNER ONLY, the
--      same single policy.
--   3. Creates the SECURITY DEFINER functions the public onboarding portal
--      uses, callable ONLY by the server (service_role). Anonymous and
--      signed-in sessions cannot call them directly.
--   4. Creates the private Storage bucket `onboarding`. It gets NO policies on
--      storage.objects, so nobody but the service role can read, list or write
--      it. Uploads go straight from the client's browser to Storage through a
--      one-off signed upload URL the server issues; downloads go through a
--      five-minute signed URL issued to an owner (api/onboarding-admin.js).
--
-- THE SHAPE IS THE PROPOSALS SHAPE (VERIFY-RLS.md §12)
--   The client has no account. What stands in for one is a 256-bit token in
--   the link's # fragment. The portal never reads these tables: it calls
--   api/onboarding-public.js, which calls the functions below with the
--   service key. onboarding_public() returns NAMED columns, so a column that
--   is not in its RETURNS TABLE cannot reach a browser by accident
--   (ENGINEERING.md §4b).
--
-- WHAT IS NOT STORED HERE, ON PURPOSE
--   Deposit paid and "access received" are NOT columns. They are the lead's
--   existing onboarding checklist items (deposit_paid, access_dns,
--   access_gbp), and onboarding_public() reads them from the lead. A second
--   stored copy of the same fact drifts the moment either is edited
--   (ENGINEERING.md §2, §5). The launch clock is derived from those dates and
--   submitted_at, never stored.
--
-- THE RULES ARE ENFORCED HERE, AT THE WRITE (CLAUDE.md)
--   onboarding_save() refuses a submitted onboarding. onboarding_submit()
--   refuses a second submit, a blank name/email/business, and files uploaded
--   without the rights box ticked. onboarding_file_begin() refuses a path
--   outside the onboarding's own folder and caps the number of files.
--   onboarding_for_proposal() refuses a proposal that is not accepted. The
--   route checks the full required-field list as well (it has the field
--   schema, src/lib/onboarding.js); these are the parts Postgres can hold.
--
-- WHEN TO RUN
--   Once, in the Supabase SQL editor, after PROPOSALS-MIGRATION.sql and after
--   the code that uses it is deployed (the Onboarding tab says "not set up"
--   until then, and nothing else breaks). Re-running is safe. Then run
--   RLS-AUDIT.sql, then VERIFY-RLS.md §14.
--
-- STORAGE PLAN LIMIT
--   The bucket allows 50 MB per file. Supabase's FREE plan also caps every
--   upload at 50 MB project-wide; anything larger needs Pro and the global
--   limit raised in Storage settings. 50 MB is what was approved.
--
-- NO force row level security: the definer functions reach the tables as
-- their owner, exactly like kb_publish and proposal_accept (ENGINEERING §4b).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---- the onboarding ---------------------------------------------------------
create table if not exists onboardings (
  id               uuid primary key default gen_random_uuid(),
  lead_id          text not null,
  proposal_id      uuid unique references proposals(id) on delete set null,
  token            text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  status           text not null default 'not_started'
                   check (status in ('not_started','in_progress','submitted','needs_info')),
  industry         text check (industry is null or industry in ('realtor','lender','service')),
  lender_kind      text check (lender_kind is null or lender_kind in ('lo','company')),
  products         text[] not null default '{}'
                   check (products <@ array['website','suite','automations']::text[]),
  package_name     text not null default '',
  answers          jsonb not null default '{}'::jsonb check (octet_length(answers::text) < 400000),
  sections         jsonb not null default '{}'::jsonb,   -- {sectionId: {done: true, at}}
  outputs          jsonb not null default '{}'::jsonb,   -- {websitePrompt, suitePrompt, snapshot, generatedAt}
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz,
  submitted_at     timestamptz,
  applied_at       timestamptz,                          -- when the CRM ticked the lead's checklist for this submit
  resume_mailed_at timestamptz                           -- throttles "email me my link"
);
create index if not exists onboardings_lead on onboardings (lead_id);
create index if not exists onboardings_status on onboardings (status, updated_at desc);
comment on table onboardings is
  'Client onboardings. OWNER ONLY under RLS. The public portal reads ONLY through onboarding_public(), which returns named columns and never `token`, `lead_id`, `outputs` or `created_by`.';

alter table onboardings enable row level security;
drop policy if exists onboardings_owner on onboardings;
create policy onboardings_owner on onboardings
  for all using (is_owner()) with check (is_owner());
revoke all on onboardings from anon;

-- ---- the files ---------------------------------------------------------------
-- The path is chosen by the SERVER ({onboardingId}/{folder}/{uuid}.{ext}); the
-- client's file name is kept only as `original_name`, for display. `pending`
-- rows are uploads that were signed but not yet checked; only `ok` rows are
-- shown anywhere. drive_* are empty until Phase 2 copies files to Drive.
create table if not exists onboarding_files (
  id             uuid primary key default gen_random_uuid(),
  onboarding_id  uuid not null references onboardings(id) on delete cascade,
  slot           text not null check (slot ~ '^[a-z_]{2,30}$'),
  path           text not null unique
                 check (path ~ '^[0-9a-f-]{36}/(logos|photos|documents|contacts)/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
  original_name  text not null default '' check (length(original_name) <= 200),
  mime           text not null default '',
  bytes          bigint check (bytes is null or bytes between 1 and 52428800),
  sensitive      boolean not null default false,
  state          text not null default 'pending' check (state in ('pending','ok')),
  created_at     timestamptz not null default now(),
  drive_file_id  text,
  drive_path     text
);
create index if not exists onboarding_files_onb on onboarding_files (onboarding_id, state);
comment on table onboarding_files is
  'Files a client uploaded during onboarding. OWNER ONLY under RLS. The bytes live in the private Storage bucket `onboarding`, reachable only by the service role.';

alter table onboarding_files enable row level security;
drop policy if exists onboarding_files_owner on onboarding_files;
create policy onboarding_files_owner on onboarding_files
  for all using (is_owner()) with check (is_owner());
revoke all on onboarding_files from anon;

-- ---- the public read: one onboarding, named columns ------------------------
-- Prefill comes from the lead and the proposal; the deposit and access dates
-- come from the lead's checklist (never a copy). The client's own name, email
-- and phone are returned because the portal prefills them for the client to
-- confirm; nothing the owner keeps private about the lead is.
create or replace function onboarding_public(p_token text)
returns table (status text, industry text, lender_kind text, products text[], package_name text,
               answers jsonb, sections jsonb, submitted_at timestamptz, last_activity_at timestamptz,
               client_name text, client_email text, client_phone text, client_company text, client_website text,
               plan jsonb, contacts jsonb, launch_days int, checklist jsonb, files jsonb)
language sql security definer stable set search_path = public as $$
  select o.status, o.industry, o.lender_kind, o.products, o.package_name,
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
           'onbSkip',      l.data->'onbSkip'),
         coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'slot', f.slot, 'name', f.original_name,
                                                       'mime', f.mime, 'bytes', f.bytes, 'at', f.created_at)
                                    order by f.created_at)
                     from onboarding_files f where f.onboarding_id = o.id and f.state = 'ok'), '[]'::jsonb)
  from onboardings o
  left join leads l on l.id = o.lead_id
  left join proposals p on p.id = o.proposal_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and o.token = p_token
$$;

-- ---- autosave: refuses once submitted ---------------------------------------
-- The route has already rebuilt `answers` from the field schema (unknown keys
-- dropped, lengths capped, SSN- and card-shaped values refused). This holds
-- the lock and the status.
create or replace function onboarding_save(p_token text, p_answers jsonb, p_sections jsonb)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r onboardings%rowtype;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select * into r from onboardings where token = p_token for update;
  if not found then return 'not_found'; end if;
  if r.status = 'submitted' then return 'locked'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or p_sections is null or jsonb_typeof(p_sections) <> 'object' then return 'bad'; end if;
  update onboardings
     set answers = p_answers, sections = p_sections,
         status = case when status = 'not_started' then 'in_progress' else status end,
         last_activity_at = now(), updated_at = now()
   where id = r.id;
  return 'saved';
end $$;

-- ---- files: begin (pending), finish (ok), drop -----------------------------
create or replace function onboarding_file_begin(p_token text, p_slot text, p_path text, p_name text, p_mime text, p_sensitive boolean)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r onboardings%rowtype; n int;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select * into r from onboardings where token = p_token for update;
  if not found then return 'not_found'; end if;
  if r.status = 'submitted' then return 'locked'; end if;
  -- the server chose the path; this proves it chose one inside THIS onboarding
  if p_path is null or left(p_path, 37) <> r.id::text || '/' then return 'bad_path'; end if;
  select count(*) into n from onboarding_files where onboarding_id = r.id;
  if n >= 300 then return 'too_many'; end if;
  insert into onboarding_files (onboarding_id, slot, path, original_name, mime, sensitive)
  values (r.id, p_slot, p_path, left(coalesce(p_name, ''), 200), left(coalesce(p_mime, ''), 100), coalesce(p_sensitive, false));
  update onboardings set last_activity_at = now(), updated_at = now() where id = r.id;
  return 'ok';
end $$;

create or replace function onboarding_file_finish(p_token text, p_path text, p_bytes bigint)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare v_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select o.id into v_id from onboardings o where o.token = p_token;
  if v_id is null then return 'not_found'; end if;
  update onboarding_files set state = 'ok', bytes = p_bytes
   where onboarding_id = v_id and path = p_path and state = 'pending';
  if not found then return 'not_found'; end if;
  return 'ok';
end $$;

-- returns the path to delete from Storage, or null when there is nothing to
-- delete (unknown file, someone else's file, or a submitted onboarding)
create or replace function onboarding_file_drop(p_token text, p_file_id uuid)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r onboardings%rowtype; p text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select * into r from onboardings where token = p_token for update;
  if not found or r.status = 'submitted' then return null; end if;
  delete from onboarding_files where id = p_file_id and onboarding_id = r.id returning path into p;
  return p;
end $$;

-- Uploads that were signed and never finished: rows older than three hours
-- are removed here and their paths returned, so the route can delete the
-- objects. Called by the route's occasional sweep.
create or replace function onboarding_sweep_pending()
returns setof text
language sql security definer volatile set search_path = public as $$
  delete from onboarding_files
   where state = 'pending' and created_at < now() - interval '3 hours'
  returning path
$$;

-- ---- "email me my link": at most once every ten minutes --------------------
-- Returns the onboarding id for the server's client-mail lookup, or null.
-- The recipient is NOT here: sendClientMail() reads it from the lead.
create or replace function onboarding_mark_mailed(p_token text)
returns uuid
language sql security definer volatile set search_path = public as $$
  update onboardings
     set resume_mailed_at = now(), updated_at = now()
   where p_token ~ '^[A-Za-z0-9_-]{43}$'
     and token = p_token
     and status <> 'submitted'
     and (resume_mailed_at is null or resume_mailed_at < now() - interval '10 minutes')
  returning id
$$;

-- ---- submit -----------------------------------------------------------------
create or replace function onboarding_submit(p_token text, p_outputs jsonb)
returns text
language plpgsql security definer volatile set search_path = public as $$
declare r onboardings%rowtype; has_files boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return 'not_found'; end if;
  select * into r from onboardings where token = p_token for update;
  if not found then return 'not_found'; end if;
  if r.status = 'submitted' then return 'already'; end if;
  if length(btrim(coalesce(r.answers->>'biz.contact_name', ''))) < 2
     or coalesce(r.answers->>'biz.email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     or length(btrim(coalesce(r.answers->>'biz.name', ''))) < 2 then return 'incomplete'; end if;
  select exists (select 1 from onboarding_files where onboarding_id = r.id and state = 'ok') into has_files;
  if has_files and coalesce(r.answers->>'fl.rights', '') <> 'true' then return 'rights'; end if;
  update onboardings
     set status = 'submitted', submitted_at = now(), applied_at = null,
         outputs = coalesce(p_outputs, '{}'::jsonb),
         last_activity_at = now(), updated_at = now()
   where id = r.id;
  return 'submitted';
end $$;

-- ---- created at acceptance --------------------------------------------------
-- Create-or-return the onboarding for an ACCEPTED proposal. Idempotent: the
-- unique proposal_id means a second call (a retry, a return visit to the
-- "You're in" screen) returns the same onboarding. Products are computed by
-- the route from the offer's productMap and checked here against the
-- vocabulary by the column's own constraint.
create or replace function onboarding_for_proposal(p_token text, p_products text[], p_package text)
returns table (token text, client jsonb)
language plpgsql security definer volatile set search_path = public as $$
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

-- ---- who may call them: the server only -------------------------------------
revoke all on function onboarding_public(text)                                  from public, anon, authenticated;
revoke all on function onboarding_save(text, jsonb, jsonb)                      from public, anon, authenticated;
revoke all on function onboarding_file_begin(text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function onboarding_file_finish(text, text, bigint)               from public, anon, authenticated;
revoke all on function onboarding_file_drop(text, uuid)                         from public, anon, authenticated;
revoke all on function onboarding_sweep_pending()                               from public, anon, authenticated;
revoke all on function onboarding_mark_mailed(text)                             from public, anon, authenticated;
revoke all on function onboarding_submit(text, jsonb)                           from public, anon, authenticated;
revoke all on function onboarding_for_proposal(text, text[], text)              from public, anon, authenticated;
grant execute on function onboarding_public(text)                                  to service_role;
grant execute on function onboarding_save(text, jsonb, jsonb)                      to service_role;
grant execute on function onboarding_file_begin(text, text, text, text, text, boolean) to service_role;
grant execute on function onboarding_file_finish(text, text, bigint)               to service_role;
grant execute on function onboarding_file_drop(text, uuid)                         to service_role;
grant execute on function onboarding_sweep_pending()                               to service_role;
grant execute on function onboarding_mark_mailed(text)                             to service_role;
grant execute on function onboarding_submit(text, jsonb)                           to service_role;
grant execute on function onboarding_for_proposal(text, text[], text)              to service_role;

-- ---- the private bucket -------------------------------------------------------
-- public = false, 50 MB, and only the canonical types the portal sends (the
-- browser re-labels each file with the type for its extension before upload,
-- and the server checks the file's first bytes afterwards). NO policies are
-- created on storage.objects: without one, anon and authenticated cannot
-- touch this bucket at all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding', 'onboarding', false, 52428800, array[
  'image/jpeg','image/png','image/heic','image/webp','image/svg+xml','application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4','video/quicktime'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---- read back what you just made (CLAUDE.md: read EVERY policy) -------------
select c.relname, p.polname, p.polcmd, p.polpermissive,
       pg_get_expr(p.polqual, p.polrelid)      as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname in ('onboardings', 'onboarding_files') order by 1, 2;
-- Expect exactly two rows: onboardings_owner and onboarding_files_owner,
-- cmd *, permissive, is_owner() / is_owner().

select p.proname,
       has_function_privilege('anon', p.oid, 'execute')          as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can
  from pg_proc p where p.proname like 'onboarding\_%' order by 1;
-- Expect nine rows, anon_can = false and authed_can = false on every one.

select id, public, file_size_limit from storage.buckets where id = 'onboarding';
-- Expect: onboarding, false, 52428800.

select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'storage.objects'::regclass;
-- Expect: NO row that mentions 'onboarding', and no row whose expression is
-- `true` or omits bucket_id (that would open EVERY bucket, this one included).
