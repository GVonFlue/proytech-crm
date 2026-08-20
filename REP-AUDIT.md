# REP-AUDIT.md — the sales rep experience, before a real person is in it

Read against `ROLES.md` and `VERIFY-RLS.md`. Originally **findings only**;
fixes are now marked inline as they land.

**Method.** I did not only read the code — I mounted the real app signed in as a
rep (Dana, one pool, one lead worth $7,500) and read what actually rendered.
Everything marked **seen** below is from that render, not from reasoning about
the source. The database boundaries were taken as proven and are not re-tested.

---

# 1. What they can reach

## 1. ~~Deal value is on a rep's screen~~ — **NOT A BUG. ROLES.md was wrong.**

> **Corrected by the owner:** reps are paid on the deal, so they need to see it.
> `ROLES.md` has been updated to match the code. What follows is kept because
> the *pool* half of it is still an open decision — see the note at the end.

`ROLES.md` says, in bold: *"Deal value: **Never.** Not on the lead, not on a
card, not in a column, not in the CSV."*

Signed in as Dana, all three of those happen:

| Where | What renders |
|---|---|
| **Leads table** | a sortable **`Deal↕`** column showing **$7,500** |
| **Lead modal header** | a **`Deal $7,500`** chip, beside Stage and Priority |
| **CSV button** | present on the Leads page, and `cols` includes `dealValue`, `retainer`, `retainerActive` |

The header chip is at `src/App.jsx:7623` and carries **no rep condition** — the
line immediately below it does (`(rep&&cmsnOf(draft))?…`), so the gating was
clearly on someone's mind and this one was missed. The column is `leadColumns`
(804) with no rep filter. The CSV (`csv()`, ~5276) has no rep filter and no
rep-gated button.

This is the single most-stated promise in `ROLES.md` and it is not kept. It is
also the one a rep will notice first, because the column is **sortable** — the
fastest way to find out what everyone's deals are worth is to click the header.

**Resolution:** the code is right and the doc was wrong. `ROLES.md` now says a
rep sees deal value **on leads they own**, and that what stays hidden is
everything **aggregate** — pipeline, forecast, revenue, MRR, avg deal, what the
business is owed, and any other rep's numbers. That distinction is enforced by
**scope** rather than redaction: a rep's screens only run over leads they own or
can claim, so no company total is available to render.

**Still open — the pool half.** Deal value on a lead they *own* is settled. Deal
value on a **pool lead they have not claimed** is a different question, and my
recommendation is below at #14.

## 2. Claiming a lead does not clear its pool, so two reps in one pool can read each other's claimed leads

`stampOwner` (2843) ends with `pool: l.pool||null` — the pool is **preserved**
on every write, and nothing anywhere clears it. Claiming sets `owner`/`owner_id`
and leaves `pool: 'Inbound'` sitting on the record.

The RLS policy is `owner_id = auth.uid() OR (pool is not null AND pool = any(my_pools()))`.
So once Rep A claims an Inbound lead, **Rep B — who also has Inbound — still
matches the second clause**. Postgres returns the row. The app agrees:
`inMyWorld` (2818) has the same shape and, unlike `isPoolLead` (312), does not
require `!l.owner_id`.

Rep B will not see a *Claim* button on it (that path checks `!l.owner_id`), but
the lead is in their `scoped` list, which drives **the dashboard counts, the
Activity feed, search, and the JARVIS payload**.

**Why this has never shown up:** `VERIFY-RLS.md` §2 gives Rep A `Inbound` and
Rep B `Outbound`. With disjoint pools the clause can never fire. **The scenario
that breaks it is two reps sharing one pool**, which is the normal way to run an
inbound queue and is exactly what happens when you hire a second rep.

With **one** rep this is harmless. It becomes real the day there are two.

**Fix:** clear `pool` when a lead is claimed, and add a §2 case with two reps in
one pool. Half a day. The database change is nothing — it is the app that must
stop writing the pool back.

## 3. A rep booking a meeting writes to *your* Google Calendar — **FIXED**

`ENGINEERING.md` §6: *"One OAuth token app-wide. **Not multi-tenant.**"*

The lead modal passes `gcalConnected`/`createCalendarEvent` to every user with
no rep gate, so a rep scheduling a meeting creates the event on **the connected
account's primary calendar** — yours. They will not see it appear anywhere, and
you will get calendar entries you did not make.

Nothing in `ROLES.md` mentions this.

**Fix:** either hide calendar sync from reps (they still get the CRM meeting
record, which is what the counts read) or say plainly on the scheduler whose
calendar it lands on. An hour for the honest version.

**FIXED** — the honest version. The scheduler now has a rep variant on **both**
branches, and the second one turned out to matter more than the first:

- **Connected:** *"Goes on **Garrett**'s Google Calendar, not yours"*. The owner
  still sees the connected Google address exactly as before.
- **Disconnected:** the owner copy says *"Open **Settings → Google Calendar**"*
  — and `canOpen()` refuses Settings to a rep **by role**, so that sentence
  instructed a rep to do something the app will not let them do. The rep
  version names who can do it, and says the meeting is saved in the CRM either
  way.

The name comes from `crm_users`, falling back to that row's email when the name
is blank. Both from `crm_users` rather than from the Google account, because
`gcalEmail` is empty on the disconnected branch and one rule has to work on
both.

With two owners it names the one whose CRM email matches the connected Google
account — the only answer actually derivable — and otherwise says *"the
owner's"* rather than picking. On this screen a wrong name reads as a fact
about where the rep's work went, so guessing is worse than declining to.

Covered by `tests/repdefaults.mjs`, including the owner view being unchanged on
both branches.

## 4. JARVIS: the payload is clean; the exposure is whatever #2 leaks

Checked directly rather than assumed. For a rep:

- `jvMoney` is **null** (2826) — no money object is built at all.
- `indexLine` omits `v` and `ret` behind `if (!rep)` — **absent, not blanked**.
- `detailOf` omits `dealValue`, `retainer`, `closedAt`, `deals`, `payments`, and
  the whole object goes through `redactMoney` on the way out.
- Proposed actions are validated against `visibleIds`, so it cannot act on a
  lead they cannot see.
- Published Playbook notes are included, which is the intent.

**So turning it on exposes nothing new about money.** What it does is make
everything they *can* read conversational and fast — including **pool leads**,
whose notes and activity history land in the payload. If #2 is unfixed, that
includes another rep's claimed leads, and JARVIS will happily summarise them.

Two smaller things worth knowing before you switch it on:

- **Reps have no JARVIS tab by default** (`REP_DEFAULT_TABS`), so it is a
  per-rep decision in Settings → Team, which is the right shape.
- **Every question costs money against `JARVIS_BUDGET`**, shared with your own
  usage. A rep asking twenty questions a day spends from the same $20.

**My read: safe to turn on, after #2.** Not before — the two compound.

## 5. The Pipeline page would leak money if you ever switch it back on

Switched off in AUDIT #17, so this is latent rather than live. `Pipeline`
renders `Your Open Pipeline` as `usd(totalOpen)` and a `Weighted Forecast`
(5180–5181) with **no rep gate** — aggregate deal value, straight to a rep.

**Fix:** gate those two tiles before the tab is ever re-enabled, or it comes
back with the module.

---

# 2. Is it usable?

## 6. The dashboard tells a new rep almost nothing to do — **seen**

Dana's first screen, verbatim:

> **Welcome, Dana** — Your month, your commission, your rank
> **Your commission** · Pending **$0** · 0 clients awaiting owner approval · Earned **$0**
> **This month at a glance** · Clients Converted **0** · Meetings Booked **0** · Leads Worked **0** · Follow-Ups Due **0** — nothing overdue
> **Your rank** — *The leaderboard turns on once you're set up as a rep.*
> **Your clients** — *Convert your first client and your commission shows up here.*

Five zeros, two empty states, and **no next action anywhere on the page**. She
has one open lead and the dashboard does not mention it, link to it, or suggest
touching it. The one thing a new rep needs on day one — *here is who to call* —
is on a different tab.

The owner's dashboard has **Your day** doing exactly this job. Reps do not get
it.

**Fix:** give reps a "Your day" equivalent — follow-ups due, untouched leads,
meetings today — as the first block. Half a day, and it is the single highest
-value change in this document.

## 7. "Your rank — the leaderboard turns on once you're set up as a rep" — **shown to a rep** — **seen**

Dana **is** a rep. The copy fires whenever `board` is empty, and tells the
person reading it that they are not what they are. On day one, when the
leaderboard genuinely has nothing in it, this is the message every new rep sees.

**Fix:** one string. Ten minutes. It is in this list because it is the first
thing that will make a new rep think the tool is broken.

## 8. "Leads Worked 0 · 1 open right now" contradicts itself in six words — **seen**

Two numbers about the same leads, side by side, disagreeing. "Worked" counts
logged touches; "open" counts stage. Both are defensible and together they read
as a bug.

**Fix:** say what "worked" means — *"0 touched this month · 1 open"*.

## 9. Logging a call takes four clicks and the default is the wrong type — **FIXED**

The most common thing a rep does all day:

1. Click the lead row
2. Scroll to the activity block and click **"Log a call, note or text"**
3. Click **Call** — because the type defaults to **Note**
4. Type it
5. Click save

Step 3 is pure tax: the button says "Log a **call**, note or text" and then
gives you a note. Every call logged as a note is invisible to `REACHED_TYPES`,
which drives touch counts, the untouched filter, and the conversion ratio — so
getting this wrong quietly corrupts the numbers the rep is measured on.

The `Call` chip in the header is a **`tel:` link** — it dials and logs nothing,
which is a reasonable thing for it to do and absolutely not what its name
suggests next to a "log" flow.

**Fix:** default the composer to `Call`, or offer one-tap type buttons that open
the composer already set. An hour, and it is worth doing before a rep builds the
habit of logging everything as a note.

**FIXED** — the composer defaults to `Call`. The new-lead composer already did
(`firstType`), so this also stops the two disagreeing.

**No backfill.** The obvious worry is every call already logged as a note, so it
was checked before assuming: 17 untouched leads of 140, and none of them carries
a note that reads like a call. There is nothing to migrate, so nothing was
migrated — a backfill that rewrites activity types on a guess is not reversible
and would have been worse than the bug.

Covered by `tests/repdefaults.mjs`, which asserts on the **write** rather than
on which chip looks highlighted, because the write is what `REACHED_TYPES`
reads. `tests/tags.mjs` reached the Note type through the old default without
ever clicking it; it now picks Note deliberately.

## 10. Booking a meeting is behind a collapsed section on exactly the leads that need it

The Meetings section defaults open **only if there is already an upcoming
meeting** (`Sec('meetings', …, (draft.meetings||[]).some(m => …>= Date.now()))`).
So on a brand-new lead — the one you are trying to book — it is closed, and the
scheduler is invisible until you find and expand it.

**Fix:** default it open when there are **no** meetings. One character of logic,
and it inverts to match what the screen is for.

## 11. A rep cannot see their meetings in one place — **FIXED**

`REP_DEFAULT_TABS` has no `meetings`. They can book from a lead and see it on
that lead, but there is no "what have I got on this week". For a role whose job
is booking meetings, that is the missing tab.

**Fixed**, and it mattered more than fifteen minutes' worth once appointments
became money. `meetings` is in `REP_DEFAULT_TABS`, and the page carries a pay
strip for a rep on the per-appointment model — their rate, what earns it, what
does not, and how much is awaiting approval — plus the fee state on each row
they set.

Still no company money on it: the page renders no deal value and no totals, and
there is a test asserting that over every row.

**A rep with a custom tab list will not have it** until it is switched on in
Settings → Team. Same per-rep trap the Playbook hit.

## 12. Things a rep needs that they do have — checked, so the list is honest

- **Move a lead through stages** ✓ — a picker in the modal header *and* on the
  row, both one click.
- **Set a follow-up** ✓ — a date field plus a "what's the plan" note, and the
  Follow-Up tab is in their defaults.
- **Claim from a pool** ✓ — one button.
- **See their own commission** ✓ — pending and earned, on the dashboard.
- **Their own numbers** ✓ — conversions, meetings, goal, rank.
- **Playbook** ✓ — published notes, searchable.
- **Owner field is locked** ✓ — `rep ? <input disabled> : <Sel…>`, so they
  cannot reassign, matching what `ROLES.md` promises.

## 13. Smaller friction, in the order it will annoy them

- **No pool notification.** A lead dropped into their pool appears silently.
  Nothing on the dashboard says "3 new in Inbound".
- **The empty states assume history.** *"Convert your first client and your
  commission shows up here"* is fine; *"The leaderboard turns on…"* is not (#7).
- **`Import a list` is in a rep's sidebar.** They can bulk-import leads that
  become theirs. Probably intended, worth confirming — it is the one write in
  their sidebar that creates records at volume.
- **No way to see which pools they have** except by the Pool tab being empty or
  not. The copy names them (*"Unclaimed leads in Inbound"*) only when there is
  something to show.

---

# What I did not test

- **RLS itself** — taken as proven per your instruction, except where the app
  and the policy disagree about intent (#2), which is a design gap rather than a
  policy failure.
- **A second rep.** Everything above is one rep against one pool. #2 is
  reasoned from the policy and the code, not observed — it needs two logins to
  see, and `VERIFY-RLS.md` §2 is currently written so it cannot appear.
- **Mobile.** Reps will use this on a phone and I looked only at desktop layout.

## 14. The sortable Deal column across the pool — what I would do

**Show deal value on leads a rep owns. Hide it on pool leads until claimed.**

The privacy argument is gone — they are paid on the deal. What is left is a
**behavioural** argument, and it is about the pool specifically.

A sortable `Deal` column over an unclaimed pool turns the queue into a
leaderboard of which lead is worth most. Reps will sort descending and claim the
top of the list. That is rational and it is probably not what you want a pool
for: it means the cheap leads rot, the first rep in takes the best ones, and
"first come, first served" quietly becomes "highest value, first served".

It also makes the number least trustworthy exactly where it matters most — an
unclaimed lead's deal value is usually a guess typed at import or during a first
call, and sorting a queue by an estimate dressed up as a figure is worse than
not sorting it.

So:

- **Their own leads** — column, chip, CSV, sortable. They are paid on it and it
  is their own work.
- **Pool leads** — hide the value until claimed; the row shows what actually
  helps them choose (source, age, business type, what was said).
- **Sorting still works**, because it only sorts what they can see.

Cost: a condition on the column renderer and the facts chip keyed on
`isPoolLead(l)` rather than on `rep`. Two hours.

**If the pool is a queue you assign from rather than one reps self-serve, none
of this matters** and the simplest thing is to leave it visible. It only bites
when reps pick for themselves — which is what the Claim button is for, so I
assume they do.

# Suggested order

**Done:** #2 (pool cleared on claim), #3 (the scheduler names whose calendar it
is), #6 (a rep dashboard with a next action), #7 and #8 (the two strings), #9
(the composer defaults to Call), #11 (a Meetings tab). #1 resolved as a
documentation fix.

**Still open, in the order I would take them:**

1. **#10** — the Meetings section is collapsed on exactly the leads you are
   trying to book. One character of logic, and it was the other half of the
   booking flow #3 just made honest.
2. **#14** — the pool column decision. Cheap, and better made before a rep
   builds a habit around it.
4. **#11** — a Meetings tab, which matters more once appointments are paid.
5. **#4** — JARVIS is safe to enable now that #2 is fixed.
6. **#13**, **#5**.
