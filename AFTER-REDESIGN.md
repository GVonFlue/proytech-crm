# Decisions parked until the new lead view has been lived with

Two things found during the lead-view redesign and deliberately **not** changed
inside it. Both are visibility or counting questions, both would have moved
numbers in a PR whose whole claim was that no numbers moved, and both are
easier to judge once the new screen is a habit rather than a preview.

Each gets its own PR, so the before and after can be seen.

---

## 1. Machine-written notes are counted as human contact

Full write-up: **`TOUCH-COUNT-FINDING.md`**.

`touch()` removes exactly one app-written note — `Lead created.` — and the
comment explaining why applies to seventeen others. `noteCount` has no
exclusion at all.

**What is wrong:** the Notes chip, the contact tally in the prep rail, and the
`All (n)` count — all on the lead view.

**What is not:** `REACHED_TYPES` excludes `Note` entirely, so touch counts, the
untouched filter and the conversion ratio are unharmed. A display bug on one
screen, not a metrics bug.

**Shape of the fix:** one shared `isSystemNote(a)` predicate read by both
`touch()` and `noteCount`, so they cannot disagree. Displayed counts only — no
write path, no stored field.

**Before you decide:** run the SQL in the finding. `pct_machine` is the share
of the Notes chip that is the app talking to itself. That number is the
argument.

> The redesign already folds *consecutive* machine notes into one line
> (`tests/leadpaint.mjs`). That is presentation and fixes none of this — the
> test asserts the counts are still wrong, so this cannot be quietly closed by
> the fold.

---

## 2. Should a rep see the payments panel?

**Found:** PR 5, while composing Tony's view.

A rep sees the full **Payments** panel and the **retainer** on a lead he owns:
what the client has paid, what is still owed, every payment row with its date
and note, and `Log a payment` if the install allows it.

**Why it was left alone:** narrowing it is a **visibility change, not a
presentation one** — the line drawn for the whole redesign. Changing it inside
PR 5 would have altered what a live rep can see, in a PR claiming to alter
nothing.

**What is already settled, and what is not:**

- REP-AUDIT #1 settled **deal value on a rep's own lead** — not a bug,
  `ROLES.md` was wrong. He sets it.
- REP-AUDIT #14 settled **deal value on an unclaimed pool lead** — withheld
  until he claims it. Already enforced.
- **Payments were never ruled on either way.** They are adjacent to deal value
  but not the same question: a deal value is what he sold, a payment is what
  the company collected.

**The argument for leaving it:** he sold the work and is chasing the balance;
"$2,300 still owed" is the reason for his next call, and hiding it makes him
ask an owner for something he needs weekly.

**The argument for narrowing it:** cash collected is company money, and a rep
paid on appointments rather than commission has no stake in it at all.

**A middle option** worth considering rather than a straight yes/no: show the
BALANCE (`owedBy`) — which is what drives his next call — and hide the payment
ROWS and `Log a payment`, which are bookkeeping.

**Whichever way it goes it needs its own test**, in the shape of
`tests/leadrep.mjs`: signed in as Tony, every section opened, asserting what is
and is not on the screen.

---

## Not on this list

Things found earlier and already recorded where they belong: the OAuth `state`
CSRF gap and `sheet-read` scoping (`API-AUDIT.md`), `REP-AUDIT.md` #10 and #14,
`AUDIT.md` #9–#12, #16, #20, #24, and the absence of CI.
