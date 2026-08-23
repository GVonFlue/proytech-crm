-- ============================================================================
-- ProyTech CRM — Content Studio row level security
--
-- WHAT IS WRONG RIGHT NOW, MEASURED 23 AUG 2026
--
--   All eight content tables have RLS enabled and carry a policy. The policy is:
--
--     policyname   <table>_auth_all
--     roles        {authenticated}
--     cmd          ALL
--     using        true
--     with check   true
--
--   `true` restricts nothing. Every authenticated session — every sales rep on
--   the install — has full SELECT, INSERT, UPDATE and DELETE on all eight,
--   including `content_brand_context` (pricing, offers, positioning) and
--   `content_usage` (the monthly AI spend of the business). Anonymous callers
--   are correctly locked out; that was verified separately and is not the
--   problem.
--
--   The tab is hidden from reps in the app, and that is not a boundary.
--   ROLES.md says so in as many words: a hidden tab is not a locked door. A rep
--   has a valid session and the publishable key ships in the client bundle on
--   every page load, so reaching these tables needs curl, not the UI.
--
-- WHY THIS WAS NOT CAUGHT
--
--   Every check anyone ran counted policies. `select count(*) from pg_policy`
--   returns 1 for a table that is wide open and 1 for a table that is locked
--   down. A permissive `true` policy is indistinguishable from a correct one
--   unless you read the EXPRESSION. That is now the standing rule in CLAUDE.md
--   and the verification block at the bottom of this file reads expressions.
--
-- WHAT THIS FILE DOES
--
--   Per table: drops the permissive policy, then creates an owner-scoped one.
--   It creates NO tables and NO columns. The eight tables already exist.
--
--   THE ORDER IS THE ENTIRE FIX. Permissive policies combine with OR. Adding
--   `content_posts_owner` while `content_posts_auth_all` still exists gives you
--
--       true OR (no_users() or (crm_active() and is_owner()))
--
--   which is `true`. The new policy would be completely inert and the table
--   would stay wide open while looking repaired in exactly the count-based
--   check that missed this the first time. Drop first, always.
--
--   Idempotent: both policy names are dropped before either is created, so
--   running this twice changes nothing the second time.
--
-- THE POLICY IS pocket_recordings_owner, CHARACTER FOR CHARACTER
--
--   Same helpers, same structure, no `to` clause — so it applies to PUBLIC
--   exactly as pocket_recordings' does. Not a similar policy written eight
--   times: the same one, so there is one expression to audit rather than nine.
--   The verification block asserts that byte-for-byte against the real
--   pocket_recordings policy rather than against a copy pasted into a comment.
--
--   `for all` rather than split read/write, again like meeting_logs and
--   pocket_recordings: the owner reads and writes every one of these from the
--   browser, and there is no second audience to grant anything narrower to.
--
-- WHY THE APP AND THE ROUTES ARE UNAFFECTED
--
--   Client side, the only caller of any of these tables is
--   src/ContentStudio.jsx, and that screen renders only when the app already
--   believes you are an owner (canOpen → CONTENT_STUDIO_ON && !isRep). Every
--   branch of that agrees with is_owner(): owner yes, rep no, fresh install
--   yes via no_users(), deactivated no via crm_active(). There is no state
--   where the app opens the Studio for someone Postgres then refuses.
--
--   Server side, api/_content.js uses SUPABASE_SERVICE_KEY, which bypasses RLS
--   by design — the same arrangement api/pocket-hook.js has. The three routes
--   and the weekly cron are untouched by this file. RLS governs the BROWSER,
--   which is the only thing it can govern.
--
--   Nothing in the app today relies on a rep reaching these tables. There is no
--   rep-facing content feature and no published surface like kb_published.
--
-- ALL EIGHT, INCLUDING THE LATER-PHASE THREE
--
--   An earlier draft of this file covered five and left content_ideas,
--   content_insights and content_mining_state alone, reasoning that a policy on
--   a table with no code path is a claim nobody is testing. That reasoning was
--   wrong once the policies were actually read: those three are carrying `true`
--   like the rest, so they are not unguarded-and-idle, they are OPEN. A table
--   nothing reads is still a table a rep can read.
--
-- AFTER RUNNING IT
--
--   The verification block at the bottom either raises an exception naming the
--   tables that are still wrong, or reports success. Then work through
--   VERIFY-RLS.md §9 with real logins.
-- ============================================================================


-- ---------------------------------------------------------- 1. the five in use

alter table content_brand_context enable row level security;
drop policy if exists content_brand_context_auth_all on content_brand_context;
drop policy if exists content_brand_context_owner    on content_brand_context;
create policy content_brand_context_owner on content_brand_context for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_posts enable row level security;
drop policy if exists content_posts_auth_all on content_posts;
drop policy if exists content_posts_owner    on content_posts;
create policy content_posts_owner on content_posts for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_research enable row level security;
drop policy if exists content_research_auth_all on content_research;
drop policy if exists content_research_owner    on content_research;
create policy content_research_owner on content_research for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_usage enable row level security;
drop policy if exists content_usage_auth_all on content_usage;
drop policy if exists content_usage_owner    on content_usage;
create policy content_usage_owner on content_usage for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_assets enable row level security;
drop policy if exists content_assets_auth_all on content_assets;
drop policy if exists content_assets_owner    on content_assets;
create policy content_assets_owner on content_assets for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));


-- ------------------------------------------------- 2. the three later-phase ones
-- Nothing in the codebase reads or writes these yet. They are here because they
-- are carrying `true` today, which makes them open rather than idle. When the
-- phase that uses them lands it brings its own VERIFY-RLS subsection; the
-- policy it will need is already the right one.

alter table content_ideas enable row level security;
drop policy if exists content_ideas_auth_all on content_ideas;
drop policy if exists content_ideas_owner    on content_ideas;
create policy content_ideas_owner on content_ideas for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_insights enable row level security;
drop policy if exists content_insights_auth_all on content_insights;
drop policy if exists content_insights_owner    on content_insights;
create policy content_insights_owner on content_insights for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));

alter table content_mining_state enable row level security;
drop policy if exists content_mining_state_auth_all on content_mining_state;
drop policy if exists content_mining_state_owner    on content_mining_state;
create policy content_mining_state_owner on content_mining_state for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));


-- ============================================================================
-- 3. VERIFICATION — reads EXPRESSIONS, not counts
--
-- This is the half that would have caught the original problem. It never
-- counts a policy. It reads pg_get_expr on every one of the eight tables and
-- raises if anything is still permissive, missing, duplicated, or merely
-- similar to the reference rather than identical to it.
--
-- If this block raises, the file did NOT take. Read the message: it names the
-- tables.
-- ============================================================================

do $$
declare
  content_tables constant text[] := array[
    'content_brand_context','content_posts','content_research','content_usage',
    'content_assets','content_ideas','content_insights','content_mining_state'];
  reference_expr text;
  problem        text;
  checked        int;
begin
  ---------------------------------------------------------------- 3a. exists
  select string_agg(t, ', ' order by t) into problem
    from unnest(content_tables) t
   where to_regclass('public.' || t) is null;
  if problem is not null then
    raise exception
      'CONTENT-RLS: these tables do not exist, so nothing was verified: %', problem;
  end if;

  ------------------------------------------------------- 3b. RLS switched on
  -- A policy on a table with RLS off enforces nothing at all.
  select string_agg(c.relname, ', ' order by c.relname) into problem
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = any (content_tables)
     and c.relrowsecurity is not true;
  if problem is not null then
    raise exception 'CONTENT-RLS FAILED: row level security is OFF on: %', problem;
  end if;

  ------------------------------------------- 3c. nothing permissive survives
  -- The one that matters. `true` restricts nothing, and permissive policies
  -- combine with OR — so a single surviving `true` re-opens the table however
  -- correct the policy beside it looks.
  select string_agg(format('%s.%s', c.relname, p.polname), ', ' order by c.relname) into problem
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = any (content_tables)
     and (
       coalesce(pg_get_expr(p.polqual,      p.polrelid), 'true') = 'true'
       or
       coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'true') = 'true'
     );
  if problem is not null then
    raise exception
      'CONTENT-RLS FAILED: still permissive (expression is true) on: %. '
      'These tables are readable and writable by every authenticated session.',
      problem;
  end if;

  ------------------------------------------------- 3d. exactly one policy each
  -- Two permissive policies OR together, so "one correct policy plus one
  -- leftover" is not a partial fix, it is no fix.
  select string_agg(format('%s (%s policies)', relname, n), ', ' order by relname) into problem
    from (
      select c.relname, count(p.polname) as n
        from pg_class c
        join pg_namespace ns on ns.oid = c.relnamespace
        left join pg_policy p on p.polrelid = c.oid
       where ns.nspname = 'public' and c.relname = any (content_tables)
       group by c.relname
    ) x
   where n <> 1;
  if problem is not null then
    raise exception 'CONTENT-RLS FAILED: expected exactly one policy per table, got: %', problem;
  end if;

  ------------------------------- 3e. identical to pocket_recordings, not similar
  -- Compared against the LIVE policy rather than a copy pasted into a comment,
  -- so this cannot drift the way a hardcoded string would.
  select pg_get_expr(p.polqual, p.polrelid) into reference_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
   where c.relname = 'pocket_recordings'
   limit 1;

  if reference_expr is null then
    raise notice
      'CONTENT-RLS: pocket_recordings has no policy on this install, so the '
      '"identical to the reference" check was skipped. Everything else passed.';
  else
    select string_agg(c.relname, ', ' order by c.relname) into problem
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
     where c.relname = any (content_tables)
       and pg_get_expr(p.polqual, p.polrelid) is distinct from reference_expr;
    if problem is not null then
      raise exception
        'CONTENT-RLS FAILED: policy expression differs from pocket_recordings on: %. '
        'Expected: %', problem, reference_expr;
    end if;
  end if;

  ------------------------------------------------------------------ 3f. done
  select count(*) into checked from unnest(content_tables);
  raise notice '----------------------------------------------------------------';
  raise notice 'CONTENT-RLS OK: % tables, RLS on, one owner-scoped policy each,', checked;
  raise notice 'no permissive expressions, all identical to pocket_recordings_owner.';
  raise notice 'Expression: %', coalesce(reference_expr, '(reference unavailable)');
  raise notice 'Next: VERIFY-RLS.md section 9, with real logins.';
  raise notice '----------------------------------------------------------------';
end $$;


-- ---------------------------------------------------------------- 4. read it
-- The block above decides pass or fail. This prints the end state so you can
-- see it rather than trust it. Every row should show the same using_expr, and
-- none of them should say `true`.

select c.relname                                  as table_name,
       c.relrowsecurity                           as rls_on,
       p.polname                                  as policy,
       pg_get_expr(p.polqual,      p.polrelid)    as using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid)    as with_check_expr
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public'
   and (c.relname like 'content\_%' or c.relname = 'pocket_recordings')
 order by (c.relname = 'pocket_recordings'), c.relname;
