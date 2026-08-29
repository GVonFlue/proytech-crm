-- ===========================================================================
-- Does the Dashboard / Money split move any of my numbers?
--
-- Run this BEFORE the change. Read-only — nothing here writes.
--
-- RUN THE THREE QUERIES ONE AT A TIME. The Supabase editor shows you the result
-- of the LAST statement only, so running the file in one go hides the first.
--
-- THE BUG. Both screens compute money with the same useMetrics(), over
-- different lists:
--
--   Dashboard   leads={scopedBiz}   relationships EXCLUDED   App.jsx:4845
--   Money       leads={scoped}      relationships INCLUDED   App.jsx:4863
--
-- and useMetrics filters nothing itself. So a relationship carrying money is
-- already counted on Money and not on the Dashboard. On the Money page it
-- reaches further than the tiles: paymentTxns(leads) puts its payments into
-- The Books, billsMrr sums its retainer into MRR, owedBy adds it to
-- still-owed, and apptEarnings pays a rep for an appointment booked on it.
--
-- THAT LAST ONE IS NOT A TILE, IT IS SOMEBODY'S PAY. apptEarnings walks the
-- meetings of every lead it is handed. Hand it a narrower list and a setter
-- who booked an appointment on a relationship stops being paid for it.
-- Query 3 finds those before anything changes, because a silent pay cut is a
-- different order of mistake from a dashboard tile moving.
--
-- WHY THIS ASKS A NARROW QUESTION. An honest "how much does each tile move"
-- would mean reimplementing retainerState, owedBy and the stage rules in SQL —
-- and a reimplementation that drifts from the app is exactly the disagreement
-- this change exists to remove. So instead it finds every relationship
-- carrying ANY money at all:
--
--   0 rows  -> the delta is zero on every tile of both screens. The fix is
--              provably invisible and can ship without ceremony.
--   n rows  -> that is the complete list, short enough to read by hand. Every
--              number that moves, moves because of a record in it.
--
-- The numeric casts are guarded: a lead whose dealValue was ever typed as text
-- would otherwise abort the whole query rather than report itself.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- QUERY 1 of 3 — THE HEADLINE. If carrying_money is 0, stop; nothing moves.
-- ---------------------------------------------------------------------------
with r as (
  select
    coalesce((data->>'isRelationship')::boolean, false) as is_rel,
    case when data->>'dealValue' ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (data->>'dealValue')::numeric else 0 end  as deal_value,
    case when data->>'retainer'  ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (data->>'retainer')::numeric  else 0 end  as retainer,
    case when jsonb_typeof(data->'payments')    = 'array'
         then jsonb_array_length(data->'payments')    else 0 end as payment_rows,
    case when jsonb_typeof(data->'closedDeals') = 'array'
         then jsonb_array_length(data->'closedDeals') else 0 end as closed_deals,
    case when jsonb_typeof(data->'deals')       = 'array'
         then jsonb_array_length(data->'deals')       else 0 end as open_deals,
    coalesce((data->>'isClient')::boolean, false)       as is_client
  from leads
)
select
  count(*) filter (where is_rel)                                   as relationships,
  count(*) filter (where not is_rel)                               as business_leads,
  count(*) filter (where is_rel and (deal_value <> 0 or retainer <> 0
      or payment_rows > 0 or closed_deals > 0 or open_deals > 0 or is_client)) as carrying_money,
  coalesce(sum(deal_value)   filter (where is_rel), 0)             as rel_deal_value_total,
  coalesce(sum(retainer)     filter (where is_rel), 0)             as rel_retainer_upper_bound,
  coalesce(sum(payment_rows) filter (where is_rel), 0)             as rel_payment_rows
from r;

-- ---------------------------------------------------------------------------
-- QUERY 2 of 3 — THE RECORDS. Only worth running if carrying_money > 0.
-- Read this list: every number that moves is caused by a row here.
-- ---------------------------------------------------------------------------
with r as (
  select
    data->>'name' as name, data->>'company' as company,
    data->>'relTier' as tier, data->>'stage' as stage,
    coalesce((data->>'isRelationship')::boolean, false) as is_rel,
    coalesce((data->>'isClient')::boolean, false)       as is_client,
    data->>'retainerActive' as retainer_active,
    data->>'retainerStart'  as retainer_start,
    case when data->>'dealValue' ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (data->>'dealValue')::numeric else 0 end  as deal_value,
    case when data->>'retainer'  ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (data->>'retainer')::numeric  else 0 end  as retainer,
    case when jsonb_typeof(data->'payments')    = 'array'
         then jsonb_array_length(data->'payments')    else 0 end as payment_rows,
    case when jsonb_typeof(data->'closedDeals') = 'array'
         then jsonb_array_length(data->'closedDeals') else 0 end as closed_deals,
    case when jsonb_typeof(data->'deals')       = 'array'
         then jsonb_array_length(data->'deals')       else 0 end as open_deals,
    case when jsonb_typeof(data->'payments') = 'array' then (
      select coalesce(sum(case when p->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
                               then (p->>'amount')::numeric else 0 end), 0)
      from jsonb_array_elements(data->'payments') p) else 0 end as payments_dollars
  from leads
)
select name, company, tier, stage, is_client,
       deal_value, retainer, retainer_active, retainer_start,
       payment_rows, payments_dollars, closed_deals, open_deals
from r
where is_rel and (deal_value <> 0 or retainer <> 0
   or payment_rows > 0 or closed_deals > 0 or open_deals > 0 or is_client)
order by payments_dollars desc, deal_value desc, retainer desc;


-- ---------------------------------------------------------------------------
-- QUERY 3 of 3 — APPOINTMENT FEES SITTING ON RELATIONSHIPS.
-- These are appointments a setter booked on a record classified as a
-- relationship. They are paid today, on the Money page. Narrowing that list
-- would stop paying them.
--
-- A booked appointment is work done regardless of how the record is filed, so
-- the likely right answer is that rep pay keeps the FULL list and only the
-- pipeline / MRR / revenue tiles narrow. Any row here is a person who would
-- notice.
-- ---------------------------------------------------------------------------
select
  l.data->>'name'    as relationship,
  l.data->>'company' as company,
  m->>'setById'      as set_by_id,
  m->>'setBy'        as set_by_name,
  m->>'status'       as status,
  m->>'start'        as starts,
  m->>'feeState'     as fee_state,
  m->>'fee'          as fee
from leads l, jsonb_array_elements(l.data->'meetings') m
where coalesce((l.data->>'isRelationship')::boolean, false)
  and jsonb_typeof(l.data->'meetings') = 'array'
  and coalesce(m->>'setById', m->>'setBy', '') <> ''
order by m->>'start' desc;
