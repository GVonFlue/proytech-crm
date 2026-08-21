/* Machine notes are not human contact — and the list cannot go stale quietly.
   ============================================================================

   The app writes notes about itself, stored as type:'Note', identical in shape
   to a note a person typed. Anything that counts notes counts the app talking
   to itself as contact, and anything that asks "when did we last speak" gets
   answered by a stage change.

   TOUCH-COUNT-FINDING.md listed 18 such prefixes. Checking them against the
   code that actually writes notes turned up two more it never had:

     Reassigned from X to Y.     added later, by the batch-reassign work
     Checklist: "X" ...          both the applies-again and not-applicable notes

   That is the real problem with a hand-maintained list of prefixes: it was
   already stale, and nothing said so. So the second half of this file does not
   test the predicate at all — it scans the source for note writers and fails
   when one appears that the predicate does not match. The list is the fallback
   for rows already in the database; this is what keeps it honest.

   Run standalone:  node tests/systemnotes.mjs
*/
import fs from 'fs';
import esbuild from 'esbuild';

/* lib/lead.js reaches for ./brand and lucide-react, neither of which node can
   resolve extensionless, so it is bundled the way every other test here does
   it rather than being imported raw. */
const built = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.bsn.mjs', built.outputFiles[0].text);
const { isSystemNote, isRealTouch, lastTouch, daysSinceTouch, SYS_NOTE } =
  await import('./.bsn.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 500) : '')); } };

const N = (text, extra) => ({ id:'x', ts:'2026-08-01T00:00:00.000Z', type:'Note', text, ...extra });

/* ---------- the predicate ---------- */
console.log('\nthe predicate');
for (const t of [
  'Lead created.', 'Follow-up cleared.', 'Follow-up done — 2026-08-01',
  'Stage moved: New Lead → Proposal Sent', 'Deal value set to $3,500.',
  'Phase → Onboarding', 'Close date set to Aug 1 — now counted in revenue.',
  'Commission approved — $525 to Tony.', 'Commission voided — Tony.',
  'Converted to client — onboarding started.', 'Signed — onboarding started.',
  'Reverted to lead — back to Proposal Sent. Delivery progress kept.',
  'Invoice 1004 marked unpaid — $1,200 removed.',
  'Payment confirmed Aug 12 — $3,500 now counting.',
  'Payment marked as not collected.', 'Deal closed: Build — $3,500',
  'New build started: Phase 2. Previous checklist archived.',
  'Sponsorship logged: Rotary — $500', 'Dated: Discovery — Mon, Aug 24, 1:15 PM',
  'Reassigned from Garrett to Tony Porter.',
  'Checklist: "Kickoff call" marked not applicable.',
]) ok(`machine: ${t.slice(0, 42)}`, isSystemNote(N(t)), t);

for (const t of [
  'She wants it live before September.',
  'Saw him at the chamber lunch — asked about the new build.',
  'Reassigned seating at the event was a nightmare.',   // starts like one, is not
  'Checklists are not his thing.',                      // ditto
  'Invoiced him verbally, said he would pay Friday.',   // "Invoice " needs the space
]) ok(`human:   ${t.slice(0, 42)}`, !isSystemNote(N(t)), t);

ok('a derived note is never a machine note', !isSystemNote(N('Lead created.', { derived:true })));
ok('only notes are ever machine notes', !isSystemNote({ type:'Call', text:'Lead created.' }));

/* ---------- what counts as a touch ---------- */
console.log('\nwhat counts as contact');
for (const type of ['Call','Text','Email','Meeting','Booked','Payment'])
  ok(`${type} is a real touch`, isRealTouch({ type, ts:'2026-08-01' }));
ok('a human note is a real touch', isRealTouch(N('Saw him at the lunch.')));
ok('a machine note is not', !isRealTouch(N('Follow-up cleared.')));

/* ---------- lastTouch ---------- */
console.log('\nlast touch');
const created = '2026-01-01T00:00:00.000Z';
const quiet = { createdAt: created, activities: [
  N('Lead created.', { ts: created }),
  N('Stage moved: New Lead → Proposal Sent', { ts: '2026-08-01T00:00:00.000Z' }),
  N('Follow-up cleared.', { ts: '2026-08-20T00:00:00.000Z' }),
] };
ok('a record with only machine notes has never been contacted',
   lastTouch(quiet) === null, String(lastTouch(quiet)));
ok('  and days-since is null, not zero and not a number of days',
   daysSinceTouch(quiet, '2026-08-21T00:00:00.000Z') === null,
   String(daysSinceTouch(quiet, '2026-08-21T00:00:00.000Z')));

const spoke = { createdAt: created, activities: [
  { id:'a', ts:'2026-06-11T00:00:00.000Z', type:'Call', text:'Rang him.' },
  N('Follow-up cleared.', { ts: '2026-08-20T00:00:00.000Z' }),
] };
ok('the newest MACHINE note does not count as the last touch',
   lastTouch(spoke) === '2026-06-11T00:00:00.000Z', String(lastTouch(spoke)));
ok('  so days-since measures the silence, not the bookkeeping',
   daysSinceTouch(spoke, '2026-08-21T00:00:00.000Z') === 71,
   String(daysSinceTouch(spoke, '2026-08-21T00:00:00.000Z')));
ok('no activities at all is never contacted, not day zero',
   lastTouch({ createdAt: created, activities: [] }) === null);
ok('a missing lead does not throw', lastTouch(null) === null && daysSinceTouch(null) === null);

/* ---------- the staleness guard ---------- */
console.log('\nthe guard: every note the app writes is classified');

/* Notes whose text is a variable, checked by hand and recorded here with the
   reason. Anything NOT on this list has to be statically readable, so a new
   dynamic writer shows up as a failure rather than slipping through. */
const HUMAN_DYNAMIC = {
  'text:body': 'publishLogToLead — what a person typed into a meeting log',
  'text:o.note': 'mkLead seed — the note supplied with a seeded lead',
};

const found = [], unreadable = [];
for (const file of ['src/App.jsx', 'src/LeadView.jsx']) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /type:\s*'Note'\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    /* look ahead a little for this object's own text: — the writers put it
       within a line or two, and stopping at the next type:'Note' keeps one
       writer from reading another's text */
    /* the window starts AFTER this match and stops at the next one, so a
       writer can never read the text of the writer below it */
    const win = src.slice(m.index + m[0].length, m.index + 500).split(/type:\s*'Note'/)[0];
    /* `text:` may be a plain literal or a ternary between two of them —
       both branches are read, so a ternary cannot hide a new note behind a
       branch nobody looked at */
    const t = /text:\s*(?:[A-Za-z_$][\w$.]*\s*\?\s*)?(`|')/.exec(win);
    if (!t) {
      const v = /text:\s*([A-Za-z_$][\w$.]*)/.exec(win);
      const key = v ? 'text:' + v[1] : null;
      if (key && HUMAN_DYNAMIC[key]) continue;
      unreadable.push(`${file}: ${win.slice(0, 90).replace(/\s+/g, ' ')}`);
      continue;
    }
    const q = t[1];
    const rest = win.slice(t.index + t[0].length);
    /* the static head: up to the first interpolation or the closing quote */
    const head = rest.split(q)[0].split('${')[0];
    if (head.trim()) found.push({ file, head });
    /* the other branch of a ternary, when there is one */
    const after = rest.slice(rest.indexOf(q) + 1);
    const alt = /^\s*:\s*(`|')/.exec(after);
    if (alt) {
      const h2 = after.slice(alt.index + alt[0].length).split(alt[1])[0].split('${')[0];
      if (h2.trim()) found.push({ file, head: h2 });
    }
  }
}

ok(`every note writer's text is readable (${found.length} found)`,
   unreadable.length === 0, unreadable.join('\n        '));

const missed = found.filter(f => !SYS_NOTE.test(f.head));
/* A machine note starts with a literal sentence. If the predicate does not
   match one of these heads, either it is a new machine note that needs adding
   to SYS_NOTE, or it is human text that should be in HUMAN_DYNAMIC. */
ok('every one of them is classified as a machine note',
   missed.length === 0,
   missed.map(f => `${f.file}: "${f.head.slice(0, 60)}"`).join('\n        '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
