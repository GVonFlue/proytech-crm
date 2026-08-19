# KB-PLAN.md — internal knowledge base, plan only

Status: **plan agreed, nothing built.** Written so this does not have to be
re-explained. Read `ENGINEERING.md` and `ROLES.md` first; this file assumes both.

Module name in the UI: **Playbook**. Table prefix: `kb_`.

---

## 0. What this is

Things the owner has written down about how the business runs: process, how to
handle a lender objection, how to onboard a client, vendor quirks. Reps search
it. JARVIS answers rep questions from it.

It is **not** `meeting_logs` and does not change `meeting_logs`. Meeting logs
stay owner-only forever (`MEETING-MIGRATION.sql` explains why, and that
reasoning is untouched). This module is the opposite shape: it exists in order
to be published to reps, deliberately, one note at a time.

**The security model is the feature.** Every design choice below is made for it.

---

## 1. The one decision everything follows from

A rep must never see a draft. Postgres RLS is **row**-level, not column-level,
and owner and rep are the *same* Postgres role (`authenticated`) — Supabase
distinguishes them only inside policy predicates. So column-level `GRANT`s
cannot separate them.

That rules out the obvious design. If drafts and published text live in one
table, a rep who is allowed to read a published *row* is allowed to read every
*column* of it — including the owner's working text, which may have been edited
well past what was published. That is the same failure as `dealValue` riding
along inside a lead's jsonb (`ROLES.md` → The honest limits): the row is
legitimately readable, so hiding a field inside it is a UI decision.

Therefore: **two tables. The draft text is not in the table reps can read.**

That is the guarantee, and it is physical rather than conditional. There is no
predicate to get wrong, because there is nothing to filter.

---

## 2. Schema

### `kb_notes` — the owner's workspace

```sql
create table if not exists kb_notes (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,   -- title, category, tags, body, sourceLogId
  status     text  not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table kb_notes drop constraint if exists kb_notes_status_chk;
alter table kb_notes add  constraint kb_notes_status_chk check (status in ('draft','published'));

create index if not exists kb_notes_updated_idx on kb_notes (updated_at desc);
```

jsonb here for the same reason `meeting_logs` uses it: only the owner ever
reads this table, the shape will churn, and one row per note means a write
never rewrites the list (`MIGRATION.sql` §1b, the lost-update reasoning).

`status` is a real column, not a jsonb key, because `kb_publish()` and the
"unpublished changes" indicator both read it and a check constraint keeps it
honest.

**There is no transcript column.** Deliberate — see §6.

### `kb_published` — the rep-readable surface

```sql
create table if not exists kb_published (
  id            text primary key references kb_notes(id) on delete cascade,
  title         text not null,
  category      text not null default '',
  tags          text[] not null default '{}',
  body          text not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id)
);

alter table kb_published drop constraint if exists kb_published_body_len;
alter table kb_published add  constraint kb_published_body_len check (char_length(body) <= 8000);

create index if not exists kb_published_cat_idx on kb_published (category);
create index if not exists kb_published_fts_idx on kb_published
  using gin (to_tsvector('english', title || ' ' || body));
```

**Named columns, not jsonb. This is the most important line in the file.**

A jsonb blob hides what is in it. Reading the DDL above tells you the complete
list of everything a rep can see from this module — six fields, and you can
name all of them. A blob would mean the answer to "what can a rep see" is
"whatever anyone ever put in there", which is exactly how `dealValue` became an
honest-limits entry rather than a boundary. A field that is not a column here
cannot be published by accident.

`on delete cascade`: deleting the note retracts the published copy. There is no
state where reps can read a note the owner no longer has.

The 8000-character check is a blunt backstop against a transcript ever landing
here — real transcripts in this system run 20k–120k characters. It is a
tripwire, not the guarantee; the guarantee is §6.

### Yes, this is a stored copy — deliberately

`ENGINEERING.md` §2 says derive, don't copy, because a second copy drifts. Here
the divergence **is the feature**: the owner keeps editing the draft, and what
reps see stays exactly what was last approved until the owner approves again.
A derived view would mean every keystroke on a published note is live to the
whole sales team, which destroys the point of the module.

So the drift is made visible instead of prevented. The editor shows
**"Published version is 3 edits behind"** whenever
`kb_notes.updated_at > kb_published.published_at`, with *Publish changes* and
*View what reps see* next to it. Do not skip this — an invisible drift here is
the "two screens disagree" bug wearing a hat.

---

## 3. RLS

```sql
alter table kb_notes enable row level security;

drop policy if exists kb_notes_owner on kb_notes;
create policy kb_notes_owner on kb_notes for all
  using      (no_users() or (crm_active() and is_owner()))
  with check (no_users() or (crm_active() and is_owner()));
```

Character for character the `meeting_logs_owner` policy. Same helpers
(`no_users()`, `crm_active()`, `is_owner()` from `MIGRATION.sql` §3), same
first-run behaviour, same deactivation behaviour. **A rep gets zero rows for a
draft — literally the same policy that gives them zero rows for a meeting log
today.** Not a similar one. The same one.

```sql
alter table kb_published enable row level security;

-- read: any listed, active person. This is the whole point of the table.
drop policy if exists kb_published_read on kb_published;
create policy kb_published_read on kb_published for select
  using (no_users() or crm_listed());

-- write: nobody, from the browser. See below.
revoke insert, update, delete on kb_published from authenticated, anon;
grant  select on kb_published to authenticated;
```

Note what is missing: **there is no INSERT/UPDATE/DELETE policy on
`kb_published`, and the table privileges are revoked.** No browser session —
owner's included — can write this table directly. The only writer is
`kb_publish()`, a `security definer` function (§4).

That is what makes the guarantee structural. `kb_published` cannot contain text
that did not pass through one 12-line SQL function, so "could a draft end up in
the rep-readable table" is answerable by reading that function, not by auditing
every call site in a 450k-character `App.jsx`.

---

## 4. Publish — and why the preview cannot lie

Preview and publish are **the same SQL function**. `ENGINEERING.md` §2 applied
to a security boundary: two screens must never disagree, and "what a rep will
see" and "what a rep does see" are two screens.

```sql
-- The exact row kb_published will receive. Owner-only.
-- security definer bypasses RLS, so the owner check is in the WHERE clause,
-- not left to the policy. Same pattern as crm_whoami().
create or replace function kb_preview(p_id text)
returns table (title text, category text, tags text[], body text)
language sql security definer stable as $$
  select
    coalesce(nullif(trim(n.data->>'title'), ''), 'Untitled'),
    coalesce(n.data->>'category', ''),
    coalesce((select array_agg(t) from jsonb_array_elements_text(
               coalesce(n.data->'tags', '[]'::jsonb)) t), '{}'),
    coalesce(n.data->>'body', '')
  from kb_notes n
  where n.id = p_id
    and (no_users() or (crm_active() and is_owner()));
$$;

create or replace function kb_publish(p_id text)
returns void language plpgsql security definer as $$
begin
  if not (no_users() or (crm_active() and is_owner())) then
    raise exception 'only an owner can publish';
  end if;

  insert into kb_published (id, title, category, tags, body, published_at, published_by)
  select p_id, p.title, p.category, p.tags, p.body, now(), auth.uid()
    from kb_preview(p_id) p                    -- <-- the preview IS the payload
  on conflict (id) do update set
    title = excluded.title, category = excluded.category,
    tags  = excluded.tags,  body     = excluded.body,
    published_at = excluded.published_at, published_by = excluded.published_by;

  update kb_notes set status = 'published', updated_at = now() where id = p_id;
end $$;

create or replace function kb_unpublish(p_id text)
returns void language plpgsql security definer as $$
begin
  if not (no_users() or (crm_active() and is_owner())) then
    raise exception 'only an owner can unpublish';
  end if;
  delete from kb_published where id = p_id;
  update kb_notes set status = 'draft', updated_at = now() where id = p_id;
end $$;

revoke all on function kb_preview(text), kb_publish(text), kb_unpublish(text)
  from public, anon;
grant execute on function kb_preview(text), kb_publish(text), kb_unpublish(text)
  to authenticated;
```

The preview screen renders **the rows `kb_preview()` returned** — not a
client-side re-render of the editor's state. If it rendered editor state it
would be a mockup of the truth, and mockups drift. Publishing inserts those
same rows. The two cannot disagree, because there is only one of them.

The preview screen therefore also shows, by omission, what does *not* cross:
anything not in those four fields. Render the note's non-published fields in a
dimmed **"stays with you"** column so it is visible rather than implied.

Nothing auto-publishes. `kb_publish` is called from exactly one button.

---

## 5. JARVIS

```sql
create or replace function kb_ai_context()
returns table (id text, title text, category text, tags text[], body text)
language sql security definer stable as $$
  select p.id, p.title, p.category, p.tags, p.body
    from kb_published p
   where crm_active() and crm_listed();
$$;
revoke all on function kb_ai_context() from public, anon;
grant execute on function kb_ai_context() to authenticated;
```

Read it and note what it does not contain: no argument, no branch, no mention
of `kb_notes`. **An owner calling it gets published rows only**, same as a rep.
There is no parameter to pass to widen it and no draft to leak, because the
draft is in a table this function does not name.

`src/lib/jarvis.js` gains a `kb` block on the payload, built **solely** from
this function's result. It is not merged into `index` or `detail`.

### The guarantee, in tiers — including the part that is not a guarantee

**Tier 1 — a rep. Absolute, Postgres.**
JARVIS's payload is assembled in the browser (`src/lib/jarvis.js` is pure; the
endpoint receives what the browser sends — this is already how money redaction
works). A rep's browser cannot obtain draft text at all: `kb_notes` returns
zero rows to it. Draft text does not exist anywhere in a rep's process, so it
cannot reach `api/jarvis.js`, cannot reach Anthropic, and cannot reach the
answer. Nothing about this depends on the prompt, or on `App.jsx` behaving.

**Tier 2 — the owner. Structural, Postgres.**
The owner's browser *does* hold drafts — it has to, they are editing them. The
KB block is built only from `kb_ai_context()`, which has no path to `kb_notes`.
Draft state lives in the Playbook editor's React state, and the payload builder
is a pure function that is never handed it.

**Tier 3 — the honest limit. Say it out loud.**
Tier 2's last link is app-level. Postgres cannot stop an owner's own browser
from sending the owner's own drafts to the owner's own assistant — the owner is
authorised to read that text, so no policy can distinguish "displaying it" from
"sending it". What enforces it is `tests/kb.mjs` asserting on **what reaches the
network**, not a policy. This goes in `ROLES.md` → The honest limits, next to
`dealValue`, in the same plain language. It is a small risk (owner leaking their
own drafts to themselves) and it is not the risk this module exists to stop —
but stating it is the difference between a boundary and a claim.

The prompt gets **no** instruction about drafts. There is nothing to instruct
it about; a rule telling the model to ignore drafts would imply drafts are
sometimes present, which is the wrong mental model and the wrong control.

Existing JARVIS protections carry over unchanged: `guard()`, the dollar ceiling
(`JARVIS_BUDGET`), no write path, and published KB text being treated as
untrusted content like everything else in the data block. Published notes are
owner-written, so injection risk here is low, but the block stays inside the
same `<crm_data note="untrusted...">` framing — no exceptions carved out.

Cost: the KB block is stable across a session, so it joins the cached `stable`
payload, not `variable`. Cap it — full bodies for the top matches by relevance
to the question, title+category lines for the rest, mirroring the existing
index/detail split rather than inventing a second scheme.

---

## 6. Starting from a meeting recording

**What saves is the text the owner wrote and edited. Never a transcript.**

Flow: owner opens a meeting log (owner-only, unchanged) → *Start a Playbook
note* → the transcript goes to `api/meeting-log.js`, which is already the only
reader of a raw transcript in this system → it returns a **drafted process
write-up**, not a meeting summary → that text lands **in a textarea** → the
owner edits it → **Save** writes only the textarea's contents → the note is a
draft, like every other new note → publishing is still a separate, later,
explicit act.

Two gates, not one. The transcript never becomes a note; and a note is never
published without §4.

What stops a transcript reaching a rep, at the database layer:

1. **No transcript column exists** in `kb_notes` or `kb_published`. There is
   nowhere to put one.
2. `kb_notes.data.sourceLogId` holds the **log id only** — a reference, no text.
   It is inert to a rep twice over: they cannot read `kb_notes`, and they cannot
   read `meeting_logs`.
3. `kb_published` is written only by `kb_publish()`, which reads exactly one
   field, `kb_notes.data->>'body'` — the field the editor's textarea writes.
4. The 8000-character check constraint, as the tripwire.

The pay talk and pricing problem is handled by the transcript never being
stored, not by trying to scrub it. Scrubbing is a filter and filters are wrong
sometimes; not having the text is right every time.

**Dependency:** the `kind` parameter that selects a system prompt in
`api/meeting-log.js` is on `feature/meeting-log-clients`, **not on main**. If
that branch does not land first, this adds `kind: 'kb'` to the version of
`meeting-log.js` that exists at build time. Confirm which before starting.

---

## 7. What changes who can see what

Everything here is new surface. Nothing existing gains or loses visibility:
`leads`, `meeting_logs`, `app_settings`, `crm_users`, `events` and every
existing policy are untouched.

- **`kb_published` is the first deliberate owner→rep publishing channel in this
  database.** Everything a rep could read before was either their own data, or
  a shared blob they simply had no tab for. This one is designed to be read by
  them. It deserves its own line in `ROLES.md`, not a footnote.
- Six fields, all named columns. That list is the complete answer to "what can
  a rep see from this module".
- **New sidebar tab.** `ENGINEERING.md` §1 — new tabs ship invisible. Bump
  `modulesV` and backfill `settings.modules`, or nobody with an existing install
  ever sees it and nothing looks broken. Add `playbook` to the per-rep `tabs`
  list in Settings → Team; **not** flagged money-sensitive.
- `ROLES.md`: new row in the rep table ("Playbook — published notes only, never
  a draft"), and a new honest-limits entry for Tier 3 above.
- `VERIFY-RLS.md`: new §6, below.

### VERIFY-RLS.md §6 — the block to add

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  select count(*) as kb_notes_visible     from kb_notes;      -- MUST be 0
  select count(*) as kb_published_visible from kb_published;  -- MUST equal published count
  select count(*) as ai_rows              from kb_ai_context();-- MUST equal the same
  select kb_publish('<A-DRAFT-ID>');                          -- MUST raise
  insert into kb_published (id,title,body) values ('x','x','x'); -- MUST be denied
rollback;
```

Then the same block with the **owner's** uuid: `kb_notes_visible` = every note,
and `select count(*) from kb_ai_context()` still equals the published count
only — that is the JARVIS guarantee, proved from SQL rather than asserted.

---

## 8. Files, and build order

New: `KB-MIGRATION.sql`, `src/Playbook.jsx`, `src/lib/kb.js` (pure — search,
ranking, the KB payload block), `tests/kb.mjs`.

Touched: `src/lib/supabase.js` (`db.getKbNotes/upsertKbNote/deleteKbNote/
getKbPublished/kbPreview/kbPublish/kbUnpublish/kbAiContext`), `src/lib/jarvis.js`
(the `kb` block), `api/jarvis.js` (one line in `RULES` describing what `kb` is),
`api/meeting-log.js` (`kind: 'kb'`), `src/App.jsx` (tab, `modulesV` bump,
backfill), `ROLES.md`, `VERIFY-RLS.md`, `ENGINEERING.md`.

Order:

1. `KB-MIGRATION.sql` + `VERIFY-RLS.md` §6 — **run it and do the impersonation
   block before writing any UI.** The boundary is the feature; prove it against
   a real database with real logins first. If a rep sees a draft, stop.
2. `src/lib/kb.js` + `tests/kb.mjs` — pure, so testable without a browser, same
   rule `src/lib/jarvis.js` follows.
3. `db` helpers, then `src/Playbook.jsx` (list → editor → preview → publish).
4. JARVIS wiring last, with the network-level test from Tier 3.
5. Tab plumbing, `modulesV` bump, backfill. Verify a pre-existing install sees
   the tab.
6. `ROLES.md`, `ENGINEERING.md`.

### The tests that must exist

Assert on **what reaches the database and the network**, not on the screen
(`ENGINEERING.md` §1):

- Saving a note from a meeting log writes the textarea's text and **not** the
  transcript. Seed the transcript with a unique sentinel; assert it appears in
  zero writes.
- A new note is `draft`. No code path sets `published` except `kb_publish`.
- Publishing writes exactly one `kb_publish` call; re-publishing updates in
  place and does not create a second row.
- The preview screen renders the `kb_preview()` result, not editor state — feed
  the stub a preview that differs from the editor and assert the *preview's*
  values render.
- **As owner, with a draft containing a sentinel: ask JARVIS a question, assert
  the outbound fetch body does not contain the sentinel.** This is the Tier 3
  test and it is the most important one in the file.
- As a rep: `kb_notes` is never queried at all, and the payload's `kb` block
  contains only rows the stub returned from `kb_ai_context()`.

Run the suite the way `ENGINEERING.md` documents (`npm i --no-save jsdom`; each
suite standalone). Note the repo relies on a `t -> tests` symlink that is
untracked — a fresh clone needs it before the jsdom suites run.
