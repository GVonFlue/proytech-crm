-- ===========================================================================
-- Is note-based inference of payment METHOD worth building?
--
-- Run this BEFORE the inference path is written. Read-only.
--
-- WHY. Payments are created as {id, amount, date, note} at all three write
-- sites (LeadView composer, deal-panel prompt, retainer.js applyProposals).
-- There is no method field, so a card fee cannot be computed for history. The
-- only signal is the free-text note, whose placeholder says "e.g. Square
-- deposit" — a convention, never enforced.
--
-- The question is whether that convention was actually followed often enough
-- to be worth a feature. Three matches out of forty is not worth having: it
-- would cover almost nothing while implying the fee line means something.
--
-- THESE COUNTS ARE AN UPPER BOUND. "cash" also matches "cashed the check" and
-- "check" matches "checked in", so real usable coverage is at or below what
-- query 1 reports. If the upper bound is already thin, the real number is
-- thinner and the answer is no.
--
-- QUERY 2 IS THE MORE USEFUL ONE. It shows the actual vocabulary in the notes
-- rather than testing four words I guessed at. If the real convention turns out
-- to be "sq dep" or "zelle", that is only visible there.
--
-- Run the two queries ONE AT A TIME — the editor shows the last result only.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- QUERY 1 of 2 — COVERAGE. Both payment arrays, flattened.
-- ---------------------------------------------------------------------------
with p as (
  select 'setup' as kind,
         case when e->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (e->>'amount')::numeric else 0 end as amount,
         coalesce(e->>'note','') as note
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'payments') = 'array'
         then l.data->'payments' else '[]'::jsonb end) e
  union all
  select 'retainer',
         case when e->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (e->>'amount')::numeric else 0 end,
         coalesce(e->>'note','')
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'retainerPayments') = 'array'
         then l.data->'retainerPayments' else '[]'::jsonb end) e
)
select
  count(*)                                                          as payments_total,
  count(*) filter (where btrim(note) = '')                          as note_empty,
  count(*) filter (where note ~* 'square|\ysq\y')                   as says_square,
  count(*) filter (where note ~* 'venmo')                           as says_venmo,
  count(*) filter (where note ~* 'cash')                            as says_cash,
  count(*) filter (where note ~* 'check|cheque')                    as says_check,
  count(*) filter (where note ~* 'zelle|paypal|stripe|\yach\y|wire|transfer') as says_other_rail,
  count(*) filter (where btrim(note) <> '' and note !~*
        'square|\ysq\y|venmo|cash|check|cheque|zelle|paypal|stripe|\yach\y|wire|transfer')
                                                                    as note_but_no_match,
  round(sum(amount), 2)                                             as dollars_total,
  round(sum(amount) filter (where note ~* 'square|\ysq\y'), 2)      as dollars_says_square
from p;

-- ---------------------------------------------------------------------------
-- QUERY 2 of 2 — THE ACTUAL VOCABULARY. Every distinct note, most used first.
-- This is what decides whether inference is worth it, and on which words.
-- ---------------------------------------------------------------------------
with p as (
  select case when e->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (e->>'amount')::numeric else 0 end as amount,
         coalesce(e->>'note','') as note
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'payments') = 'array'
         then l.data->'payments' else '[]'::jsonb end) e
  union all
  select case when e->>'amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (e->>'amount')::numeric else 0 end,
         coalesce(e->>'note','')
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'retainerPayments') = 'array'
         then l.data->'retainerPayments' else '[]'::jsonb end) e
)
select lower(btrim(note)) as note, count(*) as payments, round(sum(amount), 2) as dollars
from p
where btrim(note) <> ''
group by 1
order by payments desc, dollars desc
limit 60;
