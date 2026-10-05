/* THE CLIENT'S PAGE: what they see, what Accept sends, and what it never ships.

   Renders src/proposal/main.jsx in a simulated browser with the server
   stubbed. Proves:
   - the token is read from the # fragment, and a bad one never hits the server
   - the proposal renders with the CRM's numbers
   - Accept will not send without a typed name and the box ticked
   - Accept POSTs from the page (never a link a mail scanner could open)
   - an expired proposal shows no Accept button
   - the page's bundle contains no database client and no CRM screens

   Seen red: reading the token from the query string; Accept enabled with no
   name; importing lib/lead into the page (pulled the CRM into the bundle). */
import fs from 'fs';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); } };

/* the bundle itself: what a client downloads */
const built = await esbuild.build({ entryPoints: ['src/proposal/main.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'], logLevel: 'silent' });
const code = built.outputFiles[0].text;
ok('the page bundle has no database client', !/supabase|createClient/.test(code));
ok('  and none of the CRM', !/LeadView|ServiceAssign|dealRows|owedBy/.test(code));
fs.writeFileSync('tests/.bppage.mjs', code);

const boot = async (hash, server) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://crm.test/proposal.html' + hash, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'navigator', 'location'])
    try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__NO_MOUNT__ = true;
  const calls = [];
  globalThis.fetch = async (u, o = {}) => { const b = JSON.parse(o.body || '{}'); calls.push({ u: String(u), b }); const r = server(b); return { status: r.status || 200, json: async () => r.body }; };
  const { Page } = await import('./.bppage.mjs?v=' + Math.random());
  const React = (await import('react')).default; const { createRoot } = await import('react-dom/client'); const { act } = await import('react');
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Page)); });
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });
  const tick = async () => act(async () => { await new Promise(r => setTimeout(r, 60)); });
  const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await tick(); };
  const type = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); await tick(); };
  return { dom, calls, root, click, type, txt: () => document.body.textContent.replace(/\s+/g, ' ') };
};

const TOK = 'Ab_-'.repeat(10) + 'xyz';
const BODY = { client: { name: 'Dee', company: 'Dee Co' }, company: { name: 'Agency', people: 'G & L', email: 'hi@agency.test' }, preparedOn: '2026-10-03', validDays: 7,
  copy: { headline: 'Growth systems', summary: 'Your follow up runs on memory.', plan: { goal: '', numbers: [], levers: [] }, gaps: [{ title: 'Missed calls', text: 'x' }], build: [], whyNow: [] },
  quote: { items: [{ name: 'Growth OS' }], setup: 3000, deposit: 1500, balance: 1500, depositPct: 50, monthly: 299, seatsIncluded: 5, extraSeats: 0, prepay: { months: 12, free: 2, total: 2990, saves: 598 } },
  standard: { guarantee: 'Live in 14 days.' } };
const view = (over = {}) => ({ ok: true, proposal: { status: 'sent', body: BODY, expiresAt: new Date(Date.now() + 5 * 864e5).toISOString(), expired: false, ...over } });

console.log('\nthe token');
{
  const t = await boot('?t=' + TOK, () => ({ body: view() }));
  ok('a token in the query string is not read (it would land in server logs)', t.calls.length === 0 && /not valid/.test(t.txt()));
  t.root.unmount();
  const b = await boot('#t=short', () => ({ body: view() }));
  ok('a malformed token never reaches the server', b.calls.length === 0 && /Proposal unavailable/.test(b.txt()));
  b.root.unmount();
}

console.log('\nviewing and accepting');
{
  let accepted = null;
  const p = await boot('#t=' + TOK, b => b.action === 'accept' ? (accepted = b, { body: { ok: true, result: 'accepted', onboardingUrl: '' } }) : { body: view() });
  ok('it asks the server for the proposal with the fragment token', p.calls[0] && p.calls[0].u === '/api/proposal-public' && p.calls[0].b.t === TOK && p.calls[0].b.action === 'view');
  ok('the proposal renders with the CRM\'s numbers', /\$3,000/.test(p.txt()) && /\$1,500/.test(p.txt()) && /\$299/.test(p.txt()));
  ok('"good for 7 days" and Accept are at the bottom', /good for 7 days/.test(p.txt()) && !!document.querySelector('.pg-btn'));
  ok('the prepay choice is offered', /12 months up front/.test(p.txt()));
  /* the button stays disabled until every required box is ticked */
  ok('"Lock in my launch" is disabled until the box is ticked', document.querySelector('.pg-btn').disabled === true);
  await p.click(document.querySelector('.pg-btn'));
  ok('  clicking it then sends nothing', !accepted);
  await p.click(document.querySelector('.pg-agree input'));
  ok('ticked: the button is enabled', document.querySelector('.pg-btn').disabled === false);
  ok('no legal links on this proposal: no Terms box', !document.querySelector('.pg-legal'));
  await p.click(document.querySelector('.pg-btn'));
  ok('Accept with no name sends nothing', !accepted && /full name/.test(p.txt()));
  await p.type(document.querySelector('.pg-acc input[type=text]'), 'Dee Client');
  await p.click([...document.querySelectorAll('.pg-plan input')][1]);
  await p.click(document.querySelector('.pg-btn'));
  ok('Accept POSTs the name, the agreement and the plan', accepted && accepted.name === 'Dee Client' && accepted.agree === true && accepted.plan === 'annual' && accepted.t === TOK, JSON.stringify(accepted));
  /* the "You're in" screen (src/proposal/Celebrate.jsx), not a plain thank-you */
  ok('then it celebrates them by first name', /You're in, Dee\. Let's grow\./.test(p.txt()) && !!document.querySelector('.yi'));
  ok('  with their Launch Day ticket and what happens next', /Admit one/i.test(p.txt()) && /What happens next/i.test(p.txt()) && /Your kickoff call/.test(p.txt()));
  ok('  no onboarding link and no contacts on this proposal: "We\'ll send…"', /We'll send your deposit and onboarding links today\./.test(p.txt()) && !document.querySelector('.yi-go'));
  ok('  and it does not navigate away on its own', location.href.includes('#t='));
  ok('and the Accept button is gone', !document.querySelector('.pg-btn'));
  p.root.unmount();
}

console.log('\nexpired, and already accepted');
{
  const e = await boot('#t=' + TOK, () => ({ body: view({ expired: true }) }));
  ok('an expired proposal shows no Accept button', !document.querySelector('.pg-btn') && /expired/.test(e.txt()));
  e.root.unmount();
  const a = await boot('#t=' + TOK, () => ({ body: view({ status: 'accepted', acceptedName: 'Dee Client' }) }));
  ok('an accepted proposal says who accepted it, no button', !document.querySelector('.pg-btn') && /Accepted by Dee Client/.test(a.txt()));
  a.root.unmount();
  const n = await boot('#t=' + TOK, () => ({ status: 404, body: { ok: false, error: 'This proposal link is not valid. Ask us for a fresh one.' } }));
  ok('a link the server does not know shows the server\'s message', /not valid/.test(n.txt()));
  n.root.unmount();
}

console.log('\nTerms of Service and Privacy Policy: a second required box');
{
  const LEGAL = { termsUrl: 'https://agency.test/terms', privacyUrl: 'https://agency.test/privacy', version: '2026-10-04' };
  let posted = null;
  const p = await boot('#t=' + TOK, b => b.action === 'accept' ? (posted = b, { body: { ok: true, result: 'accepted', onboardingUrl: '' } }) : { body: view({ body: { ...BODY, legal: LEGAL } }) });
  const box = document.querySelector('.pg-legal input');
  ok('the proposal has legal links: a second box is shown, unticked', !!box && box.checked === false);
  ok('  worded exactly', /I have read and agree to the Terms of Service and Privacy Policy\./.test(document.querySelector('.pg-legal').textContent.replace(/\s+/g, ' ')));
  const links = [...document.querySelectorAll('.pg-legal a')];
  ok('  both names link to the documents, in a new tab', links.length === 2 && links[0].getAttribute('href') === LEGAL.termsUrl && links[1].getAttribute('href') === LEGAL.privacyUrl
    && links.every(a => a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || '')));
  ok('the original "I agree" box is still there, unchanged', /I agree to this proposal, its terms, and the 50% deposit of \$1,500 due at signing\./.test(p.txt()));
  await p.type(document.querySelector('.pg-acc input[type=text]'), 'Dee Client');
  ok('"Lock in my launch" disabled with neither box ticked', document.querySelector('.pg-btn').disabled);
  await p.click(document.querySelectorAll('.pg-agree input')[0]);
  ok('  still disabled with only the first ticked', document.querySelector('.pg-btn').disabled);
  await p.click(document.querySelectorAll('.pg-agree input')[0]); await p.click(box);
  ok('  still disabled with only the Terms box ticked', document.querySelector('.pg-btn').disabled);
  await p.click(document.querySelector('.pg-btn'));
  ok('  and clicking it sends nothing', !posted);
  await p.click(document.querySelectorAll('.pg-agree input')[0]);
  ok('both ticked: enabled', !document.querySelector('.pg-btn').disabled);
  await p.click(document.querySelector('.pg-btn'));
  ok('the acceptance carries agreeTerms: true (Postgres checks it again)', posted && posted.agreeTerms === true && posted.agree === true, JSON.stringify(posted));
  p.root.unmount();
  let plain = null;
  const q = await boot('#t=' + TOK, b => b.action === 'accept' ? (plain = b, { body: { ok: true, result: 'accepted' } }) : { body: view() });
  ok('no legal links: no Terms box', !document.querySelector('.pg-legal'));
  await q.type(document.querySelector('.pg-acc input[type=text]'), 'Dee Client');
  await q.click(document.querySelector('.pg-agree input')); await q.click(document.querySelector('.pg-btn'));
  ok('  and it accepts as before, agreeTerms false', plain && plain.agreeTerms === false);
  q.root.unmount();
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.unlinkSync('tests/.bppage.mjs'); } catch {}
process.exit(fail ? 1 : 0);
