# Payments

**Status (October 2026): manual.** No payment provider is connected to the CRM.

Today:
- We invoice by hand from **Square**.
- When the money arrives, the owner ticks **Deposit paid** on the client's onboarding checklist. That tick starts the launch clock, counts in the lifecycle and the portal, and is the only source of "deposit paid".
- Launch balances and monthly plans are invoiced by hand the same way.
- No card or bank number ever touches the CRM.

Automation is paused until there is cash in hand. These notes keep the research so nothing has to be redone.

| File | What it holds |
|---|---|
| [MERCURY-NOTES.md](MERCURY-NOTES.md) | What Mercury's invoicing API can and can't do (Phase 0 research, paused) |
| [STRIPE-NOTES.md](STRIPE-NOTES.md) | Stripe as the collector, with payouts to Mercury: options, fees, webhooks, security |
| [DESIGN.md](DESIGN.md) | The swappable payments layer: interface, data model, capabilities, the deposit-paid and processing rules |

## How to resume

1. **Choose the provider.** Re-check the fees and limits in the notes above; prices and APIs change. Square may also be a candidate, since we already invoice from it. Square has no notes here yet, so research it the same way (pay page, ACH, autopay, webhooks, payouts to Mercury) and write `SQUARE-NOTES.md`.
2. **Answer the open decisions** listed at the end of [DESIGN.md](DESIGN.md).
3. **Build Phase 1 as one PR**, following DESIGN.md:
   - the tables
   - the payments interface
   - the first adapter
   - the deposit at acceptance
   - the webhook
   
   Include Supabase steps. Don't merge without the owner's go-ahead.
4. **Keep the manual tick working.** Cash, cheques and Square invoices sent before the switch still count through the checklist tick.
5. **Keys and secrets live only in Vercel environment variables**, never in chat, files, commits or PR bodies. Test against the provider's sandbox before production.

The original build spec is `MERCURY-PAYMENTS-SPEC.md` (in `proposal-import/`, outside this repo). Its phases still apply, but provider names in it should be read through DESIGN.md: shared code never names a provider.
