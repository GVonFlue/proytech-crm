-- ============================================================================
-- REVIEW-MIGRATION.sql  —  the client portal, step B-2: site review and markup
--
-- WHAT THIS DOES
--   A client opens their preview site inside the portal, drops pins with notes,
--   submits a round (Terms 3.4: the rounds the proposal states, else two), and
--   approves the site with their typed name. The owner works the notes from
--   the CRM and copies a revision prompt.
--
--   1. Four tables, all SERVER-WRITE-ONLY and OWNER-READ (the client_emails
--      pattern, RLS-AUDIT 2f): review_sites (the preview URL per client),
--      review_rounds, review_notes, site_approvals. A browser writes none of
--      them directly; a client has no table access at all.
--   2. What a client's browser may call, each starting from portal_lead() and
--      taking NO lead id, so there is nothing to aim at another client:
--        portal_review()          their own review, named fields only (no
--                                 storage path ever leaves)
--        portal_note_save(jsonb)  add a note to THEIR open round, or edit the
--                                 comment of one of its drafts
--   3. The server's door (service_role only), each taking the caller's login
--      id from a verified session and finding the lead itself
--      (review_client): submit a round, ask for a quoted change round,
--      approve (with the IP only the server can see), delete a draft, and
--      attach a screenshot or image the server named and checked.
--      review_open_round(lead) is the owner's "Send for review".
--   4. review_summary(): the dates the lifecycle reads (round 1 feedback,
--      revisions done, approved), for an OWNER's CRM only.
--   5. Locks in Postgres, not in the browser:
--        - an approval is permanent (no update, no delete)
--        - a note's client fields freeze when its round is submitted; after
--          that only its status, reason and done date change
--        - one open round per client at a time
--   6. A private bucket, `review`: images only, 10 MB, no policy on
--      storage.objects, so only the service key can touch it.
--
-- WHEN TO RUN
--   BEFORE the code deploys (PR "Client portal B-2"). The deployed code never
--   calls any of this, so running it first breaks nothing. Re-running is
--   safe. Then RLS-AUDIT.sql, then VERIFY-RLS.md §19 with a real client login.
--
-- Requires: PORTAL-MIGRATION.sql (portal_lead, client_users), PROPOSALS-*.
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

-- ---- 1. the tables -----------------------------------------------------------
create table if not exists review_sites (
  lead_id      text primary key,
  preview_url  text not null check (length(preview_url) <= 500 and preview_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]<>"]*)?$'),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
comment on table review_sites is 'The preview URL a client reviews in the portal. OWNER READ, SERVER WRITE (api/review-admin.js). The portal frames it only when its host matches Settings → Site review.';

create table if not exists review_rounds (
  id            uuid primary key default gen_random_uuid(),
  lead_id       text not null,
  number        integer not null check (number between 1 and 50),
  extra         boolean not null default false,
  opened_by     text not null default 'owner' check (opened_by in ('owner', 'client')),
  opened_at     timestamptz not null default now(),
  submitted_at  timestamptz,
  submitted_by  uuid,
  unique (lead_id, number)
);
create unique index if not exists review_rounds_one_open on review_rounds (lead_id) where submitted_at is null;
comment on table review_rounds is 'Review rounds (Terms 3.4). extra = beyond the included rounds: a quoted change request. OWNER READ, SERVER WRITE.';

create table if not exists review_notes (
  id           uuid primary key default gen_random_uuid(),
  lead_id      text not null,
  round_id     uuid not null references review_rounds(id) on delete cascade,
  kind         text not null default 'site' check (kind in ('site', 'suite')),
  author       uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  path         text not null default '' check (length(path) <= 500),
  selector     text not null default '' check (length(selector) <= 600),
  snippet      text not null default '' check (length(snippet) <= 200),
  x_pct        numeric check (x_pct between 0 and 100),
  y_pct        numeric check (y_pct between 0 and 100),
  vw           integer check (vw between 0 and 10000),
  vh           integer check (vh between 0 and 10000),
  device       text not null default '' check (device in ('', 'desktop', 'tablet', 'phone')),
  comment      text not null check (length(btrim(comment)) between 1 and 2000),
  shot_path    text check (length(shot_path) <= 300),
  attach_path  text check (length(attach_path) <= 300),
  status       text not null default 'open' check (status in ('open', 'done', 'wont_do')),
  reason       text not null default '' check (length(reason) <= 500),
  done_at      timestamptz,
  check (status <> 'wont_do' or length(btrim(reason)) > 0)
);
create index if not exists review_notes_round on review_notes (round_id);
create index if not exists review_notes_lead on review_notes (lead_id);
comment on table review_notes is 'Pin-and-note markup. The client''s fields freeze when the round is submitted (review_notes_lock). OWNER READ, SERVER WRITE.';

create table if not exists site_approvals (
  lead_id         text primary key,
  client_user_id  uuid,
  typed_name      text not null check (length(btrim(typed_name)) between 2 and 120),
  approved_at     timestamptz not null default now(),
  ip              text not null default '' check (length(ip) <= 64),
  user_agent      text not null default '' check (length(user_agent) <= 300),
  preview_url     text not null default '',
  round_number    integer
);
comment on table site_approvals is '"Approve my site": typed name, time, IP. PERMANENT (site_approvals_lock). OWNER READ, SERVER WRITE.';

-- ---- RLS: owner read, nothing else -------------------------------------------
do $$ declare t text; p record; begin
  foreach t in array array['review_sites', 'review_rounds', 'review_notes', 'site_approvals'] loop
    execute format('alter table %I enable row level security', t);
    for p in select polname from pg_policy where polrelid = ('public.' || t)::regclass loop
      execute format('drop policy %I on %I', p.polname, t);
    end loop;
    execute format('create policy %I on %I for select using (crm_listed() and is_owner())', t || '_owner_read', t);
    execute format('revoke all on %I from anon', t);
    execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
  end loop;
end $$;

-- ---- 5. the locks ------------------------------------------------------------
create or replace function site_approvals_lock() returns trigger language plpgsql as $$
begin
  raise exception 'A site approval is permanent: it records who approved, when and from where.';
end $$;
drop trigger if exists site_approvals_lock on site_approvals;
create trigger site_approvals_lock before update or delete on site_approvals
  for each row execute function site_approvals_lock();

-- Once a round is submitted, what the CLIENT wrote is the record: only the
-- owner's status, reason and done date may change, and the note cannot go.
create or replace function review_notes_lock() returns trigger language plpgsql as $$
declare sub timestamptz;
begin
  select submitted_at into sub from review_rounds where id = old.round_id;
  if sub is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'DELETE' then raise exception 'A submitted note cannot be deleted; mark it won''t do with a reason.'; end if;
  if (new.lead_id, new.round_id, new.kind, new.author, new.path, new.selector, new.snippet, new.x_pct, new.y_pct, new.vw, new.vh, new.device, new.comment, new.shot_path, new.attach_path, new.created_at)
     is distinct from
     (old.lead_id, old.round_id, old.kind, old.author, old.path, old.selector, old.snippet, old.x_pct, old.y_pct, old.vw, old.vh, old.device, old.comment, old.shot_path, old.attach_path, old.created_at) then
    raise exception 'A submitted note is the client''s record: only its status, reason and done date change.';
  end if;
  return new;
end $$;
drop trigger if exists review_notes_lock on review_notes;
create trigger review_notes_lock before update or delete on review_notes
  for each row execute function review_notes_lock();

-- ---- internal helpers (service_role only) ------------------------------------
-- The client a VERIFIED login belongs to: portal_lead()'s rule, for a login id
-- the server took from a session it checked. Null for anyone else.
create or replace function review_client(p_uid uuid) returns text
language sql security definer stable set search_path = public as $$
  select c.lead_id from client_users c
   where c.id = p_uid and c.active
     and not exists (select 1 from crm_users u where u.id = p_uid);
$$;

-- Terms 3.4: the revision rounds the accepted proposal states, else two.
create or replace function review_included(p_lead text) returns integer
language sql security definer stable set search_path = public as $$
  select coalesce((
    select case when jsonb_typeof(p.body->'quote'->'revisionRounds') = 'number'
                 and (p.body->'quote'->>'revisionRounds')::numeric between 0 and 10
                then floor((p.body->'quote'->>'revisionRounds')::numeric)::int end
      from proposals p where p.lead_id = p_lead and p.status = 'accepted'
     order by p.accepted_at desc nulls last limit 1), 2);
$$;

-- The three dates the lifecycle reads. revised_at: the latest SUBMITTED round
-- has notes and none is still open; the last one closed is the date.
create or replace function review_dates(p_lead text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'feedback_at', (select r.submitted_at from review_rounds r where r.lead_id = p_lead and r.number = 1),
    'revised_at', (select case when count(*) > 0 and bool_and(n.status <> 'open') then max(n.done_at) end
                     from review_notes n
                    where n.round_id = (select r.id from review_rounds r where r.lead_id = p_lead and r.submitted_at is not null order by r.number desc limit 1)),
    'approved_at', (select a.approved_at from site_approvals a where a.lead_id = p_lead));
$$;

-- What a client sees of their review. Named fields only: no storage path, no
-- author id, no IP. Shared by portal_review() and the server.
create or replace function review_state(p_lead text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare s jsonb;
begin
  if p_lead is null then return null; end if;
  select data into s from app_settings where id = 'main';
  return jsonb_build_object(
    'preview_url', (select preview_url from review_sites where lead_id = p_lead),
    'hosts', case when jsonb_typeof(s->'review'->'hosts') = 'array' then s->'review'->'hosts' end,
    'included', review_included(p_lead),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'extra', r.extra,
                 'opened_at', r.opened_at, 'submitted_at', r.submitted_at) order by r.number)
               from review_rounds r where r.lead_id = p_lead), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'round_id', n.round_id, 'kind', n.kind,
                 'path', n.path, 'selector', n.selector, 'snippet', n.snippet, 'x_pct', n.x_pct, 'y_pct', n.y_pct,
                 'vw', n.vw, 'vh', n.vh, 'device', n.device, 'comment', n.comment,
                 'has_shot', n.shot_path is not null, 'has_attach', n.attach_path is not null,
                 'status', n.status, 'reason', n.reason, 'done_at', n.done_at, 'created_at', n.created_at)
                 order by n.created_at)
               from review_notes n where n.lead_id = p_lead), '[]'::jsonb),
    'approval', (select jsonb_build_object('typed_name', a.typed_name, 'approved_at', a.approved_at, 'round_number', a.round_number)
                   from site_approvals a where a.lead_id = p_lead),
    'dates', review_dates(p_lead));
end $$;

-- ---- 2. what a client's browser may call -------------------------------------
create or replace function portal_review() returns jsonb
language sql security definer stable set search_path = public as $$
  select review_state(portal_lead());
$$;

-- Add a note to the caller's OPEN round, or change the comment of one of its
-- drafts. The pin itself (page, element, position) is fixed once dropped: to
-- move it, delete the note and drop a new one.
create or replace function portal_note_save(p_note jsonb) returns uuid
language plpgsql security definer volatile set search_path = public as $$
declare lid text := portal_lead(); rid uuid; nid uuid; k text; c text; pth text; num numeric;
  pick_num numeric[]; i int;
begin
  if lid is null then raise exception 'not_a_client'; end if;
  if jsonb_typeof(p_note) is distinct from 'object' then raise exception 'bad_note'; end if;
  if exists (select 1 from site_approvals where lead_id = lid) then raise exception 'approved'; end if;
  select id into rid from review_rounds where lead_id = lid and submitted_at is null;
  if rid is null then raise exception 'no_open_round'; end if;
  c := btrim(coalesce(p_note->>'comment', ''));
  if length(c) < 1 or length(c) > 2000 then raise exception 'comment_length'; end if;

  if coalesce(p_note->>'id', '') <> '' then
    if (p_note->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'not_editable'; end if;
    update review_notes set comment = c, updated_at = now()
     where id = (p_note->>'id')::uuid and lead_id = lid and round_id = rid
    returning id into nid;
    if nid is null then raise exception 'not_editable'; end if;
    return nid;
  end if;

  k := coalesce(nullif(p_note->>'kind', ''), 'site');
  if k not in ('site', 'suite') then raise exception 'bad_kind'; end if;
  pth := left(coalesce(p_note->>'path', ''), 500);
  if k = 'site' and pth !~ '^/' then raise exception 'bad_path'; end if;
  if (select count(*) from review_notes where round_id = rid) >= 200 then raise exception 'too_many'; end if;
  insert into review_notes (lead_id, round_id, kind, author, path, selector, snippet, x_pct, y_pct, vw, vh, device, comment)
  values (lid, rid, k, auth.uid(),
          case when k = 'site' then pth else '' end,
          case when k = 'site' then left(coalesce(p_note->>'selector', ''), 600) else '' end,
          case when k = 'site' then left(regexp_replace(coalesce(p_note->>'snippet', ''), '\s+', ' ', 'g'), 200) else '' end,
          case when k = 'site' and jsonb_typeof(p_note->'x_pct') = 'number' then least(100, greatest(0, (p_note->>'x_pct')::numeric)) end,
          case when k = 'site' and jsonb_typeof(p_note->'y_pct') = 'number' then least(100, greatest(0, (p_note->>'y_pct')::numeric)) end,
          case when k = 'site' and jsonb_typeof(p_note->'vw') = 'number' then least(10000, greatest(0, floor((p_note->>'vw')::numeric)))::int end,
          case when k = 'site' and jsonb_typeof(p_note->'vh') = 'number' then least(10000, greatest(0, floor((p_note->>'vh')::numeric)))::int end,
          case when k = 'site' and coalesce(p_note->>'device', '') in ('desktop', 'tablet', 'phone') then p_note->>'device' else '' end,
          c)
  returning id into nid;
  return nid;
end $$;

-- ---- 3. the server's door (service_role only) --------------------------------
-- Submit the caller's open round. Refuses an empty one: a client with nothing
-- to change approves instead.
create or replace function review_submit(p_uid uuid) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare lid text := review_client(p_uid); r review_rounds%rowtype; n int;
begin
  if lid is null then return jsonb_build_object('error', 'not_a_client'); end if;
  select * into r from review_rounds where lead_id = lid and submitted_at is null;
  if not found then return jsonb_build_object('error', 'no_open_round'); end if;
  select count(*) into n from review_notes where round_id = r.id;
  if n = 0 then return jsonb_build_object('error', 'empty'); end if;
  update review_rounds set submitted_at = now(), submitted_by = p_uid where id = r.id;
  return jsonb_build_object('lead_id', lid, 'number', r.number, 'extra', r.extra, 'notes', n, 'included', review_included(lid));
end $$;

-- After the included rounds: the client asks for a change round, which is
-- quoted (Terms 3.4). Only when no round is open and the site is not approved.
create or replace function review_request_extra(p_uid uuid) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare lid text := review_client(p_uid); n int; inc int;
begin
  if lid is null then return jsonb_build_object('error', 'not_a_client'); end if;
  if exists (select 1 from site_approvals where lead_id = lid) then return jsonb_build_object('error', 'approved'); end if;
  if exists (select 1 from review_rounds where lead_id = lid and submitted_at is null) then return jsonb_build_object('error', 'open'); end if;
  inc := review_included(lid);
  select count(*) into n from review_rounds where lead_id = lid;
  if n < inc then return jsonb_build_object('error', 'not_yet'); end if;
  insert into review_rounds (lead_id, number, extra, opened_by) values (lid, n + 1, true, 'client');
  return jsonb_build_object('lead_id', lid, 'number', n + 1, 'extra', true, 'included', inc);
end $$;

-- The owner's "Send for review": the next round. Beyond the included rounds
-- it is marked extra (quoted).
create or replace function review_open_round(p_lead text) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare n int; inc int;
begin
  if not exists (select 1 from leads where id = p_lead) then return jsonb_build_object('error', 'no_lead'); end if;
  if not exists (select 1 from review_sites where lead_id = p_lead) then return jsonb_build_object('error', 'no_preview'); end if;
  if exists (select 1 from site_approvals where lead_id = p_lead) then return jsonb_build_object('error', 'approved'); end if;
  if exists (select 1 from review_rounds where lead_id = p_lead and submitted_at is null) then return jsonb_build_object('error', 'open'); end if;
  inc := review_included(p_lead);
  select count(*) into n from review_rounds where lead_id = p_lead;
  insert into review_rounds (lead_id, number, extra, opened_by) values (p_lead, n + 1, n + 1 > inc, 'owner');
  return jsonb_build_object('lead_id', p_lead, 'number', n + 1, 'extra', n + 1 > inc, 'included', inc);
end $$;

-- "Approve my site". The IP and browser come from the server, which saw the
-- request; the browser cannot call this. Refused while draft notes are
-- waiting (submit or delete them first) and once already approved. An open
-- round with no notes is closed by the approval.
create or replace function review_approve(p_uid uuid, p_name text, p_ip text, p_ua text) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare lid text := review_client(p_uid); nm text := btrim(coalesce(p_name, '')); url text; rnum int; open_id uuid; at timestamptz;
begin
  if lid is null then return jsonb_build_object('error', 'not_a_client'); end if;
  if length(nm) < 2 or length(nm) > 120 then return jsonb_build_object('error', 'name'); end if;
  select preview_url into url from review_sites where lead_id = lid;
  if url is null then return jsonb_build_object('error', 'no_preview'); end if;
  if exists (select 1 from site_approvals where lead_id = lid) then return jsonb_build_object('error', 'already'); end if;
  select id into open_id from review_rounds where lead_id = lid and submitted_at is null;
  if open_id is not null and exists (select 1 from review_notes where round_id = open_id) then return jsonb_build_object('error', 'unsubmitted'); end if;
  if open_id is not null then delete from review_rounds where id = open_id; end if;
  select max(number) into rnum from review_rounds where lead_id = lid;
  insert into site_approvals (lead_id, client_user_id, typed_name, ip, user_agent, preview_url, round_number)
  values (lid, p_uid, nm, left(coalesce(p_ip, ''), 64), left(coalesce(p_ua, ''), 300), url, rnum)
  returning approved_at into at;
  return jsonb_build_object('lead_id', lid, 'approved_at', at, 'typed_name', nm);
end $$;

-- Delete one of the caller's DRAFT notes; returns its files for the server to
-- remove from storage.
create or replace function review_note_delete(p_uid uuid, p_id uuid) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare lid text := review_client(p_uid); out jsonb;
begin
  if lid is null then return null; end if;
  delete from review_notes n using review_rounds r
   where n.id = p_id and n.lead_id = lid and r.id = n.round_id and r.submitted_at is null
  returning jsonb_build_object('shot_path', n.shot_path, 'attach_path', n.attach_path) into out;
  return out;
end $$;

-- May the caller attach a file to this note? Their own DRAFT note: returns
-- the lead id the server builds the path from. Null otherwise.
create or replace function review_upload_target(p_uid uuid, p_note uuid) returns text
language sql security definer stable set search_path = public as $$
  select n.lead_id from review_notes n join review_rounds r on r.id = n.round_id
   where n.id = p_note and n.lead_id = review_client(p_uid) and r.submitted_at is null;
$$;

-- Record a file the server put at a path it chose and checked by its bytes.
-- The path must be the one the server names for this note; returns the file
-- it replaced (for the server to remove), or an error.
create or replace function review_set_file(p_uid uuid, p_note uuid, p_kind text, p_path text) returns jsonb
language plpgsql security definer volatile set search_path = public as $$
declare lid text := review_upload_target(p_uid, p_note); old text;
begin
  if lid is null then return jsonb_build_object('error', 'not_editable'); end if;
  if p_kind not in ('shot', 'attach') then return jsonb_build_object('error', 'bad_kind'); end if;
  if p_path is null or position(lid || '/' || p_note::text || '-' || p_kind || '-' in p_path) <> 1 or p_path ~ '\.\.' then
    return jsonb_build_object('error', 'bad_path');
  end if;
  if p_kind = 'shot' then
    select shot_path into old from review_notes where id = p_note;
    update review_notes set shot_path = p_path, updated_at = now() where id = p_note;
  else
    select attach_path into old from review_notes where id = p_note;
    update review_notes set attach_path = p_path, updated_at = now() where id = p_note;
  end if;
  return jsonb_build_object('ok', true, 'replaced', old);
end $$;

-- ---- 4. the owner's CRM: the dates the lifecycle reads -----------------------
create or replace function review_summary()
returns table (lead_id text, feedback_at timestamptz, revised_at timestamptz, approved_at timestamptz, rounds integer, open_notes integer)
language sql security definer stable set search_path = public as $$
  with ls as (select r.lead_id from review_rounds r union select a.lead_id from site_approvals a)
  select ls.lead_id,
         (review_dates(ls.lead_id)->>'feedback_at')::timestamptz,
         (review_dates(ls.lead_id)->>'revised_at')::timestamptz,
         (review_dates(ls.lead_id)->>'approved_at')::timestamptz,
         (select count(*)::int from review_rounds r where r.lead_id = ls.lead_id),
         (select count(*)::int from review_notes n join review_rounds r on r.id = n.round_id
           where n.lead_id = ls.lead_id and n.status = 'open' and r.submitted_at is not null)
    from ls
   where crm_listed() and is_owner();
$$;

-- ---- grants ------------------------------------------------------------------
revoke all on function portal_review() from public, anon;
revoke all on function portal_note_save(jsonb) from public, anon;
grant execute on function portal_review() to authenticated;
grant execute on function portal_note_save(jsonb) to authenticated;
revoke all on function review_summary() from public, anon;
grant execute on function review_summary() to authenticated;

revoke all on function review_client(uuid) from public, anon, authenticated;
revoke all on function review_included(text) from public, anon, authenticated;
revoke all on function review_dates(text) from public, anon, authenticated;
revoke all on function review_state(text) from public, anon, authenticated;
revoke all on function review_submit(uuid) from public, anon, authenticated;
revoke all on function review_request_extra(uuid) from public, anon, authenticated;
revoke all on function review_open_round(text) from public, anon, authenticated;
revoke all on function review_approve(uuid, text, text, text) from public, anon, authenticated;
revoke all on function review_note_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function review_upload_target(uuid, uuid) from public, anon, authenticated;
revoke all on function review_set_file(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function site_approvals_lock() from public, anon, authenticated;
revoke all on function review_notes_lock() from public, anon, authenticated;
grant execute on function review_client(uuid) to service_role;
grant execute on function review_included(text) to service_role;
grant execute on function review_dates(text) to service_role;
grant execute on function review_state(text) to service_role;
grant execute on function review_submit(uuid) to service_role;
grant execute on function review_request_extra(uuid) to service_role;
grant execute on function review_open_round(text) to service_role;
grant execute on function review_approve(uuid, text, text, text) to service_role;
grant execute on function review_note_delete(uuid, uuid) to service_role;
grant execute on function review_upload_target(uuid, uuid) to service_role;
grant execute on function review_set_file(uuid, uuid, text, text) to service_role;

-- ---- 6. the private bucket ---------------------------------------------------
-- public = false, 10 MB, images only. The server signs one upload per path it
-- chose and checks the file's first bytes afterwards. NO policy on
-- storage.objects: anon and authenticated cannot touch it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review', 'review', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---- verify, and refuse to commit anything else ------------------------------
do $$
declare t text; f text; bad text;
begin
  foreach t in array array['review_sites', 'review_rounds', 'review_notes', 'site_approvals'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'REVIEW: RLS is off on %', t; end if;
    if (select count(*) from pg_policy where polrelid = ('public.' || t)::regclass) <> 1 then raise exception 'REVIEW: % should have exactly one (owner read) policy', t; end if;
    if exists (select 1 from pg_policy where polrelid = ('public.' || t)::regclass and (polcmd <> 'r' or pg_get_expr(polqual, polrelid) !~ 'is_owner\(\)')) then
      raise exception 'REVIEW: % has a write policy or a read not limited to owners', t;
    end if;
  end loop;
  foreach f in array array['portal_review()', 'portal_note_save(jsonb)', 'review_summary()'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'REVIEW: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'REVIEW: a signed-in browser cannot execute %', f; end if;
  end loop;
  foreach f in array array['review_client(uuid)', 'review_included(text)', 'review_dates(text)', 'review_state(text)', 'review_submit(uuid)',
                           'review_request_extra(uuid)', 'review_open_round(text)', 'review_approve(uuid,text,text,text)',
                           'review_note_delete(uuid,uuid)', 'review_upload_target(uuid,uuid)', 'review_set_file(uuid,uuid,text,text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'REVIEW: % is callable from a browser', f;
    end if;
  end loop;
  -- the client's functions find the lead themselves: no lead argument
  select string_agg(proname, ', ') into bad from pg_proc
   where proname in ('portal_review', 'review_summary') and pronargs <> 0;
  if bad is not null then raise exception 'REVIEW: these take arguments: %', bad; end if;
  if (select count(*) from pg_trigger where tgname in ('site_approvals_lock', 'review_notes_lock') and not tgisinternal) <> 2 then
    raise exception 'REVIEW: the locks are missing';
  end if;
  if (select public from storage.buckets where id = 'review') then raise exception 'REVIEW: the review bucket is public'; end if;
  raise notice 'REVIEW OK: four owner-read, server-write tables; portal_review/portal_note_save find the caller''s own lead; the server functions are service_role only; approvals are permanent; submitted notes are frozen; the review bucket is private.';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) as using_expr
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname in ('review_sites', 'review_rounds', 'review_notes', 'site_approvals') order by 1;
-- Expect 4 rows, polcmd r, using (crm_listed() AND is_owner()).
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('authenticated', p.oid, 'execute') as browser_can
  from pg_proc p where p.proname in ('portal_review', 'portal_note_save', 'review_summary') or p.proname like 'review\_%' order by 1;
-- Expect anon_can false everywhere; browser_can true ONLY for portal_review,
-- portal_note_save and review_summary.
select id, public, file_size_limit from storage.buckets where id = 'review';
-- Expect: review, false, 10485760.
