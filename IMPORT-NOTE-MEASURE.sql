-- ===========================================================================
-- How much does the import note distort? Read-only.
--
-- The importer writes the CSV note column as a Note on the lead, stamped at
-- createdAt with no `who` and no marker. isRealTouch counts it, so an imported
-- lead reads as contacted the moment it arrived. See IMPORT-NOTE-FINDING.md.
--
-- THE RECOGNISER, used consistently below and the same rule a backfill would
-- use, because existing rows carry no marker:
--
--   the lead has an importBatch
--   AND the note's ts equals the lead's createdAt
--   AND the note has no `who`
--   AND it is not 'Lead created.' (already excluded as a machine note)
--
-- It cannot be perfect: a note typed in the same second as creation, by code
-- that omits `who`, would match. Nothing in the app writes that, and the count
-- of matches per batch should equal the batch size — if it does not, the
-- recogniser is wrong and the fix needs a real marker before it ships.
-- ===========================================================================

with act as (
  select l.id,
         l.data->>'createdAt'   as created,
         l.data->>'importBatch' as batch,
         a->>'ts'               as ts,
         a->>'type'             as type,
         coalesce(a->>'text','') as text,
         (a->>'who') is null    as no_who,
         coalesce((a->>'derived')::boolean,false) as derived
    from leads l
    left join lateral jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a on true
   where coalesce((l.data->>'isRelationship')::boolean,false) = false
),
flagged as (
  select id, created, batch, ts,
         (ts is not null and (
            type in ('Call','Text','Email','Meeting','Booked','Payment')
            or (type='Note' and not derived and not (
                   text like 'Lead created.%'          or text like 'Follow-up cleared.%'
                or text like 'Follow-up done —%'       or text like 'Stage moved:%'
                or text like 'Deal value set to%'      or text like 'Phase →%'
                or text like 'Close date set to%'      or text like 'Commission approved%'
                or text like 'Commission voided%'      or text like 'Converted to client%'
                or text like 'Signed — onboarding%'    or text like 'Reverted to lead%'
                or text like 'Invoice %'               or text like 'Payment confirmed %'
                or text like 'Payment marked as not collected%'
                or text like 'Deal closed:%'           or text like 'New build started:%'
                or text like 'Sponsorship logged:%'    or text like 'Dated:%'
                or text like 'Reassigned from %'       or text like 'Checklist: %'
            ))
         )) as real_now,
         (batch is not null and type='Note' and no_who and ts = created
          and text not like 'Lead created.%') as is_import_note
    from act
),
per_lead as (
  select id, max(created) as created, max(batch) as batch,
         bool_or(real_now)                            as touched_now,
         bool_or(real_now and not is_import_note)     as touched_after,
         min(ts) filter (where real_now)                        as first_now,
         min(ts) filter (where real_now and not is_import_note) as first_after,
         count(*) filter (where is_import_note)       as import_notes
    from flagged group by id
),
hrs as (
  select *,
    case when first_now   is not null then extract(epoch from (first_now::timestamptz   - created::timestamptz))/3600 end as h_now,
    case when first_after is not null then extract(epoch from (first_after::timestamptz - created::timestamptz))/3600 end as h_after
    from per_lead
)
select
  count(*)                                                   as leads,
  count(*) filter (where batch is not null)                  as imported,
  count(*) filter (where import_notes > 0)                   as with_import_note,
  -- the headline: leads whose ONLY contact is the spreadsheet cell
  count(*) filter (where touched_now and not touched_after)  as move_into_untouched,
  -- speed to lead, which the fake zeros are currently flattering
  count(*) filter (where h_now = 0)                          as first_touch_zero_now,
  round(avg(h_now)::numeric,1)                               as mean_first_touch_now,
  round(avg(h_after)::numeric,1)                             as mean_first_touch_after,
  round(percentile_cont(0.5) within group (order by h_now)::numeric,1)   as median_now,
  round(percentile_cont(0.5) within group (order by h_after)::numeric,1) as median_after,
  -- invariant: excluding an activity can only push a first touch later
  count(*) filter (where h_after is not null and h_after < h_now)        as got_faster_must_be_zero
from hrs;

-- ---------------------------------------------------------------------------
-- RECOGNISER CHECK — run this FIRST. import_notes should equal leads in every
-- batch. If a batch is short, some imported leads had no note column; if any
-- batch is over, the recogniser is matching something it should not and the
-- fix needs a real marker rather than this rule.
-- ---------------------------------------------------------------------------
-- select batch, count(*) as leads, sum(import_notes) as import_notes
--   from per_lead where batch is not null group by batch order by batch;
