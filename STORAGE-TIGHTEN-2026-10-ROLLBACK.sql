-- ============================================================================
-- STORAGE-TIGHTEN-2026-10-ROLLBACK.sql
--
-- READ THIS FIRST: it RE-OPENS THE HOLES STORAGE-TIGHTEN-2026-10.sql closed.
-- After it, every signed-in account (every rep) can again read, upload,
-- overwrite and delete receipts, and write, overwrite and delete site-media.
-- Use it only to get something working again while the real fault is found,
-- and run STORAGE-TIGHTEN-2026-10.sql again as soon as you can.
--
-- WHAT IT RESTORES: the access as it was described before the tighten, as
-- clearly named policies (the originals were added by hand and their names
-- are only in section 0 of the tighten's output):
--   receipts    authenticated: select, insert, update, delete
--   site-media  anyone: select; authenticated: insert, update, delete
--
-- WHAT IT DOES NOT RESTORE: receipts stays a PRIVATE bucket. Whether it was
-- public before is in the tighten's section 0 output; making it public again
-- would expose every receipt to anyone with a file URL, which no rollback
-- should do silently. If section 0 said public = true and you truly need
-- that back:  update storage.buckets set public = true where id = 'receipts';
--
-- After running it, RLS-AUDIT.sql still PASSES (every policy here names its
-- bucket); that is the audit's limit, not a sign the holes are closed.
-- ============================================================================

begin;

drop policy if exists storage_receipts_owner_select   on storage.objects;
drop policy if exists storage_receipts_owner_insert   on storage.objects;
drop policy if exists storage_receipts_owner_update   on storage.objects;
drop policy if exists storage_receipts_owner_delete   on storage.objects;
drop policy if exists storage_site_media_read         on storage.objects;
drop policy if exists storage_site_media_owner_insert on storage.objects;
drop policy if exists storage_site_media_owner_update on storage.objects;
drop policy if exists storage_site_media_owner_delete on storage.objects;

drop policy if exists rollback_receipts_authenticated_all on storage.objects;
create policy rollback_receipts_authenticated_all on storage.objects for all to authenticated
  using (bucket_id = 'receipts') with check (bucket_id = 'receipts');

drop policy if exists rollback_site_media_read on storage.objects;
create policy rollback_site_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');
drop policy if exists rollback_site_media_authenticated_write on storage.objects;
create policy rollback_site_media_authenticated_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media');
drop policy if exists rollback_site_media_authenticated_update on storage.objects;
create policy rollback_site_media_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media') with check (bucket_id = 'site-media');
drop policy if exists rollback_site_media_authenticated_delete on storage.objects;
create policy rollback_site_media_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media');

commit;

select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'storage.objects'::regclass order by polname;
-- Expect the five rollback_* policies for these two buckets.
