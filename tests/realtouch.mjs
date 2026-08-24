/* A machine note is not a response to a lead.
   ============================================================================

   REAL_TOUCH was: any activity whose text is not exactly 'Lead created.'. One
   machine note excluded out of twenty-one, so a stage change, a cleared
   follow-up or a deal-value edit each counted as somebody contacting the lead.

   Measured on the real database before the change, 146 leads:

     untouched            7  ->  34      27 leads had NO contact at all
     first touch (mean) 5.1h -> 3.5h     the population changed, not the leads
     paired first touch 3.5h -> 3.5h     0.0 hours added, per lead

   That second and third line together are the whole shape of this correction:
   for every lead that was genuinely worked the real touch already came first
   and the machine note came after, so speed-to-lead does not move. The mean
   improves only because 27 leads stop contributing a fictional slow first
   touch. All of the real correction lands on the untouched list.

   Both halves are asserted below, because a change that only made the
   untouched list longer would be indistinguishable from one that also broke
   speed-to-lead for everyone.

   Pure functions, no DOM.
*/
import fs from 'fs';
import esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.brt.mjs', built.outputFiles[0].text);
const { isRealTouch } = await import('./.brt.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const at = h => new Date(Date.parse('2026-08-01T09:00:00.000Z') + h * 36e5).toISOString();
const CREATED = at(0);
/* the old predicate, kept here so the two can be compared rather than asserted
   from memory */
const OLD = a => a && a.ts && a.text !== 'Lead created.';
/* the same arithmetic firstTouchHrs does */
const firstTouch = (l, pred) => {
  const acts = (l.activities||[]).filter(pred);
  if (!acts.length || !l.createdAt) return null;
  const first = acts.reduce((mn,a) => (!mn || a.ts < mn) ? a.ts : mn, null);
  return (new Date(first) - new Date(l.createdAt)) / 36e5;
};

/* A lead nobody ever contacted: created, then the app wrote about it twice. */
const FICTION = { id:'a', createdAt: CREATED, activities:[
  { id:'1', ts: at(0),  type:'Note', text:'Lead created.' },
  { id:'2', ts: at(26), type:'Note', text:'Stage moved: New Lead → Proposal Sent' },
  { id:'3', ts: at(40), type:'Note', text:'Follow-up cleared.' },
] };
/* A lead genuinely worked: called within the hour, bookkeeping afterwards. */
const WORKED = { id:'b', createdAt: CREATED, activities:[
  { id:'1', ts: at(0),   type:'Note', text:'Lead created.' },
  { id:'2', ts: at(0.5), type:'Call', text:'Rang her.' },
  { id:'3', ts: at(30),  type:'Note', text:'Deal value set to $3,500.' },
] };
/* And one worked only by a human note — the relationship-shaped case. */
const NOTED = { id:'c', createdAt: CREATED, activities:[
  { id:'1', ts: at(0), type:'Note', text:'Lead created.' },
  { id:'2', ts: at(2), type:'Note', text:'Saw him at the chamber lunch.' },
] };

console.log('\nthe untouched list — where the whole correction lands');
ok('a lead whose only activity is the app writing to itself is UNTOUCHED',
   !(FICTION.activities.some(isRealTouch)));
ok('  it was counted as contacted before', FICTION.activities.some(OLD));
ok('a lead that was actually called is not untouched', WORKED.activities.some(isRealTouch));
ok('a lead worked only by a human note is not untouched', NOTED.activities.some(isRealTouch));

console.log('\nspeed to lead — measured as unchanged, asserted as unchanged');
ok('a worked lead keeps the same first touch',
   firstTouch(WORKED, OLD) === firstTouch(WORKED, isRealTouch),
   `${firstTouch(WORKED, OLD)} vs ${firstTouch(WORKED, isRealTouch)}`);
ok('  and it is the call, not the bookkeeping', firstTouch(WORKED, isRealTouch) === 0.5,
   String(firstTouch(WORKED, isRealTouch)));
ok('a human note is a first touch too', firstTouch(NOTED, isRealTouch) === 2,
   String(firstTouch(NOTED, isRealTouch)));

console.log('\nand the fiction stops being a data point at all');
ok('the never-contacted lead HAD a first touch under the old predicate',
   firstTouch(FICTION, OLD) === 26, String(firstTouch(FICTION, OLD)));
ok('  and has none under the new one — it leaves the average rather than moving it',
   firstTouch(FICTION, isRealTouch) === null, String(firstTouch(FICTION, isRealTouch)));

/* This is why the measured mean improved while no lead got faster: the 26h
   fiction was dragging the average up, and it is simply gone. */
const before = [FICTION, WORKED, NOTED].map(l => firstTouch(l, OLD)).filter(h => h !== null);
const after  = [FICTION, WORKED, NOTED].map(l => firstTouch(l, isRealTouch)).filter(h => h !== null);
const mean = a => a.reduce((x,y) => x+y, 0) / a.length;
ok('the mean improves without any lead improving',
   mean(after) < mean(before) && firstTouch(WORKED, OLD) === firstTouch(WORKED, isRealTouch),
   `mean ${mean(before).toFixed(2)}h -> ${mean(after).toFixed(2)}h`);

/* ---------------------------------------------------------------------------
   AND THE CLOCK, not just the predicate.

   lastTouchTs and lastContact are both gone. They took the newest activity of
   ANY type and fell back to createdAt, so a machine note reset the clock and a
   brand-new lead read as contacted the day it arrived.

   Measured on the real database before the change, 167 leads:

     becomes_never_contacted   34     no real touch at all
     clock_moves_back          28     displayed age increases
     avg_days_added           2.0     worst 48.9
     newly_cold_7              48     newly_cold_14 41, newly_cold_30 38
     got_warmer_must_be_zero    0     ignoring activity can only age a clock

   The last line is the invariant worth keeping: no lead may get warmer.
   -------------------------------------------------------------------------- */
console.log('\nthe clock');
const { lastTouch, daysSinceTouch } = await import('./.brt.mjs?v=' + Date.now());

ok('a machine note does not reset the clock',
   lastTouch(FICTION) === null && lastTouch(WORKED) === at(0.5),
   `${lastTouch(FICTION)} / ${lastTouch(WORKED)}`);
ok('  the newest machine note is ignored even when it is the newest activity',
   lastTouch(WORKED) === at(0.5), String(lastTouch(WORKED)));
ok('a brand-new lead is NOT contacted the day it arrives',
   lastTouch({ createdAt: CREATED, activities: [] }) === null);
ok('never contacted reads as null, not as a number of days',
   daysSinceTouch(FICTION) === null, String(daysSinceTouch(FICTION)));

/* the invariant the measurement asserts against the real data, asserted here
   against fixtures: dropping activities from consideration can only make a
   clock older, never newer */
const oldClock = l => { const ts=(l.activities||[]).map(a=>a.ts).sort().pop(); return ts||l.createdAt; };
for (const [name, l] of [['worked', WORKED], ['noted', NOTED], ['fiction', FICTION]]) {
  const nu = lastTouch(l);
  ok(`${name}: the clock never gets warmer`,
     nu === null || String(nu) <= String(oldClock(l)), `${nu} vs ${oldClock(l)}`);
}

/* ---------------------------------------------------------------------------
   THE IMPORTED NOTE.

   The importer writes the CSV note column as a Note stamped at createdAt, with
   no `who` and — until now — no marker at all. isRealTouch counted it, so a
   lead nobody had contacted read as worked, and its first touch computed as
   zero hours because the stamp IS the creation time.

   Measured before the change, 167 leads: 21 move into untouched, and the mean
   first touch goes 3.0h -> 3.5h as the fake zeros leave. Nothing gets faster.
   -------------------------------------------------------------------------- */
console.log('\nthe imported note');
const IMPORTED = { id:'d', createdAt: CREATED, importBatch:'imp_x', activities:[
  { id:'1', ts: at(0), type:'Note', text:'Lead created.' },
  { id:'2', ts: at(0), type:'Note', text:'Called last spring, wants a quote', imported:true },
] };
ok('an imported note is not contact', !IMPORTED.activities.some(isRealTouch));
ok('  so the lead is never-contacted, not worked', lastTouch(IMPORTED) === null);
ok('  and it has no first touch to flatter the average',
   firstTouch(IMPORTED, isRealTouch) === null, String(firstTouch(IMPORTED, isRealTouch)));
ok('  it WAS counted before the marker existed',
   IMPORTED.activities.some(a => a.type === 'Note' && !/^Lead created/.test(a.text)),
   'the same note without imported:true is an ordinary human note');

/* the identical text, typed by a person, still counts — the marker is doing the
   work, not a guess about the wording */
const TYPED = { ...IMPORTED, activities: IMPORTED.activities.map(a => { const { imported, ...rest } = a; return rest; }) };
ok('the same text typed by a person still counts',
   TYPED.activities.some(isRealTouch) && lastTouch(TYPED) === at(0));

/* ---------------------------------------------------------------------------
   THE NO-ANSWER.

   Same shape as the imported note, at far greater volume. A new rep runs at one
   booking per twenty-five to thirty dials, so MOST of his rows are no-answers.
   Counting them as contact would take every dialled-once lead off the untouched
   list, reset its clock to today, and give it a first touch measured from a
   call in which nobody said anything.

   The gate is on the DISPOSITION, not the type: 'Call' stays in REACHED_TYPES,
   so nothing an owner logs changes. That is the whole reason it is a field on a
   call rather than a new activity type.
   -------------------------------------------------------------------------- */
console.log('\nthe no-answer');
const { dispIsContact, CONTACT_DISP, DISPOSITIONS } = await import('./.brt.mjs?v=' + Date.now());

const dialed = (code, h = 1) => ({ id:'x', createdAt: CREATED, activities:[
  { id:'1', ts: at(0), type:'Note', text:'Lead created.' },
  { id:'2', ts: at(h), type:'Call', disp: code, text:'Dialled.' },
] });

const NA_ONLY  = dialed('NA');
const BAD_ONLY = dialed('BAD');
const VM_ONLY  = dialed('VM');

ok('a no-answer is not contact', !NA_ONLY.activities.some(isRealTouch));
ok('  so a dialled-once lead is still UNTOUCHED', lastTouch(NA_ONLY) === null);
ok('  and has no first touch to flatter the average',
   firstTouch(NA_ONLY, isRealTouch) === null, String(firstTouch(NA_ONLY, isRealTouch)));
ok('a bad number is not contact either', !BAD_ONLY.activities.some(isRealTouch));
ok('  and it is untouched too', lastTouch(BAD_ONLY) === null);

/* VM is the line between them: a voicemail left a real message at a real
   moment, so it IS contact. Getting this wrong in the other direction would
   erase genuine outreach. */
ok('a voicemail IS contact', VM_ONLY.activities.some(isRealTouch));
ok('  and it sets the clock', lastTouch(VM_ONLY) === at(1));
ok('  and it is a first touch', firstTouch(VM_ONLY, isRealTouch) === 1);

/* The owners never set a disposition. Every existing row in the database has
   none. Both must behave exactly as they did before this vocabulary existed —
   that is the whole "identical before and after the deploy" property. */
const OWNER_CALL = { id:'o', createdAt: CREATED, activities:[
  { id:'1', ts: at(0), type:'Note', text:'Lead created.' },
  { id:'2', ts: at(3), type:'Call', text:'Rang him.', who:'Garrett' },
] };
ok('an undisposed call is unchanged — the owners log exactly as before',
   OWNER_CALL.activities.some(isRealTouch) && lastTouch(OWNER_CALL) === at(3));
ok('  dispIsContact defaults to true, and that default is closed at the WRITE',
   dispIsContact({ type:'Call' }) === true);

/* An allowlist, so a code added later and forgotten defaults to NOT contact.
   A denylist would fail the other way and silently count it. */
ok('an unknown disposition is NOT contact — the set is an allowlist',
   dispIsContact({ disp:'ZZ' }) === false);
ok('  every contact code is in the set',
   DISPOSITIONS.filter(d => d.contact).every(d => CONTACT_DISP.has(d.code)));
ok('  and neither no-contact code is',
   !CONTACT_DISP.has('NA') && !CONTACT_DISP.has('BAD'));

/* The invariant, extended to dispositions: declining to count an activity can
   only age a clock, never warm it. */
for (const [name, l] of [['na', NA_ONLY], ['bad', BAD_ONLY], ['vm', VM_ONLY]]) {
  const nu = lastTouch(l);
  ok(`${name}: the clock never gets warmer`,
     nu === null || String(nu) <= String(oldClock(l)), `${nu} vs ${oldClock(l)}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
