-- AUDIT-CALL-TYPES.sql — READ ONLY. Every statement is a SELECT.
-- REP-AUDIT #9: the composer defaults to Note, so calls logged without
-- changing the type fall out of REACHED_TYPES and stop counting as a touch.
--
-- WHAT YOU CAN AND CANNOT LEARN FROM THE DATA
--
-- A human-typed activity is {id, ts, type, text, who}. A SYSTEM-written one is
-- the same shape. There is NO field marking which is which, so nothing in the
-- database says "this Note was typed by a person who meant Call". The type is
-- the only record of intent, and it is the field that is wrong.
--
-- So this cannot give you a number. It gives you three, narrowing:
--
--   Q2  Notes at all                      — mostly machine-written breadcrumbs
--   Q3  Notes a HUMAN typed               — after removing known system texts
--   Q4  ...whose wording sounds like a call — a candidate list to read, not a
--                                             verdict to apply
--
-- Q4 is a heuristic on free text. "spoke to them" could be a call or a corridor
-- conversation. Treat it as an upper bound and read the rows.
--
-- Q5 is the one that matters: how many leads' touch status actually changes.


-- ===========================================================================
-- Q1. The shape of the data. Where does Note sit against everything else?
-- ===========================================================================
select a->>'type' as type, count(*) as rows,
       round(100.0*count(*)/sum(count(*)) over (), 1) as pct
from leads l
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(l.data->'activities')='array'
       then l.data->'activities' else '[]'::jsonb end) as a
group by 1 order by 2 desc;


-- ===========================================================================
-- Q2 + Q3. Split the Note pile into machine-written and human-typed.
-- ===========================================================================
-- The app writes Note rows for its own bookkeeping — lead created, stage
-- moved, payment confirmed, deal closed and so on. Those are generated from
-- fixed templates, so they can be matched exactly. Some also carry a marker
-- field (dealEdit, meetingId, fromLog, dealWas) no human note has.
--
-- If `system` dwarfs `human`, most of the Note pile was never a mis-typed
-- anything and #9's blast radius is small.

with acts as (
  select l.id as lead_id, l.data->>'name' as lead, a
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'activities')='array'
         then l.data->'activities' else '[]'::jsonb end) as a
), notes as (
  select *, (
    a ?| array['dealEdit','meetingId','fromLog','dealWas']
    or a->>'text' like 'Lead created%'          or a->>'text' like 'Stage moved:%'
    or a->>'text' like 'Signed —%'              or a->>'text' like 'Converted to client%'
    or a->>'text' like 'Reassigned from %'      or a->>'text' like 'Reverted to lead%'
    or a->>'text' like 'Close date set to %'    or a->>'text' like 'Phase → %'
    or a->>'text' like 'Payment confirmed %'    or a->>'text' like 'Payment marked as not collected%'
    or a->>'text' like 'Invoice %marked unpaid%'or a->>'text' like 'Deal closed: %'
    or a->>'text' like 'New build started: %'   or a->>'text' like 'Sponsorship logged: %'
    or a->>'text' like 'Commission approved%'   or a->>'text' like 'Commission voided%'
    or a->>'text' like 'Dated: %'
  ) as system_written
  from acts where a->>'type' = 'Note'
)
select case when system_written then 'system-written' else 'human-typed' end as origin,
       count(*) as note_rows
from notes group by 1 order by 2 desc;


-- ===========================================================================
-- Q4. Human-typed Notes whose wording sounds like a call. THE CANDIDATE LIST.
-- ===========================================================================
-- Read these. Do not run an UPDATE off them.

with acts as (
  select l.id as lead_id, coalesce(nullif(l.data->>'company',''), l.data->>'name') as lead, a
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'activities')='array'
         then l.data->'activities' else '[]'::jsonb end) as a
)
select left(a->>'ts',10) as on_date, a->>'who' as logged_by, lead,
       left(a->>'text', 90) as text
from acts
where a->>'type'='Note'
  and not (a ?| array['dealEdit','meetingId','fromLog','dealWas'])
  and a->>'text' !~ '^(Lead created|Stage moved:|Signed —|Converted to client|Reassigned from |Reverted to lead|Close date set to |Phase → |Payment confirmed |Payment marked as|Invoice |Deal closed: |New build started: |Sponsorship logged: |Commission (approved|voided)|Dated: )'
  and a->>'text' ~* '\m(call(ed|ing)?|phoned?|rang|spoke|speaking|voicemail|vm|left (a )?(message|msg)|no answer|didn.?t pick|pick(ed)? up|dial(l)?ed|got (a )?hold|reached (him|her|them)|connected with)\M'
order by 1 desc;


-- ===========================================================================
-- Q5. THE ONLY NUMBER THAT MATTERS: leads whose touch status is actually wrong.
-- ===========================================================================
-- A lead counts as untouched when NO activity has a REACHED_TYPES type
-- ('Call','Text','Email','Meeting','Booked','Payment'). A lead that is
-- currently untouched but carries a call-sounding human Note is a lead the CRM
-- is telling you nobody has contacted, wrongly.
--
-- If this is 0, every mis-typed Note is on a lead that already has another
-- real touch, the display is imprecise but no count or filter is wrong, and
-- backfilling buys you nothing.

with acts as (
  select l.id as lead_id, coalesce(nullif(l.data->>'company',''), l.data->>'name') as lead, a
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'activities')='array'
         then l.data->'activities' else '[]'::jsonb end) as a
), per_lead as (
  select lead_id, max(lead) as lead,
    bool_or(a->>'type' in ('Call','Text','Email','Meeting','Booked','Payment')) as has_real_touch,
    bool_or(a->>'type'='Note'
       and not (a ?| array['dealEdit','meetingId','fromLog','dealWas'])
       and a->>'text' ~* '\m(call(ed|ing)?|phoned?|rang|spoke|voicemail|left (a )?message|no answer|dial(l)?ed)\M'
    ) as has_callish_note
  from acts group by lead_id
)
select count(*) filter (where not has_real_touch and has_callish_note) as leads_wrongly_untouched,
       count(*) filter (where not has_real_touch)                      as leads_untouched_now,
       count(*)                                                        as leads_total
from per_lead;


-- ===========================================================================
-- Q6. Name them, so the list is short enough to fix by hand if it is short.
-- ===========================================================================

with acts as (
  select l.id as lead_id, coalesce(nullif(l.data->>'company',''), l.data->>'name') as lead, a
  from leads l
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(l.data->'activities')='array'
         then l.data->'activities' else '[]'::jsonb end) as a
), per_lead as (
  select lead_id, max(lead) as lead,
    bool_or(a->>'type' in ('Call','Text','Email','Meeting','Booked','Payment')) as has_real_touch,
    max(case when a->>'type'='Note'
         and a->>'text' ~* '\m(call(ed|ing)?|phoned?|rang|spoke|voicemail|left (a )?message|no answer|dial(l)?ed)\M'
        then left(a->>'text',80) end) as the_note
  from acts group by lead_id
)
select lead, the_note from per_lead
where not has_real_touch and the_note is not null
order by lead;
