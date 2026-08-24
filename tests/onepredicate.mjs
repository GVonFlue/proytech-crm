/* ONE QUESTION, ONE ANSWER — every "has anybody contacted this lead?" agrees.
   ============================================================================

   There were THREE definitions of untouched in src/App.jsx, and nothing showed
   two of them at once, so they diverged in silence:

     line 412      !activities.some(isRealTouch)          dashboard
     metrics block !activities.some(isRealTouch)          "N never contacted"
     the Leads screen  !activities.some(REACHED_TYPES.has(type))   "to work"

   MEASURED ON THE REAL DATABASE BEFORE THE FIX, 170 leads: 29 disagreed.

     28  "to work" said call them, the dashboard said already contacted
         — worked only by a typed note. 21 of those are unmarked import notes
         (IMPORT-NOTE-BACKFILL.sql); ~7 are genuine.
      1  "to work" said contacted, the dashboard said never
         — a Call carrying disp:'NA'.

   THE SECOND DIRECTION IS THE ONE THAT MATTERS AND IT IS NOT ONE ROW. It is
   every lead a rep dials and does not reach, and a new rep is expected at one
   booking per twenty-five to thirty dials. Left alone, the to-work list would
   have emptied itself of precisely the leads still needing a call.

   THIS SUITE IS NOT A UNIT TEST OF isRealTouch. tests/realtouch.mjs owns that.
   What this owns is the claim that the SCREENS CANNOT DISAGREE — asserted by
   running the real screen's predicate over fixtures built from the shapes the
   measurement actually found, rather than by reading the source and hoping.

   Pure functions, no DOM.
*/
import fs from 'fs';
import esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.bop.mjs', built.outputFiles[0].text);
const { isRealTouch, REACHED_TYPES } = await import('./.bop.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const ago = n => new Date(Date.now() - n * 864e5).toISOString();

/* The three definitions, as functions, so they can be run against the same
   lead and compared. `LEADS_OLD` is what the Leads screen used to do — kept
   here so the fix is demonstrated rather than asserted from memory. */
const LEADS_OLD = l => !(l.activities || []).some(a => a && REACHED_TYPES.has(a.type));
const SHARED    = l => !(l.activities || []).some(isRealTouch);

/* ------------------------------------------------------------ the fixtures */

const created = ago(10);
const mk = (name, ...acts) => ({ id:name, name, createdAt: created,
  activities: [{ id:'c', ts: created, type:'Note', text:'Lead created.' }, ...acts] });

/* Direction A, the growing one: dialled, nobody picked up. */
const NO_ANSWER   = mk('no answer',  { id:'1', ts: ago(1), type:'Call', disp:'NA',  text:'No answer.', who:'Tony' });
const BAD_NUMBER  = mk('bad number', { id:'1', ts: ago(1), type:'Call', disp:'BAD', text:'Disconnected.', who:'Tony' });
/* Direction B, the pre-existing one: worked entirely by a typed note. */
const NOTE_WORKED = mk('note worked', { id:'1', ts: ago(2), type:'Note', text:'Saw him at the chamber lunch.', who:'Garrett' });
/* The 21: an import note, before and after the backfill marks it. */
const IMPORT_RAW  = mk('import raw',    { id:'1', ts: created, type:'Note', text:'Called last spring, wants a quote' });
const IMPORT_MARK = mk('import marked', { id:'1', ts: created, type:'Note', text:'Called last spring, wants a quote', imported:true });
/* Genuinely worked, and genuinely never touched. */
const CALLED      = mk('called', { id:'1', ts: ago(1), type:'Call', disp:'CB', text:'Spoke to her.', who:'Tony' });
const VOICEMAIL   = mk('voicemail', { id:'1', ts: ago(1), type:'Call', disp:'VM', text:'Left one.', who:'Tony' });
const NEVER       = mk('never');

/* There is deliberately NO "both screens agree" loop here. After the fix they
   call the same function, so any such assertion would compare a function to
   itself and pass forever — a green line that proves nothing and inflates the
   count. What CAN be asserted is that the two rules differ on exactly the
   shapes the measurement found, and that the source really does call the
   shared one; both are below. */

console.log('\nand the old Leads-screen rule disagreed on precisely the measured shapes');
ok('A — a no-answer: the old rule called it worked', LEADS_OLD(NO_ANSWER) === false);
ok('  the shared rule calls it untouched', SHARED(NO_ANSWER) === true);
ok('  so they disagreed', LEADS_OLD(NO_ANSWER) !== SHARED(NO_ANSWER));
ok('A — a bad number, same shape', LEADS_OLD(BAD_NUMBER) !== SHARED(BAD_NUMBER));

ok('B — worked by a typed note: the old rule called it untouched', LEADS_OLD(NOTE_WORKED) === true);
ok('  the shared rule calls it contacted', SHARED(NOTE_WORKED) === false);
ok('  so they disagreed', LEADS_OLD(NOTE_WORKED) !== SHARED(NOTE_WORKED));

console.log('\nthe shapes both rules already agreed on stay put');
ok('a real call is contacted either way', LEADS_OLD(CALLED) === false && SHARED(CALLED) === false);
ok('a voicemail is contacted either way', LEADS_OLD(VOICEMAIL) === false && SHARED(VOICEMAIL) === false);
ok('a lead with nothing on it is untouched either way', LEADS_OLD(NEVER) === true && SHARED(NEVER) === true);

console.log('\nTHE ORDERING CONSTRAINT — why the backfill runs first');
{
  /* Before the backfill an import note is indistinguishable from a typed one,
     so isRealTouch counts it. Shipping the fix first would therefore take 21
     leads NOBODY HAS EVER SPOKEN TO off the to-work list — the opposite of
     what the fix is for, and invisible, because they simply stop appearing. */
  ok('unmarked, an import note reads as contact', SHARED(IMPORT_RAW) === false);
  ok('  so the fix alone would drop it off the to-work list',
     LEADS_OLD(IMPORT_RAW) === true && SHARED(IMPORT_RAW) === false);
  ok('marked, it reads as no contact', SHARED(IMPORT_MARK) === true);
  ok('  and the lead is back on the to-work list where it belongs',
     LEADS_OLD(IMPORT_MARK) === true && SHARED(IMPORT_MARK) === true);
  ok('  which is the whole reason the backfill runs BEFORE the deploy',
     SHARED(IMPORT_RAW) !== SHARED(IMPORT_MARK));
}

console.log('\nthe fix can only ADD leads to the to-work list, never silently remove one');
{
  /* The invariant worth keeping, and the one that would have caught shipping
     this in the wrong order. Once the backfill has run, every shape either
     stays where it was or moves ONTO the list — never off it. A lead
     disappearing from a call list is the failure nobody notices. */
  const after = [NO_ANSWER, BAD_NUMBER, IMPORT_MARK, CALLED, VOICEMAIL, NEVER, NOTE_WORKED];
  const removed = after.filter(l => LEADS_OLD(l) === true && SHARED(l) === false);
  ok('nothing is removed except the genuinely note-worked lead',
     removed.length === 1 && removed[0].name === 'note worked',
     removed.map(l => l.name).join(', '));
  const added = after.filter(l => LEADS_OLD(l) === false && SHARED(l) === true);
  ok('and the no-contact dispositions are added back',
     added.map(l => l.name).sort().join(',') === 'bad number,no answer',
     added.map(l => l.name).join(', '));
}

console.log('\nsrc/App.jsx really does call the shared predicate now');
{
  /* Structural, because the two above are pure-function claims and the actual
     regression would be someone re-inlining REACHED_TYPES on that line. */
  const src = fs.readFileSync('src/App.jsx', 'utf8');
  ok('the to-work rule calls isRealTouch',
     /const untouched=l=>!\(l\.activities\|\|\[\]\)\.some\(isRealTouch\)/.test(src));
  ok('and no longer tests REACHED_TYPES itself',
     !/const untouched=l=>!\(l\.activities\|\|\[\]\)\.some\(a=>a&&REACHED_TYPES\.has/.test(src));
  /* The batch-delete warning still reads raw types. That is DELIBERATE and
     out of scope here: it guards a destructive action, and narrowing what
     counts as "real activity on these leads" would make that warning quieter,
     which is not a change to make without measuring it. Pinned so it is a
     decision rather than something nobody noticed. */
  ok('the batch-delete warning is knowingly left alone',
     /withWork=hit\.filter\(l=>\(l\.activities\|\|\[\]\)\.some\(a=>REACHED_TYPES\.has\(a\.type\)\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
