-- AUDIT-APPT-RATE.sql — READ ONLY. Nothing here writes, drops or alters.
-- Every statement is a SELECT. Safe to run on production as it stands.
--
-- Two questions:
--   A. Does appointment_rate exist, and was REP-PAY-MIGRATION.sql applied?
--   B. Did any fee get APPROVED while the rate was misreading as 0, freezing a
--      $0 snapshot that a rate fix will not restate?


-- ===========================================================================
-- A. Is the migration in? One row, one line.
-- ===========================================================================
-- has_rate_column: REP-PAY-MIGRATION.sql part 1 (the column on crm_users)
-- has_payouts_tbl: part 2 (rep_payouts). Both 1 = fully applied.
-- Both 0 = never run. One and not the other = it failed halfway; re-run it,
-- it is idempotent.
-- has_whoami_rate: WHOAMI-RATE.sql. 0 until you run it.

select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='crm_users'
       and column_name='appointment_rate')                      as has_rate_column,
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='rep_payouts')   as has_payouts_tbl,
  -- a `returns table(...)` function does NOT appear in information_schema.columns;
  -- its output columns are OUT parameters, which live in pg_proc.proargnames
  (select count(*) from pg_proc
     where proname='crm_whoami'
       and 'appointment_rate' = any(proargnames))                as has_whoami_rate,
  (select count(*) from crm_users where role='rep')              as reps,
  (select count(*) from crm_users
     where role='rep' and coalesce(appointment_rate,0) > 0)      as reps_on_appt_pay;


-- ===========================================================================
-- B. Approved fees carrying a zero or absent snapshot rate.
-- ===========================================================================
-- Meetings live in leads.data->'meetings' (jsonb), so this walks the array.
-- A fee is approved when payApprovedAt is set. The snapshot is payRate, which
-- approveFee() writes as a JSON number — so anything that is NOT a number
-- (absent, null, empty) is treated as zero here, which is exactly the case we
-- are hunting.
--
-- IF THIS RETURNS NO ROWS, nothing was affected and there is nothing to correct.

select
  coalesce(nullif(l.data->>'company',''), l.data->>'name')  as client,
  coalesce(m->>'setBy', u.name, '(unknown)')                as rep,
  coalesce(m->>'title', m->>'mtype', '(untitled)')          as meeting,
  left(m->>'heldAt', 10)                                    as marked_held,
  left(m->>'payApprovedAt', 10)                             as approved_on,
  m->>'payApprovedBy'                                       as approved_by,
  m->'payRate'                                              as snapshot_rate,
  coalesce(u.appointment_rate, 0)                           as rep_rate_now,
  case when m ? 'payPaidAt' then 'PAID — money already sent'
       else 'approved, not yet paid' end                    as status
from leads l
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(l.data->'meetings') = 'array'
       then l.data->'meetings' else '[]'::jsonb end) as m
left join crm_users u on u.id::text = m->>'setById'
where m ? 'payApprovedAt'
  and coalesce(m->>'payVoidedAt', '') = ''          -- voided fees are not owed
  and coalesce(
        case when jsonb_typeof(m->'payRate') = 'number'
             then (m->>'payRate')::numeric end, 0) = 0
order by 5 desc nulls last, 2, 1;


-- ===========================================================================
-- B2. The same thing as one summary line, if you just want the count.
-- ===========================================================================

select
  count(*)                                                   as zero_rate_approvals,
  count(*) filter (where m ? 'payPaidAt')                    as of_which_already_paid,
  count(distinct m->>'setById')                              as reps_affected
from leads l
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(l.data->'meetings') = 'array'
       then l.data->'meetings' else '[]'::jsonb end) as m
where m ? 'payApprovedAt'
  and coalesce(m->>'payVoidedAt', '') = ''
  and coalesce(
        case when jsonb_typeof(m->'payRate') = 'number'
             then (m->>'payRate')::numeric end, 0) = 0;


-- ===========================================================================
-- B3. Context: every approved fee, whatever its rate. For comparison — if this
--     is also empty, no fee has EVER been approved and B cannot have rows.
-- ===========================================================================

select count(*) as approved_fees_all_time,
       sum(case when jsonb_typeof(m->'payRate')='number'
                then (m->>'payRate')::numeric else 0 end) as approved_total
from leads l
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(l.data->'meetings') = 'array'
       then l.data->'meetings' else '[]'::jsonb end) as m
where m ? 'payApprovedAt' and coalesce(m->>'payVoidedAt','') = '';


-- ===========================================================================
-- B4. And what has actually been PAID OUT, from the payouts table.
--     Payouts are the money that left. If this is empty, nobody has been paid
--     regardless of what was approved.
-- ===========================================================================

select p.paid_on, u.name as rep, p.amount, p.note
from rep_payouts p left join crm_users u on u.id = p.rep_id
order by p.paid_on desc;
