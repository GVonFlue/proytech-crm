-- ===========================================================================
-- Backfill payment method + purpose from the note.
--
-- Payments were created as {id, amount, date, note} and how someone paid lived
-- in the note as free text. Measured before writing this (PAYMENT-METHOD-
-- MEASURE.sql): 12 payments, 12 with notes, 12 matching, 0 unknown — four exact
-- phrases and no variation:
--
--   square deposit   5   $2,997.60
--   square payment   5   $2,898.40
--   venmo deposit    1   $1,400.00
--   venmo payment    1     $999.00
--
-- Each is METHOD then PURPOSE, so both split off the same string cleanly.
--
-- WHAT MAKES THIS SAFE TO RUN
--   * It only ever ADDS keys. No amount, date, note or id is touched.
--   * It skips any payment that already has a method, so re-running is a
--     no-op and a payment recorded by hand is never overwritten by a guess.
--   * It matches on the WHOLE note, anchored, not a substring. A note it does
--     not recognise is left alone rather than guessed at — the 13th payment,
--     typed "sqare deposit", stays unknown, which is the honest outcome.
--   * Everything it writes is stamped methodSource='inferred'. The UI renders
--     inferred differently from recorded, and the card-fee memo counts them
--     separately, so a number read off an old note never passes as one a
--     person chose.
--
-- BEFORE: run section 1, note the count. AFTER: run it again, it should be 0.
-- Section 3 reverses the whole thing if you want it undone.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. BEFORE. Payments with no method, grouped by the note they carry.
-- ---------------------------------------------------------------------------
with p as (
  select lower(btrim(coalesce(e->>'note',''))) as note, e->>'method' as method
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'payments') = 'array'
         then l.data->'payments' else '[]'::jsonb end) e
  union all
  select lower(btrim(coalesce(e->>'note',''))), e->>'method'
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'retainerPayments') = 'array'
         then l.data->'retainerPayments' else '[]'::jsonb end) e
)
select note, count(*) as payments,
       count(*) filter (where coalesce(method,'') = '') as still_unset
from p group by note order by payments desc;

-- ---------------------------------------------------------------------------
-- 2. THE MIGRATION. Writes method, purpose and methodSource='inferred'.
--    Run it once; running it twice changes nothing.
-- ---------------------------------------------------------------------------
update leads l
set data = l.data
  || case when jsonb_typeof(l.data->'payments') = 'array' then jsonb_build_object('payments', (
       select jsonb_agg(
         case
           when coalesce(e->>'method','') <> '' then e          -- already set, leave it
           when lower(btrim(coalesce(e->>'note',''))) = 'square deposit'
             then e || '{"method":"Square","purpose":"Deposit","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'square payment'
             then e || '{"method":"Square","purpose":"Final payment","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'venmo deposit'
             then e || '{"method":"Venmo","purpose":"Deposit","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'venmo payment'
             then e || '{"method":"Venmo","purpose":"Final payment","methodSource":"inferred"}'::jsonb
           else e                                                -- unrecognised: left unknown
         end order by ord)
       from jsonb_array_elements(l.data->'payments') with ordinality t(e, ord)))
     else '{}'::jsonb end
  || case when jsonb_typeof(l.data->'retainerPayments') = 'array' then jsonb_build_object('retainerPayments', (
       select jsonb_agg(
         case
           when coalesce(e->>'method','') <> '' then e
           when lower(btrim(coalesce(e->>'note',''))) = 'square deposit'
             then e || '{"method":"Square","purpose":"Retainer","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'square payment'
             then e || '{"method":"Square","purpose":"Retainer","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'venmo deposit'
             then e || '{"method":"Venmo","purpose":"Retainer","methodSource":"inferred"}'::jsonb
           when lower(btrim(coalesce(e->>'note',''))) = 'venmo payment'
             then e || '{"method":"Venmo","purpose":"Retainer","methodSource":"inferred"}'::jsonb
           else e
         end order by ord)
       from jsonb_array_elements(l.data->'retainerPayments') with ordinality t(e, ord)))
     else '{}'::jsonb end
where jsonb_typeof(l.data->'payments') = 'array'
   or jsonb_typeof(l.data->'retainerPayments') = 'array';

-- ---------------------------------------------------------------------------
-- 3. UNDO. Strips ONLY what section 2 wrote — anything methodSource='recorded'
--    is a human's answer and is left exactly where it is.
-- ---------------------------------------------------------------------------
-- update leads l
-- set data = l.data || jsonb_build_object('payments', (
--       select jsonb_agg(case when e->>'methodSource' = 'inferred'
--                             then e - 'method' - 'purpose' - 'methodSource' else e end order by ord)
--       from jsonb_array_elements(l.data->'payments') with ordinality t(e, ord)))
-- where jsonb_typeof(l.data->'payments') = 'array';
