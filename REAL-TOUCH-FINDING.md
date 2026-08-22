# Speed-to-lead counts the app talking to itself as a touch

> **RESOLVED.** Fixed by the PR that adds `tests/realtouch.mjs`. Measured first,
> over 146 real leads: the untouched list goes 7 → 34, and speed-to-lead does
> **not** move per lead (paired first touch 3.5h before and after, 0.0 hours
> added). The whole correction lands on the untouched list — every lead that was
> genuinely worked already had its real touch first. Numbers and the query are
> in `REAL-TOUCH-MEASURE.sql`.

**Status:** open. Found while unifying "cold" for the Relationships page
(PR D), written down rather than fixed in it. **This one is metrics, not
display** — unlike TOUCH-COUNT-FINDING.md, which only affected two chips on
one screen.

## The bug

`src/App.jsx` carries a third definition of a touch, weaker than either of the
other two:

```js
const REAL_TOUCH = a => a && a.ts && a.text !== 'Lead created.';
```

Any activity, of any type, whose text is not exactly `Lead created.`. It
excludes one machine note out of twenty-one. `Follow-up cleared.`,
`Stage moved: …`, `Deal value set to …`, `Reassigned from …` — all of them
count as somebody making contact with the lead.

## What reads it

| reads it | what goes wrong |
|---|---|
| `firstTouchHrs(l)` | hours from lead landing to first contact — **speed to lead**. A stage change made 4 minutes after import counts as the first touch. |
| `untouched` (dashboard) | leads nobody has contacted. A lead that only ever had its deal value edited drops out of the list. |
| the monthly `worked` count | leads worked in a month, inflated by any bookkeeping done that month. |

Speed to lead is the one that matters: it is a number you would use to judge how
fast a rep responds, and it is beatable without contacting anyone.

## Why it is not the same as the other two

Three predicates now exist for what is essentially one question:

| | what it counts | used by |
|---|---|---|
| `REACHED_TYPES` | Call/Text/Email/Meeting/Booked/Payment | touch counts, untouched filter, conversion ratio |
| `isSystemNote` + `isRealTouch` (PR A) | reached types, plus notes a person wrote | the lead view's fold, `lastTouch`, the Relationships page |
| `REAL_TOUCH` | **any activity except `Lead created.`** | speed to lead, untouched, monthly worked |

TOUCH-COUNT-FINDING.md said the metrics were unharmed because `REACHED_TYPES`
excludes notes entirely. That was true of `REACHED_TYPES` and **not** true of
`REAL_TOUCH`, which is a different predicate that the finding did not look at.

## The fix, when it is its own PR

Replace `REAL_TOUCH` with `isRealTouch` from `lib/lead` — the predicate PR A
already ships and tests, including the source-scanning guard that fails the
build when a new machine note appears.

Expect the numbers to MOVE, in the direction of being right:

- first-touch times get **longer** (bookkeeping stops counting as a response)
- the untouched list gets **longer**
- monthly worked counts get **smaller**

That is why it wants its own diff. Nothing else changes: no write path, no
stored field, no schema.

## How many leads are affected

Same shape of query as TOUCH-COUNT-FINDING.md, restricted to leads whose
earliest non-`Lead created.` activity is a machine note — those are the ones
whose speed-to-lead is currently a fiction.
