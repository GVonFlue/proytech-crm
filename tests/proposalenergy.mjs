/* PROPOSALS WITH ENERGY — and everything that must NOT change with it.
   ============================================================================

   The voice moved from "plain" to "energized and specific", the sections got
   names a client wants to read, accepting became "Lock in my launch", and the
   moment after is a "You're in" screen. What this file holds in place:

   - the AI's HARD RULES survived the rewrite word for word (facts only, no
     invented numbers, no promised results, no prices, no clause hyphens, the
     cliché ban), and the new voice can only borrow energy from THEIR goal;
   - the compliance text a client agrees to is byte-identical to before;
   - the point of contact is chosen per proposal (one, or both), defaults to
     the signed-in owner, is frozen into the body, and the "You're in" copy
     speaks in exactly those names — or "we" with none;
   - confetti never runs for someone who asked their device for less motion,
     and the page never navigates away on its own;
   - the onboarding and payment links stay hidden until the proposal is
     accepted.                                                             */
import fs from 'node:fs'; import path from 'node:path'; import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const clone = v => JSON.parse(JSON.stringify(v));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* The compliance markup as it stood on main before this change, pinned as text
   (CI checks out one commit, so there is no origin/main to read at test time).
   If either of these must ever change, it is a deliberate legal edit: change
   it here too, in the same commit, and say so in the PR. */
const MAIN_TERMS = "{(st.terms || st.cancel) && <div className=\"pd-terms\">{[st.terms, st.cancel].filter(Boolean).join(' ')}</div>}";
const MAIN_GUAR  = "{st.guarantee && <div className=\"pd-guar\"><b>Our guarantee.</b> {st.guarantee}</div>}";
const MAIN_AGREE = "<span>I agree to this proposal, its terms, and the {q.depositPct}% deposit of {usd(q.deposit)} due at signing.</span>";

/* the DOM, then the real components */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const entry = path.join(ROOT, 'tests/.ben-entry.jsx');
fs.writeFileSync(entry, `import React from 'react'; import { createRoot } from 'react-dom/client'; import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalDoc from '../src/ProposalDoc.jsx';
import Celebrate, { prefersReducedMotion, burst } from '../src/proposal/Celebrate.jsx';
import Proposals from '../src/Proposals.jsx';
import * as P from '../src/lib/proposal.js';
export { React, createRoot, act, renderToStaticMarkup, ProposalDoc, Celebrate, prefersReducedMotion, burst, Proposals, P };`);
const built = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  loader: { '.js': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react-dom/server', 'react/jsx-runtime', 'lucide-react'],
  define: { 'import.meta.env': '{}' }, logLevel: 'error',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.join(ROOT, 'tests/stub-supabase.js') })); } }] });
const out = path.join(ROOT, 'tests/.ben.mjs'); fs.writeFileSync(out, built.outputFiles[0].text);
const { React, createRoot, act, renderToStaticMarkup, ProposalDoc, Celebrate, prefersReducedMotion, burst, Proposals, P } = await import(out + '?' + Date.now());
fs.unlinkSync(entry); fs.unlinkSync(out);
const { SYSTEM } = await import('../api/proposal-draft.js');
const { publicView, PUBLIC_BODY_KEYS } = await import('../api/proposal-public.js');
const html = el => renderToStaticMarkup(el);
const text = h => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const RAW = JSON.parse(read('PROPOSAL-OFFER.json'));
const { offer } = P.readOffer({ offer: RAW });
const q = P.quote(offer, { packageId: 'growth-os', addonIds: ['automations'], seats: 5 });
const COPY = { headline: 'Your 48-home year starts here', summary: 'S', plan: { goal: 'Close 48', numbers: [], levers: [] }, gaps: [{ title: 'g', text: 't' }], build: [{ title: 'b', text: 't', item: 'growth-os' }], whyNow: ['w'] };
const bodyWith = (pick) => P.buildBody({ offer, q, copy: COPY, client: { name: 'Jordan Reed', company: 'Reed Realty Group' }, preparedOn: '2026-10-06', validDays: 7, contacts: P.chosenContacts(offer.company.contacts, pick) });

console.log('\n1. the AI copy rules');
{
  ok('the voice is "energized and specific", not "plain"', /VOICE: ENERGIZED AND SPECIFIC/.test(SYSTEM) && !/Plain, confident/.test(SYSTEM));
  ok('it leads with THEIR 12-month goal, as within reach, specific to them', /Lead with THEIR future/.test(SYSTEM) && /12-month goal as something within reach/.test(SYSTEM) && /Never generic/.test(SYSTEM));
  ok('the arc: celebrate, name what holds them back, the build as the turning point', /celebrate what they already do well, name what is holding them back, and show the build as the turning point/.test(SYSTEM));
  ok('short, punchy, a coach who believes in them', /Short, punchy sentences with momentum/.test(SYSTEM) && /a coach who believes in them/.test(SYSTEM));
  ok('headline: an energizing line about their outcome, not a project title', /headline: a short, energizing line about THEIR outcome[^\n]*not a project title/.test(SYSTEM));
  ok('whyNow: momentum from starting now, never pressure or fake urgency', /whyNow:[^\n]*momentum they gain by starting now[^\n]*never pressure or fake urgency/.test(SYSTEM));
  ok('KEPT: only facts from the notes', /1\. Use ONLY facts in the notes and client details\. Never invent a number/.test(SYSTEM));
  ok('KEPT: no prices', /2\. NEVER mention a price, a dollar amount, a discount, a deposit or a payment term\./.test(SYSTEM));
  ok('KEPT: never promise results', /3\. Never promise a specific number of jobs, leads or revenue\./.test(SYSTEM));
  ok('KEPT: never name the meeting type', /4\. Do not name the type of meeting the notes came from\./.test(SYSTEM));
  ok('KEPT: build only what is bought', /5\. The build section describes ONLY the items listed as being purchased/.test(SYSTEM));
  ok('NEW: no pressure, no fake urgency', /6\. No pressure and no fake urgency/.test(SYSTEM));
  ok('KEPT: no em dashes or hyphens between clauses', /Never use em dashes or hyphens as punctuation between clauses/.test(SYSTEM));
  const banned = ['game-changer', 'revolutionary', 'unlock', 'supercharge', 'cutting-edge'];
  const banLine = (SYSTEM.split('\n').find(l => /^- .*Banned:/.test(l)) || '');
  ok('KEPT: the cliché ban names all five', banned.every(w => banLine.includes(`"${w}"`)), banLine);
  ok('  and the prompt never uses them anywhere else', banned.every(w => SYSTEM.split('\n').filter(l => l !== banLine && l.toLowerCase().includes(w)).length === 0));
  ok('the email tells them to click "Lock in my launch"', /click "Lock in my launch"/.test(SYSTEM) && !/click Accept/.test(SYSTEM));
  ok('the example energy comes from their own goal, not a hype word', /"48 homes in 2027 is closer than you think\."/.test(SYSTEM) && /Use their goal and their numbers only as the notes state them/.test(SYSTEM));
}

console.log('\n2. section titles, and the compliance text that must not move');
{
  const doc = text(html(React.createElement(ProposalDoc, { body: bodyWith('Logan'), expiresAt: '2026-10-14T17:00:00Z' })));
  for (const t of ["Where you're headed", "What's holding you back", "What we're building for you", 'your investment in growth', 'Your road to Launch Day'])
    ok(`"${t}"`, doc.includes(t), doc.slice(0, 200));
  for (const t of ['Where you said you want to go', 'What is costing you right now', 'Everything that gets installed', 'How it runs', '— the investment'])
    ok(`old "${t}" is gone`, !doc.includes(t));
  ok('the terms, cancelling and guarantee render exactly as written in the offer', doc.includes(RAW.terms) && doc.includes(RAW.cancel) && doc.includes(RAW.guarantee));
  const termsLine = s => (s.match(/\{\(st\.terms \|\| st\.cancel\) && <div className="pd-terms">[^\n]*/) || [''])[0];
  const guarLine = s => (s.match(/\{st\.guarantee && <div className="pd-guar">[^\n]*/) || [''])[0];
  ok('the terms and guarantee markup is byte-identical to main', termsLine(read('src/ProposalDoc.jsx')) === MAIN_TERMS && guarLine(read('src/ProposalDoc.jsx')) === MAIN_GUAR);
  const agree = s => (s.match(/<span>I agree to this proposal[^\n]*<\/span>/) || [''])[0];
  ok('the "I agree" statement a client ticks is byte-identical to main', agree(read('src/proposal/main.jsx')) === MAIN_AGREE);
  ok('the "valid until… accept below" line is unchanged', /<b>This price and proposal are good for \{body\.validDays \|\| 7\} days\.<\/b>/.test(read('src/ProposalDoc.jsx')));
  const main = read('src/proposal/main.jsx');
  ok('the button says "Lock in my launch"', /'Lock in my launch'/.test(main) && !/'Accept proposal'/.test(main));
}

console.log('\n3. the point of contact, chosen per proposal');
{
  const C = offer.company.contacts;
  ok('the shipped contacts: Garrett and Logan, as given', JSON.stringify(RAW.company.contacts) === JSON.stringify([{ name: 'Garrett', phone: '901-335-3905', email: 'admin@getproytech.com' }, { name: 'Logan', phone: '913-237-4403', email: '' }]));
  ok('launchDays is 14 in the shipped offer, and the offer is valid', RAW.launchDays === 14 && P.validateOffer(RAW).ok, JSON.stringify(P.validateOffer(RAW).errors));
  ok('default: the contact matching the signed-in owner (full name)', P.defaultContactPick(C, 'Logan Sell') === 'Logan');
  ok('default: matching on first name, any case', P.defaultContactPick(C, 'garrett von flue') === 'Garrett');
  ok('default: anyone else gets the first contact', P.defaultContactPick(C, 'Dana Rep') === 'Garrett' && P.defaultContactPick(C, '') === 'Garrett');
  ok('no contacts: no default', P.defaultContactPick([], 'Logan') === '');
  ok('"Both" means both', P.chosenContacts(C, P.CONTACTS_ALL).map(c => c.name).join() === 'Garrett,Logan');
  ok('one name means that one', P.chosenContacts(C, 'Logan').map(c => c.name).join() === 'Logan');
  ok('an unknown pick falls back to the first, never to nobody', P.chosenContacts(C, 'Nobody').map(c => c.name).join() === 'Garrett');
  const b = bodyWith('Logan');
  ok('frozen into the body: the chosen contact, with phone and email', JSON.stringify(b.contacts) === JSON.stringify([{ name: 'Logan', phone: '913-237-4403', email: '' }]));
  ok('the body does NOT carry the offer\'s whole contact list', !('contacts' in b.company));
  const before = JSON.stringify(b);
  offer.company.contacts[1].phone = '000'; offer.company.contacts.push({ name: 'New', phone: '1', email: '' });
  ok('editing contacts in Settings afterwards does not reach a built body', JSON.stringify(b) === before);
  offer.company.contacts = P.readOffer({ offer: RAW }).offer.company.contacts;
  const C2 = offer.company.contacts;   // fresh: the line above restored the shipped two
  ok('the copy: one name', P.whoWillSend(P.chosenContacts(C2, 'Logan')) === 'Logan will send');
  ok('the copy: both', P.whoWillSend(P.chosenContacts(C2, P.CONTACTS_ALL)) === 'Garrett or Logan will send');
  ok('the copy: three', P.whoWillSend([{ name: 'A' }, { name: 'B' }, { name: 'C' }]) === 'A, B or C will send');
  ok('the copy: none', P.whoWillSend([]) === "We'll send");
  const v = (fn) => { const o = clone(RAW); fn(o); return P.validateOffer(o).errors.map(e => e.path); };
  ok('a contact needs a name', v(o => { o.company.contacts[0].name = ''; }).includes('company.contacts.0.name'));
  ok('a contact needs a phone or an email', v(o => { o.company.contacts[1].phone = ''; }).includes('company.contacts.1.phone'));
  ok('an email must be an email', v(o => { o.company.contacts[0].email = 'nope'; }).includes('company.contacts.0.email'));
  ok('a phone must be a phone', v(o => { o.company.contacts[0].phone = '12'; }).includes('company.contacts.0.phone'));
  ok('onboarding and payment links must be https', ['onboardingUrl', 'paymentUrl'].every(k => v(o => { o[k] = 'http://x.example.com'; }).includes(k)));
  ok('days to launch: a whole number, 1 to 120', ['0', 121, 2.5, 'abc'].every(x => v(o => { o.launchDays = x; }).includes('launchDays')) && P.validateOffer({ ...clone(RAW), launchDays: '' }).ok);
}

console.log('\n   the picker, in the real builder');
{
  const root = createRoot(document.getElementById('root'));
  const pickFor = async (me, proposals = []) => {
    await act(async () => { root.render(React.createElement(Proposals, { key: me + proposals.length, leads: [{ id: 'L1', name: 'Jordan', company: 'Reed Realty Group', email: 'j@x.co' }], settings: { offer: RAW }, proposals, me, apiPost: async () => ({ json: async () => ({}) }) })); });
    const btn = proposals.length ? document.querySelector('.pp-row') : [...document.querySelectorAll('button')].find(b => /New proposal/.test(b.textContent));
    await act(async () => { btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    const sel = document.querySelector('select[aria-label="Point of contact"]');
    return sel && { value: sel.value, options: [...sel.options].map(o => o.textContent) };
  };
  let p = await pickFor('Logan Sell');
  ok('signed in as Logan: the picker defaults to Logan', p && p.value === 'Logan', JSON.stringify(p));
  ok('  and offers each contact, or Both', p && p.options.join() === 'Garrett,Logan,Both', JSON.stringify(p && p.options));
  p = await pickFor('Dana Rep');
  ok('signed in as someone else: the first contact', p && p.value === 'Garrett');
  const draft = { id: 'd1', lead_id: 'L1', token: 'T'.repeat(43), status: 'draft', valid_days: 7, updated_at: new Date().toISOString(), body: bodyWith(P.CONTACTS_ALL) };
  p = await pickFor('Logan Sell', [draft]);
  ok('a saved draft reopens with ITS choice (Both), not the default', p && p.value === P.CONTACTS_ALL, JSON.stringify(p));
  await act(async () => { root.unmount(); });
}

console.log('\n4. the "You\'re in" screen');
{
  const yi = (pick, links = {}, extra = {}) => text(html(React.createElement(Celebrate, { body: { ...bodyWith(pick), ...extra }, name: 'Jordan Reed', ...links })));
  const one = yi('Logan');
  ok('"You\'re in, Jordan. Let\'s grow." (first name from the typed signature)', one.includes("You're in, Jordan. Let's grow."), one.slice(0, 160));
  ok('"Today\'s the day Reed Realty Group starts running on a real system."', one.includes("Today's the day Reed Realty Group starts running on a real system."));
  ok('the Launch Day ticket: admit one, company, what they bought, about 14 days', /Admit one/.test(one) && /Launch Day ticket/.test(one) && one.includes('Growth OS + Automations') && /about 14 days after onboarding/.test(one));
  ok('what happens next: deposit, onboarding (~20 min, saves as you go), kickoff', /Your deposit link/.test(one) && /About 20 minutes\. It saves as you go/.test(one) && /Your kickoff call/.test(one));
  ok('ONE contact, no links set: "Logan will send your deposit and onboarding links today."', one.includes('Logan will send your deposit and onboarding links today.'));
  ok('BOTH: "Garrett or Logan will send…"', yi(P.CONTACTS_ALL).includes('Garrett or Logan will send your deposit and onboarding links today.'));
  ok('NONE: "We\'ll send…"', yi('x', {}, { contacts: [] }).includes("We'll send your deposit and onboarding links today."));
  const both = html(React.createElement(Celebrate, { body: bodyWith(P.CONTACTS_ALL), name: 'Jordan' }));
  ok('the contacts show with tap-to-call phones and email', both.includes('href="tel:+19013353905"') && both.includes('href="tel:+19132374403"') && both.includes('href="mailto:admin@getproytech.com"') && /Your points of contact/.test(text(both)));
  ok('  a blank email shows no empty mail link', !both.includes('href="mailto:"'));
  const withLinks = html(React.createElement(Celebrate, { body: bodyWith('Logan'), name: 'Jordan', onboardingUrl: 'https://forms.example.com/onb', paymentUrl: 'https://pay.example.com/dep' }));
  ok('with an onboarding link: the big orange "Start my onboarding →" button', /class="yi-go" href="https:\/\/forms\.example\.com\/onb"/.test(withLinks) && /Start my onboarding/.test(text(withLinks)) && !/links today/.test(text(withLinks)));
  ok('with a payment link: "Pay my deposit"', /class="yi-link" href="https:\/\/pay\.example\.com\/dep"/.test(withLinks));
  const unsafe = html(React.createElement(Celebrate, { body: bodyWith('Logan'), name: 'J', onboardingUrl: 'javascript:alert(1)', paymentUrl: 'http://pay.example.com' }));
  ok('a non-https link is never rendered as a button', !/javascript:|http:\/\/pay/.test(unsafe) && !/yi-go/.test(unsafe));
  ok('no launch days set: no "about N days" claim', !/about \d+ days/.test(yi('Logan', {}, { launchDays: null })));
  ok('no company: their name stands in', text(html(React.createElement(Celebrate, { body: { ...bodyWith('Logan'), client: { name: 'Jordan Reed' } }, name: 'Jordan' }))).includes("Today's the day Jordan Reed starts"));
}

console.log('\n   motion, and no navigating away');
{
  const fakeWin = reduce => ({ matchMedia: q => ({ matches: reduce && /prefers-reduced-motion: reduce/.test(q) }), innerWidth: 390, innerHeight: 800, devicePixelRatio: 2,
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, performance: { now: () => 0 } });
  let appended = 0;
  const fakeDoc = { createElement: () => ({ setAttribute() {}, remove() {}, getContext: () => ({ scale() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillRect() {} }) }), body: { appendChild: () => { appended++; } } };
  ok('prefers-reduced-motion is read', prefersReducedMotion(fakeWin(true)) === true && prefersReducedMotion(fakeWin(false)) === false);
  burst(fakeDoc, fakeWin(true));
  ok('reduced motion: NO confetti at all', appended === 0);
  burst(fakeDoc, fakeWin(false));
  ok('otherwise: one burst', appended === 1);
  const cel = read('src/proposal/Celebrate.jsx');
  ok('confetti is the three brand colours', /CONFETTI_COLORS = \['#2E9BFF', '#38BDF8', '#FB6926'\]/.test(cel));
  ok('it runs only when asked (just accepted), not on a return visit', /confetti=\{!!state\.done\}/.test(read('src/proposal/main.jsx')));
  const main = read('src/proposal/main.jsx');
  ok('the page never navigates away on its own', !/location\.href\s*=/.test(main) && !/setTimeout/.test(main));
  ok('print hides the celebration', /@media print\{ \.yi\{display:none\} \}/.test(cel));
}

console.log('\n   what the public API hands over, and when');
{
  const body = { ...bodyWith('Logan'), onboardingUrl: 'https://forms.example.com/onb', paymentUrl: 'https://pay.example.com/dep' };
  const sent = publicView({ status: 'sent', body, expires_at: new Date(Date.now() + 864e5).toISOString() });
  ok('before acceptance: contacts and launch days, but NO onboarding or payment link', sent.body.contacts && sent.body.launchDays === 14 && !('onboardingUrl' in sent) && !('paymentUrl' in sent) && !JSON.stringify(sent).includes('forms.example.com') && !JSON.stringify(sent).includes('pay.example.com'));
  const acc = publicView({ status: 'accepted', body, accepted_name: 'Jordan Reed' });
  ok('after acceptance: both links, for a client who comes back', acc.onboardingUrl === 'https://forms.example.com/onb' && acc.paymentUrl === 'https://pay.example.com/dep');
  ok('contacts and launchDays are named in the public field list', PUBLIC_BODY_KEYS.includes('contacts') && PUBLIC_BODY_KEYS.includes('launchDays') && !PUBLIC_BODY_KEYS.includes('onboardingUrl') && !PUBLIC_BODY_KEYS.includes('paymentUrl'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
