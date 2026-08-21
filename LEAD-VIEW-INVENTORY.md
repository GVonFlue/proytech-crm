# LEAD-VIEW-INVENTORY.md — everything the lead view does today

The acceptance criteria for the lead-view redesign. **Nothing on this list may
disappear.** Each PR in the redesign is done when `tests/leadinventory.mjs`
still passes, and that test asserts this list item by item.

Taken by reading `Modal` in `src/App.jsx` (1,020 lines) in full on 21 Aug 2026,
not by grepping it. Where an item renders only under a condition, the condition
is stated — those are the ones a redesign silently drops, because they are
invisible on the lead you happen to be testing with.

**How to read the conditions.** `isNew` is the create form. `rep` / `isOwner`
are roles. `isClient` is a converted lead. `isRelationship` is the same record
flipped to a relationship. Everything else is "this lead has data most leads
don't".

---

## A. Header

- [ ] **A1** Lead name — falls back to company, then `New Lead`
- [ ] **A2** Company · Business type subline — `!isNew`
- [ ] **A3** `Added {date} · Last contact {date}` — `!isNew`
- [ ] **A4** Stage badge — `!isNew`
- [ ] **A5** Priority badge — `!isNew`
- [ ] **A6** Call action (`tel:`) — `!isNew`; disabled, not hidden, when there is no phone
- [ ] **A7** Text action (`sms:`) — `!isNew`; disabled, not hidden, when there is no phone
- [ ] **A8** Email action (Gmail compose) — `!isNew`; disabled, not hidden, when there is no email
- [ ] **A9** Website action (new tab) — `!isNew`; disabled, not hidden, when there is no website

> **A6–A9 moved and A8 changed target.** They were 11px chips in the header;
> they are the contact-action block at the top of the prep rail now, and they
> render disabled rather than absent when the field is empty. A8 opened
> `mailto:`, which does nothing on a machine with no mail client registered —
> it opens Gmail compose now, with the account index read from localStorage.
> The four items still exist and are still asserted; only their location, their
> empty state, and A8's target changed. Count is unchanged at 157.
- [ ] **A10** Previous lead button — `!isNew && navList.length > 1`
- [ ] **A11** `N / M` position counter — same condition
- [ ] **A12** Next lead button — same condition
- [ ] **A13** Close button — always
- [ ] **A14** Fact strip — `!isNew`, nine facts:
  - [ ] **A14a** Stage — an inline `<select>`, not a jump link
  - [ ] **A14b** Priority — an inline `<select>`, not a jump link
  - [ ] **A14c** Source → jumps to Qualifying
  - [ ] **A14d** Owner → jumps to Qualifying
  - [ ] **A14e** Type → jumps to Qualifying
  - [ ] **A14f** Close → jumps to Qualifying
  - [ ] **A14g** Deal → jumps to Deal — **hidden when `rep && isPoolLead`**
  - [ ] **A14h** Your cut → jumps to Your commission — **only when `rep && commission`**
  - [ ] **A14i** Meetings → jumps to Meetings; highlighted when a future meeting exists

## B. Jump bar — `!isNew`

- [ ] **B1** `Jump to` label
- [ ] **B2** Meetings chip, badged with the booked count
- [ ] **B3** Qualifying chip
- [ ] **B4** Service chip, badged with the count of selected services
- [ ] **B5** Intro chip
- [ ] **B6** Deal chip

## C. Contact — always

- [ ] **C1** `Contact` heading (`New lead` when creating)
- [ ] **C2** Name · **C3** Company · **C4** Phone · **C5** Email · **C6** Website
- [ ] **C7** Birthdays & key dates:
  - [ ] **C7a** One row per key date: label, date, `· today` / `· in Nd`, `· turns N`
  - [ ] **C7b** Row highlights when inside its lead time
  - [ ] **C7c** Remove button per row
  - [ ] **C7d** Label picker, including `Something else…` which prompts and saves the new label
  - [ ] **C7e** Date input
  - [ ] **C7f** Add button, disabled until a date is chosen
  - [ ] **C7g** `Repeats every year…` hint
- [ ] **C8** Labels:
  - [ ] **C8a** One chip per label in the vocabulary, toggling on the lead
  - [ ] **C8b** `New` chip — prompts, saves to settings for everyone, applies it
- [ ] **C9** Duplicate warning with a clickable name — `isNew && (phone || email)` matching an existing lead

## D. Follow-up — `!isNew`

- [ ] **D1** `Follow-up` heading
- [ ] **D2** Follow-up date field — **see the duplication note below**
- [ ] **D3** Next action picker
- [ ] **D4** `What to do on this follow-up` textarea
- [ ] **D5** `N days overdue` / `Due today` / `Due in N days` + the date — when a follow-up is set

> **The one duplication being collapsed.** `followUp` renders **twice** in the
> current view with two different labels: `Follow-up date` here (D2) and
> `Follow-up Date` in the create form (E6g). Same field, same write path. This
> is the single exception to "presentation only" that has been agreed. Both
> entry points must still exist; they must be the same control.

## E. Create form — `isNew` only

- [ ] **E1** `First note` heading
- [ ] **E2** Activity-type chips, defaulting to `Call`
- [ ] **E3** First-note textarea, placeholder follows the chosen type
- [ ] **E4** Hint line — becomes `Logs as a {type} from {who} the moment you save`
- [ ] **E5** `Add more details` / `Hide extra details` toggle, with a one-line summary when closed
- [ ] **E6** Extra details:
  - [ ] **E6a** Business Type · **E6b** Lead Source · **E6c** Stage · **E6d** Priority · **E6e** Next Action
  - [ ] **E6f** Owner — a picker for an owner, a **disabled input** for a rep
  - [ ] **E6g** Follow-up Date — the duplicate of D2
  - [ ] **E6h** Expected Close · **E6i** Notes for the follow-up

## F. Delivery — `!isNew && isClient`

- [ ] **F1** `Delivery` heading with the overall state
- [ ] **F2** Per track: label, `N overdue` or `Next due {date}` badge, progress bar
- [ ] **F3** Per milestone: tick control, name, and either a done date or a due-date input that turns overdue
- [ ] **F4** `All delivery steps complete` + date — when finished
- [ ] **F5** `Revert to lead` link, with its confirm

## G. Collapsible sections — `!isNew`

### G1 Meetings — opens by default when a future meeting exists
- [ ] **G1a** Collapsed summary: next meeting, or `N booked`, or `none scheduled`
- [ ] **G1b** Meeting list: title, time, Held / No-show controls, type tag, remove
- [ ] **G1c** Undated meetings offer a date input
- [ ] **G1d** Scheduler: type chips, title, date, time, length, Invite client, Meet link, location with recent-location chips, notes
- [ ] **G1e** Scheduler tells you **whose calendar** it lands on — owner and rep wordings differ
- [ ] **G1f** Log a meeting with **no date yet**

### G2 Qualifying
- [ ] **G2a** Lead Source · **G2b** Business Type · **G2c** Stage · **G2d** Priority
- [ ] **G2e** Owner — picker for an owner, **disabled input** for a rep
- [ ] **G2f** Expected Close
- [ ] **G2g** Lead pool picker — **owner only**
- [ ] **G2h** `Add custom Next Action` — prompts and saves to settings

### G3 Service Interest
- [ ] **G3a** One chip per service, toggling
- [ ] **G3b** `Add custom` chip — prompts, saves, selects
- [ ] **G3c** Collapsed summary: `N selected`

### G4 Type & Introduction
- [ ] **G4a** Relationship toggle
- [ ] **G4b** `Kept out of Pipeline, Money & Dashboard…` hint — when a relationship
- [ ] **G4c** Tier buttons — when a relationship
- [ ] **G4d** `Introduced by` picker over every other contact
- [ ] **G4e** `How you know them` field
- [ ] **G4f** Intro chain: clickable nodes ending in this contact — when a chain exists
- [ ] **G4g** `It all traces back to X` — when the chain is longer than one
- [ ] **G4h** `N people came from this contact` — when they introduced anyone

### G4R Referral ledger — `isRelationship` only

> **AMENDMENT — six items, seven assertions, deliberately.** This is new
> capability rather than a reorganisation of something that already existed, so
> the gate moves from **157 to 164** rather than being held at 157 by leaving
> the new section unasserted. Everything on this list before is still on it and
> still asserted.
>
> Seven assertions for six items because G4Re is checked twice — that the form
> opens, and that it accepts a name that was never a lead, which is the half
> that makes it useful. G4h already works this way, so the gate has always
> counted assertions rather than bullet points.

- [ ] **G4Ra** Headline: given · received · collected
- [ ] **G4Rb** `collected` is won-and-collected, not pipeline — stated in its tooltip
- [ ] **G4Rc** Outbound list, newest first: name, optional note, date, remove
- [ ] **G4Rd** A linked entry opens that lead; a dangling one reads `record removed`
- [ ] **G4Re** Add form: an existing lead by name, or a name that was never a lead
- [ ] **G4Rf** Inbound list — the leads this contact introduced, each opening

### G5 Sponsorship
- [ ] **G5a** Potential sponsor toggle · **G5b** Past sponsor toggle
- [ ] **G5c** History rows: name (clickable to Events when it came from one), date, label, amount
- [ ] **G5d** `logged by hand` / `before events` provenance tags
- [ ] **G5e** `owed` marker on unpaid
- [ ] **G5f** Remove — manual entries only
- [ ] **G5g** Totals line: `$X across N · $Y owed`
- [ ] **G5h** `Log one by hand` — four prompts: what, how much, when, paid
- [ ] **G5i** Empty state
- [ ] **G5j** Sponsor tier + amount fields — when either toggle is on; the amount label changes once real sponsorships exist

### G6 Custom Fields — only when the install has any
- [ ] **G6a** Text, number and date fields
- [ ] **G6b** Select fields with their options
- [ ] **G6c** Checkbox fields, full width

### G7 Your commission — `rep && commission`
- [ ] **G7a** Amount · **G7b** Status · **G7c** The explanation of what the status means
- [ ] **G7d** Open by default

### G8 Commission — `isOwner && !isNew && isClient && commission`
- [ ] **G8a** Rep name
- [ ] **G8b** `Deal value entered by` + date — when stamped
- [ ] **G8c** Rate at conversion — **frozen once approved or voided**
- [ ] **G8d** Deal value used — same freeze
- [ ] **G8e** Commission total · **G8f** State, with approver and date
- [ ] **G8g** `Approve commission` — unless already earned
- [ ] **G8h** `Void` with confirm — unless already void
- [ ] **G8i** `Put back to pending` — only when void
- [ ] **G8j** The explanation of why the fields are frozen
- [ ] **G8k** Open by default

### G9 Deal
- [ ] **G9a** Closed deals: head with total and count, rows with label, date, who, amount, remove
- [ ] **G9b** `Lifetime with this client` line
- [ ] **G9c** One card per open deal: editable name, running total
- [ ] **G9d** Remove a deal — only when more than one
- [ ] **G9e** Setup / Website / Integration amounts
- [ ] **G9f** Extra line items: label, amount, remove
- [ ] **G9g** `Add line item`
- [ ] **G9h** `Won it — close this deal` — when the deal has a value; asks about a fresh checklist on an existing client
- [ ] **G9i** `Add a deal` / `Add another deal`
- [ ] **G9j** Deal total row
- [ ] **G9k** Monthly retainer field · **G9l** retainer-active toggle
- [ ] **G9m** Payments: `$X remaining` / `paid in full`
- [ ] **G9n** `plus $X/mo recurring — not counted in the balance`
- [ ] **G9o** Progress bar with `$X paid of $Y`
- [ ] **G9p** Payment rows: amount, date, **`counts in {Month}`**, note, remove
- [ ] **G9q** Overpaid notes — two wordings, one for retainer clients
- [ ] **G9r** `Log a payment` — four prompts: amount, date, note

## H. Convert and client banners — `!isNew`

- [ ] **H1** `Won the deal?` + `Convert to Client` — when not yet a client
- [ ] **H2** Client bar — three wordings: payment confirmed / not collected yet / monthly-only-no-setup
- [ ] **H3** `Mark payment collected` — prompts for date and amount, logs both in one write
- [ ] **H4** `Payment collected` toggles back off, with confirm
- [ ] **H5** `Revert to lead`
- [ ] **H6** `Not counted in your numbers` + `Fix close tracking` — client with no close date or not in the won stage

## I. Activity log

- [ ] **I1** `Activity Log` heading
- [ ] **I2** `Expand` / `Split` toggle — **the choice persists in localStorage**
- [ ] **I3** Touch bar: `N conversations`, the per-type breakdown, `since {date}` — when there is any activity
- [ ] **I4** `Not right now` one-tap park — logs the call, moves to nurture, sets the revisit date, **in one write**; hidden on nurture and won stages
- [ ] **I5** `Log a call, note or text` opener — when the composer is closed
- [ ] **I6** Composer:
  - [ ] **I6a** Type chips, defaulting to `Call`
  - [ ] **I6b** `Payment` chip — owners always, reps only when the install allows it
  - [ ] **I6c** Meeting scheduler — when the type is `Meeting Booked`
  - [ ] **I6d** Amount + note row — when the type is `Payment`
  - [ ] **I6e** Textarea for every other type, placeholder naming the type
  - [ ] **I6f** Tag picker with a chip per teammate, and `shows on X's dashboard`
  - [ ] **I6g** `logging as {me}` for a rep; a **who** picker for an owner
  - [ ] **I6h** `Log {type}` / `Log Payment` button
- [ ] **I7** Filter chips: `All (n)`, `Notes (n)`, and one per type with its count; zero-count chips dimmed
- [ ] **I8** Feed:
  - [ ] **I8a** A day heading whenever the date changes
  - [ ] **I8b** Rows: icon, text, `who · type · timestamp`, delete
  - [ ] **I8c** Cancelled meetings struck through and marked
  - [ ] **I8d** `@name` tags, clickable **by that person only** to clear, ticked once cleared
  - [ ] **I8e** Meeting-log rows read through from their own table: title, headline, summary, the meeting block, source, attendees, and whether a line is published to the lead — **owner only, because a rep gets an empty array from Postgres**
  - [ ] **I8f** Empty states, worded for the active filter
- [ ] **I9** Danger zone:
  - [ ] **I9a** Owner: `Delete lead` with confirm
  - [ ] **I9b** Rep: `Mark as {Lost}` with confirm, plus `Leads are never deleted…`
  - [ ] **I9c** Rep with no lost stage configured: `Only an owner can delete a lead`
- [ ] **I10** `Save the lead to start logging activity.` — `isNew`

## J. Create footer — `isNew` only

- [ ] **J1** `Create Lead` — or `Create Relationship` when opened from Relationships
- [ ] **J1r** Opened from Relationships, the blank record has `isRelationship` set

> **AMENDMENT — one item, four assertions.** The New button on the Relationships
> page used to create a *lead*. It creates a relationship now, which is a
> behaviour change and not a label: the intent is threaded as its own new-record
> id so the blank record is seeded correctly, and the button, the header and the
> footer all say what will be made. Gate moves from **164 to 168**.
>
> The last of the four asserts the WRITE — that the record created carries
> `isRelationship` — because three labels agreeing proves nothing about what
> lands in the database.
- [ ] **J2** `Cancel`
- [ ] **J3** Summary: `{name} · {company} → {owner}`, or `Name is the only thing required`

---

## What is deliberately NOT on this list

Behaviour, not presentation. The redesign may not change any of it, and the
inventory does not restate it: which helper computes a number, what a write
contains, the order of a patch, or any of the reasons recorded in
`AUDIT.md` / `REP-AUDIT.md`. `tests/leadinventory.mjs` asserts the list above;
the existing suites keep asserting the behaviour underneath it.
