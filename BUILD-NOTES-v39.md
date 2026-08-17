# BUILD-NOTES — v39 · merged onto your live repo

**Do NOT use the v38 zip — it would have deleted your Meeting Log.** This is
built on top of commit `8eb80bc`, so nothing of yours is lost.

## What I found

You're deployed through **v36** and have since added a whole **Meeting Log**
module I didn't have: `src/MeetingLog.jsx`, `api/meeting-log.js`, and
`MEETING-MIGRATION.sql` with an owner-only `meeting_logs` table.

The reasoning in that migration is right, incidentally — transcripts hold pay
splits and candid client reads, and `app_settings` is readable by every active
user. Keeping them in their own table with owner-only RLS is the correct call.

Missing from the repo was everything in **v37 and v38**: the rate limiting and
the batch wipe. Those are merged in here.

## ⚠ Your test suite has been broken since Meeting Log shipped

`MeetingLog` calls `db.getMeetingLogs()` on mount, and **no test stub defined
it** — so every DOM suite threw `db.getMeetingLogs is not a function` before a
single assertion ran. Twenty-three suites, all silently dead.

The stub is fixed in this zip. Worth adding to your habit: when a component
calls a new `db.*` method, the stub needs it the same day, or the tests stop
telling you anything.

## Files — these are already merged, just upload them

| From the zip | Goes to |
|---|---|
| `App.jsx` | `src/App.jsx` |
| `MIGRATION.sql` | repo root (adds `api_hits`) |
| `api/*.js` | `api/` — `_guard.js` is new, the rest gain the guard |
| `tests/stub-supabase.js` | `tests/` — **this is the fix above** |
| `tests/guard.mjs` · `tests/import.mjs` | `tests/` |

Then run `MIGRATION.sql` in Supabase, and add **`SUPABASE_SERVICE_KEY`** to
Vercel if it isn't there.

## What the merge added

**Rate limiting** on all seven AI endpoints, including your new `meeting-log`
(30/ip, 900/day). Per-IP limits, a global daily cap that's the only thing
stopping a botnet, input-size caps, and a Supabase auth requirement. Internal
calls now attach the session token through one `apiPost` helper.

**Batch wipe** for test imports — filter to an import on the Recently added bar
and delete just that batch. Scoped to one batch id, owner-only, and it makes you
type the count.

**One de-duplication:** two definitions of "what counts as real contact" existed;
both now use `REACHED_TYPES`.

## Verification

Against **your** repo at `8eb80bc`: `npm run build` exits 0, and
**twenty-five suites, 606 checks, all passing** — the first time they've all run
since Meeting Log landed.

## Note on the test folder

Your suites live in `tests/` but write their bundle to `t/`. They work when run
from a `t/` copy; from `tests/` they fail on a path. Worth normalising, but I
left it alone rather than touch 25 files in a merge.
