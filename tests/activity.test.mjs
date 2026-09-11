/* ============================================================================
   Activity — the classifier, and the scan that stops it going stale.

   The lesson this is built from, learned on ProyTech over a full day: a
   hand-maintained list of "things the app wrote about itself" goes stale the
   moment somebody adds a writer, silently, and every count built on it is
   quietly wrong from then on. The list there had gone stale within weeks of
   being written and nothing said so.

   So the second half of this file does not test the classifier at all. It
   SCANS THE SOURCE for every writer of an activity entry, and fails when one
   appears that is classified neither as a person's doing nor as a machine's.
   The test maintains the QUESTION; the list only has to hold the answer.

   Dwell's version of the problem is sharper than ProyTech's and worth naming:
   kind:'import' is honest, but Contracts.jsx writes kind:'note' with "Created
   from a contract upload." — a machine note wearing a human kind. That is the
   exact shape that cost the day.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import {
  isMachineEntry, isAccomplishment, buildStream, byDay,
  MACHINE_KINDS, MACHINE_NOTES, DOING_KINDS,
  ACT_TYPES, rangeOf, shiftAnchor, dayIn, timeIn, tally,
} from '../src/lib/activity.js';

const read = p => fs.readFileSync(p, 'utf8');

/* comments stripped before scanning: prose naming a kind is not a writer of
   one, and a check that trips on its own explanation gets deleted. */
function code(src) {
  let out = '', block = false;
  for (const line of src.split('\n')) {
    let l = line;
    if (block) { const e = l.indexOf('*/'); if (e === -1) { out += '\n'; continue; } block = false; l = l.slice(e + 2); }
    for (;;) {
      const b = l.indexOf('/*'); if (b === -1) break;
      const e = l.indexOf('*/', b + 2);
      if (e === -1) { l = l.slice(0, b); block = true; break; }
      l = l.slice(0, b) + ' ' + l.slice(e + 2);
    }
    out += (/^\s*\/\//.test(l) ? '' : l) + '\n';
  }
  return out;
}

export default async function run(t) {
  await runScreen(t);

  /* ---------------- the classifier ---------------- */
  t.ok(isMachineEntry({ kind: 'import', note: 'Imported from leads.csv on 2026-08-01.' }),
    'an import entry is a machine entry — the kind says so');
  t.ok(isMachineEntry({ kind: 'note', note: 'Created from a contract upload.' }),
    'and so is a machine note WEARING a human kind');
  t.ok(!isMachineEntry({ kind: 'note', note: 'Created from scratch after the open house.' }),
    'while a human note that merely starts similarly is not');
  t.ok(!isMachineEntry({ kind: 'call', note: 'Talked through the inspection.' }), 'a call is not');

  t.ok(isAccomplishment({ kind: 'call', note: 'rang them' }), 'a call is something a person did');
  t.ok(isAccomplishment({ kind: 'appointment', note: 'listing appt' }), 'so is an appointment');
  t.ok(!isAccomplishment({ kind: 'import', note: 'Imported from x.csv' }),
    'an import is NOT — nobody did anything');
  t.ok(!isAccomplishment({ kind: 'note', note: 'Created from a contract upload.' }),
    'and neither is the contract-upload note, whatever kind it wears');

  /* ---------------- the two presets ---------------- */
  const CONTACTS = [{
    id: 'c1', name: 'Henderson', activity: [
      { id: 'a', at: '2026-08-22T09:00:00Z', kind: 'call', note: 'rang', by: 'u1' },
      { id: 'b', at: '2026-08-22T10:00:00Z', kind: 'import', note: 'Imported from leads.csv on 2026-08-22.', by: 'u1' },
      { id: 'c', at: '2026-08-22T11:00:00Z', kind: 'note', note: 'Created from a contract upload.', by: 'u1' },
      { id: 'd', at: '2026-08-21T09:00:00Z', kind: 'note', note: 'they want a quick close', by: 'u2' },
    ],
  }];
  const TASKS = [
    { id: 't1', done: true, doneAt: '2026-08-22T12:00:00Z', title: 'Order the survey', user_id: 'u1' },
    { id: 't2', done: false, title: 'Not done yet', user_id: 'u1' },
  ];

  const all = buildStream({ contacts: CONTACTS, tasks: TASKS, preset: 'all' });
  t.eq(all.length, 5, 'everything that happened includes the machine entries and the finished task');
  t.ok(all[0].at > all[1].at, 'newest first');

  const done = buildStream({ contacts: CONTACTS, tasks: TASKS, preset: 'done' });
  t.eq(done.length, 3, 'what a person did excludes both machine entries');
  t.ok(!done.some(e => e.kind === 'import'), 'no import');
  t.ok(!done.some(e => /contract upload/.test(e.note)), 'no contract-upload note');
  t.ok(done.some(e => e.kind === 'task'), 'but a finished task counts');
  t.ok(!done.some(e => e.note === 'Not done yet'), 'and an unfinished one does not');

  const mine = buildStream({ contacts: CONTACTS, tasks: TASKS, preset: 'done', who: 'u1' });
  t.eq(mine.length, 2, 'filtering by person drops somebody else’s note');

  const oneDay = buildStream({ contacts: CONTACTS, tasks: TASKS, preset: 'all', from: '2026-08-22', to: '2026-08-22' });
  t.eq(oneDay.length, 4, 'a one-day window drops the day before');
  t.eq(byDay(all).length, 2, 'grouping by day gives two days');
  t.eq(byDay(all)[0][0], '2026-08-22', 'newest day first');

  /* ---------------- the scan ---------------- */

  /* src/lib/activity.js is excluded: it READS activity and builds stream rows,
     it does not write entries onto a contact. Including it made the first
     version of this scan flag its own output shape, which is noise — and worse,
     the first version also MISSED three real writers because it required `at:`
     to appear before `kind:` on the same line. A scan that misses writers is
     more dangerous than no scan, because it reports confidence it has not
     earned. This one takes a window around every `kind:` and asks whether the
     surrounding object looks like an activity entry: it must also carry `at:`
     and `note:`. */
  const files = ['src/views', 'src/components', 'src/lib']
    .flatMap(d => fs.readdirSync(d).filter(f => /\.jsx?$/.test(f)).map(f => path.join(d, f)))
    .filter(p => path.basename(p) !== 'activity.js');

  const found = [], unreadable = [];
  for (const p of files) {
    const s = code(read(p));
    const re = /\bkind:\s*([^,}\n]+)/g;
    let m;
    while ((m = re.exec(s))) {
      const win = s.slice(Math.max(0, m.index - 260), m.index + 260);
      /* the activity-entry signature. commission.js pushes {label, note, kind}
         with no `at:`; a task carries {due, kind} with no `note:` in that
         shape. Neither is an activity and neither should be dragged in. */
      if (!/\bat:/.test(win) || !/\bnote:/.test(win)) continue;
      const raw = m[1].trim();
      const lit = /^'([^']*)'$/.exec(raw);
      if (lit) found.push({ file: path.basename(p), kind: lit[1] });
      else unreadable.push(`${path.basename(p)}: kind is ${raw}`);
    }
  }

  const kinds = [...new Set(found.map(f => f.file + ":" + f.kind))].sort();
  t.ok(found.length > 0, `found activity writers (${kinds.join(', ')})`);

  /* The scan must see every writer found by hand when this was designed. If it
     stops seeing one, the scan broke — not the code. */
  for (const expected of ['Contacts.jsx:appointment', 'Contracts.jsx:note',
                          'importcsv.js:import', 'Tools.jsx:feedback', 'Assistant.jsx:note']) {
    t.ok(kinds.includes(expected), `the scan still sees ${expected}`);
  }

  const unclassified = found.filter(f =>
    !DOING_KINDS.includes(f.kind) && !MACHINE_KINDS.includes(f.kind));
  t.ok(unclassified.length === 0,
    unclassified.length
      ? `every activity kind is classified — these are not: ${[...new Set(unclassified.map(f => `${f.file}:'${f.kind}'`))].join(', ')}`
      : 'every activity kind written anywhere in src is classified');

  const KNOWN_DYNAMIC = ["Tools.jsx: kind is kind || 'note'"];
  const surprises = [...new Set(unreadable)].filter(u => !KNOWN_DYNAMIC.includes(u));
  t.ok(surprises.length === 0,
    surprises.length ? `a writer sets kind from a variable and is not on the known list: ${surprises.join('; ')}`
                     : 'the only variable-kind writer is the one that is known and explained');

  /* And the liar is actually covered: the scan proves Contracts.jsx writes a
     'note', and the classifier proves that particular note is machine-written.
     Neither half is enough alone. */
  const contractNote = found.find(f => f.file === 'Contracts.jsx' && f.kind === 'note');
  t.ok(!!contractNote, 'Contracts.jsx still writes an activity entry with kind note');
  t.ok(MACHINE_NOTES.some(p => /Created from a contract upload/.test(p)),
    'and its text is on the machine-note list');
}

/* ---------------- the screen: ported from ProyTech's Activity tab ---------------- */
async function runScreen(t) {
  const w = rangeOf('week', '2026-09-11');
  t.eq(`${w.from}..${w.to}`, '2026-09-06..2026-09-12', 'a week runs Sunday to Saturday around the anchor');
  const m = rangeOf('month', '2024-02-10');
  t.eq(`${m.from}..${m.to}`, '2024-02-01..2024-02-29', 'a month covers the whole month, leap day included');
  t.eq(m.label, 'February 2024', 'and is labelled by name');
  t.eq(rangeOf('day', '2026-09-11').from, '2026-09-11', 'a day is just that day');

  t.eq(shiftAnchor('month', '2026-01-31', 1), '2026-02-01', 'a month step from Jan 31 lands on Feb 1, never March');
  t.eq(shiftAnchor('month', '2026-01-15', -1), '2025-12-01', 'and steps back across a year');
  t.eq(shiftAnchor('week', '2026-09-11', -1), '2026-09-04', 'a week step is seven days');

  t.eq(dayIn('2026-09-12T03:00:00Z', 'America/Chicago'), '2026-09-11',
    'a 10pm call in Chicago counts on that evening, not on the UTC date');
  t.eq(dayIn('2026-09-11', 'America/Chicago'), '2026-09-11', 'a bare date is already a day');
  t.eq(timeIn('2026-09-11', 'America/Chicago'), '', 'and has no time to show');
  t.ok(/10:00/.test(timeIn('2026-09-12T03:00:00Z', 'America/Chicago')), 'a timestamp shows its local time');

  const late = buildStream({
    contacts: [{ id: 'c', name: 'Pat', activity: [{ id: 'z', at: '2026-09-12T03:00:00Z', kind: 'call', note: 'x', by: 'u1' }] }],
    from: '2026-09-11', to: '2026-09-11', tz: 'America/Chicago',
  });
  t.eq(late.length, 1, 'the stream windows by the install timezone when it is given one');

  const s = [
    { kind: 'call', by: 'u1' }, { kind: 'call', by: 'u2' }, { kind: 'text', by: 'u1' },
    { kind: 'task', by: 'u1' }, { kind: 'import', by: 'u1', machine: true },
    { kind: 'note', by: 'u2', machine: true },
  ];
  const { byType, byPerson } = tally(s);
  t.eq(byType.total, 4, 'the totals never count a machine entry');
  t.eq(byType.call, 2, 'calls are counted per kind');
  t.eq(byPerson.u1.total, 3, 'and per person');
  t.eq(byPerson.u2.note, 0, 'a machine note wearing a human kind is not somebody\'s note');

  /* A kind a person can do that the screen does not list would be counted
     nowhere: gone from the KPIs, the chart and the table without an error. */
  const keys = ACT_TYPES.map(x => x.key);
  const missing = DOING_KINDS.filter(k => !keys.includes(k));
  t.ok(missing.length === 0, missing.length
    ? `every accomplishment kind has a place on the Activity screen — missing: ${missing.join(', ')}`
    : 'every accomplishment kind has a place on the Activity screen');
  t.ok(keys.includes('task'), 'and finished tasks do too');
}
