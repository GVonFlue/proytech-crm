# The Dashboard / Money split — what it was, and the one number that moved

## What was wrong

Both screens computed money with the same `useMetrics()`, over different lists:

| Screen | List | Relationships |
|---|---|---|
| Dashboard | `scopedBiz` | excluded |
| Money | `scoped` | included |

`useMetrics` filters nothing itself, so a relationship carrying money was
already counted on one screen and not the other. On the Money page it reached
further than the tiles: `paymentTxns` put its payments in The Books, `billsMrr`
summed its retainer into MRR, `owedBy` added it to still-owed, and
`apptEarnings` paid a setter on it.

## What the measure found

`MONEY-SPLIT-MEASURE.sql`, run 2026-08-29 against production.

- 31 relationships, 177 business leads
- **1** relationship carrying money of any kind
- that record: stage `new`, `dealValue` 1499, one open deal, no retainer, no
  payments, no closed deals, not a client
- 5 appointments booked on relationships, **all set by an owner**, none with a
  fee state — so no rep pay had been affected either way

The delta was one $1,499 open deal. Nothing else.

## Which direction, and why

The record has a real deal, so under the rule this codebase already used — the
lead view keeps the Deal panel on a relationship that carries money — it
belongs in the pipeline. Aligning DOWN would have removed $1,499 from Money and
then put it back in the next change: two movements on a money screen for a net
of nothing, which is exactly the churn worth avoiding.

So it aligned UP.

**The Dashboard gained $1,499. The Money page did not move.**

| Tile | Before | After |
|---|---|---|
| Dashboard · open pipeline | X | **X + 1,499** |
| Dashboard · open leads | n | **n + 1** |
| Dashboard · weighted forecast | Y | **Y + 149.90** (1,499 × 0.10, `new`) |
| Dashboard · New Lead stage | c / v | **c+1 / v+1,499** |
| Pipeline board | — | **one extra card in New Lead** |
| MRR, revenue, won, still-owed | — | **unchanged** — no retainer, no payments |
| Money page, every tile | — | **unchanged** — it already counted this record |
| Rep pay | — | **unchanged** |

## The rule now

One predicate, `lib/lead.js`:

```js
hasRealDeal(l)       // open deals, closed deals, a retainer, or payments
countsAsBusiness(l)  // !isRelationship || hasRealDeal(l)
```

`moneyLeads` / `scopedMoney` replace `bizLeads` / `scopedBiz` on every screen
showing a money total: Dashboard, Pipeline, Money, Huddle, and the metrics
Jarvis quotes. The lead view's Deal panel calls the same function instead of
restating it inline, so a screen cannot disagree with the record it is reading.

`bizLeads` survives for Clients and Invoices, which are lists rather than sums.

## Rep pay is deliberately wider

`apptEarnings` keeps the FULL list, through a separate `payLeads` prop. A booked
appointment is work done however the record is filed. Narrowing it would have
been a pay cut delivered as a refactor. Decided before the rows were seen, and
the rows confirmed it rather than prompted it.
