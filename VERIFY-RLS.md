# VERIFY-RLS.md — prove the permissions, don't take my word for it

Row Level Security cannot be tested from jsdom. It lives in Postgres, so it has
to be verified against the real database with real logins. This is that test.
**If a rep sees everything, the build is not shippable — stop and say so.**

Budget 15 minutes for §§1–8, and ten more for §9. Do it once per install, right
after running `MIGRATION.sql`.

> **§9 is not optional on an install you sell.** The five Content Studio tables
> were created by hand rather than by a migration, and shipped with no RLS proof
> at all. On our own install, where both logins are owners, that costs nothing.
> On a customer's install a rep has a login and those tables hold pricing,
> offers and the monthly spend of the business. Start at §9 step 1, which tells
> you whether the boundary exists yet.

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

**This section is different from the eight above it, and it is worth knowing
why before you start.** Sections 1–8 verify policies that shipped inside a
migration in this repo. The five content tables were created **by hand**,
outside any migration, and shipped across two feature PRs with no RLS proof at
all. So step 1 here is not a formality — it is a genuine question with an answer
neither of us knows yet.

The five:

| table | what a rep must never read |
|---|---|
| `content_brand_context` | pricing, offers, positioning |
| `content_posts` | unpublished marketing, and `performance` figures |
| `content_research` | competitor material and why it worked |
| `content_usage` | what the business spends on AI, month by month |
| `content_assets` | files belonging to the above |

**Why this matters more than the sections above it.** On the install we run
ourselves both logins are owners, so the gap costs nothing. On an install we
*sell*, a rep has a login, and every table above is company money by ROLES.md's
definition. Until these policies exist that promise is kept by the screen —
which ROLES.md itself is explicit is a UI decision, not a boundary.

**What "tenant" means here.** This CRM is not multi-tenant in one database:
ENGINEERING.md §6 states that per-client installs are separate deployments
against separate Supabase projects. There is no `tenant_id` and nothing below
partitions by one. The isolation being proved is the one that exists *inside* an
install — owner versus rep — which is the boundary a customer's sales team
actually sits on.

### Step 1 — find out whether there is anything to verify

Run this **first**, as superuser in the SQL Editor. It is the whole reason this
section is ordered this way:

```sql
select c.relname,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
 where c.relname in ('content_brand_context','content_posts','content_research',
                     'content_usage','content_assets')
 group by c.relname, c.relrowsecurity
 order by c.relname;
```

- [ ] Five rows. If a table is **missing** from the result it does not exist —
      stop, because the rest of this section is about tables you do not have.
- [ ] `rls_on` is **true** for all five.
- [ ] `policies` is **1** for all five.

**If `rls_on` is false or `policies` is 0 anywhere, the boundary does not exist
yet.** That is not a bug in the app; it is a table that was created without one.
Run **`CONTENT-RLS.sql`**, read its header first, then re-run the query above
before continuing. It creates no tables and no columns — it switches RLS on and
adds one policy per table.

**A table with a policy and RLS switched off enforces nothing**, which is why
both columns are checked rather than just the policy count.

### Step 2 — the policies are the same expression, not five lookalikes

```sql
select polrelid::regclass as tbl, pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy
 where polrelid in ('content_brand_context'::regclass, 'content_posts'::regclass,
                    'content_research'::regclass, 'content_usage'::regclass,
                    'content_assets'::regclass, 'pocket_recordings'::regclass)
 order by 1;
```

- [ ] **Six** rows, and every `using_expr` is **identical**.

Same check §7 makes about `pocket_recordings` and `meeting_logs`, for the same
reason: five policies that look alike are five things to audit and five places
to get it wrong. One shape, reused, is one thing to be right about.

### Step 3 — seed something a rep must not see

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

- [ ] All five counts are **0**. This is the same number a rep gets from
      `pocket_recordings` and `meeting_logs`, from the same policy expression.
- [ ] `leaked` = **0**.
- [ ] `spend_visible` = **0**. Note this is an **aggregate** — a rep who could
      not list the rows but could still `sum()` them would be reading company
      money, and the count check alone would not catch it.
- [ ] `is_owner()` = **false**.

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

- [ ] All five counts are **0**. An owner you switched off yesterday cannot read
      your pricing today.

### What this section does NOT prove

The three later-phase tables — `content_ideas`, `content_insights`,
`content_mining_state` — are **not** covered, by `CONTENT-RLS.sql` or by this
section. Nothing in the codebase reads or writes them yet, and a policy on a
table with no code path is a claim nobody is testing. They are exactly as
unguarded as the five above were before this. Check for yourself:

```sql
select relname, relrowsecurity from pg_class
 where relname in ('content_ideas','content_insights','content_mining_state');
```

When the phase that uses them lands it brings its own policies and its own
subsection here — CLAUDE.md now requires that of any new table.

Nor does this prove anything about the **routes**. `api/content-slate.js`,
`api/content-regenerate.js` and `api/content-usage.js` all use
`SUPABASE_SERVICE_KEY`, which bypasses RLS by design, exactly as
`api/pocket-hook.js` does. What stands between a stranger and those is
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
