-- ============================================================================
-- ProyTech CRM — Meeting Log
-- Run this ONCE in Supabase → SQL Editor, AFTER MIGRATION.sql. It is
-- idempotent: running it again changes nothing.
--
-- What it does:
--   1. meeting_logs  — one row per meeting, jsonb blob, same shape as `events`
--   2. RLS           — OWNERS ONLY. Reps cannot read a single row.
--
-- Why a table and not app_settings:
--   app_settings is one row per key, readable by every active crm_user (see
--   the settings_read policy in MIGRATION.sql). Meeting transcripts contain
--   pay splits, candid reads on clients, and hiring talk. They are the most
--   sensitive data in this database and must not live somewhere a rep can
--   read. One row per meeting also means a write never rewrites the whole
--   list, which is the same lost-update reasoning behind the `events` table.
--
-- Why owner-only and not owner-writes/rep-reads:
--   Decided deliberately. The value of this module depends on being able to
--   dump completely unfiltered thought into it. The moment a rep can read it,
--   it gets self-censored and stops being worth keeping.
-- ============================================================================

create table if not exists meeting_logs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sorting the list is the only query this table serves, and it always sorts by
-- meeting date (which lives in the blob), not by row creation order — a memo
-- typed up three days late still belongs on the day the meeting happened.
create index if not exists meeting_logs_date_idx
  on meeting_logs ((data->>'meetingDate') desc);

alter table meeting_logs enable row level security;

-- no_users() keeps a fresh install working before anyone is set up, exactly
-- like the leads policy. After setup: owners only, and only active ones.
drop policy if exists meeting_logs_owner on meeting_logs;
create policy meeting_logs_owner on meeting_logs for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));
