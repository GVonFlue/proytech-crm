# DEPLOY.md — where every file goes, in order

Everything I sent you, and exactly where it belongs. Do these in order; each
step takes a couple of minutes. Steps 1–4 are the actual install; 5–6 are the
proof it worked.

> **Do not skip step 3.** The app code alone does nothing — the permissions
> live in the database, and until `MIGRATION.sql` has run, the CRM behaves
> exactly as it does today (which is the intended safe fallback, not success).

---

## 0. What you have and where each piece lives

| File | Goes to | What it is |
|---|---|---|
| `src/App.jsx` | **GitHub repo** → `src/App.jsx` (replaces existing) | The app. Everything is in here. |
| `src/lib/supabase.js` | **GitHub repo** → `src/lib/supabase.js` (replaces existing) | Auth + database layer. |
| `MIGRATION.sql` | **Supabase SQL Editor** (paste + run). Optionally also commit to the repo root as a record. | Tables, columns, permissions, leaderboard function. |
| `BUILD-NOTES.md` | Repo root (documentation) | What changed, what's assumed, what isn't enforced. |
| `ROLES.md` | Repo root (documentation) | One-page plain-English map of who sees what. |
| `VERIFY-RLS.md` | Repo root (documentation) | The manual permission test. Run it before a rep logs in. |
| `VERIFY-CLICK.md` | Repo root (documentation) | Ten clicks to confirm the build end to end. |
| `tests/` (3 files) | Repo root → `tests/` | Optional. The signed-in render tests. Not part of the app. |

The `.md` files and `tests/` change nothing at runtime — they're there so the
next person (or the next session) doesn't have to guess. Only the two files in
`src/` affect the deployed app.

---

## 1. Put the two code files in GitHub

**Repo:** https://github.com/GVonFlue/proytech-crm (branch `main`)

Unzip `proytech-crm-changed-files.zip` first — the folder structure inside it
mirrors the repo, so you can match it up file by file.

### Route A — GitHub in the browser (no tools needed)

1. Open https://github.com/GVonFlue/proytech-crm/upload/main/src
   → drag in **`App.jsx`** (from the zip's `src/` folder).
2. Open https://github.com/GVonFlue/proytech-crm/upload/main/src/lib
   → drag in **`supabase.js`** (from the zip's `src/lib/` folder).
3. Open https://github.com/GVonFlue/proytech-crm/upload/main
   → drag in `MIGRATION.sql`, `BUILD-NOTES.md`, `ROLES.md`, `VERIFY-RLS.md`,
   `VERIFY-CLICK.md`, `DEPLOY.md`.
4. Open https://github.com/GVonFlue/proytech-crm/upload/main/tests
   → drag in the three `tests/` files (optional).

On each screen: commit message → **"Sales team + commissions"** → choose
**Commit directly to the `main` branch** → **Commit changes**.

Uploading a file with a name that already exists **replaces** it — that's what
you want for `App.jsx` and `supabase.js`. Drag the *files themselves*, not the
zip.

### Route B — git on your machine

```bash
git clone https://github.com/GVonFlue/proytech-crm.git
cd proytech-crm
git checkout -b sales-team-commissions
# unzip the delivered zip over this folder, keeping the paths
unzip -o ~/Downloads/proytech-crm-changed-files.zip -d .
npm install && npm run build      # sanity check: must exit 0
git add -A && git commit -m "Sales team + commissions"
git push -u origin sales-team-commissions
```

Then open the PR link GitHub prints and merge it into `main`. (I committed
exactly this in my sandbox but couldn't push — no GitHub credentials there.)

### Then: let Vercel redeploy

If the Vercel project is connected to this repo, pushing to `main` triggers a
production deploy automatically. Watch it at
https://vercel.com/dashboard → your CRM project → **Deployments**. Wait for
**Ready** before step 3. If it's not auto-connected, hit **Redeploy** on the
latest deployment.

**No environment variables change.** Nothing new was added to `.env` or Vercel
settings, and `package.json` was not touched — so there are no new dependencies
to install.

---

## 1b. A PREVIEW URL IS NOT A TEST ENVIRONMENT

**Read this before you click a preview link.**

Vercel builds a preview deployment for every branch and every pull request. It
has its own URL, and it looks like a safe place to try something.

**It is not.** A preview reads the same environment variables as production,
which means it points at **the same Supabase database**. There is one database.

So on a preview:

- Editing a lead edits the real lead.
- Logging a payment logs a real payment.
- Running a migration screen migrates real data.
- Deleting something deletes it.

Nothing is sandboxed and nothing is undone when you close the tab.

That is not always bad — it is sometimes exactly what you want, and it is how
the payment classification screen fixed a real client's balance before its code
had even been merged. But it means **"I'll just try it on the preview" is the
same sentence as "I'll just try it in production"**, and it should be said that
way.

Two practical consequences:

1. **Take a backup before trying anything on a preview** that writes — same
   backup as §2 below.
2. **A preview can write data that the merged app cannot yet read.** If a branch
   adds a field and you use the preview, that field is now in your database
   while `main` knows nothing about it. Merge the branch or expect the value to
   sit there unread.

If you ever want a genuine sandbox, it needs a second Supabase project and a
second set of environment variables on the preview environment. There is no such
thing today.

---

## 2. Take a backup first (30 seconds, worth it)

In the live CRM: **Settings → Backup & Restore → Export full backup (JSON)**.
Keep the file. Nothing in this build deletes data, but a restore point costs
you nothing.

---

## 3. Run the SQL in Supabase

1. Go to https://supabase.com/dashboard/projects and open the project this CRM
   points at (the one whose URL is in `VITE_SUPABASE_URL` in Vercel).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `MIGRATION.sql`, copy the **whole file**, paste it in, hit **Run**.
4. Expect **Success. No rows returned**. It is idempotent — if you run it twice,
   nothing happens the second time.

Quick confirmation, in the same editor:

```sql
select table_name from information_schema.tables where table_name = 'crm_users';
select column_name from information_schema.columns
 where table_name = 'leads' and column_name in ('owner_id','pool');
select proname from pg_proc where proname in ('crm_whoami','crm_leaderboard','is_owner');
```

You should get: one table, two columns, three functions.

**If you get an error mentioning `app_settings` does not exist**, your settings
table has a different name — tell me what `select table_name from
information_schema.tables where table_schema='public';` returns and I'll adjust
that one block. Everything else will already have applied.

---

## 4. Two Supabase Auth settings (required for adding people)

Dashboard → **Authentication** → **Sign In / Providers** → **Email**:

- **Enable Email provider** → ON.
- **Confirm email** → **OFF**.

Why: the app creates a new hire's login through Supabase's signup endpoint and
needs the returned user id to write their `crm_users` row. With email
confirmation ON, Supabase withholds that id and the app will tell you so
instead of half-creating someone.

While you're there, check **Authentication → URL Configuration → Site URL** is
your real CRM domain — that's where the "set your password" email sends people.

---

## 4b. Pocket AI webhook (only if you use Pocket)

Skip this whole section if you don't. Nothing else depends on it.

**In Pocket**, create a webhook pointing at:

```
https://<your-crm-domain>/api/pocket-hook
```

Pocket shows you a **signing secret** when the webhook is created. Copy it.

**In Vercel** → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `POCKET_WEBHOOK_SECRET` | the signing secret Pocket showed you |

Then **redeploy** — Vercel only picks up new environment variables on a build.

`SUPABASE_SERVICE_KEY` is already set (the rate limiter uses it). Run
`POCKET-MIGRATION.sql` first if you haven't; without the table every delivery
returns 500 and Pocket gives up after three tries.

### Importing recordings that predate the webhook

Optional, and only needed once. Add a second variable:

| Name | Value |
|---|---|
| `POCKET_API_KEY` | your `pk_…` key, from Pocket's API key screen |

That key is for **calling** Pocket's API. It has nothing to do with verifying
webhooks — those use `POCKET_WEBHOOK_SECRET` — and the webhook works without it.

Then **Settings → Pocket → Import recent recordings**. It pulls your 20 most
recent, one at a time, and says what happened to each. Running it again is safe:
a recording already here is refreshed rather than duplicated, and one you have
finished with stays finished. Only an owner can run it — a rep gets a 403 from
the server, not just a hidden button.

### Two things that will bite

**Without the secret the endpoint refuses everything**, with a 503, on purpose.
Pocket is the only caller and there is no login to check, so that signature is
the entire authentication — falling back to accepting unsigned deliveries would
turn this into an open write endpoint into your CRM. If recordings are not
arriving, check this variable first.

**A webhook created before Pocket added signing secrets sends unsigned
deliveries**, and those are refused too. Their docs say to rotate or recreate
the webhook; do that rather than looking for a setting to turn the check off.
There isn't one.

### Checking it works

Pocket's webhook screen has a **test delivery** button. A working setup returns
**200**. A **401** means the secret does not match; a **503** means it is not
set; a **500** means the migration has not been run.

---

## 5. First run inside the CRM

1. Sign in as yourself. **Nothing looks different yet** — that's correct.
2. **Settings → Team → "Make me the owner."** You're now Owner; everything you
   see today stays exactly as it is.
3. Add Logan the same way if he should be a second owner (**Add a person** →
   role **Owner**).
4. **Add a person** → name, their **real email**, **Sales Rep**, commission %,
   tick their pools (**+ New pool** to create one, e.g. `Inbound`), **Create
   login**. Copy the temporary password it shows you, or hit **Send password
   email** so they set their own.
5. Put work in front of them: open a lead → **Qualifying** → set **Owner** to
   that rep. For unclaimed work, leave the owner as `ProyTech` and set
   **Lead pool** to one of their pools — they'll see it under **Leads → Pool**
   and can **Claim** it.
6. Per-rep tabs, their monthly conversion goal, and Deactivate all live in
   **Settings → Team → (click the person)**.

Sign-in note: everyone new signs in with their **real email address**. Your
existing bare-username login still works — nothing to change.

---

## 6. Verify before you let a rep in

- **`VERIFY-CLICK.md`** — ten clicks, about five minutes. Confirms the rep view,
  commission states, the owner queue and the leaderboard all behave.
- **`VERIFY-RLS.md`** — the one that matters. Two private/incognito windows plus
  a copy-paste SQL block that impersonates a rep and proves Postgres itself is
  refusing to hand over other people's leads. **If a rep can see everything,
  stop and tell me.**

Optional, if you have Node on your machine:

```bash
npm install --no-save jsdom
node tests/run.mjs        # expect: 53 passed, 0 failed
```

---

## 7. If something looks wrong

| Symptom | Cause | Fix |
|---|---|---|
| No **Leaderboard** tab | Install had a saved module list; it's switched on once automatically on the owner's next load | Reload as owner; or **Settings → Sections → Leaderboard** |
| Leaderboard says "needs the database function" | `MIGRATION.sql` hasn't run (or only partly) | Re-run step 3 |
| "Supabase created the login but did not return a user id" | **Confirm email** is ON | Step 4, then add the person again |
| A rep sees everything | RLS not applied | Re-run step 3, then re-run `VERIFY-RLS.md` §3 |
| A rep sees nothing at all, not even pool leads | They have no pools, or their lead's `owner_id` is empty | Settings → Team → tick a pool; re-open a lead and re-set its Owner (that re-stamps `owner_id`) |
| Someone signs in and lands in an empty app | They have a Supabase login but no **Team** entry | Settings → Team → Add a person with that same email |
| You lock yourself out of Settings | Your own row got set to Sales Rep | Supabase → SQL Editor: `update crm_users set role='owner', active=true where email='you@…';` |

---

## 8. Rollback

The app is two files. Revert the commit in GitHub (**Commits → the commit →
Revert**) and Vercel redeploys the old build; the CRM works exactly as before,
because the old code ignores `owner_id`, `pool` and `crm_users` entirely.

The SQL is additive — nothing is dropped or rewritten — so it can be left in
place. If you truly want the database back as it was:

```sql
drop policy if exists leads_all on leads;
alter table leads disable row level security;
alter table crm_users disable row level security;
alter table app_settings disable row level security;
-- and, only if you want the people gone too:
-- drop table crm_users cascade;
```
