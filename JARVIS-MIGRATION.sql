-- JARVIS-MIGRATION.sql
-- Run once in Supabase → SQL Editor. Idempotent: safe to run twice.
--
-- Adds a dollar column to the existing api_hits table so the assistant can be
-- capped by SPEND rather than by request count. api/_guard.js caps how many
-- calls happen, which tells you nothing about the bill — one question against a
-- big install can cost thirty times another.
--
-- Nothing else changes. api_hits already has RLS on with no policy, so no
-- browser client can read or write it; only the service key touches it.

alter table api_hits add column if not exists cost numeric(10,6);

comment on column api_hits.cost is
  'USD cost of a single AI call. Null for plain rate-limit rows. Summed per calendar month by api/_spend.js to enforce JARVIS_BUDGET.';

-- The ledger query filters on bucket + month and sums cost. The existing
-- (bucket, at desc) index already serves it; this partial index just keeps the
-- spend rows cheap to scan as the table fills with plain rate-limit rows.
create index if not exists api_hits_cost_at
  on api_hits (bucket, at desc) where cost is not null;

-- Verify:
--   select date_trunc('month', at) as month, round(sum(cost)::numeric, 4) as usd, count(*) as calls
--     from api_hits where bucket = 'jarvis:spend' group by 1 order by 1 desc;
