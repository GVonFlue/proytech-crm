# The Revenue Collected tile — the two checks, before the build

Two questions were asked before any code was written. Both had answers worth
writing down, and one of them changed what got built.

---

## 1. Do the Dashboard and the Money page disagree about revenue?

**No — and they cannot, by construction.**

Both screens render `useMetrics(scopedMoney, stages, settings, txns)` over the
**same list**, and both read `m.revenueMonth` from it. That was settled by
`16ae51c` (MONEY-SPLIT-FINDING.md), which put `scopedMoney` on every screen
showing a money total. The Dashboard's `Revenue Collected` and the Money page's
`Collected this month` are one number from one place.

So the picker did **not** get a second copy of the revenue arithmetic. It got
the month as an **argument**:

```js
revenueForMonth(leads, stages, txns, mKey)   // lib/lead.js
```

`useMetrics` calls it with today's month. The Dashboard's picker calls it with
whatever you picked. A picker cannot disagree with the tile it sits on, because
there is nothing to disagree with.

### What the check DID find

**Three things, none of them a disagreement about revenue.**

**a) The test that proves the two screens agree had been failing since 1
September, and would have kept failing.**

`tests/moneyaudit.mjs` §1 — *"the dashboard and the Money page agree on what was
collected"* — was red at HEAD, four assertions down, on a clean clone with no
changes. Both screens read **$4,150**; the test expected **$5,400**.

The screens were right. The **fixture had a clock in it**. Every "this month"
date in that file is built from the real current month via `D(dd)`, except one:
Justus's balance payment was written as a literal `2026-08-07`. Correct on the
day it was written, and silently wrong the moment the month rolled over —
$1,249.50 stopped landing in "this month" and the two figures the assertion
compared both moved together, so the *only* thing that broke was the expected
value.

That is the worst shape a failing test can have: it fails for a reason that has
nothing to do with what it checks, on a schedule, so the red gets dismissed —
and the day these two screens genuinely diverge, this is the test that was
supposed to say so.

Fixed by making the date relative like every other date in the cast. The stale
comment above §1 (which claimed $2,500 against assertions saying $5,400) was
rewritten to show the actual arithmetic.

**b) The Money page described the same number two ways on one screen.** See §2.

**c) The Money page recomputed `outstanding` instead of reading it.** The
Dashboard read `m.outstanding`; `MoneyPage` ran its own
`leads.reduce((a,l)=>a+owedBy(l,stages),0)` over the same list with the same
function. They agreed by luck, not by construction — which is precisely the
shape `src/App.jsx`'s own import comment calls "the ENGINEERING §2 bug, not a
tidiness one". Collapsed to `m.outstanding`.

### One difference that is deliberate, and is not a bug

The Money page's **Month by month** chart sums every ledger row by direction,
which includes **owner contributions** — so the current month's `in` bar is
larger than the `Collected this month` tile above it. That is intentional and
already documented in `tests/moneyaudit.mjs`: the chart is **cash flow**, the
tile is **revenue**, and money you put into your own business is cash that
arrived without being money the business earned. Left alone. Flagged because the
chart's axis says only "in", and a reader has no way to know which of the two
questions it is answering.

---

## 2. What has "still owed" actually been counting?

**Sold and not collected. Neither of the two candidates in the question.**

`owedBy(l, stages)`:

```
won?  = l.isClient || stage is a won stage        // else 0
       contractedTotal(l) - setupPaid(l)
```

- **It is not invoiced-and-unpaid.** `owedBy` has never read the `invoices`
  table. A sale nobody ever billed is in the number exactly like one whose
  invoice went past due last month.
- **It is not quoted work either.** An open lead at Discovery with a live
  proposal contributes **zero** — the `won` gate is the first line of the
  function. Quoted work has never been in this figure.
- **Retainers are excluded**, deliberately and separately.

So the honest description is a third one: **work you have won, minus what has
been paid against it.**

### The label that was false

`MoneyPage`, the *Next 90 days* tab, listed this figure as **"Invoiced, not yet
paid"** — in the cash-forecast view, where it decides what you think is coming
in. The tile eight lines above it called the same number "sold, not collected".
One of the two was wrong, and it was the one making a claim about paperwork.

Corrected to **"Sold, not yet collected"**. `GLOSSARY.md` now carries the
definition, which is where the ambiguity should have been settled years earlier
— the money section defined *Pipeline*, *MRR* and *cash basis*, and never
defined the number the owner looks at most.

---

## 3. What "still owed" means when you pick a past month

**It stays as-of-today, across every month, and the tile says so:**

> `$7,104 still owed today, all months`

Both alternatives in the question were considered and both lose:

- **"Owed as of the end of that month"** is **not computable** from this schema.
  An open deal row carries no date it was created, so there is no way to know
  what was outstanding on 31 August. It could be faked from close dates and
  payment dates and would be wrong for any deal opened mid-month — a plausible
  number that is not a real one, which ENGINEERING §2 calls the worst kind.
- **"Owed only on work won in that month"** is computable, but it **hides the
  oldest debts** — and the oldest debt is the one worth chasing. A tile that
  quietly shrinks from $7,104 to $1,500 because you looked at August is a tile
  that lost the money you most needed to see.

So the total does not move with the picker. What the picker adds instead is a
second clause naming its share, when a past month is selected:

> `$1,500 of it on work won in August 2026`

The picker links to the debt without redefining it.

---

## 4. What the breakdown shows, and the one thing it refuses to do

Clicking `$7,104 still owed` opens a panel of one row per debtor: who, how much,
how old. Every amount is `owedBy()` and only zeroes are dropped, so **the rows
sum to the header exactly** — the drilldown renders the tile rather than
offering a second opinion about it.

**The age column is two different facts and never blurs them.**

| basis | what it says | when |
|---|---|---|
| `invoice` | **20 days past due** · invoice INV-0031 | an unpaid invoice with a due date exists |
| `sale` | **sold 200 days ago** · not invoiced | no invoice — old, but not late |
| `unknown` | *no close or due date on record* | neither; renders a phrase, never `0` |

Calling an un-invoiced sale "overdue" would invent a deadline nobody agreed to,
and chase a client for being on time. Rendering an unknown age as `0` would make
"nobody knows" pixel-identical to "due today".

They are not sorted against each other either — the two ages are measured from
different events. Rows are grouped by **what you would do about them**: past-due
invoices (chase), then un-billed sales (bill, oldest first), then invoices not
yet due (nothing today), then records with no date (fix the record). Sorting
them as one number ranked a bill nobody had sent above a bill somebody was
ignoring.

`owedSince()` uses the **latest** close on a repeat client, not the earliest:
`owedBy` nets contracted against paid across the whole record, so no single deal
owns the balance and any date is an approximation. The latest one understates
the age, and understating is the safe direction — a number that reads too old
gets believed, one that reads too young gets checked. Same reasoning as the card
fee estimate.

---

## 5. The month picker does not remember

`useState(mKey)` re-evaluates on every mount, and nothing writes the choice to
settings or to `localStorage`. `tests/monthpicker.mjs` asserts the **absence**
of persistence directly — no settings write, no storage key, and a full unmount
and remount lands back on the current month — because a comment saying "not
persisted" is a request, not a constraint.
