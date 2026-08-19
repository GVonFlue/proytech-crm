# VERIFY-RLS.md — prove the permissions, don't take my word for it

Row Level Security cannot be tested from jsdom. It lives in Postgres, so it has
to be verified against the real database with real logins. This is that test.
**If a rep sees everything, the build is not shippable — stop and say so.**

Budget 15 minutes. Do it once per install, right after running `MIGRATION.sql`.

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

One more, from the Playbook. `kb_ai_context()` means a REP's assistant can
never be given a draft — their browser cannot obtain the text in the first
place, so it does not exist in their process to send. But Postgres cannot stop
**your own** browser from sending **your own** drafts to **your own**
assistant: you are authorised to read that text, and the database cannot tell
"displaying it" from "putting it in a request". That last link is enforced by a
test asserting on what reaches the network, not by a policy. It is stated in
ROLES.md → The honest limits alongside `dealValue`, and it is the honest shape
of the guarantee rather than the marketing version.
