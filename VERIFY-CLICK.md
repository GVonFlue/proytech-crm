# VERIFY-CLICK.md — ten clicks, in order

1. Sign in as yourself → **Settings → Team → "Make me the owner"** → the people list appears with you on it as Owner.
2. **Add a person** → name, real email, Sales Rep, 10%, tick a pool, **Create login** → note the temporary password shown.
3. Still as owner, open any lead → **Qualifying** → set **Owner** to that rep; open another → set **Lead pool** to the pool you ticked, owner `ProyTech`.
4. Private window → sign in as the rep → sidebar shows **Dashboard, Leaderboard, Follow-Up, Tasks, Activity, Pipeline, Leads** and nothing else.
5. Rep → **Leads** → only their lead under **Mine**, no **All** button; **Pool** shows the pooled lead → hit **Claim** → it moves to Mine.
6. Rep → open their lead → the **Deal** section is there and shows **that lead's** value, because they are paid on it (`ROLES.md`) — what must not appear is any **company-wide** figure: revenue, MRR, forecast, pipeline totals, or anyone else's deal → hit **Convert to Client** → a short celebration appears and the counter jumps.
7. Rep → **Dashboard** → **Pending** shows 10% of that deal, **Earned** shows $0, and **Your rank** shows their position.
8. Owner window → **Dashboard** → **Awaiting onboarding** names the rep and the client → **Got it** clears it.
9. Owner → **Leads → All** → open that client → **Commission** section → **Approve commission** → state flips to Earned with your name and date; **Void** removes it from the rep's counts (reload the rep window to see both).
10. Either window → **Leaderboard** → reps ranked by clients closed, own row highlighted, crown on #1, **no owners and no dollars** on it.

---

# The booking path — six clicks, and what real Google actually did

A rep books through **BK**, not through the MEETINGS scheduler; the scheduler
is an owner control. The two used to be separate paths that wrote different
records — `doSchedule` stamped no `disp` while `dayStats` counted a booking as
`disp === 'BK'`, so a scheduler booking earned the rep nothing while
`bookingOutcomes` still counted the meeting. Two numbers on his own profile
disagreeing. One path now (#68).

1. Rep → open a lead → the composer is **already open**, no button to press.
2. **BK Booked** → the brief appears: what they want, who decides, what they
   have now, mobile, email. It refuses to save while any of them is blank.
3. Pick a **day chip**, then a **time chip** — two taps, no typing. The raw
   `datetime-local` field stays one tap away for "Thursday at 3:45".
4. **Log Call** → a meeting record exists with a real start, `dateUnknown:false`,
   and the owners tagged the way SO/HV/DNC already are.
5. The rep is told **in words on the record** — not in a toast — how many people
   the invite went to, or that none went and to text the owners instead.
6. The prospect's invite arrives from the **owner's** calendar, not the rep's.

## Verified against real Google — 24 Aug 2026

Booked on a throwaway lead, end to end, against the live Google account. Not a
stub, not a preview:

- **The invite arrived.**
- **It read well on a phone.**
- **The prospect-facing description was fine to send to a stranger** — which is
  the part no test can assert, because the failure is one of tone.

So `calendar-event.js`, the OAuth scope, `sendUpdates=all` and the attendee list
are all confirmed by a real invite landing in a real inbox.

## Not yet confirmed

**The ten-minute length.** `DEMO_MIN` landed in #68, after that booking was
made, so the invite tested above was the previous length. The script promises
ten minutes six times and `tests/repdefaults.mjs` reads that number out of
`SALES-SCRIPT.md` — but a passing test proves the code agrees with the script,
not that Google wrote ten minutes on the invite. **One more booking closes it:
open the invite and read the time range.**
