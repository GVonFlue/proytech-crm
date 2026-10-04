/* SETTINGS → PROPOSALS: THE PRICE EDITOR, AND WHAT IT CAN NEVER TOUCH.
   ============================================================================

   The JSON box became a form. Three promises, each tested here:

   1. NOTHING INVALID IS SAVED. validateOffer() names every problem by field —
      a blank name, a price of "abc", a negative, a duplicate id, a deposit of
      0%, a javascript: logo — and Save refuses until it is clean. A price is
      a number of 0 or more; blank is an error, never $0.
   2. THE PREVIEW IS THE REAL PRICE. Each item's "on a proposal" line comes
      from quote(), the function that prices real proposals.
   3. CHANGING A PRICE NEVER CHANGES A SENT PROPOSAL. buildBody() snapshots by
      deep copy; a sent proposal shows its frozen quote (quoteFor); drafts are
      the only rows saveProposal updates; proposal-send never re-prices; and
      the editor writes settings.offer and nothing else.                    */
import fs from 'node:fs'; import path from 'node:path'; import esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const clone = v => JSON.parse(JSON.stringify(v));
const OFFER = JSON.parse(fs.readFileSync(path.join(ROOT, 'PROPOSAL-OFFER.json'), 'utf8'));

/* ---- the DOM first: the bundle below mounts React into it ---- */
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator', 'MutationObserver'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let confirmAnswer = true; dom.window.confirm = () => confirmAnswer;
globalThis.__PROPOSAL_WRITES__ = [];

const entry = path.join(ROOT, 'tests/.boe-entry.jsx');
fs.writeFileSync(entry, `import React from 'react'; import { createRoot } from 'react-dom/client'; import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfferEditor, offerForSave, priceLine, quoteFor } from '../src/Proposals.jsx';
import ProposalDoc from '../src/ProposalDoc.jsx';
import * as P from '../src/lib/proposal.js';
export { OfferEditor, offerForSave, priceLine, quoteFor, ProposalDoc, P, React, createRoot, act, renderToStaticMarkup };`);
const built = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  loader: { '.js': 'jsx', '.json': 'json' }, external: ['react', 'react-dom', 'react-dom/client', 'react-dom/server', 'react/jsx-runtime', 'lucide-react'],
  define: { 'import.meta.env': '{}' }, logLevel: 'error',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.join(ROOT, 'tests/stub-supabase.js') })); } }] });
const out = path.join(ROOT, 'tests/.boe.mjs'); fs.writeFileSync(out, built.outputFiles[0].text);
const { OfferEditor, offerForSave, priceLine, quoteFor, ProposalDoc, P, React, createRoot, act, renderToStaticMarkup } = await import(out + '?' + Date.now());
fs.unlinkSync(entry); fs.unlinkSync(out);

/* ---- 1. validateOffer ---- */
console.log('\nvalidateOffer: nothing invalid is saved');
{
  const good = P.validateOffer(OFFER);
  ok('the shipped offer is valid', good.ok, JSON.stringify(good.errors));
  ok('  and returns the same offer readOffer reads', good.offer && good.offer.packages.length === 3 && good.offer.addons.length === 1);
  const bad = (fn) => { const o = clone(OFFER); fn(o); return P.validateOffer(o); };
  const has = (r, p) => r.errors.some(e => e.path === p);
  const cases = [
    ['a blank item name', o => { o.packages[0].name = ' '; }, 'packages.0.name'],
    ['a blank id', o => { o.packages[0].id = ''; }, 'packages.0.id'],
    ['an id with spaces', o => { o.packages[0].id = 'Growth OS'; }, 'packages.0.id'],
    ['a duplicate id', o => { o.addons[0].id = 'website'; }, 'addons.0.id'],
    ['a blank service', o => { o.packages[1].service = ''; }, 'packages.1.service'],
    ['a blank setup price (never $0)', o => { o.packages[2].setup = ''; }, 'packages.2.setup'],
    ['a setup price of "abc"', o => { o.packages[2].setup = 'abc'; }, 'packages.2.setup'],
    ['a negative monthly', o => { o.addons[0].monthly = -1; }, 'addons.0.monthly'],
    ['a boolean price', o => { o.packages[0].monthly = true; }, 'packages.0.monthly'],
    ['fractional seats', o => { o.packages[0].seatsIncluded = 2.5; }, 'packages.0.seatsIncluded'],
    ['a negative extra seat', o => { o.packages[0].extraSeat = -5; }, 'packages.0.extraSeat'],
    ['an http onboarding link', o => { o.packages[0].onboardingUrl = 'http://forms.example.com'; }, 'packages.0.onboardingUrl'],
    ['an empty "includes" line', o => { o.packages[0].includes.push(' '); }, `packages.0.includes.${OFFER.packages[0].includes.length}`],
    ['a 0% deposit', o => { o.depositPct = 0; }, 'depositPct'],
    ['a 101% deposit', o => { o.depositPct = 101; }, 'depositPct'],
    ['a blank deposit', o => { o.depositPct = ''; }, 'depositPct'],
    ['0 valid days', o => { o.validDays = 0; }, 'validDays'],
    ['61 valid days', o => { o.validDays = 61; }, 'validDays'],
    ['fractional valid days', o => { o.validDays = 2.5; }, 'validDays'],
    ['as many free months as paid', o => { o.prepay = { months: 12, free: 12 }; }, 'prepay.free'],
    ['0 prepay months', o => { o.prepay = { months: 0, free: 0 }; }, 'prepay.months'],
    ['blank payment terms', o => { o.terms = ''; }, 'terms'],
    ['a step with no title', o => { o.steps[1].title = ''; }, 'steps.1.title'],
    ['a step with no text', o => { o.steps[1].text = ''; }, 'steps.1.text'],
    ['an empty "what we need" line', o => { o.needFromYou.push(''); }, `needFromYou.${OFFER.needFromYou.length}`],
    ['no company name', o => { o.company.name = ''; }, 'company.name'],
    ['a javascript: logo', o => { o.company.logo = 'javascript:alert(1)'; }, 'company.logo'],
    ['a data: logo', o => { o.company.logo = 'data:image/png;base64,AA'; }, 'company.logo'],
    ['an http footer mark', o => { o.company.mark = 'http://x.example.com/m.png'; }, 'company.mark'],
    ['an invalid company email', o => { o.company.email = 'nope'; }, 'company.email'],
    ['no packages', o => { o.packages = []; }, 'packages'],
  ];
  for (const [what, fn, p] of cases) { const r = bad(fn); ok(`refuses ${what} (at ${p})`, !r.ok && has(r, p) && r.offer === null, JSON.stringify(r.errors)); }
  ok('a free price of 0 is allowed', P.validateOffer({ ...clone(OFFER), addons: [{ ...OFFER.addons[0], setup: 0 }] }).ok);
  ok('no prepay at all is allowed', P.validateOffer({ ...clone(OFFER), prepay: null }).ok);
  ok('a same-site or https logo is allowed', P.validateOffer({ ...clone(OFFER), company: { ...OFFER.company, logo: 'https://cdn.example.com/l.png', mark: '/m.png' } }).ok);
  ok('nothing at all is refused without throwing', !P.validateOffer(null).ok && !P.validateOffer([]).ok);
}

console.log('\nthe form saves numbers, and previews the real price');
{
  const typed = clone(OFFER); typed.packages[2].setup = '2100'; typed.packages[2].monthly = '199.5'; typed.depositPct = '40'; typed.validDays = '10'; typed.prepay = { months: '12', free: '2' };
  const saved = offerForSave(typed);
  ok('typed prices are saved as numbers', saved.packages[2].setup === 2100 && saved.packages[2].monthly === 199.5 && saved.depositPct === 40 && saved.validDays === 10 && saved.prepay.months === 12);
  const line = priceLine(OFFER, 'packages', 2);
  ok('the Business Suite line reads from quote()', line === 'Business Suite: $1,999 setup + $199/mo · 5 seats included, then $29/mo each · 50% deposit, $999.50 at signing · or 12 months up front for $1,990 (2 free)', line);
  ok('an add-on line', priceLine(OFFER, 'addons', 0) === '+ Automations: $1,499 setup + $249/mo, on top of any package', priceLine(OFFER, 'addons', 0));
  ok('a missing price previews as a prompt, not $0', /Set a setup and a monthly price/.test(priceLine({ ...clone(OFFER), packages: [{ ...OFFER.packages[0], setup: '' }] }, 'packages', 0)));
}

/* ---- 3. a sent proposal never changes ---- */
console.log('\nchanging a price never changes a proposal already sent');
{
  const { offer } = P.readOffer({ offer: clone(OFFER) });
  const q = P.quote(offer, { packageId: 'suite', seats: 5 });
  const body = P.buildBody({ offer, q, copy: { headline: 'H' }, client: { name: 'C' }, preparedOn: '2026-10-06', validDays: 7 });
  const before = JSON.stringify(body);
  // the owner edits the offer IN PLACE afterwards: prices, terms, company
  offer.packages.find(p => p.id === 'suite').setup = 9999; offer.terms = 'CHANGED'; offer.company.name = 'Renamed'; offer.steps[0].title = 'Changed';
  offer.packages.find(p => p.id === 'suite').covers.push('CHANGED');
  ok('buildBody shares nothing with the offer: in-place edits do not reach it', JSON.stringify(body) === before);
  const sent = { id: 's1', status: 'sent', body: JSON.parse(before) };
  const nowOffer = P.readOffer({ offer: { ...clone(OFFER), packages: OFFER.packages.map(p => p.id === 'suite' ? { ...p, setup: 2500, monthly: 249 } : p) } }).offer;
  const shown = quoteFor(sent, nowOffer, { packageId: 'suite', seats: 5 });
  ok('a SENT proposal shows its frozen quote after the price changes', shown.setup === 1999 && shown.monthly === 199, JSON.stringify([shown.setup, shown.monthly]));
  ok('  so does a viewed or accepted one', ['viewed', 'accepted'].every(st => quoteFor({ ...sent, status: st }, nowOffer, { packageId: 'suite' }).setup === 1999));
  ok('a DRAFT is priced live from the new offer', quoteFor({ status: 'draft' }, nowOffer, { packageId: 'suite', seats: 5 }).setup === 2500);
  const html = renderToStaticMarkup(React.createElement(ProposalDoc, { body: sent.body }));
  ok('the document the client sees still says $1,999', /\$1,999/.test(html) && !/\$2,500/.test(html));
  const sb = fs.readFileSync(path.join(ROOT, 'src/lib/supabase.js'), 'utf8');
  const save = sb.slice(sb.indexOf('async saveProposal'), sb.indexOf('async markProposalApplied'));
  ok('saveProposal updates DRAFTS only (the status filter is on the write)', /\.update\(rec\)\.eq\('id', row\.id\)\.eq\('status', 'draft'\)/.test(save));
  const sendSrc = fs.readFileSync(path.join(ROOT, 'api/proposal-send.js'), 'utf8');
  ok('proposal-send never re-prices: it reads no offer and calls no quote()', !/\bquote\(|readOffer|app_settings|settings\.offer/.test(sendSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
}

/* ---- the real editor, mounted ---- */
const root = createRoot(document.getElementById('root'));
const tick = async (ms = 30) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await tick(); };
const setVal = async (el, v) => { await act(async () => { const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await tick(); };
const byText = (sel, re) => [...document.querySelectorAll(sel)].find(e => re.test(e.textContent || ''));
let saves = [];
const SETTINGS = { offer: clone(OFFER), stages: ['keep-me'], services: [{ name: 'Web+CRM' }] };
let mounts = 0;   // a fresh key per mount: same-instance re-renders keep the editor's draft
const mount = async (props) => { saves = []; await act(async () => { root.render(React.createElement(OfferEditor, { key: ++mounts, settings: clone(SETTINGS), saveSettings: async s => { saves.push(clone(s)); }, ...props })); }); await tick(); };

console.log('\nthe editor, mounted');
{
  await mount({ isOwner: false });
  ok('a rep (Settings switched on for them) sees a notice, not the form', /Only an owner can change the offer/.test(document.body.textContent) && !document.querySelector('.oe-card input'));

  await mount({});
  ok('a card per package and add-on', document.querySelectorAll('.oe-card.package').length === 3 && document.querySelectorAll('.oe-card.addon').length === 1);
  ok('each with its live price line', /Business Suite: \$1,999 setup \+ \$199\/mo/.test(document.body.textContent));
  const suiteSetup = document.querySelector('input[aria-label="Business Suite setup price"]');
  await setVal(suiteSetup, '2100');
  ok('the price line updates as you type', /Business Suite: \$2,100 setup/.test(document.body.textContent));
  await click(byText('button', /^Save offer$/));
  ok('Save writes once', saves.length === 1);
  ok('  the new price, as a number', saves[0] && saves[0].offer.packages.find(p => p.id === 'suite').setup === 2100);
  ok('  and every other setting untouched', saves[0] && JSON.stringify(saves[0].stages) === '["keep-me"]' && saves[0].services.length === 1);
  ok('  and no proposal is written by saving prices', globalThis.__PROPOSAL_WRITES__.length === 0);

  await setVal(document.querySelector('input[aria-label="Business Suite setup price"]'), 'abc');
  await setVal(document.querySelector('.oe-card.package input[aria-label="Item name"]'), '');
  saves = [];
  await click(byText('button', /^Save offer$/));
  ok('an invalid offer is NOT saved', saves.length === 0);
  ok('  and says how many things to fix', /Fix \d+ things? before saving/.test(document.body.textContent));
  ok('  the bad price is marked on its field', !!document.querySelector('[data-path="packages.2.setup"].bad'));
  ok('  and so is the blank name', !!document.querySelector('[data-path="packages.0.name"].bad'));

  await click(byText('button', /Load default offer/));
  ok('Load default offer restores the shipped prices into the form', document.querySelector('input[aria-label="Business Suite setup price"]').value === '1999');
  saves = [];
  ok('  without saving them', saves.length === 0);

  const before = document.querySelectorAll('.oe-card.addon').length;
  await click(byText('.oe-add', /Add an add-on/));
  ok('add an add-on', document.querySelectorAll('.oe-card.addon').length === before + 1);
  confirmAnswer = false; await click([...document.querySelectorAll('.oe-card.addon .oe-rm')].at(-1));
  ok('removing asks first, and "no" keeps it', document.querySelectorAll('.oe-card.addon').length === before + 1);
  confirmAnswer = true; await click([...document.querySelectorAll('.oe-card.addon .oe-rm')].at(-1));
  ok('  "yes" removes it', document.querySelectorAll('.oe-card.addon').length === before);

  const auto = [...document.querySelectorAll('.oe-card')].find(c => /Automations/.test(c.querySelector('input').value));
  await click([...auto.querySelectorAll('.oe-kind button')].find(b => /Package/.test(b.textContent)));
  ok('the package / add-on toggle moves an item across', document.querySelectorAll('.oe-card.package').length === 4 && document.querySelectorAll('.oe-card.addon').length === 0);

  const inc = document.querySelector('[data-path="packages.0.includes"]');
  const first = inc.querySelector('input').value, second = inc.querySelectorAll('input')[1].value;
  await click(inc.querySelectorAll('.oe-li')[1].querySelector('button[title="Move up"]'));
  ok('list items reorder', document.querySelector('[data-path="packages.0.includes"] input').value === second && document.querySelectorAll('[data-path="packages.0.includes"] input')[1].value === first);

  await click(byText('button', /Advanced: edit JSON/));
  const ta = document.querySelector('textarea[aria-label="Offer JSON"]');
  ok('Advanced: edit JSON shows the offer as JSON', ta && JSON.parse(ta.value).packages.length === 4);
  const j = JSON.parse(ta.value); j.depositPct = 30; await setVal(ta, JSON.stringify(j));
  await click(byText('button', /Back to the form/));
  ok('  and an edit there comes back into the form', document.querySelector('input[aria-label="Deposit percent"]').value === '30');
  await click(byText('button', /Advanced: edit JSON/));
  await setVal(document.querySelector('textarea[aria-label="Offer JSON"]'), '{ not json');
  await click(byText('button', /Back to the form/));
  ok('  broken JSON is not taken back into the form', /Fix the JSON before going back/.test(document.body.textContent) && !!document.querySelector('textarea[aria-label="Offer JSON"]'));

  await mount({ settings: { stages: [] } });
  ok('no offer yet: offers the default or a blank start', !!byText('button', /Load default offer/) && !!byText('button', /Start from scratch/));
  await click(byText('button', /Load default offer/));
  ok('  loading the default fills the form', document.querySelectorAll('.oe-card.package').length === 3);
}
await act(async () => { root.unmount(); });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
