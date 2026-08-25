-- ===========================================================================
-- REP-ACTIVITY-MIGRATION.sql
--
--   1. crm_last_seen()   — when each person last signed in
--   2. kb_reads          — which Playbook notes a rep has read, append-only
--   3. kb_mark_read()    — the ONLY way a read is recorded
--   4. kb_reset_progress() — an owner sends a rep back through the Playbook
--
-- Run once, in the Supabase SQL Editor. Creates one table, two functions and
-- one policy. Changes no existing data and no existing policy.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- ---------------------------------------------------------------------------
-- No session duration, no time-in-CRM, no presence. A rep here is an
-- independent contractor and SALES-SOPS.md says so in its own words — "nothing
-- in here sets your hours". An hours-logged record would be evidence against
-- that agreement, and it measures a browser tab rather than any work. What the
-- app shows instead is computed from the activity log: dials, dispositions,
-- bookings, and the first and last thing he did each day.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. crm_last_seen()
--
-- auth.users.last_sign_in_at is maintained by Supabase and is already the
-- truth. A stamped column on crm_users would be a second copy of a fact, and a
-- second copy drifts — so nothing is stored and this reads the original.
--
-- A browser cannot read another user's auth row: session.user.last_sign_in_at
-- is only ever the caller's own, and auth.admin needs the service key, which
-- never goes near a browser. Hence a function.
--
-- SAME SHAPE AS crm_team(). Two columns, no money, no email, no pools — not
-- filtered out, ABSENT, so no future edit can leak one by widening a select.
--
-- The WHERE is the access control, not a raise: an owner sees the team, a rep
-- sees exactly himself. A rep learning when his colleagues signed in is not
-- something this system needs to hand out.
-- ---------------------------------------------------------------------------
drop function if exists crm_last_seen();
create or replace function crm_last_seen()
returns table (id uuid, last_sign_in_at timestamptz)
language sql security definer stable as $$
  select u.id, a.last_sign_in_at
    from crm_users u
    join auth.users a on a.id = u.id
   where u.active
     and (is_owner() or u.id = auth.uid());
$$;

-- security definer bypasses RLS, so the grant IS the access control here.
revoke all on function crm_last_seen() from public, anon;
grant execute on function crm_last_seen() to authenticated;


-- ---------------------------------------------------------------------------
-- 2. kb_reads — append-only
--
-- WHY A TABLE AND NOT A COLUMN ON crm_users
--
--   A read is a timestamped fact, and the compliance acknowledgement is a
--   record that may one day have to be produced to somebody outside the
--   company. A row you only ever insert is a better home for that than a jsonb
--   blob you overwrite.
--
-- WHY A RESET IS A ROW AND NOT A DELETE
--
--   Sending a rep back through the Playbook must not erase the fact that he
--   acknowledged the compliance list on the 24th. So a reset is its own row,
--   and "has he read note X" means: a 'read' row for X exists AFTER the most
--   recent 'reset'. Nothing is ever removed.
-- ---------------------------------------------------------------------------
create table if not exists kb_reads (
  id       bigserial primary key,
  rep_id   uuid not null references crm_users(id) on delete cascade,
  note_id  text,                                    -- null only for a reset
  kind     text not null check (kind in ('read','ack','reset')),
  at       timestamptz not null default now(),
  by_id    uuid                                     -- who caused it
);

create index if not exists kb_reads_rep_at on kb_reads (rep_id, at desc);

comment on table kb_reads is
  'Append-only. A rep reaching the last card of a published Playbook note (read), acknowledging the compliance list (ack), or an owner sending him back through it (reset). Written only by kb_mark_read() and kb_reset_progress().';

alter table kb_reads enable row level security;

-- A rep reads his own progress — it is his. An owner reads everyone's.
drop policy if exists kb_reads_read on kb_reads;
create policy kb_reads_read on kb_reads
  for select using (rep_id = auth.uid() or is_owner());

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
-- With RLS on and no permissive write policy, no session can write this table
-- directly. Every write goes through a security-definer function below, which
-- is what makes the record worth having: a rep cannot mark himself complete
-- from a console, and nobody can quietly edit an acknowledgement afterwards.


-- ---------------------------------------------------------------------------
-- 3. kb_mark_read() — the only way a read is recorded
--
-- Stamps auth.uid() and nothing else, so a rep can only ever mark HIMSELF.
-- Refuses a note that is not published: a draft cannot be read, because a rep
-- cannot see one.
-- ---------------------------------------------------------------------------
drop function if exists kb_mark_read(text, text);
create or replace function kb_mark_read(p_note_id text, p_kind text default 'read')
returns void
language plpgsql security definer as $$
begin
  if p_kind is null or p_kind not in ('read','ack') then
    raise exception 'kb_mark_read: kind must be read or ack, got %', p_kind;
  end if;
  if p_note_id is null or length(btrim(p_note_id)) = 0 then
    raise exception 'kb_mark_read: a note id is required';
  end if;
  if not exists (select 1 from kb_published p where p.id = p_note_id) then
    raise exception 'kb_mark_read: % is not a published note', p_note_id;
  end if;

  insert into kb_reads (rep_id, note_id, kind, by_id)
  values (auth.uid(), p_note_id, p_kind, auth.uid());
end $$;

revoke all on function kb_mark_read(text, text) from public, anon;
grant execute on function kb_mark_read(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. kb_reset_progress() — owner only
--
-- Writes a 'reset' marker. Everything before it stays on the record.
-- ---------------------------------------------------------------------------
drop function if exists kb_reset_progress(uuid);
create or replace function kb_reset_progress(p_rep uuid)
returns void
language plpgsql security definer as $$
begin
  if not is_owner() then
    raise exception 'kb_reset_progress: owners only';
  end if;
  if p_rep is null then
    raise exception 'kb_reset_progress: which rep?';
  end if;

  insert into kb_reads (rep_id, note_id, kind, by_id)
  values (p_rep, null, 'reset', auth.uid());
end $$;

revoke all on function kb_reset_progress(uuid) from public, anon;
grant execute on function kb_reset_progress(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- CONFIRM — and FIRST, why the SQL Editor cannot answer most of this
-- ---------------------------------------------------------------------------
-- THE SQL EDITOR IS NOT SIGNED IN AS ANYBODY. It has no JWT, so auth.uid() is
-- NULL. is_owner() (MIGRATION.sql:65) is defined as
--
--     exists (select 1 from crm_users where id = auth.uid() and role='owner' ...)
--
-- so it is FALSE there, for everyone, always. Run crm_last_seen() in the editor
-- and its WHERE becomes `(false or u.id = NULL)`, which is never true, so it
-- returns ZERO ROWS while working perfectly. The same mechanism makes
-- crm_whoami() report role 'none' in the editor.
--
-- An earlier version of this block said "as the owner, expect one row per
-- person" and pointed at the editor. That could only ever have looked like a
-- broken function, and it was reported as one.
--
-- TO ASK AS A REAL PERSON, LEND THE SESSION THEIR CLAIMS — inside a
-- transaction that ROLLS BACK, so a test write never lands on anybody's record:
--
--   begin;
--     select set_config('request.jwt.claims',
--       json_build_object('sub','<their crm_users.id>','role','authenticated')::text, true);
--     select set_config('role','authenticated', true);
--
--     -- ... the checks below ...
--
--   rollback;
--
-- The third argument `true` makes each setting local to the transaction, and
-- the rollback undoes anything the checks wrote. Nothing persists either way.
--
-- As the owner (claims lent, per above):
--   select * from crm_last_seen();
--     -> one row per active person, including every rep
--
-- As a rep:
--   select * from crm_last_seen();
--     -> exactly ONE row, their own
--
--   insert into kb_reads (rep_id, note_id, kind) values (auth.uid(), 'x', 'read');
--     -> ERROR: new row violates row-level security policy
--        (no insert policy exists; this is the point)
--
--   select kb_mark_read('<a published note id>');
--     -> succeeds, one row, rep_id = their own uid
--
--   select kb_mark_read('<some other rep is irrelevant>', 'read');
--     -> still stamps THEIR uid. There is no parameter for whose read it is.
--
--   select kb_reset_progress('<any uuid>');
--     -> ERROR: kb_reset_progress: owners only
-- ---------------------------------------------------------------------------
