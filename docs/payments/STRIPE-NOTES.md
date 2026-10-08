# Stripe as the payment collector: research notes

Phase 0 research spike, October 2026, from Stripe's pricing, payouts, ACH, webhooks, invoicing, billing-cycle, customer-portal, API-keys and branding docs. **Paused, not chosen.** Re-check prices before building.

In this setup, Stripe collects the payments and pays out to our Mercury account.

## Ways to collect a one-off payment (deposit, launch balance)

| | Stripe Invoices | Checkout Sessions | Payment Links |
|---|---|---|---|
| Branded page | Yes | Yes (custom domain optional) | Yes |
| ACH (`us_bank_account`) and cards | Yes | Yes | Yes |
| Our own email with the link | Yes: finalise without sending and use `hosted_invoice_url` | Yes, but a session link **expires within 24 hours** | One shared link; not tied to a client or invoice |
| Saves the payment method for autopay | Not directly | Yes (`setup_future_usage`) | Limited |
| Extra Stripe fee | 0.4% per paid invoice (Starter; 0.5% Plus) | None | None |

**Leaning:** Checkout through our own `/pay/<token>` link. The token never expires. A click checks the invoice is still open, creates a fresh session, and redirects to it.

## Fees (checked October 2026)

- Cards: 2.9% + 30¢.
- ACH Direct Debit: 0.8%, capped at $5.
- Instant bank verification (Financial Connections): $1.50 each.
- Billing (subscriptions): 0.7% of subscription volume; one-off payments are excluded.
- Disputes: $15.
- Standard payouts: free.
- Custom domain for pay pages: $10/month.
- **Not confirmed:** the fee for a failed or returned ACH payment.

| | ACH | Card |
|---|---|---|
| $1,500 deposit (Checkout) | $5.00 + $1.50 verification (first time) = $6.50 | $43.80 |
| …as a Stripe Invoice | +$6.00 | +$6.00 |
| $299 month (Subscription) | $2.39 + $2.09 Billing = $4.48 | $8.97 + $2.09 = $11.06 |
| $299 month (our job charges the saved method) | $2.39 | $8.97 |
| 12-for-10 prepay, $2,990 (one-time) | $5.00 | $87.01 |

## ACH behaviour

- **Settlement:** T+4 business days (T+2 if eligible). Until then the payment is *processing*.
- **Late failures:** a payment can fail after it shows as succeeded. These arrive as disputes (insufficient funds, closed account, unauthorised).
- **Refunds:** within 180 days.
- **Disputes:** personal accounts can dispute within 60 days; business accounts within 2 business days. The outcome is final.
- **Authorisation:** the mandate is collected by Checkout or the hosted invoice page.
- **Retries:** Smart Retries for ACH, at most 2 within 40 days.
- `payment_method.automatically_updated` signals a changed or blocked account.
- **Where ACH works:** Checkout, Payment Links, Invoicing, Billing and the customer portal. In the portal, a client **can't add a new bank account**.

## Monthly plan (Subscriptions)

- **One setup:** the payment method is saved at the deposit (`setup_future_usage=off_session`), then used as the subscription's `default_payment_method` with `collection_method=charge_automatically`.
- **Start at launch:** create the subscription when the client is marked launched.
- **Prepaid months:** set `trial_end` to the first paid month with `proration_behavior=none`. There's no partial invoice, and `trial_end` becomes the billing anchor.
- **12-for-10:** charge $2,990 once at acceptance, then start the subscription at launch with `trial_end` = launch + 12 months.
- **Alternative:** our daily job charges the saved method off-session each month. This avoids the 0.7% fee, but the retries are ours to build.
- **Testing:** test clocks can fast-forward subscriptions through months.

## Webhooks

**Events**

| Ours | Stripe events |
|---|---|
| paid | `checkout.session.completed` with `payment_status=paid` (cards); `checkout.session.async_payment_succeeded` (ACH); `invoice.paid` |
| processing | `checkout.session.completed` with `payment_status=unpaid` (ACH submitted); `payment_intent.processing` |
| failed | `checkout.session.async_payment_failed`; `invoice.payment_failed`; `customer.subscription.updated` with status `past_due` / `unpaid`; `customer.subscription.deleted` |
| refunded | `charge.refunded` |
| disputed | `charge.dispute.created` / `charge.dispute.closed` |

**Signature**
- Header: `Stripe-Signature: t=…,v1=…`, an HMAC-SHA256 of `t + "." + raw body` using the endpoint's `whsec_` secret.
- Compare in constant time, accept a 5-minute tolerance, and ignore any scheme other than `v1`.
- **Turn off Vercel's body parsing** so the raw body is available.
- Refuse every request when the secret is unset.

**Delivery**
- In live mode, retries continue for up to 3 days with backoff.
- There's **no ordering guarantee** and events may repeat. Remove duplicates by event ID, return 2xx fast, and re-read the object's current state from the API.

**Outbound calls:** send an `Idempotency-Key` built from our invoice row's ID.

## Payouts to Mercury

- **Setup:** add the Mercury account under Dashboard → Settings → Payouts and choose a daily automatic schedule.
- **Timing:**
  - A standard payout arrives in about 2 business days, after the funds become available.
  - **A new account's first payout takes 7–14 days.**
  - ACH funds become available only after settlement.
- **Reconciliation:** Mercury shows one batched Stripe deposit per payout, so reconcile against our invoice rows, not Mercury's transaction list.

## Branding, portal, test mode, security

**Branding**
- Icon, logo, brand colour and accent colour apply across Checkout, Payment Links, the customer portal, hosted invoices and emails.
- Turn off Stripe's customer emails (receipts, Billing emails) so clients get only ours.
- Set the statement descriptor to "PROYTECH".

**Customer portal**
- Clients can update a payment method, see and download invoices, and cancel. Each of these can be switched on or off.
- Sessions are created via `/v1/billing_portal/sessions` and expire after about 5 minutes. They can't be iframed, so open them in a new tab. There's no fee.

**Sandboxes**
- Sandboxes are isolated, with their own keys (`rk_test_…`).
- Live keys are `rk_live_…`. Test and live objects never mix.

**Keys**
- Use a **restricted key** (`rk_`) that can only do what we need:
  - write: customers, Checkout Sessions, subscriptions, portal sessions
  - read: payments and invoices
  - nothing for refunds or payouts
- **No static IP is required.** Access policies (an IP list, or ASN + country) are optional.
- A rotated key keeps working for up to 7 days.
- Never put keys in code, files, commits or chat; they live in Vercel env vars.

**Env vars (when built)**
- `PAYMENTS_PROVIDER=stripe`
- `STRIPE_SECRET_KEY` (restricted key): test key in Preview, live key in Production
- `STRIPE_WEBHOOK_SECRET`: different per endpoint

## Owner setup in Stripe (when resumed)

1. Open the account and complete business verification.
2. Turn on two-factor authentication.
3. Add Mercury as the payout bank with daily payouts.
4. Set branding and the statement descriptor.
5. Turn on ACH Direct Debit.
6. Turn off Stripe's customer emails.
7. Create a sandbox.
8. Create the restricted key only when the build asks, and put it straight into Vercel.
