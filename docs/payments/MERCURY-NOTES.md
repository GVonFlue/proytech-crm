# Mercury invoicing: research notes

Phase 0 research spike, October 2026. **Paused.** Mercury stays our bank; its invoicing API was too limited for automation on our plan. Re-check everything here before relying on it.

## What we found

**Invoices (Accounts Receivable API)**
- Invoices are created through the API with a customer, line items, a due date, the destination account, and ACH / card switches.
- Statuses: **Unpaid, Processing, Paid, Cancelled.**
- Mercury's own invoice email can be suppressed (`sendEmailOption: DontSend`), so we could send one branded email of our own.
- The pay page is slug-based. The exact URL pattern was **not confirmed**.

**Webhooks**
- There are **no invoice events.** Only `transaction.created` / `transaction.updated` and balance events exist.
- So "invoice paid" would have to be inferred by matching incoming transactions, or by polling invoice status.
- Signature: a `Mercury-Signature: t=…,v1=…` header, an HMAC over `t + "." + body`.

**Recurring and autopay**
- Recurring invoices can't be created through the API: API invoices don't appear under Invoicing > Recurring.
- **No autopay.** The monthly plan would be one invoice per month, created by our daily job, which the client pays by hand.

**Cards**
- Mercury needs a connected Stripe account to take cards, and Stripe's card fees apply.

**Tokens and access**
- **Write tokens require an IP allowlist.** Vercel functions have no fixed IP, so this would need Vercel Static IPs (about $100/month) or a proxy such as QuotaGuard.
- Tokens unused for 45 days are deleted.
- Sandbox base URL: `https://api-sandbox.mercury.com/api/v1`.

**Fees**
- Plus plan: $1 per ACH debit.
- Pro plan: free.

**Reliability**
- Mercury is moving partner banks (Evolve → Choice / Column). Expect account-detail changes and check the API changelog before building.

## If we come back to Mercury
- It would be a second adapter behind the interface in [DESIGN.md](DESIGN.md), with `capabilities.autopay = false` and `capabilities.customerPortal = false`. The shared daily job then creates the monthly invoices.
- Its signature check, pay-link pattern and status names stay inside the adapter. Shared code only sees our own statuses.
- The paid plan and the static IP cost should be weighed against Stripe's per-payment fees.
