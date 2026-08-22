# A spreadsheet cell counts as human contact

**Status:** open. Found 2026-08-22, immediately after the touch-clock work, by
chasing why two measurement runs both reported 34 never-contacted leads.

**Class:** the same one as TOUCH-COUNT-FINDING and REAL-TOUCH-FINDING — a
number nobody chose, made wrong by a default. This one **undercuts the fix
those two just shipped.**

---

## What happens

`ImportModal.buildLead` maps a CSV `note` column onto `f.note`, then calls
`mkLead(f)`, which writes it as an activity:

```js
const acts=[{id:uid(),ts:createdAt,type:'Note',text:'Lead created.'}];
if(o.note) acts.unshift({id:uid(),ts:createdAt,type:'Note',text:o.note});
```

That note has:

| | |
|---|---|
| `type` | `'Note'` — identical to one typed in the app |
| `text` | whatever was in the spreadsheet cell (multiple mapped columns joined with `' \| '`) |
| `ts` | **`createdAt`** — the moment of import, not a moment of contact |
| `who` | **absent** |
| `derived` | **absent** — no marker of any kind |

`isRealTouch` counts any `Note` that is not one of the 21 machine-note prefixes.
A spreadsheet cell matches none of them, so it counts as a person having made
contact.

## What that costs

**54 leads across three batches are invisible to the untouched list.** Every
batch measured `with_real_touch = leads`: 21/21, 26/26, 7/7. A lead nobody has
ever contacted reads as worked, on every screen that asks the question — the
Dashboard's never-contacted count, the Monday Huddle, the rep's day panel, and
the `Cold` filter.

**And it is quietly flattering speed-to-lead.** The note is stamped at
`createdAt`, so `firstTouchHrs` computes **0.0 hours** for every imported lead
with a note. Those zeros sit in the same average we just measured at 3.5h. The
"paired 3.5h before and after" result is therefore diluted by a population of
instant fake responses — that comparison is still valid (the same leads
contributed the same zeros on both sides) but the *level* is not.

This is the sharp edge: the clock was fixed so machine notes stop counting, and
the importer is still injecting a note that does count.

## Should an imported note count as human contact?

**No.** Nobody contacted anyone; a column arrived. The note is worth keeping —
it is real information about the lead and belongs on the record — but it is not
an outreach, and it is not a *time* at which anything happened. Stamping it at
`createdAt` makes that explicit: the timestamp is when the file was uploaded.

The counter-argument, stated fairly: a CSV exported from another CRM may carry
genuine call logs in that column, and excluding it would discard evidence of
real contact. That is true, and it does not survive contact with the shape of
the data — one joined cell at one synthetic timestamp cannot reconstruct when
those calls happened. Keeping it visible on the record and out of the metrics
is the honest handling of information whose provenance is unknown.

## The fix, when it is its own PR

Mark it at the source and exclude it in one predicate:

1. `mkLead` stamps the imported note `imported:true` (and keeps writing it).
2. `isRealTouch` excludes `a.imported`.
3. The lead view labels it — `from the import` — so the row explains itself
   rather than looking like a note somebody wrote.

**Existing rows carry no marker**, so the change needs a backfill or a
recogniser for what is already stored. The identifiable shape is: the lead has
an `importBatch`, and the note's `ts` equals the lead's `createdAt` with no
`who`. That is exactly what `IMPORT-NOTE-MEASURE.sql` matches, and it is the
same rule a backfill would use.

Expect the numbers to move again, in the same direction as before: the
untouched list gets longer, and speed-to-lead gets **slower and more honest**
as the fake zeros leave. Run the measurement first — the size is not guessable
from here.

## Related

- `REAL-TOUCH-FINDING.md` — resolved; machine notes stopped counting.
- `TOUCH-COUNT-FINDING.md` — still open; the chip counts.
- `tests/systemnotes.mjs` lists this writer in `HUMAN_DYNAMIC` as *"mkLead seed
  — the note supplied with a seeded lead"*. That description is incomplete: the
  same path serves CSV import, where the note is a spreadsheet cell rather than
  anything a person wrote. The allowlist entry should say so.
