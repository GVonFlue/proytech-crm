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
/* 'note' is an internal business note: something worth keeping that has no
   person attached and is not a meeting — a vendor quirk, a decision, a read on
   how something works. It exists because Pocket recordings produce them and a
   fourth near-identical table would be the ENGINEERING §5 mistake. It is NOT a
   Playbook draft: kb_notes is a publication queue whose whole shape is about
   being published to reps, and it deliberately has no transcript column. */
export const MEETING_KINDS = ['internal', 'client', 'note'];

const S = v => String(v == null ? '' : v);
const A = v => (Array.isArray(v) ? v : []);
/* an object field read off a stored row, which may be null, a string, or an
   array if something upstream went wrong */
const O = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => isoOf(new Date());
export const mlUid = () => 'ml' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* An empty extraction. Every consumer can read every field without guarding.

   The last seven are asked for on client meetings only (api/meeting-log.js),
   but they are empty rather than absent on an internal one, so every reader
   treats both kinds identically instead of branching on `kind`. */
export const emptyExtraction = () => ({
  title: '', headline: '', summary: '', themes: [], decisions: [],
  actions: [], numbers: [], risks: [], openItems: [], loopReview: [],
  wants: [], objections: [], budget: { stated: '', paying: '', note: '' },
  commitments: [], people: [],
  temperature: { read: '', why: '' },
  nextStep: { what: '', who: '', when: '' },
});

/* WHICH OF THE SEVEN CAN BE OFFERED TO A REP.

   Not a UI preference — the reason each field is on one list and not the
   other:

   SHAREABLE   wants, commitments, people, nextStep. Facts, and facts the
     client would recognise as their own. A rep walking into the next call is
     worse at their job without them.
   OWNER ONLY  objections, budget, temperature. `temperature` is a judgement
     the prompt is explicitly told not to soften. `objections` is a fact, but
     it is the sentence most likely to be misread once it is stripped of the
     tone that made it fine in the room — "pushed back on price" reads as a
     problem when it was a shrug. `budget` is the owner's conversation.

   This list only decides what the publish box is SEEDED with. Nothing here
   publishes anything: the seed is a draft in a textarea, and it reaches a lead
   only when an owner edits it and presses the button. See Detail in
   src/MeetingLog.jsx. */
export const SHAREABLE_FIELDS = ['wants', 'commitments', 'people', 'nextStep'];
export const OWNER_ONLY_FIELDS = ['objections', 'budget', 'temperature'];

/* Nothing has been published to the lead until an owner presses the button,
   so an empty `shared` is the correct state for every new log. */
export const emptyShared = () => ({ text: '', at: '', by: '', activityId: '' });

export const newMeetingLog = (by, kind) => ({
  id: mlUid(),
  kind: MEETING_KINDS.includes(kind) ? kind : 'internal',
  leadId: '',
  /* Where this came from, when it was made from a Pocket recording. An ID and a
     LOCATOR, never any transcript text — the recording keeps the only copy of
     that (POCKET-PLAN.md §5). sourceSegment is provenance, a historical fact
     about how this was made, so unlike an offset into a live transcript it
     cannot go stale when Pocket sends transcript.edited. */
  sourcePocketId: '',
  sourceSegment: null,
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
    /* Named here or they vanish on reload — this function's whole warning. */
    sourcePocketId: S(r && r.sourcePocketId),
    sourceSegment: (r && r.sourceSegment) ? {
      start: S(O(r.sourceSegment).start, 12), end: S(O(r.sourceSegment).end, 12),
      quote: S(O(r.sourceSegment).quote, 300),
    } : null,
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
      /* the seven client fields. Named here for the same reason as everything
         above: a field the extraction writes and normLog does not read saves
         fine and vanishes on the next refresh. */
      wants: A(e.wants), objections: A(e.objections),
      budget: { stated: S(O(e.budget).stated), paying: S(O(e.budget).paying), note: S(O(e.budget).note) },
      commitments: A(e.commitments), people: A(e.people),
      temperature: { read: S(O(e.temperature).read), why: S(O(e.temperature).why) },
      nextStep: { what: S(O(e.nextStep).what), who: S(O(e.nextStep).who), when: S(O(e.nextStep).when) },
    },
  };
};

/* Newest meeting first. Sorts on the meeting date, not created_at: a memo
   typed up three days late still belongs on the day it happened. */
export const sortLogs = (logs) =>
  A(logs).slice().sort((a, b) =>
    S(b.meetingDate).localeCompare(S(a.meetingDate)) || S(b.createdAt).localeCompare(S(a.createdAt)));

/* The kinds, split. `internalLogs` is what the Sunday cadence is made of: the
   open-loop ladder and the huddle digest both run on it ALONE. Letting client
   meetings in would bury "the LLC has been open four weeks running" under a
   fortnight of client chatter, which is the one thing this module exists to
   notice.

   THIS TESTS FOR 'internal' RATHER THAN 'NOT client', and that is not a
   stylistic choice. It used to be `!== 'client'`, which was correct while there
   were exactly two kinds and became a silent bug the moment a third arrived:
   every business note would have been swept into the Sunday cadence, appearing
   in the huddle and the open-loop ladder as though it had been said in a
   meeting. An allow-list of one is the only version of this that survives a new
   kind being added. */
export const internalLogs = (logs) => A(logs).filter(l => (l && l.kind) === 'internal');
export const noteLogs = (logs) => A(logs).filter(l => (l && l.kind) === 'note');
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
    /* The structured block. All seven, INCLUDING the three that are never
       seeded into the publish box — this row is rendered from meeting_logs,
       which no rep can read a single row of (MEETING-MIGRATION.sql), so it is
       the owner looking at their own record. The shareable/owner-only split
       governs what gets OFFERED for publishing, not what an owner may see on
       a lead they own. */
    wants: A(l.extraction && l.extraction.wants),
    objections: A(l.extraction && l.extraction.objections),
    budget: { ...emptyExtraction().budget, ...O(l.extraction && l.extraction.budget) },
    commitments: A(l.extraction && l.extraction.commitments),
    people: A(l.extraction && l.extraction.people),
    temperature: { ...emptyExtraction().temperature, ...O(l.extraction && l.extraction.temperature) },
    nextStep: { ...emptyExtraction().nextStep, ...O(l.extraction && l.extraction.nextStep) },
    derived: true,
  }));
};

/* The DRAFT line the publish box opens with.

   Built from the four shareable fields and nothing else. Every sentence here
   is something the client themselves said or agreed to, so a rep reading it
   back learns what they need for the next call and learns nothing about how
   the meeting was read.

   It is a DRAFT. It is put in a textarea the owner edits, and it becomes
   something a rep can see only when they press the button — so this function
   choosing well is a convenience, not the control. The control is that
   publishing is a human action.

   Falls back to the headline when there is nothing shareable, which is what
   every log written before these fields existed looks like. */
export const shareSeed = (log) => {
  const e = (log && log.extraction) || {};
  const lines = [];

  const wants = A(e.wants).map(w => S(w && w.want).trim()).filter(Boolean);
  if (wants.length) lines.push('They want: ' + wants.join('; ') + '.');

  /* the two sides read as different sentences on purpose. "We agreed to send a
     quote" and "they agreed to send a quote" are the same words with the work
     pointing the other way, and a rep skimming a feed will not catch which is
     which from a shared list. */
  const ours = A(e.commitments).filter(c => c && S(c.side) !== 'client');
  const theirs = A(e.commitments).filter(c => c && S(c.side) === 'client');
  const one = c => S(c.what).trim() + (S(c.due) ? ' (by ' + S(c.due) + ')' : '');
  if (ours.length) lines.push('We said we would: ' + ours.map(one).filter(Boolean).join('; ') + '.');
  if (theirs.length) lines.push('They said they would: ' + theirs.map(one).filter(Boolean).join('; ') + '.');

  const people = A(e.people).map(x => {
    const n = S(x && x.name).trim();
    if (!n) return '';
    const bits = [S(x.role).trim(), S(x.influence) === 'decides' ? 'decides' : ''].filter(Boolean);
    return n + (bits.length ? ' (' + bits.join(', ') + ')' : '');
  }).filter(Boolean);
  if (people.length) lines.push('Also involved: ' + people.join('; ') + '.');

  const ns = O(e.nextStep);
  const what = S(ns.what).trim();
  if (what) {
    const bits = [S(ns.who).trim(), S(ns.when).trim()].filter(Boolean);
    lines.push('Next: ' + what + (bits.length ? ' — ' + bits.join(', ') : '') + '.');
  }

  return lines.length ? lines.join('\n') : S(e.headline);
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
