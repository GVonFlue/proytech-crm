# BUILD-NOTES — sales team + commissions

Pulled fresh from `GVonFlue/proytech-crm@main` (commit `49d5c70`) before any
edit. That repo did **not** contain the earlier lender-CRM multi-user work —
there is no `crm_users`, no RLS and no `owner_id` anywhere in it — so Section 1
was built from scratch rather than extended. If a `crm_users` table already
exists in your Supabase project, `MIGRATION.sql` adapts to it (`create table if
not exists` + `add column if not exists`) rather than replacing it. One
difference to know about: the old helper was `is_manager()`; this build uses
`is_owner()` with roles `owner` / `rep`.

**Changed files (deliver these two only):**

- `src/App.jsx`
- `src/lib/supabase.js`

Plus the docs — `MIGRATION.sql`, `VERIFY-RLS.md`, `VERIFY-CLICK.md`, `ROLES.md`, this file — and
the test harness (`tests/`), which is optional and not part of the app.
`package.json` was **not** touched: no new dependencies. `npm run build` exits 0.

---

## What changed

### 1. Roles, users, database-enforced access

- `crm_users`: `id` (auth uid), `name`, `email`, `role` (`owner`|`rep`),
  `pools text[]`, `commission_pct`, `active`, `tabs text[]`,
  `goal_conversions`.
- `leads` gains real `owner_id uuid` and `pool text` columns beside the jsonb.
  The client mirrors them on **every** write (`stampOwner` in `App.jsx` →
  `db.upsertLead` / `upsertMany`), keeping them in lock-step with the
  `data.owner` name string. Installs that haven't run the migration fall back
  to plain `(id,data)` automatically, so nothing breaks before the SQL is run.
- RLS on `leads`, `crm_users`, `app_settings`, plus `is_owner()`, `my_pools()`,
  `no_users()`, `crm_active()`, `crm_listed()`.
- **Login now accepts a real email.** Anything containing `@` is used verbatim;
  a bare username still maps to `username@{authDomain}` so existing logins keep
  working.

**Two deliberate deviations from the SQL in the brief**, both to close holes the
brief's own acceptance list demands:

1. The `leads` policy also requires `crm_active()`. Without it, "deactivating
   blocks access" would have been a screen, not a rule.
2. `crm_whoami()` was added. A rep can only *select* their own `crm_users` row,
   so from the browser "no owners exist" and "I'm not allowed to see the
   owners" look identical — a stray signed-in account would have been handed
   the owner UI. `crm_whoami()` (security definer) answers role / active /
   setup definitively. Pre-migration installs fall back to the old heuristic.

### 2. Team management (Settings → Team, owner-only)

People list with role, commission %, active state. Per person: commission %,
pool checklist, **visible tabs**, monthly conversion goal, deactivate /
reactivate, remove, and *Send password email*.

**How a new hire gets a login:** the app POSTs to Supabase's gotrue
`/auth/v1/signup` endpoint directly rather than calling `supabase.auth.signUp()`
— the SDK call would swap the browser session over to the new user and sign the
owner out. It returns the new uid, which becomes the `crm_users.id`. The owner
is shown a one-time temporary password to hand over, and can alternatively fire
Supabase's `/auth/v1/recover` email so the person sets their own.
**This requires Email sign-ups enabled with "Confirm email" OFF** — with
confirmation on, Supabase doesn't return the user id and the row can't be
created. The app says so on screen if it happens.

Per-rep tabs are stored in `crm_users.tabs` (empty = the default rep set:
Dashboard, Leaderboard, Leads, Follow-Up, Tasks, Activity, Pipeline). They can
only ever narrow the install's global module list, never widen it. Settings and
Clients are owner-only and not offerable. Invoices / The Books / Money / Monday
Huddle are offerable but flagged ⚠ in the UI, because switching one on shows
that rep company money — the brief asks for them to be toggleable and also asks
that a rep never see company revenue, so they are toggleable, off by default,
and labelled.

### 3. Commissions

Stored **on the lead**, inside the existing jsonb:

```
data.commission = { repId, repName, pct, base, amount,
                    status: 'pending'|'earned'|'void',
                    convertedAt, approvedAt, approvedBy, voidedAt }
```

Snapshotted at conversion — `pct` and `base` are frozen copies, so editing a
rep's percentage in Settings, or the deal later, never rewrites history. Credit
goes to the lead's **owner** when that owner is a rep (an owner closing a rep's
deal doesn't steal it), otherwise to the converting rep. Owners earn nothing.
Owner controls live on the client record in the lead modal: approve, void, put
back to pending, and an editable base while it is still pending.

### 4. Conversion alerts

Chosen implementation: **a flag on the lead** (`data.onboardingAlert =
{at, repId, repName, ack}`), surfaced as an owner-only **Awaiting onboarding**
queue at the top of the owner dashboard, with a *Got it* acknowledge.

Why not an `alerts` table: owners can already read every lead, so the queue is a
filter over data they have — a new table would have meant new RLS surface for
nothing. **No email is sent.** There is no mail sender anywhere in this repo
(`/api` has Google Calendar, huddle, receipt-parse and rank-tasks; no Resend,
SendGrid, nodemailer or equivalent, and no mail credentials), so adding email
would have meant a new provider, a new secret and a new dependency — not the
"trivial via an existing serverless pattern" the brief allowed for. The in-app
queue is v1.

### 5–7. Rep dashboard, leaderboard, feel

- **Same `Dashboard` component**, branched on role. Every hook is declared above
  the branch. Owners' dashboard is untouched.
- **Leaderboard** is a new module (`board`). Ranked by clients closed, month /
  all-time toggle, own row highlighted, a crown on #1, owners excluded, no
  dollars. It comes from `crm_leaderboard()` — a security-definer function
  returning names and counts only — because a rep cannot read another rep's
  leads and therefore could never compute the ranking client-side. Owners on a
  pre-migration install get a locally-computed board; reps get a clear "run
  MIGRATION.sql" message rather than a wrong number.
- **Motion**: a `CountUp` component (cubic ease, ~0.8s) on the commission
  counter and conversion counts; `.lift` hover on cards that are actually
  targets (leaderboard rows, the rank card) rather than on every card; one
  restrained celebration on conversion — a small toast with a single light
  sweep, gone in ~2s, never blocking a click. **`prefers-reduced-motion` is
  honoured twice**: a CSS media query kills every animation and transition, and
  `useReducedMotion()` makes `CountUp` render the final value immediately. The
  DOM is correct on the first paint either way — no animation gates usability.

---

## What is NOT enforced at the database

Stated plainly, because a UI filter is not a security boundary:

1. **`dealValue` is readable by the rep who owns the lead.** It lives in the
   same jsonb blob their policy legitimately returns. The app never renders it
   for a rep — no Deal section, no money columns, no value on kanban cards, no
   money in their CSV export — but someone reading the network response would
   see it. Making this real means moving deal money into its own columns (or
   table) that the rep's policy doesn't select.
2. **`app_settings` is team-wide.** Tasks, invoices, transactions and the huddle
   are single shared blobs keyed by row id; RLS cannot split a blob per person.
   Any listed, active signed-in user can read and write them. Reps don't get
   those tabs (and the Tasks list is filtered to their own tasks in the UI),
   which sidesteps it — but it is a sidestep, not a wall. Next step: a real
   `tasks` table with its own policies.
3. **Per-rep tab visibility** is a UI convenience on top of RLS, not a boundary.
   The boundary is which *leads* they can read, and that is enforced.

## Assumptions made

- A rep should not reach Settings or the Clients book at all; those are owner
  surfaces. (The brief listed neither.)
- "Pools" needed a definition: a named bucket (`settings.pools`, default
  `General`) set per lead in **Qualifying**, with unowned + pooled = claimable.
- Commission goes to the lead's owner when that owner is a rep, not to whoever
  clicked convert.
- The Leaderboard module is switched **on** once for installs that already saved
  a module list (`settings.modulesV`), otherwise a new tab would have been
  invisible until someone found it in Sections.
- The rep dashboard's personal goal reuses the existing goal/pace bar, driven by
  `crm_users.goal_conversions`.

## Requested but not built

- **Email alerting on conversion** — see §4 above. In-app queue only.
- **Invite-link flow** — Supabase's admin `inviteUserByEmail` needs the service
  key, which must never reach client code. Temporary password + reset email is
  what a browser can do safely.

## Verification

- `npm run build` → exits 0.
- `node tests/run.mjs` → **53 checks, all passing** (needs `npm i --no-save
  jsdom`; esbuild comes with Vite). The auth + db layer is stubbed and the real
  `src/App.jsx` is mounted **signed in**, as an owner and as a rep, and clicked
  through every page in the sidebar for both. It covers: no blank screen on any
  page for either role, rep scoping (a rep's stub only ever returns their own
  leads and their own `crm_users` row, exactly as the policies do), no deal
  value / MRR / other reps' money anywhere in a rep's DOM, convert → pending →
  approve → earned → void with stamps, editing a rep's % leaving a converted
  commission untouched, claiming a pool lead stamping both `owner` and
  `owner_id`, settings round-trip of the new `pools` / `modulesV` keys, the
  empty-`crm_users` install behaving exactly as before, a deactivated rep hitting
  the gate, an unlisted account getting nothing, and the leaderboard degrading
  gracefully when the DB function isn't there yet.
- **RLS is not covered by those tests and cannot be** — it is Postgres, not
  jsdom. `VERIFY-RLS.md` is the manual multi-account procedure plus the
  officer-side SQL check. Run it before letting a rep in.
