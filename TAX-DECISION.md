# An invoice credits its TAX against the balance

> **Not a bug today, and it will be the day somebody sets a tax rate.**
> `DEFAULT_INVOICING.taxRate` is `0` and this install has never changed it, so
> every path below currently computes the same number either way. This file
> exists so that turning tax on is a decision somebody makes, rather than a
> discovery somebody has.

**Status:** open, deliberately deferred. Found 2026-09-07 while building the
"invoice the balance" button (PR #78). Owner's call: *"set it aside for now, my
rate is 0."*

**Class:** the same one as AUDIT #21/#23 — two functions that answer *"how much
of this work has been paid for"* with two different numbers, agreeing only
because a third value happens to be zero.

---

## What happens

`applyInvoicePayment()` in `src/App.jsx`, on **Mark paid**, writes one row into
`lead.payments`:

```js
const amount = invTotal(inv);          // subtotal + tax
const row = { id, invoiceId: inv.id, amount, date: when, note: `Invoice ${inv.number}` };
```

`invTotal` is `invSubtotal + invSubtotal × taxRate/100`. So the row carries the
**tax-inclusive** figure.

That row is then read as a balance payment:

```js
setupPaid(l)  = sum(l.payments)                    // src/lib/retainer.js
owedBy(l)     = contractedTotal(l) - setupPaid(l)  // src/lib/lead.js
```

`contractedTotal` is the sum of deal rows — **`setup + website + integration +
extras`**, with no tax anywhere in it. So a tax-inclusive payment is subtracted
from a tax-exclusive contract.

## What it costs, at a 7% rate

Alex owes $1,399. The button raises an invoice for $1,399, tax makes it
$1,496.93, he pays it, and `applyInvoicePayment` credits **$1,496.93** against a
**$1,399** debt.

| | tax 0% | tax 7% |
|---|---|---|
| Invoice total | $1,399.00 | $1,496.93 |
| Credited to `lead.payments` | $1,399.00 | $1,496.93 |
| `owedBy` after | $0.00 | $0.00 *(clamped)* |
| True remaining | $0.00 | $0.00 |
| **`setupPaid` overstates the work by** | $0.00 | **$97.93** |

`owedBy` ends at `Math.max(0, …)`, so **the balance still lands on zero** — this
does not create a negative debt and does not double-count. The damage is
elsewhere and is quieter:

1. **A partial payment settles too much.** Invoice half the balance at 7% and
   the client has paid for 7% more work than they actually have. The balance
   reaches zero before the work is paid for.
2. **The overpayment warning misfires.** The lead panel shows
   *"$X paid over the deal total"* when `paid > owed`. At a non-zero rate that
   fires on every fully-paid client, so it becomes noise and then gets ignored —
   the same way three red tests became three tests nobody read.
3. **Revenue counts tax as income.** `allPaid()` feeds the revenue tiles and the
   ledger. Sales tax collected on behalf of a state is not revenue, and at 7% it
   inflates every collected figure by 7%.

(3) is the one that matters most, and it is **not** created by the invoice
button — it is true of any tax-bearing invoice marked paid, and has been since
invoicing shipped.

## The three honest options

**A. Credit the subtotal, not the total.** `applyInvoicePayment` writes
`invSubtotal(inv)` instead of `invTotal(inv)`. The balance then nets exactly,
and tax simply never enters `lead.payments`.
*Cost:* the money that hit the bank and the money on the record differ by the
tax, so the payment row no longer reconciles against a bank line — which is the
thing `receipts()` in `src/lib/retainer.js` was built to preserve.

**B. Store both, sum one.** The row carries `amount` (subtotal) and `tax`
separately, exactly as the setup/retainer split already does — two fields, one
of which is what a balance is measured with.
*Cost:* a field on a payment row, so it touches every reader of `lead.payments`.
This is the shape RETAINER-PLAN.md argues for and the one most consistent with
how this codebase already tells two kinds of money apart.

**C. Decide tax is out of scope and enforce it.** Remove the tax rate field, or
refuse to mark a tax-bearing invoice paid.
*Cost:* honest, and closes a door the product may want open when it is sold to
somebody who charges tax.

**The recommendation is B**, for the reason AUDIT #23 gives about `kind`: a
filter that can be forgotten is not a control, and two named fields cannot be
summed wrongly by accident. It should not be built until somebody actually
charges tax — building it now means maintaining a split nothing exercises.

## Before turning tax on

1. Read this file.
2. Decide A, B or C.
3. Whichever it is, `tests/invoicebalance.mjs` gets a case at a non-zero rate —
   there is currently **no test anywhere that exercises `taxRate > 0`**, which is
   why this survived unnoticed.

## Related

- `GLOSSARY.md` → *Still owed / outstanding* → *Invoicing the balance*, which
  states the zero-rate behaviour and points here.
- `AUDIT.md` #21 and #23 — the same class, both resolved.
- `src/PaymentReview.jsx` — the screen that exists to unpick #23 after the fact.
