-- ============================================================================
-- STORAGE-TIGHTEN-2026-10.sql
--
-- WHAT THIS DOES
--   Two Storage buckets were open to every signed-in account, reps included:
--
--   receipts     any authenticated user could read, upload, overwrite and
--                delete. Receipts are the business's books: OWNER ONLY now,
--                read and write, and the bucket is forced PRIVATE (a public
--                bucket serves any file by URL without checking a policy, so
--                owner-only read would mean nothing).
--   site-media   website images. Public READ stays (that is what it is for).
--                Any authenticated user could write, overwrite and delete:
--                OWNER ONLY now. Uploads so far were Garrett in the Supabase
--                dashboard, which uses the service role and is unaffected.
--
--   The owner expression is the reference one (VERIFY-RLS.md §9, §13):
--     public.no_users() OR (public.crm_active() AND public.is_owner())
--
-- WHY IT DROPS EVERY POLICY THAT REACHES THESE TWO BUCKETS
--   ENGINEERING.md §4c: permissive policies are grants and Postgres ORs them.
--   storage.objects holds EVERY bucket's files, so a leftover that does not
--   name a bucket opens all of them, the private onboarding bucket included.
--   These policies were added by hand, not by any migration in this repo, so
--   there may be ones nobody has listed. Dropped here: every policy on
--   storage.objects that mentions 'receipts' or 'site-media', and every one
--   that does not mention bucket_id at all. Policies scoped to OTHER buckets
--   are left alone. Section 0 prints everything BEFORE, so nothing is lost
--   without a record.
--
-- THE APP NEEDS NO CHANGE. Receipts are uploaded, opened, downloaded and
-- deleted only from the Money/Books screens, which are owner-only (canOpen,
-- OWNER_ONLY_TABS), through the owner's own session (lib/supabase.js).
--
-- SAFE TO RE-RUN. One transaction: if anything fails, nothing changes, and it
-- ends by checking its own result and raising if it is not exactly right.
--
-- WHEN TO RUN: any time (no code depends on the old access). Then run
-- RLS-AUDIT.sql, then VERIFY-RLS.md §15.
--
-- TO UNDO: STORAGE-TIGHTEN-2026-10-ROLLBACK.sql (it re-opens the holes).
-- ============================================================================

begin;

-- ---- 0. BEFORE: every policy on storage.objects, and the two buckets --------
-- Copy this output somewhere before you continue reading the results.
select polname as policy,
       case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                   when 'd' then 'DELETE' else 'ALL' end as cmd,
       polpermissive as permissive,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'storage.objects'::regclass order by polname;
select id, public, file_size_limit from storage.buckets order by id;

-- ---- 1. drop every policy that reaches these buckets -------------------------
do $$
declare p record; dropped text := '';
begin
  for p in
    select polname,
           coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), '') as expr
      from pg_policy where polrelid = 'storage.objects'::regclass
  loop
    if p.expr ~ '''receipts''' or p.expr ~ '''site-media''' or p.expr !~ 'bucket_id' then
      execute format('drop policy %I on storage.objects', p.polname);
      dropped := dropped || ' ' || quote_ident(p.polname);
    end if;
  end loop;
  raise notice 'STORAGE-TIGHTEN dropped:%', coalesce(nullif(dropped, ''), ' (nothing)');
end $$;

-- ---- 2. the buckets ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'receipts') then
    raise notice 'STORAGE-TIGHTEN note: there is no receipts bucket on this install; its policies are created anyway, ready for one.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'site-media') then
    raise notice 'STORAGE-TIGHTEN note: there is no site-media bucket on this install; its policies are created anyway, ready for one.';
  end if;
end $$;
update storage.buckets set public = false where id = 'receipts';
update storage.buckets set public = true  where id = 'site-media';

-- ---- 3. receipts: owners, everything -------------------------------------------
-- upload() is called with upsert:true, which needs UPDATE as well as INSERT,
-- and download / a signed URL need SELECT.
create policy storage_receipts_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (public.no_users() or (public.crm_active() and public.is_owner())));
create policy storage_receipts_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (public.no_users() or (public.crm_active() and public.is_owner())));
create policy storage_receipts_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (public.no_users() or (public.crm_active() and public.is_owner())))
  with check (bucket_id = 'receipts' and (public.no_users() or (public.crm_active() and public.is_owner())));
create policy storage_receipts_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (public.no_users() or (public.crm_active() and public.is_owner())));

-- ---- 4. site-media: everyone reads, owners write ----------------------------------
create policy storage_site_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');
create policy storage_site_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (public.no_users() or (public.crm_active() and public.is_owner())));
create policy storage_site_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (public.no_users() or (public.crm_active() and public.is_owner())))
  with check (bucket_id = 'site-media' and (public.no_users() or (public.crm_active() and public.is_owner())));
create policy storage_site_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (public.no_users() or (public.crm_active() and public.is_owner())));

-- ---- 5. check our own work, and refuse to commit if it is not exactly right ------
do $$
declare want text := 'storage_receipts_owner_delete,storage_receipts_owner_insert,storage_receipts_owner_select,storage_receipts_owner_update,storage_site_media_owner_delete,storage_site_media_owner_insert,storage_site_media_owner_update,storage_site_media_read';
        got text; unscoped text; open_true text;
begin
  select string_agg(polname, ',' order by polname) into got
    from pg_policy where polrelid = 'storage.objects'::regclass
     and (coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')) ~ '''(receipts|site-media)''';
  if got is distinct from want then
    raise exception 'STORAGE-TIGHTEN check failed: policies reaching receipts/site-media are [%], expected [%]', got, want;
  end if;
  select string_agg(polname, ', ') into unscoped from pg_policy
   where polrelid = 'storage.objects'::regclass
     and (coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')) !~ 'bucket_id';
  if unscoped is not null then raise exception 'STORAGE-TIGHTEN check failed: unscoped storage policies remain: %', unscoped; end if;
  select string_agg(polname, ', ') into open_true from pg_policy
   where polrelid = 'storage.objects'::regclass and polpermissive
     and ((polcmd <> 'a' and coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true') or pg_get_expr(polwithcheck, polrelid) = 'true');
  if open_true is not null then raise exception 'STORAGE-TIGHTEN check failed: `true` storage policies remain: %', open_true; end if;
  if exists (select 1 from storage.buckets where id = 'receipts' and public) then
    raise exception 'STORAGE-TIGHTEN check failed: receipts is still a public bucket';
  end if;
  raise notice 'STORAGE-TIGHTEN OK: receipts owner-only and private; site-media public read, owner-only write; no unscoped or `true` storage policy left.';
end $$;

commit;

-- ---- 6. AFTER: read every policy back (CLAUDE.md: read EVERY policy) -------------
select polname as policy,
       case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
                   when 'd' then 'DELETE' else 'ALL' end as cmd,
       array_to_string(array(select rolname from pg_roles where oid = any (polroles)), ', ') as roles,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'storage.objects'::regclass order by polname;
-- Expect, for these two buckets, exactly the eight storage_receipts_* and
-- storage_site_media_* policies; any other row must name a DIFFERENT bucket.
select id, public from storage.buckets where id in ('receipts', 'site-media') order by id;
-- Expect: receipts false, site-media true.
