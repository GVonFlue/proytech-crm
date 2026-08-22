# Weekend 1 — Content Studio module

Paste everything below into Claude Code, in the `proytech-crm` repo.

---

Read `ENGINEERING.md` and `ROLES.md` before writing any code. Follow every rule in them.

## Context you need

The Supabase tables for this feature **already exist**. I created them by hand. Do not
write migrations, do not create tables, do not alter tables, do not seed data. Read the
schema from the live database and build against exactly what is there.

The tables are:

- `content_brand_context` (category, key, value, active, sort_order)
- `content_research` (source_type, url, platform, format, raw, why_it_worked, used, captured_at)
- `content_posts` (week_of, mix_class, surface, pillar, format, hook, concept, image_prompt,
  carousel_slides jsonb, captions jsonb, cta_key, value_statement, idea_id, parent_id,
  series_key, series_index, source_research uuid[], source_insights uuid[], recycled_from,
  status, generated_at, posted_at, platform_post_ids jsonb, performance, created_at)
- `content_assets` (post_id, kind, slide_index, storage_path)
- `content_usage` (provider, operation, units, est_cents, created_at)

**Out of scope this weekend.** These tables also exist and are for later phases. Do not build
UI for them, do not read from them, do not write to them, do not drop them:
`content_ideas`, `content_insights`, `content_mining_state`.

On `content_posts`, the columns `idea_id`, `parent_id`, `series_key`, `series_index`,
`source_insights` and `recycled_from` are for later phases. Leave them null. Do not remove
them. The only new column you use this weekend is `surface` and `value_statement`.

## Hard constraints

1. **Do not add this to `src/App.jsx`.** Create `src/ContentStudio.jsx` as a self contained
   screen, the same way `src/LeadView.jsx` was extracted. App.jsx gets a route and a nav
   entry, nothing else. Shared helpers go in `src/lib/content.js`.

2. **Feature flag it.** The tab only renders when `VITE_CONTENT_STUDIO === 'true'`. Default off.

3. **API keys are server side only.** `ANTHROPIC_API_KEY_CONTENT` lives in Vercel env vars and
   is read only inside `api/` routes. It must never appear in the client bundle or in any
   `VITE_` prefixed variable. Every new API route goes behind `api/_guard.js` the same way the
   existing protected routes do. Read `_guard.js` first and match its pattern exactly.

4. **No image generation this weekend.** Text only. That comes later.

## What to build

### A. `api/content-slate.js`

A POST route, guarded, that generates next week's slate.

**Nothing about how this route behaves may be hardcoded.** Post count, model, spend cap and
the instruction wrapper all live in `content_brand_context` under the `config` category. Read
them at runtime. If a config row is missing, fall back to a sensible default and log it, but
never inline the value as a constant.

Steps:
1. Read the `config` rows first. Check `content_usage` for the current calendar month against
   `config.monthly_cap_cents`. If exceeded, return a 429 with a clear message and generate
   nothing. This is a hard spend cap.
2. Read all `content_brand_context` rows where `active = true`. Group them by category.
3. Read `content_research` rows where `used = false`, most recent 20.
4. Read `content_posts` from the last 4 weeks where `performance` is not null, so the model
   can see what actually landed.
5. Build the system prompt: `config.instructions` first, then the voice, forbidden, pillar,
   cta, offer, audience, mix and proof categories composed into readable sections, then
   `config.output_contract` last. Do not dump raw rows and do not write your own wrapper text
   around them. Put this composition in `src/lib/content.js` as a pure function so it can be
   unit tested and reused.
6. Call the Anthropic API using `config.model`, asking for `config.posts_per_week` posts. The
   mix category specifies the personal/ProyTech ratio and it must be respected.
7. Parse the JSON per `config.output_contract`.
8. Parse defensively. Strip fences if present. If parsing fails, log the raw response and
   return an error rather than writing garbage rows.
9. Insert the posts with `status = 'draft'` and `week_of` set to the coming Monday.
10. Mark the research rows used.
11. Write a `content_usage` row with the estimated cost.

The route accepts an optional `{ "dry_run": true }` which does everything but the inserts and
returns the parsed posts. I want that for testing.

### B. `api/content-regenerate.js`

A POST route, guarded, taking `{ post_id, mode }` where mode is `caption` or `full`.

Rebuilds the same brand context using the shared function from `src/lib/content.js`, then
rewrites either just the two captions or the whole post, keeping the same `week_of`,
`mix_class` and `pillar`. Same spend cap check, same usage logging. This exists so I can keep
a concept I like and fix the wording without regenerating the week.

### C. Vercel cron

Add to `vercel.json`: a weekly cron hitting `/api/content-slate` at `0 1 * * 1`
(Sunday 8pm Central). The cron must authenticate the same way the other scheduled routes do,
and it must not be callable by an unauthenticated request.

### D. `src/ContentStudio.jsx`

Four tabs inside one screen.

**Slate** — the current week's posts as cards. Each card shows the mix class and the surface as
small badges (personal vs ProyTech should be visually distinct), the pillar, the format, the
hook in large type, the concept, the value statement, and an editable caption textarea. The
caption tabs are driven by `config.surfaces`, never hardcoded. Actions per card: Approve, Kill,
Copy caption, Regenerate (with a caption/full choice), and a field to record the platform post
ID and performance note after publishing. A "Generate next week" button that calls the route
manually.

**Today** — approved posts only, one per screen, big tap targets, built for a phone held in one
hand. One tap copies the caption. Shows the surface prominently so I know where it goes. A
"Mark posted" button that stamps `posted_at`. This is the screen I actually use on a Monday
morning, so it matters more than it looks.

**Research** — a fast capture form at the top: source type, URL, platform, format, a raw
textarea, and why it worked. One submit. Below it, the recent rows in a compact list with the
unused ones first. This form needs to be usable one handed on a phone.

**Brand** — an editable table of `content_brand_context`, grouped by category, with inline
edit, an active toggle, and the ability to add a new row in any category or create a new
category. This is where I change pricing and tune voice. Make it obvious that edits here
change what gets generated.

This tab also needs **Export** and **Import** buttons that read and write the whole table as
JSON. That is the white-label path: a future client install gets seeded by importing a JSON
file instead of anyone touching code. Import must be additive with a confirm step, never a
silent overwrite.

### E. Visual language

Read all brand colors from env vars with the ProyTech values as defaults, so a white-label
install changes them without a code edit:

```
VITE_BRAND_PRIMARY   default #1338DE
VITE_BRAND_ACCENT    default #FB6926
VITE_BRAND_ACCENT_TEXT default #D97706
VITE_BRAND_NAVY      default #000110
VITE_BRAND_INK       default #111528
```

Do not inline a hex value anywhere in `ContentStudio.jsx`. Space Grotesk 600–700 for display,
Inter for body, Space Mono for labels. Keep the app's existing layout shell and spacing.

## Deliver

One PR. In the description list every file added or changed, the exact env vars I need to set
in Vercel, and the manual steps for me to verify it works end to end. Do not mark anything
complete that you have not actually run.
