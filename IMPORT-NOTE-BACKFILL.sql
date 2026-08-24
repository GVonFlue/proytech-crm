-- ===========================================================================
-- Mark the import notes that were written before the marker existed.
--
-- New imports stamp imported:true at the source (mkLead). Rows already in the
-- database carry nothing, so isRealTouch keeps counting them until this runs.
-- That is deliberate: the app does not guess at runtime, so behaviour is the
-- same before and after a deploy, and the guessing happens once, here, where
-- it can be checked first.
--
-- ---------------------------------------------------------------------------
-- RUN STEP 1 FIRST AND READ IT. DO NOT SKIP.
-- ---------------------------------------------------------------------------
-- The recogniser is: the lead has an importBatch, the note's ts equals the
-- lead's createdAt, the note has no `who`, and it is not 'Lead created.'.
--
-- On the measured data it matched 21 of 54 imported leads. That is EITHER
-- correct — two batches had no note column mapped, so they have no import note
-- — OR the recogniser is missing them. Step 1 tells you which, per batch:
--
--   import_notes = leads     that batch mapped a note column; all found
--   import_notes = 0         that batch mapped no note column; nothing to mark
--   anything in between      the recogniser is WRONG. Stop. Do not run step 2.
--
-- A partial match means some other shape exists that this rule does not
-- describe, and marking only the ones it happens to catch would leave the
-- untouched list wrong in a way nobody can see.
-- ===========================================================================

-- ---- STEP 1: the check -----------------------------------------------------
select l.data->>'importBatch'                          as batch,
       count(*)                                        as leads,
       count(*) filter (where exists (
         select 1 from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
          where a->>'type' = 'Note'
            and (a->>'who') is null
            and a->>'ts' = l.data->>'createdAt'
            and coalesce(a->>'text','') not like 'Lead created.%'
       ))                                              as import_notes
  from leads l
 where l.data->>'importBatch' is not null
 group by 1
 order by 1;

-- ---- STEP 2: the backfill (only if every batch is all-or-nothing) ----------
-- Rewrites the activities array, stamping imported:true on the matching note.
-- Idempotent: a note already marked is rewritten to the same value.
--
-- update leads l
--    set data = jsonb_set(l.data, '{activities}', coalesce((
--          select jsonb_agg(
--                   case when a->>'type' = 'Note'
--                         and (a->>'who') is null
--                         and a->>'ts' = l.data->>'createdAt'
--                         and coalesce(a->>'text','') not like 'Lead created.%'
--                        then a || '{"imported":true}'::jsonb
--                        else a end
--                   order by ord)
--            from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb))
--                 with ordinality t(a, ord)
--        ), '[]'::jsonb))
--  where l.data->>'importBatch' is not null
--    and jsonb_typeof(l.data->'activities') = 'array'
--    and jsonb_array_length(l.data->'activities') > 0;
--
-- THE COALESCE AND THE LENGTH GUARD ARE NOT DECORATION. jsonb_agg over zero
-- rows returns NULL, and jsonb_set is STRICT — a NULL argument makes the whole
-- result NULL. So without them, a lead that has an importBatch and an EMPTY
-- activities array would have its entire `data` column set to NULL: name,
-- phone, stage, deal, all of it, silently, in the same statement that was
-- supposed to stamp a flag on a note. Either guard alone is enough; both are
-- here because this statement is run once, by hand, against production.
--
-- ---- STEP 3: confirm -------------------------------------------------------
-- select count(*) as marked_notes
--   from leads l, jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a
--  where (a->>'imported')::boolean is true;
