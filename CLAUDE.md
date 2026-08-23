# CLAUDE.md — standing rules for working in this repo

Read this first, every session. Then read `ENGINEERING.md` before changing
`src/App.jsx`, and `ROLES.md` before changing anything a rep can see. Those two
describe *how this codebase bites* and *who sees what*. This file describes *how
to work here* — the rules that have had to be stated more than once.

---

## Product posture

**This CRM is ProyTech's internal system first, and a product second. Both are
real, and the second constrains the first.**

We run our own company on it. Content Studio exists so a week of content takes
minutes instead of hours. That is the point, and speed for us is a legitimate
reason to build something.

The same suite is also sold to other businesses, with Content Studio as a
premium add-on. So: **build for us, but never in a way that assumes us.**

- **Never hardcode anything ProyTech-specific** — company name, branding, copy,
  counts, defaults, pricing, the number of anything. Compose from `BRAND` /
  `CONTENT_BRAND` (`src/lib/brand.js`) or from a config row. A hardcoded value
  is a thing we have to unwind before we can sell it, and it is always found by
  a customer rather than by us.
- **Defaults are a fallback, not a decision.** When a config row is missing, use
  a sensible default *and say which one fell back, by name*, in the log and on
  the screen. "The row was never created" and "the owner chose that value" must
  never render identically. See `readConfig` in `src/lib/content.js`.
- **Tenant isolation is not a later concern.** Any new table or route gets its
  RLS proof in the same PR — a section in `VERIFY-RLS.md`, and the policy DDL if
  it does not exist yet. A table shipped without one is unproven, and unproven
  tenant isolation is the failure that ends the product.
- **A policy is verified by reading `pg_get_expr` for EVERY policy on the
  table — never by counting them, never by checking `relrowsecurity`, never by
  reading a sample.** Permissive policies are grants and Postgres ORs them, so
  the weakest policy on a table decides what that table allows. Five correct
  policies plus one leftover `using (true)` is a table with no security that
  looks healthier than a table with one policy. This was found twice in one day
  on a database everyone believed was verified — see `ENGINEERING.md` §4c.
  `RLS-AUDIT.sql` sweeps the whole database and raises with names; run it after
  any migration and before handing over any install.
- **Know what "tenant" means here.** This is *not* multi-tenant in one database.
  `ENGINEERING.md` §6: per-client installs are separate deployments against
  separate Supabase projects. There is no `tenant_id`. The isolation that
  matters inside an install is **owner versus rep**, and that is what RLS
  proves. Do not invent a tenant column; do not claim isolation the architecture
  does not provide.

### The success metric for Content Studio

> **One hour from sitting down to 15 pieces scheduled** — image, video prompt
> and caption for each — publishable without rewriting.

Measure work against that number. A feature that does not move it is a
follow-up, not work. When choosing between two implementations, prefer the one
that removes a step from that hour — especially a step that happens **outside
the product**, because those are the expensive ones.

---

## Judgment

**When a call is ambiguous, choose the option consistent with white-label and
tenant isolation, proceed, and note it in the PR. Do not stop to ask.**

A question that costs a round trip is more expensive than a decision that gets
documented and can be reversed. Write the assumption down where it will be
read — the PR description, and a comment at the point of the decision.

**Escalate — actually stop and ask — for exactly three things:**

1. **Schema changes.** Creating, altering or dropping a table or column, adding
   an RLS policy, adding a constraint. Write the SQL, put it in a file, explain
   what it does and when to run it — but do not tell anyone to run it as though
   it were routine, and never apply it silently.
2. **Anything touching auth or a tenancy boundary.** New auth paths, changes to
   `_guard.js`, who can reach a route, what a rep can read.
3. **Scope beyond what the prompt asked for.** Adding a feature nobody asked
   for, or a refactor that touches files the task did not.

Everything else: decide, do it, write it down.

**Hygiene debt in a file you are already changing is not "scope".** If you touch
a route, `API-AUDIT.md` is part of the change. If a doc you are editing contains
something untrue, fix it. "The spec didn't cover it" is not a reason to leave the
repo dishonest about itself.

---

## Hygiene

- **`API-AUDIT.md` is updated in the same PR as any route change.** Adding,
  removing or changing the auth on anything in `api/`. `tests/apiauth.mjs`
  proves a route *has* a check; that document is where the repo says *what the
  check is and why*. A table that silently stops covering `api/` is how the next
  unguarded route goes unnoticed.
- **No raw control bytes in any file under `src/` or `api/`, or in a PR body.**
  Tab, newline and carriage return only. A NUL makes `file(1)` report a source
  file as `data` and makes **`grep` silently match nothing in it**, which breaks
  the check `ENGINEERING.md` §2 tells you to run after adding a column.
  Enforced by `tests/content.mjs`. When file content needs an escape sequence,
  write it with the Write tool or build the byte in code
  (`String.fromCharCode(0)`) — do not pass it through a shell heredoc or a
  Python string, where it gets interpreted before it reaches the file.
- **Patch scripts assert every anchor before applying any replacement.**
  `ENGINEERING.md` §1: a script that asserts as it goes mutates in memory, hits
  a bad anchor, aborts, and writes nothing — so half the change vanishes and the
  build still passes. This has cost two rounds before.
- **Assert on structure, not on prose length.** A test that matches within a
  character window breaks the first time a comment above the code grows, which
  makes it a test of comment length. Use ordering (`indexOf(a) < indexOf(b)`) or
  a named anchor instead.
- **Never put a generated secret in a file, a commit, or a PR body.** If one has
  to be produced, hand it over once and say where it belongs.

---

## Reporting

- **Report test counts with units. Never quote a file count and an assertion
  count in the same breath.** `npm test` reports **test files** (`tests/all.mjs`
  walks `tests/` and tallies files, suppressing each suite's own reporter on
  success). Running a suite directly reports **assertions**. Say which.
- **Separate what you ran from what you did not.** Every report ends with both.
  Never describe as verified something you could not execute — no live Supabase,
  no real model calls, no deployed behaviour you did not curl.
- **Every PR description ends with a follow-up list** of what you noticed and
  did not fix, ordered by cost if it bites. Include the things that are
  uncomfortable to write down.
- **Every session ends with a short verdict block:**
  - **Landed** — what shipped.
  - **Decided without asking** — the ambiguous calls and which way they went.
  - **Flagged** — what needs a human.

---

## The shape of good work here

Drawn from what this codebase has actually shipped broken. `ENGINEERING.md` has
the full list; these are the ones that recur most.

- **A green build proves almost nothing.** It checks syntax. It renders nothing.
  If you add behaviour, add a test that asserts on **what reaches the database**,
  not on what appears on screen.
- **Two screens must never disagree.** When you add a number, find every other
  place that number already appears and make them share one function. The same
  rule applies one layer down: every column written must be selected by every
  read path that uses it.
- **A missing value that renders as a plausible one is the worst kind.** A
  missing number coerces to `0`, and `0` is usually legal — so the bug and the
  intended state are pixel-identical. Prefer a dash, a named fallback, or a
  loud refusal over a plausible zero.
- **Enforce at the write, not at the instruction.** A model told not to change
  something is not a constraint, it is a request. Re-impose the invariant where
  the write happens.
- **One vocabulary, defined once.** Status values, mix classes, surfaces — name
  them in the shared pure module and check against that name. Three string
  literals agreed by convention is a typo away from a row no screen can see.
- **Prefer refusing to guessing.** A spend cap that cannot read its ledger fails
  closed. A parse that comes back unreadable writes nothing and logs the raw
  response. An unset secret closes the door rather than opening it.
- **Say why in the comment, not what.** The code says what. The comment says
  which bug this shape exists to prevent — that is the part that stops someone
  removing it in six months.
