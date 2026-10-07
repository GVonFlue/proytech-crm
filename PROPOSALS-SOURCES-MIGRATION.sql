-- ============================================================================
-- PROPOSALS-SOURCES-MIGRATION.sql
--
-- WHAT THIS DOES
--   One column: proposals.source_pocket_ids, the Pocket recordings (by id) a
--   proposal's draft was written from. So Regenerate uses the same recordings,
--   and the owner can see later what a draft came from.
--
--   It is OWNER-ONLY by construction: proposals has one policy, owner-only
--   (VERIFY-RLS §12), and the public functions return named columns, so this
--   column never leaves through proposal_public(). Only the IDS are stored:
--   no transcript, no summary, nothing a client could read even if it did.
--
-- WHEN TO RUN
--   Before or after the code deploys (PR "Proposals: fast to scope"). Without
--   it the CRM drafts and saves as before and says, by name, that the
--   attached recordings were not kept. Re-running is safe.
--
-- One transaction: if the verification at the end fails, nothing changes.
-- ============================================================================

begin;

alter table proposals add column if not exists source_pocket_ids text[] not null default '{}';
comment on column proposals.source_pocket_ids is
  'Pocket recording ids the draft was written from. OWNER ONLY (the proposals policy). Never returned by proposal_public(); never part of the body.';

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proposals' and column_name = 'source_pocket_ids') then
    raise exception 'PROPOSALS-SOURCES: the column is missing';
  end if;
  -- the public read must not return it
  if position('source_pocket_ids' in (select prosrc from pg_proc where proname = 'proposal_public' limit 1)) > 0 then
    raise exception 'PROPOSALS-SOURCES: proposal_public() returns source_pocket_ids';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.proposals'::regclass) <> 1 then
    raise exception 'PROPOSALS-SOURCES: proposals should have exactly one (owner) policy; read every one (RLS-AUDIT.sql)';
  end if;
  raise notice 'PROPOSALS-SOURCES OK: source_pocket_ids added; owner-only; not returned by proposal_public().';
end $$;

commit;

select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'proposals' and column_name = 'source_pocket_ids';
-- Expect 1 row: source_pocket_ids, ARRAY, '{}'::text[]
