-- ============================================================================
-- ProyTech CRM — Pocket AI recordings
-- Run this ONCE in Supabase → SQL Editor, AFTER MIGRATION.sql. It is
-- idempotent: running it again changes nothing.
--
-- RUN THIS AND WORK THROUGH VERIFY-RLS.md §7 BEFORE ANY UI IS BUILT.
-- If a rep can read a single row, stop and say so.
--
-- What it does:
--   1. pocket_recordings — every recording Pocket sends, kept as the SOURCE
--   2. RLS              — OWNERS ONLY. Reps get zero rows. Same shape as meeting_logs.
--
-- WHY OWNER-ONLY IS NOT A JUDGEMENT CALL HERE
--
--   This table holds the FULL TRANSCRIPT of every recording, forever, because
--   the recording is the source you keep coming back to — a Sunday call might
--   produce a client note today and a Playbook draft next month.
--
--   A Sunday call is also where pay splits, pricing floors, candid reads on
--   clients and hiring talk get said out loud. So this table is at least as
--   sensitive as meeting_logs, and MEETING-MIGRATION.sql already made the
--   argument: transcripts must not live anywhere a rep can read. This policy
--   is that policy, character for character, on purpose — one shape to audit
--   rather than two that look similar.
--
--   Nothing derived from a recording is rep-readable either. An output is an
--   owner-only meeting_logs row or an unpublished kb_notes draft. The only two
--   paths from a recording to something a rep can see are the ones that already
--   exist and are unchanged: the hand-written "Add to lead" line on a client
--   log, and publishing a Playbook draft through its preview. Both are a
--   button, and both publish only text a human wrote.
--
-- WHY THE WEBHOOK CAN STILL WRITE IT
--
--   api/pocket-hook.js writes with SUPABASE_SERVICE_KEY, which bypasses RLS by
--   design — the same key api/_guard.js already uses for api_hits. Pocket is
--   the caller, so there is no user session to authenticate against; the HMAC
--   signature is the authentication (see the plan, §2). RLS here governs the
--   BROWSER, which is the only thing it can govern.
--
-- WHAT NEEDS NO SQL
--
--   Outputs carry `sourcePocketId` back to the recording, and the "what came
--   out of this" list is DERIVED in the browser by scanning meeting_logs and
--   kb_notes for that id (ENGINEERING §2 — a stored outputs[] array is a second
--   copy of a fact and is wrong the moment an output is deleted). Both ids live
--   inside the existing `data` jsonb on those tables, so no column, no index and
--   no policy change is needed on either.
--
--   meeting_logs also gains kind:'note' for internal business notes. `kind`
--   already lives in that jsonb too, so that is a client-side change with no
--   migration.
-- ============================================================================


-- --------------------------------------------------------- 1. the recordings
-- id is POCKET'S recording id, not one we mint. That is deliberate: webhook
-- delivery is AT-LEAST-ONCE, so the same recording arrives more than once, and
-- several different events (transcription.completed, then summary.completed)
-- each describe the same one. Making Pocket's id the primary key turns "do not
-- store this twice" from application logic into a database constraint.
create table if not exists pocket_recordings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  status      text  not null default 'open',
  received_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- status is ONLY what a human decided: open (still to work through), done
-- (finished with it), dismissed (nothing came of it).
--
-- Note what is NOT a status: whether the recording HAS outputs. That is
-- derivable from the outputs themselves, and storing it would be a second copy
-- of a fact that goes wrong the moment an output is deleted.
alter table pocket_recordings drop constraint if exists pocket_recordings_status_chk;
alter table pocket_recordings add  constraint pocket_recordings_status_chk
  check (status in ('open', 'done', 'dismissed'));

-- The dashboard asks one question -- "what is still open, newest first" -- and
-- this serves it. Sorted on received_at rather than the recording's own
-- createdAt: a recording that syncs three days late is new TO YOU on the day it
-- arrives, which is the opposite of the meeting_logs rule and correct for the
-- opposite reason. A meeting log is filed under when the meeting happened; a
-- recording queue is ordered by when it landed in front of you.
create index if not exists pocket_recordings_status_idx
  on pocket_recordings (status, received_at desc);

comment on table pocket_recordings is
  'Every Pocket recording, kept permanently as the source its outputs were made from. Holds full transcripts, so owner-only in the same shape as meeting_logs. Written by the service key from api/pocket-hook.js, and read and updated by the owner''s browser.';

comment on column pocket_recordings.id is
  'Pocket''s own recording id. Primary key because webhook delivery is at-least-once and several event types describe the same recording.';

comment on column pocket_recordings.status is
  'open | done | dismissed — what a human decided. Whether the recording has outputs is derived from the outputs, never stored here.';


-- ------------------------------------------------------------------ 2. RLS
-- Character for character the meeting_logs_owner policy. Same helpers, same
-- first-run behaviour (no_users() short-circuits a fresh install), same
-- deactivation behaviour (crm_active()). A rep gets zero rows here for exactly
-- the reason they get zero meeting logs, and it is the same line of SQL saying
-- so — not a similar one written twice.
--
-- `for all` rather than split read/write policies, again like meeting_logs: the
-- owner needs to update status and cache extraction proposals from the browser,
-- and there is no second audience to grant anything narrower to.
alter table pocket_recordings enable row level security;

drop policy if exists pocket_recordings_owner on pocket_recordings;
create policy pocket_recordings_owner on pocket_recordings for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));


-- ---------------------------------------------------------------- housekeeping
-- Transcripts accumulate and nothing here deletes them, which is the intended
-- behaviour: the recording is the source, and a source you silently expire is
-- not a source. Deleting one is an owner action in the app.
--
-- If this table ever needs trimming, delete by age and status rather than by
-- size, and only ever rows a human already finished with:
--
--   delete from pocket_recordings
--    where status in ('done','dismissed')
--      and received_at < now() - interval '12 months';
--
-- Outputs made from a deleted recording survive it. They are independent prose
-- with a sourcePocketId that no longer resolves, and the app says "source
-- recording deleted" rather than breaking — which is correct for an output that
-- was always meant to stand on its own.


-- ---------------------------------------------------------------- verify
-- Full procedure with real logins is VERIFY-RLS.md §7. Quick structural check:
--
--   select tablename, policyname, cmd from pg_policies
--    where tablename = 'pocket_recordings';
--   -- expect exactly one row: pocket_recordings_owner, ALL
--
--   select relname, relrowsecurity from pg_class
--    where relname = 'pocket_recordings';
--   -- expect true. A table with a policy and RLS switched OFF enforces nothing.
--
--   select polname, pg_get_expr(polqual, polrelid) as using_expr
--     from pg_policy where polrelid = 'pocket_recordings'::regclass;
--   -- expect the same expression as meeting_logs_owner. Compare them directly:
--   --   select polrelid::regclass, pg_get_expr(polqual, polrelid)
--   --     from pg_policy where polrelid in
--   --       ('pocket_recordings'::regclass, 'meeting_logs'::regclass);
