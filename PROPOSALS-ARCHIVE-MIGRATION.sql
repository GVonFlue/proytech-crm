-- ============================================================================
-- PROPOSALS-ARCHIVE-MIGRATION.sql
--
-- WHAT THIS DOES
--   An accepted proposal is the client's signed record (Terms §18.2; the
--   Privacy Policy's retention promise). This makes Postgres keep it:
--
--   1. proposals gets `archived_at`. Archiving hides an accepted proposal from
--      the CRM's default list; the row, the body and the acceptance stay.
--   2. A DELETE of an accepted proposal is REFUSED, for every role: the owner,
--      the server (service_role), the SQL editor. It is a trigger, not a
--      policy, so no grant and no bulk delete gets around it.
--   3. Once accepted, an UPDATE may not change `status`, `body` or any
--      `accepted_*` column. `archived_at`, `applied_at` and `updated_at` stay
--      changeable (archiving, the CRM marking it applied).
--   4. `archived_at` can only be set on an accepted proposal. A draft or sent
--      one is deleted instead, so there is one way to get rid of each.
--
-- WHEN TO RUN
--   BEFORE the code deploys (PR "Proposals: delete and archive"). The code
--   already deployed never deletes an accepted proposal, never edits one,
--   and never sets archived_at, so running it first breaks nothing.
--   Re-running is safe. Then RLS-AUDIT.sql, then VERIFY-RLS.md §12c.
--
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

alter table proposals add column if not exists archived_at timestamptz;

create or replace function proposals_keep_accepted()
returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'accepted' or old.accepted_at is not null then
      raise exception 'An accepted proposal is kept for the record (Terms 18.2). Archive it instead.'
        using errcode = 'P0001', hint = 'proposals_keep_accepted';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.status = 'accepted' or old.accepted_at is not null then
    if new.status                 is distinct from old.status
       or new.body                   is distinct from old.body
       or new.accepted_at            is distinct from old.accepted_at
       or new.accepted_name          is distinct from old.accepted_name
       or new.accepted_ip            is distinct from old.accepted_ip
       or new.accepted_plan          is distinct from old.accepted_plan
       or new.accepted_terms_version is distinct from old.accepted_terms_version
       or new.accepted_terms_url     is distinct from old.accepted_terms_url
       or new.accepted_privacy_url   is distinct from old.accepted_privacy_url then
      raise exception 'An accepted proposal cannot be changed: its status, body and acceptance record are kept as accepted (Terms 18.2).'
        using errcode = 'P0001', hint = 'proposals_keep_accepted';
    end if;
  end if;
  if new.archived_at is not null and old.archived_at is null and new.status <> 'accepted' then
    raise exception 'Only an accepted proposal can be archived. Delete a draft or an unaccepted one instead.'
      using errcode = 'P0001', hint = 'proposals_keep_accepted';
  end if;
  return new;
end $$;

drop trigger if exists proposals_keep_accepted_del on proposals;
create trigger proposals_keep_accepted_del before delete on proposals
  for each row execute function proposals_keep_accepted();
drop trigger if exists proposals_keep_accepted_upd on proposals;
create trigger proposals_keep_accepted_upd before update on proposals
  for each row execute function proposals_keep_accepted();

-- ---- verify, and refuse to commit anything else ------------------------------
do $$
declare n int;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proposals' and column_name = 'archived_at') then
    raise exception 'PROPOSALS-ARCHIVE: archived_at is missing';
  end if;
  select count(*) into n from pg_trigger t
   where t.tgrelid = 'public.proposals'::regclass and not t.tgisinternal and t.tgenabled <> 'D'
     and t.tgname in ('proposals_keep_accepted_del', 'proposals_keep_accepted_upd');
  if n <> 2 then raise exception 'PROPOSALS-ARCHIVE: expected 2 enabled triggers, found %', n; end if;
  raise notice 'PROPOSALS-ARCHIVE OK: archived_at added; accepted proposals cannot be deleted or changed (archiving still works).';
end $$;

commit;

-- ---- read back -------------------------------------------------------------
select tgname, case tgenabled when 'O' then 'enabled' else tgenabled::text end as state,
       pg_get_triggerdef(t.oid) as definition
  from pg_trigger t where t.tgrelid = 'public.proposals'::regclass and not t.tgisinternal order by 1;
-- Expect 2 rows: proposals_keep_accepted_del (BEFORE DELETE) and
-- proposals_keep_accepted_upd (BEFORE UPDATE), both enabled.

select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'proposals' and column_name = 'archived_at';
-- Expect 1 row: archived_at, timestamp with time zone.
