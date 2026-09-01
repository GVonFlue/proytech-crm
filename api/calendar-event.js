// Creates (or deletes) an event on the connected Google Calendar's primary calendar.
// POST body to create: { title, start, end, notes, location, attendees:[email], meet:bool, timezone }
// POST body to delete: { action:'delete', eventId }
// start/end are local wall-clock strings 'YYYY-MM-DDTHH:MM:SS'; timezone names the zone.
//
// SIGNED-IN, NOT OWNER-ONLY. Reps book meetings; that is the feature. So the
// guard below proves a session and stops there.
//
// BUT A SESSION DOES NOT CONSTRAIN THE ATTENDEE LIST, and that is the half
// worth reading. `attendees` came off the request body unfiltered and the URL
// carries sendUpdates=all, so every created event mails a Google Calendar
// invite FROM THE CONNECTED ACCOUNT to any address supplied. Unauthenticated
// that was a spam relay wearing the owner's name. Merely guarded, it would
// have been a spam relay any rep could aim — the recipient's inbox cannot tell
// the difference and neither can a spam filter.
//
// Three things narrow it, and it is worth being honest that they narrow rather
// than close:
//
//   1. A cap on how many addresses one request may invite. The booking screen
//      sends AT MOST ONE — the lead's email, or one typed in its place (see
//      src/App.jsx, inviteEmail). MAX_ATTENDEES is set above that, not at it,
//      so a second guest does not need a server change; it is set far enough
//      below "a mailing list" that no single request is worth sending.
//   2. sendUpdates=all only when an event actually HAS attendees. An event
//      with none has nobody to notify, so asking Google to notify everybody
//      was always wrong; it just cost nothing until it did.
//   3. The addresses must look like addresses. Google rejects malformed ones
//      anyway; doing it here means the rejection is ours and is countable.
//
// What is NOT closed: a signed-in rep can still invite one arbitrary address
// per booking, and loop. What bounds that is guard()'s per-IP window and the
// global daily cap — a real ceiling on invites-per-day rather than a claim
// that the hole is gone — plus the fact that it is now a named session doing
// it rather than the internet. Attributable and rate-capped is the right
// standard for an insider action; unauthenticated and unlimited was not.
//
// Deleting is signed-in for the same reason: a rep who books a meeting has to
// be able to cancel it. Deleting an arbitrary pre-existing event still needs
// its id, which this endpoint only ever returns for events it created.
import { guard, sweep } from '@getproytech/core/guard';
import { getAccessToken } from './_google.js';

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/* One booking, one guest, today. The headroom is for a second person on a
   call, not for a list. */
export const MAX_ATTENDEES = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The invite list, normalised. Exported so the rule can be tested for what it
 *  does rather than matched for how it is spelled — same reason
 *  sheet-read.js exports sheetIdFrom. Deduped as well as validated: five copies
 *  of one address is one invitee and five chances to be counted as a sender of
 *  bulk mail. */
export function inviteList(raw) {
  const attendees = [...new Set(
    (Array.isArray(raw) ? raw : [])
      .map(e => String(e == null ? '' : e).trim().toLowerCase())
      .filter(e => EMAIL.test(e))
  )];
  return { attendees, tooMany: attendees.length > MAX_ATTENDEES, max: MAX_ATTENDEES };
}

/** No attendees, nobody to notify. sendUpdates=all on a solo event asked Google
 *  to mail invitations for a guest list that does not exist. */
export const sendUpdatesFor = attendees => (attendees.length ? 'all' : 'none');

export default async function handler(req, res) {
  // A title, notes and a couple of timestamps. Notes is the only field a human
  // types freely, so there is room for it and not much more.
  const gate = await guard(req, res, {
    name: 'calendar-event', perIp: 30, windowMin: 10, perDay: 400,
    maxChars: 20000, requireAuth: true, module: 'meetings',
  });
  if (!gate.ok) return;
  sweep();

  try {
    const token = await getAccessToken();
    if (!token) { res.status(200).json({ ok: false, error: 'not_connected' }); return; }
    const b = req.body || {};

    if (b.action === 'delete') {
      if (!b.eventId) { res.status(400).json({ ok: false, error: 'no eventId' }); return; }
      const r = await fetch(`${CAL}/${encodeURIComponent(b.eventId)}?sendUpdates=all`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
      // 410/404 = already gone; treat as success
      if (!r.ok && r.status !== 410 && r.status !== 404) {
        res.status(200).json({ ok: false, error: await r.text() }); return;
      }
      res.status(200).json({ ok: true }); return;
    }

    if (!b.start || !b.end) { res.status(400).json({ ok: false, error: 'start/end required' }); return; }
    const tz = b.timezone || 'America/Chicago';
    const event = {
      summary: b.title || 'Meeting',
      description: b.notes || '',
      start: { dateTime: b.start, timeZone: tz },
      end: { dateTime: b.end, timeZone: tz },
    };
    // Google turns a plain address into a map link on the invite, which is the
    // whole point on a phone. Omitted entirely when blank rather than sent as ''.
    if (b.location && String(b.location).trim()) event.location = String(b.location).trim();

    const { attendees, tooMany } = inviteList(b.attendees);
    if (tooMany) {
      // Refuse rather than silently truncate. A booking that quietly invited
      // the first five of eight guests is a worse outcome than one that failed
      // and said why, because nobody finds out until the meeting.
      res.status(400).json({
        ok: false,
        error: `A booking can invite at most ${MAX_ATTENDEES} people. That request had ${attendees.length}.`,
      });
      return;
    }
    if (attendees.length) event.attendees = attendees.map(email => ({ email }));

    let url = `${CAL}?sendUpdates=${sendUpdatesFor(attendees)}`;
    if (b.meet) {
      url += '&conferenceDataVersion=1';
      event.conferenceData = {
        createRequest: { requestId: 'proytech-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      };
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    const j = await r.json();
    if (!r.ok) { res.status(200).json({ ok: false, error: (j.error && j.error.message) || 'create failed' }); return; }
    const meetLink = ((j.conferenceData && j.conferenceData.entryPoints) || [])
      .find((p) => p.entryPointType === 'video')?.uri || '';
    res.status(200).json({ ok: true, eventId: j.id, htmlLink: j.htmlLink || '', meetLink });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || 'error' });
  }
}
