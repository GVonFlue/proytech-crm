# BUILD-NOTES — v36

**Supersedes every earlier zip.** Cumulative. Upload everything.

---

## Money and The Books are now one tab

I merged them. Two sidebar items both meaning "money" forced you to check both
to answer one question, and their tiles overlapped anyway. **The Books is gone
from the sidebar; everything lives under Money**, in the order the questions
get asked:

| Tab | Answers |
|---|---|
| **This month** | what actually happened — the old ledger, unchanged |
| **Next 90 days** | what's committed, in and out |
| **Month by month** | 12-month in/out/net chart |
| **Where it goes** | expenses by category, revenue by client |
| **Recurring bills** | Supabase, Vercel, anything on a schedule |

Four tiles across the top: **Collected this month**, **Monthly burn**, **MRR**
(with whether it covers burn), and **Owed to you**.

### Recurring bills

Add a bill, set the cadence — weekly, monthly, quarterly, yearly — and a
category. Everything normalises to a monthly figure so **burn means one thing**:
a $120 domain shows as $10/mo. Bills can be paused without deleting them.

**They are not written into the ledger.** Generating transactions that may not
have happened would corrupt the only record of what actually left the account.
They answer "what am I committed to"; the ledger answers "what did I spend".
The page keeps those apart deliberately.

### Next 90 days is committed, not forecast

You said no pipeline forecasting in v1, but ranked cash flow first. This
resolves it: **everything shown is under contract** — signed retainers, invoices
already issued, bills you already owe. No guessing which deals close. The page
says so on the panel, so nobody mistakes it for a projection later.

## A real bug this exposed

**The settings loader was silently dropping new fields.** It rebuilt the
settings object naming every key explicitly, so `recurring` saved fine and
vanished on refresh. It now spreads the saved object first.

This would have hit *every* future setting. Worth knowing it existed.

## Also in v36

- **Logo** 112px with rounded corners; the saved `logoSize` of 34 was
  overriding the CSS via the inline style, so it has a floor now
- **BUSINESS SUITE** at 15px
- **Activity log Expand** — the log takes the full modal, the way Follow Up Boss
  and HubSpot treat a timeline. Split view can never give a feed more than half
  the window; the fix was structural, not CSS. Choice is remembered.

## Verification

Twenty-four suites, **573 checks, all passing** (`npm i --no-save jsdom`).

Three suites needed updating for the merge, and one of those was hiding
something: `run.mjs` looped over tab names and **silently skipped** the retired
one — 36 checks became 35 while still reporting all-pass. Now points at Meetings.

## Still open

- **Tiles still look plain.** Worth doing as one deliberate pass with a decision
  about whether the whole app goes dark, rather than tile by tile.
- `ONB_ITEMS` and `MEETING_TYPES` hardcoded · import duplicate detection ·
  sponsor deliverables · no notifications · onboarding/delivery duplication.
