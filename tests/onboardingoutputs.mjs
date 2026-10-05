/* THE BUILD PROMPTS (src/lib/onboarding-prompts.js).

   The prompts are what ProyTech pastes into the build, so these assert on the
   TEXT, line by line where it matters:

     - Growth OS produces both prompts; Website-only produces no Suite prompt
       and Suite-only no website prompt (an empty string, not a stub)
     - the compliance block is the right one per industry, and only that one;
       each says "verify with {agency}", with the agency from the offer
     - Kansas lines come from the state rule, and vanish with no state
     - the Suite prompt names the industry template, the tiles chosen and the
       pipeline (as edited, or the template's when untouched)
     - answers for a section the client can no longer see never leak in
     - files are listed with their storage paths; an EIN is masked
     - nothing says "ProyTech" when the agency is someone else (white-label)
     - buildOutputs freezes a snapshot of what the prompts were built from

   Seen red: always rendering the Suite prompt; using the realtor compliance
   block for every industry; printing tx.ein whole. */
import * as L from '../src/lib/onboarding.js';
import { websitePrompt, suitePrompt, buildOutputs, complianceLines } from '../src/lib/onboarding-prompts.js';
import { test, eq, ok, report } from './assert.mjs';

const CFG = L.readOnbConfig({ onboarding: { state: 'KS', productMap: {} } }, { company: { name: 'Acme Digital', email: 'hi@acme.test' }, launchDays: 14, packages: [{ seatsIncluded: 5 }] }).config;
const files = [
  { slot: 'logos', name: 'reed-logo.png', path: 'o1/logos/u1.png' },
  { slot: 'contacts', name: 'sphere.csv', path: 'o1/contacts/u2.csv', sensitive: true },
];
const realtor = {
  'biz.industry': 'realtor', 'biz.contact_name': 'Jordan Reed', 'biz.role': 'Owner', 'biz.email': 'j@reed.test', 'biz.phone': '316-555-0100', 'biz.name': 'Reed Realty Group',
  're.license': 'SP00012345', 're.brokerage': 'Prairie Brokers', 're.broker_name': 'Pat Broker', 're.broker_email': 'pat@prairie.test', 're.solo': 'team', 're.team_name': 'The Reed Team',
  'brand.colors': { mode: 'logo', list: ['#0E2A47', '#C8A24A'] }, 'brand.feel': ['luxury', 'warm', 'classic'],
  'brand.love': [{ url: 'compass.com', why: 'big photos' }],
  'site.action': 'book', 'site.pages': ['home', 'about', 'listings'], 'site.story_why': 'Grew up here.',
  'web.site': 'https://reedrealty.test', 'web.gbp_status': 'have', 'web.gbp': 'https://g.page/reed', 'web.domain_own': 'yes', 'web.domain': 'reedrealty.test',
  'suite.goals': [{ label: 'Closings', target: '24' }, { label: 'GCI', target: '$400k' }, { label: 'Leads a month', target: '40' }],
  'suite.tiles': ['Revenue vs goal', 'Closings this year'], 'suite.team': [{ name: 'Sam', email: 's@reed.test', role: 'member', pct: '30' }],
  'sv.trade': 'roofing', 'sv.services': [{ name: 'LEAKED SERVICE' }],
};
const ctxFor = (a, products, cfgState = 'KS') => L.ctxOf({ products }, a, { state: cfgState });
const gen = (a, products, cfg = CFG) => { const ctx = ctxFor(a, products, cfg.state); return { w: websitePrompt({ answers: a, ctx, files, cfg }), s: suitePrompt({ answers: a, ctx, files, cfg }) }; };

test('Growth OS gives both prompts; Website-only no Suite prompt; Suite-only no website prompt', () => {
  let p = gen(realtor, ['website', 'suite']);
  ok(p.w.startsWith('# Website build: Reed Realty Group') && p.s.startsWith('# Business Suite setup: Reed Realty Group'));
  ok(p.w.includes('ALSO goes straight into their Business Suite'), 'Growth OS lead routing');
  p = gen(realtor, ['website']);
  ok(p.w.length > 100); eq(p.s, '');
  ok(!p.w.includes('ALSO goes straight into their Business Suite'), 'no Suite, no routing line');
  p = gen(realtor, ['suite']);
  eq(p.w, ''); ok(p.s.length > 100);
  p = gen(realtor, ['automations']);
  eq([p.w, p.s], ['', '']);
});

test('realtor compliance: broker adjacency, 2x size, broker approval, fair housing, IDX, Kansas team rule, verify with the agency', () => {
  const w = gen(realtor, ['website']).w;
  for (const s of ['adjacent to the agent or team name', 'no more than twice the font size', 'Pat Broker', 'Fair housing', 'broker-approved vendor', 'Kansas: a team name may not include "realty"', 'verify with Acme Digital'])
    ok(w.includes(s), s);
  ok(!w.includes('NMLS'), 'no lender rules');
  ok(!w.includes('LEAKED SERVICE') && !w.includes('roofing'), 'service answers from another industry never leak');
});
test('lender compliance: NMLS footer, LO NMLS, Equal Housing, no rates by default, Consumer Access', () => {
  const a = { ...realtor, 'biz.industry': 'lender', 'biz.lender_kind': 'company', 'ln.company': 'Plains Mortgage', 'ln.company_nmls': '998877', 'ln.officers': [{ name: 'Lee', nmls: '1234', title: 'LO' }] };
  const w = gen(a, ['website']).w;
  for (const s of ['footer of EVERY page: Plains Mortgage, NMLS 998877', 'personal NMLS number', 'Equal Housing Lender', 'No rates and no payment examples', 'nmlsconsumeraccess.org', 'Lee, LO, NMLS 1234'])
    ok(w.includes(s), s);
  ok(!w.includes('Fair housing') && !w.includes('Pat Broker'), 'no realtor rules or answers');
  const w2 = gen({ ...a, 'ln.rates': 'yes' }, ['website']).w;
  ok(w2.includes('ONLY with compliance-approved wording'));
});
test('service compliance: license only if given, insured only with proof, roofing registration, no fake or gated reviews', () => {
  const a = { ...realtor, 'biz.industry': 'service', 'sv.trade': 'roofing', 'sv.services': [{ name: 'Roof repair', show_price: 'from', price: '$350' }] };
  const w = gen(a, ['website']).w;
  for (const s of ['Do NOT claim "licensed"', 'Claim "insured" only if an insurance certificate', 'Kansas Attorney General roofing registration number is required and missing', 'No invented testimonials, and no review gating', 'Roof repair — starting at $350'])
    ok(w.includes(s), s);
  ok(!w.includes('Pat Broker'), 'realtor answers do not leak into a service prompt');
  const noState = gen(a, ['website'], { ...CFG, state: '' }).w;
  ok(!noState.includes('Kansas') && noState.includes('check whether the state requires a roofing registration'));
});
test('no industry yet: a single "ask at kickoff" line, no rules invented', () => {
  const lines = complianceLines({ industry: '' }, { txt: () => '', raw: () => undefined }, CFG);
  eq(lines.length, 1); ok(/Ask at kickoff/.test(lines[0]));
});

test('Suite prompt: template by industry, tiles chosen, edited pipeline, team, contact file path', () => {
  const s = gen({ ...realtor, 'suite.pipeline': ['New', 'Met', 'Closed'] }, ['website', 'suite']).s;
  ok(s.includes('Start from the **realtor** template'));
  ok(s.includes('- Revenue vs goal, Closings this year'));
  ok(s.includes('As edited by the client') && s.includes('1. New\n2. Met\n3. Closed'));
  ok(s.includes('- Closings: 24') && s.includes('- GCI: $400k'));
  ok(s.includes('Sam <s@reed.test> · team member · 30% commission'));
  ok(s.includes('sphere.csv (storage: onboarding/o1/contacts/u2.csv)'));
  ok(s.includes('5 seats included'));
  const untouched = gen(realtor, ['suite']).s;
  ok(untouched.includes('The template default (not edited)') && untouched.includes('1. New lead') && untouched.includes('9. Past client'));
  const svc = gen({ ...realtor, 'biz.industry': 'service', 'sv.trade': 'hvac' }, ['suite']).s;
  ok(svc.includes('**service** template') && svc.includes('8. Review requested'));
});
test('Suite prompt: texting details only when Automations was bought, EIN masked', () => {
  const a = { ...realtor, 'tx.legal_name': 'Reed Realty Group LLC', 'tx.biz_type': 'llc', 'tx.ein': '12-3456789', 'tx.which': ['missed_call', 'reviews'] };
  const s = gen(a, ['suite', 'automations']).s;
  ok(s.includes('Reed Realty Group LLC') && s.includes('Missed-call text back, Review requests'));
  ok(s.includes('EIN: on file (ends 6789)') && !s.includes('12-3456789') && !s.includes('3456789'), 'masked');
  ok(!gen(a, ['suite']).s.includes('Reed Realty Group LLC') && gen(a, ['suite']).s.includes('Automations not bought'));
});

test('website prompt: brand, pages, presence, assets with storage paths, still needed', () => {
  const w = gen(realtor, ['website', 'suite']).w;
  ok(w.includes('#0E2A47, #C8A24A (from the logo)'));
  ok(w.includes('Luxury, Warm / local, Classic'));
  ok(w.includes('compass.com — big photos'));
  ok(w.includes('Pages: Home, About, Listings / home search'));
  ok(w.includes('Read it for existing copy and structure'));
  ok(w.includes('Pull their real reviews'));
  ok(w.includes('reed-logo.png → storage: onboarding/o1/logos/u1.png'));
  ok(w.includes('Contact list: sphere.csv → storage: onboarding/o1/contacts/u2.csv (private)'));
  ok(w.includes('## Still needed and open questions for kickoff') && w.includes('A headshot'));
  ok(w.includes('WCAG 2.1 AA') && w.includes('No doorway pages'));
});
test('white-label: the agency is named from the offer, and "ProyTech" appears nowhere', () => {
  const p = gen(realtor, ['website', 'suite', 'automations']);
  ok(p.w.includes("on Acme Digital's stack"));
  ok(!/proytech/i.test(p.w + p.s));
});
test('work from home: the address is withheld, explicitly', () => {
  const w = gen({ ...realtor, 'biz.address': '1 Secret Ln', 'biz.hide_address': true }, ['website']).w;
  ok(!w.includes('1 Secret Ln') && w.includes('DO NOT publish the address'));
});

test('buildOutputs: both prompts, a timestamp and a frozen snapshot incl. file paths', () => {
  const ctx = ctxFor(realtor, ['website', 'suite']);
  const out = buildOutputs({ row: { package_name: 'Growth OS' }, answers: realtor, ctx, files, checklist: {}, cfg: CFG, now: new Date('2026-10-05T12:00:00Z') });
  ok(out.websitePrompt.includes('Bought: Growth OS'));
  eq(out.generatedAt, '2026-10-05T12:00:00.000Z');
  eq(out.snapshot.products, ['website', 'suite']);
  eq(out.snapshot.files.map(f => f.path), ['o1/logos/u1.png', 'o1/contacts/u2.csv']);
  ok(out.snapshot.sections.some(s => s.title === 'Realtor details'));
  eq(buildOutputs({ row: {}, answers: realtor, ctx, files, checklist: {}, cfg: CFG, now: new Date('2026-10-05T12:00:00Z') }).websitePrompt,
     buildOutputs({ row: {}, answers: realtor, ctx, files, checklist: {}, cfg: CFG, now: new Date('2026-10-06T12:00:00Z') }).websitePrompt, 'deterministic');
});

report('onboardingoutputs');
