/* ============================================================
   MEETING LOG — data helpers
   ------------------------------------------------------------
   Pure functions only. No React, no Supabase, no fetch — which
   is what makes them testable from tests/*.mjs without a DOM.

   Shape of a stored record (the jsonb `data` of one meeting_logs row):
     { id, kind, leadId, meetingDate, source, attendees[], transcript,
       extraction{}, shared{}, acceptedTaskIds[], createdAt, createdBy }

   `transcript` is stored for the record and is NEVER sent anywhere
   again. Everything downstream reads `extraction`.

   TWO KINDS OF MEETING
   'internal' — the Sunday CEO meeting. Owner-only, stays in this
   table, feeds the open-loop ladder and the huddle digest.
   'client'   — a meeting with a lead. Carries `leadId`, and its
   summary is DERIVED onto that lead's record rather than copied
   (the sponsorshipsOf rule in ENGINEERING.md §2). The one thing
   that can cross into the leads table is `shared` — a short line
   the owner writes by hand and publishes deliberately, because
   meeting_logs is owner-only and lead activities are rep-readable.
   ============================================================ */

export const MEETING_SOURCES = ['Voice memo', 'Pocket AI', 'Notes', 'Other'];
export const MEETING_KINDS = ['internal', 'client'];

const S = v => String(v == null ? '' : v);
const A = v => (Array.isArray(v) ? v : []);
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => isoOf(new Date());
export const mlUid = () => 'ml' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* An empty extraction. Every consumer can read every field without guarding. */
export const emptyExtraction = () => ({
  title: '', headline: '', summary: '', themes: [], decisions: [],
  actions: [], numbers: [], risks: [], openItems: [], loopReview: [],
});

/* Nothing has been published to the lead until an owner presses the button,
   so an empty `shared` is the correct state for every new log. */
export const emptyShared = () => ({ text: '', at: '', by: '', activityId: '' });

export const newMeetingLog = (by, kind) => ({
  id: mlUid(),
  kind: MEETING_KINDS.includes(kind) ? kind : 'internal',
  leadId: '',
  meetingDate: todayISO(),
  source: 'Voice memo',
  attendees: [],
  transcript: '',
  extraction: emptyExtraction(),
  shared: emptyShared(),
  acceptedTaskIds: [],
  createdAt: new Date().toISOString(),
  createdBy: S(by),
});

/* Rows come back from Supabase as whatever was written months ago. Normalise
   on read so an older record can never crash a newer screen.

   THIS FUNCTION NAMES EVERY KEY EXPLICITLY, so a field added to the record and
   not added here saves fine and vanishes on refresh. That exact bug already
   shipped once in this project — the settings loader rebuilt its object the
   same way and silently dropped `recurring` (BUILD-NOTES-v36). Any new field
   on a meeting log has to be added below or it does not survive a reload. */
export const normLog = (r) => {
  const e = (r && r.extraction) || {};
  const sh = (r && r.shared) || {};
  return {
    id: S(r && r.id) || mlUid(),
    /* every log written before client meetings existed is an internal one, so
       the default backfills the whole table without a migration */
    kind: MEETING_KINDS.includes(S(r && r.kind)) ? S(r.kind) : 'internal',
    leadId: S(r && r.leadId),
    shared: {
      text: S(sh.text), at: S(sh.at), by: S(sh.by), activityId: S(sh.activityId),
    },
    meetingDate: S(r && r.meetingDate).slice(0, 10) || todayISO(),
    source: MEETING_SOURCES.includes(S(r && r.source)) ? S(r.source) : 'Other',
    attendees: A(r && r.attendees).map(S).filter(Boolean),
    transcript: S(r && r.transcript),
    acceptedTaskIds: A(r && r.acceptedTaskIds).map(S),
    createdAt: S(r && r.createdAt) || new Date().toISOString(),
    createdBy: S(r && r.createdBy),
    extraction: {
      ...emptyExtraction(),
      title: S(e.title), headline: S(e.headline), summary: S(e.summary),
      themes: A(e.themes), decisions: A(e.decisions), actions: A(e.actions),
      numbers: A(e.numbers), risks: A(e.risks), openItems: A(e.openItems), loopReview: A(e.loopReview),
    },
  };
};

/* Newest meeting first. Sorts on the meeting date, not created_at: a memo
   typed up three days late still belongs on the day it happened. */
export const sortLogs = (logs) =>
  A(logs).slice().sort((a, b) =>
    S(b.meetingDate).localeCompare(S(a.meetingDate)) || S(b.createdAt).localeCompare(S(a.createdAt)));

/* The two kinds, split. `internalLogs` is what the Sunday cadence is made of:
   the open-loop ladder and the huddle digest both run on it ALONE. Letting
   client meetings in would bury "the LLC has been open four weeks running"
   under a fortnight of client chatter, which is the one thing this module
   exists to notice. */
export const internalLogs = (logs) => A(logs).filter(l => (l && l.kind) !== 'client');
export const clientLogs = (logs) => A(logs).filter(l => l && l.kind === 'client');

/* Every client meeting logged against one lead, newest first.

   DERIVED, never copied — the same rule sponsorshipsOf follows in App.jsx: the
   log is the only record, and the lead reads through to it. Edit the log or
   re-run the extraction and the lead updates for free; delete the log and it
   leaves the lead instead of stranding a stale copy there.

   Deliberately returns no transcript. The lead's feed is a scannable one-line-
   per-row timeline and a transcript in it would undo that, and `transcript` is
   the most sensitive text in the database besides. Callers get the headline.

   NOTE ON VISIBILITY: this reads meeting_logs, which is owner-only at the
   database (MEETING-MIGRATION.sql). A rep's client gets zero rows back, so a
   rep derives nothing — enforced by Postgres, not by a hidden div. The only
   thing a rep can ever see is a `shared` line an owner published on purpose,
   and that is a real stored activity on the lead. */
export const meetingLogsOf = (lead, logs) => {
  if (!lead) return [];
  return sortLogs(clientLogs(logs).filter(l => l.leadId === lead.id)).map(l => ({
    id: 'mlog_' + l.id,
    logId: l.id,
    date: l.meetingDate,
    /* noon, so a date-only meeting sorts sensibly against the ISO timestamps
       on real activities instead of jumping to the top of its day */
    ts: l.meetingDate + 'T12:00:00',
    title: (l.extraction && l.extraction.title) || 'Client meeting',
    headline: (l.extraction && l.extraction.headline) || '',
    summary: (l.extraction && l.extraction.summary) || '',
    source: l.source,
    attendees: A(l.attendees),
    published: !!(l.shared && l.shared.text),
    sharedText: (l.shared && l.shared.text) || '',
    derived: true,
  }));
};

/* One extracted action -> one CRM task, in the exact shape newTask() makes in
   App.jsx. sourceMeetingId is the only added field: it is what lets a task be
   traced back to the sentence in the meeting that created it. */
export const taskFromAction = (action, meetingId, uid) => ({
  id: uid(),
  title: S(action.title),
  notes: S(action.why),
  owner: S(action.owner) || 'Both',
  leadId: '',
  due: /^\d{4}-\d{2}-\d{2}$/.test(S(action.due)) ? S(action.due) : todayISO(),
  revenue: Number(action.revenue) || 3,
  urgency: Number(action.urgency) || 3,
  effort: Number(action.effort) || 3,
  done: false, doneAt: '', doneBy: '',
  aiRank: null, aiReason: '',
  createdAt: new Date().toISOString(),
  sourceMeetingId: S(meetingId),
});

/* Which of this meeting's actions have NOT been pushed into the task list yet.
   Matched on title rather than index, so re-running the extraction doesn't
   duplicate work that was already accepted. */
export const pendingActions = (log, tasks) => {
  const have = new Set(A(tasks).filter(t => t.sourceMeetingId === log.id).map(t => S(t.title).toLowerCase()));
  return A(log.extraction && log.extraction.actions).filter(a => !have.has(S(a.title).toLowerCase()));
};

/* Every open item across every meeting, oldest first, with an age in weeks and
   the meetings it has survived. This is the whole point of the module: the
   thing no human does is notice that the LLC has been on the list four weeks
   running. Phase 1 renders it; Phase 2 feeds it back into the extraction. */
export const openLoops = (logs, now = new Date()) => {
  const sorted = internalLogs(logs).slice().sort((a, b) => S(a.meetingDate).localeCompare(S(b.meetingDate)));
  const map = new Map();
  sorted.forEach(l => {
    A(l.extraction && l.extraction.loopReview).forEach(v => {
      const it = map.get(v.key);
      if (it && (v.verdict === 'closed' || v.verdict === 'abandoned')) { it.status = v.verdict; it.closedAt = l.meetingDate; }
    });
    A(l.extraction && l.extraction.openItems).forEach(o => {
      const prev = map.get(o.key);
      if (prev) { prev.seen += 1; prev.lastSeen = l.meetingDate; prev.status = 'open'; prev.closedAt = ''; }
      else map.set(o.key, { key: o.key, title: o.title, firstSeen: l.meetingDate, lastSeen: l.meetingDate, seen: 1, status: 'open', closedAt: '' });
    });
  });
  const days = iso => { const t = new Date(iso + 'T12:00:00').getTime(); return isNaN(t) ? 0 : Math.round((now.getTime() - t) / 86400000); };
  return [...map.values()]
    .filter(x => x.status === 'open')
    .map(x => ({ ...x, ageDays: days(x.firstSeen), weeks: Math.max(1, Math.round(days(x.firstSeen) / 7)) }))
    .sort((a, b) => b.ageDays - a.ageDays);
};

/* The slice of meeting history that gets bolted onto the huddle digest.
   Deliberately small: recent headlines, live decisions and stale loops. No
   transcripts, no full action lists — the huddle already sees the task list. */
export const meetingDigest = (logs, limit = 6, now = new Date()) => {
  /* internal only, for the same reason as openLoops — the huddle is the team's
     meeting, not a client review */
  const internal = internalLogs(logs);
  const recent = sortLogs(internal).slice(0, limit);
  if (!recent.length) return null;
  return {
    meetingsLogged: internal.length,
    recent: recent.map(l => ({
      date: l.meetingDate,
      headline: l.extraction.headline,
      openDecisions: A(l.extraction.decisions).filter(d => d.status === 'open').map(d => d.decision).slice(0, 4),
      risks: A(l.extraction.risks).slice(0, 3),
    })),
    openLoops: openLoops(logs, now).slice(0, 10).map(x => ({ title: x.title, weeksOpen: x.weeks, meetingsSurvived: x.seen })),
  };
};
