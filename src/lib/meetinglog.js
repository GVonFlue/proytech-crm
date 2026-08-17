/* ============================================================
   MEETING LOG — data helpers
   ------------------------------------------------------------
   Pure functions only. No React, no Supabase, no fetch — which
   is what makes them testable from tests/*.mjs without a DOM.

   Shape of a stored record (the jsonb `data` of one meeting_logs row):
     { id, meetingDate, source, attendees[], transcript,
       extraction{}, acceptedTaskIds[], createdAt, createdBy }

   `transcript` is stored for the record and is NEVER sent anywhere
   again. Everything downstream reads `extraction`.
   ============================================================ */

export const MEETING_SOURCES = ['Voice memo', 'Pocket AI', 'Notes', 'Other'];

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

export const newMeetingLog = (by) => ({
  id: mlUid(),
  meetingDate: todayISO(),
  source: 'Voice memo',
  attendees: [],
  transcript: '',
  extraction: emptyExtraction(),
  acceptedTaskIds: [],
  createdAt: new Date().toISOString(),
  createdBy: S(by),
});

/* Rows come back from Supabase as whatever was written months ago. Normalise
   on read so an older record can never crash a newer screen. */
export const normLog = (r) => {
  const e = (r && r.extraction) || {};
  return {
    id: S(r && r.id) || mlUid(),
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
  const sorted = A(logs).slice().sort((a, b) => S(a.meetingDate).localeCompare(S(b.meetingDate)));
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
  const recent = sortLogs(logs).slice(0, limit);
  if (!recent.length) return null;
  return {
    meetingsLogged: A(logs).length,
    recent: recent.map(l => ({
      date: l.meetingDate,
      headline: l.extraction.headline,
      openDecisions: A(l.extraction.decisions).filter(d => d.status === 'open').map(d => d.decision).slice(0, 4),
      risks: A(l.extraction.risks).slice(0, 3),
    })),
    openLoops: openLoops(logs, now).slice(0, 10).map(x => ({ title: x.title, weeksOpen: x.weeks, meetingsSurvived: x.seen })),
  };
};
