# Payments as a swappable layer: design

Proposed October 2026. **Not built.** Payments are manual for now (see [README.md](README.md)).

The CRM's invoices, emails, portal Billing tab, The Books and the deposit-paid logic talk to **one internal payments interface**. Each provider (Stripe, Mercury, Square…) is an adapter behind it.

Shared code:
- never names a provider
- never stores provider-specific statuses
- never assumes a provider can do something without checking its capabilities

## The interface

`api/_payments/index.js` exports `payments()`, which returns the adapter chosen by the `PAYMENTS_PROVIDER` env var. Every adapter implements:

```
createCustomer(lead)              → { providerCustomerId }
createPayment(invoiceRow)         → { payUrl, providerRefs }    // one-off: deposit, balance, add-on, prepay
startSubscription({ customer, amountCents, startsOn, freeUntil })
                                  → { providerSubscriptionId }  // only if capabilities.autopay
stopSubscription(id, { atPeriodEnd })
readStatus(providerRefs)          → one of our statuses (below)
verifyWebhook(rawBody, headers)   → provider event, or null (unsigned / bad / stale / secret unset)
toInternalEvent(event)            → { kind, invoiceRef, amountCents, feeCents, method, at } | null
billingPortalUrl(customerId)      → url | null                  // only if capabilities.customerPortal
capabilities                      → { autopay, cards, ach, customerPortal, invoiceWebhooks }
```

**Our statuses:** `draft | open | processing | paid | failed | refunded | disputed | void`.

**Our event kinds:** `paid | processing | failed | refunded | disputed | subscription_ended`.

**Each adapter maps its own names onto ours.** Shared code branches on capabilities, never on the provider:
- **No autopay** (e.g. Mercury): the shared daily job creates a monthly invoice row and calls `createPayment` for it.
- **Autopay:** the provider charges monthly, and the webhook upserts the month's row.
- **No customer portal:** the portal Billing tab hides "Manage payment method".
- **No invoice webhooks:** the daily job polls `readStatus` for open rows.

**Routes**
- `api/payments-webhook-<provider>.js`, one per provider because signature formats differ. Each is a thin wrapper: `verifyWebhook` → `toInternalEvent` → the **shared** handler.
- `/pay/<token>` is public. It looks up the open invoice by its random token and asks the adapter for a fresh pay URL. It shows only the amount and business name, is rate-limited, and takes no recipient or amount from the request.
- These, plus the webhooks, are the only public payment routes. Owner actions use `guard({ requireOwner })`.

## Data model

All tables are readable by the owner and written by the server only, the same pattern as `client_emails`. Each gets a rollback file, an RLS-AUDIT server-write-only check and a VERIFY-RLS section. Money is integer cents.

**`invoices`** (generic; not named after a provider)
- `id`, `lead_id`, `proposal_id`
- `kind` (`deposit | balance | monthly | addon | prepay`), `period` (monthly only, e.g. `2027-03`)
- `amount_cents`, `fee_cents`
- `status` (ours), `method` (`ach | card | manual | other`)
- `pay_token` (random), `due_on`, `paid_at`
- `provider` (`stripe | mercury | square | manual`)
- `provider_customer_id`, `provider_payment_id`, `provider_invoice_id`, `provider_subscription_id`
- `created_at`, `updated_at`
- **unique (lead_id, kind, period)**, so no invoice is ever created twice

**`billing_customers`**: `lead_id`, `provider`, `provider_customer_id`, with **unique (lead_id, provider)**.

**`payment_events`**: `provider`, `event_id`, `type`, `invoice_id`, `received_at`, with **unique (provider, event_id)**. A replayed event changes nothing. This doubles as the audit trail.

**Switching providers later:** old rows keep their `provider` and provider IDs, so history and The Books don't break. Saved payment methods and autopay enrolments **don't** move between providers; autopay clients must set up payment again with the new one.

## Rules

**Deposit paid (derived, never written to the lead)**
- The browser saves whole lead records, so a server write to the lead could be erased. The server therefore **never writes the lead**.
- "Deposit paid" is true when **the manual checklist tick is set, or a `paid` deposit (or prepay) invoice exists**. Every place that reads the tick reads this instead:
  - the launch clock
  - the lifecycle
  - "You're locked in"
  - the portal
- Reps see the clock, but invoice rows are owner-only. So a gated function returns only paid dates and statuses per lead, with no amounts.
- `portal_home` returns the same derived value.
- The manual tick always works (cash, cheques, Square).

**Processing**
- An ACH payment is `processing` for about 4 business days. It **doesn't count as paid until it succeeds** (recommended; to confirm).
- In the meantime, the CRM and the portal show "Payment processing", and nothing downstream starts.
- A late ACH return arrives as `disputed`. The invoice leaves `paid`, the owners get an email, and the At Risk hook fires. Anything already sent stays sent.

**"You're locked in"**
- The shared webhook handler sends it once, through `sendClientMail` and the existing once-only claim in `client_emails`. Whichever comes first wins: a paid deposit or the manual tick.
- The webhook route must be added to the list of files allowed to send client email (`tests/clientmail.mjs`).

**At Risk**
- `paymentFailed()` in `src/lib/lifecycle.js` becomes true when the latest payment is `failed` or `disputed`, or the subscription is past due.
- It clears on the next paid invoice, and owners are emailed.

**Portal Billing tab**
- `portal_invoices()` takes no arguments, starts from `portal_lead()`, and returns named fields only: kind, period, amount, status, due date, paid date, method, and our `/pay` link.
- It's proven like the rest of the portal wall.

**The Books**
- Paid invoice rows show as payments, with gross and fee.
- A manual entry can link to an invoice ID, so nothing is counted twice.

## Tests to write when built

All against a fake provider:
- an invoice is created once, never twice
- the webhook requires a signature, and refuses when the secret is unset
- a replayed event changes nothing
- an out-of-order event can't move `paid` back to `processing`
- a paid deposit starts the clock and sends "You're locked in" once; `processing` does neither
- acceptance survives a provider outage
- the portal shows only that client's invoices
- amounts match the proposal exactly
- shared code contains no provider names (a grep test over `api/_payments/` outside the adapters)

## Open decisions (answer before Phase 1)

1. **Provider:** Stripe, Mercury on a paid plan, or Square.
2. **How deposits are collected:** Checkout through our `/pay` link ($0 extra) vs provider invoices (Stripe: +0.4%).
3. **When ACH counts as paid:** when it succeeds (recommended) or when it's submitted.
4. **Monthly:** provider subscriptions (Stripe +0.7%; retries and card updates handled) or our daily job charging the saved method.
5. **Custom pay-page domain:** now or later ($10/month on Stripe).
