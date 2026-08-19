# RETAINER-PLAN.md — AUDIT #23, separating retainer money from one-off money

Status: **plan only, nothing built.** Read `ENGINEERING.md` first — §2 (two
screens must never disagree / derive don't copy), §3 (writes race), §4 (money
rules, nothing historical moves).

The harm, in your words: *a $249 retainer payment and a $1,012 setup payment
land in the same array, so a retainer payment can silently cover an unpaid setup
fee and make it look settled.*

---

## Your three questions, answered first

### 1. Separate array, not a `kind` on the same one

**Separate.** Three reasons, in the order I weight them.

**A filter that can be forgotten is not a control.** This is the same call this
codebase already made for the Playbook: `KB-PLAN.md` §1 chose two tables over
one table with a `status` column, because a reader allowed at the row is allowed
at every column, and the protection has to be structural rather than
conventional. #23 exists *precisely because* `paidTotal` summed an array without
filtering it. Adding a `kind` leaves that sum spelled exactly as it is today —
`paymentsOf(l).reduce(...)` — still compiling, still wrong, and now wrong in a
way that looks deliberate. With two arrays there is **no single array to sum by
accident**.

**A retainer payment carries a field a setup payment has no use for: the period
it covers.** August's retainer paid on 3 September still covers August. Without
that you cannot answer *"how many months have they actually paid"* the moment
somebody pays two months at once, pays late, or skips one. One array means every
row carries a field half of them never use, and the half that needs it has no
way to require it.

**They have different lifecycles.** A setup balance pays down to zero and stays
there — that is what makes it a balance. A retainer covers a period and recurs
forever; it can never be "paid off", only "up to date". Those are different
shapes and forcing them into one row makes both blurrier.

```
lead.payments          [{id, amount, date, note}]              one-off work
lead.retainerPayments  [{id, amount, date, period, note}]      period = 'YYYY-MM'
```

**The one thing that must NOT split: revenue.** Cash is cash — a retainer
payment arriving is money in, exactly like a deposit. `paidInMonth`, the Money
ledger and `paymentTxns` all read **both** arrays. Only the two *balance*
questions read one array each. That distinction is the whole design:

| Question | Reads |
|---|---|
| What arrived this month? | both |
| Have they paid for the work? | `payments` only |
| Are they current on the retainer? | `retainerPayments` only |

Today `paidTotal` is used for both the first and the second question, which is
the bug. After this, asking the second question with the first question's data
is not something you can spell.

### 2. MRR: keep contracted, add collected and arrears beside it

MRR counting from the toggle is **not wrong** — it is *contracted* MRR, the
forward-looking number you plan on, and it is what you signed. Changing what it
means would restate every past month, which §4 forbids ("nothing historical
moves").

But it is not the cash question, and by your own v21 rule the cash question
deserves an answer. So: **the tile stays contracted MRR, and two numbers join
it**, in the pattern you already chose for AUDIT #1 (*"$X from clients · $Y
other"*):

- **Collected this month** — retainer cash actually received.
- **Arrears** — *"3 clients behind · $747"*.

Arrears is the one I would actually put in front of you. "Collected MRR" is a
lagging restatement of a number you already have; **arrears names the clients to
chase**, which is a thing you can do something about this afternoon.

### 3. Retroactive classification: proposed, never silent

**Some of it can be decided with certainty. The rest must be confirmed by you,
once, in one screen.**

Certain, no judgement needed:

- A lead with `retainerActive === false` and no `retainerStart` has never had a
  retainer, so **every** payment on it is setup. This will be most of them.
- A payment **dated before `retainerStart`** cannot be a retainer payment.

Strong evidence, proposed and shown with its reason:

- `amount === lead.retainer` exactly, on a lead with a retainer → retainer
- the note matches `/retainer|monthly|\bmo\b/i` → retainer
- the same amount recurring at roughly monthly spacing → retainer

**And the ambiguous ones are not guessed.** The tempting default is "assume
setup", and it is the wrong one: counting a retainer payment as setup is exactly
the bug — it makes an unpaid setup fee look settled. Defaulting that way would
preserve #23 under a new name. So an unclassified payment counts toward
**neither** balance and is listed as needing a decision.

The screen is a one-off: every payment, its proposed class, the reason, **Accept
all** as one button, and any row flippable. This is the house pattern — Claude
proposes, a human approves — and it is the fourth time it has been the right
shape here (Meeting Log actions, Playbook drafts, Pocket outputs).

Expect it to be **one pass of a few minutes**, not per-payment drudgery, because
the two certain rules above will pre-classify most rows with no judgement
involved.

---

## The numbers this buys you

```
Setup balance   contractedTotal(l) − sum(payments)          reaches zero
Retainer status monthsDue(l) vs monthsPaid(l)               never reaches zero
Arrears         (monthsDue − monthsPaid) × retainer         what to chase
```

`monthsDue` counts from `retainerStart` (already auto-stamped when the toggle
flips — `src/App.jsx:3018`) to the current month inclusive. `monthsPaid` is the
count of **distinct `period` values**, so paying two months at once credits two
months and paying late still credits the month it was for.

### Two limits worth stating now rather than discovering later

- **A retainer whose price changed** makes dollar arrears approximate: we charge
  arrears at today's rate, not the rate in force that month. Storing a rate per
  expected period would fix it and costs more than it is worth until you
  actually change a price. The month COUNT is exact either way.
- **A pause** (client on hold for two months) has nowhere to be recorded, so it
  reads as arrears. If that happens in practice, the fix is a `skip` on a
  period, not a new concept.

---

## What changes, and what must not

**Must not change: revenue, for any month, ever.** `paidInMonth` will read both
arrays, so every dollar that counted yesterday counts today. §4's "nothing
historical moves" is the constraint this whole plan is shaped around, and it is
also the thing to test hardest — a suite that asserts revenue is byte-identical
before and after the migration.

**Changes:** `owedBy()` stops seeing retainer payments, so **setup balances will
go UP for retainer clients** — which is the bug being fixed, and the number was
wrong in the direction of "you are owed less than you are". Expect "Owed to you"
to rise. That is the correct direction and it should be called out on the screen
the first time it happens, not discovered.

**Files:** `src/App.jsx` (the payment helpers, `owedBy`, the panel, the MRR
tile, the review screen), a new `src/lib/retainer.js` (pure: `monthsDue`,
`monthsPaid`, `arrears`, and the classification proposer — pure so the
classification logic is testable without a browser, same rule as
`src/lib/jarvis.js` and `src/lib/pocketmatch.js`).

**No SQL.** Both arrays live in the lead's existing `data` jsonb.

**§3, writes race:** the review screen writes `payments` and `retainerPayments`
in a **single `set()`** — two calls would have the second overwrite the first
from a stale draft, which is the `closeDeal` bug from BUILD-NOTES.

---

## One thing I found while planning this

`paidTotal` (line 630) and `paymentsPaid` (line 669) are **two functions that
sum the same array**, differing only in that one strips non-numeric characters.
Two names for one fact, which §2 says will diverge — and after this change there
would be two names for a fact that is now *wrong* to ask unqualified. They
should collapse into the new named readers as part of this. Logging it as
**AUDIT #24** so it does not get lost if this plan is deferred.

---

## Build order

1. `src/lib/retainer.js` + tests — `monthsDue`, `monthsPaid`, `arrears`, and
   `proposeClass(payment, lead)` returning `{kind, why, certain}`. Pure, so the
   classification rules are provable before any of them touch a screen.
2. The readers: `setupPaid(l)`, `retainerPaid(l)`, `allPaid(l)`. `owedBy` moves
   to `setupPaid`. **`paidTotal` and `paymentsPaid` are deleted**, so the
   unqualified question has no name left to call.
3. A revenue-is-unchanged test, asserted against the current fixtures before
   anything else is wired up.
4. The classification review screen, writing both arrays in one `set()`.
5. Logging a payment asks which it is, defaulting sensibly: retainer if the lead
   has one and the amount matches, setup otherwise — proposed, not assumed.
6. The MRR tile gains collected + arrears; a per-client "current / N months
   behind" on the lead panel.
7. `ROLES.md` if anything a rep sees changes — I do not expect it to, since reps
   see no money.

## What I would NOT do

- **Auto-classify without review.** The whole finding is that money was being
  silently applied to the wrong balance; fixing it by silently applying it to a
  different wrong balance is not a fix.
- **Split revenue.** Cash is cash.
- **Change what MRR means.** It restates history, and the number you want is
  arrears, which is new.
