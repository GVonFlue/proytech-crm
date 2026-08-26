# Google Calendar — one-time setup

You do these once. After that, meetings booked on a lead post automatically to
**admin@getproytech.com**'s calendar.

There are 3 parts: **A)** a Supabase table, **B)** a Google OAuth app, **C)** Vercel env vars.
Do them in order, then deploy the code.

---

## A. Supabase — add the token table (1 min)

Supabase dashboard → your project (`mqpswqiqhhitdcdugqsp`) → **SQL Editor** → run:

```sql
create table if not exists secrets (id text primary key, data jsonb);
alter table secrets enable row level security;
-- no policies on purpose: the browser key can't touch it; only the server (service role) can.
```

Then grab your **service-role key**: Supabase → **Settings → API** → copy the
`service_role` secret (NOT the publishable one). You'll paste it into Vercel in step C.

---

## B. Google Cloud — make an OAuth app (~10 min)

1. Go to **console.cloud.google.com**, signed in as **admin@getproytech.com**.
2. Top bar → **Create Project** → name it `ProyTech CRM` → Create, then select it.
3. Left menu → **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
4. **APIs & Services → OAuth consent screen**:
   - User type: **Internal** ← important. This means no Google review and the connection never expires. (Internal is available because getproytech.com is a Workspace.)
   - App name: `ProyTech CRM`, support email: your address, developer email: your address → Save.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `ProyTech CRM Web`
   - **Authorized redirect URIs → Add URI:**
     ```
     https://proytech-crm.vercel.app/api/google-callback
     ```
   - Create. Copy the **Client ID** and **Client secret** it shows you.

---

## C. Vercel — add env vars (2 min)

Vercel → **proytech-crm** → **Settings → Environment Variables**. Add these six:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | *(from step B5)* |
| `GOOGLE_CLIENT_SECRET` | *(from step B5)* |
| `GOOGLE_REDIRECT_URI` | `https://proytech-crm.vercel.app/api/google-callback` |
| `APP_URL` | `https://proytech-crm.vercel.app` |
| `SUPABASE_URL` | `https://mqpswqiqhhitdcdugqsp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(the service_role secret from step A)* |

> The service-role key is powerful — it only lives here on the server, never in the app.

---

## D. Deploy + connect

1. Upload the new files (see the chat message for the file list) and let Vercel build.
2. Open the CRM → **Settings → Google Calendar → Connect Google Calendar**.
3. Sign in as **admin@getproytech.com**, approve → you land back on the CRM showing
   **Connected — admin@getproytech.com**.
4. Open any lead → **Meetings** → book one. It appears on the lead and on the calendar.

### If "Connect" errors
- `no_refresh_token`: you approved before; just click Connect again (it forces a fresh grant).
- Redirect mismatch: the URI in step B5 must match `GOOGLE_REDIRECT_URI` exactly (no trailing slash).
- Stuck "not connected" when booking: re-check the six env vars, then Redeploy (env changes need a fresh build).

---

## Slot availability — reps can only book times that are actually free

A rep no longer types a time. They pick from a fixed lattice of half-hour slots
between 8am and 8pm, and a slot is only offered when **every** calendar we read
is empty there, or holds nothing but a **Banana**-coloured event.

**The rule is inverted on purpose.** Everything blocks unless it is explicitly
marked soft. There is no list of colours that block — there is one colour that
does not. An event nobody remembered to colour stays protected. The failure that
is acceptable is "a rep escalated a time that was actually free"; the one that is
not is "a rep booked over a real commitment".

That inversion also decides three edge cases you might expect to behave
otherwise. **All-day events block the whole day. Declined events still block.
Events marked "Free" rather than "Busy" still block.** Google's own soft signals
have been replaced by exactly one signal — the colour. Colour an exception
Banana rather than expecting the app to infer it.

### What to set

| Variable | Example | What it does |
| --- | --- | --- |
| `CALENDAR_IDS` | `primary,logan@getproytech.com` | Every calendar that decides whether a slot is free. Comma-separated; an id is an email address. `primary` is the connected account's own calendar. Defaults to `primary` alone. |
| `CALENDAR_TZ` | `America/Chicago` | The one zone every comparison happens in. Defaults to `America/Chicago`. |

Neither is `VITE_`-prefixed and neither should be — these are read on the server
only. See `_env.js` for why that prefix is not a stylistic choice.

**`CALENDAR_IDS` needs both people on it.** The demo is run by one person and
attended by another, so both sets of commitments have to clear. Listing only one
calendar produces a grid that is confidently wrong about the other.

### What the second person has to do

There is one Google connection per install and it is authorised as the owner.
Reading anybody else's calendar requires *them* to share it with the owner's
Google account:

1. Google Calendar → hover their calendar in the left sidebar → **⋮** →
   **Settings and sharing**
2. **Share with specific people or groups** → **Add people and groups**
3. Add the owner's Google account — the same address `/api/google-status`
   reports as connected
4. Permission: **See all event details**

**"See only free/busy (hide details)" is not enough.** That level strips the
colour, and the colour is the entire rule — every event would read as hard and
the grid would show a day with nothing on it.

They do **not** need to grant "Make changes to events". The booking is created on
the owner's calendar with the other person invited, which is how it already
worked, so no extra permission and no change to the guarded write path.

### No new OAuth scope

The existing grant (`calendar.events`) already reads and writes events on every
calendar the account can reach, so nothing here forces a reconnect.

Worth knowing *why*, because the obvious endpoint is the wrong one:
`freebusy.query` returns intervals and nothing else — no colour — so it cannot
express this rule at all, **and** it is not covered by `calendar.events` anyway.
The colour requirement steers us onto `events.list`, which we already have
consent for. There is also no calendar **picker** for the same reason in reverse:
enumerating calendars needs `calendarList` scope, adding it invalidates the
existing consent, and per the note in `_google.js` that 403s every Sheets read
until somebody reconnects. Configuration is cheaper than a dropdown.

### Verifying Banana is really colorId 5

`POST /api/calendar-probe` (owner only). It creates two events a year out at 4am
— one Banana, one uncoloured — reads both back, asserts, and deletes them. It
reports what actually came back rather than a pass/fail, and tells you if it
could not clean up after itself.

Run it once per install before trusting a grid. If `colorId` 5 is ever not
Banana, the failure is silent and dangerous in one direction: some *other*
colour becomes soft and reps book over it.

### Which control a rep actually books through

`WhenPicker`, in the disposition bar — a rep logs the call, marks **BK**, and
picks the day and time he agreed. Not `MeetingScheduler`: the composer's
"Meeting Booked" tab is filtered out for reps
(`ACT_TYPES.filter(t => !(rep && t.key === 'Booked'))`), so that control is the
owner's.

The availability lattice was first built into `MeetingScheduler` and did nothing
whatsoever on the screen it was for. Both surfaces now read through one
`useAvailability` hook so they cannot answer "is 3pm free" differently, and
`tests/slotgrid.mjs` navigates the rep's path deliberately.

For a rep marking BK the curated `DEFAULT_TIMES` list does not appear at all,
and neither does `+15` or "Another time…". Both made 3:45 bookable, and a grid
that can be bypassed is not a gate. They remain on the owner's controls, and on
a rep's **CB** (callback) — a callback is when a prospect said to ring back and
consumes nobody's calendar, so it is not gated.

### How long the event is

Ten minutes, from `DEMO_MIN` — the number the script promises the prospect six
times. The half-hour lattice is what gives Logan his gap between demos; the
meeting itself stays the length that was sold. Note this differs from the
owner's `MeetingScheduler`, which books the whole slot.

The instant comes from the SLOT, not from parsing the picked string. A zoneless
`YYYY-MM-DDTHH:MM` parsed with `new Date()` resolves in the *browser's* zone, so
a rep on a laptop set to the wrong zone would book an hour away from the slot
the check had just approved — the grid saying 3pm and the invite saying 4pm,
both looking right to whoever caused it.

### When Google is unreachable

The rep is never blocked. The full lattice renders, the grid says on its face
that nothing was checked, the chips are drawn differently, and the booking is
stamped `availabilityChecked: false`, which shows as **not checked** on the
meeting row. A booking that displaces a Banana block is stamped `displacedSoft`
and shows as **displaced a soft block** in the same place.

Note that "checked" means *verified at the moment of booking*: the grid is
re-read immediately before the event is created, and if that re-read fails the
booking is marked unchecked even if the grid was green a minute earlier.

### The race that remains

Google has no conditional create — no "insert only if this window is still
free". The re-read before booking narrows the window from "however long the
picker was open" to one round trip, and it closes the two-rep race for free,
because the booking we create lands on a calendar we read and carries no colour,
which makes it hard. What is left is the sub-second gap between that read and the
insert. It is not closable with this API.
