-- ============================================================================
-- CLIENT-EMAILS-MIGRATION-ROLLBACK.sql
--
-- Undoes CLIENT-EMAILS-MIGRATION.sql. Run only if the client-emails PR is
-- reverted. It DROPS the record of which emails went out, so if the PR is
-- later re-deployed, every email whose claim is gone can send again (the
-- past-client guard in Settings still applies: only deposit ticks, activity
-- and submits on or after each email's switch-on date ever send).
-- ============================================================================
drop table if exists client_emails;
