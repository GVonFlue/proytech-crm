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
| Settings, Clients, Invoices, Money (The Books), Monday Huddle, Build Console, Events, Sponsors | **Never**, and they **cannot** be switched on per rep — not even by editing a rep's tab list. Each one writes settings, invoices, the books or events, which only an owner may write in Postgres (RLS-TIGHTEN-2026-10), so a rep given one would get a screen whose saves fail silently. Events and Sponsors carry sponsor amounts, which a rep does not read at all. |
| Relationships | Off by default. You can switch it on per rep. A rep who has it also gets a **Reach out** card on their dashboard: relationships **they own** that are due a touch (overdue, due this week, birthdays), with Log touch. Nothing else from the owner's "What's due". The cadence itself (Settings → Relationship cadence) is yours alone. They never see the **Sources** leaderboard or a referrer's setup won / MRR (revenue roll-ups are yours). |
| Referred by / Arrived via | A rep sets both when they **create** a lead. After that they are read-only for the rep, and a change you make is noted on the lead. This is a screen lock, not a database rule: Postgres cannot stop a rep editing one field of a lead they own without a trigger, which would be its own change. |
| Dropdown lists and lead columns | A rep **picks from your lists** — Next Action, Service Interest, key-date labels, labels — and cannot add new entries; adding one changes the list for everyone. The Leads **Columns** menu is yours alone for the same reason: the layout is shared by the whole team. |
| Tasks | Yes — the one shared setting a rep writes. See *The honest limits*. |
| Proposals | **Never**, and it cannot be switched on per rep. Proposals carry prices, a client's plan and your raw meeting notes, so the table is owner-only in Postgres (VERIFY-RLS.md §12) and both proposal routes require an owner. A rep's login reads zero rows |
| Onboarding | **Never**, and it cannot be switched on per rep, not even by editing a rep's tab list. A client's onboarding holds their answers, license and NMLS numbers, an EIN for texting registration, their team and their uploaded files (EIN letters, insurance, contact lists). Both tables are owner-only in Postgres (VERIFY-RLS.md §14), the files sit in a private bucket only the server can reach, and the one owner route runs requireOwner. A rep's login reads zero rows; the client record's Onboarding tab is not rendered for a rep |

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
not re-rendered from what you typed. **Nothing publishes itself.**

**Import notes** reads a JSON file and creates the notes in it — added because
seeding a playbook by hand is most of a morning. It changes nothing about the
above: everything it creates is a **draft**, and each one still has to be
previewed and published one at a time. It also refuses a file with a bad row
rather than writing the good rows before it, and skips any title that already
exists, so re-running it does not duplicate. `PLAYBOOK-SEED.json` in the repo
root is ProyTech's own — the cold call script and the six SOPs, cut from
`SALES-SCRIPT.md` and `SALES-SOPS.md`.

### What a rep's Playbook actually looks like

Not a list of titles. The published notes are grouped into **modules** by their
category and laid out as tiles, so an objection is **two clicks** from anywhere:
the tab, then the tile. That matters because the highest-frequency use of this
whole system is a rep mid-call who has just been asked something.

Inside a note, a line written as `> "say this"` renders as **the words to say**
— large and set apart — and ordinary paragraphs render as the reasoning
underneath. A line written as `! never do this` renders as a compliance rule.
The note with the most of those is **pinned to the landing screen** as a strip
of headlines a rep can read without opening anything.

Ordering inside a module comes from the number in the title (`SOP-01`,
`2. The in`), so notes stay in document order rather than in whichever order
they were last edited.

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

## The onboarding portal — the one thing a CLIENT fills in

When a client accepts a proposal, an onboarding is created for them and the
"You're in" screen's **Start my onboarding** button opens it. You can also make
one by hand from the **Onboarding** tab for a client with no proposal.

- **The client has a link, not a login.** Like a proposal: 256 random bits in
  the link's `#`. Anyone with the link can see and edit that client's answers
  until they submit, so it is emailed only to the address on the lead.
- **They never type a password, card number or Social Security number.** The
  portal says so, and the server refuses to save anything shaped like an SSN
  or a card number, naming the field.
- **Deposit paid, access, logo and headshot received are the client's
  checklist on the Clients page.** The Onboarding tab's toggles tick the same
  items; there is no second copy. The launch clock starts on the latest of:
  submitted, deposit, each required access item, and each required asset (the
  logo, unless they have none; the headshot, when a website is being built),
  Terms 6.2. It counts the offer's launch days in **calendar** days (Terms
  6.1, "Live in 14 days"); it counted business days until October 2026.
- **On submit** you get an email (owners only), and the next time the CRM is
  open it ticks the client's checklist (intake form, logo, headshot) and
  notes what came in. The answers PDF, both build prompts and the files are
  on the Onboarding tab and on the client record.
- **A rep sees none of it.** See the table above.

## The client lifecycle — stages, the 14 days, "What's due"

Owners only, like the Clients page it lives on. A client moves Intake → Build
→ Review → Launched → Active by itself where the rule is mechanical (the
clock starts; 30 days after launch; 45 days with no logged contact moves an
Active client to At Risk) and by your hand where it is a decision (Send for
review, Mark launched, and any move at all from the board). Every move is a
note on the client with who made it, "Automatic" included.

Due dates are worked out from the template in **Settings → Client
lifecycle** and are never stored, so a pause (Terms 6.3) moves every open
date at once. A date you type on an item wins. They stay on the client's
record: the dashboard's **What's due** reads them there, and nothing is put
in the shared Tasks list unless you assign an item to someone by hand.

- **A rep sees none of it**: no What's due on their dashboard, no strip on any
  card, and their session never moves a client, even one they converted and
  still own. `tests/lifecyclerep.mjs`.

## Turning someone off

**Deactivate** ends their access at the next page load, takes them off the
leaderboard, and keeps every lead, note and commission they ever made.
**Remove** deletes their CRM record; their leads stay where they are.

## The honest limits

These are **not** fully enforced by the database — some only by the screen:

1. **Aggregate money.** Deal value on a lead is intentionally visible (above),
   but the *company-wide* figures are kept off a rep's screen by never rendering
   them, not by Postgres. The lead rows they can legitimately read contain the
   numbers those totals are made of, so a determined rep with the browser
   console could add them up. Scope is the real control; the missing tiles are
   a UI decision.
2. **Settings, tasks, invoices, transactions, the Build Console.** These live
   in `app_settings`, one shared row per kind, so they cannot be split per
   person. Since RLS-TIGHTEN-2026-10, **writing** them is enforced in
   Postgres: only an owner may write any row except `tasks`, which every listed
   user saves because Tasks is a rep tab. What is still screen-only:
   - **Reading.** Any listed user can *read* every row — the app loads settings
     for everyone. A determined rep with the browser console could read the
     invoices and the books, though not change them.
   - **Tasks.** The task list is one row, so a rep who saves it writes the
     whole list, everyone's tasks included. The app only edits their own.
   - **Receipt files are not in this list.** They live in Storage, and since
     STORAGE-TIGHTEN-2026-10 only an owner can read, upload or delete one
     (VERIFY-RLS.md §15). Website images (`site-media`) are public to read and
     owner-only to change.

3. **Your own Playbook drafts, in your own assistant.** A rep can never be
   given a draft: their browser cannot obtain the text at all, so it does not
   exist in their session to send anywhere. But Postgres cannot stop **your**
   browser from putting **your** draft into a request to **your** assistant —
   you are allowed to read that text, and the database cannot tell showing it
   to you from sending it. What keeps that from happening is a test asserting
   on what actually goes out over the network (`tests/kb.mjs`), not a policy.
   The rep side of it is a real boundary; this side is a tested promise.

**Signed in is not on the team.** A login with no team row (a stray account,
or later a client of the portal) gets nothing from the CRM: no lead, no team
list, no leaderboard, no setting, and no API route. That is enforced in
Postgres (AUTH-LISTED-2026-10.sql, VERIFY-RLS §16) and in every signed-in
route (`guard`). Sign-ups are switched off in Supabase, so the only way to get
a login is an owner adding you (Settings → Team, through `api/team-login.js`).

Everything else — which leads a rep can read, edit, or claim; who can manage
people; who can approve commission; which Playbook notes a rep can read — is
enforced in the database, and VERIFY-RLS.md shows you how to prove it.
