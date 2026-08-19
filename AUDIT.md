# AUDIT.md — every number in this CRM

Read against `ENGINEERING.md` §2 ("two screens must never disagree") and §4
(money rules). **Findings only. No code was changed.**

## Status

**Fixed**, tests in `tests/moneyaudit.mjs`, each written to fail against the old
code — verified by stashing the fix and re-running:
**#1**, **#2**, **#3**, **#4**, **#5**, **#17** (Pipeline off), **#8**, **#19**, **#6**, **#7**, **#21**, **#22**.

**Still open:** #9, #10, #11, #12, #16, #20, and the new **#23**.

**Found while fixing** — added below as #19 and #20.

Method: traced each displayed metric back to the function that produces it, by
reading `src/App.jsx`, `src/lib/goals.js`, `MIGRATION.sql` and the API handlers.
Everything below cites a line number so it can be checked rather than believed.

**What this audit did NOT do:** run the app against real data. Every finding is
from reading the code. Where a bug's *severity* depends on data you have
(whether any client actually has an upsell, say), I have said so rather than
guessed.

---

## A. The map — metric → source → screens → duplicated?

| Metric | Computed by | Shown on | Two computations? |
|---|---|---|---|
| Open pipeline $ | `useMetrics` → `pipelineValue` (3419) | Dashboard tile (3922), Pipeline page (4928) | **YES** — Pipeline computes `totalOpen` locally |
| Weighted forecast | `useMetrics` → `weighted` (3419) | Dashboard (3923 fallback), Pipeline (4929), Analytics (5570) | Shared |
| Revenue / collected this month | `useMetrics` → `revenueMonth` (3459–3472) | Dashboard tile (3923), its drilldown (3941) | **YES** — Money page uses `thisIn` (6002) |
| Collected (Money page) | `sum(inMonth(mKey),'in')` over `txns + paymentTxns` (6002) | Money page tile (6045) | **YES** — see #1 |
| Still owed | `owedBy()` (640) summed into `outstanding` (3471) | Dashboard tile sub (3923), rev drilldown (3947), Money "Owed to you" (6023) | Money recomputes as `owedNow` (6023), same formula |
| Balance due (per client) | **inline** `dealValue + retainer − paymentsPaid` (5436) | Client card | **YES** — ignores `closedDeals`; see #2 |
| Deals closed (count) | `closedMonth` (3438–3452) | Dashboard tile (3924) | Shared |
| Deals closed ($) | `wonRowValue()` (3722) | "Deals closed" drilldown (3962) | **YES** — tile subtitle shows `revenueMonth` |
| Closed setup revenue | `wonValue` (3390) | Analytics "Closed Setup Rev" (5568) | Shared, but see #4 |
| Revenue by client | `byClient` (3515) — **booked, not cash** | Money → Where it goes | **YES** — different basis to every other revenue number; see #3 |
| MRR | `useMetrics` → `mrr` (3391) | Dashboard (3925), Analytics (5569) | **YES** — Money page recomputes (6022) |
| Avg deal size | `wonValue / wonValued` (3405) | Analytics (5571 sub) | Shared, but numerator ≠ denominator population; see #4 |
| Win rate | `wonForRate/(wonForRate+lostCount)` (3404) | Analytics (4085), Analytics KPI (5571) | **YES** — Pipeline recomputes (4896–4898) |
| Win rate sample | — | Analytics card says `{wonCount}W · {lostCount}L` (4085) | **Mismatched with its own rate**; see #5 |
| Meeting→close | `meetCloseRate` (3494) | Analytics (4082) | Shared. Sample size shown ✓ |
| Show rate | `showRate` (3479) | Dashboard (3990), Analytics (4083) | Shared. Sample size shown ✓ |
| Funnel step / close rate | `funnelOf()` (683) | Analytics funnel (4068) | Shared. **No sample size on close rate**; see #7 |
| Leaderboard | `crm_leaderboard()` SQL | Rep view | **YES** — owner uses `localBoard()` (3253) |
| Meeting counts | `meetingsOf()` | Everywhere | Shared ✓ — this one is done right |
| Commission | `cmsnOf()` | Leaderboard, dashboard, client record | Shared ✓ |

---

# Findings, worst first

## 1. "Collected this month" is two different numbers on two screens

**Where:** Dashboard tile (3923, `m.revenueMonth`) vs Money page tile (6045,
`thisIn`).

They share a label and compute different things:

- `revenueMonth` = payments dated this month **plus the legacy fallback** (a
  lead closed this month, cash confirmed, with no payment rows — ENGINEERING §4).
- `thisIn` = every `type:'income'` row in `txns + paymentTxns(leads)`. It
  **includes manual income transactions** you typed into The Books, and
  **excludes the legacy fallback entirely** (`paymentTxns` only maps
  `l.payments`, 5979).

So on the same day, for the same month, the two tiles disagree in both
directions: Money is higher by any manual income, and lower by every
pre-payments deal. This is the exact §2 failure, on the single most important
number in the product.

**Fix:** one function. `revenueMonth` should be the source, extended to include
manual income rows if that is wanted, and the Money tile should read it. Roughly
a day including tests, because the definition question ("is a manual income row
revenue?") has to be answered first — it is a decision, not a bug.

---

## 2. A client's balance-due ignores every closed deal, and can hide a real debt

**Where:** client card, 5436:

```js
const owed = num(l.dealValue) + (l.retainerActive ? num(l.retainer) : 0);
const rem  = owed - paymentsPaid(l);
```

`dealValue` is the sum of **open** deals only — closing a deal moves its money
into `closedDeals` and rewrites `dealValue` to what is left (7266). So this
subtracts *all payments ever made* from *open deals only*.

A client with a $5,000 closed deal, $2,000 paid, and nothing open:
`owed = 0`, `rem = −2,000`, and the badge is **hidden** by the `rem > 0` guard.
The Money page, using `owedBy()`, correctly says **$3,000 owed**.

So the screen showing the client says nothing is due; the screen showing the
money says three grand is. Worse than a wrong number — it is a *silent* wrong
number.

`owedBy()` already exists and already encodes the won-or-client rule. This is
one line calling the wrong thing.

**Fix:** replace with `owedBy(l, stages)`. An hour, plus a test that a client
with closed deals and partial payments shows a balance on the card.

---

## 3. "Revenue by client" is booked value, not cash — and is labelled revenue

**Where:** `byClient` (3515–3521), rendered under Money → Where it goes.

```js
const lifetime = closed + current;   // closedDealsTotal + current dealValue
```

`payments` are never read. A client invoiced $10,000 who has paid $3,000 shows
**$10,000**. Every other revenue number in the product is cash-basis, by
deliberate design (v21, ENGINEERING §4 "Revenue is cash").

The in-code comment calls it "lifetime booked value", which is honest — but the
screen calls it revenue, and it sits inside the Money page next to cash figures.

**On your split-payment test:** a deposit in July and a balance in August land
in two different months **on the dashboard tile and its drilldown** (verified:
both read `paidInMonth`, 624/3462/3941). They do **not** split here, because
this table has no month dimension at all — the whole contract value appears the
moment the deal closes.

**Fix:** either rename to "Booked by client" and say so in the sub-copy, or add
a paid/outstanding split per client from `paidTotal`/`owedBy`. The second is
more useful and is half a day.

---

## 4. Avg deal size and "Closed Setup Rev" divide one population by another

**Where:** 3390, 3405, 5568.

```js
if (s.lost) lostCount++;  wonValue += closedDealsTotal(l);   // runs for EVERY lead
...
const avgDeal = wonValued > 0 ? wonValue / wonValued : 0;
```

- `wonValue` accumulates `closedDealsTotal(l)` for **every lead in the CRM** —
  the statement is outside the `if (s.won)` block. A lead that closed a deal and
  was later marked **lost** still contributes to won revenue.
- `wonValued` only counts leads that are **won, cash-confirmed, and have a
  non-zero `openSaleValue`**.

So the numerator includes archived closed deals from leads the denominator never
counted. For a repeat client with three closed deals, all three inflate the
average while the client contributes at most 1 to the divisor. **Avg deal size
reads high, and gets worse the more repeat business you do.**

The retainer-only exclusion you asked about **is correctly implemented**
(`if (v > 0) wonValued++`, 3386) and well commented. The bug is upstream of it.

"Closed Setup Rev" (5568) shows `wonValue` with `{wonCount} deals` underneath —
same mismatch, and it is called *setup* revenue while including archived deals
that may not have been setup fees.

**Fix:** decide whether `wonValue` means "all money ever won" or "setup revenue
from current wins", then make the divisor the matching population. Half a day,
and it will move a number you have been looking at, so it needs a note in
BUILD-NOTES.

---

## 5. The win rate and the sample size printed under it disagree

**Where:** Analytics card, 4085.

```js
value = m.winRate                       // wonForRate / (wonForRate + lostCount)
d     = `of decided deals (${m.wonCount}W · ${m.lostCount}L)`
```

`winRate` uses `wonForRate = wonCount + wonPending` (3403) — every won lead.
The caption prints `wonCount` — **cash-confirmed wins only**.

With 2 confirmed wins, 3 awaiting payment and 5 losses: the card reads **50%**
over the caption **"(2W · 5L)"**, which is 29%. Anyone checking the maths
concludes the percentage is broken. It is not; the caption is.

**Fix:** print `m.wonForRate`. Ten minutes. Worth doing first — it is the
cheapest credibility win in this list.

---

## 6. The pipeline drilldown double-counts upsells and has no total — **FIXED**

**Where:** 3927–3939.

- `openLeads` rows show `num(l.dealValue)`, which for an open lead **includes**
  its upsell deals.
- `ups` = `leads.filter(l => upsellValueOf(l) > 0)` — **not restricted to won
  leads**, unlike `upsellValue` in `useMetrics` (which only accumulates inside
  `if (s.won)`, 3388).

An open lead carrying an upsell-stamped deal therefore appears **twice**, and
its upsell money is counted in both rows.

Separately: the drilldown's header is a **row count** ("7 open"), not a dollar
total. The tile shows a dollar figure the panel never restates, so the §2 rule
"a drilldown's total must equal the sum of its own rows" cannot even be checked
by eye.

**Fixed.** `ups` is now `won && upsellValueOf(l) > 0`, matching `useMetrics`,
and the header states the value as well as the row count.

Measured before the fix, with an open lead carrying a $700 upsell inside its
$2,200 `dealValue`: the panel listed it twice and its rows summed to **$3,800**
against a tile of **$3,100**. The test asserts the rows sum to the header and
the header equals the tile.

Note the panel survives the Pipeline tab being switched off (#17) — it hangs off
the dashboard tile, not the board.

---

## 7. Rates shown with no sample size — **FIXED**

Three of these, in order of how misleading they are:

- **Funnel close rate** (4074) — a per-stage percentage with no count beside it.
  `f.count` is rendered, but the close rate is `closed/reached[i]`, so a stage
  reached by 3 leads shows a confident-looking percentage. It even turns
  **red** below 50% (`.warn`), which is an alarm on a sample of three.
- **Pipeline moving** (4086) — `movingPct` over `openLeadsArr`; shows
  `{rotting} deals cold` but never the denominator.
- **Follow-up health** (3993) — shows `{fuOnTime}/{fuCleared}` **only when
  nothing is overdue**; when something is overdue the caption switches to the
  overdue count and the sample disappears behind a percentage.

`Meeting → Close` (4082) and `Show Rate` (4083) do this **correctly** and are
the model to copy — both print their own denominators and name what they
exclude.

**Fixed** with a shared `<Rate part whole warnBelow goodAbove>`. Below
`RATE_MIN_N` (5) it renders the raw figure — `3/4` — with **no percentage and no
colour**, and explains why on hover.

**Nine** sites, not the four this finding listed. The audit missed **Lead source
ROI**, which had its own hand-rolled floor of `s.total >= 3` — so one source
could be judged red on three leads while an identical rate elsewhere was not.
It was found by the pattern guard, not by reading.

**The pattern is enforced by a test, not by convention.** `tests/moneyaudit.mjs`
greps the source for `Math.round(…Rate*100)` outside the component and fails if
any exists, so a new rate cannot be written the old way without the suite
saying so. Run against the pre-fix code it lists all nine.

Also gated: the Pipeline Moving **card's** own `warn` class, which would
otherwise have coloured the card red while the rate inside it refused to
judge — the alarm coming back by the side door.

---

## 8. "Deals Closed" tile, its subtitle and its drilldown are three different numbers — **FIXED**

**Where:** tile 3924, drilldown 3962.

- Tile **value**: `m.closedMonth` — a count, this month.
- Tile **subtitle**: `` `${usd(m.revenueMonth)} setup` `` — **cash collected
  this month**, labelled "setup". A deal closed this month but paid next month
  is in the count and not in the subtitle.
- Drilldown **header**: `usd(wonShownTotal)` — the value of deals *closed* this
  month, a third figure again.

This is the panel ENGINEERING §2 already names as the canonical example of this
bug class. It was fixed once for scope (month vs all-time); the *basis* mismatch
(closed vs collected) is still there.

There is also a **count-vs-list** gap: `closedMonth` counts a lead that closed
this month even at $0 value, but the drilldown filters rows to `r.v > 0` (3733).
A $0 close makes the tile say 3 over a list of 2.

**Fixed** by making it one array. `useMetrics` now builds `closedRows`, and
`closedMonth` (the count), `closedMonthValue` (the tile subtitle) and the
drilldown's month rows are all read from it — so there is nothing left to
disagree with. The drilldown header states both numbers, so tile and panel can
be checked against each other by eye. $0 closes are listed.

In the `money.mjs` fixture the closed value and the collected value happen to be
the same $5,299, which is exactly why this survived: Paid Co and Level Up both
closed AND were collected in the same month. A deal closed in one month and paid
in the next is what pulls them apart, and `tests/moneyaudit.mjs` now has that
case.

---

## 9. "Revenue Collected" shows a forecast when no goal is set

**Where:** 3923.

```js
value = usd(G.revenue > 0 ? m.revenueMonth : m.weighted)
```

With no revenue goal configured, the tile labelled **"Revenue Collected"**
displays the **weighted pipeline forecast** — money that has not been collected
and may never be. The caption does change to "weighted forecast", but the label,
the big number and the green treatment all say collected.

A fresh install has no goals set, so this is what a new owner sees first.

**Fix:** change the label with the value, or show `$0 collected` with the
forecast as the caption. An hour.

---

## 10. The leaderboard is computed twice, in two languages

**Where:** `localBoard()` (3253, JS) and `crm_leaderboard()` (`MIGRATION.sql`).

The owner sees the local one; reps see the SQL one. The definitions match in
intent, but:

- SQL scopes the month with `to_char(now(), 'YYYY-MM')` — **UTC**.
- JS scopes with `todayISO().slice(0,7)` — **browser local time**.

On the 1st of a month, before UTC midnight, an owner in US Central and a rep can
see different monthly counts for the same rep. Minor in effect, but it is two
implementations of one fact, which §2 says will diverge.

**Fix:** have the owner call `crm_leaderboard()` too. It already exists and is
already granted to `authenticated`. Two hours.

---

## 11. MRR and "still owed" are each computed twice with the same formula

**Where:** `m.mrr` (3391) vs Money page `mrr` (6022); `m.outstanding` (3471) vs
Money page `owedNow` (6023).

Both duplicates are *currently* identical, so no number is wrong today. But
`useMetrics` is already called in that component (5995) — the duplicates are
gratuitous, and each is a place the next change can land on only one side.

**Fix:** use `m.mrr` and `m.outstanding`. Twenty minutes. Low urgency, high
value per minute.

---

## 12. Things that silently exclude, where the copy doesn't say so

- **`byClient` filter** (3520) drops any client with `lifetime`, `mrr` and
  `pending` all zero. A client who has paid you and whose deal was later removed
  vanishes from the list with no "0 shown" note.
- **"Invoiced, not yet paid"** (Money → Coming, 6072) is `owedNow`, which comes
  from `owedBy()` — contracted minus paid. **No invoice is consulted.** A deal
  you never invoiced appears under a heading claiming you did.
- **Analytics `bySource`** (5561) values a source with
  `num(l.dealValue) + num(l.retainer) * 12` for won leads. `dealValue` is
  **zero once a deal is closed properly**, so your best sources look worst. The
  dashboard's `sourceROI` (3512) has the same flaw.
- **`openSaleValue`** excludes upsell deals from won revenue by design (3390,
  well reasoned) — but nothing on screen says "upsells not included here".

**Fix:** copy changes for the first two, real work for `bySource`. Half a day
total.

---

## 13. Confirmed working — the parts I tried hardest to break

Stated because "we checked and it holds" is a finding too:

- **Cash-basis revenue holds** on the dashboard tile and its drilldown. Both
  read `paidInMonth`; a deposit in July and a balance in August land in their
  own months. The legacy fallback (closed, cash-confirmed, no payment rows) is
  applied identically in both (3462 / 3945) and is labelled *"no payments
  logged"* in the panel.
- **`owedBy()` correctly refuses to count open or lost leads** (645–647). Only
  `isClient` or a won stage can owe.
- **`dealsOf()` correctly refuses to fall through to legacy shapes once
  `closedDeals` exists** (676), which is what stops the double-count you hit
  with Justus. The comment there is accurate.
- **Closing a deal rewrites `dealValue` to the remaining open deals** (7266), so
  `closedDeals` and `dealValue` do not overlap.
- **`meetingsOf()` is genuinely the single source for meeting counts.** No
  competing implementation found anywhere.
- **`wonValued` correctly excludes retainer-only clients** from avg deal size
  (3386) — the bug in #4 is elsewhere.

---

# Ease of use

Walked as if new. Ordered by how much it costs you daily.

## 14. Money lives on three screens and the sidebar admits it

**Money**, **The Books** (embedded inside Money, but also its own concept) and
the dashboard's money tiles answer overlapping questions with, as above,
non-matching numbers. The code comment at 5983 says these were merged for
exactly this reason — the merge is half done: `Books` is still a separate
component with its own tiles, embedded via `embedded`.

**Worth:** one screen, four tabs, one set of numbers.

## 15. The lead modal is a long scroll of collapsed sections

`Sec()` (7280) renders every section collapsed, with a `jumpTo` that scrolls.
Opening a lead to answer "what did we agree?" means expanding the right one of
~10 sections. There is no default-open memory per section and no "expand all".

**Worth:** remember the last-opened section per user. Small.

## 16. Nothing tells you what a tile means

Every `Kpi` is clickable, but nothing indicates which ones open a drilldown —
`Speed to First Touch` and `Going Cold` do; `Monthly burn` does not. A tile that
looks identical and does nothing when clicked reads as broken.

**Worth:** a chevron on the ones that open.

## 17. The Pipeline — is it you, or is it the pipeline?

**It is the pipeline.** Specifically:

1. **It duplicates the dashboard's tiles** (Open Pipeline, Weighted Forecast,
   Win Rate — 4928–4930) using its own arithmetic (#0 in the table, and the
   duplicate win rate in #5). Opening it tells you nothing the dashboard didn't.
2. **Its only unique capability is drag-to-move-stage** — and the lead modal and
   the lead row's `▸` chevron (4915) both already move stages in fewer clicks
   from where you already are.
3. **Closed columns collapse by default** (4932), so the board shows only open
   work — which is correct, and also means the board is a *narrower* view of the
   leads list rather than a different one.
4. **It sorts by `dealValue` descending** — and `dealValue` is emptied when a
   deal closes properly, so the board's own sort degrades as you succeed.

A kanban earns its place when the *board is the workflow*: when moving a card
is the action, and the column tells you what to do next. Here the action is a
follow-up, and the thing that tells you what to do next is **Your day** and the
Follow-Up page. The pipeline is a picture of the same data with no verb attached.

**So: not your fault.** Two honest options — delete it (it is a `settings.modules`
toggle already, so this costs nothing and is reversible), or give it the one job
nothing else does: a **stalled-deals** board, columns by *time since last touch*
rather than stage, where dragging sets a follow-up. That would be a reason to
open it on a Monday.

I would switch it off for a fortnight and see if you miss it before building
anything.

## 18. Copy that claims more than the behaviour does

- **"Invoiced, not yet paid"** — no invoice is read (#12).
- **"Lifetime value across all deals"** (5436) — it is closed deals *plus
  current open ones*, so it includes money not yet won.
- **"Revenue by client"** — booked, not received (#3).
- **"Closed Setup Rev"** — includes archived deals that may not be setup (#4).
- **Deals Closed tile: "`$X` setup"** — that `$X` is cash collected (#8).

Each is a one-line copy fix and together they are most of why the money screens
feel untrustworthy.

---

## 19. `Money()` at 5609 is dead code, and I nearly fixed a bug in it — **DELETED**

Found while fixing #4. `function Money({leads,stages,settings})` renders
"Closed Setup Rev", a Win Rate KPI, "Avg Retainer" and several charts — and has
**zero call sites**. `grep -c '<Money[ /]'` returns 0; the only live `Money` is
`MoneyPage`.

I edited its "Closed Setup Rev" caption before noticing, and the test passed
while the screen never rendered. The live Avg Deal Size card is at **4165**, in
the dashboard's analytics section, and that is the one that needed changing.

This matters beyond tidiness: a duplicate of a metric that nobody can see is
still a duplicate that will be found by the next person searching for it and
"fixed" in the wrong place.

**Fix:** delete it, or wire it up if any of those charts are wanted. Half an
hour to delete, and the suite will tell you if it was reachable after all.

## 20. "retainer-only" counts more than retainer-only clients

The Avg Deal Size caption says `${m.wonCount - m.wonValued} retainer-only`.
`wonValued` counts won leads with a **live** setup value, so a client whose
deals have all been **archived into `closedDeals`** also lands in that
subtraction and is described as retainer-only. In the `money.mjs` fixture,
"Level Up" — which has a $1,299 closed deal and no retainer — is counted there.

The number is small and the direction is harmless, but the word is wrong.

**Fix:** count `l.retainerActive && openSaleValue(l) === 0 && !closedDealsTotal(l)`
explicitly rather than inferring it by subtraction. An hour.

---

## 21. "Owed" was computed two ways — **FIXED**

Reported from live data: `owedBy()` gave Justus **$763**; the lead's payments
panel gave **$1,011.75**. The panel added one month of retainer.

**`owedBy()` wins, and the retainer stays out of it.** Three reasons:

1. **A debt figure has to be able to reach zero and stay there.** A retainer
   recurs forever by design, so folding a month of it into "owed" makes the
   number permanently non-zero — which stops it meaning anything.
2. `owedBy()` is summed across every client into `outstanding` and shown as
   "Owed to you" and "Invoiced, not yet paid". A month of retainer per client
   would drift that total upward every month regardless of collection.
3. Retainer **payments** already land in `paidTotal` and reduce owed. Adding the
   retainer to the owed side as well moves the same recurring money in both
   directions — see #23.

MRR already answers "what recurs". The panel now shows it beside the balance —
*"plus $248.75/mo recurring — not counted in the balance"* — so nothing is lost,
and if you still want it inside, it is now a one-line change in **one** place.

## 22. The legacy fallback counted unpaid closes as collected — **FIXED**

Reported from live data: Poppell Insurance closed 17 Aug with no payment logged
and appeared in "Collected this month" for **$1,199**. Des Moines and Level Up
too.

The v21 fallback was meant to preserve pre-payment-tracking history
(ENGINEERING §4) but was never **date-bound**, so it kept firing forever: a
deposit tick with no payment row read as cash.

**Date-bounded, not dropped**, via `PAYMENTS_FROM = '2026-08-01'`. Dropping it
would restate past months downward, which §4 calls worse than the bug it fixes;
bounding it stops today's overstatement while leaving history intact, and you
can move the constant forward later once old months are backfilled.

**The coupling that made this one change, not two:** `owedBy()`'s "settled"
shortcut deliberately mirrored the fallback, so bounding revenue alone would
have made Poppell neither *collected* nor *owed* — money vanishing from both
sides. Both now read one predicate, `legacySettled()`.

The money moves into **owed**, and the Revenue tile now says *"N closed this
month with no payment logged"* so the gap is visible rather than silent.

## 23. Payments are not categorised as setup vs retainer — **OPEN**

Surfaced by #21. Retainer payments land in the same `payments` array as deposits
and balances, so on a retainer client `paidTotal` climbs past the one-off
contracted total every month. Two consequences:

- `owedBy()` clamps at zero, so **retainer payments can mask an unpaid setup
  fee**.
- The lead panel's "paid over the deal total" warning fired on every retainer
  client. Suppressed for them now, with an explanation, rather than left crying
  wolf — but that is a patch, not the fix.

**Fix:** a `kind` on each payment row (`setup` | `retainer`), and `owedBy()`
counting only setup payments against one-off work. Half a day, plus a migration
defaulting existing rows to `setup`.

# Suggested order

1. **#5** (win-rate caption) — ten minutes, immediate credibility.
2. **#2** (client balance due) — silent wrong number, one line.
3. **#1** (two "collected" figures) — the big one; needs your decision on manual
   income first.
4. **#8**, **#6** (tile ↔ drilldown mismatches) — the §2 class, together.
5. **#4** (avg deal / wonValue population) — will move a historical number, so
   it needs a BUILD-NOTES entry.
6. **#7** (sample sizes) — one shared component, replaces four sites.
7. **#11**, **#10** (duplicate computations) — cheap, prevents the next drift.
8. **#17** (pipeline) — decide before building anything else on it.
