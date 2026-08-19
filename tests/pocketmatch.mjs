/* POCKET MATCHING — and the two Mark Kaufmanns.

   Matching decides what gets PRE-SELECTED on a card the owner is about to
   confirm. That is the only part of this feature that carries risk: a
   pre-selected wrong destination turns the confirm step from a check into a
   rubber stamp. So most of this file is about when `best` must be null.

   Also covers the kind:'note' change, because adding a third meeting kind
   silently swept every business note into the Sunday cadence until
   internalLogs stopped testing for "not client".                            */
import { matchSegment, explainMatch, MATCH_STRENGTHS } from '../src/lib/pocketmatch.js';
import { internalLogs, clientLogs, noteLogs, normLog, MEETING_KINDS, openLoops, meetingDigest } from '../src/lib/meetinglog.js';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 200) : '')); } };

/* ------------------------------------------------------------- the cast */

const MARK_A = { id: 'l_mark_a', name: 'Mark Kaufmann', company: 'Kaufmann Realty', email: 'mark@kaufmannrealty.com', phone: '(816) 555-0134' };
const MARK_B = { id: 'l_mark_b', name: 'Mark Kaufmann', company: 'Delta Freight', email: 'mkaufmann@deltafreight.com', phone: '816-555-9911' };
const RITA   = { id: 'l_rita', name: 'Rita Alvarez', company: 'Alvarez Realty', email: 'rita@alvarezrealty.com', phone: '+1 (816) 555-0102' };
const DANA   = { id: 'l_dana', name: 'Dana Ruiz', company: 'Ruiz & Co. (Holdings)', email: '', phone: '', isRelationship: true };
const SOLO   = { id: 'l_solo', name: 'Mark', company: '', email: '', phone: '' };
const LEADS  = [MARK_A, MARK_B, RITA, DANA];

console.log('\nthe two Mark Kaufmanns — the case this exists for');
{
  const r = matchSegment('So then Mark Kaufmann called me back about the listing.', LEADS);
  ok('both Marks are returned', r.matches.filter(m => m.label === 'Mark Kaufmann').length === 2, r.matches.map(m => m.id).join(','));
  ok('it is flagged ambiguous', r.ambiguous === true);
  ok('NOTHING is pre-selected', r.best === null, r.best && r.best.id);
  ok('both are offered as the tie', r.tied.length === 2);
  ok('the explanation names them', /Mark Kaufmann, Mark Kaufmann/.test(explainMatch(r)), explainMatch(r));
}

console.log('\nbut a stronger signal breaks the tie legitimately');
{
  const r = matchSegment('Mark Kaufmann emailed from mkaufmann@deltafreight.com about the freight rates.', LEADS);
  ok('the email wins', r.best && r.best.id === 'l_mark_b', r.best && r.best.id);
  ok('not ambiguous any more', r.ambiguous === false);
  ok('the other Mark is still listed as a candidate', r.matches.some(m => m.id === 'l_mark_a'));
  ok('the strongest is first', r.matches[0].via === 'email');
  ok('the explanation says why', /email address/.test(explainMatch(r)), explainMatch(r));
}

console.log('\ncorroborating evidence breaks a tie; nothing else does');
{
  /* "Mark Kaufmann at Delta Freight" is unambiguous to a human: both Marks
     match the name, only one also matches the company. That is evidence, not a
     tiebreak heuristic — which is why it is allowed to decide. */
  const r = matchSegment('Then Mark Kaufmann at Delta Freight wants a quote.', LEADS);
  ok('the corroborated Mark is chosen', r.best && r.best.id === 'l_mark_b', r.best && r.best.id);
  ok('  on the name, not the company', r.best.via === 'name');
  ok('  with the company recorded as corroboration', r.best.signals.includes('company'));
  ok('  and the explanation says so', /confirmed by their company/.test(explainMatch(r)), explainMatch(r));
  ok('the other Mark is still offered as a candidate', r.matches.some(m => m.id === 'l_mark_a'));

  /* Equal corroboration must stay a tie. Two Marks, each named with their own
     company, is genuinely two people being discussed. */
  const both = matchSegment('Mark Kaufmann at Kaufmann Realty, then Mark Kaufmann at Delta Freight.', LEADS);
  ok('equal evidence on both sides stays ambiguous', both.ambiguous === true);
  ok('  and pre-selects nothing', both.best === null, both.best && both.best.id);
}

console.log('\nthe tie is never broken by anything other than signal strength');
{
  /* Same strength, different everything else. Order of the array, alphabet and
     record age must all be irrelevant. */
  const forward  = matchSegment('Mark Kaufmann rang.', [MARK_A, MARK_B]);
  const backward = matchSegment('Mark Kaufmann rang.', [MARK_B, MARK_A]);
  ok('array order does not decide it', forward.best === null && backward.best === null);
  ok('both orders report the same tie size', forward.tied.length === backward.tied.length);
}

console.log('\nthe signals, strongest first');
{
  ok('email', matchSegment('write to rita@alvarezrealty.com', LEADS).best.via === 'email');
  ok('phone, however it was formatted', matchSegment('call her on 816.555.0102 tomorrow', LEADS).best.via === 'phone');
  ok('  and the CRM copy was formatted differently again', matchSegment('call 816.555.0102', [RITA]).best.id === 'l_rita');
  ok('full name', matchSegment('Rita Alvarez wants the pipeline board', LEADS).best.via === 'name');
  ok('company', matchSegment('the Alvarez Realty account is stalling', [RITA]).best.via === 'company');
  ok('a company with punctuation does not throw', matchSegment('spoke to Ruiz & Co. (Holdings) today', [DANA]).best !== undefined);
  ok('the strength order is the documented one', MATCH_STRENGTHS.join(',') === 'email,phone,name,company,first');
}

console.log('\na first name alone never pre-selects, even when it is the only match');
{
  const r = matchSegment('Mark said he would think about it.', [SOLO]);
  ok('it is found', r.matches.length === 1 && r.matches[0].via === 'first');
  ok('but nothing is pre-selected', r.best === null);
  ok('and it says so', /nothing is pre-selected/.test(explainMatch(r)), explainMatch(r));
}

console.log('\nword boundaries — the false positives that would poison this');
{
  ok('"Mark" does not match "marketing"', !matchSegment('our marketing spend is up', [SOLO]).matches.length);
  ok('"Dana" does not match "abundance"', !matchSegment('there is abundance of pipeline', [DANA]).matches.length);
  ok('a two-letter company is ignored as evidence',
     !matchSegment('we went to AB for lunch', [{ id: 'x', name: '', company: 'AB' }]).matches.length);
  ok('a partial phone number does not match', !matchSegment('extension 5550102', [RITA]).matches.length);
}

console.log('\nnothing at all is a clean, quiet result');
{
  const r = matchSegment('We talked about the new pricing structure and nothing else.', LEADS);
  ok('no matches', r.matches.length === 0);
  ok('no best', r.best === null);
  ok('not ambiguous', r.ambiguous === false);
  ok('and it says so plainly', /No one in the CRM/.test(explainMatch(r)));
  ok('empty leads does not throw', matchSegment('anything', []).matches.length === 0);
  ok('empty text does not throw', matchSegment('', LEADS).matches.length === 0);
  ok('null input does not throw', matchSegment(null, null).matches.length === 0);
}

console.log('\nrelationships are distinguished from leads, not filtered out');
{
  const r = matchSegment('Dana Ruiz introduced me to them', LEADS);
  ok('the relationship matched', r.best && r.best.id === 'l_dana');
  ok('and is flagged as one, so the card can say "a relationship"', r.best.rel === true);
  ok('a lead is not flagged as one', matchSegment('Rita Alvarez', LEADS).best.rel === false);
}

console.log('\nmatching is per SEGMENT, which is the whole point of doing it per segment');
{
  /* One Sunday call mentioning three people. Matched whole, it is useless. */
  const whole = 'First Rita Alvarez about the listing. Then Mark Kaufmann at Delta Freight. Then Dana Ruiz.';
  const all = matchSegment(whole, LEADS);
  ok('the whole recording matches everybody and can pre-select nobody sensibly',
     all.matches.length >= 3, all.matches.length);

  const seg = matchSegment('Then Mark Kaufmann at Delta Freight wants a quote.', LEADS);
  ok('one segment resolves to one person', seg.best && seg.best.id === 'l_mark_b', seg.best && seg.best.id);
  ok('  because the company disambiguated the name', seg.matches[0].via === 'name' || seg.best.id === 'l_mark_b');
}

/* ============================================ kind:'note' — step 5's regression */

const log = (id, kind, extra = {}) => normLog({
  id, kind, meetingDate: '2026-08-1' + (id.length % 9), source: 'Notes',
  extraction: { title: id, headline: 'h', openItems: [{ key: 'k_' + id, title: 'loop from ' + id }] },
  ...extra,
});

console.log('\nbusiness notes stay OUT of the Sunday cadence');
{
  ok("'note' is a real kind", MEETING_KINDS.includes('note'));
  ok('a note round-trips through normLog', normLog({ id: 'x', kind: 'note' }).kind === 'note');
  ok('an unknown kind still defaults to internal, which is right for old rows',
     normLog({ id: 'x', kind: 'wat' }).kind === 'internal');
  ok('a row written before kinds existed is still internal', normLog({ id: 'x' }).kind === 'internal');

  const logs = [log('a', 'internal'), log('b', 'client'), log('c', 'note'), log('d', 'note')];
  ok('internalLogs returns ONLY internal', internalLogs(logs).map(l => l.id).join(',') === 'a',
     internalLogs(logs).map(l => l.id).join(','));
  ok('clientLogs is unchanged', clientLogs(logs).map(l => l.id).join(',') === 'b');
  ok('noteLogs returns the notes', noteLogs(logs).map(l => l.id).join(',') === 'c,d');
  ok('every log is in exactly one bucket',
     internalLogs(logs).length + clientLogs(logs).length + noteLogs(logs).length === logs.length);

  /* The bug this replaces: with `!== 'client'`, both notes were internal, so
     their open items entered the open-loop ladder and the huddle digest. */
  const loops = openLoops(logs);
  ok('a note contributes NO open loops', !loops.some(l => /from c|from d/.test(l.title)),
     loops.map(l => l.title).join(' | '));
  ok('an internal meeting still does', loops.some(l => /from a/.test(l.title)));

  const digest = meetingDigest(logs);
  ok('the huddle counts internal meetings only', digest && digest.meetingsLogged === 1, digest && digest.meetingsLogged);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
