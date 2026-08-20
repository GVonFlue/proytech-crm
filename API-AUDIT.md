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
| `pocket-hook.js` | ✅ HMAC signature | no session by design — it is a webhook. Correct. |
| `google-status.js` | ✅ **fixed in this PR** | was open |
| `calendar-event.js` | ✅ **fixed in this PR** | signed-in + invite list capped |
| `notify.js` | ✅ **fixed in this PR** | signed-in + recipient allowlist |
| `google-disconnect.js` | ✅ **fixed in this PR** | `guard({requireOwner})` |
| `google-callback.js` | ❌ none — correctly | 🟠 no `state` parameter. **Still open.** |
| `google-auth.js` | ❌ none | 🟡 low. **Still open**, and paired with the above. |

`_guard.js`, `_google.js`, `_pocket.js`, `_spend.js` are helpers with no route.

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

Run both directly (`node tests/apiauth.mjs`, `node tests/relay.mjs`) — this
repo runs each test file on its own; `npm test` is the booking suite.
