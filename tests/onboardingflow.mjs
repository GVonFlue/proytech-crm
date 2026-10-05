/* THE ONBOARDING FLOW, AS RULES (src/lib/onboarding.js).

   Pure functions, so every combination is cheap to enumerate and nothing is
   sampled:

     - branching: every industry (and both lender kinds) x every set of
       products shows exactly the sections and industry fields it should,
       and never one it should not
     - required: the starred fields only, per industry; conditional ones
       (EIN unless sole proprietor, roofing registration only where a state
       rule asks for it, the rights box only when files were uploaded)
     - "still needed": the deposit read from the lead's checklist, the need
       labels, ticked when done, never blocking on its own
     - never an SSN or a card number: refused at the clean, naming the field;
       an EIN, a phone number and a date are not refused
     - the clean drops unknown ids and values outside a field's options
     - prefill never overwrites an answer
     - the launch clock: waits for each missing piece by name, starts on the
       latest date, counts business days, and has no target when the offer
       never set launch days (null, not a guessed 14)
     - files: allowed by slot and size, and judged by their first bytes
     - config: every fallback is named

   Seen red: making `site` always visible; dropping `when` from ln.lo_nmls;
   removing the Luhn check (a 16-digit phone list passed as a card). */
import * as L from '../src/lib/onboarding.js';
import * as P from '../src/lib/proposal.js';
import { test, eq, ok, report } from './assert.mjs';

const ALL_SETS = [[], ['website'], ['suite'], ['automations'], ['website', 'suite'], ['website', 'automations'], ['suite', 'automations'], ['website', 'suite', 'automations']];
const CTXS = [];
for (const industry of ['', 'realtor', 'lender', 'service'])
  for (const lenderKind of industry === 'lender' ? ['lo', 'company', ''] : [''])
    for (const products of ALL_SETS) CTXS.push({ industry, lenderKind, products, state: 'KS', rules: L.STATE_RULES.KS });
const ids = (ctx, a = {}) => L.visibleSections(ctx).map(s => s.id);
const fieldsShown = (ctx, a = {}) => L.visibleSections(ctx).flatMap(s => L.shownFields(s, ctx, a).map(f => f.id));

test(`branching: ${CTXS.length} combinations show exactly the right sections`, () => {
  for (const ctx of CTXS) {
    const want = ['biz', 'web', 'ind', 'brand'];
    if (ctx.products.includes('website')) want.push('site');
    if (ctx.products.includes('suite')) want.push('suite');
    if (ctx.products.includes('automations')) want.push('text');
    want.push('access', 'files');
    eq(ids(ctx), want, JSON.stringify(ctx));
  }
});

test('branching: Growth OS (website + suite) shows both builds; Website-only shows no Suite; Suite-only shows no website', () => {
  const g = { industry: 'realtor', products: ['website', 'suite'] };
  ok(ids(g).includes('site') && ids(g).includes('suite'));
  ok(L.isGrowth(g));
  ok(!ids({ industry: 'realtor', products: ['website'] }).includes('suite'));
  ok(!ids({ industry: 'realtor', products: ['suite'] }).includes('site'));
  ok(fieldsShown(g).includes('site.into_suite'), 'Growth OS tells them leads go into the Suite');
  ok(!fieldsShown({ industry: 'realtor', products: ['website'] }).includes('site.into_suite'));
});

test('branching: industry fields appear only for their industry', () => {
  for (const ctx of CTXS) {
    const f = fieldsShown(ctx);
    const re = f.some(x => x.startsWith('re.')), ln = f.some(x => x.startsWith('ln.')), sv = f.some(x => x.startsWith('sv.'));
    eq([re, ln, sv], [ctx.industry === 'realtor', ctx.industry === 'lender', ctx.industry === 'service'], JSON.stringify(ctx));
    eq(f.includes('ind.pick_first'), !ctx.industry, 'the nudge shows only before an industry is picked');
    eq(f.includes('ln.lo_nmls'), ctx.industry === 'lender' && ctx.lenderKind === 'lo');
    eq(f.includes('ln.officers'), ctx.industry === 'lender' && ctx.lenderKind === 'company');
    eq(f.includes('biz.lender_kind'), ctx.industry === 'lender');
    eq(f.includes('web.zillow'), ctx.industry === 'realtor' || ctx.industry === 'lender');
    eq(f.includes('web.yelp'), ctx.industry === 'service');
    eq(f.includes('fl.contacts'), ctx.products.includes('suite'));
  }
});

test('section 3 is titled by industry', () => {
  const s = L.SECTIONS.find(x => x.id === 'ind');
  eq(['realtor', 'lender', 'service', ''].map(i => L.sectionTitle(s, { industry: i })), ['Realtor details', 'Lender details', 'Service details', 'Industry details']);
});

test('ctxOf: the client\'s own industry answer wins over the owner\'s preset; products only from the row', () => {
  const c = L.ctxOf({ industry: 'service', products: ['website', 'seo'] }, { 'biz.industry': 'lender', 'biz.lender_kind': 'lo' }, { state: 'ks' });
  eq([c.industry, c.lenderKind, c.products, c.state, !!c.rules], ['lender', 'lo', ['website'], 'KS', true]);
  eq(L.ctxOf({ industry: 'service' }, {}, {}).industry, 'service');
  eq(L.ctxOf({}, { 'biz.industry': 'pirate' }, {}).industry, '');
});

test('state rules are data: Kansas labels and hints, and nothing state-specific without a state', () => {
  const ks = L.ctxOf({ products: [] }, { 'biz.industry': 'realtor' }, { state: 'KS' });
  const none = L.ctxOf({ products: [] }, { 'biz.industry': 'realtor' }, {});
  eq(L.fieldLabel(L.fieldById('re.license'), ks), 'Kansas license number');
  eq(L.fieldLabel(L.fieldById('re.license'), none), 'license number');
  ok(/realty/.test(L.fieldHint(L.fieldById('re.team_name'), ks)), 'KS team-name hint');
  eq(L.fieldHint(L.fieldById('re.team_name'), none), '');
  const roofKS = L.ctxOf({ products: [] }, { 'biz.industry': 'service' }, { state: 'KS' });
  const roofNone = L.ctxOf({ products: [] }, { 'biz.industry': 'service' }, {});
  const a = { 'biz.industry': 'service', 'sv.trade': 'roofing' };
  ok(L.fieldShown(L.fieldById('sv.ag_reg'), roofKS, a) && L.isRequired(L.fieldById('sv.ag_reg'), roofKS, a));
  ok(!L.fieldShown(L.fieldById('sv.ag_reg'), roofNone, a) && !L.isRequired(L.fieldById('sv.ag_reg'), roofNone, a));
});

const base = { 'biz.industry': 'realtor', 'biz.contact_name': 'Jordan', 'biz.phone': '316-555-0100', 'biz.email': 'j@r.test', 'biz.name': 'Reed Realty' };
const miss = (ctx, a, files = []) => L.missingRequired(ctx, a, files).map(m => m.id);
test('required: realtor needs license, brokerage, broker name and email; nothing optional', () => {
  const ctx = L.ctxOf({ products: ['website'] }, base, { state: 'KS' });
  eq(miss(ctx, base), ['re.license', 're.brokerage', 're.broker_name', 're.broker_email']);
  eq(miss(L.ctxOf({ products: ['website'] }, {}, { state: 'KS' }), {}), ['biz.industry', 'biz.contact_name', 'biz.phone', 'biz.email', 'biz.name'], 'no industry yet: only the basics');
});
test('required: lender LO vs company', () => {
  const lo = { ...base, 'biz.industry': 'lender', 'biz.lender_kind': 'lo' };
  eq(miss(L.ctxOf({ products: [] }, lo, {}), lo), ['ln.lo_name', 'ln.lo_nmls', 'ln.company', 'ln.company_nmls']);
  const co = { ...base, 'biz.industry': 'lender', 'biz.lender_kind': 'company' };
  eq(miss(L.ctxOf({ products: [] }, co, {}), co), ['ln.company', 'ln.company_nmls']);
  const none = { ...base, 'biz.industry': 'lender' };
  eq(miss(L.ctxOf({ products: [] }, none, {}), none)[0], 'biz.lender_kind');
});
test('required: service needs a trade and at least one service; Suite needs 3 complete goals', () => {
  const sv = { ...base, 'biz.industry': 'service' };
  const ctx = L.ctxOf({ products: ['suite'] }, sv, {});
  eq(miss(ctx, sv), ['sv.trade', 'sv.services', 'suite.goals']);
  const two = { ...sv, 'sv.trade': 'hvac', 'sv.services': [{ name: 'Tune-up' }], 'suite.goals': [{ label: 'Revenue', target: '1M' }, { label: 'Jobs', target: '500' }, { label: 'Leads' }] };
  eq(miss(ctx, two), ['suite.goals'], 'a goal with no target is not a goal');
  two['suite.goals'][2].target = '80';
  eq(miss(ctx, two), []);
});
test('required: texting needs the carrier fields; EIN not for a sole proprietor', () => {
  const ctx = L.ctxOf({ products: ['automations'] }, base, {});
  const a = { ...base, 're.license': '1', 're.brokerage': 'B', 're.broker_name': 'Bo', 're.broker_email': 'b@b.test' };
  eq(miss(ctx, a), ['tx.legal_name', 'tx.biz_type', 'tx.ein', 'tx.address', 'tx.rep_name', 'tx.rep_title', 'tx.rep_email', 'tx.rep_mobile']);
  eq(miss(ctx, { ...a, 'tx.biz_type': 'sole' }).includes('tx.ein'), false);
});
test('required: the rights box only once a file is uploaded', () => {
  const ctx = L.ctxOf({ products: [] }, base, {});
  const a = { ...base, 're.license': '1', 're.brokerage': 'B', 're.broker_name': 'Bo', 're.broker_email': 'b@b.test' };
  eq(miss(ctx, a, []), []);
  eq(miss(ctx, a, [{ slot: 'logos' }]), ['fl.rights']);
  eq(miss(ctx, { ...a, 'fl.rights': true }, [{ slot: 'logos' }]), []);
});

test('still needed: deposit from the lead checklist, need labels ticked when done, skipped deposit absent', () => {
  const ctx = L.ctxOf({ products: ['website', 'suite'] }, base, {});
  const list = L.stillNeeded(ctx, base, [], { deposit_paid: { done: '2026-10-04' } });
  const dep = list.find(x => x.key === 'deposit');
  ok(dep && dep.ok && /Oct 4/.test(dep.note), JSON.stringify(dep));
  const labels = list.map(x => x.label);
  ok(labels.includes('Your logo') && labels.includes('A headshot') && labels.includes('Your 3 goals'), labels.join(', '));
  ok(!L.stillNeeded(ctx, { ...base, 'brand.logo_status': 'none' }, [], {}).some(x => x.label === 'Your logo'), 'no logo to send: not asked');
  ok(!labels.includes('Your name'), 'a filled required field is not listed');
  const after = L.stillNeeded(ctx, base, [{ slot: 'headshot' }], {});
  ok(after.find(x => x.label === 'A headshot').ok, 'ticked once uploaded');
  ok(!after.find(x => x.key === 'deposit').ok, 'no deposit date: not ticked');
  ok(!L.stillNeeded(ctx, base, [], { onbSkip: ['deposit_paid'] }).some(x => x.key === 'deposit'), 'monthly-only client: no deposit line');
  ok(!L.stillNeeded(L.ctxOf({ products: ['suite'] }, base, {}), base, [], {}).some(x => x.label === 'A headshot'), 'no website: no headshot ask');
});
test('still needed never blocks submit on its own: only missingRequired does', () => {
  const ctx = L.ctxOf({ products: ['website'] }, base, {});
  const a = { ...base, 're.license': '1', 're.brokerage': 'B', 're.broker_name': 'Bo', 're.broker_email': 'b@b.test' };
  ok(L.stillNeeded(ctx, a, [], {}).some(x => !x.ok));
  eq(L.missingRequired(ctx, a, []), []);
});

test('forbiddenNumber: SSNs and Luhn-valid cards refused; EIN, phones, dates, prices not', () => {
  eq(L.forbiddenNumber('my ssn is 123-45-6789'), 'ssn');
  eq(L.forbiddenNumber('123 45 6789'), 'ssn');
  eq(L.forbiddenNumber('4111 1111 1111 1111'), 'card');
  eq(L.forbiddenNumber('5500-0000-0000-0004'), 'card');
  for (const fine of ['12-3456789', '316-555-0100', '(316) 555-0100', '2026-10-04', '$350,000', '4111 1111 1111 1112', '1111 1111 1111 1111', 'NMLS 123456', '000-12-3456'])
    eq(L.forbiddenNumber(fine), null, fine);
});

test('cleanAnswers: unknown ids dropped, options enforced, caps applied, files never stored as answers', () => {
  const ctx = L.ctxOf({ products: ['website'] }, { 'biz.industry': 'realtor' }, {});
  const { answers } = L.cleanAnswers({
    'biz.name': 'Reed', 'evil.field': 'x', password: 'hunter2', 'biz.industry': 'realtor', 'web.gbp_status': 'maybe',
    'brand.feel': ['luxury', 'warm', 'classic', 'bold'], 'brand.logo': 'x.png', 'biz.hide_address': 'yes',
    'brand.colors': { mode: 'logo', list: ['#0e2a47', 'red', '#C8A24A'] }, 'site.pages': ['home', 'listings', 'calculators'],
  }, ctx, {});
  eq(Object.keys(answers).sort(), ['biz.hide_address', 'biz.industry', 'biz.name', 'brand.colors', 'brand.feel', 'site.pages']);
  eq(answers['brand.feel'], ['luxury', 'warm', 'classic'], 'max 3');
  eq(answers['biz.hide_address'], false, 'only a real true is true');
  eq(answers['brand.colors'], { mode: 'logo', list: ['#0E2A47', '#C8A24A'] });
  eq(answers['site.pages'], ['home', 'listings'], 'a lender page is not a realtor option');
});
test('cleanAnswers: an SSN anywhere is refused, naming the field', () => {
  const ctx = L.ctxOf({ products: ['automations'] }, {}, {});
  const r = L.cleanAnswers({ 'tx.ein': '123-45-6789' }, ctx, {});
  ok(r.error && /EIN/.test(r.error) && /Social Security/.test(r.error), r.error);
  eq(r.field, 'tx.ein');
  const r2 = L.cleanAnswers({ 'suite.team': [{ name: 'Al', pct: '4111111111111111' }] }, L.ctxOf({ products: ['suite'] }, {}, {}), {});
  ok(r2.error && /card/.test(r2.error), 'inside a list row too');
  ok(!L.cleanAnswers({ 'tx.ein': '12-3456789' }, ctx, {}).error, 'an EIN is fine');
});
test('cleanSections: only known sections, only done', () => {
  eq(L.cleanSections({ biz: { done: true }, web: { done: 'yes' }, hax: { done: true } }), { biz: { done: true } });
});

test('prefill: fills what is empty, never overwrites, goals from the proposal plan when the Suite is bought', () => {
  const a = L.prefill({ 'biz.name': 'Typed By Them' }, { client: { name: 'Jordan', company: 'From CRM', email: 'j@r.test' }, plan: { numbers: [{ label: 'Closings', value: '24' }, { label: 'GCI', value: '$400k' }] }, products: ['suite'] });
  eq(a['biz.name'], 'Typed By Them');
  eq(a['biz.contact_name'], 'Jordan');
  eq(a['suite.goals'], [{ label: 'Closings', target: '24' }, { label: 'GCI', target: '$400k' }]);
  ok(!('suite.goals' in L.prefill({}, { plan: { numbers: [{ label: 'x', value: '1' }] }, products: ['website'] })), 'no Suite, no goals');
});

test('launch: waits by name, starts on the latest date, counts business days', () => {
  const ctx = L.ctxOf({ products: ['website'] }, {}, {});
  const ans = { 'web.domain_own': 'yes', 'web.gbp_status': 'have' };
  let s = L.launchState({ submittedAt: null, checklist: {}, ctx, answers: ans, launchDays: 14 });
  eq(s.waiting, ['your onboarding', 'your deposit', 'domain access', 'Google profile access']);
  ok(!s.started && s.target === null);
  s = L.launchState({ submittedAt: '2026-10-05T15:00:00Z', checklist: { deposit_paid: '2026-10-02', access_dns: { done: '2026-10-07' }, access_gbp: { done: '2026-10-06' } }, ctx, answers: ans, launchDays: 14 });
  ok(s.started); eq(s.startedOn, '2026-10-07', 'the latest of the four');
  eq(s.target, '2026-10-27', '14 business days from Wed Oct 7');
  s = L.launchState({ submittedAt: '2026-10-05', checklist: { onbSkip: ['deposit_paid'] }, ctx: L.ctxOf({ products: ['suite'] }, {}, {}), answers: {}, launchDays: null });
  ok(s.started && s.target === null, 'no launch days in the offer: no target, not a guessed one');
  eq(L.addBusinessDays('2026-10-09', 1), '2026-10-12', 'Friday + 1 = Monday');
});

test('files: by slot, by size, and by their first bytes', () => {
  ok(L.fileAllowed('logos', 'Logo.PNG', 1000).ok);
  eq(L.fileAllowed('logos', 'Logo.PNG', 1000).mime, 'image/png');
  ok(!L.fileAllowed('contacts', 'list.pdf', 1000).ok, 'a PDF is not a contact list');
  ok(!L.fileAllowed('logos', 'x.exe', 1000).ok);
  ok(!L.fileAllowed('logos', 'x.png', 51 * 1048576).ok && /50 MB/.test(L.fileAllowed('logos', 'x.png', 51 * 1048576).error));
  ok(!L.fileAllowed('nope', 'x.png', 1).ok);
  const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]);
  const JPG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
  const PDF = new TextEncoder().encode('%PDF-1.7');
  const ZIP = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
  const HEIC = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic')]);
  ok(L.fileKindOk('png', PNG) && L.fileKindOk('jpg', JPG) && L.fileKindOk('pdf', PDF) && L.fileKindOk('xlsx', ZIP) && L.fileKindOk('heic', HEIC));
  ok(!L.fileKindOk('jpg', PNG), 'a PNG renamed .jpg is refused');
  ok(!L.fileKindOk('pdf', JPG));
  ok(L.fileKindOk('csv', new TextEncoder().encode('name,email\nA,a@b.c')) && !L.fileKindOk('csv', new Uint8Array([1, 0, 2])));
  ok(L.fileKindOk('svg', new TextEncoder().encode('<svg xmlns="x">')) && !L.fileKindOk('svg', PNG));
  for (const slot of Object.keys(L.FILE_SLOTS)) for (const e of L.FILE_SLOTS[slot].exts) ok(L.EXT_MIME[e], `${e} has a canonical type`);
});

test('config: every fallback named; offer supplies people, launch days and the agency', () => {
  let r = L.readOnbConfig({}, null);
  for (const n of ['onboarding', 'state', 'productMap', 'pipelines', 'tiles', 'kickoffUrl', 'offer.company.name', 'offer.launchDays']) ok(r.fellBack.includes(n), n);
  eq(r.config.pipelines.realtor[0], 'New lead');
  r = L.readOnbConfig({ onboarding: { state: 'ks', productMap: { 'growth-os': ['website', 'suite', 'seo'] }, kickoffUrl: 'http://insecure' } },
    { company: { name: 'Agency', email: 'a@a.test', contacts: [{ name: 'Al' }] }, launchDays: 10, packages: [{ seatsIncluded: 5 }] });
  eq(r.config.state, 'KS'); eq(r.config.productMap, { 'growth-os': ['website', 'suite'] });
  eq(r.config.kickoffUrl, ''); ok(r.fellBack.includes('kickoffUrl'), 'http is not taken');
  eq([r.config.agency, r.config.launchDays, r.config.seatsIncluded, r.config.contacts.length], ['Agency', 10, 5, 1]);
  ok(!r.fellBack.includes('state') && !r.fellBack.includes('offer.launchDays'));
  eq(L.productsFor(['growth-os', 'automations'], { 'growth-os': ['website', 'suite'], automations: ['automations'] }), ['website', 'suite', 'automations']);
  eq(L.productsFor(['unknown'], {}), []);
  eq(L.productLine(['suite', 'website']), 'Website + Business Suite');
});

test('progress: done needs the click AND nothing required missing; now, next, later', () => {
  const ctx = L.ctxOf({ products: ['website'] }, base, {});
  const p = L.progress(ctx, base, [], { biz: { done: true }, web: { done: true }, ind: { done: true } });
  eq(p.sections.map(s => s.state).slice(0, 5), ['done', 'done', 'now', 'next', 'later'], 'ind is marked but missing its required license');
  eq([p.done, p.total, p.current], [2, 7, 'ind']);
  ok(p.minutesLeft > 0);
});

test('every field id is unique and every field has a label', () => {
  const all = L.ALL_FIELDS.map(f => f.id);
  eq(all.length, new Set(all).size);
  for (const f of L.ALL_FIELDS) ok(f.label || f.labelFor, f.id);
  for (const f of L.ALL_FIELDS.filter(x => x.type === 'file')) ok(L.FILE_SLOTS[f.slot], f.id + ' slot');
});

test('access guides name the agency email and the registrar', () => {
  const gd = L.accessGuide('domain', { agencyEmail: 'a@a.test', registrar: 'godaddy' }).join(' ');
  ok(gd.includes('GoDaddy') && gd.includes('a@a.test'), gd);
  ok(L.accessGuide('gbp', { agencyEmail: 'a@a.test' }).join(' ').includes('Manager'));
  ok(L.accessGuide('domain', {}).join(' ').includes('DNS records'), 'the not-sure guide offers the DNS route');
});

test('paletteFrom: the most common colours, background and transparency skipped, near-duplicates merged', () => {
  const px = [];
  const add = (r, g, b, a, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  add(255, 255, 255, 255, 900); add(0, 0, 0, 0, 900);          // white background, transparent margin
  add(14, 42, 71, 255, 300); add(16, 44, 70, 255, 100);         // navy, plus anti-aliasing of it
  add(200, 162, 74, 255, 150); add(244, 241, 234, 255, 20);     // gold, a cream that is not white
  const got = L.paletteFrom(px, 3);
  eq(got.length, 3, got.join());
  ok(got[0].startsWith('#0') && /^#C/.test(got[1]), got.join());
  eq(L.paletteFrom([], 3), []);
});
test('withDefaults: pre-checked pages are WRITTEN once, never over an answer', () => {
  const site = L.SECTIONS.find(x => x.id === 'site');
  const ctx = { industry: 'service', products: ['website'] };
  eq(L.withDefaults({}, site, ctx)['site.pages'], ['home', 'about', 'services', 'reviews', 'contact', 'areas', 'gallery']);
  const mine = { 'site.pages': ['home'] };
  ok(L.withDefaults(mine, site, ctx) === mine, 'unchanged object when nothing to add');
  eq(L.withDefaults({}, L.SECTIONS.find(x => x.id === 'text'), { products: ['automations'] })['tx.which'].length, 5);
});
test('checklistState reads its own output unchanged (the portal receives that shape)', () => {
  const once = L.checklistState({ deposit_paid: '2026-10-04', access_dns: { done: '2026-10-05' } });
  eq(L.checklistState(once), once);
  eq(L.stillNeeded({ products: [] }, {}, [], once).find(x => x.key === 'deposit').ok, true);
});

test('offer contacts carry an optional role and a SAFE photo (the build crew card)', () => {
  const { offer } = P.readOffer({ offer: { packages: [{ id: 'a', name: 'A' }], company: { name: 'X', contacts: [
    { name: 'Al', phone: '3165550100', role: 'Build', photo: '/team/al.jpg' }, { name: 'Bo', email: 'b@b.test', photo: 'javascript:alert(1)' }] } } });
  eq(offer.company.contacts.map(c => [c.role, c.photo]), [['Build', '/team/al.jpg'], ['', '']]);
  const v = P.validateOffer({ packages: [{ id: 'a', name: 'A', setup: 1, monthly: 1 }], company: { name: 'X', contacts: [{ name: 'Bo', email: 'b@b.test', photo: 'http://x/y.jpg' }] }, depositPct: 50, terms: 'x' });
  ok(JSON.stringify(v).includes('company.contacts.0.photo'), JSON.stringify(v).slice(0, 300));
});

report('onboardingflow');
