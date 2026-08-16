# BUILD-NOTES — v32

**Supersedes every earlier zip.** Cumulative. Upload everything.

| In the zip | Goes to |
|---|---|
| `App.jsx` | `src/App.jsx` |
| `supabase.js` | `src/lib/supabase.js` |
| `MIGRATION.sql` · `ENGINEERING.md` · `GLOSSARY.md` | repo root |
| `api/*.js` | `api/` · `tests/` | repo root |

Run `MIGRATION.sql` in Supabase. `npm run build` exits 0.

---

## New in v32 — the activity log is readable

Your screenshot showed the problem exactly: seven type buttons, a textarea, tag
chips, an owner dropdown, a Log button and seven filter chips — **then** the
feed, well below the fold. You opened a lead to read history and got a form.

### The composer collapses

It's now a single dashed row: **＋ Log a call, note or text**. Tap it and the
full composer appears; log something and it closes again. The feed is what you
came for, so the feed is what you see.

### A contact summary above the feed

> **14 conversations** · 9 calls · 3 texts · 5 meetings · 2 emails · since Mar 4

**"Conversations" means calls plus meetings**, not every row. A note you typed to
yourself isn't a conversation, and neither is an email. The breakdown is beside
it so nothing is hidden by the summary.

"Lead created." is excluded from the note count — it's written by the system, so
counting it would mean every lead claims one touch it never had.

### Every filter chip carries its count

`All (14) · Notes (4) · Booked (2) · Call (9) · Text (3) · Meeting (5)`

The chips were already there but only Notes had a number, so answering "how many
times have we talked" meant clicking each one and counting rows. Types with zero
are dimmed rather than hidden — absence is information too.

This is deliberately the *same* numbers as the summary line above, from one
function. Two independent tallies of the same activities would eventually
disagree, which is the bug class that's bitten this project four times.

### The feed groups by day

**Today**, **Yesterday**, then **Thu, Aug 14**. A long feed was one
undifferentiated wall of rows; now you can find last week without reading every
timestamp.

---

## A regression this caused, and caught

Collapsing the composer hid the **tag chips** and the **Meeting Booked**
scheduler inside it — both suites went red immediately. Fixed in the tests by
opening the composer first, which is what a person would do. Worth noting the
build was green the whole time; only the DOM tests knew.

## Verification

Twenty-three suites, **534 checks, all passing** (`npm i --no-save jsdom`).

## Still open

- `ONB_ITEMS` and `MEETING_TYPES` are hardcoded.
- Import has no duplicate detection.
- Sponsor deliverables aren't tracked.
- Tags, birthdays and event milestones don't notify.
- `onboarding` and `delivery` are two parallel checklist systems.
- **Contact counts are per lead only.** There's no "you called 40 people this
  week" anywhere — that'd be a dashboard tile reading the same function.
