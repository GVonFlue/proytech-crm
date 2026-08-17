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
| Deal value | **Never.** Not on the lead, not on a card, not in a column, not in the CSV |
| Company revenue / MRR / forecast | **Never** |
| Another rep's commission | **Never** |
| Their own commission | Yes — the amount and whether it's Pending, Earned or Voided |
| Settings, Clients, Invoices, The Books, Money, Relationships, Monday Huddle | Off. You can switch individual tabs on per rep; the money ones are flagged ⚠ |

A rep can never see a tab you've turned off for the whole install in
**Settings → Sections**. Per-rep tabs narrow what the install has; they can't
widen it.

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

## Turning someone off

**Deactivate** ends their access at the next page load, takes them off the
leaderboard, and keeps every lead, note and commission they ever made.
**Remove** deletes their CRM record; their leads stay where they are.

## The honest limits

Two things are **not** enforced by the database, only by the screen:

1. **Deal value.** It lives inside the same lead record a rep is allowed to
   read. The app never shows it to them — but that's the app's promise, not
   Postgres's.
2. **Tasks / invoices / transactions / the huddle.** These are stored as one
   shared blob, so they can't be split per person. Reps don't get those tabs,
   which is why it doesn't bite — but a hidden tab is not a locked door.

Everything else — which leads a rep can read, edit, or claim; who can manage
people; who can approve commission — is enforced in the database, and
VERIFY-RLS.md shows you how to prove it.
