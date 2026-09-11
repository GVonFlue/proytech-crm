/* ============================================================================
   Tasks — the bucketing, and the thing this screen exists for.

   Dwell was already WRITING tasks and showing them nowhere: Contracts.jsx
   creates one per contract deadline for the assigned agent, and no screen
   displayed them. So the first assertion here is not about a widget, it is
   that a deadline task lands where somebody would look for it.

   Pure — bucketOf is exported for exactly this reason.
   ========================================================================== */

import { bucketOf, TASK_BUCKETS, whenOf, dueLabel, focusDay, isFocus, withFocus, FOCUS_CAP } from '../src/lib/tasks.js';

const TODAY = '2026-08-22';

export default async function run(t) {
  t.eq(bucketOf({ due: '2026-08-01' }, TODAY), 'overdue', 'a past date is overdue');
  t.eq(bucketOf({ due: TODAY }, TODAY), 'today', 'today is today');
  t.eq(bucketOf({ due: '2026-08-23' }, TODAY), 'week', 'tomorrow is inside the week');
  t.eq(bucketOf({ due: '2026-08-29' }, TODAY), 'week', 'and so is day seven');
  t.eq(bucketOf({ due: '2026-08-30' }, TODAY), 'later', 'day eight is later');
  t.eq(bucketOf({ due: null }, TODAY), 'none', 'no date is its own bucket');
  t.eq(bucketOf({ due: 'not a date' }, TODAY), 'none', 'and so is a date nothing can read');
  t.eq(bucketOf({}, TODAY), 'none', 'a task with no due field does not throw');

  /* The bucket order is the order a day gets worked, and "no date" is LAST on
     purpose: an undated task is the one thing here nobody promised. */
  t.eq(TASK_BUCKETS.map(b => b.key).join(','), 'overdue,today,week,later,none',
    'and the bucket order is the order a day gets worked, with "no date" last');

  await runPort(t);
}

/* ---- ported from ProyTech: the When filter, the due chip, and Focus ---- */

export async function runPort(t) {
  t.eq(whenOf({ due: '2026-08-20' }, TODAY), 'today', '"Due today" includes overdue work');
  t.eq(whenOf({ due: TODAY }, TODAY), 'today', 'and today itself');
  t.eq(whenOf({ due: '2026-08-23' }, TODAY), 'later', 'tomorrow is upcoming');
  t.eq(whenOf({}, TODAY), 'none', 'no date is its own filter');

  t.eq(dueLabel({ due: '2026-08-19' }, TODAY), '3d overdue', 'the due chip counts days overdue');
  t.eq(dueLabel({ due: TODAY }, TODAY), 'Due today', 'says due today');
  t.eq(dueLabel({ due: '2026-08-23' }, TODAY), 'Due tomorrow', 'says due tomorrow');
  t.eq(dueLabel({ due: '2026-08-26' }, TODAY), 'Due in 4d', 'and counts days ahead');
  t.eq(dueLabel({ due: null }, TODAY), 'No date', 'and says so when there is no date');

  /* 4am in Chicago on Aug 22 (CDT, UTC-5) is 09:00Z */
  t.eq(focusDay('America/Chicago', new Date('2026-08-22T08:59:00Z')), '2026-08-21',
    'Focus still belongs to yesterday at 3:59am, so working late does not clear it');
  t.eq(focusDay('America/Chicago', new Date('2026-08-22T09:00:00Z')), '2026-08-22',
    'and rolls to today at 4:00am in the install timezone');
  t.eq(focusDay('America/Chicago', new Date('2026-08-23T03:30:00Z')), '2026-08-22',
    'an evening in Chicago is still that day, even though UTC has moved on');

  const day = '2026-08-22';
  const a = withFocus({ id: 'x' }, true, day);
  t.ok(isFocus(a, day), 'pulling a task into Focus flags it for the day');
  t.ok(!isFocus(a, '2026-08-23'), 'and the flag expires on its own the next day');
  t.eq(a.focusCount, 1, 'the first pick counts once');
  const b = withFocus(withFocus(a, false, day), true, day);
  t.eq(b.focusCount, 1, 'off and on again the same day is still one pick');
  const c = withFocus(b, true, '2026-08-23');
  t.eq(c.focusCount, 2, 'picking it again on another day counts a second time');
  t.eq(FOCUS_CAP, 6, 'the Focus cap is six');
}
