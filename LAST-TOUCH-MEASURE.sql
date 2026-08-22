-- ===========================================================================
-- How big is the lastTouchTs / lastContact correction?
--
-- Run this BEFORE any change. Read-only.
--
-- This is the LAST of the touch definitions. Two helpers share one flaw:
--
--   lastTouchTs(l)   newest activity of ANY type, falling back to createdAt
--   lastContact(l)   the same thing, written separately
--
-- Both answer "when did we last speak", and both count the app writing to
-- itself. A "Follow-up cleared." or a stage change resets the clock, so a lead
-- nobody has spoken to in eight months can read as touched yesterday.
--
-- AFTER would be lastTouch(l): reached types, plus notes a person wrote, and
-- NULL when there has been no real touch — no createdAt fallback. The 21
-- machine-note prefixes below are generated from SYS_NOTE in src/lib/lead.js,
-- the same list the app ships and tests/systemnotes.mjs guards.
--
-- WHY THIS ONE IS BIGGER THAN REAL_TOUCH. That change moved a count. This one
-- moves a FILTER and a SORT that you use to decide what to work on:
--
--   Leads table       the "Last Contact" column, and sorting by it
--   Leads filter      Cold · 7+ / 14+ / 30+ days
--   Pipeline cards    the "Nd no contact" badge and its stale flag
--   Lead header       "Added ... · Last contact ..."
--   Rep day panel     the stale group (>= 7d) and its "Nd since a touch" label
--   Dashboard         the rotting count (>= 14d)
--   Monday Huddle     stalledDeals (>= 14d) — also in the packet the AI reads
--
-- Relationships are excluded from the lead-side counts below; they were already
-- moved to lastTouch by the Relationships work.
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
         (ts is not null) as any_act,
         (ts is not null and (
            type in ('Call','Text','Email','Meeting','Booked','Payment')
            or (type = 'Note' and not derived and not (
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
         )) as real_act
    from act
),
per_lead as (
  select id,
         max(created)                          as created,
         max(ts) filter (where any_act)        as last_any,
         max(ts) filter (where real_act)       as last_real
    from flagged group by id
),
days as (
  select id,
         /* BEFORE: newest activity of any type, else createdAt */
         extract(epoch from (now() - coalesce(last_any, created)::timestamptz))/86400 as d_before,
         /* AFTER: newest real touch, or nothing at all */
         case when last_real is not null
              then extract(epoch from (now() - last_real::timestamptz))/86400 end     as d_after
    from per_lead
)
select
  count(*)                                                            as leads,
  count(*) filter (where d_after is null)                             as becomes_never_contacted,
  count(*) filter (where d_after is not null and d_after > d_before + 0.5) as clock_moves_back,
  round(avg(d_after - d_before) filter (where d_after is not null)::numeric, 1) as avg_days_added,
  round(max(d_after - d_before) filter (where d_after is not null)::numeric, 1) as worst_days_added,
  -- crossings: who newly qualifies at each threshold the app actually uses
  count(*) filter (where coalesce(d_after, 1e9) >= 7  and d_before < 7)  as newly_cold_7,
  count(*) filter (where coalesce(d_after, 1e9) >= 14 and d_before < 14) as newly_cold_14,
  count(*) filter (where coalesce(d_after, 1e9) >= 30 and d_before < 30) as newly_cold_30,
  -- and the reverse, which should be zero: nothing may get warmer
  count(*) filter (where d_after is not null and d_after < d_before - 0.5) as got_warmer_must_be_zero
from days;

-- ---------------------------------------------------------------------------
-- The worst offenders — where the displayed clock is most wrong. Eyeball these
-- before trusting the aggregate.
-- ---------------------------------------------------------------------------
-- (paste the CTEs above, then:)
--
-- select d.id, l.data->>'name' as name,
--        round(d.d_before::numeric,1) as shows_now,
--        round(d.d_after::numeric,1)  as truth
--   from days d join leads l on l.id = d.id
--  where d.d_after is not null
--  order by (d.d_after - d.d_before) desc
--  limit 25;
