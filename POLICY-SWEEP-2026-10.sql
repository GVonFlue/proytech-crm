-- ============================================================================
-- POLICY-SWEEP-2026-10.sql  —  READ-ONLY. Changes nothing.
--
-- Lists every row-level security policy in production that
--   (a) no migration in this repo creates (not_in_repo = true): made by hand
--       in the dashboard, like the four leads policies and the four that
--       RLS-TIGHTEN-2026-10 removed; or
--   (b) uses crm_active() at all (uses_crm_active = true).
--
-- crm_active() is TRUE for a login with no crm_users row. It is safe ONLY
-- beside is_owner() or crm_listed(), which require a listed, active row.
-- crm_active_alone = true is the dangerous shape: that policy lets a login
-- with no team row through, the same hole leads had. Send every such row back.
--
-- Expected after AUTH-LISTED-2026-10.sql on a database built only from this
-- repo: rows for app_settings (settings_owner_*), the content_* tables,
-- events, kb_notes, meeting_logs, pocket_recordings, rep_payouts, site_*,
-- storage receipts / site-media, all with not_in_repo = false and
-- crm_active_alone = false (each pairs crm_active() with is_owner()), and NO
-- row for leads. Anything else is news.
-- ============================================================================
with repo(tablename, policyname) as (values
    ('site_events','site_events_owner'),
    ('site_settings','site_settings_owner'),
    ('app_settings','settings_owner_delete'),
    ('app_settings','settings_owner_insert'),
    ('app_settings','settings_owner_update'),
    ('app_settings','settings_read'),
    ('app_settings','settings_tasks_insert'),
    ('app_settings','settings_tasks_update'),
    ('content_assets','content_assets_owner'),
    ('content_brand_context','content_brand_context_owner'),
    ('content_ideas','content_ideas_owner'),
    ('content_insights','content_insights_owner'),
    ('content_mining_state','content_mining_state_owner'),
    ('content_posts','content_posts_owner'),
    ('content_research','content_research_owner'),
    ('content_usage','content_usage_owner'),
    ('crm_users','users_bootstrap'),
    ('crm_users','users_manage'),
    ('crm_users','users_read'),
    ('events','events_owner'),
    ('kb_notes','kb_notes_owner'),
    ('kb_published','kb_published_read'),
    ('kb_reads','kb_reads_read'),
    ('leads','leads_delete'),
    ('leads','leads_insert'),
    ('leads','leads_select'),
    ('leads','leads_update'),
    ('meeting_logs','meeting_logs_owner'),
    ('objects','storage_receipts_owner_delete'),
    ('objects','storage_receipts_owner_insert'),
    ('objects','storage_receipts_owner_select'),
    ('objects','storage_receipts_owner_update'),
    ('objects','storage_site_media_owner_delete'),
    ('objects','storage_site_media_owner_insert'),
    ('objects','storage_site_media_owner_update'),
    ('objects','storage_site_media_read'),
    ('onboarding_files','onboarding_files_owner'),
    ('onboardings','onboardings_owner'),
    ('pocket_recordings','pocket_recordings_owner'),
    ('proposals','proposals_owner'),
    ('rep_notes','rep_notes_owner'),
    ('rep_payouts','rep_payouts_delete'),
    ('rep_payouts','rep_payouts_read'),
    ('rep_payouts','rep_payouts_update'),
    ('rep_payouts','rep_payouts_write'))
select p.schemaname, p.tablename, p.policyname, p.cmd,
       (p.tablename, p.policyname) not in (select * from repo) as not_in_repo,
       position('crm_active()' in coalesce(p.qual,'') || coalesce(p.with_check,'')) > 0 as uses_crm_active,
       -- the dangerous shape: crm_active() trusted without is_owner()/crm_listed() beside it
       (position('crm_active()' in coalesce(p.qual,'') || coalesce(p.with_check,'')) > 0
        and position('is_owner()' in coalesce(p.qual,'') || coalesce(p.with_check,'')) = 0
        and position('crm_listed()' in coalesce(p.qual,'') || coalesce(p.with_check,'')) = 0) as crm_active_alone,
       p.qual as using_expr, p.with_check as check_expr
  from pg_policies p
 where p.schemaname in ('public','storage')
   and ((p.tablename, p.policyname) not in (select * from repo)
        or position('crm_active()' in coalesce(p.qual,'') || coalesce(p.with_check,'')) > 0)
 order by uses_crm_active desc, p.tablename, p.policyname;
