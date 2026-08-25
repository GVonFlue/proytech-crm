-- ===========================================================================
-- REP-PROFILE-MIGRATION.sql
--
--   1. rep_notes            — what an owner thinks about a rep. OWNER ONLY.
--   2. crm_users.onboarding — signed agreement, W-9, payment method on file.
--
-- Run once, in the Supabase SQL Editor. One table, one column, one policy.
-- Changes no existing data and no existing policy.
--
-- ---------------------------------------------------------------------------
-- THE ONE THAT MATTERS
-- ---------------------------------------------------------------------------
-- rep_notes is an owner's ASSESSMENT OF A PERSON, written about them and not
-- for them. It is the same shape as meeting_logs: owner-only in Postgres, so a
-- rep's login gets zero rows and no screen has to remember to hide it.
--
-- THE APP IS NOT THE BOUNDARY. If a rep ever reaches a crm_users row through
-- any path — a widened policy, a new RPC, the assistant — an RLS gap means he
-- reads what his owner wrote about him. That is why this is a separate table
-- rather than a column on crm_users, which a rep CAN read: users_read is
-- `id = auth.uid() or is_owner()`, so his own row comes back to him whole.
--
-- Proved from the rep's side in VERIFY-RLS.md.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. rep_notes
-- ---------------------------------------------------------------------------
create table if not exists rep_notes (
  id      bigserial primary key,
  rep_id  uuid not null references crm_users(id) on delete cascade,
  body    text not null,
  by_id   uuid,                                   -- which owner wrote it
  by_name text,                                   -- their name at the time
  at      timestamptz not null default now()
);

create index if not exists rep_notes_rep_at on rep_notes (rep_id, at desc);

comment on table rep_notes is
  'An owner''s private notes about a rep. OWNER ONLY — a rep''s login returns zero rows. Never widen this policy; the note is an assessment of a person, written about them and not for them.';

alter table rep_notes enable row level security;

-- ONE POLICY, AND IT IS `is_owner()` ON BOTH SIDES. `for all` covers select,
-- insert, update and delete, so there is no verb left to forget. A rep matches
-- neither side and gets nothing — not a filtered list, NOTHING.
--
-- Permissive policies are ORed, so the weakest one on a table decides what it
-- allows. There must never be a second policy here. Read this table's policies
-- by pg_get_expr, never by counting them (CLAUDE.md, and the `leads` finding
-- in VERIFY-RLS.md §3).
drop policy if exists rep_notes_owner on rep_notes;
create policy rep_notes_owner on rep_notes
  for all using (is_owner()) with check (is_owner());


-- ---------------------------------------------------------------------------
-- 2. crm_users.onboarding
--
-- { agreement: {done: bool, on: 'YYYY-MM-DD'}, w9: {...}, payment: {...} }
--
-- WHETHER IT WAS RECEIVED AND WHEN. NO DOCUMENT, EVER. The W-9 carries a
-- social security number and it is not going in this database — this column
-- records that one arrived, and the document itself lives wherever you already
-- keep it.
--
-- On crm_users deliberately, which a rep CAN read for his own row. Whether his
-- own paperwork has landed is his business too, and it saves him asking.
-- ---------------------------------------------------------------------------
alter table crm_users add column if not exists onboarding jsonb not null default '{}'::jsonb;

comment on column crm_users.onboarding is
  'Rep onboarding receipts: agreement, w9, payment method — each {done, on}. WHETHER and WHEN only. No document is ever stored here; a W-9 carries an SSN.';


-- ---------------------------------------------------------------------------
-- CONFIRM
--
-- The SQL Editor is not signed in as anybody: auth.uid() is NULL there, so
-- is_owner() is FALSE and rep_notes returns nothing even to you. That is the
-- policy working. To ask as a real person, lend the session their claims
-- inside a transaction that rolls back — see REP-ACTIVITY-MIGRATION.sql.
--
--   -- as a REP: must be empty, and the insert must be refused
--   select * from rep_notes;                        -> 0 rows
--   insert into rep_notes (rep_id, body) values (auth.uid(), 'x');
--                                                   -> ERROR: violates RLS
--
--   -- as the OWNER
--   select * from rep_notes;                        -> every note
--   insert into rep_notes (rep_id, body, by_id, by_name)
--     values ('<rep uuid>', 'test', auth.uid(), 'Garrett');  -> succeeds
--
--   -- and the check that actually matters, by EXPRESSION and not by count
--   select p.polname, p.polpermissive,
--          pg_get_expr(p.polqual, p.polrelid)      as using_expr,
--          pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--    where c.relname = 'rep_notes';
--
--     -> EXACTLY ONE ROW: rep_notes_owner, permissive, is_owner() on both.
--        A second row here is a rep reading his own assessment.
-- ---------------------------------------------------------------------------
