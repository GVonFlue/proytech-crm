/* DISPOSITION CODES — the attempt cap, and the rules enforced at the write.
   ============================================================================

   tests/realtouch.mjs owns the question "is this contact". This file owns the
   two things that decide whether a rep's number gets dialled again, and the
   rules SOP-02 states as things he has to remember.

   WHY BAD EXISTS AND WHY IT IS NOT AN ATTEMPT

   SOP-04 gives a cold number three attempts across two weeks. A disconnected
   number is not one of three chances — it is a number that will never work, and
   spending the other two on it is two dials a new rep does not have. So BAD
   makes the lead dead on the spot rather than counting against the cap, and
   that difference is asserted below in both directions.

   WHY THE WRITE RULES ARE TESTED AS PURE FUNCTIONS

   "Never leave a second voicemail" and "NF always carries a reason" are rules a
   rep is asked to remember while dialling twenty numbers in a row. Re-imposed
   where the write happens, they become things he cannot get wrong. Enforced in
   the composer, but the predicates they call live in lib/lead.js, which is
   where they can be tested without a browser.

   Pure functions, no DOM.
*/
import fs from 'fs';
import esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.bdp.mjs', built.outputFiles[0].text);
const L = await import('./.bdp.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const NOW = '2026-09-01T12:00:00.000Z';
const daysAgo = d => new Date(Date.parse(NOW) - d * 864e5).toISOString();
const lead = (...acts) => ({ id:'l', createdAt: daysAgo(30),
  activities: acts.map((a, i) => ({ id:String(i), ts: a.ts || daysAgo(1), type:'Call', ...a })) });

console.log('\nthe vocabulary is one list, and the sets are derived from it');
{
  ok('nine codes', L.DISP_CODES.length === 9, L.DISP_CODES.join(','));
  ok('  the eight from SOP-02 plus BAD',
     ['NA','BAD','VM','CB','NF','SO','BK','HV','DNC'].every(c => L.DISP_CODES.includes(c)),
     L.DISP_CODES.join(','));
  /* Derived, not hand-maintained: a tenth code cannot be added to the list and
     forgotten in one of the sets, because the sets are computed from the list. */
  ok('CONTACT_DISP is derived from the list, not written twice',
     L.DISPOSITIONS.filter(d => d.contact).length === L.CONTACT_DISP.size);
  ok('every code has a label', L.DISP_CODES.every(c => L.dispLabel(c)));
  ok('an unknown code has no label and does not throw', L.dispLabel('ZZ') === '');
}

console.log('\nthe attempt cap — three across two weeks');
{
  const three = lead({ disp:'NA', ts:daysAgo(10) }, { disp:'NA', ts:daysAgo(6) }, { disp:'NA', ts:daysAgo(2) });
  const two   = lead({ disp:'NA', ts:daysAgo(6) }, { disp:'VM', ts:daysAgo(2) });

  ok('two attempts still dials', L.dialState(two, NOW).dial === true);
  ok('  and reports what is left', L.dialState(two, NOW).left === 1, String(L.dialState(two, NOW).left));
  ok('three attempts stops', L.dialState(three, NOW).dial === false);
  ok('  and says why', L.dialState(three, NOW).reason === 'CAP', L.dialState(three, NOW).reason);
  ok('a voicemail counts as an attempt', L.attemptsOn(two, NOW) === 2, String(L.attemptsOn(two, NOW)));

  /* The window ROLLS. An attempt from three weeks ago is not one of this
     fortnight's three, or a lead worked once in March would be dead forever. */
  const aged = lead({ disp:'NA', ts:daysAgo(30) }, { disp:'NA', ts:daysAgo(20) }, { disp:'NA', ts:daysAgo(2) });
  ok('attempts outside the two-week window age out', L.attemptsOn(aged, NOW) === 1, String(L.attemptsOn(aged, NOW)));
  ok('  so the lead is dialable again', L.dialState(aged, NOW).dial === true);

  /* An owner's undisposed call must not silently spend a rep's attempts. */
  const mixed = lead({ text:'Rang him.', ts:daysAgo(3) }, { disp:'NA', ts:daysAgo(2) });
  ok('an undisposed call is not an attempt', L.attemptsOn(mixed, NOW) === 1, String(L.attemptsOn(mixed, NOW)));
}

console.log('\nBAD short-circuits the cap rather than counting against it');
{
  const bad = lead({ disp:'BAD', ts:daysAgo(1) });
  ok('one BAD kills the lead immediately', L.dialState(bad, NOW).dial === false);
  ok('  and says the number is bad, not that the cap was reached',
     L.dialState(bad, NOW).reason === 'BAD', L.dialState(bad, NOW).reason);
  ok('  it is DEAD, not merely capped', L.dialState(bad, NOW).dead === 'BAD');
  /* The whole point: it does not consume one of three. */
  ok('  and it does not spend an attempt', L.attemptsOn(bad, NOW) === 0, String(L.attemptsOn(bad, NOW)));
  ok('  so there are no attempts left to spend', L.dialState(bad, NOW).left === 0);

  /* Dead is permanent — it does not age out of the window the way the cap does. */
  const oldBad = lead({ disp:'BAD', ts:daysAgo(90) });
  ok('a bad number is still bad three months later', L.dialState(oldBad, NOW).dial === false,
     JSON.stringify(L.dialState(oldBad, NOW)));
}

console.log('\nDNC is the other permanent one, and it outranks the cap');
{
  const dnc = lead({ disp:'NA', ts:daysAgo(9) }, { disp:'NA', ts:daysAgo(5) },
                   { disp:'NA', ts:daysAgo(3) }, { disp:'DNC', ts:daysAgo(1) });
  ok('DNC stops the lead', L.dialState(dnc, NOW).dial === false);
  /* Both apply; DNC is the stronger and more actionable answer, so a screen
     tells the rep "they asked" rather than "you ran out of tries". */
  ok('  and reads as DNC rather than CAP even when both are true',
     L.dialState(dnc, NOW).reason === 'DNC', L.dialState(dnc, NOW).reason);
  ok('DNC outranks BAD too',
     L.deadReason(lead({ disp:'BAD', ts:daysAgo(4) }, { disp:'DNC', ts:daysAgo(1) })) === 'DNC');
  ok('a clean lead is not dead', L.deadReason(lead({ disp:'VM' })) === '');
  ok('  and dials', L.dialState(lead({ disp:'VM' }), NOW).dial === true);
}

console.log('\nthe rules SOP-02 asks a rep to remember, imposed instead');
{
  /* Required for a REP writing a CALL, and for nothing else. `rep` is the
     signed-in user's crm_users.role — the only place this is knowable, because
     a stored row carries `who`, a display NAME, and no role. */
  ok('a rep must disposition a call', L.dispRequired(true, 'Call') === true);
  ok('an owner never has to', L.dispRequired(false, 'Call') === false);
  ok('and not on a note, a text or an email',
     !L.dispRequired(true, 'Note') && !L.dispRequired(true, 'Text') && !L.dispRequired(true, 'Email'));

  /* First voicemail only. The second one is what turns a rep into a
     telemarketer in somebody's contacts. */
  ok('a voicemail is allowed when none has been left', L.hasVoicemail(lead({ disp:'NA' })) === false);
  ok('a second voicemail is blocked', L.hasVoicemail(lead({ disp:'VM' })) === true);
  ok('  and a no-answer does not look like one', L.hasVoicemail(lead({ disp:'NA' }, { disp:'CB' })) === false);
}

console.log('\nthe five things SOP-03 has the rep asking for');
{
  /* NO MIGRATION. A lead is a jsonb blob — leadRow writes data:{...lead} with
     no column list and getLeads spreads it back — so `brief` rides along. */
  const bare = { company:'Alvarez Roofing', name:'Rita', phone:'316', email:'r@x.com' };
  ok('a bare lead is missing all five', L.briefMissing(bare).length === 5, JSON.stringify(L.briefMissing(bare)));
  ok('  including the website', L.briefMissing(bare).includes('website'));

  const full = { ...bare, website:'alvarez.com',
    brief:{ nameAsWritten:'Alvarez Roofing LLC', wants:'reroofs, insurance, gutters',
            area:'Wichita + 40mi', photos:'Facebook' } };
  ok('a complete brief is complete', L.briefComplete(full), JSON.stringify(L.briefMissing(full)));

  /* AN EMPTY WEBSITE MEANS TWO DIFFERENT THINGS and they must not render the
     same: nobody asked (a gap Logan chases) versus they have none (an answer
     he can build against). */
  const noSite = { ...full, website:'' };
  ok('a blank website is treated as NOT ASKED', L.briefMissing(noSite).includes('website'));
  const declared = { ...noSite, brief:{ ...noSite.brief, noWebsite:true } };
  ok('  until the rep says they have none', L.briefComplete(declared));
  ok('  and then it reads as an answer, not a blank',
     L.bookingBrief(declared, {}).website === 'They do not have one');

  /* One assembly, used by the email and by any screen showing it, so the two
     cannot drift. */
  const b = L.bookingBrief(full, { start:'2026-09-03T14:00' });
  ok('the assembly carries everything SOP-03 texts',
     ['company','contact','phone','email','industry','when','nameAsWritten','website','wants','area','photos']
       .every(k => k in b), JSON.stringify(Object.keys(b)));
  ok('  and the time comes from the MEETING, not the lead', b.when === '2026-09-03T14:00');
  ok('website reads from lead.website, which already exists — not a second copy',
     b.website === 'alvarez.com');
}

console.log('\nthe calendar invite IS the notification');
{
  /* THE ATTENDEE CAP, confirmed rather than assumed. calendar-event.js REFUSES
     rather than truncating when a list is too long, so a booking that quietly
     exceeded it would fail entirely — and a normal booking must be nowhere
     near. Prospect plus two owners is three. */
  const cal = await import('../api/calendar-event.js');
  ok('the cap is five', cal.MAX_ATTENDEES === 5, String(cal.MAX_ATTENDEES));
  const normal = cal.inviteList(['rita@x.com', 'admin@getproytech.com', 'getproytech@gmail.com']);
  ok('a normal booking is three attendees', normal.attendees.length === 3);
  ok('  and does not trip the cap', normal.tooMany === false);
  ok('  so Google is asked to mail them', cal.sendUpdatesFor(normal.attendees) === 'all');
  /* It only trips past five, and refusing is the designed behaviour. */
  ok('six would trip it', cal.inviteList(
    ['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com','f@x.com']).tooMany === true);
  /* An owner with no email, or the same address twice, must not eat a slot. */
  ok('duplicates collapse', cal.inviteList(['a@x.com','A@X.com']).attendees.length === 1);
  ok('a lead with no email leaves two attendees, not a blank one',
     cal.inviteList([undefined,'admin@getproytech.com','getproytech@gmail.com']).attendees.length === 2);
  /* No attendees means no invitation mail, which is the right answer rather
     than asking Google to notify an empty guest list. */
  ok('nobody to invite means no mail is requested', cal.sendUpdatesFor([]) === 'none');

  /* What Logan actually reads. Plain text, because a calendar description is
     read on a phone lock screen as often as in a browser. */
  const b = L.bookingBrief({ company:'Alvarez Roofing', name:'Rita', phone:'316', email:'r@x.com',
    businessType:'Roofing', website:'alvarez.com',
    brief:{ nameAsWritten:'Alvarez Roofing LLC', wants:'reroofs', area:'Wichita', photos:'Facebook' } },
    { start:'2026-09-03T14:00' });
  const txt = L.briefText(b);
  ok('the description carries the contact block', /Phone: 316/.test(txt) && /Email: r@x.com/.test(txt));
  ok('  and the five things', /Name as written/.test(txt) && /Wants calls for: reroofs/.test(txt)
     && /Works: Wichita/.test(txt) && /Photos: Facebook/.test(txt));
  ok('  and says so when there is no site, rather than leaving a blank line',
     /Current site: not captured/.test(L.briefText({ ...b, website:'' })));
}

console.log('\nwho an escalation reaches when crm_team() is empty');
{
  /* THE BUG THIS PINS. crm_team() returns [] on an install that has not run
     TEAM-MIGRATION.sql, and the escalation path read it directly — so SO, HV
     and DNC tagged NOBODY there, silently. The @mention picker beside them
     already had a fallback; the automatic path did not. */
  const roster = [{ id:'o', name:'Garrett', role:'owner' }, { id:'r', name:'Tony', role:'rep' }];
  ok('the roster is used when it has owners', L.ownerNames(roster, []).join() === 'Garrett');
  ok('  and reps are not tagged', !L.ownerNames(roster, []).includes('Tony'));

  const users = [{ id:'o', name:'Garrett', role:'owner', active:true },
                 { id:'x', name:'Old Owner', role:'owner', active:false }];
  ok('an empty roster falls back to the users table', L.ownerNames([], users).join() === 'Garrett');
  ok('  and skips a deactivated owner', !L.ownerNames([], users).includes('Old Owner'));

  /* Last resort rather than nobody: the names this deployment is configured
     with. Tagging the wrong person is recoverable; tagging nobody is not
     noticed at all. */
  ok('with neither, it falls back to the configured team rather than nobody',
     L.ownerNames([], []).length > 0, JSON.stringify(L.ownerNames([], [])));
  ok('null in, no crash out', Array.isArray(L.ownerNames(null, null)));
}

console.log('\nan empty lead is answerable, not a crash');
{
  ok('no activities dials', L.dialState({ id:'x' }, NOW).dial === true);
  ok('  with all three attempts', L.dialState({ id:'x' }, NOW).left === 3);
  ok('null is survivable', L.deadReason(null) === '' && L.attemptsOn(null, NOW) === 0);
  ok('a row with an unreadable timestamp is skipped, not counted as now',
     L.attemptsOn(lead({ disp:'NA', ts:'not a date' }), NOW) === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
