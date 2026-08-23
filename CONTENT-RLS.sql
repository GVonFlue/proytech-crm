-- ============================================================================
-- ProyTech CRM — Content Studio row level security
--
-- READ THIS BEFORE RUNNING IT. It is the only file in this repo that changes a
-- table you created by hand, and it is deliberately separate from the feature
-- PRs for that reason.
--
-- RUN IT ONLY IF VERIFY-RLS.md §9 STEP 1 SAYS YOU NEED TO. That step asks
-- Postgres whether RLS is already on and whether policies already exist. If it
-- is already true and the policies are already there, this file has nothing to
-- do and you should not run it. It is idempotent either way.
--
-- It creates NO tables and NO columns. The five tables already exist. All this
-- does is switch RLS on and add one policy per table.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS AT ALL
--
--   The five content tables were created by hand, outside any migration in this
--   repo, and shipped across two feature PRs with no RLS proof. Every other
--   sensitive table here has one: meeting_logs, pocket_recordings, kb_notes,
--   rep_payouts. These did not.
--
--   That gap does not matter much for the install we run ourselves, where the
--   only two logins are owners. It matters completely for an install we sell,
--   where a rep has a login and `content_brand_context` holds pricing, offers
--   and positioning, and `content_usage` holds the monthly spend of the
--   business. ROLES.md keeps company money off a rep's screen. Until these
--   policies exist, that promise is kept by the SCREEN — which is a UI decision,
--   not a boundary, and ROLES.md is explicit about the difference.
--
-- WHAT "TENANT" MEANS HERE, PRECISELY
--
--   This CRM is NOT multi-tenant in one database. ENGINEERING.md §6 states it:
--   per-client installs are separate Vercel deployments against separate
--   Supabase projects. So there is no tenant_id, and no policy below tries to
--   partition by one. Adding a tenant column to these tables would be a
--   different architecture, not a stricter policy.
--
--   The isolation these policies provide is the one that exists inside a single
--   install: OWNER versus REP. That is the boundary a customer's sales team
--   actually sits on, and it is the one that has been unproven.
--
-- WHY OWNER-ONLY, FOR ALL FIVE
--
--   content_brand_context  pricing, offers, positioning, the voice that sells.
--   content_posts          unpublished marketing, and `performance` figures.
--   content_research       competitor material and why it worked.
--   content_usage          what the business spends on AI, month by month.
--   content_assets         files belonging to the above.
--
--   None of it is a rep's work and none of it is on ROLES.md's list of what a
--   rep may see. There is also no rep-readable SURFACE here the way the
--   Playbook has kb_published — nothing in Content Studio is meant to cross to
--   a rep at all, which makes this the simple case: one policy, owners only.
--
--   The policy is pocket_recordings_owner character for character, and for the
--   same reason POCKET-MIGRATION.sql gives: one shape to audit rather than five
--   that look similar. Same helpers, same fresh-install behaviour via
--   no_users(), same deactivation behaviour via crm_active().
--
-- WHY THE ROUTES STILL WORK AFTERWARDS
--
--   api/content-slate.js, api/content-regenerate.js and api/content-usage.js
--   all read and write with SUPABASE_SERVICE_KEY, which bypasses RLS by design
--   — the same key api/_guard.js already uses for api_hits, and the same
--   arrangement api/pocket-hook.js has. RLS here governs the BROWSER, which is
--   the only thing it can govern. Those routes are separately owner-gated by
--   guard({requireOwner:true}); see API-AUDIT.md.
--
--   The Vercel cron calls content-slate with CRON_SECRET and no user session at
--   all, so it too depends on the service key and is unaffected by this file.
--
-- AFTER RUNNING IT
--
--   Work through VERIFY-RLS.md §9 with real logins. If a rep can read a single
--   row from any of the five, stop and say so.
-- ============================================================================


-- --------------------------------------------------------------- the policies
-- `for all` rather than split read/write, like meeting_logs and
-- pocket_recordings: the owner reads and writes every one of these from the
-- browser, and there is no second audience to grant anything narrower to.
--
-- A NOTE ON content_usage. The browser never reads it — api/content-usage.js
-- returns the month-to-date figure through the service key instead, precisely
-- because there was no policy here (see that file's header). This policy does
-- not change that and is not an invitation to change it: the route stays, so
-- an install that has not run this file still shows a spend figure rather than
-- a silent $0.00. The policy is here so the table is not the one unguarded
-- thing left in the schema.

alter table content_brand_context enable row level security;
drop policy if exists content_brand_context_owner on content_brand_context;
create policy content_brand_context_owner on content_brand_context for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_posts enable row level security;
drop policy if exists content_posts_owner on content_posts;
create policy content_posts_owner on content_posts for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_research enable row level security;
drop policy if exists content_research_owner on content_research;
create policy content_research_owner on content_research for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_usage enable row level security;
drop policy if exists content_usage_owner on content_usage;
create policy content_usage_owner on content_usage for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_assets enable row level security;
drop policy if exists content_assets_owner on content_assets;
create policy content_assets_owner on content_assets for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));


-- ----------------------------------------------------- the later-phase tables
-- content_ideas, content_insights and content_mining_state also exist and are
-- for later phases. They are NOT covered here because nothing in this codebase
-- reads or writes them yet, and a policy on a table with no code path is a
-- claim nobody is testing.
--
-- They are exactly as unguarded as the five above were before this file. When
-- the phase that uses them lands, it brings its own policies and its own
-- VERIFY-RLS section — CLAUDE.md now requires that of any new table.
--
-- Until then, do not assume they are protected:
--
--   select relname, relrowsecurity from pg_class
--    where relname in ('content_ideas','content_insights','content_mining_state');


-- ---------------------------------------------------------------- verify
-- Full procedure with real logins is VERIFY-RLS.md §9. Quick structural check:
--
--   select tablename, policyname, cmd from pg_policies
--    where tablename like 'content_%' order by tablename;
--   -- expect one row per table above, each ALL
--
--   select relname, relrowsecurity from pg_class
--    where relname like 'content\_%' order by relname;
--   -- expect true for the five. A table with a policy and RLS switched OFF
--   -- enforces nothing, which is the failure this file is here to remove.
--
--   -- the five policies must be the SAME expression as pocket_recordings',
--   -- not five things that look alike:
--   select polrelid::regclass as tbl, pg_get_expr(polqual, polrelid) as using_expr
--     from pg_policy
--    where polrelid in ('content_brand_context'::regclass, 'content_posts'::regclass,
--                       'content_research'::regclass, 'content_usage'::regclass,
--                       'content_assets'::regclass, 'pocket_recordings'::regclass);
--   -- expect six rows, all with an identical using_expr.
