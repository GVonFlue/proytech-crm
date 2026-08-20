# ROLES.md — who sees what, in plain English

One page. If anything below reads wrong to you, it's wrong — say so before this
goes to a rep.

## The two roles

**Owner** (you, Logan) — everything. Every lead, every dollar, the whole
dashboard, Settings, Team, commission approvals. Nothing about your day changes.

**Sales Rep** — their own world. Their leads, the pools you hand them, their
own commission, and a leaderboard. No company money, anywhere.

## What a rep sees

| | Rep |
|---|---|
| Leads | Only leads they own, plus unclaimed leads in the pools you gave them |
| Dashboard | Their commission (pending + earned), their conversions, their goal, their rank |
| Leaderboard | Every rep ranked by **clients closed**. No dollars. No owners on it. |
| Deal value **on a lead they own** | **Yes.** They are paid on the deal, so they can see it — on the lead, in the table, in their CSV |
| Deal value **on a pool lead they have not claimed** | See the note below — this is the one worth deciding deliberately |
| Company revenue / MRR / forecast / pipeline totals | **Never.** A rep sees the value of *their* deals, never a company-wide figure |
| Anyone else's deal value | **Never** — they only ever see leads they own or can claim |
| Another rep's commission | **Never** |
| Their own commission | Yes — the amount and whether it's Pending, Earned or Voided |
| Meetings | **Their own appointments in one place** — the same list the leads carry, scoped to leads they can see. No deal value, no totals |
| Playbook | **Published notes only.** Never a draft — a draft returns them zero rows from Postgres, same as a meeting log |
| Settings, Clients, Invoices, The Books, Money, Relationships, Monday Huddle | Off. You can switch individual tabs on per rep; the money ones are flagged ⚠ |

A rep can never see a tab you've turned off for the whole install in
**Settings → Sections**. Per-rep tabs narrow what the install has; they can't
widen it.

### Why deal value is visible, and what is not

A rep is paid on the deal, so hiding its value would mean hiding the thing their
pay is calculated from. It shows on the lead, in the `Deal` column, and in the
CSV they export.

What stays hidden is **everything aggregate**: open pipeline, weighted forecast,
revenue collected, MRR, avg deal size, what the business is owed, and any other
rep's numbers. A rep can tell you what *their* deals are worth. They cannot tell
you what the business is worth, and nothing on their screen adds their leads up
into a company figure.

That distinction is the actual rule, and it is enforced by scope rather than by
redaction: a rep's screens only ever run over leads they own or can claim, so
there is no company-wide total available to render.

**The assistant is stricter than the screen.** Money is stripped from the JARVIS
payload for a rep entirely — deal values, retainers, payments and commission are
absent from the request, not hidden in the answer — because a chat box walks
around a hidden column. That is deliberate and it stays.

## How a rep gets paid

Two structures, per rep, **either or both**. A rep is on a model when its rate
is non-zero — set both to zero and they are on no pay model yet, which is what a
new hire looks like and what their dashboard says.

| | |
|---|---|
| **Per appointment** | A flat fee for a meeting **marked held**. Cancelled and no-shows pay nothing. |
| **Commission** | A share of the deal value at conversion. Unchanged from below. |

Set both in **Settings → Team**.

### The appointment fee

**Paid on held, never on booked.** A meeting that did not happen is worth
nothing, and paying on booked rewards setting appointments that never happen.

**The fee follows whoever SET the appointment**, not whoever owns the lead. Leads
get reassigned and a rep must not lose a fee they earned because you moved one.
The setter is stamped on the meeting when it is created and never changes.

**The rep marks it held, you approve.** Same three states as commission, on
purpose — two pay models that behaved differently would be two things to learn.
Marking held used to be neutral bookkeeping; it is now a claim for money, so the
record carries **who marked it and when**.

**Approval is a batch.** *"Dana · 12 held · $600 · Approve all."* One click a
week, not twelve. Approving **freezes the rate**, so changing what a rep earns
later never restates what you already agreed to.

**One fee per appointment, not per attempt.** A meeting rescheduled three times
and held once earns once.

### If a held meeting stops being held

| State | What happens |
|---|---|
| **Awaiting approval** | The fee is derived from the status. Unmark it and the fee simply stops existing. |
| **Approved** | **Nothing reverses silently.** It is flagged — *"approved at $75, no longer marked held"* — and you void it or leave it. |
| **Paid** | **Never reverses.** Money that has left is corrected with a new line, not rewritten. |

### What you see

**Settings → Rep pay** — per rep: what is awaiting approval, what is approved,
what has been paid, and **Mark paid**, which records money you have sent. It does
not send it.

**The Money page** — *"Owed to reps"* beside *"Owed to you"*, and accrued pay in
the 90-day view. Payouts land in the ledger as an expense, so rep pay finally
reaches the month-by-month net and *Where it goes*. This is the biggest cost the
business is taking on and it was invisible.

**A rep sees their own** — awaiting approval, approved, and what has been paid
out. Never another rep's.

## Commission — three states

1. **Pending** — the rep hits *Convert to Client*. Their % × that lead's deal
   value at that moment lands in their running total immediately. It's the
   motivator, not money yet.
2. **Earned** — you flip *Approve commission* on the client record. Stamped with
   the date and your name. This is the real-money state.
3. **Voided** — client cancels or doesn't pay, you void it. It leaves their
   pending and earned counts entirely.

The percentage and the deal value are **snapshotted onto the lead** at
conversion. Changing a rep's % in Settings later, or editing the deal, does not
silently rewrite a commission that already happened. If a deal value genuinely
changed before you approved it, edit the base right there on the commission
record — the app recalculates and logs it.

## When a rep converts a client

- Their commission goes to Pending and they see one short celebration.
- You get an **Awaiting onboarding** queue at the top of your dashboard:
  "[Rep] converted [Client] — start onboarding." Hit *Got it* to clear it.
- No email is sent (this install has no mail sender — see BUILD-NOTES).

## Pools

**Claiming a lead takes it out of its pool.** That matters more than it sounds:
the database rule is *"you can read a lead you own, **or** one in a pool you
have"*, so a claimed lead that kept its pool would stay readable by every other
rep who has that pool. It is cleared on claim, and on any assignment you make.

A pool is a named bucket of unclaimed leads — "Inbound", "Outbound", whatever
you want. You put a lead in a pool from the lead's **Qualifying** section. Reps
you've given that pool can see those leads and **claim** one, which makes it
theirs. A rep can't reassign a lead to anybody else — the database blocks it.

## Meeting Log — the one thing that can cross

The Meeting Log holds two kinds of meeting, and a rep can read **neither** of
them. The table is owner-only in Postgres, not hidden by the screen.

- **Internal** — the Sunday CEO meeting. Stays put. Feeds the open-loop list
  and the Monday Huddle. Nothing about it reaches a lead.
- **Client** — attached to a lead. Its summary shows on that lead's record for
  **you only**, read straight from the log rather than copied, so editing the
  log updates the lead and deleting it takes the summary with it.

The single exception: on a client log you can write a short line and press
**Add to lead**. That line — and only that line — becomes an ordinary note on
the lead, which means **whoever owns that lead can read it**. The transcript
and the extraction never go with it.

Nothing is published automatically. If you never press the button, no rep ever
sees anything from a meeting log. A published line does not count as a call or
a meeting in anyone's activity numbers; it's a note.

Deleting a client log does **not** remove a line you already published. Take
that off the lead itself.

## Playbook — the one thing meant to cross

The Meeting Log is owner-only and the crossing is an exception. The Playbook is
the opposite: it exists in order to be read by reps. That makes it the first
deliberate you-to-them channel in this system, so it is worth knowing exactly
how it works.

Every note is one of two things:

- **Draft** — yours alone. A rep's login gets **zero rows**, the same way it
  gets zero meeting logs. Not a hidden screen; Postgres refuses.
- **Published** — every active rep can read it, and the assistant answers rep
  questions from it.

A new note is always a draft. **Publishing is a button you press**, on a screen
that first shows you exactly what a rep will see — read back from the database,
not re-rendered from what you typed. Nothing publishes itself and nothing
imports wholesale.

Once published, your later edits are **not** live. Reps keep reading the last
version you approved, and the note is flagged **"Published version is behind"**
until you publish again. That is deliberate: you should be able to half-rewrite
something without the sales team reading it mid-thought.

**Unpublish** takes a note back immediately; your draft is untouched.
**Deleting** a published note removes it from reps at the same moment.

You can start a note from a meeting recording. The recording is read once to
draft the text and is **never stored on the note** — what saves is what you
leave in the box after editing it. There is no transcript column on either
Playbook table, so pay talk and pricing in a recording cannot travel with a
note: the text simply is not kept.

Reps get the Playbook tab by default. A rep who already has a custom tab list
keeps it, so switch it on for them in **Settings → Team**.

The same is true of **Meetings**, which reps now get by default because a rep
paid per appointment needs to see their appointments and their fees in one
place. A rep with a custom tab list will not have it until you switch it on.

## Pocket recordings

Every recording you make arrives in the CRM by itself and waits in **Your day**
on the dashboard. Nothing about it is automatic beyond arriving.

A recording is a **source**, not a note. One Sunday call is ten minutes about a
client, five about internal decisions and two of process worth publishing, so
you make **as many outputs from it as it deserves** — a note on a lead, a note
on a relationship, an internal business note, a Sunday meeting, a Playbook
draft. The recording stays, so you can come back next month and make another.

**Deep extract** proposes those outputs and drafts each one; you edit the text
and press Create on the ones you want. It is the only button here that costs
anything. Making an output by hand costs nothing.

**No rep can see any of it.** The recordings table is owner-only in Postgres,
the same as the Meeting Log — a rep's login gets zero rows, proved in
VERIFY-RLS.md §7. And no output ever carries the transcript: what gets filed is
the prose you edited, so a lead's record has never held one. The only two ways
anything reaches a rep are the two that already existed: the line you write and
publish on a client log, and publishing a Playbook draft through its preview.

If Pocket deletes a recording their end, we mark ours and take it out of the
queue — we do not delete your copy. That is your button, on the recording.

## Turning someone off

**Deactivate** ends their access at the next page load, takes them off the
leaderboard, and keeps every lead, note and commission they ever made.
**Remove** deletes their CRM record; their leads stay where they are.

## The honest limits

Two things are **not** enforced by the database, only by the screen:

1. **Aggregate money.** Deal value on a lead is intentionally visible (above),
   but the *company-wide* figures are kept off a rep's screen by never rendering
   them, not by Postgres. The lead rows they can legitimately read contain the
   numbers those totals are made of, so a determined rep with the browser
   console could add them up. Scope is the real control; the missing tiles are
   a UI decision.
2. **Tasks / invoices / transactions / the huddle.** These are stored as one
   shared blob, so they can't be split per person. Reps don't get those tabs,
   which is why it doesn't bite — but a hidden tab is not a locked door.

3. **Your own Playbook drafts, in your own assistant.** A rep can never be
   given a draft: their browser cannot obtain the text at all, so it does not
   exist in their session to send anywhere. But Postgres cannot stop **your**
   browser from putting **your** draft into a request to **your** assistant —
   you are allowed to read that text, and the database cannot tell showing it
   to you from sending it. What keeps that from happening is a test asserting
   on what actually goes out over the network (`tests/kb.mjs`), not a policy.
   The rep side of it is a real boundary; this side is a tested promise.

Everything else — which leads a rep can read, edit, or claim; who can manage
people; who can approve commission; which Playbook notes a rep can read — is
enforced in the database, and VERIFY-RLS.md shows you how to prove it.
