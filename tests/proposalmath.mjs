/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_pm = bundleName('pm');
/* PROPOSAL PRICE MATH, AND THE PURE RULES AROUND IT.

   The CRM writes every number on a proposal (lib/proposal quote()); the AI
   writes words. So this file is the proof that the numbers are right:
   bundles, add-ons, seats, the 12-month prepay, the 50/50 split, and that a
   missing price REFUSES rather than rendering as $0.

   Uses the real offer file (PROPOSAL-OFFER.json) as the fixture, so the
   example an owner pastes is itself proven to parse and price.

   Seen red: deposit rounded independently of the balance (they stopped
   summing to setup); seats counted below the included number; prepay charged
   on 12 months instead of 10; a blank price priced as 0. */
import fs from 'fs';
import esbuild from 'esbuild';

const out = await esbuild.build({ entryPoints: ['src/lib/proposal.js'], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
fs.writeFileSync('tests/'+B_pm, out.outputFiles[0].text);
const P = await import('./'+B_pm+'?v=' + Date.now());
const OFFER_JSON = JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  (' + JSON.stringify(x) + ')' : '')); } };
const sumsTo = q => Math.round((q.deposit + q.balance) * 100) === Math.round(q.setup * 100);

/* ---- the offer ---- */
const none = P.readOffer({});
ok('no offer set up says so by name', none.offer === null && none.missing.join() === 'offer');
const { offer, missing } = P.readOffer({ offer: OFFER_JSON });
ok('the shipped offer file parses with nothing missing', !!offer && missing.length === 0, missing);
ok('three packages and one add-on', offer.packages.length === 3 && offer.addons.length === 1);
ok('every item maps to a catalog service', offer.packages.concat(offer.addons).every(p => p.service));
ok('a non-https onboarding link is dropped', P.readOffer({ offer: { ...OFFER_JSON, packages: [{ ...OFFER_JSON.packages[0], onboardingUrl: 'javascript:alert(1)' }] } }).offer.packages[0].onboardingUrl === '');
ok('an https onboarding link is kept', P.safeHttps('https://forms.example.com/x') === 'https://forms.example.com/x' && P.safeHttps('http://x.com') === '');
const half = P.readOffer({ offer: { packages: OFFER_JSON.packages } });
ok('an offer with no company or deposit rule names both as missing', half.missing.includes('company.name') && half.missing.includes('depositPct'), half.missing);

/* ---- the agreed price list (Oct 2026) ----
   The shipped offer is what an owner pastes into Settings, so a wrong number
   here becomes a wrong number on a real proposal. Business Suite on its own
   is $1,999 setup; everything else is unchanged. */
{
  const want = { 'growth-os': [3000, 299], website: [1500, 149], suite: [1999, 199], automations: [1499, 249] };
  const all = offer.packages.concat(offer.addons);
  for (const [id, [setup, monthly]] of Object.entries(want)) {
    const it = all.find(x => x.id === id);
    ok(`${id}: $${setup.toLocaleString()} setup + $${monthly}/mo`, !!it && it.setup === setup && it.monthly === monthly, it && [it.setup, it.monthly]);
  }
  ok('Automations is an add-on, not a package', offer.addons.some(a => a.id === 'automations') && !offer.packages.some(p => p.id === 'automations'));
  ok('50% deposit, prepay 12 months with 2 free', offer.depositPct === 50 && offer.prepay.months === 12 && offer.prepay.free === 2);
  const qs = P.quote(offer, { packageId: 'suite', addonIds: [], seats: 5 });
  ok('Business Suite alone quotes $1,999 + $199/mo, $999.50 deposit', qs.ok && qs.setup === 1999 && qs.monthly === 199 && qs.deposit === 999.5 && sumsTo(qs), qs);
}

/* ---- one package ---- */
let q = P.quote(offer, { packageId: 'growth-os', addonIds: [], seats: 5 });
ok('Growth OS alone: $3,000 setup, $299 a month', q.ok && q.setup === 3000 && q.monthly === 299, q);
ok('50% deposit at signing, 50% at launch', q.deposit === 1500 && q.balance === 1500);
ok('5 seats are included, so no seat charge', q.extraSeats === 0 && q.seatMonthly === 0);

/* ---- bundle + add-on ---- */
q = P.quote(offer, { packageId: 'growth-os', addonIds: ['automations'], seats: 5 });
ok('Growth OS + Automations: $4,499 setup, $548 a month', q.setup === 4499 && q.monthly === 548, q);
ok('odd setup splits to the cent and sums back exactly', q.deposit === 2249.5 && q.balance === 2249.5 && sumsTo(q));
ok('both items are on the quote, each with its service', q.items.map(i => i.service).join() === 'Web+CRM,Automations');

/* ---- seats ---- */
q = P.quote(offer, { packageId: 'growth-os', addonIds: [], seats: 8 });
ok('8 seats on Growth OS: 3 extra at $29 = $87 more a month', q.extraSeats === 3 && q.seatMonthly === 87 && q.monthly === 386, q);
q = P.quote(offer, { packageId: 'suite', addonIds: [], seats: 2 });
ok('fewer seats than included is never a discount', q.extraSeats === 0 && q.seats === 5 && q.monthly === 199, q);
q = P.quote(offer, { packageId: 'website', addonIds: [], seats: 40 });
ok('a package with no seat rule ignores seats entirely', q.extraSeats === 0 && q.seats === 0 && q.monthly === 149, q);

/* ---- prepay: 12 months for the price of 10 ---- */
q = P.quote(offer, { packageId: 'growth-os', addonIds: ['automations'], seats: 6, prepay: true });
ok('prepay covers the WHOLE monthly (package + add-on + seats)', q.monthly === 577 && q.prepay.total === 5770, q.prepay);
ok('and saves exactly 2 months', q.prepay.saves === 1154 && q.prepay.months === 12 && q.prepay.free === 2);
ok('prepay switched off for this proposal is absent', P.quote(offer, { packageId: 'website', prepay: false }).prepay === null);
ok('an offer with no prepay rule never shows one', P.quote(P.readOffer({ offer: { ...OFFER_JSON, prepay: null } }).offer, { packageId: 'website' }).prepay === null);

/* ---- what the owner quoted ---- */
q = P.quote(offer, { packageId: 'website', prices: { website: { setup: '2250', monthly: '175' } } });
ok('a quoted price overrides the usual one', q.setup === 2250 && q.monthly === 175 && q.deposit === 1125, q);
q = P.quote(offer, { packageId: 'website', prices: { website: { setup: '', monthly: '' } } });
ok('a blank field falls back to the usual price', q.setup === 1500 && q.monthly === 149);
ok('a price that is not a number REFUSES, never becomes $0', P.quote(offer, { packageId: 'website', prices: { website: { setup: 'abc' } } }).ok === false);
ok('a negative price refuses', P.quote(offer, { packageId: 'website', prices: { website: { monthly: -5 } } }).ok === false);
const noPrice = P.readOffer({ offer: { ...OFFER_JSON, packages: [{ id: 'x', name: 'X', service: 'Website' }] } }).offer;
ok('an offer item with no price set refuses instead of quoting $0', P.quote(noPrice, { packageId: 'x' }).ok === false, P.quote(noPrice, { packageId: 'x' }));
ok('no package picked refuses', P.quote(offer, { addonIds: ['automations'] }).ok === false);
ok('no offer refuses with a message', P.quote(null, {}).ok === false && /Settings/.test(P.quote(null, {}).error));
ok('an unknown add-on id is ignored, not priced', P.quote(offer, { packageId: 'website', addonIds: ['nope'] }).items.length === 1);
q = P.quote(offer, { packageId: 'website', prices: { website: { setup: '0.1', monthly: '0.2' } } });
const q2 = P.quote(P.readOffer({ offer: { ...OFFER_JSON, addons: [{ id: 'a', name: 'A', service: 'CRM', setup: 0.2, monthly: 0.1 }] } }).offer,
  { packageId: 'website', addonIds: ['a'], prices: { website: { setup: '0.1', monthly: '0.2' } } });
ok('money is summed in cents (0.1 + 0.2 is exactly 0.3)', q2.setup === 0.3 && q2.monthly === 0.3, q2);
for (const s of [1, 3, 99.99, 1499, 1499.99, 3333.33, 0.01]) {
  const z = P.quote(P.readOffer({ offer: { ...OFFER_JSON, depositPct: 50 } }).offer, { packageId: 'website', prices: { website: { setup: s } } });
  ok(`deposit + balance = setup for $${s}`, sumsTo(z), z);
}
const third = P.quote(P.readOffer({ offer: { ...OFFER_JSON, depositPct: 33 } }).offer, { packageId: 'website', prices: { website: { setup: 1000 } } });
ok('a non-50 deposit still sums back exactly', third.deposit === 330 && third.balance === 670 && sumsTo(third));

/* ---- validity ---- */
ok('good for 7 days means exactly 7 days after sending', P.expiryFrom('2026-10-03T15:00:00.000Z', 7) === '2026-10-10T15:00:00.000Z');
ok('not expired before', !P.isExpired('2026-10-10T15:00:00.000Z', Date.parse('2026-10-10T14:59:59Z')));
ok('expired after', P.isExpired('2026-10-10T15:00:00.000Z', Date.parse('2026-10-10T15:00:01Z')));
ok('no expiry date counts as expired, never as open forever', P.isExpired(null) && P.isExpired(''));

/* ---- tokens ---- */
const toks = new Set(Array.from({ length: 2000 }, () => P.newToken()));
ok('tokens are 43 url-safe characters', [...toks].every(t => P.TOKEN_RE.test(t)));
ok('2,000 tokens, no repeats', toks.size === 2000);
ok('the token rule rejects anything else', !P.TOKEN_RE.test('abc') && !P.TOKEN_RE.test('x'.repeat(42) + '!') && !P.TOKEN_RE.test(''));

/* ---- the AI stays in its lane ---- */
const { copy, warnings } = P.cleanCopy({
  headline: 'Growth systems', summary: 'Strong site. Weak follow up.',
  plan: { goal: 'Double booked jobs', numbers: [{ label: 'Avg job', value: '$2,400' }], levers: ['a', 'b', 'c', 'd'] },
  gaps: Array.from({ length: 9 }, (_, i) => ({ title: 'Gap ' + i, text: 'text' })),
  build: [{ title: 'Website', tag: 'new', text: 'Built for you, only $1,500.' }],
  whyNow: ['now'], email: { subject: 'Your proposal', body: 'Hi' }, extra: 'ignored',
});
ok('levers capped at 3, gaps at 6', copy.plan.levers.length === 3 && copy.gaps.length === 6);
ok('unknown fields are dropped', copy.extra === undefined);
ok('a dollar figure in the prose is flagged for review', warnings.some(w => /"Website"/.test(w)), warnings);
ok('the client\'s own numbers in the plan are allowed', !warnings.some(w => /plan/.test(w)));
ok('a garbage draft cleans to empty, not a crash', P.cleanCopy(null).copy.gaps.length === 0 && P.cleanCopy('x').copy.summary === '');

/* ---- the snapshot ---- */
q = P.quote(offer, { packageId: 'growth-os', addonIds: ['automations'], seats: 5 });
const body = P.buildBody({ offer, q, copy, client: { name: 'Dee', company: 'Dee Co', city: 'Wichita', website: 'dee.co', email: 'secret@dee.co' }, preparedOn: '2026-10-03', validDays: 7 });
ok('the snapshot carries the quote the CRM computed', body.quote.setup === 4499 && body.quote.deposit === 2249.5);
ok('the snapshot has no notes field', body.notes === undefined && !JSON.stringify(body).includes('notes'));
ok('the client email is not copied into what the client page receives', !JSON.stringify(body).includes('secret@dee.co'));
ok('"what it covers" merges the chosen items', body.standard.covers.some(c => /automations/i.test(c)) && body.standard.covers.some(c => /Business Suite/.test(c)));
ok('the onboarding link comes from the package', body.onboardingUrl === '' && P.buildBody({ offer: P.readOffer({ offer: { ...OFFER_JSON, packages: [{ ...OFFER_JSON.packages[0], onboardingUrl: 'https://f.example.com/g' }] } }).offer, q, copy, client: {}, preparedOn: '', validDays: 7 }).onboardingUrl === 'https://f.example.com/g');

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.unlinkSync('tests/'+B_pm); } catch {}
process.exit(fail ? 1 : 0);
