# BUILD-NOTES — v33

**Supersedes every earlier zip.** Cumulative. Upload everything.

`App.jsx` → `src/`, `supabase.js` → `src/lib/`, `api/*.js` → `api/`,
`MIGRATION.sql` · `ENGINEERING.md` · `GLOSSARY.md` · `tests/` → repo root.

---

## New in v33 — the sidebar

Built from your reference image, **in SVG rather than as a PNG**: about 3KB,
crisp on any screen, and the nodes can pulse. A generated image could only ever
be a flat backdrop that blurs on a retina display.

### The artwork

Right-angle circuit traces down both rails, concentric arcs in the corners, a
faint 26px grid, hex clusters, and eight nodes — three of which pulse on a
staggered 4.5s cycle.

**Detail lives at the edges; the middle third is clean.** That's the single most
important thing your reference got right, and it's why the nav labels stay
readable. Busy artwork behind text is the fastest way to make a UI look cheap.

`prefers-reduced-motion` stops the pulse.

### The logo

**The box is gone.** It was `#000110` with a hard edge on a navy gradient —
that's precisely why it looked pasted on. Now the mark sits directly on the
panel with a soft cyan bloom behind it, the same way the bright node reads in
your reference.

Default size up from 34px to 56px max-height. **Your saved `logoSize` is 34**, so
to actually get it bigger, go to Settings and raise the logo size — the code
can't override a saved value without overriding it for everyone.

**BUSINESS SUITE** sits underneath in Space Mono, letterspaced, sky blue with a
faint glow. Reps still see "Sales".

### The panel and nav

Background went from `#211d44 → #12142B` to a deeper `#0F1433 → #0A0E27 →
#05071A`, which is what lets the traces read at all.

The active item was a solid cobalt slab that covered the artwork. It's now a
gradient fading to transparent with a **2px sky-blue lit edge** and an outer
glow, so the circuitry shows through and the icon picks up cyan.

## Verification

Twenty-three suites, **541 checks, all passing** (`npm i --no-save jsdom`).
`nav.mjs` asserts the backdrop renders behind the nav, the box is gone, the
subtitle reads Business Suite, and the reduced-motion rule exists.

## Still open

- `ONB_ITEMS` and `MEETING_TYPES` are hardcoded.
- Import has no duplicate detection.
- Sponsor deliverables aren't tracked.
- Tags, birthdays and event milestones don't notify.
- `onboarding` and `delivery` are two parallel checklist systems.
- The rest of the app is still the light theme. If you want the futuristic
  treatment beyond the sidebar, that's a much larger job — say so and we'll
  scope it rather than drift into it.
