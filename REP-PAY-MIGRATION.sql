-- ============================================================================
-- ProyTech CRM — rep pay
-- Run this ONCE in Supabase → SQL Editor, AFTER MIGRATION.sql. Idempotent.
--
-- RUN THIS AND WORK THROUGH VERIFY-RLS.md §8 BEFORE ANY REP SEES A NUMBER.
-- Rep pay is the first thing in this database that is somebody's WAGES. A rep
-- reading another rep's pay is worse than a rep reading another rep's pipeline.
--
-- What it does:
--   1. crm_users.appointment_rate — the flat fee for a meeting marked HELD
--   2. rep_payouts               — what you actually paid, and when
--   3. RLS                       — a rep reads their OWN payouts; owners all
--
-- WHY A RATE COLUMN AND NOT A MODEL ENUM
--
--   A rep is on a model when its rate is non-zero. commission_pct already works
--   that way and is unchanged. An enum would be a third thing to keep in sync
--   with two numbers that already say everything it would say, and the failure
--   mode is an enum saying 'commission' over a zero percentage.
--
--     appointment_rate > 0   paid per meeting held
--     commission_pct   > 0   paid a share of the closed deal
--     both zero              on no pay model yet — which is what a new hire is
--
-- WHAT IS *NOT* HERE, ON PURPOSE
--
--   No earnings table. An earning is a HELD MEETING and it is derived from the
--   meeting record — storing a row per meeting would drift the moment a status
--   changed, which is ENGINEERING §2 and the reason meetingLogsOf reads through
--   rather than copying. What IS stored is the frozen rate at approval
--   (payRate, payApprovedAt, payApprovedBy on the meeting itself), because a
--   rate change must not restate pay you already agreed to.
--
--   Meetings live in the lead's jsonb, so the stamps need no migration:
--     setById / setBy      who SET the appointment — the fee follows this, not
--                          the lead's owner, so reassigning a lead never moves
--                          a fee somebody earned
--     heldBy / heldById /  who marked it held and when. Marking held used to be
--     heldAt               bookkeeping; it is now a claim for money, so it
--                          carries evidence
-- ============================================================================


-- --------------------------------------------------------------- 1. the rate
alter table crm_users add column if not exists appointment_rate numeric not null default 0;

comment on column crm_users.appointment_rate is
  'Flat fee paid to this rep for a meeting marked HELD. 0 means they are not on the per-appointment model. Paired with commission_pct — either, both or neither.';


-- ------------------------------------------------------------- 2. the payouts
-- A payout is money LEAVING the business on a date, to a person. It is not
-- attached to a lead, so it cannot live on one — and it is the most per-person
-- data in this database, so it cannot live in app_settings either, which is the
-- shared blob that cannot be split (ROLES.md, The honest limits).
create table if not exists rep_payouts (
  id         text primary key,
  rep_id     uuid not null references auth.users(id) on delete cascade,
  amount     numeric not null,
  paid_on    date not null,
  period     text not null default '',   -- 'YYYY-MM' or a free label
  note       text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table rep_payouts drop constraint if exists rep_payouts_amount_chk;
alter table rep_payouts add  constraint rep_payouts_amount_chk check (amount <> 0);

create index if not exists rep_payouts_rep_idx on rep_payouts (rep_id, paid_on desc);

comment on table rep_payouts is
  'What was actually paid to a rep, and when. Earnings are derived from held meetings. This is the money that left. A correction is a NEW row with a negative amount, never an edit — money that has gone does not get rewritten (ENGINEERING §4).';


-- ------------------------------------------------------------------ 3. RLS
alter table rep_payouts enable row level security;

-- A rep reads their OWN payouts and nobody else's. Same shape as the leads
-- policy: no_users() keeps a fresh install working, crm_active() means
-- deactivating somebody ends their access at the next page load.
drop policy if exists rep_payouts_read on rep_payouts;
create policy rep_payouts_read on rep_payouts for select
  using (no_users() or (crm_active() and (is_owner() or rep_id = auth.uid())));

-- Only an owner writes one. A rep paying themselves is the one thing this table
-- must make impossible, and it is impossible at the database rather than by a
-- hidden button.
drop policy if exists rep_payouts_write on rep_payouts;
create policy rep_payouts_write on rep_payouts for insert
  with check (no_users() or (crm_active() and is_owner()));
drop policy if exists rep_payouts_update on rep_payouts;
create policy rep_payouts_update on rep_payouts for update
  using (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));
drop policy if exists rep_payouts_delete on rep_payouts;
create policy rep_payouts_delete on rep_payouts for delete
  using (no_users() or (crm_active() and is_owner()));


-- ---------------------------------------------------------------- verify
-- Full procedure with real logins is VERIFY-RLS.md §8. Quick structural check:
--
--   select tablename, policyname, cmd from pg_policies
--    where tablename = 'rep_payouts' order by policyname;
--   -- expect four: read (SELECT), write (INSERT), update, delete
--
--   select relname, relrowsecurity from pg_class where relname = 'rep_payouts';
--   -- expect true
--
--   select name, role, commission_pct, appointment_rate from crm_users order by role, name;
--   -- both rates zero on anybody you have not put on a model yet
