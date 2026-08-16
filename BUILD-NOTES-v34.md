# BUILD-NOTES — v34

**Supersedes every earlier zip.** Cumulative. Upload everything.

`App.jsx` → `src/`, `supabase.js` → `src/lib/`, `api/*.js` → `api/`,
`MIGRATION.sql` · `ENGINEERING.md` · `GLOSSARY.md` · `tests/` → repo root.

---

## New in v34 — the activity feed gets the whole column

### What was actually wrong

**Two nested scrollers.** `.m-right` had `overflow-y:auto`, and `.feed` inside
it also had `overflow-y:auto` — but with no flex sizing.

A flex child with `overflow` and no `flex` value collapses to its content's
minimum height rather than claiming what's left. So the feed became a ~120px
sliver with its own scrollbar, while the column scrolled around it. Two
scrollbars, one tiny window, exactly what your cursor was pointing at.

### The fix

- `.feed` → `flex:1 1 auto; min-height:0` — claims all remaining height.
  **`min-height:0` is the load-bearing part**; without it a flex child refuses
  to shrink below its content and overflows instead of scrolling. Same line
  that makes the sidebar scroll, same reason.
- `.m-right` → `overflow:hidden` — the column no longer scrolls at all. **The
  feed is now the only scroller in that panel.**
- Everything above it (header, summary, Not right now, composer, filter chips)
  is `flex:none`, so it stays put and the feed absorbs whatever's left.
- **Delete lead** moved into a pinned `.m-danger` block below the feed. It was
  in the scroll flow, taking height the feed needed.

On a tall window the feed now gets roughly 700px instead of 120.

### Mobile does the opposite, deliberately

On a phone the columns stack and the whole modal scrolls as one page — so the
feed must *not* be its own scroller there, or you'd get a small box inside a
long page. `.feed{flex:none;min-height:auto;overflow:visible}` under 760px.

The desktop and mobile rules are exact opposites and both are correct. Worth
knowing before someone "simplifies" one of them.

## Verification

Twenty-three suites, **547 checks, all passing** (`npm i --no-save jsdom`).
`tags.mjs` asserts both rules exist — the feed claims height on desktop and
releases it on mobile — plus that the column stopped scrolling and delete is
pinned.

## Still open

- `ONB_ITEMS` and `MEETING_TYPES` are hardcoded.
- Import has no duplicate detection.
- Sponsor deliverables aren't tracked.
- Tags, birthdays and event milestones don't notify.
- `onboarding` and `delivery` are two parallel checklist systems.
- The app outside the sidebar is still the light theme.
