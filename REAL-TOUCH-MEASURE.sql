-- ===========================================================================
-- How big is the REAL_TOUCH correction?
--
-- Run this BEFORE the fix. It changes nothing — one read-only select.
--
-- Two definitions of "somebody made contact with this lead", side by side:
--
--   BEFORE  REAL_TOUCH: any activity whose text is not exactly 'Lead created.'
--           So a stage change, a cleared follow-up or a deal-value edit all
--           count as contact.
--
--   AFTER   isRealTouch: a reached type (Call/Text/Email/Meeting/Booked/
--           Payment), or a Note a person actually wrote. The 21 machine-note
--           prefixes below are generated from SYS_NOTE in src/lib/lead.js —
--           the same list the app ships and the same one tests/systemnotes.mjs
--           guards against going stale.
--
-- Relationships are excluded: speed-to-lead is about leads you respond to.
--
-- RUN 2026-08-21, 146 leads:
--
--   untouched_before             7
--   untouched_after             34
--   move_into_untouched         27
--   avg_first_touch_hrs   5.1 -> 3.5
--   paired_before/after    3.5 / 3.5      avg_hours_added 0.0
--
-- Read together: no lead got slower or faster. The 27 never had contact at
-- all, and were only ever counted because the app had written to itself.
-- ===========================================================================

with act as (
  select l.id,
         l.data->>'createdAt'                       as created,
         a->>'ts'                                   as ts,
         a->>'type'                                 as type,
         coalesce(a->>'text','')                    as text,
         coalesce((a->>'derived')::boolean, false)  as derived
    from leads l
    left join lateral jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a on true
   where coalesce((l.data->>'isRelationship')::boolean, false) = false
),
flagged as (
  select id, created, ts,
         /* BEFORE */
         (ts is not null and text <> 'Lead created.')                       as old_touch,
         /* AFTER */
         (ts is not null and (
            type in ('Call','Text','Email','Meeting','Booked','Payment')
            or (type = 'Note' and not derived and not (
                   text like 'Lead created.%'
                or text like 'Follow-up cleared.%'
                or text like 'Follow-up done —%'
                or text like 'Stage moved:%'
                or text like 'Deal value set to%'
                or text like 'Phase →%'
                or text like 'Close date set to%'
                or text like 'Commission approved%'
                or text like 'Commission voided%'
                or text like 'Converted to client%'
                or text like 'Signed — onboarding%'
                or text like 'Reverted to lead%'
                or text like 'Invoice %'
                or text like 'Payment confirmed %'
                or text like 'Payment marked as not collected%'
                or text like 'Deal closed:%'
                or text like 'New build started:%'
                or text like 'Sponsorship logged:%'
                or text like 'Dated:%'
                or text like 'Reassigned from %'
                or text like 'Checklist: %'
            ))
         ))                                                                 as new_touch
    from act
),
per_lead as (
  select id,
         max(created)                                              as created,
         bool_or(old_touch)                                        as had_old,
         bool_or(new_touch)                                        as had_new,
         min(ts) filter (where old_touch)                          as first_old,
         min(ts) filter (where new_touch)                          as first_new
    from flagged group by id
),
hrs as (
  select *,
         case when created is not null and first_old is not null
              then extract(epoch from (first_old::timestamptz - created::timestamptz))/3600 end as h_old,
         case when created is not null and first_new is not null
              then extract(epoch from (first_new::timestamptz - created::timestamptz))/3600 end as h_new
    from per_lead
)
select
  count(*)                                             as leads,
  count(*) filter (where not had_old)                  as untouched_before,
  count(*) filter (where not had_new)                  as untouched_after,
  count(*) filter (where had_old and not had_new)      as move_into_untouched,
  round(avg(h_old)::numeric, 1)                        as avg_first_touch_hrs_before,
  round(avg(h_new)::numeric, 1)                        as avg_first_touch_hrs_after,
  -- the honest comparison: only leads that have a first touch under BOTH
  round(avg(h_old) filter (where h_new is not null)::numeric, 1) as paired_before,
  round(avg(h_new) filter (where h_old is not null)::numeric, 1) as paired_after,
  round(avg(h_new - h_old) filter (where h_old is not null and h_new is not null)::numeric, 1) as avg_hours_added
from hrs;

-- ===========================================================================
-- THE TILE IS A MEDIAN, NOT A MEAN.
--
-- "Speed to First Touch" on the Dashboard is median(touchHrs). The query above
-- reports means, so the tile will move by a different amount than 5.1 -> 3.5.
--
-- The direction is settled either way: for every lead present under BOTH
-- definitions the value is identical (avg_hours_added 0.0), so nothing gets
-- slower. The tile moves only because the 27 fictional first touches leave the
-- distribution, and they sit above the median, so it ticks down.
--
-- Run this for the tile-accurate figure. Same CTEs, different aggregate.
-- ===========================================================================
-- (paste the with ... hrs CTEs from above, then:)
--
-- select
--   percentile_cont(0.5) within group (order by h_old) as median_before,
--   percentile_cont(0.5) within group (order by h_new) as median_after
-- from hrs;

-- ---------------------------------------------------------------------------
-- The leads that move INTO untouched — the ones whose only "contact" was the
-- app writing to itself. Worth eyeballing before trusting the number above.
-- ---------------------------------------------------------------------------
-- with ... (same CTEs) ...
-- select id, created, first_old from hrs where had_old and not had_new order by created desc limit 25;
