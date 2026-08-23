# VERIFY-RLS.md — prove the permissions, don't take my word for it

Row Level Security cannot be tested from jsdom. It lives in Postgres, so it has
to be verified against the real database with real logins. This is that test.
**If a rep sees everything, the build is not shippable — stop and say so.**

Budget 15 minutes for §§1–8, and ten more for §9. Do it once per install, right
after running `MIGRATION.sql`.

> **§9 is not optional, on any install.** The eight Content Studio tables were
> created by hand rather than by a migration, and on 23 Aug 2026 they were found
> carrying `using: true` policies — RLS on, a policy present, and every
> authenticated session holding full read/write/delete on all eight. Every
> count-based check had passed. §9 records what was there, what the end state
> is, and why a policy count proves nothing.

---

## 0. Before you start

1. Supabase → SQL Editor → run **MIGRATION.sql**. It is idempotent.
2. Supabase → Authentication → Providers → Email: **enabled**, and
   **Confirm email = OFF**. (With confirmation on, the signup endpoint doesn't
   return the new user's id and the app cannot create their `crm_users` row.)
3. Sign into the CRM as yourself → **Settings → Team → "Make me the owner"**.

---

## 1. Create the cast

In **Settings → Team**:

| Person  | Role      | Pools              | Commission |
|---------|-----------|--------------------|------------|
| You     | Owner     | —                  | —          |
| Rep A   | Sales Rep | `Inbound`          | 10%        |
| Rep B   | Sales Rep | `Outbound`         | 8%         |

Add pools with **+ New pool** while you're on a rep. Note each temporary
password the app shows you (or use **Send password email**).

Now give the data something to prove:

- Open a lead → **Qualifying** → set **Owner = Rep A**. Do the same for two more.
- Open a fourth lead → set **Owner = ProyTech** (or leave it unowned) and set
  **Lead pool = Inbound**.
- Open a fifth → **Lead pool = Outbound**, unowned.
- Leave several leads owned by you.

---

## 2. The rep test (the one that matters)

Open a **private / incognito window** for each person — the app holds one
session per browser profile, so this is the only way to be signed in as two
people at once.

**Signed in as Rep A:**

- [ ] Only Rep A's leads appear under **Leads → Mine**.
- [ ] **Leads → Pool** shows the `Inbound` lead. It does **not** show the
      `Outbound` one.
- [ ] There is **no All** button in the Mine / Pool switcher.
- [ ] No **Settings**, **Money**, **The Books**, **Invoices**, **Clients**,
      **Relationships** or **Monday Huddle** in the sidebar.
- [ ] The dashboard shows **their** commission — no Open Pipeline, no MRR, no
      Revenue Closed.
- [ ] Opening one of their own leads shows **no deal value** anywhere — the
      Deal section does not exist for them.
- [ ] **Leaderboard** shows Rep A and Rep B by clients closed, with **no
      dollars** and **no owners**.
- [ ] Claim the `Inbound` pool lead → it moves to Mine.

**Signed in as Rep B:** none of Rep A's leads are visible, in any view.

---

## 3. The officer-side SQL check (proves it's the database, not the UI)

A UI can be lied to; SQL cannot. In the Supabase **SQL Editor** (which runs as
a superuser and therefore bypasses RLS), confirm the policies exist and that
the data really is partitioned:

```sql
-- the policies are actually on the tables
select tablename, policyname, cmd from pg_policies
 where tablename in ('leads','crm_users','app_settings') order by tablename, policyname;

-- RLS is enabled, not merely defined
select relname, relrowsecurity from pg_class
 where relname in ('leads','crm_users','app_settings');

-- who owns what
select u.name, u.role, count(l.id) as leads
  from crm_users u left join leads l on l.owner_id = u.id
 group by u.name, u.role order by u.role, u.name;

-- unclaimed leads sitting in pools
select pool, count(*) from leads where owner_id is null and pool is not null group by pool;
```

Then prove enforcement **as a rep**, still in the SQL Editor, by borrowing
their identity for one transaction:

```sql
-- put Rep A's uuid in here (select id, name from crm_users where role='rep')
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  -- MUST be only Rep A's leads + the Inbound pool
  select count(*) as visible_to_rep_a from leads;
  select data->>'owner' as owner, pool, count(*) from leads group by 1,2;

  -- MUST be exactly 1: their own row
  select count(*) as users_visible from crm_users;

  -- MUST be false
  select is_owner();
rollback;
```

- [ ] `visible_to_rep_a` is **less than** `select count(*) from leads` run as
      superuser.
- [ ] `users_visible` = 1.
- [ ] `is_owner()` = false.

Repeat the block with an **owner's** uuid: `is_owner()` = true and the lead
count matches the full table.

---

## 4. Deactivation

- [ ] Settings → Team → Rep A → **Deactivate**.
- [ ] Rep A reloads: they get "Your access has been switched off."
- [ ] Rep A disappears from the leaderboard.
- [ ] Their leads, notes and commissions are all still there.
- [ ] **Reactivate** puts everything back.

Deactivation is enforced in SQL too (`crm_active()` is part of the `leads`
policy), so it is not just a screen: re-run the §3 impersonation block for a
deactivated rep and `select count(*) from leads` returns **0**.

---

## 5. The install that has nobody in it

- [ ] On a fresh install with an empty `crm_users`, everything behaves exactly
      as it did before this build: one login, every tab, no scoping.
      (`no_users()` short-circuits every policy.)

---

## 6. The Playbook boundary (after KB-MIGRATION.sql)

**Do this before any Playbook UI exists.** The boundary is the feature; there
is no point building a screen on a policy nobody has proved. If a rep can read
a draft, stop and say so.

Seed two notes first, in the SQL Editor as superuser:

```sql
insert into kb_notes (id, data, status) values
  ('kb-draft', '{"title":"Lender objections","body":"SENTINEL-DRAFT-TEXT"}'::jsonb, 'draft'),
  ('kb-live',  '{"title":"Onboarding a client","body":"Step one, send the welcome pack."}'::jsonb, 'draft');
```

Now publish only the second one **as the owner**, through the real path:

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<OWNER-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  -- the preview is what will be published; read it before publishing
  select * from kb_preview('kb-live');
  select kb_publish('kb-live');
commit;
```

### As a rep

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  select count(*) as kb_notes_visible      from kb_notes;        -- MUST be 0
  select count(*) as kb_published_visible  from kb_published;    -- MUST be 1
  select count(*) as ai_rows               from kb_ai_context(); -- MUST be 1

  -- the draft's text must not be reachable by ANY route open to a rep
  select count(*) as leaked from kb_published where body like '%SENTINEL-DRAFT-TEXT%';
  select count(*) as leaked from kb_ai_context() where body like '%SENTINEL-DRAFT-TEXT%';

rollback;
```

Then the three refusals. Each gets its **own** block: the first failure aborts
the transaction, so running them together would give you
`current transaction is aborted` for the second and third and prove nothing.

```sql
-- 1. a rep cannot publish
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  select kb_publish('kb-draft');                                   -- MUST raise
rollback;

-- 2. a rep cannot write the rep-readable table directly
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  insert into kb_published (id,title,body) values ('x','x','x');   -- MUST be denied
rollback;

-- 3. neither can the OWNER. This one is the point of the design.
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<OWNER-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  update kb_published set body = 'tampered' where id = 'kb-live';  -- MUST be denied
rollback;
```

- [ ] `kb_notes_visible` = **0**. This is the same result `select count(*) from
      meeting_logs` gives a rep today, from the same policy shape.
- [ ] `kb_published_visible` = **1**, and it is the note you published.
- [ ] `ai_rows` = **1** — equal to the published count, not the note count.
- [ ] Both `leaked` counts are **0**.
- [ ] Block 1 raises `only an owner can publish`.
- [ ] Blocks 2 and 3 are both refused with `permission denied for table
      kb_published` — **not** "0 rows updated". That distinction is the whole
      design: the write is refused at the privilege level, not filtered by a
      policy, so no browser session may write that table at all. Block 3
      failing for the OWNER too is the proof that `kb_publish()` is the only
      writer there is.

### As the owner

Repeat the block with the **owner's** uuid:

- [ ] `kb_notes_visible` = **2** — both notes, drafts included.
- [ ] `select count(*) from kb_ai_context()` is still **1**.

That last line is the JARVIS guarantee, proved from SQL rather than asserted:
the person who can read every draft still cannot obtain one through the
function the assistant is fed from. There is no argument to pass and no branch
to take — `kb_ai_context()` does not name `kb_notes`.

### The preview cannot lie

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<OWNER-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  update kb_notes set data = jsonb_set(data,'{body}','"Edited after publishing."'::jsonb),
                      updated_at = now()
   where id = 'kb-live';

  select * from kb_preview('kb-live');                  -- shows the NEW text
  select body from kb_published where id = 'kb-live';   -- still the OLD text
rollback;
```

- [ ] The two differ, and the editor is expected to say **"published version is
      behind"** on exactly this condition
      (`kb_notes.updated_at > kb_published.published_at`).
- [ ] After `kb_publish('kb-live')` they match — because publish inserts the
      rows the preview returned. One source, so they cannot disagree.

Clean up when you're done: `delete from kb_notes where id in ('kb-draft','kb-live');`
(the published row cascades away with it).

---

## 7. Pocket recordings (after POCKET-MIGRATION.sql)

**Do this before any Pocket UI exists.**

`pocket_recordings` holds the **full transcript of every recording, forever** —
including the Sunday calls where pay splits, pricing floors and candid reads get
said out loud. It is the most sensitive table in this database alongside
`meeting_logs`, and it has deliberately been given `meeting_logs`' policy rather
than a new one. This section proves that.

First, prove the two policies really are the same expression rather than two
things that look alike:

```sql
select polrelid::regclass as tbl, pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy
 where polrelid in ('pocket_recordings'::regclass, 'meeting_logs'::regclass);
```

- [ ] Two rows, and the `using_expr` strings are **identical**.
- [ ] `select relname, relrowsecurity from pg_class where relname = 'pocket_recordings';`
      returns **true**. A policy on a table with RLS switched off enforces nothing.

Seed one recording as superuser, with a sentinel standing in for the material
that must never travel:

```sql
insert into pocket_recordings (id, data, status) values
  ('rec_test_1',
   '{"title":"Sunday with Logan",
     "transcript":"SENTINEL-PAY-SPLIT-forty-percent-and-we-floor-at-nine-thousand",
     "summary":"Pricing and the Alvarez account."}'::jsonb,
   'open');
```

### As a rep

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  select count(*) as recordings_visible from pocket_recordings;   -- MUST be 0

  -- the sentinel must not be reachable by ANY route open to a rep
  select count(*) as leaked from pocket_recordings
   where data->>'transcript' like '%SENTINEL-PAY-SPLIT%';         -- MUST be 0
rollback;
```

- [ ] `recordings_visible` = **0**. This is the same number `select count(*)
      from meeting_logs` gives a rep, from the same policy.
- [ ] `leaked` = **0**.

### The writes a rep must not be able to make

Each in its **own** block — the first failure aborts a transaction, so running
them together reports `current transaction is aborted` for the rest and proves
nothing.

```sql
-- 1. a rep cannot insert
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  insert into pocket_recordings (id, data) values ('rec_rep','{}'::jsonb);
rollback;

-- 2. a rep cannot change one
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  update pocket_recordings set status = 'dismissed' where id = 'rec_test_1';
rollback;

-- 3. a rep cannot delete one
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  delete from pocket_recordings where id = 'rec_test_1';
rollback;
```

**Read these results carefully — they do not all look the same, and that is
correct.** This table is protected by a policy, not by revoked privileges as
`kb_published` is, so the three commands fail in two different ways:

- [ ] Block 1 **raises**: `new row violates row-level security policy for table
      "pocket_recordings"`. The `with check` clause rejects it.
- [ ] Blocks 2 and 3 report **`UPDATE 0` / `DELETE 0`** and **raise nothing**.
      That is a pass, not a failure. The `using` clause filters the row out
      before the write is considered, so there is nothing to refuse — from the
      rep's side the row does not exist to be changed.

If block 2 or 3 reports **1** row, the boundary is broken. Stop.

### As the owner

Repeat the read block with the **owner's** uuid:

- [ ] `recordings_visible` = **1**.
- [ ] `leaked` = **1** — the owner can read their own transcript, which is the
      entire point of the table.

### Deactivation

`crm_active()` is in this policy, so it inherits §4's behaviour. Re-run the read
block for a **deactivated owner**:

- [ ] `recordings_visible` = **0**.

Clean up: `delete from pocket_recordings where id = 'rec_test_1';`

---

## 8. Rep pay (after REP-PAY-MIGRATION.sql)

**Do this before a rep sees a number.** `rep_payouts` is the first thing in this
database that is somebody's **wages**. A rep reading another rep's pay is worse
than a rep reading another rep's pipeline, and a rep *writing* one would be
paying themselves.

Seed two payouts as superuser, one for each rep:

```sql
insert into rep_payouts (id, rep_id, amount, paid_on, period, note) values
  ('po_a', '<REP-A-UUID>', 450, '2026-08-15', '2026-08', 'first half'),
  ('po_b', '<REP-B-UUID>', 900, '2026-08-15', '2026-08', 'SENTINEL-REP-B-PAY');
```

### As Rep A

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  select count(*) as payouts_visible from rep_payouts;              -- MUST be 1
  select count(*) as other_reps_pay  from rep_payouts
   where note like '%SENTINEL-REP-B-PAY%';                          -- MUST be 0
  select coalesce(sum(amount),0) as total_visible from rep_payouts; -- MUST be 450
rollback;
```

- [ ] `payouts_visible` = **1** — their own, and only their own.
- [ ] `other_reps_pay` = **0**.
- [ ] `total_visible` = **450**, not 1,350. A rep must not be able to work out
      the wage bill by summing what they can see.

### The write a rep must never make

Its own block — the first exception aborts a transaction.

```sql
-- a rep cannot pay themselves
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  insert into rep_payouts (id, rep_id, amount, paid_on)
    values ('po_self', '<REP-A-UUID>', 5000, '2026-08-20');   -- MUST raise
rollback;

-- nor edit one
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  update rep_payouts set amount = 5000 where id = 'po_a';     -- MUST report 0
rollback;
```

- [ ] The insert **raises** `new row violates row-level security policy for
      table "rep_payouts"`. This is the one that matters: paying yourself is
      impossible at the database, not behind a hidden button.
- [ ] The update reports **`UPDATE 0`** and raises nothing — the `using` clause
      filters the row out before the write is considered, so from a rep's side
      it does not exist to change. **That is a pass**, the same shape as
      `pocket_recordings` in §7 and unlike the privilege-revoked refusals in §6.

### As the owner

- [ ] `payouts_visible` = **2**, `total_visible` = **1,350**.
- [ ] The insert and the update both succeed.

### Deactivation

`crm_active()` is in the policy, so re-run Rep A's read block for a deactivated
rep:

- [ ] `payouts_visible` = **0**. Their pay history survives in the table — it is
      their access that ends, not the record.

Clean up: `delete from rep_payouts where id in ('po_a','po_b');`

---

## 9. Content Studio (after CONTENT-RLS.sql)

**Sections 1–8 verify policies that shipped inside a migration in this repo.
These eight tables were created by hand, outside any migration, and shipped
across two feature PRs with no RLS proof. When the policies were finally read,
on 23 Aug 2026, this is what was there:**

```
policyname        <table>_auth_all
roles             {authenticated}
cmd               ALL
using             true
with check        true
```

**`true` restricts nothing.** RLS was on and a policy existed on every one of
the eight — so every count-based check passed — while every authenticated
session on the install had full SELECT, INSERT, UPDATE and DELETE on all of
them. Anonymous callers were correctly locked out; that was verified separately
and was never the problem.

The eight, and what a rep could reach:

| table | what was exposed |
|---|---|
| `content_brand_context` | pricing, offers, positioning |
| `content_posts` | unpublished marketing, and `performance` figures |
| `content_research` | competitor material and why it worked |
| `content_usage` | what the business spends on AI, month by month |
| `content_assets` | files belonging to the above |
| `content_ideas`, `content_insights`, `content_mining_state` | later-phase tables, open rather than idle |

The Studio tab is hidden from reps in the app. That is not what was protecting
these tables and it never was — ROLES.md says it in as many words: **a hidden
tab is not a locked door.** A rep holds a valid session, and the publishable key
ships in the client bundle on every page load, so reaching these needed `curl`,
not the UI.

### Why every previous check passed

Because they all counted. `select count(*) from pg_policy` returns **1** for a
table that is wide open and **1** for a table that is locked down. A permissive
`true` policy is indistinguishable from a correct one unless you read the
**expression**.

> **Read expressions, never counts.** Any RLS verification in this repo —
> including a future section added to this file — must call
> `pg_get_expr(polqual, polrelid)` and look at what comes back. This is now a
> standing rule in CLAUDE.md, and the verification block at the bottom of
> `CONTENT-RLS.sql` is written to it.

### What "tenant" means here

This CRM is **not** multi-tenant in one database. `ENGINEERING.md` §6:
per-client installs are separate deployments against separate Supabase
projects. There is no `tenant_id` and nothing below partitions by one. The
isolation being proved is **owner versus rep inside an install**, which is the
boundary a customer's sales team actually sits on.

### The correct end state

Every one of the eight carries `<table>_owner`, which is
`pocket_recordings_owner` character for character — same helpers, same
structure, no `to` clause, so it applies to PUBLIC exactly as the reference
does:

```
using       (no_users() OR (crm_active() AND is_owner()))
with check  (no_users() OR (crm_active() AND is_owner()))
```

One expression to audit rather than nine.

### Step 1 — apply, and read what the file tells you

Run **`CONTENT-RLS.sql`**. Read its header first. It creates no tables and no
columns; per table it **drops the permissive policy, then creates the
owner-scoped one**, and that order is the whole fix — permissive policies
combine with `OR`, so a surviving `true` beside a correct policy re-opens the
table however right the new one looks.

The file ends with a verification block that reads expressions and **raises**
rather than leaving you to interpret a table:

- [ ] It reports `CONTENT-RLS OK: 8 tables, RLS on, one owner-scoped policy
      each, no permissive expressions, all identical to
      pocket_recordings_owner.` (This is a `raise notice` — in the Supabase SQL
      editor it appears under **Logs**, not in the results grid.)
- [ ] The result grid underneath shows nine rows — the eight plus
      `pocket_recordings` — every `using_expr` identical, none of them `true`.

**Measured on the ProyTech install, 23 Aug 2026 — this passed.** All eight
tables carry `content_<table>_owner` with
`(no_users() OR (crm_active() AND is_owner()))` on both `using` and
`with_check`, identical to `pocket_recordings_owner`. No `true` expressions
survived and no `_auth_all` policy was left behind.

> **A limitation in check 3e, which matters more on a customer install than it
> did here.** 3e compares the eight against the **live** `pocket_recordings`
> policy. If `pocket_recordings` has no policy — an install that has not run
> `POCKET-MIGRATION.sql`, which is every install that did not buy Pocket — that
> check downgrades to a `NOTICE` and is **skipped**. The run still passes on 3a
> to 3d, so nothing permissive can survive, but "OK" on such an install is
> strictly weaker than "OK" was here: it proves the eight are not `true`, not
> that they are the *right* expression.
>
> The cheap mitigation, if you are verifying an install without Pocket: the
> eight must at minimum be identical **to each other**. Read the section 4 grid
> and confirm every `using_expr` matches, then compare one of them by eye to
> the expression printed above. Strengthening 3e to fall back to a
> self-consistency check is on the follow-up list.

**If it raises, it did not take.** The message names the tables. The four ways
it can fail are: RLS switched off, an expression still `true`, more than one
policy on a table (two permissive policies `OR` together, so "one correct plus
one leftover" is no fix at all), or an expression that differs from
`pocket_recordings`.

### Step 2 — seed something a rep must not see

As superuser. The sentinels stand in for the material that ends the product if
it leaks:

```sql
insert into content_brand_context (category, key, value, active, sort_order)
  values ('offer','pricing','SENTINEL-FLOOR-we-never-go-below-nine-thousand',true,0);

insert into content_research (source_type, raw, why_it_worked, used)
  values ('swipe','SENTINEL-COMPETITOR-teardown','their hook does the work',false);

insert into content_posts (week_of, mix_class, surface, hook, concept, status)
  values (current_date, 'proytech', 'linkedin',
          'SENTINEL-UNPUBLISHED-HOOK', 'not out yet', 'draft');

insert into content_usage (provider, operation, units, est_cents)
  values ('anthropic','slate',12345,4242);
```

(`content_assets` needs a `post_id`; seeding it is optional — the count check
below is what matters, and an empty table still proves the policy denies.)

### As a rep

This is the block that proves the fix, because it is the exact access the
`true` policy was granting.

```sql
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;

  select count(*) as brand_visible    from content_brand_context;  -- MUST be 0
  select count(*) as posts_visible    from content_posts;          -- MUST be 0
  select count(*) as research_visible from content_research;       -- MUST be 0
  select count(*) as usage_visible    from content_usage;          -- MUST be 0
  select count(*) as assets_visible   from content_assets;         -- MUST be 0
  select count(*) as ideas_visible    from content_ideas;          -- MUST be 0
  select count(*) as insights_visible from content_insights;       -- MUST be 0
  select count(*) as mining_visible   from content_mining_state;   -- MUST be 0

  -- and no sentinel is reachable by any route open to a rep
  select count(*) as leaked from (
    select value  as t from content_brand_context
    union all select raw   from content_research
    union all select hook  from content_posts
  ) x where x.t like 'SENTINEL-%';                                 -- MUST be 0

  -- the spend of the business, by any path
  select coalesce(sum(est_cents),0) as spend_visible from content_usage;  -- MUST be 0

  select is_owner();                                               -- MUST be false
rollback;
```

- [ ] All eight counts are **0**. This is the same number a rep gets from
      `pocket_recordings` and `meeting_logs`, from the same policy expression.
- [ ] `leaked` = **0**.
- [ ] `spend_visible` = **0**. Note this is an **aggregate** — a rep who could
      not list the rows but could still `sum()` them would be reading company
      money, and the count check alone would not catch it.
- [ ] `is_owner()` = **false**.

**Run this block before applying `CONTENT-RLS.sql` if you want to see the bug
rather than take my word for it.** Same query, same identity, run either side of
the change.

### What it actually returned, ProyTech install, 23 Aug 2026

Measured with a non-owner uuid. These are observed values, not expectations:

| | brand | posts | research | usage_rows | assets | ideas | insights | mining | spend_cents | is_owner |
|---|---|---|---|---|---|---|---|---|---|---|
| **before** | **68** | **4** | 0 | **1** | 0 | 0 | 0 | 0 | **4** | false |
| **after** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | false |

**Read the caveat before you read the result.** Only **three** of the eight
tables had rows at the time — `content_brand_context` (68),
`content_posts` (4) and `content_usage` (1, holding 4 cents). Those three are
what actually demonstrated the fix: a non-owner could read 68 rows of pricing
and positioning, four unpublished posts, and the month's AI spend, and after the
change reads none of them.

The other five returned 0 **both before and after because they were empty**.
Their zeros in the "after" row prove nothing on their own. What covers them is
check 3e — their policy expression is byte-identical to the three that were
demonstrated — not an observed change. That distinction is the same one this
whole section exists to make: a number that looks like a pass is not a pass
until you know what produced it.

`is_owner()` returned **false** in both runs, which is the point. The identity
did not change. Only what it could reach did.

### Confirmed against the app

Signed in as the owner immediately afterwards: Slate 4, Today 1, Brand 68, spend
chip reading `$0.04 / $20.00`. Nothing broke, which is what the code walk
predicted — the only client-side caller is a screen only an owner can open, and
the three routes use the service key.

### The writes a rep must not be able to make

Each in its **own** block. The first failure aborts the transaction, so running
them together reports `current transaction is aborted` for the rest and proves
nothing.

```sql
-- 1. a rep cannot insert brand context (i.e. cannot edit what gets generated)
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  insert into content_brand_context (category, key, value)
    values ('offer','rep-wrote-this','x');
rollback;

-- 2. a rep cannot change a post
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  update content_posts set status = 'approved' where hook = 'SENTINEL-UNPUBLISHED-HOOK';
rollback;

-- 3. a rep cannot delete research
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  delete from content_research where raw = 'SENTINEL-COMPETITOR-teardown';
rollback;

-- 4. a rep cannot write the spend ledger
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','<REP-A-UUID>','role','authenticated')::text, true);
  set local role authenticated;
  insert into content_usage (provider, operation, units, est_cents)
    values ('anthropic','forged',1,1);
rollback;
```

**These do not all fail the same way, and that is correct** — the same
distinction §7 draws:

- [ ] Blocks 1 and 4 **raise**: `new row violates row-level security policy`.
      The `with check` clause refuses the insert.
- [ ] Blocks 2 and 3 report **`UPDATE 0` / `DELETE 0`** and **raise nothing**.
      That is a pass. The `using` clause filters the row out before the write is
      considered, so from the rep's side there is nothing there to change.

If block 2 or 3 reports **1** row, the boundary is broken. Stop.

### As the owner

Repeat the read block with the **owner's** uuid:

- [ ] `brand_visible`, `posts_visible`, `research_visible`, `usage_visible` are
      all **≥ 1**.
- [ ] `leaked` = **3** — the owner reads their own pricing, their own research
      and their own unpublished hook, which is the entire point of the tables.
- [ ] `spend_visible` = **4242**.

### Deactivation

`crm_active()` is in the policy, so it inherits §4's behaviour. Re-run the read
block for a **deactivated owner**:

- [ ] All eight counts are **0**. An owner you switched off yesterday cannot
      read your pricing today.

### The app after this lands

Nothing in it changes, and that was checked by walking the code rather than
assumed:

- The only client-side caller of any of these tables is
  `src/ContentStudio.jsx`. `content_usage`, `content_assets` and the three
  later-phase tables have no client code path at all.
- That screen renders only when the app already believes you are an owner
  (`canOpen` → `CONTENT_STUDIO_ON && !isRep`). Every branch of that agrees with
  `is_owner()`: owner yes, rep no, fresh install yes via `no_users()`,
  deactivated no via `crm_active()`. There is no state where the app opens the
  Studio for someone Postgres then refuses.
- `api/content-slate.js`, `api/content-regenerate.js`, `api/content-usage.js`
  and the weekly cron all use `SUPABASE_SERVICE_KEY`, which bypasses RLS by
  design, exactly as `api/pocket-hook.js` does. They are unaffected.
- Nothing in the app relies on a rep reaching these tables. There is no
  rep-facing content feature and no published surface like `kb_published`.

**One failure mode to know about.** If `is_owner()` ever returns false for
someone the app thinks is an owner, the Studio renders and shows **nothing** —
RLS filters SELECTs silently, so it returns `[]` rather than an error, and the
Brand tab looks exactly like a fresh install. Writes would throw, so it would
not stay quiet for long. The distinguisher is the owner block above: if
`brand_visible` is ≥ 1 in SQL but the screen is empty, that is an identity
mismatch, not an empty table.

### What this section does NOT prove

Nothing about the **routes**. `api/content-slate.js`,
`api/content-regenerate.js` and `api/content-usage.js` all use the service key,
which bypasses RLS by design. What stands between a stranger and those is
`guard({requireOwner:true})` and, on the cron leg, a `timingSafeEqual` against
`CRON_SECRET` — verified in `tests/content.mjs` and `tests/contentroutes.mjs`,
and written down in API-AUDIT.md. RLS governs the **browser**, which is the only
thing it can govern.

Clean up:

```sql
delete from content_brand_context where value like 'SENTINEL-%';
delete from content_research      where raw   like 'SENTINEL-%';
delete from content_posts         where hook  like 'SENTINEL-%';
delete from content_usage         where units = 12345;
```

---

## What this test cannot prove

`app_settings` is a single row per key holding team-wide blobs — tasks,
invoices, transactions, the huddle. **It cannot be split by RLS.** Any signed-in
person who is listed and active can read it. Reps don't get those tabs, which
sidesteps it in practice, but a tab being hidden is not a security boundary.
Same for `dealValue`: it lives inside the jsonb of a lead the rep legitimately
owns, so hiding it is a UI decision, not a database one. Both are stated in
BUILD-NOTES.md. If either needs to be a real boundary, the next step is a
`tasks` table with its own policies and moving deal money to columns the rep's
policy doesn't select.

And §7 proves the **browser** boundary on `pocket_recordings`, which is the only
boundary RLS can prove. `api/pocket-hook.js` writes that table with
`SUPABASE_SERVICE_KEY`, which bypasses RLS by design — Pocket is the caller and
there is no user session to check. What stands between a stranger and a write is
the HMAC signature on the delivery, not a policy, so it is verified in
`tests/pockethook.mjs` rather than here. Rotate that secret the way you would
rotate a password, and never let the endpoint run without one: it is written to
refuse rather than to fall back to trusting the caller.

One more, from the Playbook. `kb_ai_context()` means a REP's assistant can
never be given a draft — their browser cannot obtain the text in the first
place, so it does not exist in their process to send. But Postgres cannot stop
**your own** browser from sending **your own** drafts to **your own**
assistant: you are authorised to read that text, and the database cannot tell
"displaying it" from "putting it in a request". That last link is enforced by a
test asserting on what reaches the network, not by a policy. It is stated in
ROLES.md → The honest limits alongside `dealValue`, and it is the honest shape
of the guarantee rather than the marketing version.
