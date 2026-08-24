# ENGINEERING.md — how this codebase bites

Read this before changing `src/App.jsx`. Every rule below exists because
something shipped broken with a green build.

`BUILD-NOTES.md` describes what the last feature did. **This file describes what
will go wrong next time.** It is not a changelog and should not become one.

```
npm install
npm run build           # must exit 0
npm i --no-save jsdom   # DOM tests only, deliberately not in package.json
node tests/<name>.mjs   # each suite runs standalone
```

---

## 1. A green build proves almost nothing

Five separate bugs in this project passed `npm run build` **and** a manual
click-through, and were caught only by the jsdom suites. The build checks
syntax. It does not render anything.

The suites mount the **real `src/App.jsx`** signed in, with `src/lib/supabase.js`
swapped for `tests/stub-supabase.js`, and assert on **what reaches the database**
— not on what appears on screen. Asserting on the UI misses the half of the bug
that matters.

**If you add behaviour, add a test.** If a bug is found, add the test that would
have caught it before fixing it.

Some promises cannot be reached from SQL at all. An owner is *allowed* to read
their own Playbook drafts, so no policy can stop their browser putting one in a
request to the assistant — the database cannot tell displaying text from
sending it. `tests/kb.mjs` asserts on the outbound `/api/jarvis` body directly
for exactly that reason. When a guarantee ends at the edge of the database, say
so and test the edge; do not describe it as a policy.

### The four that keep recurring

**Temporal dead zone.** `const` does not hoist. A helper declared below its first
use crashes at render while building cleanly.

> `wonForRate` was declared under the `winRate` line that used it. Dashboard
> crashed on load, build was green.

**Locals that look global.** `Empty` is a `const` inside `Dashboard`. `dealSum`
is a `const` inside the lead modal. Calling either from module scope throws at
render. The module-level equivalents are `dealBits` and your own inline blank.

**Silent partial edits.** If you patch this file with a script, **assert every
anchor before applying any replacement**. A script that asserts as it goes will
mutate the string in memory, hit a bad anchor, abort, and write nothing — so half
your change vanishes and the build still passes.

> This cost two rounds. The Modal signature never received `events`; opening any
> lead threw `events is not defined`.

**New tabs ship invisible.** Tab visibility is gated by `settings.modules`, a
saved array. Any install that has ever opened the modules screen has a list that
predates your tab, so it simply never appears — and nothing looks broken. Bump
`modulesV` and backfill. Same for `settings.stages`, which overrides
`DEFAULT_STAGES` entirely.

> There is a **second, per-rep** version of this. `REP_DEFAULT_TABS` only
> applies to a rep whose `tabs` array is empty; anyone with a custom list keeps
> it and never sees the new tab. Playbook shipped on by default and still needs
> switching on by hand for those reps.

---

## 2. Two screens must never disagree

The most common bug class here by a distance. Three of four recent bugs were two
views counting the same thing differently.

- **`meetingsOf(lead)` is the only source for meeting counts.** `bookedCount`
  once counted `'Booked'` activities instead and read `2 booked` over a list
  saying `No meetings yet`.
- **Derive, don't copy.** Sponsorship history is read from event slots.
  Payments in The Books are read from leads. A second stored copy of the same
  fact drifts the moment either side is edited.
- **A drilldown's total must equal the sum of its own rows**, and its scope must
  match the tile that opened it. The Deals Closed panel had an all-time header,
  month-scoped tile, and rows reading a field that closing a deal empties.

When you add a number, find every other place that number already appears and
make them share one function.

### The same failure, one layer down: write path vs read path

**Every column written must be selected by every read path that uses it.**

A field written but not read is a field that vanishes. This is the same bug as
two screens disagreeing — the two disagreeing parties are just `upsert` and
`select` instead of two tiles, and it is harder to see because only one of them
is on screen.

It has now happened three times:

- **`recurring`** — written by the settings save, dropped by the settings load
  (v36). The toggle worked until you reloaded.
- **`appointment_rate`** — written by `upsertUser`, never in `getUsers`' select
  list. A rate typed in reached Postgres, came back `undefined`, coerced to `0`,
  and every screen agreed it was zero. Because `0` also means *not on
  appointment pay*, the entire feature read as deliberately switched off: no
  rep appeared in the owner's payout table, and no rep saw their own earnings
  block. Nothing errored, and the value was in the database the whole time.
- **`appointment_rate` again, in `crm_whoami()`** — the RPC carried
  `commission_pct` and not the rate, so the rebuilt "my own row" disagreed with
  Settings about the same rep. Two reads of one value.

What makes this class nasty is that **the failure renders as a plausible
value.** A missing string shows up blank and you notice. A missing number
coerces to `0`, and `0` is usually legal. The bug and the intended state are
pixel-identical.

So:

- After adding a column, grep for it. You should get the migration, the write,
  **and every read**. Two hits means you are not finished.
- Coerce on read (`Number(x) || 0`) so `undefined` never reaches arithmetic —
  but coercion hides the fault, so it is not a substitute for selecting it.
- A schema fallback that drops a column must **log which column**, by name.
  Otherwise "the migration never ran" and "this rep isn't on appointment pay"
  are the same screen forever.
- One value gets one read. If a second path must exist (an RPC, a cached
  identity), it carries **every** field the first one does, or it carries none
  and defers.

---

## 3. Writes race

`setLeads` is asynchronous. Two mutations in one tick both read the array
captured at render, and the second silently discards the first — **including in
Supabase**, because these mutators push a whole rebuilt lead.

- Read through **`leadsRef.current`**, write through **`commitLeads`**.
- The lead modal's `set()` is functional (`setDraft(d => ...)`) for the same
  reason.
- **One event, one patch.** Closing a deal removes it, archives it, moves
  `dealValue` and logs a note — all in a single `set()`. Three calls would
  overwrite each other.

> `closeDeal` fired three writes; the last rebuilt the lead from a stale
> snapshot, so the note appeared and the deal never moved.

---

## 4. Money rules

- **Revenue is cash.** It counts in the month the *payment* is dated, not the
  month the deal closed. A deposit in July and a balance in August land in their
  own months.
- **Legacy fallback:** a lead closed with a confirmed deposit but no payment rows
  still counts at its close date, labelled *no payments logged*. The moment a
  payment is logged on that lead, its payments take over. Never break this —
  it's what stops historical revenue vanishing.
- **Nothing historical moves.** New rules apply from a dated cutoff
  (`CASH_RULE_FROM`). Silently restating past months is worse than the bug.
- **Only won or client leads can owe money.** An open prospect owes nothing;
  counting their deal value made "still owed" read as the whole pipeline.
- **Closed deals are not open deals.** Once archived into `closedDeals`, the
  legacy `deal` object and bare `dealValue` on the same record are the *same
  money* — counting both double-counts it.
- **Win rate counts selling; revenue counts cash.** A won deal counts the moment
  it's won. They are different questions.

---

## 4b. Two tables are sometimes the only way to hide a column

RLS is **row**-level, and an owner and a rep are the **same Postgres role**
(`authenticated`) — Supabase tells them apart only inside policy predicates. So
column-level `GRANT`s cannot separate them, and a rep allowed to read a row is
allowed to read every column of it.

That is why `dealValue` is an honest-limits entry rather than a boundary, and
it is why the Playbook is two tables rather than one with a `status` column.
Drafts live in `kb_notes` (owner-only); the rep-readable surface is
`kb_published`, which has **named columns, not jsonb** — reading the DDL is the
complete answer to "what can a rep see". A field that is not a column there
cannot be published by accident.

`kb_published` also has **no INSERT/UPDATE/DELETE policy and revoked write
privileges**. That is not an oversight. The only writer is `kb_publish()`,
which reaches the table by owning it as a `security definer` function. Adding
`force row level security` would break publishing.

If you need a new "some of this is shareable" feature, this is the shape.
Filtering in the app is not, and neither is a `shared` flag on a blob.

## 4c. The weakest policy on a table decides

Found twice in one day, 23 Aug 2026, on a database everyone believed was
verified.

**Eight content tables** had RLS on and one policy each. The policy was
`using (true)`. Every authenticated session — every rep — had full
read/write/delete on pricing, unpublished marketing and the AI spend ledger.

**`leads` had five correct policies and one leftover** called
`leads_all_authenticated`, `using (true)`, `with check (true)`. Every lead in
the business was readable and writable by any authenticated session.

The second one is the one to internalise, because the first has an obvious
lesson and the second has the real one.

**Permissive policies are GRANTS, and Postgres ORs them.** A table allows
whatever its most permissive policy allows. Nothing else about the table
matters:

```
leads_all               (owner or own rows or my pool)   correct
leads_insert            (…)                              correct
leads_update            (…)                              correct
leads_delete            (…)                              correct
leads_select_pool       (…)                              correct
leads_all_authenticated (true)                           ← this one wins
```

Five perfect policies plus one `true` is a table with **no** security, and it
looks *healthier* than a table with one policy, because it has more of them.

### So every way of checking this that feels reasonable is wrong

- **Counting policies is useless.** `count(*)` returned 1 for the content
  tables and 6 for `leads`. Both were wide open. A count returns the same
  number for a locked table and an open one.
- **`relrowsecurity` is useless on its own.** It was `true` in both cases. RLS
  was *on*. That is not the same as RLS *doing* anything.
- **Reading some of the expressions is still wrong.** Anyone auditing `leads`
  would read the five well-named policies, find them correct, and stop. The
  sixth was the only one that mattered and it was the least interesting-looking
  thing in the list.

### The rule

**Read `pg_get_expr` for EVERY policy on the table, and confirm that none of
them is permissive-and-`true`.** Not the count, not the flag, not a sample.

`RLS-AUDIT.sql` in the repo root does this for every table in `public` and
raises with names. Run it after any migration and before handing over any
install. `VERIFY-RLS.md` is the deeper version — real logins, sentinel rows, a
measured before and after — and the two answer different questions: the audit
proves nothing is *open*, the verification proves a policy is *right*.

One precision that matters when you write your own check: **`RESTRICTIVE`
policies AND rather than OR**, so a restrictive `true` is harmless. And an
`INSERT` policy has no `USING` clause at all, so a NULL there is normal and
must not be reported as permissive. Getting either wrong gives you a checker
that cries wolf, which is how a checker stops being run.

---

## 5. Things that look like settings and aren't

Still hardcoded, and the first thing a non-ProyTech install will need changed:

- `ONB_ITEMS` — the onboarding checklist
- `MEETING_TYPES` — meeting/appointment types

Already settings-driven: stages, client phases, delivery tracks, lead columns,
goals, dashboard layout (`dashOrder`/`dashHidden`), per-user sidebar order
(`crm_users.nav_order`), ratio-excluded meeting types, labels, nurture days.

**`onboarding` and `delivery` are two parallel checklist systems.** The Clients
page uses one, the lead modal the other. This is why `deposit_paid` was
unreachable from a lead. Consolidate before anything else inherits both.

---

## 6. Google

- One OAuth token app-wide, in `api/_google.js`. **Not multi-tenant.** Per-client
  installs are separate deployments.
- Writes to the connected account's **primary** calendar only.
- **A token missing a scope stays valid and returns 403.** It does not expire.
  Adding a scope means every user must reconnect, and the error must say so —
  `api/sheet-read.js` has the pattern.
- `sheet-read` defaults to the **first tab** when none is named. A workbook with
  several tabs will silently read the wrong one.

---

## 7. Known gaps

- Import has no duplicate detection. The event guest importer has the right
  ladder (email → phone → exact name, name-only held for review) — point it at
  the lead importer.
- No merge tool for duplicates that already exist.
- Sponsor deliverables aren't tracked.
- @mention tags don't notify; they surface next time the person opens the CRM.
- Event milestones don't create calendar events or reminders.
- Sheet sync is a button, not scheduled. A daily Vercel Cron would serve this and
  deadline reminders together.
- Every lead is loaded into memory and metrics computed in a `useMemo`. Fine at
  hundreds; find the ceiling before it finds you.
