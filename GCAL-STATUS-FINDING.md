# "Google Calendar isn't connected" on an account that is connected

Found during the hierarchy pass, 2026-08-21. **Not fixed in that PR** — it is a
behaviour bug, not paint, and it gets its own change so the before and after are
visible.

## What you see

The booking form warns that Google Calendar isn't connected, on the owner
account, after you connected it. Visiting **Settings** and coming back clears
it. A hard refresh while already signed in usually clears it too.

## Why

`src/App.jsx`:

```js
const refreshGcal = async () => { ... await apiPost('/api/google-status') ... };
useEffect(() => { refreshGcal(); ... }, []);      // ← once, at App mount
```

Three facts together:

1. **The effect runs once, on mount, with an empty dependency array.** React
   hooks run before the component's auth early-returns, so it fires while the
   app is still rendering the sign-in screen.
2. **`/api/google-status` requires a session** (`requireAuth: true` — it hands
   out the address of the Google account the whole install writes to, so this
   is correct and should stay). Called without a token it never reaches
   `loadGoogle()`, and the client reads no `connected` field: `gcal.connected`
   becomes `false`.
3. **App does not remount when you sign in.** The session lands in App's own
   state, so the same App instance re-renders — the `[]` effect never runs
   again, and nothing else calls `refreshGcal` except the Settings page.

So on any load that *starts signed out* — the normal case, since that is what a
sign-in is — the flag is decided before there is anyone to decide it for, and
stays wrong for the rest of the session. Loading with a session already restored
from storage races the other way and looks fine, which is why it is intermittent
rather than constant.

It is not per-account and not per-role: nothing here reads who you are. The
same install shows the same wrong answer to whoever loaded it signed-out.

## Fix

Re-fetch when the session appears rather than only at mount — the dependency
array is the bug:

```js
useEffect(() => { if (session) refreshGcal(); }, [session]);
```

with the URL-cleanup half staying on mount where it belongs. One line, plus a
test that asserts the status is fetched again after sign-in and not only before
it. The stub's new `__UID__` support (PR #30) makes that testable.

## Blast radius while unfixed

Cosmetic but load-bearing: the warning is what tells a rep whose calendar a
booking lands on. Booking still works — `createCalendarEvent` posts to
`/api/calendar-event` with its own auth and does not consult this flag — so the
warning is wrong, not blocking.
