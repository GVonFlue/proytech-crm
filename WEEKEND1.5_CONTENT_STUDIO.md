# Weekend 1.5 — Content Studio: visuals, on-demand generation, header

Branch from `main`. PR #47 is merged.

Read `ENGINEERING.md` and `ROLES.md` first. All Weekend 1 constraints still apply: no schema
changes, no seeding, keep everything in `src/ContentStudio.jsx` and `src/lib/content.js`, API
keys server side only, no hex values in the component.

---

## The problem

Every post in the first run came back `format: "text_only"`, and the `image_prompt` the model
generated is not displayed anywhere. The feature currently produces no visual output at all.

Two causes, both fixable without touching the database.

---

## A. Format mix

The generator has no instruction about format distribution, so it picks the cheapest option
every time.

Read a new config row, `config.format_mix`, the same way you read `posts_per_week`. It is a
plain string the model reads as part of the prompt, for example:

```
Roughly half carousels, a third single static images, the rest text only.
Never return an entire slate as text_only.
```

If the row is missing, fall back to that exact string and list it in `config_defaults_used`
like every other config default. Do not create the row.

Add a hard check after parsing: if every post in a slate has `format = 'text_only'` and
`posts_per_week` is greater than 2, that is almost certainly the model defaulting rather than
a real choice. Log it and surface it in the response so it is visible rather than silent.

## B. Show the visual instructions on the card

Every card must display what the model actually produced for it, not just the caption.

- **`image_prompt`** — shown in a bordered block with its own Copy button, on any post that has
  one. Label it clearly as the prompt to paste into an image generator. This is the whole point
  of the card until image generation exists.
- **`concept`** — already stored, currently only partly visible. Show it fully.
- **`carousel_slides`** — when format is carousel, render the slides as a readable numbered
  list of headline plus body, with a Copy all button that copies them as plain text.

Do not hide any of this behind a toggle or an expander. If the model generated it, the card
shows it.

## C. Generate on demand, with a chosen mix

The weekly cron stays exactly as is. This adds a manual path beside it.

Add a **Generate custom** control on the Slate tab, next to Generate next week. It opens a
small panel where I set counts per bucket before generating:

- number of `personal` posts
- number of `proytech` posts
- number of `ad` posts

`ad` is a new mix class, written to the existing `mix_class` column as the string `'ad'`. No
schema change. Ad posts are written for people who do not know me, so they cannot lean on
relationships, names, or shared history the way the organic posts do. Put that instruction in
`src/lib/content.js` alongside the existing mix handling, and make it read from
`config.ad_instructions` if that row exists, falling back to a built-in default.

The panel also takes an optional free-text **focus** field ("speed to lead", "Military Suite
Night") that gets passed to the model as the topic for this batch, and a **week** selector
defaulting to the coming Monday so I can generate into the current week.

When counts are supplied they override `config.posts_per_week` for that run only. The spend cap
still applies and is still checked before the model is called. Total requested across all three
buckets is capped at 20 per run.

## D. Header

The Content Studio screen gets its own header band above the tab row:

- Wordmark reading **ProyTech Content Studio**, Space Grotesk 700
- Sits on the navy from `CONTENT_BRAND.navy`, with the primary blue used as an accent
- A thin accent rule or edge in `CONTENT_BRAND.accent`
- To the right of the wordmark, small Space Mono labels showing live counts: posts this week,
  approved, and month-to-date spend against the cap

All colors come from `CONTENT_BRAND` and `tint()`. No hex in the component — the existing test
asserts this, keep it passing.

---

## Deliver

One PR off main. In the description list every file changed, any new config row I should
create and its default, and the manual steps to verify. Run the full suite. Do not mark
anything complete that you have not run.
