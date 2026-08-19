-- ============================================================================
-- ProyTech CRM — Playbook (internal knowledge base)
-- Run this ONCE in Supabase → SQL Editor, AFTER MIGRATION.sql. It is
-- idempotent: running it again changes nothing.
--
-- RUN THIS AND WORK THROUGH VERIFY-RLS.md §6 BEFORE ANY UI IS BUILT.
-- The boundary is the feature. Prove it against real logins first; if a rep
-- can see a draft, stop and say so.
--
-- What it does:
--   1. kb_notes       — the owner's workspace. Owner-only, exactly like meeting_logs.
--   2. kb_published   — the rep-readable surface. Named columns, read-only to browsers.
--   3. kb_preview / kb_publish / kb_unpublish — the ONLY writer of kb_published.
--   4. kb_ai_context() — what JARVIS is allowed to be given. Published rows only.
--
-- WHY TWO TABLES
--
--   Postgres RLS is ROW-level, and an owner and a rep are the SAME Postgres
--   role (`authenticated`) — Supabase tells them apart only inside policy
--   predicates. So column-level GRANTs cannot separate them.
--
--   That rules out one table with a status column. A rep allowed to read a
--   published ROW is allowed to read every COLUMN of it, including the owner's
--   working text — which may have been edited well past what was approved.
--   That is the same failure as dealValue riding inside a lead's jsonb
--   (ROLES.md → The honest limits): the row is legitimately readable, so
--   hiding a field inside it is a UI decision, not a database one.
--
--   So the draft text is not in the table reps can read. There is no predicate
--   to get wrong, because there is nothing to filter.
--
-- WHY THIS IS NOT meeting_logs
--
--   meeting_logs is owner-only forever and MEETING-MIGRATION.sql explains why:
--   its value depends on being unfiltered. Nothing here changes that table or
--   that policy. This module is the opposite shape — it exists in order to be
--   published to reps, deliberately, one note at a time.
-- ============================================================================


-- ---------------------------------------------------------- 1. the workspace
-- jsonb for the same reasons meeting_logs uses it: only the owner ever reads
-- this table, the shape will churn, and one row per note means a write never
-- rewrites the whole list (MIGRATION.sql §1b — the lost-update reasoning).
--
-- data holds: title, category, tags[], body (the working text), sourceLogId.
-- THERE IS NO TRANSCRIPT COLUMN, HERE OR IN kb_published. A note may be
-- STARTED from a meeting recording, but what saves is the text the owner wrote
-- and edited in the textarea. The transcript is read once by api/meeting-log.js
-- and never stored — so pay talk and pricing are handled by the text not
-- existing, rather than by scrubbing it. Scrubbing is a filter and filters are
-- wrong sometimes; not having it is right every time.
create table if not exists kb_notes (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  status     text  not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- status is a real column rather than a jsonb key because kb_publish() and the
-- "published version is behind" indicator both read it, and a check constraint
-- keeps it honest. Nothing sets it to 'published' except kb_publish().
alter table kb_notes drop constraint if exists kb_notes_status_chk;
alter table kb_notes add  constraint kb_notes_status_chk
  check (status in ('draft', 'published'));

create index if not exists kb_notes_updated_idx on kb_notes (updated_at desc);

comment on table kb_notes is
  'Owner-only Playbook drafts. Reps get zero rows, by the same policy shape that gives them zero meeting_logs rows. Never contains a raw transcript.';


-- ------------------------------------------------------- 2. the rep surface
-- NAMED COLUMNS, NOT JSONB. This is the most important decision in the file.
--
-- A jsonb blob hides what is in it. Reading this table definition tells you the
-- COMPLETE list of everything a rep can see from this module — six fields, and
-- you can name all of them. A blob would make the answer to "what can a rep
-- see" be "whatever anyone ever put in there", which is precisely how dealValue
-- became an honest-limits entry instead of a boundary. A field that is not a
-- column here cannot be published by accident.
--
-- on delete cascade: deleting the note retracts the published copy. There is no
-- state where reps can read a note the owner no longer has.
create table if not exists kb_published (
  id           text primary key references kb_notes(id) on delete cascade,
  title        text        not null,
  category     text        not null default '',
  tags         text[]      not null default '{}',
  body         text        not null,
  published_at timestamptz not null default now(),
  published_by uuid        references auth.users(id)
);

-- A blunt tripwire against a transcript ever landing here: real transcripts in
-- this system run 20k-120k characters. This is NOT the guarantee — the
-- guarantee is that no transcript column exists and that kb_publish() copies
-- exactly one field. This is the backstop that fires if that reasoning is ever
-- quietly broken by a later change.
alter table kb_published drop constraint if exists kb_published_body_len;
alter table kb_published add  constraint kb_published_body_len
  check (char_length(body) <= 8000);

create index if not exists kb_published_cat_idx on kb_published (category);

-- Reps search this. Two-arg to_tsvector with a literal regconfig is IMMUTABLE,
-- which the one-arg form is not — the one-arg form depends on a session setting
-- and cannot be indexed.
create index if not exists kb_published_fts_idx on kb_published
  using gin (to_tsvector('english'::regconfig,
                         coalesce(title, '') || ' ' || coalesce(body, '')));

comment on table kb_published is
  'The complete set of everything a sales rep can see from the Playbook. Six named columns, deliberately not a jsonb blob. Written ONLY by kb_publish(); no browser session can write it directly.';


-- ------------------------------------------------------------------ 3. RLS

-- kb_notes: character for character the meeting_logs_owner policy. Same
-- helpers, same first-run behaviour (no_users() short-circuits a fresh
-- install), same deactivation behaviour (crm_active()). A rep gets zero rows
-- for a draft via the same policy shape that gives them zero meeting logs
-- today — not a similar one.
alter table kb_notes enable row level security;

drop policy if exists kb_notes_owner on kb_notes;
create policy kb_notes_owner on kb_notes for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

-- kb_published: read by any listed, active person. That is the whole point of
-- the table, and it is the first deliberate owner->rep publishing channel in
-- this database. crm_listed() is the same predicate app_settings uses, so a
-- stray signed-in account with no crm_users row still gets nothing.
alter table kb_published enable row level security;

drop policy if exists kb_published_read on kb_published;
create policy kb_published_read on kb_published for select
  using (no_users() or crm_listed());

-- Note what is deliberately absent: THERE IS NO INSERT, UPDATE OR DELETE
-- POLICY. Combined with the revoke below, no browser session — the owner's
-- included — can write this table directly. The only writer is kb_publish().
--
-- That is what makes the guarantee structural rather than conventional.
-- "Could a draft end up in the rep-readable table?" is answered by reading one
-- short function, not by auditing every call site in a 450k-character App.jsx.
--
-- service_role is left alone on purpose: it bypasses RLS by design and is the
-- only way to repair this table from a server or the dashboard.
--
-- And to answer the question this raises: kb_publish() can still write, because
-- a security definer function runs as the function's OWNER (the role that ran
-- this migration), which owns kb_published and therefore bypasses both the
-- revoke above and RLS. Do not add `force row level security` to this table or
-- publishing stops working — the absent INSERT policy is intentional, not an
-- oversight to be repaired.
revoke insert, update, delete on kb_published from public, anon, authenticated;
grant  select                 on kb_published to   authenticated;


-- ----------------------------------------------- 4. publish, and the preview
-- PREVIEW AND PUBLISH ARE THE SAME FUNCTION.
--
-- ENGINEERING.md §2 applied to a security boundary: two screens must never
-- disagree, and "what a rep WILL see" and "what a rep DOES see" are two
-- screens. kb_publish() inserts the rows kb_preview() returns, so they cannot
-- drift. The preview screen must render THIS function's result, never a
-- client-side re-render of the editor's state — that would be a mockup of the
-- truth, and mockups drift.
--
-- security definer BYPASSES RLS, so the owner check lives in the WHERE clause
-- rather than being left to the policy. Same reasoning as crm_whoami().
--
-- `set search_path` is on every function below: a security definer function
-- without one can be pointed at an attacker's schema by a caller who controls
-- search_path. The existing functions in MIGRATION.sql predate this habit;
-- new ones should have it, and this module in particular should.

create or replace function kb_preview(p_id text)
returns table (title text, category text, tags text[], body text)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select
    coalesce(nullif(trim(n.data->>'title'), ''), 'Untitled'),
    coalesce(n.data->>'category', ''),
    coalesce((select array_agg(t) from jsonb_array_elements_text(
               coalesce(n.data->'tags', '[]'::jsonb)) t), '{}'::text[]),
    coalesce(n.data->>'body', '')
  from kb_notes n
  where n.id = p_id
    and (no_users() or (crm_active() and is_owner()));
$$;

create or replace function kb_publish(p_id text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  if not (no_users() or (crm_active() and is_owner())) then
    raise exception 'only an owner can publish';
  end if;

  insert into kb_published (id, title, category, tags, body, published_at, published_by)
  select p_id, p.title, p.category, p.tags, p.body, now(), auth.uid()
    from kb_preview(p_id) p              -- <-- the preview IS the payload
  on conflict (id) do update set
    title        = excluded.title,
    category     = excluded.category,
    tags         = excluded.tags,
    body         = excluded.body,
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no such note: %', p_id;   -- never fail silently
  end if;

  -- Both stamps get the same transaction now(), so a note reads as "in sync"
  -- immediately after publishing. The editor's drift indicator is
  -- kb_notes.updated_at > kb_published.published_at — do not skip it. An
  -- invisible drift here is the two-screens-disagree bug wearing a hat.
  update kb_notes set status = 'published', updated_at = now() where id = p_id;
end $$;

create or replace function kb_unpublish(p_id text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not (no_users() or (crm_active() and is_owner())) then
    raise exception 'only an owner can unpublish';
  end if;
  delete from kb_published where id = p_id;
  update kb_notes set status = 'draft', updated_at = now() where id = p_id;
end $$;

revoke all on function kb_preview(text)   from public, anon;
revoke all on function kb_publish(text)   from public, anon;
revoke all on function kb_unpublish(text) from public, anon;
grant execute on function kb_preview(text)   to authenticated;
grant execute on function kb_publish(text)   to authenticated;
grant execute on function kb_unpublish(text) to authenticated;


-- ------------------------------------------------------------- 5. JARVIS
-- Read this function and note what it does NOT contain: no argument, no
-- branch, and no mention of kb_notes. An OWNER calling it gets published rows
-- only, exactly like a rep. There is no parameter to pass to widen it and no
-- draft to leak, because the draft lives in a table this function does not name.
--
-- The JARVIS payload's `kb` block is built solely from this. It is not merged
-- into `index` or `detail`.
--
-- The honest limits of that, stated plainly:
--
--   For a REP it is absolute. The payload is assembled in the browser
--   (src/lib/jarvis.js is pure; the endpoint receives what the browser sends —
--   this is already how money redaction works). A rep's browser cannot obtain
--   draft text at all, so draft text does not exist anywhere in a rep's
--   process and cannot reach api/jarvis.js, Anthropic, or the answer. None of
--   that depends on the prompt or on App.jsx behaving.
--
--   For the OWNER the last link is app-level, and no policy can fix it:
--   Postgres cannot stop an owner's own browser from sending the owner's own
--   drafts to the owner's own assistant, because the owner is authorised to
--   read that text and "displaying it" and "sending it" are indistinguishable
--   to the database. What enforces it is a test asserting on what reaches the
--   NETWORK. That belongs in ROLES.md → The honest limits, next to dealValue.
--
-- The prompt gets NO instruction about drafts. There is nothing to instruct it
-- about, and a rule telling the model to ignore drafts would imply drafts are
-- sometimes present — the wrong mental model and the wrong control.
create or replace function kb_ai_context()
returns table (id text, title text, category text, tags text[], body text)
language sql security definer stable
set search_path = public, pg_temp
as $$
  select p.id, p.title, p.category, p.tags, p.body
    from kb_published p
   where crm_active() and crm_listed();
$$;

revoke all on function kb_ai_context() from public, anon;
grant execute on function kb_ai_context() to authenticated;

comment on function kb_ai_context() is
  'The only source of Playbook text for the AI assistant. Reads kb_published and nothing else. Takes no argument, so there is nothing to widen.';


-- ---------------------------------------------------------------- verify
-- Full procedure with real logins is VERIFY-RLS.md §6. Quick structural check:
--
--   select tablename, policyname, cmd from pg_policies
--    where tablename in ('kb_notes','kb_published') order by tablename, policyname;
--   -- expect exactly two rows: kb_notes_owner (ALL), kb_published_read (SELECT)
--
--   select relname, relrowsecurity from pg_class
--    where relname in ('kb_notes','kb_published');
--   -- expect both true
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'kb_published' and grantee in ('anon','authenticated');
--   -- expect authenticated/SELECT only. Any INSERT, UPDATE or DELETE here is a bug.
