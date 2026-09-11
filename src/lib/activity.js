/* ============================================================================
   activity.js — what happened, and the narrower question of what somebody did.

   TWO VIEWS, ONE DEFINITION. "Everything that happened" and "what I
   accomplished today" are not the same list, and building them as two screens
   would give them two definitions of what counts. They are one stream with two
   filters, and the accomplishment one is the restrictive one.

   THE MACHINE-NOTE PROBLEM, AGAIN.
   ProyTech spent a day learning that a note the app wrote about itself reads as
   human contact, and that a hand-maintained list of prefixes goes stale the
   moment somebody adds a writer. Dwell has the same problem in a smaller and
   sharper form:

     kind: 'import'   honest — the kind itself says a machine did it
     Contracts.jsx    writes kind: 'note' with "Created from a contract
                      upload." — a MACHINE NOTE WEARING A HUMAN KIND, which is
                      exactly the shape that cost ProyTech a day

   So the classifier reads the kind first and falls back to a text list for the
   liars. tests/activity.test.mjs scans the source for every writer of an
   activity entry and fails the build when one appears that is classified
   neither way — the list cannot go stale silently, because the test maintains
   the question rather than the answer.
   ========================================================================== */

/* The extension is required: tests import this file under plain Node ESM. */
import { addDays, dow, fmtLong, fmtShort, isDate } from './dates.js';

/* Kinds a machine writes. The kind is honest here, so no text matching is
   needed and none is done. */
export const MACHINE_KINDS = ['import'];

/* Machine notes wearing a human kind. One entry today; the source scan is what
   stops it being one entry tomorrow while a second writer exists. */
export const MACHINE_NOTES = [
  'Created from a contract upload.',
];

/* Kinds that represent a person doing something to a relationship. A task
   completion is folded in separately — it is not stored on the contact. */
export const DOING_KINDS = ['call', 'appointment', 'note', 'feedback', 'text', 'email'];

export const isMachineEntry = a => {
  if (!a) return false;
  if (MACHINE_KINDS.includes(a.kind)) return true;
  const note = String(a.note || '');
  return MACHINE_NOTES.some(p => note.startsWith(p));
};

/** Did a PERSON do this? The question the accomplishment view asks.
 *  A machine entry is never an accomplishment, whatever kind it wears. */
export const isAccomplishment = a => !!a && !isMachineEntry(a) && DOING_KINDS.includes(a.kind);

/* ---------------------------------------------------------------- the stream */

const arr = v => (Array.isArray(v) ? v : []);
const day = s => String(s || '').slice(0, 10);

/** One stream across contacts and tasks.
 *
 *  Transactions deliberately contribute NOTHING here. They have no activity
 *  array — their history is the deadline list and the phase — and a deadline
 *  coming due is not something a person did. Folding them in would mix a
 *  contract clause with somebody's phone call, which is the merge that makes
 *  "what happened" useless for answering "what did I get done".
 *
 *  `preset` is 'all' (everything that happened) or 'done' (what a person did).
 */
export function buildStream(opts = {}) {
  const { contacts = [], tasks = [], preset = 'all', who = '', from = '', to = '', tz = '' } = opts;
  const dayOf = at => (tz ? dayIn(at, tz) : day(at));
  const out = [];

  for (const c of arr(contacts)) {
    for (const a of arr(c && c.activity)) {
      if (!a || !a.at) continue;
      if (preset === 'done' && !isAccomplishment(a)) continue;
      out.push({
        id: a.id, at: a.at, day: dayOf(a.at), kind: a.kind || 'note',
        note: a.note || '', by: a.by || null,
        contactId: c.id, contactName: c.name || '',
        machine: isMachineEntry(a),
      });
    }
  }

  /* A finished task is an accomplishment and belongs in both views — it is the
     one thing in "what I got done" that is not stored on a contact. */
  for (const t of arr(tasks)) {
    if (!t || !t.done || !t.doneAt) continue;
    out.push({
      id: t.id, at: t.doneAt, day: dayOf(t.doneAt), kind: 'task',
      note: t.title || '', by: t.user_id || null,
      contactId: t.contact_id || null, contactName: '',
      transactionId: t.transaction_id || null,
      machine: false,
    });
  }

  const filtered = out.filter(e => {
    if (who && String(e.by || '') !== String(who)) return false;
    if (from && e.day < from) return false;
    if (to && e.day > to) return false;
    return true;
  });
  return filtered.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Group a stream by day, newest first, for rendering. */
export function byDay(stream) {
  const m = new Map();
  for (const e of arr(stream)) {
    if (!m.has(e.day)) m.set(e.day, []);
    m.get(e.day).push(e);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

/* ============================================================ the screen ===
   Everything below is ported from ProyTech's Activity tab: a Day / Week / Month
   window you step through, a count per kind, and a count per person. Pure and
   here rather than in the view, because date maths does not live in a view. */

/** The kinds the screen counts, in the order the KPI row and chart show them.
 *  Colours are keys into BRAND.colors, so a re-branded install re-colours. */
export const ACT_TYPES = [
  { key: 'call',        label: 'Call',        plural: 'Calls',        color: 'cobalt' },
  { key: 'text',        label: 'Text',        plural: 'Texts',        color: 'green' },
  { key: 'email',       label: 'Email',       plural: 'Emails',       color: 'red' },
  { key: 'appointment', label: 'Appointment', plural: 'Appointments', color: 'indigo' },
  { key: 'note',        label: 'Note',        plural: 'Notes',        color: 'gold' },
  { key: 'feedback',    label: 'Feedback',    plural: 'Feedback',     color: 'ink' },
  { key: 'task',        label: 'Task done',   plural: 'Tasks done',   color: 'teal' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const firstOfMonth = iso => `${iso.slice(0, 8)}01`;
const monthStep = (iso, dir) => {
  let y = +iso.slice(0, 4), m = +iso.slice(5, 7) + dir;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
};

/** The window a mode and an anchor date describe. Weeks run Sunday to Saturday. */
export function rangeOf(mode, anchor) {
  const a = isDate(anchor) ? anchor : '1970-01-01';
  if (mode === 'week') {
    const from = addDays(a, -dow(a));
    const to = addDays(from, 6);
    return { from, to, label: `${fmtShort(from)} – ${fmtShort(to)}` };
  }
  if (mode === 'month') {
    const from = firstOfMonth(a);
    const to = addDays(monthStep(a, 1), -1);
    return { from, to, label: `${MONTHS[+a.slice(5, 7) - 1]} ${a.slice(0, 4)}` };
  }
  return { from: a, to: a, label: fmtLong(a) };
}

/** Step the anchor one window forward (1) or back (-1). A month step lands on
 *  the 1st, so January 31 plus a month is never March. */
export function shiftAnchor(mode, anchor, dir) {
  if (mode === 'week') return addDays(anchor, 7 * dir);
  if (mode === 'month') return monthStep(anchor, dir);
  return addDays(anchor, dir);
}

/** The calendar day a stored timestamp fell on, in the install's timezone.
 *  A bare 'YYYY-MM-DD' is already a day and is returned as it is. */
export function dayIn(at, tz) {
  const s = String(at || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d).replace(/\//g, '-');
  } catch { return s.slice(0, 10); }
}

/** '2:05 PM' in the install's timezone, or '' when only a date was stored. */
export function timeIn(at, tz) {
  const s = String(at || '');
  if (!s.includes('T')) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(d);
  } catch { return ''; }
}

/** Counts per kind and per person, from a stream that has already been
 *  filtered. Pass the accomplishment stream: a machine entry is never counted. */
export function tally(stream) {
  const zero = () => ACT_TYPES.reduce((o, t) => { o[t.key] = 0; return o; }, { total: 0 });
  const byType = zero();
  const byPerson = {};
  for (const e of arr(stream)) {
    if (!e || e.machine || !(e.kind in byType)) continue;
    const p = e.by || '';
    byPerson[p] = byPerson[p] || zero();
    byType[e.kind] += 1; byType.total += 1;
    byPerson[p][e.kind] += 1; byPerson[p].total += 1;
  }
  return { byType, byPerson };
}
