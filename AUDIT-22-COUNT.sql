-- AUDIT #22 — which leads were relying on the legacy fallback?
-- Run in Supabase → SQL Editor. Read-only.

-- 1. THE HEADLINE: how many, and how much, by close month.
--    Rows on or after 2026-08-01 are the ones that were being reported as
--    collected without a payment. Rows before it are the history the fallback
--    exists to protect.
select
  substr(data->>'closedAt', 1, 7)                      as closed_month,
  case when substr(data->>'closedAt',1,10) < '2026-08-01'
       then 'protected history' else 'WAS OVERSTATED' end as effect,
  count(*)                                             as leads,
  sum(coalesce((data->>'dealValue')::numeric, 0))      as deal_value
from leads
where coalesce(jsonb_array_length(data->'payments'), 0) = 0
  and coalesce(data->>'closedAt', '') <> ''
  and coalesce(data->>'isClient','false') = 'true'
group by 1, 2
order by 1 desc;

-- 2. THE LIST: exactly which leads need a payment backfilled.
select
  data->>'name'        as lead,
  data->>'closedAt'    as closed,
  (data->>'dealValue')::numeric as value
from leads
where coalesce(jsonb_array_length(data->'payments'), 0) = 0
  and substr(coalesce(data->>'closedAt',''),1,10) >= '2026-08-01'
  and coalesce(data->>'isClient','false') = 'true'
order by data->>'closedAt';

-- 3. And the same for archived closed deals, which the fallback also covered.
select
  data->>'name' as lead,
  d->>'label'   as deal,
  d->>'closedAt' as closed,
  (d->>'amount')::numeric as amount
from leads, jsonb_array_elements(coalesce(data->'closedDeals','[]'::jsonb)) d
where coalesce(jsonb_array_length(data->'payments'), 0) = 0
  and substr(coalesce(d->>'closedAt',''),1,10) >= '2026-08-01'
order by d->>'closedAt';
