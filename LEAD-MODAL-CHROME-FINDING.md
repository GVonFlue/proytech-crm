# LEAD-MODAL-CHROME-FINDING.md — 218px above the work

**Status: flagged, not fixed.** Deliberately. It affects the owner's view as
much as the rep's, and it is a design question rather than a layout bug.

## The measurement

Chrome, **764px viewport**, rep lead view, against a bundle of `main`:

| | height | share of the modal |
|---|---:|---:|
| `.m-head` | **170px** | 23% |
| `.m-jump` | **48px** | 7% |
| `.m-grid` — everything you actually work in | 506px | 70% |
| modal | 725px | |

**218px is spent before the working area starts.**

## Why it matters

That 506px column is what the activity composer and the feed divide between
them, and they were measured fighting over it. Before the fix in #68 the
composer took 293px and left the feed 79: the most recent note showed 49% of
itself, no past entry was fully visible, and with the BK brief open the feed
was **0px**.

#68 fixed the split — the feed floors at 110px, the last note renders whole,
and the order of yielding is now explicit (the Log button never gives, then the
note box, then the feed). Removing the rep's "Not right now" one-tap returned
another 44px, which went straight to the feed on a 502px column: **128 → 172px**.

But both of those divided the same 506px more fairly. Neither made it bigger.
**Everything below is still working inside 70% of the modal**, and on a 688px
laptop the feed sits pinned at its floor with the Log button below the fold.

## Why it was left

`.m-head` is the first thing anyone sees on every lead, for both roles.
Changing it is a question about **what in that header earns its height**, not a
bug with a right answer. #68's scope was the composer and the feed; widening it
to the header would have been the scope creep `CLAUDE.md` says to escalate
rather than assume.

## Where to start, when it is worth doing

`src/App.jsx` — `.m-head` and `.m-jump`. The header currently carries:

- the lead name, company and business type
- an added / last-contact line
- stage and priority chips
- a right-hand block of **stage, priority, source, owner, type, close, deal and
  meetings** tiles

That last block is the candidate. Several of those fields are **also** editable
in the CONTACT and Qualifying panels directly below it, so the header is partly
a second view of things the page already shows — which is the same duplication
pattern that produced the scheduler-versus-BK split and the "Not right now"
second logging path.

**Measure before and after, in a browser.** jsdom has no layout and will report
whatever you want to hear — every number in this document was taken with
`getBoundingClientRect` against a real render.
