// Proves, against the real Google API, the one fact the whole booking rule
// rests on: that Banana is colorId 5, and that an uncoloured event carries no
// colorId at all.
//
// WHY THIS IS AN ENDPOINT AND NOT A COMMENT
//
// "Banana is 5" was, until this ran, a thing I remembered. The palette is not
// in our scopes to read (colors.get wants calendar.readonly), the constant is
// load-bearing in both directions, and being wrong about it fails in the worst
// possible way: if 5 is not Banana, then real Banana blocks read as hard —
// annoying, visible, fine. But if some OTHER colour is 5, every event wearing
// it becomes soft and reps book over it. A remembered constant guarding that is
// not good enough.
//
// So it creates two events a year out at 4am, reads them back, asserts, and
// deletes them. Both directions of the inversion, end to end, in a place
// nobody's day is disturbed.
//
// OWNER ONLY, and it writes to the owner's own calendar with no attendees and
// sendUpdates=none, so nothing is mailed to anyone. Idempotent: it cleans up
// what it made, and says so if it could not.
import { guard, sweep } from './_guard.js';
import { getAccessToken } from './_google.js';
import { BANANA } from '../src/lib/availability.js';

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/* Far enough out that it is not in anyone's view, at an hour nothing else uses,
   and named so that a stray one left by a failed run is obviously ours. */
export function probeWindow(now = Date.now()) {
  const d = new Date(now + 365 * 86400000);
  const day = d.toISOString().slice(0, 10);
  return { start: `${day}T04:00:00`, end: `${day}T04:10:00` };
}

const TITLE = 'ProyTech availability probe — safe to delete';

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'calendar-probe', perIp: 10, windowMin: 60, perDay: 40,
    maxChars: 500, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();

  const made = [];
  let token = null;

  /* Deletes whatever this run created, and REPORTS whether it managed to.
     Called before the response rather than in a finally block, because a
     response claiming the calendar was tidied while the delete is still in
     flight is a response that can be wrong. */
  const cleanup = async () => {
    const left = [];
    for (const id of made) {
      try {
        const r = await fetch(`${CAL}/${encodeURIComponent(id)}?sendUpdates=none`,
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok && r.status !== 404 && r.status !== 410) left.push(id);
      } catch { left.push(id); }
    }
    return left.length
      ? `COULD NOT DELETE ${left.length} probe event(s) — search your calendar for "${TITLE}" and remove them by hand.`
      : (made.length ? `cleaned up ${made.length} probe event(s)` : 'nothing to clean up');
  };

  try {
    token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: false, error: 'not_connected' }); return; }
    const auth = { Authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const { start, end } = probeWindow();

    const create = async colorId => {
      const body = {
        summary: TITLE + (colorId ? ' (banana)' : ' (default colour)'),
        start: { dateTime: start, timeZone: 'UTC' },
        end: { dateTime: end, timeZone: 'UTC' },
        ...(colorId ? { colorId } : {}),
      };
      const r = await fetch(`${CAL}?sendUpdates=none`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'create failed');
      made.push(j.id);
      return j.id;
    };
    const read = async id => {
      const r = await fetch(`${CAL}/${encodeURIComponent(id)}`, { headers: auth });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'read failed');
      return j;
    };

    const bananaBack = await read(await create(BANANA));
    const plainBack  = await read(await create(''));

    /* What came back, not what we hoped for. The verdict is computed from the
       readings so that a failure prints the actual value rather than 'false'. */
    const bananaId = bananaBack.colorId == null ? null : String(bananaBack.colorId);
    const plainId  = plainBack.colorId  == null ? null : String(plainBack.colorId);
    const findings = {
      constant: BANANA,
      bananaReadsBackAs: bananaId,
      uncolouredReadsBackAs: plainId,
      colourSurvivesRoundTrip: bananaId === BANANA,
      uncolouredCarriesNoColour: plainId === null,
    };
    findings.ok = findings.colourSurvivesRoundTrip && findings.uncolouredCarriesNoColour;

    const cleaned = await cleanup();
    res.status(200).json({
      ok: findings.ok,
      findings,
      cleaned,
      note: findings.ok
        ? `colorId ${BANANA} round-trips as Banana, and an uncoloured event carries no colorId at all — the inversion holds at the API, not just in my head.`
        : `THE BOOKING RULE'S ASSUMPTION IS WRONG. Do not trust an availability grid until this is resolved — read the findings.`,
    });
  } catch (e) {
    const cleaned = token ? await cleanup() : 'nothing to clean up';
    res.status(200).json({ ok: false, error: e.message || 'probe failed', cleaned });
  }
}
