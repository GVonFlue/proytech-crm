/* Unit tests for conversation capture.

   Required by the brief's definition of done:
     a labelled thread, an unlabelled thread, and a thread where the model
     should refuse to guess; plus a malformed AI response degrading to a plain
     note rather than crashing. */
import { test, eq, near, ok, report } from './assert.mjs';
import {
  splitTurns, speakerSignals, localConfidence, chunkTurns, turnsToText,
  normalizeExtract, normalizeSpeakers, mergeExtracts, toNoteText, fallbackNote,
  fieldDiffs, CHUNK_CHARS,
} from '../src/lib/convo.js';

const LEAD = { name: 'Sarah Chen', company: 'Chen Realty', email: 'sarah@old.com', phone: '' };

/* ------------------------------------------------------------- splitting */

test('a labelled SMS thread splits into turns with speakers', () => {
  const t = splitTurns(`Me: Hey Sarah, following up on the site.
Sarah: Hi! Yes we talked it over. Can we do $3,500?
Me: I can do 3,500 if we start Monday.
Sarah: Deal.`);
  eq(t.length, 4);
  eq(t[0].speaker, 'Me');
  eq(t[1].speaker, 'Sarah');
  eq(t[1].text, 'Hi! Yes we talked it over. Can we do $3,500?');
});

test('an email thread picks up From: and "On ..., X wrote:" direction markers', () => {
  const t = splitTurns(`From: sarah@chenrealty.com
Thanks for sending that over.

On Tue, Aug 4, 2026 at 9:14 AM, Garrett Von Flue wrote:
Here is the proposal we discussed.`);
  eq(t.length, 2);
  eq(t[0].speaker, 'sarah@chenrealty.com');
  eq(t[0].source, 'email');
  eq(t[1].speaker, 'Garrett Von Flue');
});

test('an UNLABELLED thread still splits on blank lines, with null speakers', () => {
  const t = splitTurns(`can you send the pricing again

yeah sending now

thanks`);
  eq(t.length, 3);
  eq(t.map(x => x.speaker), [null, null, null]);
});

test('multi-line messages stay in one turn', () => {
  const t = splitTurns(`Sarah: Two things.
First, the budget.
Second, the timeline.`);
  eq(t.length, 1);
  ok(/Second, the timeline/.test(t[0].text));
});

test('empty and whitespace pastes produce no turns rather than one empty one', () => {
  eq(splitTurns(''), []);
  eq(splitTurns('   \n\n  '), []);
});

/* ---------------------------------------------------------------- signals */

test('a labelled thread yields STRONG signals on both sides', () => {
  const turns = splitTurns('Me: hi\nSarah Chen: hello');
  const s = speakerSignals(turns, { lead: LEAD, meName: 'Garrett' });
  ok(s['me'].signals.some(x => x.kind === 'self_word' && x.strength === 'strong'));
  ok(s['sarah chen'].signals.some(x => x.kind === 'lead_name' && x.strength === 'strong'));
  eq(localConfidence(s), 'high');
});

test('one strong signal is MEDIUM, not high', () => {
  const turns = splitTurns('Me: hi\nJT: hello');
  eq(localConfidence(speakerSignals(turns, { lead: LEAD, meName: 'Garrett' })), 'medium');
});

test('an unlabelled thread has NO local confidence — the app must ask', () => {
  const turns = splitTurns('can you send pricing\n\nyes sending now');
  eq(localConfidence(speakerSignals(turns, { lead: LEAD, meName: 'Garrett' })), 'none');
});

test('initials-only labels give no confidence even though they look like names', () => {
  const turns = splitTurns('JT: what did you think\nSC: looks good to me');
  const s = speakerSignals(turns, { lead: LEAD, meName: 'Garrett' });
  eq(localConfidence(s), 'none');
});

test('weak signals are recorded but are labelled weak, never strong', () => {
  const turns = splitTurns('JT: our budget is about $4,000\nSC: got it');
  const s = speakerSignals(turns, { lead: LEAD, meName: 'Garrett' });
  const weak = s['jt'].signals.find(x => x.kind === 'quotes_price');
  ok(weak, 'price signal should be detected');
  eq(weak.strength, 'weak');
});

/* --------------------------------------------------------------- chunking */

test('a long thread chunks on turn boundaries and never mid-message', () => {
  const turns = Array.from({ length: 200 }, (_, i) => ({ speaker: 'Me', text: 'x'.repeat(400) + ' #' + i }));
  const chunks = chunkTurns(turns);
  ok(chunks.length > 1, 'should have chunked');
  eq(chunks.flat().length, 200, 'no turn may be lost');
  chunks.forEach(c => ok(turnsToText(c).length <= CHUNK_CHARS + 500, 'chunk within budget'));
  /* every message is intact somewhere */
  const joined = chunks.map(turnsToText).join('\n');
  ok(/#199$/m.test(joined), 'the LAST message must survive — silent truncation is the bug');
});

test('a short thread is one chunk, and an empty one does not explode', () => {
  eq(chunkTurns(splitTurns('Me: hi')).length, 1);
  eq(chunkTurns([]).length, 1);
});

/* ------------------------------------------------------- response parsing */

test('a well-formed response normalises cleanly', () => {
  const x = normalizeExtract({
    summary: 'Sarah wants the site live before her listing goes up.',
    wants: ['a site before Sept 1'],
    promised: [{ what: 'send a proposal', by: '2026-08-11', who: 'Garrett' }],
    objections: ['worried about the monthly fee'],
    openQuestions: [{ question: 'does it include hosting?', askedBy: 'Sarah' }],
    facts: [{ label: 'Budget', value: '3500', field: 'dealValue' }],
    followUps: [{ title: 'Send proposal', due: '2026-08-11' }],
    dates: [{ date: '2026-09-01', what: 'listing goes live' }],
  });
  eq(x.wants, ['a site before Sept 1']);
  eq(x.promised[0].by, '2026-08-11');
  eq(x.facts[0].field, 'dealValue');
});

test('garbage in every field degrades to empty arrays, never throws', () => {
  [null, undefined, 'nope', 42, [], { summary: 12, wants: 'not an array', promised: [null, 5, {}] }].forEach(bad => {
    const x = normalizeExtract(bad);
    eq(Array.isArray(x.wants), true);
    eq(typeof x.summary, 'string');
    eq(x.promised, []);
  });
});

test('a non-ISO date is dropped rather than stored as a broken date', () => {
  const x = normalizeExtract({ dates: [{ date: 'next Tuesday', what: 'call' }, { date: '2026-08-12', what: 'call' }] });
  eq(x.dates.length, 1);
  eq(x.dates[0].date, '2026-08-12');
});

test('a fact with an unknown "field" is kept as a fact but offered as no field update', () => {
  const x = normalizeExtract({ facts: [{ label: 'Dog', value: 'Rex', field: 'petName' }] });
  eq(x.facts.length, 1);
  eq(fieldDiffs(x.facts, LEAD), []);
});

/* --------------------------------------------------- speaker mapping rules */

test('two speakers both mapped to the lead collapses to ambiguous — never a guess', () => {
  const turns = splitTurns('A: hi\nB: hello');
  const s = normalizeSpeakers({
    speakers: [{ key: 'a', label: 'A', role: 'lead' }, { key: 'b', label: 'B', role: 'lead' }],
    confidence: 'high',
  }, turns);
  eq(s.confidence, 'none');
  eq(s.ambiguous, true);
});

test('NO speaker mapped to the lead is also ambiguous', () => {
  const turns = splitTurns('A: hi\nB: hello');
  const s = normalizeSpeakers({ speakers: [{ key: 'a', label: 'A', role: 'us' }, { key: 'b', label: 'B', role: 'other' }], confidence: 'high' }, turns);
  eq(s.ambiguous, true);
});

test('a clean one-lead mapping keeps its confidence', () => {
  const turns = splitTurns('Me: hi\nSarah Chen: hello');
  const s = normalizeSpeakers({
    speakers: [{ key: 'me', label: 'Me', role: 'us', evidence: 'labelled Me:' },
               { key: 'sarah chen', label: 'Sarah Chen', role: 'lead', evidence: 'matches lead record' }],
    confidence: 'high',
  }, turns);
  eq(s.confidence, 'high');
  eq(s.ambiguous, false);
  eq(s.speakers.find(x => x.role === 'lead').label, 'Sarah Chen');
});

test('a hallucinated speaker who is not in the thread is dropped', () => {
  const turns = splitTurns('Me: hi\nSarah Chen: hello');
  const s = normalizeSpeakers({ speakers: [{ key: 'dave', label: 'Dave', role: 'lead' }], confidence: 'high' }, turns);
  eq(s.speakers, []);
  eq(s.ambiguous, true);
});

test('an unknown confidence string is not trusted', () => {
  const turns = splitTurns('Me: hi\nSarah Chen: hello');
  eq(normalizeSpeakers({ speakers: [{ key: 'me', role: 'us' }, { key: 'sarah chen', role: 'lead' }], confidence: 'certain' }, turns).confidence, 'none');
});

/* ----------------------------------------------------------------- merging */

test('merging chunk extractions dedupes restated items', () => {
  const a = normalizeExtract({ summary: 'Part one.', wants: ['a website'], promised: [{ what: 'send proposal' }] });
  const b = normalizeExtract({ summary: 'Part two.', wants: ['A WEBSITE', 'hosting'], promised: [{ what: 'Send Proposal' }] });
  const m = mergeExtracts([a, b]);
  eq(m.wants.length, 2);
  eq(m.promised.length, 1);
  eq(m.summary, 'Part one. Part two.');
});

test('merging one part returns it untouched; merging none returns an empty extract', () => {
  const a = normalizeExtract({ wants: ['x'] });
  eq(mergeExtracts([a]).wants, ['x']);
  eq(mergeExtracts([]).wants, []);
  eq(mergeExtracts([null, undefined]).wants, []);
});

/* -------------------------------------------------------------- note text */

test('the note reads like a note, not like JSON', () => {
  const x = normalizeExtract({
    summary: 'Sarah wants the site live before her listing goes up.',
    wants: ['a site before Sept 1'],
    promised: [{ what: 'send a proposal', by: '2026-08-11' }],
    objections: ['worried about the monthly fee'],
    dates: [{ date: '2026-09-01', what: 'listing goes live' }],
  });
  const note = toNoteText(x, { when: '2026-08-09', channel: 'Text' });
  ok(/^Conversation · Text · 2026-08-09/.test(note), note);
  ok(/What they want/.test(note));
  ok(/• a site before Sept 1/.test(note));
  ok(/by 2026-08-11/.test(note));
  ok(!/[{}[\]"]/.test(note), 'no JSON punctuation should reach the activity feed');
});

test('a long conversation says so instead of silently truncating', () => {
  ok(/read in 3 parts/.test(toNoteText(normalizeExtract({ summary: 'x' }), { parts: 3 })));
});

test('an empty extract still produces a valid, short note', () => {
  const note = toNoteText(normalizeExtract(null), { when: '2026-08-09' });
  ok(note.startsWith('Conversation'));
  ok(note.length < 60);
});

test('a malformed AI response degrades to a plain note carrying the paste', () => {
  const note = fallbackNote('Me: hi\nSarah: hello', 'could not read the response');
  ok(/couldn't be summarised/.test(note));
  ok(/Sarah: hello/.test(note), 'the user\'s own text must not be lost');
});

test('the fallback note truncates a huge paste but says that it did', () => {
  const note = fallbackNote('x'.repeat(20000));
  ok(note.length < 6200);
  ok(/truncated/.test(note));
});

/* ------------------------------------------------------------ field diffs */

test('field updates are offered as a diff and flag conflicts', () => {
  const d = fieldDiffs([
    { label: 'Email', value: 'sarah@chenrealty.com', field: 'email' },
    { label: 'Phone', value: '555-0134', field: 'phone' },
  ], LEAD);
  const email = d.find(x => x.field === 'email');
  eq(email.before, 'sarah@old.com');
  eq(email.conflict, true, 'overwriting an existing value must be flagged');
  const phone = d.find(x => x.field === 'phone');
  eq(phone.before, '');
  eq(phone.conflict, false, 'filling an empty field is not a conflict');
});

test('a fact identical to what is already on the lead is not offered as an update', () => {
  eq(fieldDiffs([{ label: 'Email', value: 'SARAH@OLD.COM', field: 'email' }], LEAD), []);
});

/* The tally and the exit code. Without this the file wrote dots to stdout and
   exited 0 no matter what: a failing assertion printed an 'F' that nothing
   read, so this suite could never break a build. */
report('convo');
