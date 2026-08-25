# API-AUDIT.md — which endpoints check who is calling

Every file in `api/`, audited for authentication. Written because
`api/google-status.js` shipped with none and returned the owner's email address
to anyone who asked, and one unguarded endpoint is rarely alone.

This is about **authentication** — does the endpoint establish that a real,
signed-in person is calling — and, where it differs, **authorisation**: owner
or rep. The second question turned out to be the more interesting one on two of
these; see *A session is not a constraint* below.

Audited 19 Aug 2026 against `main`. **Re-verified 20 Aug 2026 by reading all 18
route files rather than grepping them** — the first pass was done with a grep
and it got one wrong. What it got wrong, and why, is recorded under
`calendar-event.js`.

**Updated 23 Aug 2026** for the three Content Studio routes, which shipped in
PRs #47 and #49 and were absent from this document for both of them. They were
guarded the whole time and `tests/apiauth.mjs` passed the whole time — which is
exactly the problem worth naming: that test proves a route *has* a check, and
this document is where the repo says *what the check is and why*. A guarded
route missing from here is not a hole, but a table that silently stops covering
`api/` is how the next unguarded one goes unnoticed. Read, not grepped, for the
same reason as the 20 Aug pass. **21 route files.**

---

## The table

| endpoint | session? | notes |
|---|---|---|
| `conversation.js` | ✅ `guard({requireAuth})` | |
| `huddle.js` | ✅ `guard({requireAuth})` | |
| `import-leads.js` | ✅ `guard({requireAuth})` | |
| `jarvis.js` | ✅ `guard({requireAuth})` | + dollar ceiling |
| `kb-draft.js` | ✅ `guard({requireAuth})` | + dollar ceiling |
| `meeting-log.js` | ✅ `guard({requireAuth})` | |
| `parse-receipt.js` | ✅ `guard({requireAuth})` | |
| `pocket-segment.js` | ✅ `guard({requireAuth})` | + dollar ceiling |
| `rank-tasks.js` | ✅ `guard({requireAuth})` | |
| `sheet-read.js` | ✅ `guard({requireAuth})` | any signed-in user can read any sheet the owner's Google account can open — see below |
| `pocket-backfill.js` | ✅ `guard({requireAuth})` + `crm_whoami()` | owner-only, verified server-side. **The model the rest should copy.** |
| `content-slate.js` | ✅ `guard({requireOwner})` **or** `CRON_SECRET` | two doors, both closed to strangers — see below. + cents ceiling |
| `content-regenerate.js` | ✅ `guard({requireOwner})` | + cents ceiling |
| `content-usage.js` | ✅ `guard({requireOwner})` | read-only; spends nothing |
| `pocket-hook.js` | ✅ HMAC signature | no session by design — it is a webhook. Correct. |
| `google-status.js` | ✅ **fixed in this PR** | was open |
| `calendar-event.js` | ✅ **fixed in this PR** | signed-in + invite list capped |
| `notify.js` | ✅ **fixed in this PR** | signed-in + recipient allowlist |
| `google-disconnect.js` | ✅ **fixed in this PR** | `guard({requireOwner})` |
| `google-callback.js` | ❌ none — correctly | 🟠 no `state` parameter. **Still open.** |
| `google-auth.js` | ❌ none | 🟡 low. **Still open**, and paired with the above. |

`_guard.js`, `_google.js`, `_pocket.js`, `_spend.js`, `_content.js` are helpers
with no route.

---

## A session is not a constraint on the recipient

This is the thing the first pass of this document got structurally wrong. It
treated "has a session" as the finish line. For two of these endpoints it is
not even half of it.

`notify.js` and `calendar-event.js` both **send mail on the owner's behalf** —
one through Resend from a domain verified to `getproytech.com`, one as a Google
Calendar invite from the connected account — and both took the recipient list
straight off the request body.

Adding `guard({requireAuth})` to those two narrows *anyone on the internet can
aim this* to *any signed-in rep can aim this*. That is a real improvement in
attribution and rate-limiting and **it is not a fix for the relay**, because:

- the recipient's mail server cannot tell the two apart;
- the asset at risk is your sending domain's reputation, and it is burned
  identically either way;
- domain reputation is the one kind of damage on this list you cannot revert.

So both endpoints now decide the recipient **server-side**. The caller may
narrow the list; it cannot extend it. `tests/relay.mjs` runs every case as a
valid signed-in session — if it passes, an authenticated rep cannot aim either
endpoint at an address of their choosing.

---

## What each fix actually does

### 🔴 `notify.js` — was an open mail relay on a verified domain

Two changes, and the second is the real one.

> **Aug 2026 — a second event, `kind:'booked'`.** The auth posture is
> unchanged: same `guard({requireAuth:true})`, same `perDay` cap, same
> recipient allowlist, and the allowlist is still what decides where mail can
> go. What IS new is the **payload**: the booked email carries a lead's
> business name, contact name, phone, email and industry, where the conversion
> email carried only a rep name and a client name.
>
> That is more customer data leaving the system than any previous notification,
> so it is worth stating plainly: **the allowlist is the only thing standing
> between a lead's phone number and an arbitrary inbox.** It is built from
> `NOTIFY_TO` and `crm_users.email where role='owner'` — neither writable by a
> rep — and deliberately not from `settings.notifyEmails`, which any listed
> user can write. That reasoning was already load-bearing and is now carrying
> more.
>
> A rep can trigger this route (booking is a rep's job), and a rep chooses the
> lead. He cannot choose the recipient.

1. `guard({requireAuth:true})`, `perDay:300` — the daily cap is now a hard
   ceiling on how much mail can leave that domain in a day.
2. **The recipient allowlist.** `to` still narrows the list; the list itself is
   built from two sources a rep cannot write:
   - `NOTIFY_TO` — a Vercel env var, owner-only by construction;
   - `crm_users.email` where `role='owner'` and `active` — `crm_users` is
     owner-managed (`MIGRATION.sql`, `users_manage → is_owner()`).

   **Not** from `settings.notifyEmails`, which is what the app sends and the
   obvious choice. `app_settings` is writable by *any listed user*
   (`settings_write → crm_listed()`), so an allowlist read from there checks a
   value the attacker controls. It is a claim, not a check — the same distinction
   `pocket-backfill.js` makes about roles in a request body.

   An off-list address is dropped and logged, not fatal: one stale entry in
   settings must not stop the owners being told. If *nothing* survives, nothing
   is sent. An install with neither `NOTIFY_TO` nor an owner email sends
   nowhere rather than anywhere.

3. The `link` is pinned to `APP_URL`'s origin rather than to `^https?://`. The
   button says "Open the CRM"; a link that goes anywhere else was never correct,
   whoever sent it.

Note the deliberate asymmetry: a **delivery** failure is soft (`{ok:false}`,
the app carries on, the in-app queue is the real record). An **allowlist**
failure is hard. A send with no provable recipient does not go out.

### 🔴 `calendar-event.js` — was unauthenticated calendar write/delete + invite spam

Now `guard({requireAuth:true})` — **signed-in, not owner-only**. Reps book
meetings; that is the feature, and deleting is signed-in for the same reason (a
rep who books a meeting has to be able to cancel it).

On the invite list, three things narrow it, and it is worth being honest that
they narrow rather than close:

1. `MAX_ATTENDEES = 5`, refused rather than truncated. The booking screen sends
   **at most one** address — the lead's email, or one typed in its place
   (`src/App.jsx`, `inviteEmail`). The cap sits above that so a second guest
   needs no server change, and far below anything worth spamming.
2. `sendUpdates=all` **only when the event actually has attendees**, `none`
   otherwise. Asking Google to mail invitations for a guest list that does not
   exist was always wrong; it just cost nothing until it did.
3. Addresses are validated, lowercased and deduped before they reach Google.

**What is not closed:** a signed-in rep can still invite one arbitrary address
per booking, and loop. What bounds that is `perIp` and `perDay:400` — a real
ceiling on invites per day rather than a claim the hole is gone — plus the fact
that it is now a named session doing it rather than the internet. Attributable
and rate-capped is the right standard for an insider action. Unauthenticated
and unlimited was not.

> **The grep that got this wrong.** The first pass counted this endpoint as
> authenticated because it matched `Authorization: 'Bearer ' + token`. That is
> the *Google* token this endpoint sends **outbound**, not a check on the
> caller. A grep for the word "authorization" cannot tell an inbound check from
> an outbound credential, and on this file the outbound one is the giveaway
> that the endpoint has something worth stealing. Reading it corrected it — and
> is why the whole table was re-read rather than re-grepped.

### 🟠 `google-disconnect.js` — was a one-line denial of service

Now `guard({requireOwner:true})`, the strongest check in the app, on eight
lines of code. There is **one** Google connection per install (`ENGINEERING §6`
— not multi-tenant), so severing it is not a per-user action: it stops every rep
booking and every Sheets read at once, until someone with access to the Google
account walks the OAuth flow again. Merely signed-in would still let any rep
switch the feature off for the whole team.

`requireOwner` is new on `guard()`. It asks Postgres via `crm_whoami()` using
the **caller's own** JWT — a `security definer` function that derives the role
from `auth.uid()`, so a caller cannot assert their own role. It fails **closed**,
unlike the rate limiter, which fails open on purpose. `isOwner()` moved into
`_guard.js` and `pocket-backfill.js` now imports it, so there is one
implementation of this question rather than two.

### `google-status.js` — was returning the owner's email to anyone

Now `POST` behind `guard({requireAuth:true})`. Any signed-in user may call it,
owner or rep — a rep needs to know whose calendar a booking lands on, and the
booking screen says so out loud.

---

## The Content Studio routes

Added 23 Aug 2026. All three are `requireOwner`, which is stricter than most of
the table above, and the reason is ROLES.md rather than caution:
`content_brand_context` holds pricing, offers and positioning, and
`content_usage` is the monthly spend of the business. Both are company money by
ROLES.md's definition, and a rep sees none of it. The Studio tab is also gated
on `VITE_CONTENT_STUDIO` at build time and refused to a rep in `canOpen`, so the
screen and the routes agree — but the routes are the enforcement, and they would
refuse a rep on an install where the flag was on.

### `content-slate.js` — two doors, and neither is ajar

This is the only route in `api/` with **two** ways in, so it gets the most
words:

1. **The owner**, pressing *Generate next week* or *Generate custom* — a POST
   carrying a Supabase JWT, checked by `guard({requireOwner:true})`, which asks
   Postgres through `crm_whoami()` with the caller's own token. A role in the
   request body is a claim, and is never used.
2. **Vercel's scheduler** — a GET carrying `Authorization: Bearer $CRON_SECRET`,
   compared with `timingSafeEqual` in `api/_content.js`. The same reasoning as
   `pocket-hook.js`'s HMAC: a `===` on a secret leaks its prefix a byte at a
   time.

There is no third door. `isCronCaller()` returns false when `CRON_SECRET` is
unset, so a deployment that forgot the variable **refuses the scheduled run**
rather than quietly becoming public — the scheduled leg fails closed, and the
failure is loud on the server.

Two things worth knowing about the cron leg:

- **It skips `guard()` entirely**, so it is not rate-limited and its body is not
  size-checked. That is deliberate: the caller is Vercel, on a fixed weekly
  schedule, and `_guard.js` already argues that an unauthorised caller should
  not be able to spend the day's budget getting turned away. The **cents
  ceiling** below still applies to it, which is the limit that actually bounds
  the bill.
- **A refused scheduled run says so by name** (`cronDenial()`, PR #48). Before
  that fix it fell through to `guard()` and was refused for the wrong reason —
  `405 POST only` on the GET the scheduler actually sends, which is a verb
  nobody can change. A cron's only user interface is a log line, so the log line
  has to be true. That is the same failure ENGINEERING.md §6 names about a token
  missing a scope: it stays valid, returns 403, "and the error must say so."

  The diagnosis is deliberately narrow — only a GET **carrying a bearer**, or a
  `vercel-cron` user-agent, gets told about `CRON_SECRET`. A bare GET with no
  credential falls through to `guard()` and learns nothing about whether this
  deployment has a cron at all.

### A cents ceiling, and why it is not `_spend.js`

`content-slate.js` and `content-regenerate.js` both check
`underCap()` **before** the model is called — checking after would be an audit
log, not a ceiling. It is a second, separate ledger from the one `_spend.js`
keeps for JARVIS:

| | JARVIS | Content Studio |
|---|---|---|
| ledger | `api_hits.cost` | `content_usage.est_cents` |
| unit | dollars | whole cents, rounded **up** |
| ceiling | `JARVIS_BUDGET` env var | `config.monthly_cap_cents`, an owner-editable row |

Two ledgers is right here: a week's slate must not be able to eat the
assistant's budget, and the owner must be able to move one without the other.
The **rate card is shared** (`RATES` in `_spend.js`) so the two cannot disagree
about what a token costs.

Unlike the rate limiter, this cap fails **CLOSED**: an unreadable ledger returns
503 and generates nothing. `_guard.js` fails open because a limiter that takes
the product down when its datastore blips is worse than the abuse it prevents;
nothing about a weekly content slate is urgent, and a cap that cannot see the
ledger is not a cap.

### `content-usage.js` — a route that exists because the browser cannot read the table

The Studio header shows month-to-date spend. `content_usage` is written by the
**service key** from the two generator routes and there is no SELECT policy on
it for `authenticated`, so the browser has no path to it.

Letting the browser read the table directly would have needed a new RLS policy —
a schema change, which the Weekend 1.5 spec forbids — and would have failed
badly if the policy were missing: the read would succeed, return **zero rows**,
and the header would say `$0.00`. That is a plausible value for a real state
(nothing spent yet), which is precisely the ENGINEERING.md §2 failure where the
bug and the intended state render pixel-identical. So the number comes back
through a route, and an unreadable ledger returns 503 and renders a dash.

It spends nothing, calls no model and writes nothing — the only read-only route
in `api/`. It is still `requireOwner`, because the monthly spend of the business
is company money.

### `ANTHROPIC_API_KEY_CONTENT`

The Studio uses its own Anthropic key, separate from `ANTHROPIC_API_KEY`, so a
runaway content job cannot exhaust the assistant's budget and the two spends are
distinguishable on the billing page. It is read only inside `api/`, is never
`VITE_`-prefixed, and `tests/content.mjs` asserts it appears in **no** client
file and in **no** built bundle — the bundle check being the one that is a fact
rather than a rule.

---

## Still open, deliberately

### 🟠 `google-callback.js` + `google-auth.js` — no `state`, so OAuth has no CSRF protection

`google-callback.js` **cannot** take a session — Google's servers redirect the
browser here, and requiring a token would break the flow. That part is correct.
`google-auth.js` is a `302` to Google's consent screen and cannot use `guard()`
at all, which is POST-only.

What is missing is the `state` parameter. `google-auth.js` does not generate one
and `google-callback.js` does not verify one. Consequences:

- The callback accepts any valid `code`. Someone who completes Google's consent
  screen for **their own** account against your `client_id` can cause
  `saveGoogle()` to overwrite your stored connection with theirs — repointing
  every meeting this CRM books at a calendar you do not control.
- Standard CSRF: a victim can be walked through a connect flow they did not
  start.

Left for its own change because it touches two files and the stored-config
format. The shape of the fix is in the PR discussion for this branch.

### 🟡 `sheet-read.js` — authenticated, but any signed-in user can read any sheet

Not a hole opened by this PR and not one it closes; noted because reading all 18
files surfaced it. `sheet-read.js` correctly requires a session, then reads
**any** sheet the *owner's* connected Google account can open, for **any**
signed-in caller. A rep who guesses or is given a spreadsheet URL reads it
through the owner's credentials.

Same shape as `calendar-event`: authenticated, but the *resource* is not scoped
to the caller. Lower severity — it is a read, it needs a URL the rep must
already have, and the scope is `spreadsheets.readonly` — which is why it is
recorded here rather than changed in a PR about mail relays.

---

## What this PR did not do

`google-callback.js` / `google-auth.js` above. Everything else in the table is
now either guarded or a documented, tested exception.

## The tests that keep this true

- **`tests/apiauth.mjs`** walks `api/` and fails on any route that neither
  guards nor is in `KNOWN_OPEN`. Adding an unguarded route breaks the build.
  It also checks this document names every open route, that no `KNOWN_OPEN`
  entry has since been quietly fixed, and — the half that is easy to forget —
  that the **client** sends its token via `apiPost` for every newly guarded
  route. A bare `fetch` to a guarded endpoint 401s in production and fails
  silently.
- **`tests/relay.mjs`** is the one that matters for `notify` and
  `calendar-event`. Every case runs as a valid signed-in session. It proves an
  authenticated caller cannot choose a recipient, cannot smuggle one past the
  allowlist with casing or whitespace, cannot aim the link in the email, and
  cannot turn one booking into a mailshot.

- **`tests/content.mjs`** (229 assertions) carries the Content Studio rules that
  decay quietly: that the cap is checked *before* the model is called on both
  routes, that the cron secret is compared in constant time, that an unset
  `CRON_SECRET` closes the door rather than opening it, and that a refused
  scheduled run distinguishes "not set" from "did not match".
- **`tests/contentroutes.mjs`** (138 assertions) invokes both handlers against a
  fake network and asserts on what reaches the database — including that a
  wrong cron secret never reaches the model and never asks Supabase who it is.

Run any of them directly (`node tests/apiauth.mjs`, `node tests/relay.mjs`, …).

> **`npm test` runs everything.** This line used to say "`npm test` is the
> booking suite", which stopped being true when `tests/all.mjs` landed — it
> walks `tests/`, runs every file, and fails the run on any of them. Corrected
> 23 Aug 2026. A document about whether the repo is honest about its own surface
> should not be wrong about how its own tests are run.
