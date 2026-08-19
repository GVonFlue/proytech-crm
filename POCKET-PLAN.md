# POCKET-PLAN.md — Pocket AI recordings into the CRM

Status: **plan only, nothing built. Revision 2.**

**What changed in r2:** r1 routed a recording to one destination, which loses
most of a recording. A Sunday call is ten minutes on a client, five on internal
decisions and two of process worth publishing. So the recording is now a
**permanent source** that stays put, and the owner creates **one or more
outputs** from it. §1 and §3–§8 are rewritten. §0 (the docs) and §2 (the
webhook) are unchanged and carried over.

Read `ENGINEERING.md` and `ROLES.md` first. `KB-PLAN.md` is the sibling document
for the Playbook and §6 leans on it.

---

## 0. What the docs actually say

From `docs.heypocketai.com/docs/api` and `/docs/api/webhooks`:

| | |
|---|---|
| Base URL | `https://public.heypocketai.com/api/v1` |
| API auth | `Authorization: Bearer pk_xxx` |
| Delivery | `POST`, `application/json`, UA `HeyPocket-Webhook/1.0`, 30s timeout |
| Retries | 3 attempts, exponential backoff 1s–30s |
| Guarantee | **At-least-once** |
| Headers | `X-HeyPocket-Signature`, `X-HeyPocket-Timestamp` (unix ms) |
| Signature | `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`, timing-safe compare |
| Payload | `event`, `timestamp`, `user{id,email}`, `recording{title,description,duration,language,createdAt}`, `summarizations{summary,actionItems,mindMap}`, `transcript[]` |

Events: `transcription.completed`, `summary.completed` ("full post-processing is
complete"), `summary.regenerated`, `summary.updated`, `mind_map.completed`,
`action_items.regenerated`, `speakers.labeled`, `transcript.edited`,
`action_items.updated`, `recording.created`, `recording.deleted`,
`recording.merged`, `translation.completed`.

Two facts drive most of the design below: **at-least-once** (so every write must
be idempotent) and **the signature is over the RAW bytes** (so the body must not
be parsed before it is verified).

### What the docs do NOT say — resolve before building

1. **The recording's id field name.** The payload description lists
   `recording.title/description/duration/language/createdAt` and never names an
   id. The whole idempotency design needs a stable key. Plan: read
   `recording.id ?? recording.recordingId ?? recording.uuid ?? payload.recordingId`,
   and if none is present fall back to a SHA-256 of
   `user.id + recording.createdAt + recording.title`, flagging the row so it is
   obvious we are guessing. **One test delivery settles this** — send it, and
   `api/pocket-hook.js` logs the top-level key names (never values) on first run.
2. **Personal vs organization webhook.** Org webhooks are managed over the API
   (`/organization/:orgId/webhooks`); personal ones are created in the Pocket app
   UI and that is where the signing secret is shown. Pocket Pro suggests a
   personal webhook — confirm which you have, because it changes the setup steps
   and nothing else.
3. **Unsigned legacy deliveries.** The docs warn that "older webhook rows without
   a secret may continue to send unsigned deliveries until you rotate or recreate
   the webhook." **We refuse unsigned deliveries outright** (§2). If yours is an
   old one, recreate it. An unauthenticated write path into the CRM is not
   something to leave open for compatibility.

---

## 1. The shape of it, r2

```
Pocket ──webhook──▶ api/pocket-hook.js ──service key──▶ pocket_recordings
                     verify sig, idempotent upsert         (the SOURCE, kept)
                                                                  │
                                        dashboard "Your day" · recordings needing work
                                                                  │
                                            ┌─────────────────────┴────────────┐
                                            ▼                                  ▼
                                    Deep extract (one press)            New output (manual)
                                    proposes N outputs                  blank editor beside
                                            │                           the transcript
                                            ▼                                  │
                                   review · edit · confirm each ◀───────────────┘
                                            │
        ┌───────────────┬───────────────────┼──────────────────┬────────────────┐
        ▼               ▼                   ▼                  ▼                ▼
  client note      relationship        internal note     Sunday CEO       Playbook draft
  meeting_logs     meeting_logs        meeting_logs      meeting_logs     kb_notes
  kind:'client'    kind:'client'       kind:'note'       kind:'internal'  status:'draft'
  leadId=<lead>    leadId=<rel>
        └───────────────┴───────────────────┴──────────────────┴────────────────┘
                            every output carries sourcePocketId
```

One recording, any number of outputs, including several of the same type — two
clients discussed on one call are two client notes. The recording never leaves;
you can come back next week and make a fifth output from it.

## 2. `api/pocket-hook.js`

### Raw body vs `_guard.js` — the one real conflict

The signature is over raw bytes, but Vercel parses `req.body` by default and
`guard()` reads `req.body` for its size check. So:

```js
export const config = { api: { bodyParser: false } };   // we need the bytes
```

then read the stream ourselves with a hard byte ceiling **while reading**, so an
enormous body cannot exhaust memory before any check runs. Then set
`req.body = raw` (the string) before calling `guard()`: its size check already
has a `typeof req.body === 'string'` branch, so it measures the true payload and
nothing in `_guard.js` changes.

### Order of checks, and why it is not the usual order

1. Read raw, capped.
2. **Verify the signature.**
3. `guard()` — size and rate.
4. Parse and store.

Signature before guard is deliberate. `guard()` costs two Supabase round trips;
signature verification is pure CPU and rejects a forged request in microseconds.
Spending database calls on forged traffic is how a rate limiter becomes the
denial of service. The guard is still there and still required — it is the layer
that bounds a *validly signed* flood, e.g. if the secret ever leaks.

### Verification

```
expected = HMAC-SHA256(POCKET_WEBHOOK_SECRET, `${timestamp}.${raw}`)
crypto.timingSafeEqual(expected, provided)      // never ===
```

Plus: reject if `X-HeyPocket-Timestamp` is more than **5 minutes** old or more
than 1 minute in the future. Retries back off 1s–30s, so a legitimate retry is
never near that window. Without a timestamp check a captured delivery can be
replayed forever.

**If `POCKET_WEBHOOK_SECRET` is unset, the endpoint returns 503 and stores
nothing.** Fail closed. A missing env var must not silently turn this into an
open write endpoint — that is the whole reason the secret exists.

### Guard settings

`{ name:'pocket', perIp: 240, windowMin: 10, perDay: 3000, maxChars: 400000, requireAuth: false }`

- `requireAuth:false` — Pocket is the caller. The signature is the authentication.
- `perIp` is high because every delivery comes from the same handful of Pocket IPs;
  a per-IP limit here is a burst check, not an identity check.
- **A 429 costs you a recording.** Pocket retries 3 times and then gives up, so
  the daily cap is not a soft limit here, it is data loss. Set it far above real
  volume and treat hitting it as an incident, not as tuning.

### Status codes, chosen for how Pocket reacts to them

| Situation | Code | Why |
|---|---|---|
| Stored, or already stored | `200` | Idempotent. A duplicate is a success. |
| Event we don't handle | `200` | Never retry something we will always ignore. |
| Bad/missing signature | `401` | Retries, then drops. Correct — we want it gone. |
| Secret not configured | `503` | Retries. Gives you a window to set the env var. |
| Database write failed | `500` | Retries. This is the one case retrying helps. |

### Idempotency

Primary key is the Pocket recording id. `on conflict do update`, and the update
**only fills in what is missing or newer** — `transcription.completed` and
`summary.completed` are two deliveries about the same recording, and the second
must not wipe what the first brought. A row already marked `routed` is left
alone entirely: a redelivery must never resurrect something already filed.

### Oversized transcripts

A very long recording can exceed any cap. Refusing means 3 retries and then
silent loss. So: **store it, truncate the transcript at the cap, and set
`truncated:true`**, which the card shows as "transcript truncated — pull the
full one from Pocket". Losing the end of a transcript loudly beats losing the
recording quietly.

### Events we act on

- `transcription.completed`, `summary.completed`, `summary.regenerated`,
  `summary.updated`, `action_items.regenerated`, `action_items.updated`,
  `transcript.edited`, `speakers.labeled`, `recording.created`,
  `recording.merged`, `translation.completed` → upsert.
- `recording.deleted` → if still in the inbox, drop it. **If already routed, do
  nothing**: it is your meeting log now, and Pocket deleting their copy is not a
  reason to delete yours.

You press record deliberately, so there is no filtering on the way in. Every
delivery that verifies gets stored.

---

## 3. Selection — the question you asked

**The extraction proposes segments and you approve them. You do not pick text
spans, and nothing stores a span.** What you approve is *drafted prose you can
edit*, not a slice of transcript.

### Why not spans

1. **A span of transcript IS transcript.** You said it yourself: what saves is
   the text you wrote and edited, never a raw transcript. A span covering the
   process discussion also carries whatever was said in the middle of it — a
   stray sentence about what someone is paid does not announce itself at a
   boundary. Prose that a human rewrote and read is a different kind of object
   from a slice of a recording, and only one of them is safe to build on.
2. **Spans rot.** Pocket sends `transcript.edited` when you fix a word or a
   speaker label. A stored character offset into a mutable transcript is a stale
   pointer the first time that fires, and it fails silently — it still resolves,
   just to the wrong words.
3. **A span cannot be reworded**, and the entire value of a client note is that
   it is written for whoever reads it later rather than transcribed from a
   Sunday morning.

### Why proposed segments, and what that costs

This is already the house pattern, twice over. The Meeting Log has Claude
propose action items and you approve which become tasks. The Playbook has
`api/kb-draft.js` draft prose into a **textarea**, and what saves is what you
leave in the box. Both are "the model proposes, a human edits, the edited text
persists". Segmenting a recording is the same move at a larger grain.

**One press of Deep extract, one spend**, and it returns every proposed output
at once. Creating them afterwards is free.

### What a proposal looks like

Each proposed output carries:

- **destination** — client / relationship / internal / Sunday meeting / Playbook
- **target** — the lead or relationship it heard, matched per segment (§7)
- **title**
- **drafted prose**, written in the register of its destination — a Playbook
  proposal is second-person process, a client note is a read on that person
- **locator** — approximate `mm:ss–mm:ss` and the opening quote
- **confidence**

The locator exists so you can trust a proposal without re-reading forty minutes:
click it and the transcript scrolls to that point. **It is shown, not stored as
the content.** When an output is created, a copy of the locator is kept on it as
provenance — "made from ≈12:30–22:10 of Sunday 17 Aug" — which is a historical
fact about how it was made, not a live pointer, so it cannot go stale.

### On each proposal you can

**Edit the text** · **change the destination** · **change the target** ·
**merge two proposals** (two segments about the same client become one output) ·
**skip it**. Then create the ones you want, individually or all at once.

### And there is always a manual path

**New output** gives you a blank editor with the full transcript beside it, no
AI involved. Two reasons it is not optional: the extraction will miss things,
and you should never have to spend tokens to get one note out of a recording.

### Two AI operations, not one, and why the second is scoped

1. **Segment** (`api/pocket-segment.js`, new) — one press, the whole transcript,
   returns the proposals above. New endpoint rather than a `kind` on
   `api/meeting-log.js` for the same reason `api/kb-draft.js` is separate: that
   file promises every kind returns the same output schema, and a list of
   proposals is not that schema.
2. **The seven-field extraction** runs per client/relationship output, **when
   you create it**, through the existing `api/meeting-log.js` with `kind:'client'`
   — unchanged, same schema, same consumers, same dollar ceiling.

Running it on the **segment** rather than the whole recording is better on both
axes: the seven fields end up about that client instead of about a Sunday
morning, and the call that produces them never contains the parts of the
recording that were about something else.

Outputs you skip cost nothing. An internal note, a Sunday meeting or a Playbook
draft never triggers step 2 at all — their content is prose you approved.

## 4. `pocket_recordings` — the source, not a queue

Renamed from `pocket_inbox` in r1, because it is no longer something that
empties. The **inbox is a view** of the rows still needing work; the table is a
permanent store of every recording. Calling it an inbox would have led straight
back to deleting rows once they were "done", which is the thing r2 exists to
stop.

Still a separate table rather than a `meeting_logs` row with a status. The r1
reasoning holds and is stronger now: an unrouted recording would appear in the
Meeting Log screen, in `openLoops`, in the Monday Huddle, and on a lead through
`meetingLogsOf` the moment it had a `leadId` — each needing "…and not still in
the inbox" bolted on, which is exactly the condition that gets forgotten. And a
recording is now a genuinely different object from its outputs: it is the raw
material, and they are the work.

```sql
create table if not exists pocket_recordings (
  id          text primary key,        -- Pocket's recording id: the idempotency key
  data        jsonb not null default '{}'::jsonb,
  status      text  not null default 'open',   -- open | done | dismissed
  received_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table pocket_recordings drop constraint if exists pocket_recordings_status_chk;
alter table pocket_recordings add  constraint pocket_recordings_status_chk
  check (status in ('open','done','dismissed'));
create index if not exists pocket_recordings_status_idx
  on pocket_recordings (status, received_at desc);
```

`data` holds `title`, `description`, `createdAt`, `duration`, `language`,
`summary`, `actionItems[]`, `transcript` (text plus the speaker segments),
`truncated`, `pocketUser`, `events[]`, and `proposals[]` — the last Deep extract
result, cached so reopening the screen does not re-spend.

**The transcript stays here forever, and only here.** It is the source; you must
be able to make a new output from it next month. No output ever copies it (§5).

RLS, character for character the `meeting_logs_owner` policy:

```sql
alter table pocket_recordings enable row level security;
create policy pocket_recordings_owner on pocket_recordings for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));
```

The webhook writes with `SUPABASE_SERVICE_KEY`, which bypasses RLS by design —
the same key `_guard.js` already uses. **A rep gets zero rows.**

### status is only what a human decided

`open` → `done` (you are finished with it) or `dismissed` (nothing came of it).
That is all it stores. Whether a recording *has outputs* is **not** a status,
because it is derivable — see §5 — and storing it would be a second copy of a
fact that drifts the moment an output is deleted.

**Deleting a recording** removes the row and its transcript. Outputs survive:
they are independent prose with a `sourcePocketId` that no longer resolves, and
the UI says "source recording deleted" rather than breaking. That is the correct
behaviour for an output that was always meant to stand on its own.

---

## 5. What came out of it — derived, never stored

The recording tracks its outputs by **not** tracking them.

Every output carries `sourcePocketId` (and `sourceSegment` for provenance). The
card's "What came out of this" list is computed by scanning the `meeting_logs`
and `kb_notes` already loaded in the owner's browser for that id — one `useMemo`
building a `Map<pocketId, output[]>`, then a lookup per card.

This is `meetingLogsOf(lead, logs)` again, and ENGINEERING §2 again: a stored
`outputs[]` array on the recording is a second copy of a fact. Delete a client
note and the array is wrong, with nothing to notice it. Derive it and the list
is right by construction — delete the note and it leaves the list, edit its
title and the list updates for free.

The back-reference is the durable half because it lives *with* the thing it
describes and cannot be orphaned.

### Outputs never hold the transcript

A `kind:'client'` meeting log created from a recording gets `transcript:''`, its
seven-field extraction, and `sourcePocketId`. The transcript stays on the
recording.

That is a real improvement to the existing guarantee, not just deduplication: a
lead-attached meeting log created this way **has never contained a raw
transcript at all**. `MeetingLog.jsx` must therefore render an empty transcript
gracefully — "Source: Pocket recording · Sunday 17 Aug", linking back — instead
of an empty box that reads like data loss.

---

## 6. The five outputs

| Output | Table | Shape |
|---|---|---|
| Client note | `meeting_logs` | `kind:'client'`, `leadId` = the lead |
| Relationship note | `meeting_logs` | `kind:'client'`, `leadId` = an `isRelationship` lead |
| Internal business note | `meeting_logs` | `kind:'note'` — new |
| Sunday CEO meeting | `meeting_logs` | `kind:'internal'` |
| Playbook draft | `kb_notes` | `status:'draft'`, unpublished |

`kind:'note'` is the only new storage shape, and the r1 argument for it stands
unchanged — it is reproduced here because it is the part you asked about:

**Internal business notes are a `meeting_logs` row, not a Playbook draft.**

1. **`kb_notes` has a transcript-shaped hole in it on purpose.** Neither
   Playbook table has a transcript column, and that absence is the load-bearing
   part of the guarantee already shipped and verified. Adding one would retract
   it. (r2 note: outputs never carry transcripts at all now, which makes this
   easier to hold, not less important.)
2. **The Playbook is a publication queue, not a capture bucket.** Everything in
   `kb_notes` is a candidate for publishing to reps. Route every recording there
   and the draft list stops meaning "things I intend to publish".
3. **A fourth near-identical table is the ENGINEERING §5 failure** — the
   `onboarding`/`delivery` parallel-systems mistake.

The bridge stays one-way and is now first-class: **a Playbook draft is one of
the five outputs**, so a recording promotes into the Playbook directly, and it
still arrives as an unpublished draft that must go through the preview and the
publish button before any rep sees a word.

### The regression to catch

`internalLogs()` is `filter(l => l.kind !== 'client')`. Add `'note'` and every
business note silently becomes an internal meeting — Monday Huddle, `openLoops`,
`meetingDigest`. It must become `filter(l => l.kind === 'internal')`, with the
test that would have caught it. `'note'` also has to be added to `MEETING_KINDS`,
since `normLog` defaults unknown kinds to `'internal'` — right for old rows,
wrong for this one.

---

## 7. Matching, per segment

`src/lib/pocketmatch.js`, pure, in the browser. The r1 reasoning is unchanged:
the owner's session already holds every lead, so matching is free, needs no
service-key read, and is **derived not stored** — rename a lead a week later and
the card still matches, where a match computed at delivery would be stale with
no way to tell.

What changes in r2: **matching runs per proposed segment, not per recording.**
A whole-transcript match on a call that mentions three clients is useless — it
returns all three and can pre-select none of them. Run it on the segment and
each proposal gets its own answer.

Signals, strongest first: email · phone (last 10 digits, formatting varies) ·
full name (word-boundary) · company · first name alone (only when nothing
stronger matched). `isRelationship` decides whether it reads as a lead or a
relationship.

### Ambiguity is a returned shape

Two leads are named Mark Kaufmann, so the function returns a **list** and the
proposal card is driven by its shape:

- **one strong match** → target pre-selected and named.
- **more than one at the same strength** → **nothing pre-selected**. "Two people
  match 'Mark Kaufmann'", both offered, with whatever distinguishes them —
  company, email, last contact.
- **weak or none** → nothing pre-selected, full picker.

Never break a tie by recency, alphabet, or record age. Pre-selection is the only
thing on that card carrying risk, so it is the only thing held to a strict
standard. You confirm every output regardless; matching changes the number of
clicks, never the destination.

---

## 8. The screens

### On the dashboard — "Your day"

A group in the existing `today` section, above **Tagged you**, because it is the
only thing on that card that is a queue rather than a reminder. It lists
recordings with `status='open'`, newest first, with the title, duration, and
either "nothing made from this yet" or "2 outputs · Alvarez Realty, Playbook
draft".

Two traps in that code:

1. **`if(!total) return` renders "Nothing waiting on you."** `total` is
   `tags + due + mtgs + dates`. Add the open-recording count, or a dashboard
   with five unworked recordings will say the day is clear.
2. **`dashHidden`.** Anyone who has hidden "Your day" never sees it.
   `dashOrderOf` repairs *order* for new sections and says nothing about hidden
   ones. If `today` is hidden and a recording is open, unhide it once — the same
   reasoning as `dashPinFirst`, applied to a queue with no other home.

### The recording screen

Opened from the card. Left: Pocket's summary, Pocket's action items, and the
transcript. Right: what came out of it (derived), and the actions.

- **Deep extract** — one press, proposes outputs. Cached on the row, so
  reopening does not re-spend. "Re-run" is a separate, deliberate press.
- **New output** — manual, no AI, transcript beside the editor.
- **Done** / **Dismiss** / **Delete recording**.

Proposals render as cards: destination selector, target, title, editable prose,
locator, and Create / Skip / Merge. Nothing is written until Create.

Pocket's own summary and action items are shown as they arrive and cost nothing
— they ran before the webhook fired.

---

## 9. What changes who can see what

Nothing existing changes. No policy, table or column is altered.

- **`pocket_recordings` is new and owner-only**, on the `meeting_logs_owner`
  policy. Reps get zero rows. Raw transcripts are at least as sensitive as
  meeting logs.
- **`meeting_logs` gains `kind:'note'`** — owner-only like every other row there.
- **A client note created from a recording is still owner-only.** Nothing about
  this feature crosses to a rep. The only path from a recording to something a
  rep can read is the two that already exist and are unchanged: the hand-written
  **Add to lead** line on a client log, and **publishing** a Playbook draft
  through its preview. Both are still a button, and both still publish only text
  a human wrote.
- The webhook is the only new caller of the service key, and it can write exactly
  one table.
- `ROLES.md` gains a paragraph saying the above in plain English. **No
  rep-visible behaviour changes at all.**

---

## 10. Build order

1. `POCKET-MIGRATION.sql` + `VERIFY-RLS.md` §7 proving a rep gets zero rows from
   `pocket_recordings`. Prove the boundary before building a screen on it.
2. `api/pocket-hook.js` + `tests/pockethook.mjs` — signature, replay window,
   idempotency, unhandled events, oversize truncation. Pure Node, no DOM: run the
   handler against fabricated requests and assert status codes and writes.
3. **One real delivery** once your API key exists, to settle the recording-id
   question in §0 before any UI sits on a guessed key. The fallback chain stays
   in either way.
4. `src/lib/pocketmatch.js` + tests, including the two Mark Kaufmanns by name.
5. `meeting_logs` `kind:'note'`: `MEETING_KINDS`, `normLog`, the `internalLogs`
   fix, and the test that a note stays out of the Huddle and `openLoops`.
6. `api/pocket-segment.js` + tests.
7. The recording screen, proposals, outputs, and the derived output index.
8. The "Your day" group, including the `total` fix.
9. `ROLES.md`, `ENGINEERING.md`, `DEPLOY.md` (two new env vars).

### Tests that must exist

Assert on **what reaches the database**, per ENGINEERING §1:

- Forged signature → 401, nothing stored.
- Valid signature, 10-minute-old timestamp → nothing stored.
- No `POCKET_WEBHOOK_SECRET` → 503, nothing stored.
- The same delivery twice → **one** row.
- `transcription.completed` then `summary.completed` → one row with both; the
  second does not blank what the first stored.
- `recording.deleted` removes an `open` row and leaves one with outputs alone.
- Two Mark Kaufmanns → **no pre-selection**, both offered.
- One strong match → pre-selected, and correct.
- **One recording, three outputs**: creating them writes exactly three rows —
  one `kind:'client'` with the right `leadId`, one `kind:'note'`, one `kb_notes`
  draft — and the recording row is not rewritten by any of them.
- **No output contains the transcript.** Seed a sentinel in it and assert it
  appears in zero writes to `meeting_logs` or `kb_notes`.
- The outputs list is **derived**: delete an output and it leaves the card
  without the recording row being written.
- **Deep extract does not run unless pressed**, and creating an internal note, a
  Sunday meeting or a Playbook draft calls `api/meeting-log.js` zero times —
  asserted on the outbound fetch, like `tests/kb.mjs`.
- A `kind:'note'` log appears in neither the Huddle nor `openLoops`.

---

## 11. Env vars and setup

```
POCKET_WEBHOOK_SECRET   from Pocket when the webhook is created
POCKET_API_KEY          pk_xxx — only needed for §12
```

`SUPABASE_SERVICE_KEY` is already set for `_guard.js`. Point the webhook at
`https://<your-vercel-domain>/api/pocket-hook`.

## 12. Deliberately not in scope

- **Backfilling old recordings** via `GET /public/recordings`. Would bury the
  inbox with months of history on day one. Ship the live path first.
- **Audio.** `Get Audio Download URL` exists; we store text only.
- **Semantic search** (`POST /search`). Matching is plain text and local, as you
  asked. Pocket's search is a different feature for a different screen and should
  not quietly become the matcher.
- **Auto-creating outputs.** Even a 100% confident proposal writes nothing
  without a click.
