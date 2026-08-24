-- ===========================================================================
-- Do the Leads screen and the Dashboard disagree about who has been contacted?
--
-- Run this BEFORE proposing a fix to src/App.jsx:6053. It changes nothing —
-- one read-only select.
--
-- THE TWO DEFINITIONS, BOTH SHIPPING TODAY
--
--   LEADS SCREEN   src/App.jsx:6053, powering "to work"
--                    untouched = no activity whose TYPE is in REACHED_TYPES
--                  Raw types. Notes never count. `imported` is not consulted.
--
--   DASHBOARD      src/App.jsx:412 and :4260, powering "N never contacted"
--                    untouched = no activity matching isRealTouch
--                  A reached type OR a note a person actually wrote, and never
--                  an imported one.
--
-- These are the SAME QUESTION asked two ways, and the Leads screen's own
-- comment says "Only a real outbound counts" — which is what isRealTouch means.
-- So every row this returns is one screen contradicting the other about a lead
-- somebody is deciding whether to call.
--
-- WHY NOW
--
--   Direction B below is the pre-existing gap. Direction A is currently near
--   zero and is about to become large: once disposition codes ship, a
--   no-answer is a type:'Call' the dashboard declines and the Leads screen
--   counts, so every lead dialled once with no answer drops off "to work"
--   while correctly staying untouched everywhere else. Measure it before, so
--   the fix can be measured after.
--
-- Relationships are excluded: "to work" is a leads-screen count.
--
-- The 21 machine-note prefixes below are GENERATED from SYS_NOTE in
-- src/lib/lead.js, not transcribed. tests/systemnotes.mjs is what keeps that
-- list from going stale.
--
-- RUN 24 Aug 2026, 170 leads:
--
--   leads_total                 170
--   untouched_leads_screen       62
--   untouched_dashboard          35
--   disagree_total               29
--     A_leads_says_touched        1   dashboard says untouched
--     B_leads_says_untouched     28   dashboard says touched
--
-- WHAT THOSE TWO NUMBERS ACTUALLY ARE — read the dates before concluding.
--
--   B = 28, and 21 of them carry the IDENTICAL timestamp
--   2026-08-22T02:11:38.017Z. That is one import batch, not twenty-one leads
--   worked by hand: they are pre-mark import notes that isRealTouch still
--   counts as human contact. IMPORT-NOTE-BACKFILL.sql is what clears them, and
--   its own recogniser independently matched 21 of 54. So B is ~21 unbackfilled
--   imports plus ~7 genuinely note-worked leads, and the 6053 fix is sized
--   against 7.
--
--   A = 1, and it is NOT a rounding error or an artefact. It is Ken Lo
--   Paintless Dent Repair carrying a Call with disp:'NA' — one click on the
--   disposition picker, made on a preview deployment while this file was being
--   written. It is the disposition change working correctly and the Leads
--   screen disagreeing with it.
--
--   A IS NOT ONE ROW IN ANY LASTING SENSE. It is every lead a rep dials and
--   does not reach. At the SOP-01 benchmark for a new rep — one booking per
--   twenty-five to thirty dials — it is most of a week's work, and it grows
--   every day. That is what makes the 6053 fix urgent rather than tidy.
--
-- RUN AGAIN 24 Aug 2026, AFTER IMPORT-NOTE-BACKFILL.sql, same 170 leads:
--
--   leads_total                 170
--   untouched_leads_screen       62   unchanged — this rule was not touched
--   untouched_dashboard          56   was 35
--   disagree_total                8   was 29
--     A_leads_says_touched        1   unchanged
--     B_leads_says_untouched      7   was 28
--
-- THE ARITHMETIC CLOSES EXACTLY, WHICH IS THE POINT OF RUNNING IT TWICE.
--
--   untouched_dashboard  35 -> 56   = +21, the notes the backfill marked
--   B                    28 ->  7   = -21, the same leads leaving
--
-- Nothing else moved. Not one lead changed state for any reason other than the
-- backfill, and untouched_leads_screen did not move at all — as it must not,
-- since the backfill does not touch the rule that produces it. Had either
-- number drifted by even one, the recogniser would have caught something it
-- was not supposed to and the 6053 fix would have been sized against noise.
--
-- So the real disagreement is EIGHT leads: seven worked only by a note a person
-- typed, plus one Call carrying disp:'NA'. Seven is the one-off correction.
-- The one is the population that grows with every dial a rep does not connect.
--
-- A NOTE ON THIS FILE'S OWN HISTORY: the first version gated the dashboard side
-- on `ts is not null` and the leads side on nothing, which made it stricter
-- than the app on one side and could have manufactured a phantom direction-A
-- row. It did not, on this data — there are no null timestamps in it — but the
-- gate was wrong and is gone. isRealTouch does not check ts; only lastTouch
-- does, separately.
-- ===========================================================================

with act as (
  select l.id,
         a->>'ts'                                   as ts,
         a->>'type'                                 as type,
         a->>'disp'                                 as disp,
         coalesce(a->>'text','')                    as text,
         coalesce((a->>'derived')::boolean, false)  as derived,
         coalesce((a->>'imported')::boolean, false) as imported
    from leads l
    left join lateral jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a on true
   where coalesce((l.data->>'isRelationship')::boolean, false) = false
),
flagged as (
  select id,
         /* LEADS SCREEN — App.jsx:6053. Raw type, nothing else consulted. */
         (type in ('Call','Text','Email','Meeting','Booked','Payment')) as leads_screen_touch,
         /* DASHBOARD — isRealTouch. Note the two gates the other one has not
            got: `imported`, and (once dispositions ship) a non-contact disp. */
         (/* NO `ts is not null` HERE. isRealTouch (src/lib/lead.js:295) does
             not check ts, and neither untouched call site does — App.jsx:412
             and :6096 both ask `some(predicate)` and nothing more. Only
             lastTouch checks it, separately, at line 310.

             An earlier version of this file gated the dashboard side on ts and
             not the leads side, which made this query STRICTER THAN THE APP on
             one side only — manufacturing a disagreement that does not exist
             in the product. That is how the single direction-A row appeared. */
          not imported
          and (disp is null or disp in ('VM','CB','NF','SO','BK','HV','DNC'))
          and (
            type in ('Call','Text','Email','Meeting','Booked','Payment')
            or (type = 'Note' and not derived and not (
                   false
                or text like 'Lead created.%'
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
          )) as dashboard_touch
    from act
),
per_lead as (
  select id,
         bool_or(coalesce(leads_screen_touch,false)) as leads_screen,
         bool_or(coalesce(dashboard_touch,false))    as dashboard
    from flagged
   group by id
)
select
  count(*)                                                          as leads_total,
  count(*) filter (where not leads_screen)                          as untouched_leads_screen,
  count(*) filter (where not dashboard)                             as untouched_dashboard,
  count(*) filter (where leads_screen <> dashboard)                 as disagree_total,
  count(*) filter (where leads_screen and not dashboard)            as a_leads_says_touched,
  count(*) filter (where dashboard and not leads_screen)            as b_leads_says_untouched
from per_lead;

-- ---------------------------------------------------------------------------
-- The disagreeing leads themselves, so the count can be checked by opening a
-- few of them rather than believed. Newest first, capped at 40.
-- ---------------------------------------------------------------------------
with act as (
  select l.id,
         l.data->>'name'    as name,
         l.data->>'company' as company,
         l.data->>'createdAt' as created,
         a->>'ts'                                   as ts,
         a->>'type'                                 as type,
         a->>'disp'                                 as disp,
         coalesce(a->>'text','')                    as text,
         coalesce((a->>'derived')::boolean, false)  as derived,
         coalesce((a->>'imported')::boolean, false) as imported
    from leads l
    left join lateral jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a on true
   where coalesce((l.data->>'isRelationship')::boolean, false) = false
),
flagged as (
  select id, name, company, created,
         (type in ('Call','Text','Email','Meeting','Booked','Payment')) as leads_screen_touch,
         (/* NO `ts is not null` HERE. isRealTouch (src/lib/lead.js:295) does
             not check ts, and neither untouched call site does — App.jsx:412
             and :6096 both ask `some(predicate)` and nothing more. Only
             lastTouch checks it, separately, at line 310.

             An earlier version of this file gated the dashboard side on ts and
             not the leads side, which made this query STRICTER THAN THE APP on
             one side only — manufacturing a disagreement that does not exist
             in the product. That is how the single direction-A row appeared. */
          not imported
          and (disp is null or disp in ('VM','CB','NF','SO','BK','HV','DNC'))
          and (
            type in ('Call','Text','Email','Meeting','Booked','Payment')
            or (type = 'Note' and not derived and not (
                   false
                or text like 'Lead created.%'
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
          )) as dashboard_touch
    from act
),
per_lead as (
  select id, min(name) as name, min(company) as company, min(created) as created,
         bool_or(coalesce(leads_screen_touch,false)) as leads_screen,
         bool_or(coalesce(dashboard_touch,false))    as dashboard
    from flagged
   group by id
)
select name, company, created,
       leads_screen as leads_screen_says_touched,
       dashboard    as dashboard_says_touched,
       case when leads_screen and not dashboard
              then 'A: on the Leads screen it is worked, on the Dashboard it was never contacted'
            else 'B: on the Leads screen it is unworked, on the Dashboard it was contacted'
       end as disagreement
  from per_lead
 where leads_screen <> dashboard
 order by created desc
 limit 40;


-- ===========================================================================
-- DIAGNOSTIC 3 — the single direction-A lead, activity by activity.
--
-- Standalone, read-only. Answers: which activity makes the Leads screen say
-- "worked", and why does isRealTouch decline it?
--
-- Only three things can make a reached-type activity fail isRealTouch:
--   imported:true   — but mkLead only ever marks a type:'Note' (App.jsx:665),
--                     so the importer cannot produce this
--   a non-contact disposition — impossible, no disp exists in this database yet
--   nothing else    — isRealTouch has no other gate
--
-- So if this lead really is a direction-A row, one of the first two must be
-- true. If neither is, the row was an artefact of the `ts is not null` gate
-- this file used to carry, and there is no real disagreement to fix.
-- ===========================================================================
select l.data->>'name'                                   as lead,
       l.data->>'importBatch'                            as batch,
       ord                                               as pos,
       a->>'type'                                        as type,
       a->>'ts'                                          as ts,
       (a ? 'ts')                                        as has_ts_key,
       a->>'disp'                                        as disp,
       a->>'imported'                                    as imported,
       a->>'who'                                         as who,
       left(coalesce(a->>'text',''), 70)                 as text,
       (a->>'type' in ('Call','Text','Email','Meeting','Booked','Payment'))
                                                         as leads_screen_counts_it
  from leads l
  cross join lateral jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb))
             with ordinality t(a, ord)
 where l.data->>'name' ilike '%Ken Lo%'
    or l.data->>'company' ilike '%Ken Lo%'
    or l.data->>'company' ilike '%Paintless%'
 order by ord;

-- ===========================================================================
-- DIAGNOSTIC 4 — is direction B mostly unbackfilled imports?
--
-- Standalone, read-only. Splits the B set using the RECOGNISER FROM
-- IMPORT-NOTE-BACKFILL.sql — deliberately the same rule, not a second one.
-- Two rules that disagree is how a partial match goes unnoticed.
--
-- Recogniser: the lead has an importBatch, the note's ts equals the lead's
-- createdAt, the note has no `who`, and it is not 'Lead created.'.
--
-- Expected, if the reading is right:
--   b_total                       28
--   b_unmarked_import_note        21   -> IMPORT-NOTE-BACKFILL.sql clears these
--   b_genuinely_note_worked        7   -> the real size of the 6053 fix
-- ===========================================================================
with l as (
  select id, data
    from leads
   where coalesce((data->>'isRelationship')::boolean, false) = false
),
scored as (
  select l.id,
         l.data->>'name'    as name,
         l.data->>'company' as company,
         l.data->>'importBatch' as batch,
         /* the Leads screen: any reached type at all */
         exists (select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
                  where a->>'type' in ('Call','Text','Email','Meeting','Booked','Payment')
                ) as leads_screen_touch,
         /* the backfill's recogniser, plus "not already marked" */
         exists (select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
                  where a->>'type' = 'Note'
                    and (a->>'who') is null
                    and a->>'ts' = l.data->>'createdAt'
                    and coalesce(a->>'text','') not like 'Lead created.%'
                    and (a->>'imported') is null
                    and l.data->>'importBatch' is not null
                ) as unmarked_import_note
    from l
)
select count(*) filter (where not leads_screen_touch)                             as b_candidates,
       count(*) filter (where not leads_screen_touch and unmarked_import_note)    as b_unmarked_import_note,
       count(*) filter (where not leads_screen_touch and not unmarked_import_note) as b_other
  from scored;

-- ---------------------------------------------------------------------------
-- DIAGNOSTIC 4b — the leads that are NOT explained by the import note.
-- These are the ones the 6053 fix is actually for. Open a couple.
-- ---------------------------------------------------------------------------
with l as (
  select id, data
    from leads
   where coalesce((data->>'isRelationship')::boolean, false) = false
)
select l.data->>'name'    as name,
       l.data->>'company' as company,
       l.data->>'createdAt' as created,
       l.data->>'importBatch' as batch,
       (select string_agg(distinct a->>'type', ', ')
          from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a) as types_present,
       (select left(string_agg(coalesce(a->>'text',''), ' | '), 120)
          from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
         where a->>'type' = 'Note'
           and coalesce(a->>'text','') not like 'Lead created.%') as notes
  from l
 where not exists (select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
                    where a->>'type' in ('Call','Text','Email','Meeting','Booked','Payment'))
   and not exists (select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
                    where a->>'type' = 'Note'
                      and (a->>'who') is null
                      and a->>'ts' = l.data->>'createdAt'
                      and coalesce(a->>'text','') not like 'Lead created.%'
                      and (a->>'imported') is null
                      and l.data->>'importBatch' is not null)
   and exists (select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
                where a->>'type' = 'Note'
                  and coalesce((a->>'imported')::boolean,false) = false
                  and coalesce(a->>'text','') not like 'Lead created.%')
 order by l.data->>'createdAt' desc;
