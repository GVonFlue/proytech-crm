-- ============================================================================
-- REVIEW-MIGRATION-ROLLBACK.sql
--
-- Undoes REVIEW-MIGRATION.sql. Run only if the B-2 PR is reverted. It DROPS
-- every review round, note and SITE APPROVAL (typed name, time, IP). Export
-- site_approvals first if any client has approved:
--   select * from site_approvals;
-- The `review` storage bucket is left in place (Supabase refuses to drop a
-- bucket that holds files); empty it from the Storage page, then delete it
-- there if you want it gone.
-- ============================================================================
begin;
drop function if exists portal_review();
drop function if exists portal_note_save(jsonb);
drop function if exists review_summary();
drop function if exists review_submit(uuid);
drop function if exists review_request_extra(uuid);
drop function if exists review_open_round(text);
drop function if exists review_approve(uuid, text, text, text);
drop function if exists review_note_delete(uuid, uuid);
drop function if exists review_set_file(uuid, uuid, text, text);
drop function if exists review_upload_target(uuid, uuid);
drop function if exists review_state(text);
drop function if exists review_dates(text);
drop function if exists review_included(text);
drop function if exists review_client(uuid);
drop table if exists site_approvals;
drop table if exists review_notes;
drop table if exists review_rounds;
drop table if exists review_sites;
drop function if exists site_approvals_lock();
drop function if exists review_notes_lock();
commit;
