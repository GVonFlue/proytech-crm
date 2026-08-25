/* A REP'S WORK, AND THE PLAYBOOK GATE.
   ============================================================================

   Two features that share one principle: MEASURE WHAT HE DID, NOT WHETHER HE
   WAS LOGGED IN.

   There is deliberately no session length anywhere in this suite, because there
   is none in the product. A rep here is an independent contractor and
   SALES-SOPS.md says so in its own words — "nothing in here sets your hours".
   An hours-logged record would be evidence against that agreement, and it would
   measure a browser tab: a rep with the app open all day and twelve dials would
   outrank one who dialled sixty in two focused hours.

   WHAT THIS SUITE OWNS

     1. Block detection. SOP-01's calling block, recovered from the gaps between
        real dials, which is how "did he run two blocks" gets an honest answer.
     2. Attribution. whoId is exact; `who` is a display NAME and is the weak
        link in every per-rep number, so both paths are pinned.
     3. The gate's STATES, especially the ones that must fail open. An install
        that has not run the migration, or has published nothing, must never
        lock a rep out of the whole app.
     4. A reset is a row, not a deletion — the acknowledgement survives it.

   Pure functions, no DOM.
*/
import fs from 'fs';
import esbuild from 'esbuild';

const build = async (entry, out) => {
  const b = await esbuild.build({ entryPoints:[entry], bundle:true, write:false, format:'esm',
    jsx:'automatic', loader:{'.js':'jsx'}, define:{'import.meta.env':'__ENV__'},
    banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'}, logLevel:'silent' });
  fs.writeFileSync(out, b.outputFiles[0].text);
  return import('./' + out.split('/').pop() + '?v=' + Date.now());
};
const W = await build('src/lib/repwork.js', 'tests/.bra.mjs');
const K = await build('src/lib/kb.js', 'tests/.brb.mjs');
const L = await build('src/lib/lead.js', 'tests/.brc2.mjs');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const T = (h, m = 0) => `2026-08-26T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00.000Z`;
const dial = (h, m, disp, who = 'Tony', whoId = 'u_tony') =>
  ({ id: `${h}${m}`, ts: T(h, m), type: 'Call', disp, text: 'x', who, whoId });

console.log('\nblocks come from the gaps between dials, not from a clock');
{
  /* A morning block, a long break, an afternoon block. This is the shape
     SOP-01 describes and the shape the profile has to recover. */
  const day = [
    dial(9, 12, 'NA'), dial(9, 20, 'NA'), dial(9, 31, 'VM'), dial(9, 48, 'CB'),
    dial(16, 5, 'NA'), dial(16, 22, 'BK'), dial(16, 40, 'NA'),
  ];
  const b = W.blocksOf(day);
  ok('two sittings become two blocks', b.length === 2, JSON.stringify(b.map(x => x.n)));
  ok('  the first holds its four dials', b[0].n === 4, String(b[0].n));
  ok('  the second holds its three', b[1].n === 3, String(b[1].n));
  ok('  and each knows when it started and stopped',
     b[0].from === T(9,12) && b[0].to === T(9,48), JSON.stringify(b[0]));

  /* A five-minute break between sets is INSIDE a block — SOP-01's own rhythm.
     A gap rule that split on it would report four blocks for one morning. */
  const sets = [dial(9,0,'NA'), dial(9,18,'NA'), dial(9,23,'NA'), dial(9,40,'NA')];
  ok('a short break between sets does not end a block', W.blocksOf(sets).length === 1,
     String(W.blocksOf(sets).length));

  ok('exactly at the gap is still the same block', W.blocksOf([dial(9,0,'NA'), dial(9,20,'NA')]).length === 1);
  ok('one minute past it is a new one', W.blocksOf([dial(9,0,'NA'), dial(9,21,'NA')]).length === 2);
  ok('a day with no dials has NO blocks, not one empty one', W.blocksOf([]).length === 0);
  ok('an unreadable timestamp is skipped rather than counted as now',
     W.blocksOf([{ ts: 'not a date', disp: 'NA' }]).length === 0);
}

console.log('\nattribution — whoId is exact, the name is the fallback');
{
  const rep = { id: 'u_tony', name: 'Tony' };
  ok('an id match counts', W.actIsBy({ whoId: 'u_tony', who: 'anything' }, rep));
  ok('a different id does NOT, even when the name agrees',
     !W.actIsBy({ whoId: 'u_someone', who: 'Tony' }, rep));
  /* Older rows have no id. They must keep counting, or every number on the
     profile would read zero until the log turned over. */
  ok('an older row with no id falls back to the name', W.actIsBy({ who: 'Tony' }, rep));
  ok('  case and spacing do not matter', W.actIsBy({ who: '  tony ' }, rep));
  ok('somebody else does not count', !W.actIsBy({ who: 'Logan' }, rep));
  /* The known weakness, pinned so it is a documented limit rather than a
     surprise: two people called Tony are indistinguishable on old rows. */
  ok('two people sharing a name ARE indistinguishable without an id — known limit',
     W.actIsBy({ who: 'Tony' }, { id: 'u_other', name: 'Tony' }));
}

console.log('\nthe day, as the profile reports it');
{
  const day = [
    dial(9, 12, 'NA'), dial(9, 20, 'BAD'), dial(9, 31, 'VM'), dial(9, 48, 'CB'),
    dial(16, 5, 'BK'),
    { id: 'n', ts: T(11, 0), type: 'Note', text: 'Chased by text.', who: 'Tony', whoId: 'u_tony' },
  ];
  const st = W.dayStats(day, L.CONTACT_DISP);
  /* A dial is an activity carrying a DISPOSITION. The note is not a dial. */
  ok('dials count dispositions, not activities', st.dials === 5, String(st.dials));
  /* Conversations is the disposition vocabulary and NOT isRealTouch: a
     voicemail is contact, but nobody had a conversation. */
  ok('a voicemail is contact but is not a conversation', st.conversations === 2,
     String(st.conversations));
  ok('bookings are counted from BK', st.bookings === 1, String(st.bookings));
  ok('every code is broken out', st.byCode.NA === 1 && st.byCode.BAD === 1 && st.byCode.BK === 1,
     JSON.stringify(st.byCode));
  /* Four, not six: the no-answer and the bad number are dials but they are not
     contact, so they are absent here and present in `dials`. The two numbers
     answering different questions on the same day is the whole point of
     keeping the disposition vocabulary and isRealTouch apart. */
  ok('touches counts contact, so NA and BAD are dials but not touches',
     st.touches === 4, String(st.touches));
  /* The note sits at 11:00 but LAST in the array. dayStats must sort rather
     than trust the caller, or a day reads as starting when it ended. */
  ok('first and last are the ends of the day, not a duration',
     st.first === T(9,12) && st.last === T(16,5), st.first + ' / ' + st.last);
  ok('  and the input is sorted here, not assumed',
     W.dayStats([dial(16,5,'BK'), dial(9,12,'NA')], L.CONTACT_DISP).first === T(9,12));
  ok('blocks are computed from the dials only', st.blocks.length === 2, JSON.stringify(st.blocks));

  /* Too early to say is not the same as failing. */
  ok('dials per booking with no bookings is null, not zero',
     W.dialsPerBooking(40, 0) === null);
  ok('  and reads as a rate when there is one', W.dialsPerBooking(41, 2) === 20.5,
     String(W.dialsPerBooking(41, 2)));
}

console.log('\nthe gate — and every way it must fail OPEN');
{
  const pub = [
    { id: 'a', title: '1 x', category: 'Objections', tags: [], body: '> "say"' },
    { id: 'b', title: 'SOP-01 y', category: 'Process', tags: [], body: 'Dial in sets.' },
    { id: 'c', title: 'Things you cannot say', category: 'Compliance', tags: [],
      body: '! **No promises.** x\n! **No timelines.** y' },
  ];
  ok('nothing published means no gate — an empty Playbook must not brick a rep',
     K.playbookGate([], []).complete);
  ok('nothing read means the gate is closed', !K.playbookGate(pub, []).complete);
  ok('  and it names what is left', K.playbookGate(pub, []).outstanding.length === 3);

  const readAll = [
    { note_id: 'a', kind: 'read', at: '2026-08-26T09:00:00Z' },
    { note_id: 'b', kind: 'read', at: '2026-08-26T09:01:00Z' },
    { note_id: 'c', kind: 'read', at: '2026-08-26T09:02:00Z' },
  ];
  /* READING the compliance list is not enough. It is the one whose answer might
     have to be produced to somebody outside the company. */
  ok('reading every note is NOT through the gate while the rules are unconfirmed',
     !K.playbookGate(pub, readAll).complete);
  ok('  and the rules note is the only thing outstanding',
     K.playbookGate(pub, readAll).outstanding.map(n => n.id).join() === 'c');
  ok('  which is found by CONTENT, not by the category being called Compliance',
     K.playbookGate(pub, readAll).ackId === 'c');

  const acked = [...readAll, { note_id: 'c', kind: 'ack', at: '2026-08-26T09:03:00Z' }];
  ok('confirming the rules opens the gate', K.playbookGate(pub, acked).complete);
  ok('  and the acknowledgement is recorded', K.playbookGate(pub, acked).ackDone);
}

console.log('\na reset is a row, not a deletion');
{
  const pub = [{ id: 'a', title: 'x', category: 'Objections', tags: [], body: '> "say"' }];
  const rows = [
    { note_id: 'a', kind: 'read', at: '2026-08-26T09:00:00Z' },
    { note_id: null, kind: 'reset', at: '2026-08-27T09:00:00Z' },
  ];
  ok('progress starts again after a reset', !K.playbookGate(pub, rows).complete);
  ok('  and nothing is counted from before it', K.playbookGate(pub, rows).done === 0);
  /* THE POINT OF A MARKER RATHER THAN A DELETE: the old acknowledgement is
     still in the rows, so "he confirmed the rules on the 26th" survives being
     sent back through the Playbook on the 27th. */
  ok('the earlier read is still on the record', rows.some(r => r.kind === 'read'));
  ok('reading it again after the reset opens the gate',
     K.playbookGate(pub, [...rows, { note_id: 'a', kind: 'read', at: '2026-08-28T09:00:00Z' }]).complete);
  ok('the reset is reported so a screen can say when', K.playbookGate(pub, rows).resetAt === '2026-08-27T09:00:00Z');
}

console.log('\nnotes published after he finished never re-lock him');
{
  const pub = [
    { id: 'a', title: 'x', category: 'Objections', tags: [], body: '> "say"' },
    { id: 'new', title: 'brand new', category: 'Script', tags: [], body: 'Fresh.' },
  ];
  const rows = [{ note_id: 'a', kind: 'read', at: '2026-08-26T09:00:00Z' }];
  const u = K.unreadSince(pub, rows);
  ok('the new note is reported as unread', u.count === 1 && u.fresh[0].id === 'new',
     JSON.stringify(u.fresh.map(n => n.id)));
  /* It DOES still hold the gate for a rep who never finished — the "never
     re-lock" rule is about the banner, and the app only shows it once
     gate.complete is true. Both behaviours come from the same data. */
  ok('  and a rep who never finished is still gated by it',
     !K.playbookGate(pub, rows).complete);
}

console.log('\nposition against the SOP curve, and when to refuse to state one');
{
  /* The curve SOP-01 actually states, read for the week of TENURE. */
  ok('weeks 1-2 expect one per 25-30', W.bandFor(1).from === 25 && W.bandFor(2).to === 30);
  ok('by week 4 it tightens to 15-18', W.bandFor(4).from === 15 && W.bandFor(4).to === 18);
  ok('week 1 is days 0-6', W.weekNo(0) === 1 && W.weekNo(6) === 1 && W.weekNo(7) === 2);

  /* LOWER IS BETTER. Dials-per-booking is inverted, which is exactly the kind
     of comparison that gets written backwards once and then believed. */
  ok('1 per 27 in week 1 is ON the curve', W.standing(54, 2, 1).state === 'on', W.standing(54,2,1).state);
  ok('1 per 40 in week 1 is BEHIND', W.standing(40, 1, 1).state === 'behind');
  ok('1 per 20 in week 1 is AHEAD — fewer dials per booking is better',
     W.standing(40, 2, 1).state === 'ahead', W.standing(40,2,1).state);
  ok('  and the same 1 per 20 is BEHIND by week 4', W.standing(40, 2, 4).state === 'behind');

  /* THE REFUSAL. A confident verdict off nine dials is a judgement about a
     person made from noise. */
  ok('nine dials gets no verdict at all', W.standing(9, 0, 1).state === 'unknown');
  ok('  and says why rather than going blank', /too early/.test(W.standing(9, 0, 1).why));
  ok('no start date means no band and no verdict', W.standing(200, 4, null).state === 'unknown');
  /* No bookings is only bad news once enough dials have gone by to expect one. */
  ok('40 dials none booked in week 1 IS behind', W.standing(40, 0, 1).state === 'behind');
  ok('  but 28 dials none booked is not yet', W.standing(28, 0, 1).state === 'unknown', W.standing(28,0,1).state);
}

console.log('\nthe start date is his first DIAL, not his account');
{
  const acts = [{ ts:'2026-08-20T09:00:00Z', disp:'NA' }, { ts:'2026-08-18T09:00:00Z', disp:'VM' }];
  ok('derived from the earliest dispositioned activity', W.startedOn({}, acts) === '2026-08-18');
  /* An account made three weeks before he dialled would put him at week four
     on day one, and the curve would call a brand-new rep behind. */
  ok('an activity with no disposition does not start the clock',
     W.startedOn({}, [{ ts:'2026-07-01T09:00:00Z', type:'Note' }]) === '');
  ok('an owner override wins', W.startedOn({ startedOn:'2026-08-01' }, acts) === '2026-08-01');
  ok('a malformed override is ignored rather than trusted',
     W.startedOn({ startedOn:'last tuesday' }, acts) === '2026-08-18');
  ok('day count is inclusive of the start day', W.daysSinceStart('2026-08-18','2026-08-18') === 0);
  ok('  and counts forward', W.daysSinceStart('2026-08-18','2026-09-01') === 14);
  ok('no start date means no day count, not day zero', W.daysSinceStart('', '2026-09-01') === null);
  ok('the review day is SOP-02\'s fourteen', W.DECISION_DAY === 14);
}

console.log('\nthe two named checks, and the silence before them');
{
  ok('under the sample there are NO checks, not greyed ones',
     W.mixChecks({ NA: 12 }).ready === false && W.mixChecks({ NA: 12 }).checks.length === 0);
  ok('  and it says how many more are needed', W.mixChecks({ NA: 12 }).need === 18);

  const allNa = W.mixChecks({ NA: 38, VM: 2 });
  ok('nothing but no-answers is called a LIST problem',
     allNa.checks.some(c => c.key === 'allNA' && /list problem/.test(c.body)));
  ok('  and no NF or DNC is called a QUALIFYING problem',
     allNa.checks.some(c => c.key === 'noQualify'));
  const healthy = W.mixChecks({ NA: 20, VM: 5, CB: 4, NF: 3, BK: 2, DNC: 1 });
  ok('a healthy mix raises nothing', healthy.ready && healthy.checks.length === 0,
     JSON.stringify(healthy.checks.map(c => c.key)));
}

console.log('\nbookings that HELD — the denominator that stops junk counting');
{
  const rep = { id:'u_tony', name:'Tony' };
  const leads = [{ id:'l1', meetings:[
    { id:'m1', setById:'u_tony', status:'held' },
    { id:'m2', setById:'u_tony', status:'noshow' },
    { id:'m3', setById:'u_tony', status:'' },
    { id:'m4', setById:'u_other', status:'held' },
  ]}];
  const o = W.bookingOutcomes(leads, rep);
  ok('his bookings are counted', o.booked === 3, JSON.stringify(o));
  ok('  somebody else\'s is not', o.booked === 3);
  ok('held and no-show are separated', o.held === 1 && o.noshow === 1);
  /* An appointment nobody has marked yet is not evidence either way, and
     counting it as a failure would punish a rep for the owner's admin. */
  ok('an unmarked meeting is neither', o.undecided === 1);
  ok('  and is out of the show-rate denominator', W.decidedOf(o) === 2);

  /* THE POINT: a rep can hit the band on appointments that never happen. */
  ok('booked hits the week-1 band', W.standing(80, 3, 1).state === 'on', W.standing(80,3,1).state);
  ok('  while HELD does not', W.standing(80, 1, 1).state === 'behind', W.standing(80,1,1).state);

  const older = W.bookingOutcomes([{ id:'l', meetings:[{ id:'m', setBy:'Tony', status:'held' }] }], rep);
  ok('an older meeting with no setById falls back to the name', older.held === 1);
}

console.log('\nthe source says what it does not measure');
{
  const src = fs.readFileSync('src/lib/repwork.js', 'utf8');
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  /* If someone adds session tracking later, it should be a deliberate argument
     with this test in front of them, not a quiet commit. */
  ok('repwork measures no session duration',
     !/sessionDuration|timeInApp|onlineSince|secondsOnline/i.test(src));
  ok('and nothing stamps a login time onto crm_users',
     !/last_login|lastLoginAt/i.test(app));
  ok('last sign-in is read through the function, not stored',
     /crm_last_seen/.test(fs.readFileSync('src/lib/supabase.js', 'utf8')));
  /* The gate is a routing decision in ONE place, which is what makes a reload
     and a typed URL both land back on it. */
  ok('the gate lives in canOpen, the function every screen routes through',
     /const canOpen=\(settings,user,k,gated\)=>\{\s*\n\s*if\(gated&&isRep\(user\)/.test(app));
  ok('and it never fires on an unknown', /kbReads===null\?null:playbookGate/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
