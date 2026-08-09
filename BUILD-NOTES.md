# Build notes — conversation capture + goals engine

Against the brief `CRMCONVERSATIONANDGOALSPROMPT`. Part A and Part B are built.
Part C was not started.

```
npm install
npm run build          # exits 0
npm i --no-save jsdom  # DOM tests only; not added to package.json
npm test               # 102 passed, 0 failed
```

---

## What was built

### Part A — conversation capture

- **`api/conversation.js`** — Sonnet (`claude-sonnet-4-6`), strict JSON, parsed
  defensively on both sides. Modelled on `api/huddle.js`. The thread goes to
  `api.anthropic.com` and nowhere else, and nothing is logged in the handler,
  including on the error path.
- **`src/lib/convo.js`** — everything decidable without the model: splitting a
  paste into turns (explicit labels, `From:` / `On …, X wrote:` markers, blank-
  line blocks), local speaker signals, chunking, response validation, note
  rendering, field diffs. Pure, and unit tested directly.
- **Composer** — a `Conversation` button in the lead modal alongside
  Note / Call / Text / Booked / Payment. Paste → review → save.
- **Speaker review** — the model proposes a mapping with its evidence and a
  confidence, you confirm or swap with one tap, and **nothing is written until
  exactly one speaker is marked as the lead**. Save is disabled until then.
  Two speakers both mapped to the lead, no speaker mapped to the lead, or a
  hallucinated speaker who is not in the thread all collapse to "I can't tell
  who is who" rather than a guess.
- **What lands** — one `Note` activity carrying the structured summary,
  stamped with **the date the conversation happened**, not the date it was
  pasted. Extracted facts are offered as field diffs with the old value shown
  and a conflict flag; suggested follow-ups are checkboxes, unchecked by
  default. One `updateLead` call, never two.

### Part B — goals engine

- **`src/lib/goals.js`** — periods (monthly / quarterly / annual with
  seasonality weights), seven goal types, per-person and per-team targets with
  reconciliation, the backwards-planning chain, working-day arithmetic,
  Wilson intervals, sample-size gating, gap-to-goal ranking, and the
  explanation formatter. Pure. Every derived number has a worked example in a
  comment, and every worked example is re-derived by a test.
- **Backwards planning** — `target ÷ avg deal = deals ÷ close rate =
  meetings ÷ show rate = bookings ÷ working days left`, off this install's own
  rates from `useMetrics`. Entered at the right rung per goal type.
- **Sample size next to every rate, without exception.** Below the threshold
  (10, configurable per install) a rate reads as a range and says the sample is
  thin. Proportions use a Wilson interval; average deal size uses the observed
  min–max spread, because a confidence interval on three deals is false
  precision and "your three deals ran $1,500 to $8,000" is both truer and more
  useful. A thin rate does not stop the plan — it widens it into a range.
- **Honest pace** — by working days, not calendar days, and it says *by how
  much* you are behind and what it now takes to catch up.
- **Gap to goal with names** — the specific open deals whose expected value
  (`value × stage probability`) covers what is still needed, and an explicit
  "your open pipeline can't cover this" when it can't.
- **Explain on tap** — every card shows the formula and the inputs, sample
  sizes included.
- **Goal wizard** in Settings: pick a period, type a target, see immediately
  what it means in meetings, adjust. Per-person targets reconcile against the
  team number and the difference is shown deliberately.
- **Dashboard section** `goals`, in `settings.dashOrder` / `dashHidden` like
  every other section.

---

## Answers to "ask before assuming"

| Question | Answer (Garrett) |
|---|---|
| Retention for pasted conversations, hard or soft delete | **Neither — the raw thread is never stored.** It converts to a note and the paste is discarded. |
| Owner-set or self-set goals | **Owner sets all.** |
| Can a rep see team goal / forecast | **No.** Own target, own pace, own daily number only. |
| Sample-size threshold | **10**, exposed as a per-install setting. |

### On not storing the thread

This changes Part A materially and for the better. The brief asked for a raw
thread behind a "show full conversation" toggle plus a retention setting and a
delete. Garrett's call was that the thread should not live in the CRM at all.

What that buys: there is no retention policy to write, no purge job to run, no
delete button to get wrong, and nothing to hand over if a client ever asks what
you keep about the people they talk to. A pasted thread is a third party's
personal data and the safest place for it is nowhere.

**The cost, stated plainly:** you cannot later check a summary against the
transcript. If the model mis-summarises, the mistake is the record. Two things
push against that — the extraction quotes the client's own words where it can,
and nothing is written until a human has reviewed the speaker mapping and the
note preview. It is the right trade for a two-person business. It would be
worth revisiting for a team large enough that whoever reads the note is never
the person who pasted it.

---

## Assumptions, stated

1. **A quarterly or annual target is planned against this month's share of it.**
   `useMetrics` computes month-to-date figures and nothing else. Measuring a
   whole quarter would mean a second aggregation over every lead — a second
   place for the numbers to disagree with the dashboard. One month, one set of
   numbers. The UI says so on screen. Whole-period progress is a v2 item.
2. **MRR is a running total and is never divided across months.** A $5,000
   annual MRR target is $5,000 of MRR, not $60,000.
3. **Working days default to Mon–Fri**, changeable per install. A realtor who
   works Saturdays should say so or every daily number is too high.
4. **Conversation is a composer mode, not a stored activity type.** It writes an
   ordinary `Note`. Adding a real new type means `ACT_TYPES`, `ACT_ORDER` and
   `ACT_ICON` all move together, and a `Conversation` filter tab that matched
   nothing would be worse than no tab. A test asserts no new type reaches the
   database.
5. **`settings.goals` (the five legacy flat numbers) is left exactly as it is**
   and keeps driving the existing tile progress bars. The planner reads a new
   `settings.goalPlan`, and every write keeps the five legacy keys in step, so
   the dashboard tiles, the Monday huddle digest and the goals screen cannot
   disagree. Loading an existing install writes nothing at all — there is a
   test for that.
6. **Suggested follow-ups become `Task` activities on the lead** when ticked,
   not rows in the separate tasks list. `Task` is an existing type with an
   existing icon; the tasks list is not reachable from the lead modal.
7. **The daily number is not rounded up before dividing.** The brief's worked
   example rounds 13.47 bookings up to 14 and then divides by 9 to get 1.6. I
   divide 13.47 by 9 and get 1.5. Both defensible; the unrounded one does not
   accumulate rounding into the number people are measured against.

---

## What was cut

- **Part C in its entirety** — sheet import, CSV/XLSX upload, the AI advisor,
  forecast accuracy tracking, sales velocity. Not started, per the brief.
- **Whole-period (quarter/year) progress measurement** — see assumption 1.
- **Rep-visible team forecast** — deliberately not built. It would need a
  security-definer RPC like `crm_leaderboard`, because RLS means a rep cannot
  read anyone else's leads and so cannot compute a team number in the browser.
  Building the RPC to then show a rep something the answer above says they
  should not see would be work spent going backwards.
- **A `retention` setting and a delete for stored conversations** — no longer
  applicable, see above.

---

## Bugs found on the way

All pre-existing unless noted.

0. **Monthly / Quarterly / Annual were one number wearing three labels** —
   reported from the live install, fixed. v1 stored a single `team` set and let
   `period` decide how to *read* it, so $200,000 typed as an annual target was
   literally the same stored number as $200,000 monthly: the toggle relabelled
   the figure instead of showing a different one, and editing either overwrote
   the other. `goalPlan` is now v2, with `targets: {month, quarter, year}`,
   each holding its own `team` and `people`. `plan.team` / `plan.people` are
   **derived views** of the active period and are stripped before storage
   (`serializeGoals`) so they can't drift from `targets`. Switching the period
   is a pure view change that touches no number.
   Migration: a v1 plan's single set lands in the slot for the period it was
   saved under, and the five legacy flat keys — which were always monthly —
   keep the monthly slot. A period never used stays empty rather than being
   back-filled with a guess.
   Also fixed alongside it: the wizard labelled a monthly-share plan with the
   *period* name, so a $200k annual target read as "$197,702 to go in 2026"
   when the number was actually August's share; and `sentence()` named the
   period on the normal path but not on the no-history path, so the same target
   read as period-scoped or not depending on whether the install had history.

1. **`tests/` does not exist.** The brief says the repo has a jsdom harness to
   extend. `main` has one commit ("Add files via upload"), no `tests/`, no test
   script, and jsdom is not a dependency. The harness in `tests/harness.mjs` was
   written from scratch: esbuild (already present as a Vite dependency, so no
   new package) bundles the real `src/App.jsx` with `./lib/supabase` swapped for
   a recording stub, and jsdom mounts it signed in. Tests assert on what reached
   the database, not on what appeared on screen.

2. **A stray `App.jsx` at the repo root**, 5,187 lines, diverged from the
   6,567-line `src/App.jsx` that `index.html` actually loads. Dead code that
   anyone grepping the repo would land in first. Deleted.

3. **`daysSince()` returned `NaN` for a missing or unparseable timestamp**, and
   the `NaN` went straight to screen — a lead imported without a `createdAt` and
   never touched rendered **"NaNd ago"** in the Last Contact column. Now returns
   `null`, rendered as an em dash. Every other caller was checked; the one
   behavioural difference (`NaN < n` is false, `null < n` is true) was in the
   "cold for at least N days" lead filter, where an explicit null check keeps
   the old behaviour exactly rather than silently dropping those leads.

4. **`settings.goalPlan` was being dropped on every load.** `setSettings` after
   the boot fetch rebuilds the settings object from an explicit field list, and
   any key not on that list is discarded. A stored `goalPlan` survived the write
   and vanished on the next refresh. Same bug in the backup-restore path. Both
   fixed. Caught only by a DOM test — the app looked completely fine.

5. **New dashboard sections were appended to the bottom for anyone who had ever
   saved a layout.** `dashOrderOf` did `[...saved, ...missing]` while its own
   comment promised new sections appear "in default position". On the one
   install that has saved a layout, Goals would have landed underneath ten other
   sections. Now inserted at its default index, which moves nothing that was
   already saved relative to anything else.

6. **`normalizeGoals` (new code, caught by its own test)** — `Math.max(1,
   num(x) || DEFAULT)` treats a stored `-3` as truthy and yields a sample
   threshold of **1**, i.e. every rate on the install treated as trustworthy
   from a single data point. Exactly the failure this feature exists to prevent.

7. **`normalizeGoals` (new code)** — targets arriving from `jsonb` as strings
   were being spread through unchanged. `"9000" / 2500` happens to work;
   `"9000" + 500` gives `"9000500"`. Everything is coerced through `num()` now.

8. **Speaker parsing (new code, caught by its own test)** — the email marker
   regex used a lazy `.+?` before the comma, so
   `On Tue, Aug 4, 2026 at 9:14 AM, Garrett Von Flue wrote:` produced a speaker
   named `Aug 4, 2026 at 9:14 AM, Garrett Von Flue` — a date offered to the user
   as a person in the review screen.

9. **The test runner deadlocked itself.** Test files importing the runner while
   the runner was `await import()`-ing them is a circular top-level await; ESM
   reports "Detected unsettled top-level await" and the suite silently reports
   nothing. Split into `tests/assert.mjs` (assertions + collector) and
   `tests/run.mjs` (discovery).

---

## Definition of done

- [x] `npm run build` exits 0
- [x] Every new behaviour has a jsdom test asserting on what reaches the database
- [x] Backwards-planning maths has unit tests: zero history, single-deal sample,
      divide-by-zero, target already hit, negative remaining days
- [x] Speaker mapping tested with a labelled thread, an unlabelled thread, and a
      thread where the model must refuse to guess
- [x] A malformed AI response degrades to a plain note, never a crash — and the
      fallback keeps the user's own paste rather than losing it
- [x] Goal numbers reconcile with the dashboard — the goal card and the KPI tile
      read the same pair, and `settings.goals` is kept in step on every write
- [x] Every rate shown displays its sample size
- [x] Existing installs see identical historical numbers — loading writes nothing
- [x] BUILD-NOTES.md

## Test inventory

```
convo.test.mjs   30   splitting, signals, chunking, parsing, merging, notes, diffs
dom.test.mjs     18   the real app in jsdom, asserting on database writes
goals.test.mjs   54   periods, working days, intervals, the planning chain, edges
                 ---
                 102
```
