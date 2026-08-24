# LEAD-NAMING-FINDING.md — "DNA" is a disposition wearing a lead's name

**Status: recorded, not investigated. Nothing in this file has been fixed.**

Found on 24 Aug 2026 while measuring something else — the disagreement between
the two untouched definitions (`TOWORK-DISAGREE-MEASURE.sql`). It is written
down because a finding nobody wrote down is a finding nobody has.

---

## What was seen

Two shapes turned up in the diagnostic output, neither of them the thing being
measured:

1. **`DNA` appears as a lead NAME three separate times**, with Logan's calls
   logged on them.
2. **Ken Lo Paintless Dent Repair exists twice**, as two separate leads.

## What is likely, and what is not yet known

**`DNA` is almost certainly "Did Not Answer."** If so it is not a data-quality
curiosity — it is a rep encoding a *disposition* in the only field that would
hold one, because until the disposition codes shipped there was nowhere else to
put it. The habit is evidence that the codes were overdue, and it predicts what
happens to any outcome the app gives a rep no field for.

**The cost, if that reading is right, is not the odd name.** It is that the
business's real name has been *overwritten*. A lead called `DNA` may no longer
carry the information needed to know who it was, which means this is not
necessarily repairable from the row — the phone number may be the only surviving
identifier.

**Ken Lo twice is more likely an ordinary duplicate.** There are two import
batch dates (21 and 22 Aug 2026), and the same business appearing in two sheets
is the usual way that happens. Untested.

## What would settle it

Neither query has been run. Both are read-only.

```sql
-- Three businesses renamed, or one lead entered three times?
-- Different phones => three real businesses whose names are gone.
-- Same phone       => one lead, entered three times.
select l.data->>'name' as name, l.data->>'company' as company,
       l.data->>'phone' as phone, l.data->>'importBatch' as batch,
       l.data->>'createdAt' as created, l.data->>'owner' as owner,
       jsonb_array_length(coalesce(l.data->'activities','[]'::jsonb)) as n_acts,
       (select string_agg(distinct a->>'type', ', ')
          from jsonb_array_elements(coalesce(l.data->'activities','[]'::jsonb)) a) as types
  from leads l
 where l.data->>'name' ilike '%DNA%' or l.data->>'company' ilike '%DNA%'
 order by created;

-- Duplicates across the whole table, by phone.
select coalesce(nullif(l.data->>'phone',''), '(no phone)') as phone,
       count(*) as n,
       string_agg(distinct coalesce(nullif(l.data->>'company',''), l.data->>'name'), ' | ') as leads,
       string_agg(distinct coalesce(l.data->>'importBatch','(typed)'), ' | ') as batches
  from leads l
 where coalesce((l.data->>'isRelationship')::boolean,false) = false
 group by 1
having count(*) > 1 and coalesce(nullif(l.data->>'phone',''),'') <> ''
 order by n desc;
```

## Why it matters before a new rep starts dialling

- A duplicate lead is **two people calling the same business**, which in a
  market this size is the reputational cost SOP-05 exists to avoid.
- A lead named `DNA` will be dialled again by someone who cannot tell it has
  already been worked, because the outcome is in the name rather than in
  anything the app counts.
- Both are invisible to every screen. Nothing in the CRM shows duplicates, and
  nothing flags a lead whose name is not a business name.

## What is NOT proposed here

No de-duplication feature, no name validation, no cleanup script. The shapes are
recorded and the queries are written; deciding what to do about them is a
separate piece of work that should start by running the two queries above.

The disposition codes (SOP-02, and `DISPOSITIONS` in `src/lib/lead.js`) already
remove the *reason* the `DNA` habit existed. Whether the existing rows are worth
repairing is the open question.
