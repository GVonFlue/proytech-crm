-- ============================================================================
-- CLIENT-EMAILS-MIGRATION.sql — "each client email sends once, never twice"
--
-- Run ONCE in the Supabase SQL Editor, BEFORE deploying the client-emails PR.
-- Safe to re-run (if not exists / drop policy if exists). Changes nothing else.
-- Rollback: CLIENT-EMAILS-MIGRATION-ROLLBACK.sql.
--
-- WHAT IT IS
--   One row per (lead, kind) the server has claimed:
--     kind 'locked_in'  "You're locked in" (the deposit tick)
--          'seat_1d'    "We saved your seat", 24 hours
--          'seat_3d'    "We saved your seat", day 3
--          'seat_6d'    "We saved your seat", day 6 (personal, offers a call)
--          'stall_10d'  no email: the CRM turns it into a "Call [client]" task
--          'ticket'     "Launch Day Ticket" (onboarding submitted)
--
-- WHY A TABLE, NOT A FLAG ON THE LEAD
--   The CRM saves the whole lead record from the browser. A "sent" mark the
--   server wrote onto the lead would be erased by the next save from any open
--   tab, and the email would go out again. Here, a send first INSERTs its row
--   with ON CONFLICT DO NOTHING: whoever gets the row sends, and a second
--   caller (the CRM and the daily job at the same moment, a retry, a double
--   click) gets nothing back and sends nothing. The unique constraint is the
--   whole guarantee.
--   A send that FAILS deletes its own claim, so tomorrow's run tries again; a
--   send that succeeds stamps sent_at.
--
-- WHO CAN DO WHAT
--   Owners READ it (the CRM shows what went out, and turns stall_10d into a
--   task). NOBODY writes it through the API: there is no insert, update or
--   delete policy, and the grants are revoked, so only the server (service
--   role, which bypasses RLS) writes. A rep reads nothing. Anon reads nothing.
--   VERIFY-RLS.md §18 proves it; RLS-AUDIT.sql §2f raises if a write policy
--   ever appears.
-- ============================================================================

create table if not exists client_emails (
  id            uuid primary key default gen_random_uuid(),
  lead_id       text not null,
  kind          text not null
                check (kind in ('locked_in','seat_1d','seat_3d','seat_6d','stall_10d','ticket')),
  onboarding_id uuid,
  claimed_at    timestamptz not null default now(),
  sent_at       timestamptz,
  detail        text check (detail is null or length(detail) <= 300),
  unique (lead_id, kind)
);
create index if not exists client_emails_lead on client_emails (lead_id);
comment on table client_emails is
  'One row per client email (or stall task) the server has claimed for a lead. unique(lead_id, kind) is what makes each send once-only. OWNER READ, SERVER WRITE: no write policy exists.';

alter table client_emails enable row level security;

-- Owners read. The same owner expression as every owner-only table since
-- RLS-TIGHTEN-2026-10: before the first user exists, or an active owner.
drop policy if exists client_emails_owner_read on client_emails;
create policy client_emails_owner_read on client_emails
  for select using (no_users() or (crm_active() and is_owner()));

-- No insert / update / delete policy, on purpose. With RLS on, no policy
-- means no rows for that command. The grants go too, so it is not even
-- attempted.
revoke all on client_emails from anon;
revoke insert, update, delete, truncate on client_emails from authenticated;
grant select on client_emails to authenticated;
grant all on client_emails to service_role;
