# REP-PAY-PLAN.md — paying reps per appointment and per deal

Status: **plan only, nothing built.** Read `ROLES.md` and `ENGINEERING.md` §2
(derive don't copy), §3 (writes race), §4 (nothing historical moves) first.

Two structures, per rep, either or both:

- **Per appointment** — a flat rate for a meeting that actually happened
- **Commission** — a percentage of the closed deal (exists today)

---

## Your questions, answered first

### 1. What counts as a paid appointment — **held**, and you already said why

Settled: the fee is earned when a meeting is marked **held**. Cancelled and
no-show earn nothing.

Worth writing down: the CRM already tracks this properly. Meetings carry a
status with an explicit control, `needsStatusCount` already nags about unmarked
ones, and `heldMonth` / `noShowMonth` already read it. **No new data is needed
to know whether an appointment happened** — only new meaning attached to a
field that exists.

**One fee per appointment, not per attempt.** A meeting rescheduled three times
and held once earns once. Otherwise rescheduling becomes a payday, which is the
booked-vs-held problem wearing a different hat.

### 2. Who marks it held — **the rep marks, you approve**, and that is not a compromise

Both horns are real: a rep marking their own payday is self-certification, and
owner-only marking is a bottleneck the day there are three reps.

The answer is already in this product. **Commission has exactly this shape and
it works**: the rep converts a client, the commission goes **Pending**
immediately, and it becomes **Earned** when you approve it. The rep gets the
motivator without waiting on you; you decide when it becomes real money.

Appointment fees should use **the same three states, the same words, and the
same screen**. Two pay models that behaved differently would be two things for a
rep to learn and two places for the numbers to disagree.

So:

- **Rep marks the meeting held** — the existing control, no new UI.
- The fee appears as **Pending** on their dashboard the moment they do.
- **You approve** — and this is the part that stops it being a bottleneck:
  approval is a **batch**. *"Dana · 12 held · $600 · Approve all"*. One click a
  week, not twelve clicks a week. Per-meeting approval is what would make three
  reps unmanageable, so it must not be the default action.
- Anything you have not approved stays visible to both of you, so a rep can
  chase and you can see what is accruing.

**One thing to say out loud before this ships:** marking a meeting held is today
a neutral piece of bookkeeping. Afterwards it is a claim for money. Reps who
have been casual about the status control will become extremely diligent about
it, and that is fine — but the record needs to say **who marked it and when**,
because it is now the evidence behind a payment. That stamp does not exist yet.

### 3. Held, then later cancelled — **it depends what state it is in**, and the rule is the house rule

Three cases, and the distinction is *what the fee is for*: the fee pays for the
appointment happening, not for the outcome. A held meeting whose deal later dies
still earned its fee.

| State | What happens |
|---|---|
| **Pending** | The fee is *derived* from the status. Change the status and it simply disappears — nothing was ever real. |
| **Approved** | **Nothing silently reverses.** It is flagged: *"approved at $50, no longer marked held"*, and you void it or leave it. |
| **Paid** | **Never reverses.** Money left the business. A correction is a **new negative line**, not an edit of history. |

That last row is `ENGINEERING.md` §4 — *nothing historical moves* — applied to
money going out instead of coming in. Silently clawing back pay you have already
approved is the kind of thing that ends a working relationship; silently keeping
pay for a meeting that did not happen is wrong too. **Surface it, do not decide
it.**

### 4. Where rep pay lives — **earnings derived, payouts stored**

Not "a new table *or* alongside payments" — the two halves want different homes,
and conflating them is what makes this hard.

**Earnings are derived, never stored.** A held meeting on a lead the rep owns,
at the rate in force, *is* an earning. Storing a row per meeting would drift the
moment a status changed — the same reason `meetingLogsOf` reads through to the
log and the Pocket outputs list is computed rather than tracked (§2).

**But the rate must be snapshotted**, exactly as commission already snapshots
`pct` and `base` at conversion. Move Dana from $50 to $75 and last month's
meetings must stay at $50. So **approval stamps the meeting**: `payRate`,
`payRepId`, `payApprovedAt`, `payApprovedBy`. Derived while pending, frozen on
approval — which is also precisely the state machine in question 3.

**Payouts are stored, in a new table.** A payout is money leaving the business
on a date, to a person, covering a period. It is not attached to a lead, so it
cannot live on one:

```sql
create table rep_payouts (
  id text primary key,
  rep_id uuid references auth.users(id),
  amount numeric not null,
  paid_on date not null,
  period text,            -- 'YYYY-MM' or a free label
  note text,
  created_at timestamptz default now()
);
```

RLS: **a rep reads their own rows, an owner reads and writes all** —
`rep_id = auth.uid() or is_owner()`. Not `app_settings`, which is the shared
blob that cannot be split per person (`ROLES.md` honest limits) and this is the
most per-person data in the product.

### 5. `commission_pct` — **keep it, add a rate, and let zero mean "not on it"**

No enum, no migration of meaning. A rep is on a model when its number is
non-zero:

```
crm_users.commission_pct    exists, unchanged        0 = not on commission
crm_users.appointment_rate  new, numeric default 0   0 = not on per-appointment
```

- A rep on **both** is just two non-zero numbers, and a hybrid (small per
  appointment plus a smaller percentage) is a normal structure — forbidding it
  costs something and allowing it costs nothing.
- A rep on **neither** has both at zero and simply sees no earnings block. That
  is the honest rendering of "you are not on a pay model yet", and it is what a
  new hire looks like on day one.
- **Nothing about existing commission changes.** Every stored commission keeps
  working exactly as it does, which is what §4 requires.

An enum would add a third thing to keep in sync with two numbers that already
say everything the enum would.

---

## What the screens become

**Settings → Team**, per rep: `Per appointment $__` and `Commission __%`, with a
line saying what each pays on — *"paid when a meeting is marked held"* and
*"paid on the deal value at conversion"*. Both blank is a valid, quiet state.

**The rep's dashboard** gets one earnings block whose shape follows their model:

- per-appointment: *"8 held this month · $400 pending · $250 earned"*
- commission: what is there today
- both: two lines, one total

Held-but-unapproved is shown as **pending**, so a rep can see what is waiting on
you and ask.

**Your side** gets *"Owed to reps"* — accrued and approved, unpaid — beside
*"Owed to you"* on the Money page, and a payout screen per rep: the approved
lines, a total, and **Mark paid** writing one `rep_payouts` row. The same shape
as logging a client payment, which is the interaction you already know.

**Money page.** Payouts derive into the ledger the way client payments do
(`payoutTxns`, mirroring `paymentTxns`), so rep pay lands in *Where it goes* as
an expense category and in the month-by-month net. And **accrued-but-unpaid rep
pay is a liability** — it belongs beside burn in *Next 90 days*, because it is
committed money in exactly the way a signed retainer is committed income.

That answers the part you flagged: it is your biggest incoming expense and it is
currently invisible. It should be visible **before** you pay it, not after.

---

## What I would not do

- **Pay on booked.** You have ruled it out; recording it so nobody re-opens it.
- **Auto-approve.** The approval step is the only thing standing between a rep
  and their own payday.
- **Reverse paid money automatically** (question 3).
- **A separate "appointments" concept.** A paid appointment is a meeting with a
  status the CRM already tracks. Inventing a parallel record would be the
  `onboarding`/`delivery` mistake in `ENGINEERING.md` §5.

## Build order

1. `src/lib/reppay.js` + tests — pure: `apptEarnings(lead[], rep, rates)`,
   `commissionEarnings`, the pending/approved/paid state machine, and the
   one-fee-per-appointment rule. Provable before it touches a screen.
2. `REP-PAY-MIGRATION.sql` — `appointment_rate` on `crm_users`, `rep_payouts`
   with RLS, and a `VERIFY-RLS.md` §8 proving a rep sees only their own payouts.
   **Before any UI**, same rule as every boundary in this project.
3. Settings → Team rates.
4. The rep dashboard earnings block.
5. Approval (batched) and the payout screen.
6. Money page: owed-to-reps, the ledger, the 90-day view.
7. `ROLES.md` — a rep can now see their own pay in a second currency, and
   `VERIFY-RLS.md` §8.

## The open question I would want answered before step 3

**Does an appointment fee depend on who owns the lead, or who set the meeting?**
Today a meeting belongs to a lead, and a lead has one owner. If a rep books a
meeting on a lead somebody else owns — or a lead is reassigned after the meeting
— the fee follows the *lead*, which may not be what you mean. Stamping the
setter onto the meeting at creation would fix it, and it is much cheaper to
decide now than to reconstruct later.
