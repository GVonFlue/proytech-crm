# Speed to lead should only count leads that arrived before you typed them

**Status:** proposed, approved in principle, not built. Written up so the
decision is on the record before any code moves numbers again.

---

## The problem

`firstTouchHrs(l)` measures from `l.createdAt` to the first real touch.
`createdAt` is stamped when the record is **typed**, not when the lead
**arrived**. Those are the same event for most of the leads in this database.

`create()` in the lead view:

```js
const ts = new Date().toISOString();
const acts = [{ id: uid(), ts, type:'Note', text:'Lead created.', who }];
if (firstNote.trim()) acts.unshift({ id: uid(), ts, type: firstType, text: firstNote.trim(), who });
```

The first note carries the moment you clicked **Create**; `createdAt` was
stamped when you opened the form. The gap is how long you spent typing.

So for a lead you add *because* you just spoke to someone, speed-to-lead
measures how fast you saved the record. Measured: the median first touch is
under three minutes across the whole database, and only 21 of those are the
imported-note artefact.

**This is not a bad write.** The activity is honest — you did just talk to them.
The metric is asking a question the data cannot answer for that lead.

## The decision

**Scope the metric.** Keep it, and measure it only where arrival and typing are
genuinely different events. A lead created straight after a conversation is out
of the population, not recorded as a zero inside it.

The alternative — retiring it and keeping the untouched list, which needs no
timestamps at all — was considered and rejected: response time is worth knowing
for the leads where it means something, and imports are exactly that case.

## What counts as "arrived before you typed it"

Today, exactly one signal exists:

| signal | present? | meaning |
|---|---|---|
| `importBatch` | **yes** | the lead arrived in a file. `createdAt` is the upload, which is genuinely before any contact. |
| a form / webhook intake | **no** | there is no intake endpoint. `api/import-leads.js` only maps CSV columns; every other route is calendar, AI or auth. |
| `source` | yes, but unusable | free text, owner-editable, defaults vary. `'Website'` is set by hand after the fact, so it says where the lead came from, not how the record got here. |

So the scoped population is **imported leads today**, with room for a second
signal later. That is a small population and it should be said out loud on the
tile rather than implied — a metric over 54 leads labelled as though it covers
167 is the same class of dishonesty this whole thread has been removing.

## Shape of the change

1. **A field, not an inference.** Leads that arrive rather than get typed carry
   `arrivedAt` — set to the upload time on import, and to the intake time by any
   future endpoint. `firstTouchHrs` measures from `arrivedAt` and returns null
   when it is absent, so a typed lead contributes nothing rather than a zero.
2. `useMetrics` counts `firstTouch` over that population only.
3. **The tile says what it covers**: `median across N imported leads`, not
   `median across N leads`.
4. Existing imported rows have no `arrivedAt`; `importedAt` already exists and
   is the same instant, so the backfill is a rename rather than a guess. That is
   worth confirming per batch before relying on it, the same way
   `IMPORT-NOTE-BACKFILL.sql` step 1 works.

## Measure first

The numbers will move again and should be sized before anything ships:

- how many leads have `importedAt`, and how many of those have a real touch
- median and mean first touch over that population alone
- what the tile reads today vs what it would read

Same shape as `REAL-TOUCH-MEASURE.sql`, `LAST-TOUCH-MEASURE.sql` and
`IMPORT-NOTE-MEASURE.sql`. The query is not written yet — it should be written
against the final definition of the population, not before it.

## Related

- `IMPORT-NOTE-FINDING.md` — where this was found, and the 21-lead artefact that
  is a separate defect from this one.
- `TOUCH-COUNT-FINDING.md` — still open.
