/* MASS OUTREACH — the three rules that are not negotiable, plus the ones that
   quietly decide whether a message reaches the right person.
   ============================================================================

   WHAT THIS FILE IS FOR

   Every assertion here is about something that, if it broke, would be invisible
   on screen and visible to the person who received the text. A do-not-call
   record that reappears in the list looks like any other row. A draft matched
   to the wrong id looks like a perfectly good message. A deal value that leaks
   into the card looks like nothing at all until it is in somebody's Messages.

   So this asserts on the DATA, not on the rendering: what `pickable` returns,
   what is inside `cardOf`, which id a draft lands on. Per CLAUDE.md, a green
   build proves the file parses and nothing else.

   Pure functions, no DOM. src/lib/outreach.js imports lib/lead.js, which pulls
   lucide-react in through ACT_TYPES, so this bundles with esbuild exactly as
   tests/dispositions.mjs does rather than importing under plain Node ESM.
*/
import fs from 'fs';
import esbuild from 'esbuild';

const built = await esbuild.build({ entryPoints:['src/lib/outreach.js'], bundle:true, write:false,
  format:'esm', jsx:'automatic', loader:{'.js':'jsx'},
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.bout.mjs', built.outputFiles[0].text);
const O = await import('./.bout.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };

const NOW = '2026-05-20T12:00:00.000Z';
const daysAgo = d => new Date(Date.parse(NOW) - d * 864e5).toISOString();

/* A record shaped the way the app actually stores one. */
const person = (over = {}) => ({
  id: 'p1', name: 'Dana Reyes', company: 'Reyes Roofing', phone: '(555) 867-5309',
  createdAt: daysAgo(200), activities: [], labels: [], keyDates: [], ...over,
});
const call = (disp, over = {}) => ({ id: 'a' + Math.random(), ts: daysAgo(3), type: 'Call', disp, ...over });

/* ------------------------------------------------------------------------- */
console.log('\nRULE 1 — do-not-call and dead numbers never reach the screen');
{
  const dnc  = person({ id: 'dnc',  activities: [call('DNC')] });
  const bad  = person({ id: 'bad',  activities: [call('BAD')] });
  const fine = person({ id: 'fine', activities: [call('VM')] });

  const list = O.pickable([dnc, bad, fine]);
  ok('DNC is not in the list at all', !list.some(l => l.id === 'dnc'), list.map(l => l.id).join(','));
  ok('BAD is not in the list at all', !list.some(l => l.id === 'bad'), list.map(l => l.id).join(','));
  ok('an ordinary record still is', list.some(l => l.id === 'fine'));

  /* THE POINT OF FILTERING THE LIST RATHER THAN THE SELECTION. If these ever
     become merely "unticked by default", a select-all puts them back. */
  ok('a DNC cannot be ticked even if something hands it to eligibility',
     O.eligibility(dnc).ok === false && O.eligibility(dnc).reason === 'DNC');
  ok('a BAD cannot be ticked either',
     O.eligibility(bad).ok === false && O.eligibility(bad).reason === 'BAD');

  /* DNC outranks BAD, matching deadReason's own ordering — the more permanent
     and more actionable answer is the one a person should be shown. */
  const both = person({ id: 'both', activities: [call('BAD'), call('DNC')] });
  ok('a record that is both reads as DNC', O.eligibility(both).reason === 'DNC');

  ok('the excluded are counted so the screen can say why it is shorter',
     JSON.stringify(O.excludedCounts([dnc, bad, fine])) === JSON.stringify({ dnc: 1, bad: 1, total: 2 }),
     JSON.stringify(O.excludedCounts([dnc, bad, fine])));

  /* A disposition on a lead is one field on one call. Make sure an ordinary
     no-answer — by far the most common row a rep writes — does not read as
     dead and quietly remove someone from every future run. */
  const na = person({ id: 'na', activities: [call('NA'), call('NA'), call('NA')] });
  ok('three no-answers do not make a record undeliverable', O.eligibility(na).ok === true);
}

/* ------------------------------------------------------------------------- */
console.log('\nno phone — shown, not hidden, and refused at the checkbox');
{
  const nophone = person({ id: 'np', phone: '' });
  ok('still appears in the list', O.pickable([nophone]).some(l => l.id === 'np'));
  ok('but cannot be ticked', O.eligibility(nophone).ok === false);
  ok('and says which datum is missing', O.eligibility(nophone).reason === 'nophone');
  ok('a phone of only punctuation counts as no phone',
     O.eligibility(person({ phone: '()- ' })).reason === 'nophone');
}

console.log('\nthe number as a URL scheme will actually accept it');
{
  ok('punctuation is stripped', O.dialDigits('(555) 867-5309') === '5558675309');
  ok('a leading + survives', O.dialDigits('+1 (555) 867-5309') === '+15558675309');
  ok('a + that is not leading does not', O.dialDigits('555-867-5309 x+2') === '55586753092');
  ok('empty in, empty out', O.dialDigits('') === '' && O.dialDigits(null) === '');
}

/* ------------------------------------------------------------------------- */
console.log('\nRULE 2 — Memorial Day is not drafted for veterans and military families');
{
  const vet   = person({ id: 'v', labels: ['Veteran'] });
  const mil   = person({ id: 'm', labels: ['Military'] });
  const fam   = person({ id: 'f', labels: ['Military Family'] });
  const usvet = person({ id: 'u', labels: ['US Veteran'] });
  const plain = person({ id: 'p', labels: ['Chamber Member'] });

  const OCC = 'Memorial Day, wishing them a good weekend with family';

  ok('a veteran is held',        !!O.heldBy(vet, OCC));
  ok('military is held',         !!O.heldBy(mil, OCC));
  /* The label vocabulary is editable per install, so this matches on substrings
     rather than on the two strings that happen to ship by default. An exact
     match would pass silently on every one of these, which is the failure that
     actually matters here. */
  ok('"Military Family" is held',!!O.heldBy(fam, OCC));
  ok('"US Veteran" is held',     !!O.heldBy(usvet, OCC));
  ok('case does not matter',     !!O.heldBy(person({ labels: ['VETERAN'] }), OCC));
  ok('somebody else is not held', O.heldBy(plain, OCC) === '');

  /* BOTH HALVES ARE REQUIRED. A rule that fires on the label alone would stop
     a veteran ever getting a birthday message; one that fires on the occasion
     alone would stop the whole run. */
  ok('a veteran gets an ordinary birthday message',
     O.heldBy(vet, 'his birthday next Tuesday') === '');
  ok('a veteran gets an ordinary Christmas message',
     O.heldBy(vet, 'Merry Christmas and a good new year') === '');

  /* THE DISTINCTION THE RULE EXISTS FOR. Memorial Day is for the people who did
     not come home. Veterans Day is for the living, and a warm note then is
     exactly right — holding it back would be the same mistake in reverse. */
  ok('Veterans Day is NOT held', O.heldBy(vet, 'Veterans Day — thanking them for serving') === '');

  ok('the reason names the label so the row explains itself',
     O.heldBy(fam, OCC).toLowerCase().includes('military family'), O.heldBy(fam, OCC));

  /* Held records are FLAGGED, not dropped. Every ticked person comes out of
     planRun in exactly one pile — a count that does not match what was ticked
     is a person who silently vanished from the run. */
  const plan = O.planRun([vet, mil, plain, person({ id: 'x' })], OCC);
  ok('held people are separated, not discarded', plan.held.length === 2, JSON.stringify(plan.held.map(h => h.lead.id)));
  ok('the rest are drafted', plan.draft.length === 2, plan.draft.map(l => l.id).join(','));
  ok('nothing is lost between the two piles', plan.held.length + plan.draft.length === 4);
  ok('a held entry carries the reason to show', !!plan.held[0].reason);
}

/* ------------------------------------------------------------------------- */
console.log('\nmoney cannot reach the model, because the card is an allowlist');
{
  /* Every money-bearing field lib/jarvis.js knows about, on one record, plus a
     couple that do not exist yet — the point of an allowlist is that a field
     invented later is absent rather than included. */
  const rich = person({
    dealValue: 48000, retainer: 1200, retainerActive: true, retainerStart: '2026-01-01',
    commission: { amount: 4800, pct: 10 }, commissionPct: 10, commissionBase: 48000,
    payments: [{ date: '2026-02-01', amount: 24000 }],
    deals: [{ label: 'Site', setup: 6000 }], closedDeals: [{ label: 'X', value: 9000 }],
    owed: 24000, contracted: 48000, invoiceIds: ['inv1'], sponsorAmount: 2500,
    somethingInventedNextYear: 99999,
  });
  const json = JSON.stringify(O.cardOf(rich));

  for (const f of ['dealValue','retainer','commission','payments','deals','closedDeals',
                   'owed','contracted','invoiceIds','sponsorAmount','retainerStart',
                   'commissionPct','commissionBase','somethingInventedNextYear']) {
    ok('no ' + f + ' in the card', !json.includes(f), json.slice(0, 200));
  }
  /* And the figures themselves, in case a key is ever renamed around them. */
  for (const n of ['48000','1200','4800','24000','9000','2500','99999']) {
    ok('the figure ' + n + ' is nowhere in the card', !json.includes(n), json.slice(0, 200));
  }
}

console.log('\nwhat the card does carry, so a message can be personal at all');
{
  const c = O.cardOf(person({
    businessType: 'Construction', isRelationship: true, relTier: 'A',
    relNote: 'Met at the chamber breakfast, sends me lenders',
    labels: ['Chamber Member', 'VIP'],
    keyDates: [{ label: 'Birthday', date: '1980-03-14' }],
    activities: [
      { id: '1', ts: daysAgo(9),  type: 'Note', text: 'Talked about his new crew' },
      { id: '2', ts: daysAgo(40), type: 'Note', text: 'Lead created.' },
      { id: '3', ts: daysAgo(41), type: 'Note', text: 'imported row', imported: true },
      { id: '4', ts: daysAgo(2),  type: 'Call', disp: 'NA', text: 'no answer' },
    ],
  }));
  ok('the name is there', c.name === 'Dana Reyes');
  ok('what they do is there', c.businessType === 'Construction');
  ok('how the owner knows them is there', /chamber breakfast/.test(c.relNote));
  ok('labels are there', JSON.stringify(c.labels) === JSON.stringify(['Chamber Member','VIP']));
  ok('a key date is there', c.keyDates.length === 1 && c.keyDates[0].what === 'Birthday');
  ok('a relationship is named as one', c.kind === 'relationship');
  ok('a client is named as one', O.cardOf(person({ isClient: true })).kind === 'client');
  ok('a plain lead is named as one', O.cardOf(person()).kind === 'lead');

  /* The three kinds of row that are NOT somebody saying something. Mining any
     of them would put words in a person's mouth that nobody ever said —
     the same failure REAL-TOUCH-FINDING.md and IMPORT-NOTE-FINDING.md are
     both about, arriving this time in an outgoing message. */
  const notes = JSON.stringify(c.recent || []);
  ok('a real note is offered to the drafter', notes.includes('new crew'));
  ok('a system note is not', !notes.includes('Lead created'), notes);
  ok('an imported spreadsheet cell is not', !notes.includes('imported row'), notes);
  ok('a no-answer is not', !notes.includes('no answer'), notes);

  /* Empty keys are dropped, so an absent key reads as "nothing here". */
  const thin = O.cardOf(person({ name: 'Sam', company: '', labels: [], keyDates: [] }));
  ok('an empty company key is absent, not blank', !('company' in thin), JSON.stringify(thin));
  ok('empty labels are absent', !('labels' in thin), JSON.stringify(thin));
  ok('a thin record is honestly reported as thin', O.hasSubstance(person({ labels: [] })) === false);
  ok('a record with a label has substance', O.hasSubstance(person({ labels: ['Veteran'] })) === true);
}

/* ------------------------------------------------------------------------- */
console.log('\na draft is refused at the write, not asked for politely in the prompt');
{
  ok('an ordinary message passes', O.validateDraft('Hey Dana — hope you get some time with family this weekend.').ok);
  ok('empty is refused', O.validateDraft('').ok === false);
  ok('whitespace only is refused', O.validateDraft('   \n ').ok === false);

  /* A link in an unreviewed bulk text is both the shape carriers throttle and
     the payload an injected instruction would aim for. */
  ok('an http link is refused', O.validateDraft('Hey — see https://evil.example').ok === false);
  ok('a bare www link is refused', O.validateDraft('Hey — www.evil.example has details').ok === false);
  ok('a bare domain is refused', O.validateDraft('Check evil.com for the offer').ok === false);
  ok('an email address is refused', O.validateDraft('Reply to me@example.com').ok === false);
  ok('a phone number is refused', O.validateDraft('Call me on 555-867-5309 today').ok === false);

  const long = 'x'.repeat(O.DRAFT_MAX_CHARS + 1);
  ok('a message past the ceiling is refused', O.validateDraft(long).ok === false);
  ok('one exactly at the ceiling is not', O.validateDraft('x'.repeat(O.DRAFT_MAX_CHARS)).ok === true);

  /* A refused draft keeps its text and states the problem. Dropping it silently
     would remove a person from the run with nothing on screen to notice. */
  const r = O.validateDraft('Go to https://x.com');
  ok('a refusal keeps the text so it can be rewritten', r.text.includes('https'));
  ok('a refusal says what was wrong', /link/.test(r.problem), r.problem);
}

/* ------------------------------------------------------------------------- */
console.log('\ndrafts are matched by id, never by position');
{
  const asked = ['a', 'b', 'c'];

  /* THE BUG THIS EXISTS TO STOP. A model that returns two drafts for three
     people would, on a positional read, shift c's message onto b — a holiday
     text addressed to the wrong person, which is the worst thing this feature
     could do and looks completely fine on screen. */
  const gap = O.parseDrafts('{"drafts":[{"id":"a","text":"one"},{"id":"c","text":"three"}]}', asked);
  ok('a missing draft leaves a hole rather than shifting the rest',
     gap.get('a').text === 'one' && gap.get('c').text === 'three' && !gap.has('b'),
     JSON.stringify([...gap]));

  const scrambled = O.parseDrafts('{"drafts":[{"id":"c","text":"three"},{"id":"a","text":"one"}]}', asked);
  ok('order in the reply does not matter', scrambled.get('a').text === 'one' && scrambled.get('c').text === 'three');

  const alien = O.parseDrafts('{"drafts":[{"id":"zzz","text":"who?"},{"id":"a","text":"one"}]}', asked);
  ok('an id that was not asked for is dropped', !alien.has('zzz') && alien.size === 1, JSON.stringify([...alien]));

  const dupe = O.parseDrafts('{"drafts":[{"id":"a","text":"first"},{"id":"a","text":"second"}]}', asked);
  ok('a duplicate id does not overwrite the first answer', dupe.get('a').text === 'first');

  ok('markdown fences are tolerated',
     O.parseDrafts('```json\n{"drafts":[{"id":"a","text":"one"}]}\n```', asked).get('a').text === 'one');
  ok('prose around the JSON is tolerated',
     O.parseDrafts('Sure! {"drafts":[{"id":"a","text":"one"}]} hope that helps', asked).get('a').text === 'one');
  ok('an unreadable reply yields nothing rather than throwing',
     O.parseDrafts('the model had a bad day', asked).size === 0);
  ok('an empty reply yields nothing rather than throwing', O.parseDrafts('', asked).size === 0);
  ok('the personalisation source comes through',
     O.parseDrafts('{"drafts":[{"id":"a","text":"one","from":"labelled VIP"}]}', asked).get('a').from === 'labelled VIP');
}

/* ------------------------------------------------------------------------- */
console.log('\nthe sms link — one builder, and no half-built links');
{
  const href = O.smsHref('(555) 867-5309', "Hey — hope you're well");
  ok('the number is stripped to digits', href.startsWith('sms:5558675309'), href);
  ok('the body is URL-encoded', href.includes('body=') && href.includes('%20'), href);
  ok('an apostrophe survives encoding', decodeURIComponent(href.split('body=')[1]) === "Hey — hope you're well",
     decodeURIComponent(href.split('body=')[1]));

  /* An sms: with no recipient opens Messages on an empty compose, which looks
     exactly like it worked. Refusing is the only honest answer. */
  ok('no phone means no link at all', O.smsHref('', 'hello') === '');
  ok('no message means no link at all', O.smsHref('5558675309', '') === '');
  ok('whitespace-only message means no link', O.smsHref('5558675309', '   ') === '');

  /* Which form Messages honours is a measured fact about the machine, so all of
     them stay named here and switching is one edit in the lib. */
  ok('every candidate form is a function',
     Object.values(O.SMS_FORMS).every(f => typeof f === 'function'));
  ok('the chosen form is one of them', !!O.SMS_FORMS[O.SMS_FORM]);
  ok('an unknown form falls back rather than producing undefined',
     O.smsHref('5558675309', 'hi', 'nonsense').startsWith('sms:'));
}

/* ------------------------------------------------------------------------- */
console.log('\nthe run — chunking, the campaign stamp, and what gets logged');
{
  const list = Array.from({ length: 23 }, (_, i) => ({ id: 'l' + i }));
  const cs = O.chunk(list);
  ok('chunks are the size the route accepts', cs.every(c => c.length <= O.OUTREACH_CHUNK));
  ok('nothing is dropped by chunking', cs.reduce((a, c) => a + c.length, 0) === 23);
  ok('an empty list chunks to nothing', O.chunk([]).length === 0);

  const k = O.campaignKey('Memorial Day, good weekend with family', new Date('2026-05-22T09:00:00'));
  ok('the campaign key is stable and readable', k === 'memorial-day-good-weekend-with-family-2026-05-22', k);
  ok('the same occasion next year is a different run',
     O.campaignKey('Memorial Day', new Date('2027-05-31T09:00:00'))
     !== O.campaignKey('Memorial Day', new Date('2026-05-25T09:00:00')));
  ok('two occasions on one day do not collide',
     O.campaignKey('Memorial Day', new Date('2026-05-25T09:00:00'))
     !== O.campaignKey('a birthday', new Date('2026-05-25T09:00:00')));
  ok('an empty occasion still yields a usable key', /^outreach-/.test(O.campaignKey('', new Date('2026-05-25'))));

  /* The stamp is what leaves the "does a holiday text count like a call"
     question answerable later without a backfill to reconstruct which rows
     these were. */
  const a = O.sentActivity('Memorial Day', new Date('2026-05-25T09:00:00'));
  ok('the activity is marked as outreach', a.outreach === true);
  ok('it carries the campaign key', a.campaign === 'memorial-day-2026-05-25', a.campaign);
  ok('it carries the occasion in the owner\'s words', a.occasion === 'Memorial Day');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
