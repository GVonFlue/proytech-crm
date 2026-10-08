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
same reason as the 20 Aug pass. **25 route files, 22 of them described below.**

> **The count was wrong before this pass and is corrected here.** The table said
> 21 while `api/` held 24 non-helper files. The three missing were
> `calendar-availability.js`, `calendar-debug.js` and `calendar-probe.js` —
> all three **do** call `guard()`, so this was a documentation gap and not a
> hole, but it is precisely the drift the paragraph above warns about: a table
> that stops covering `api/` is how the next unguarded route goes unnoticed.
> Reading each of the three and writing its row is **still open** — it was left
> out of the Mass Outreach change rather than done badly in passing.

**Updated 7 Oct 2026 (AUTH-LISTED-2026-10): `requireAuth` now means an active
CRM user.** It used to mean "any valid Supabase session". A login with no
`crm_users` row (a stray account, or a client of the coming portal) passed it,
and 15 routes trusted it: `conversation`, `huddle`, `import-leads`, `jarvis`,
`kb-draft`, `meeting-log`, `parse-receipt`, `pocket-segment`, `rank-tasks`,
`sheet-read`, `notify`, `calendar-event`, `calendar-availability`,
`google-status`, `pocket-backfill` (the last also checks owner itself). Now
`guard()` asks Postgres through `crm_whoami()`, with the caller's own token,
and only an active owner or rep gets past; anyone else gets 403 before any
work or budget is spent, and a failure to ask fails closed. Proven by
`tests/authlisted.mjs`, which drives the real guard and five of the routes.
Every "✅ `guard({requireAuth})`" below now reads "signed in **and on the
team**". New: `team-login.js` (owner-only), so team members can be added with
Supabase sign-ups switched off.

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
| `outreach-draft.js` | ✅ `guard({requireOwner})` | + dollar ceiling, shared with `jarvis.js` — see below |
| `content-usage.js` | ✅ `guard({requireOwner})` | read-only; spends nothing |
| `pocket-hook.js` | ✅ HMAC signature | no session by design — it is a webhook. Correct. |
| `google-status.js` | ✅ **fixed in this PR** | was open |
| `calendar-event.js` | ✅ **fixed in this PR** | signed-in + invite list capped |
| `notify.js` | ✅ **fixed in this PR** | signed-in + recipient allowlist |
| `google-disconnect.js` | ✅ **fixed in this PR** | `guard({requireOwner})` |
| `google-callback.js` | ❌ none — correctly | 🟠 no `state` parameter. **Still open.** |
| `google-auth.js` | ❌ none | 🟡 low. **Still open**, and paired with the above. |
| `coffee-availability.js` | ❌ none — public by design | rate-limited; returns window ids only — see *The coffee routes* |
| `coffee-book.js` | ❌ none — public by design | rate-limited; writes a calendar event and a lead, mails the owners in-process via `_mail.js` — see below |
| `coffee-race.js` | ❌ none — public by design | rate-limited GET; returns two integers — see below |
| `proposal-draft.js` | ✅ `guard({requireOwner})` | + dollar ceiling, shared with `jarvis.js`. Writes nothing; returns words only, no prices. Takes Pocket recording **ids** (max 3) and reads the transcripts itself from the owner-only `pocket_recordings` with the service key, capped per recording and in total; a transcript in the request is ignored. Drops any plan number whose figures nobody said (`groundNumbers`). `tests/proposaldraftrec.mjs` |
| `proposal-send.js` | ✅ `guard({requireOwner})` | mails through `sendClientMail()`, which takes a proposal id, **not an address**, and reads the recipient from the lead server-side. The **only** place a client link is built: `{PROPOSAL_URL or APP_URL}/p/<client-slug>#t=<token>` (an https `PROPOSAL_URL` only; anything else falls back). Mode `peek` returns a published proposal's link and changes nothing. The slug is cosmetic: no route reads it — see below |
| `proposal-public.js` | ❌ none — by design, token-gated | the client has no account. See below |
| `onboarding-public.js` | ❌ none — by design, token-gated | the client has no account. Reads and writes one onboarding through service-role-only definer functions; uploads go to a server-chosen path and are checked by their bytes; client mail by onboarding id, never an address. See below |
| `portal-login.js` | ❌ none — public by design | the client portal's sign-in. See *The client portal* below |
| `portal-admin.js` | ✅ `guard({requireOwner})` | the owner's controls for a client's portal logins: list, invite, resend, remove (switches the row off and bans the login). See below |
| `portal-review.js` | ✅ a **client** portal session (`_portal.js clientOf`: Supabase Auth + `portal_lead()`), plus `guard()` limits | site review (B-2): submit a round, ask for a quoted change round, approve (IP from this server), delete a draft note, image uploads to server-chosen paths. See *Site review* below |
| `review-admin.js` | ✅ `guard({requireOwner})` | the owner's side of site review: preview URL, "Send for review", note status, image links. See below |
| `team-login.js` | ✅ `guard({requireOwner})` | creates a new team member's LOGIN through the Supabase admin API (service key), email confirmed, so it works with sign-ups OFF. Never the public `/auth/v1/signup`. The `crm_users` row is still written by the owner's browser under the owner-only RLS policy |
| `onboarding-admin.js` | ✅ `guard({requireOwner})` | signed download links, the client link, and delete (files before the row). See below |
| `client-email.js` | ✅ `guard({requireOwner})` | the CRM calls it after a deposit tick, with a lead id only; sends "You're locked in" once through `sendClientMail()` (onboarding id, **no address**). See *The client emails* |
| `client-emails-cron.js` | ✅ `CRON_SECRET` **or** `guard({requireOwner})` | the daily 10 AM job: reminders, the day-10 claim, the backstops. The same two doors as `content-slate.js`. See *The client emails* |

`_guard.js`, `_google.js`, `_pocket.js`, `_spend.js`, `_content.js`, `_coffee.js`,
`_mail.js`, `_storage.js` are helpers with no route. `_storage.js` is the only code that reaches the private onboarding bucket, with the service key.

### `proposal-public.js` — the first public route that reads client data, and why that is safe

The client opening a proposal has no login, so a session is impossible here. The
**token** stands in for one: 256 random bits, carried in the link's `#` fragment
so it never reaches a server log or a referrer, and checked against a strict
43-character shape before any database call.

**Oct 2026: the onboarding at acceptance.** On an acceptance (and a return
visit to an accepted proposal) it creates the client's onboarding. It asks
`onboarding_for_proposal()` first. If that fails it logs the database's error
and **inserts the onboarding itself with the service key**: the same row,
only for a proposal whose status is `accepted` (read from the row, not the
request), one per proposal through `onboardings.proposal_id`'s unique key,
and a token from Node's `crypto.randomBytes(32)`. The request still names
nothing but the proposal token. The function had failed on every call in
production: on Supabase pgcrypto is in `extensions`, outside its
`search_path` (`ONBOARDING-ACCEPT-FIX-2026-10.sql`). If both fail, or the
accepted package is not in the onboarding product map, **the owners are
emailed** (`sendMail`, owners only). Proven by `tests/onboardingaccept.mjs`
and, on Postgres, `tests/onbrlsdb.mjs`.

What it can do, all through **security-definer functions callable only by the
service role** (`PROPOSALS-MIGRATION.sql`; anon and authenticated have no
execute grant):

- **Read** one proposal, the one the token names, as **named columns**, never a
  draft, never `notes`, `email_to`, `lead_id` or `accepted_ip`. The route then
  picks the display fields again by name (`PUBLIC_BODY_KEYS`).
  Those fields include the point(s) of contact **chosen for that proposal**
  (name, phone, email — never the offer's whole contact list) and the days to
  launch. The onboarding and payment links are handed over **only once the
  proposal is accepted** (in the accept response, and on a return visit).
- **Stamp** the first-viewed time.
- **Accept**, under a row lock, refusing a draft, an expired proposal, a second
  acceptance, a blank name or an unknown plan. Those rules live in Postgres,
  so a hand-made request cannot skip them. When the stored proposal carries
  `legal` links (Settings → Proposals → Legal, frozen at send), the request
  must also carry `agreeTerms: true`; the route refuses without it, and
  `proposal_accept(…, p_agreed_terms)` refuses again in Postgres
  (`'terms_required'`, `PROPOSALS-LEGAL-MIGRATION.sql`). The terms version and
  links on the record are copied from the stored body, never from the request.
- **Create the client's onboarding**, once the proposal is accepted, through
  `onboarding_for_proposal()` (service role only; it refuses a proposal that is
  not accepted and returns the same onboarding however often it is asked). The
  "You're in" screen's **Start my onboarding** button gets that onboarding's
  portal link, in the accept response and on a return visit. If it cannot be
  made (the migration has not run), accepting still succeeds and the offer's
  static onboarding link is used. Proven by `tests/onboardingaccept.mjs`.

What it cannot do: write a **lead**, return anything from one, or read any
other proposal. It never learns whether a token exists: malformed, unknown and
draft all get the same 404 text. Rate-limited per IP and per day. On first
acceptance it emails the **owners allowlist** through `sendMail()` (`_mail.js`)
with no `to`, the same rule `notify.js` and `coffee-book.js` use, and sends the
**client their copy** ("You're in", with the Terms and Privacy links and
version) through `sendClientMail()`, which takes the proposal id and reads the
recipient from that proposal's lead itself. That is the one lead field this
route causes to be read, it is never returned, and nothing in the request can
aim the email. Only on a new acceptance, never on `already`; a mail failure is
logged and the acceptance stands.

Proven by `tests/proposalroutes.mjs` and `tests/proposallegal.mjs`, and by
`VERIFY-RLS.md` §12 and §12b against a real database.

### The client portal (B-1): `portal-login.js`, `portal-admin.js`, and the invite at acceptance

A client signs in to `/portal` with an email link and sees their own build.
What they can read is decided in Postgres, not by any route:
`portal_home()` / `portal_documents()` find the lead from the session alone
(`portal_lead()`: an active `client_users` row, never a CRM user), take no
argument, and return named fields only (PORTAL-MIGRATION.sql; proven table by
table and function by function in `tests/portaldb.mjs` and VERIFY-RLS §17).
The routes only make and send links.

- **`portal-login.js` (public).** The reply is byte-identical for every email,
  known or not, so the page cannot be used to learn who has a portal. A link
  is made (Supabase admin `generate_link`) only for an **active** client login
  that is not a CRM user, and emailed through `sendClientMail({ clientUserId })`
  to the address **on that row**. `redirect_to` is fixed by the server
  (`PORTAL_URL`, else `APP_URL/portal`). Sign-ups are off, so nothing is ever
  created here. Rate-limited per IP (5 per 15 minutes) and per day.
- **At acceptance (`proposal-public.js` → `_portal.js inviteAtAcceptance`).**
  The address is the lead's own (`portal_invite_target`), never the request's.
  The login is made with an invite link and tied to the lead by
  `portal_link_client`, which refuses a CRM user and refuses to move a login
  from one client to another. Once only; fail-soft.
- **`portal-admin.js` (owner).** List, invite (the owner types the address;
  every later email goes to that row), resend, remove. Remove sets
  `active=false` (the portal reads nothing for them from that moment) and bans
  the login at Supabase so its session cannot refresh.

Proven by `tests/portalroutes.mjs`.

### Site review (B-2): `portal-review.js`, `review-admin.js`, and `/review.js`

A client reviews their preview site inside the portal, pins notes to it,
submits rounds (Terms 3.4) and approves it. Every review table is
**server-write-only and owner-read** (REVIEW-MIGRATION.sql; RLS-AUDIT 2f). A
client's browser can call exactly two things: `portal_review()` (read, named
fields, no storage path) and `portal_note_save()` (a note in **their own open
round**), both starting from `portal_lead()` with no lead argument.

- **`portal-review.js` (a client session, not public).** `clientOf(req)` checks
  the bearer token with Supabase Auth (which login) and asks `portal_lead()`
  with that same token (which client); both or a 401. The lead is never read
  from the body. Every write is a service_role-only function that takes the
  **login id** and finds the lead itself (`review_client`). The approval's IP
  and browser are the ones this server saw (`ipOf`), so a client cannot write
  their own. Uploads: one signed URL per path the server chose
  (`<lead>/<note>-<kind>-<12 random>.<ext>`), checked by its first bytes
  afterwards (`fileKindOk`), images only, 10 MB, into the private `review`
  bucket. Emails go through `_review.js` → `sendClientMail({ clientUserId })`.
- **`review-admin.js` (owner).** The preview URL must be https and on a host
  Settings → Site review allows (default `*.vercel.app`). A note's status can
  change only once its round is submitted, and Postgres freezes everything
  the client wrote at that moment (`review_notes_lock`). An approval cannot be
  changed or deleted by anyone (`site_approvals_lock`).
- **`/review.js` (a static file the preview site loads).** Inert unless it is
  framed, the parent's origin is the origin the script was served from, and
  the portal's hello names the page's exact host. It holds no token, reads no
  cookie, and posts only to that one origin.

Proven by `tests/reviewroutes.mjs`, `tests/reviewscript.mjs`,
`tests/reviewsql.mjs`, `tests/reviewdb.mjs` (PGlite, local) and VERIFY-RLS §19.

**The proposals domain.** When `PROPOSAL_URL` points at
`proposals.getproytech.com`, `vercel.json` serves only the client pages on
that host: the proposal page (`/p/<slug>`, `/proposal.html`), the onboarding
portal (`/onboarding/<slug>`, `/onboarding.html`), their `/assets/`, root-level
images, the build-crew photos (`/team/<name>.jpg|png|webp`) and the two public
routes `/api/proposal-public` and `/api/onboarding-public`; every other path — the CRM, and every
other `/api/` route — redirects to `https://getproytech.com`. The rule is
host-scoped, so the CRM's own domain is unaffected. `tests/proposallink.mjs`
checks it path by path.

### `onboarding-public.js` — the second public route that reads client data, and why that is safe

The same shape as `proposal-public.js`, because the actor is the same: a client
with a link and no account. The **token** (256 random bits, in the link's `#`
fragment, checked against a strict 43-character shape before any database
call) stands in for a session. Malformed and unknown tokens get the identical
404 text, so the route cannot be used to learn which exist.

Every read and write goes through a **security-definer function callable only
by the service role** (`ONBOARDING-MIGRATION.sql`; anon and authenticated have
no execute grant, and both tables are owner-only under RLS). The route then
picks what it sends back **by name** (`PUBLIC_KEYS`, `publicFiles`): never the
onboarding id, a file's storage path, the token, the lead id or the stored
prompts.

What a token holder can do, one action per call:

- **Load** their onboarding, prefilled from the lead (name, email, phone,
  company, website) and the proposal (its plan, its chosen contacts, launch
  days). Nothing else on the lead is returned. The deposit, access, logo and
  headshot dates are read from the lead's checklist, never copied (the logo
  and headshot since `LIFECYCLE-MIGRATION.sql`; the launch clock waits on
  them, Terms 6.2). The launch clock in the response is `launchState`, the
  same function the CRM's client cards and dashboard read.
- **Save** answers. The route rebuilds them from the field schema
  (`lib/onboarding` `cleanAnswers`: unknown ids dropped, values coerced and
  capped, options checked) and **refuses** any value shaped like an SSN or a
  Luhn-valid card number, naming the field and saving nothing. Postgres
  refuses a submitted onboarding.
- **Upload**, in two steps. `upload-sign` checks the slot, extension and size,
  then the **server** picks the path (`{onboardingId}/{folder}/{uuid}.{ext}`)
  and returns a signed upload URL for that one object; the browser uploads
  straight to Storage, so no file passes through a Vercel function.
  `upload-done` reads the object's first bytes and size **from Storage** and
  deletes anything that is not what its extension says, or is over 50 MB,
  before it is ever listed. Supabase fixes a signed upload URL's life at two
  hours; the server-chosen path and the after-the-fact check are what keep it
  narrow.
- **Remove** a file, before submit only.
- **Email themselves their link** through `sendClientMail({ onboardingId })`,
  which reads the address from the onboarding's **lead**. Nothing in the
  request can name a recipient, and Postgres allows one every ten minutes.
- **Submit.** Required answers are checked here (the schema is in JS) and the
  ones Postgres can see are checked again there. Both build prompts are made
  by the same function the CRM's Regenerate uses. The **owners allowlist** is
  told through `sendMail()` with no `to`.

What it cannot do: read or write a **lead**, read another onboarding, read or
list Storage, or reach any file by a path it chose. Rate-limited per IP and
per day; about 1% of calls sweep uploads that were signed and never finished.

Proven by `tests/onboardingroutes.mjs` (the route) and `tests/onbrlsdb.mjs` /
`tests/onbsql.mjs` (the functions, on real Postgres and as text). `VERIFY-RLS.md`
§14 is the proof against a real install and has **not been run**.

### The client emails — `client-email.js`, `client-emails-cron.js` (Oct 2026)

Three onboarding emails to the CLIENT ("You're locked in", "We saved your
seat" at 24 hours / day 3 / day 6, "Launch Day Ticket") and a day-10 call
task. All of the sending is `_clientemail.js`, which reaches the client only
through `sendClientMail({onboardingId})`: the address is read from the
onboarding's lead, and nothing a request carries can name one
(`tests/clientemails.mjs` sends with an attacker's address in every field).

- **`client-email.js`**: owner only. Body: `{leadId}`, nothing else. The
  deposit tick, the switch and its switch-on date are re-read from the
  database, so a caller cannot claim a tick that is not there.
- **`client-emails-cron.js`**: the scheduler (`Bearer $CRON_SECRET`,
  constant-time, an unset secret refuses it), or an owner, who may
  `{force: true}` a run now. Scheduled at 15:00 **and** 16:00 UTC; only the
  run that is 10 AM in `CALENDAR_TZ` does anything, so it is 10 AM in Chicago
  in daylight and standard time.
- **`onboarding-public.js`** (already listed) now also sends the client's
  ticket on submit, by onboarding id, after the owners' email.
- **Once, never twice:** every send first claims `(lead_id, kind)` in
  `client_emails` (unique; insert on conflict do nothing). Owners read that
  table; only the server writes it (VERIFY-RLS.md §18, RLS-AUDIT.sql §2f). A
  failed send deletes its claim so tomorrow retries.
- **Past clients are never emailed:** each email is off until an owner
  switches it on, and only a tick, activity or submit on or after that day
  triggers it.
- **No lead is written by the server.** The day-10 task is a claim; the
  owner's CRM creates the task, so an open tab cannot erase it.

### `onboarding-admin.js` — owner only, and why it exists

The owner reads and edits onboardings directly under RLS. Three things need the
service key, so they sit behind `guard({requireOwner})`: five-minute **signed
download links** (sensitive files and SVGs always download, never render, and
get no thumbnail); the client's **portal link**, built on the same base as
proposal links; and **delete**, which removes the files from Storage *before*
the row and keeps the row if Storage refuses, so no file is ever stranded with
nothing pointing at it.

### `outreach-draft.js` — why owner, and why it shares JARVIS's budget

**`requireOwner`, not `requireAuth`**, which makes it stricter than every other
AI route here except the Content Studio pair. Three reasons, and the third is
the one that would have gone wrong quietly:

1. It drafts messages **in the business's own voice**, addressed to named people.
   A rep sending a hundred texts that read as coming from the owner is not a
   thing the owner should discover afterwards.
2. It reads records **across the whole book**. A rep's payload would have to be
   narrowed to their own leads, and a narrowing that exists only in the browser
   is not a control — `visibleLeads` in `lib/jarvis.js` is a UI promise backed
   by RLS, and this route has no equivalent server-side narrowing written.
3. **The tab and the route have to agree.** `canOpen` in `src/App.jsx` gates
   `outreach` to owners; if that gate were ever relaxed without changing this,
   a rep would get a screen whose Generate button fails every time, which reads
   as a broken build rather than as a permission.

**It logs spend to `jarvis:spend`, deliberately** — the same bucket and the same
`JARVIS_BUDGET` ceiling as `api/jarvis.js`. A separate budget would mean the
figure on the JARVIS meter stopped being the whole AI bill, and two ceilings
that each look like "the" limit is how an install ends up spending twice what
its owner set. One number, one meter.

**No write path and no send path.** It returns text. Every draft is reviewed on
screen, and the message is sent by a human inside Messages through an `sms:`
link — there is no server-side sending anywhere in this codebase, and the
review screen's comments say so explicitly so it does not get "improved" in.

**Prompt injection matters more here than in the chat box.** Lead notes and
imported spreadsheet rows reach this prompt, and unlike `jarvis.js` — where the
worst case is a suggested note the user declines — the output of this one is
something the owner then *sends to a real person*. The defence is
`validateDraft` in `src/lib/outreach.js`, which refuses any draft carrying a
link, an email address or a phone number, plus the absence of a write path.

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

> **Oct 2026: the send moved into `_mail.js`.** Points 2 and the Resend call
> now live in `sendMail()` in `api/_mail.js`, a helper with no route.
> `notify.js` is unchanged at its door (`guard({requireAuth:true})`,
> `perDay:300`), builds its email as before, and calls `sendMail()`. The reason
> is `coffee-book.js`, which is public and must email the owners. It posted to
> this route with no session, so every booking email was a silent 401. It now
> calls `sendMail()` in-process. No key was added and no route was opened.
>
> **The allowlist is enforced inside `sendMail()`, not by its callers.** A
> caller's `to` can only narrow the list. `coffee-book.js` passes no `to` at
> all, so it reaches exactly `NOTIFY_TO` plus active owners and never the
> address typed into the booking form. The `app_settings` exclusion is
> asserted on `_mail.js` as well as `notify.js` in `tests/apiauth.mjs`.
> `tests/mail.mjs` proves all of it by running real code against stubs.
> An anonymous or forged-token call to `notify.js` is still a 401 with nothing
> sent. The helper refuses an outsider, a look-alike address and the outsider
> half of a mixed list. A real `coffee-book` booking mails the owners and not
> the guest. If Resend rejects the send or cannot be reached, the booking still
> succeeds.

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

## The coffee routes — public on purpose

Added 3 Oct 2026. `coffee-availability.js` and `coffee-book.js` were uploaded to
`main` on 30 Sep and `coffee-race.js` on 3 Oct, none of them in this table or in
`KNOWN_OPEN`, so `tests/apiauth.mjs` was red on `main` for all three. They now
appear in both. That makes **28 route files, 25 with a row in the table**. The
three without one are still the `calendar-*` routes named at the top.

They serve getproytech.com/coffee, whose visitors have no CRM login, so a
session check is impossible rather than forgotten. What stands in its place:
`guard()` rate limits on every one (per IP and per day), CORS restricted to
the getproytech.com origins (a browser control only; it does not stop curl),
and the service-role key held on the server. All three read or write with that
key, so **RLS does not apply to them**. Their boundary is what the code
returns, not a policy.

- **`coffee-availability.js`** — POST `{date, host?, custom?}`. Returns open
  preset window ids (`0730`…`1830`) and, when asked about a custom start time
  (`HH:MM`, 15-minute steps, 07:00–19:00), `custom: true|false` — never an
  event title, time or attendee. Anything invalid, and every fail-closed path,
  answers `custom: false`. A calendar that
  cannot be read returns no windows (fails closed). The `host` decides which
  events block; the rule is in `_coffee.js`.
- **`coffee-book.js`** — POST. Creates a Google event on `primary` with
  `sendUpdates=all` and upserts a lead. The visitor picks only from fixed lists
  (shop, a preset window or a custom `cHHMM` time on a 15-minute step from
  07:00 to 19:00 — anything else is a 400 — and a known host), and the only
  invitee is the email they typed, so it cannot be turned into an invite relay
  to third parties beyond the rate limit. It re-checks availability for that
  host before writing. It emails the owners by calling `sendMail()` from
  `_mail.js` in-process, with no `to`, so the allowlist alone decides the
  recipients and the guest's address cannot be one of them. A failed send
  is logged and the booking still succeeds. See the Oct 2026 note under
  `notify.js` above.

  **What it writes on the lead (Oct 2026).** `source` is `'Coffee page'`: how
  they arrived. An existing lead keeps a channel it already had and only an
  empty one is filled. The visitor's "how did you hear" answer goes in its own
  field, `heard: {answer, referrer?, on}`, capped at 80 and 120 characters,
  set only when the lead has none. It is never written into `source` or
  `introducedBy`. Before this, a typed referrer *name* was written into
  `introducedBy`, which holds a contact id, so the CRM credited
  "(removed contact)". The CRM now **suggests** contacts matching the name
  (`src/lib/sources` `referrerSuggestions`) and a person links one. No auth,
  rate limit, CORS or recipient behaviour changed. `tests/coffee.mjs` covers
  new and existing leads.
- **`coffee-race.js`** — GET. Reads every lead's `data` with the service key and
  returns `{Garrett: n, Logan: n}`, the race dates and the goal. No name,
  contact detail or deal field is in the response. `tests/coffee.mjs` covers
  the counting, and `tests/coffeerace.mjs` calls the route itself.

  **It shipped unable to answer anything.** The handler accepted only GET and
  `guard()` accepted only POST, so every request in production was
  `405 POST only`. Tests of `countRace()` passed throughout because none of them
  called the handler. Fixed with an opt-in `methods` option on `guard()`
  (default `['POST']`, and only GET and POST can be listed). This route is the
  only one passing `methods: ['GET']`, and its own check above keeps it
  GET-only. A GET is still rate-limited like a POST. The `s-maxage=60` header
  means most hits are served by the CDN and never reach the function.
  `tests/guard.mjs` proves a route without the option still rejects GET.

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

- **`tests/onboardingroutes.mjs`** drives both onboarding routes against a fake
  network: token gating, fields picked by name, the SSN and card refusal, the
  server-chosen upload path, the byte check that deletes a disguised file, the
  recipient read from the lead, and owner-only signed links.
- **`tests/clientmail.mjs`** proves `sendClientMail()` has exactly two holders,
  `proposal-send.js` and `onboarding-public.js`, and that neither can aim it.

Run any of them directly (`node tests/apiauth.mjs`, `node tests/relay.mjs`, …).

> **`npm test` runs everything.** This line used to say "`npm test` is the
> booking suite", which stopped being true when `tests/all.mjs` landed — it
> walks `tests/`, runs every file, and fails the run on any of them. Corrected
> 23 Aug 2026. A document about whether the repo is honest about its own surface
> should not be wrong about how its own tests are run.
