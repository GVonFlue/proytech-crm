/* THE CLIENT PORTAL PAGE (B-1), mounted with a fake Supabase client.
   ============================================================================

     - the greeting follows the device clock, on the spec's exact hours
     - Home: "[Company] is in the [stage]", the five stages, Day X of 14 and
       the launch date from lib/lifecycle (the CRM's own functions), what is
       waiting on them, billing from their own proposal, the crew
     - a client never sees the words At Risk: it reads as Active
     - only Home and Documents exist (Review, Billing, Messages and Onboarding
       are later steps, and are not dead tabs)
     - the page asks Postgres for portal_touch / portal_home /
       portal_documents with NO arguments: it sends no id to aim with
     - Documents: the accepted proposal, the Terms version with its links,
       the onboarding answers with the EIN as the database masked it
     - signed out: the email form, which posts the email and nothing else
     - a login with no portal: "isn't connected", not a blank page
     - the bundle carries no CRM code                                       */
import fs from 'node:fs'; import path from 'node:path'; import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';
import { bundleName } from './tmpbundle.mjs';
const B = bundleName('ppage');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://crm.test/portal', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator', 'MutationObserver', 'localStorage', 'location'])
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__NO_MOUNT__ = true;

const out = await esbuild.build({ entryPoints: ['src/portal/main.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': '{"VITE_SUPABASE_URL":"https://x.supabase.co","VITE_SUPABASE_KEY":"anon"}' }, logLevel: 'silent', metafile: true });
fs.writeFileSync('tests/' + B, out.outputFiles[0].text);
const { Portal } = await import('./' + B + '?v=' + Date.now());
const { greetingFor, homeModel } = await import('../src/portal/view.js');
const React = (await import('react')).default; const { createRoot } = await import('react-dom/client'); const { act } = await import('react');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const txt = el => (el && el.textContent || '').replace(/\s+/g, ' ');
const tick = d => ({ done: d, due: null });
const HOME = {
  first_name: 'Jordan', company: 'Reed Realty Group', phase: 'build', phase_since: '2026-10-08', launched_at: null, converted_at: '2026-10-01',
  checklist: { deposit_paid: tick('2026-10-02'), intake_form: tick('2026-10-05'), access_dns: tick('2026-10-07'), access_gbp: tick('2026-10-06'), logo_received: tick('2026-10-05'), headshot_received: tick('2026-10-08'), kickoff_call: tick('2026-10-06'), onbSkip: [] },
  delivery: { suite: { 'Install set up': { done: '2026-10-09', due: null } } }, lifecycle: { pauses: [], items: {} },
  onboarding: { status: 'submitted', submitted_at: '2026-10-05T15:00:00Z', products: ['website', 'suite'], industry: 'realtor', answers: { 'web.domain_own': 'yes' } },
  proposal: { accepted_at: '2026-10-01T18:00:00Z', plan: 'monthly', launch_days: 14, contacts: [{ name: 'Logan Lee', phone: '(913) 237-4403', email: 'logan@agency.test', role: 'Your point of contact' }],
    quote: { items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package' }], packageName: null, setup: 3000, deposit: 1500, depositPct: 50, monthly: 299 } },
  config: { template: null, builder: 'Garrett', launch_days: 14, product_map: null, company_name: 'Agency' },
};
const DOCS = { proposals: [{ accepted_at: '2026-10-01T18:00:00Z', accepted_name: 'Jordan Reed', plan: 'monthly', terms_version: '2026-10-04', terms_url: 'https://agency.test/terms', privacy_url: 'https://agency.test/privacy',
  body: { client: { company: 'Reed Realty Group', name: 'Jordan' }, company: { name: 'Agency' }, preparedOn: '2026-09-30', validDays: 7, copy: { headline: 'Your 48-home year' }, quote: { items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package', setup: 3000, monthly: 299 }], setup: 3000, deposit: 1500, depositPct: 50, monthly: 299 } } }],
  onboarding: { status: 'submitted', submitted_at: '2026-10-05T15:00:00Z', products: ['website'], industry: 'realtor', answers: { 'biz.name': 'Reed Realty', 'tx.ein': '•••••6789' } } };

function fakeClient({ session = { access_token: 'x', user: { id: 'u' } }, home = HOME, docs = DOCS } = {}) {
  const c = { rpcs: [], signedOut: false };
  c.auth = { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => { c.signedOut = true; } };
  c.rpc = async (name, args) => { c.rpcs.push({ name, args }); return { data: name === 'portal_home' ? home : name === 'portal_documents' ? docs : null, error: null }; };
  return c;
}
async function mount(client, now = new Date('2026-10-09T09:15:00')) {
  const el = document.getElementById('root'); el.innerHTML = '';
  const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Portal, { client, now })); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return root;
}
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };

console.log('\nthe greeting, on the spec\'s hours');
{
  const at = h => greetingFor(h);
  ok('4:59 AM: burning the midnight oil', at(4) === 'Burning the midnight oil');
  ok('5:00 to 11:59: good morning', at(5) === 'Good morning' && at(11) === 'Good morning');
  ok('12:00 to 4:59 PM: good afternoon', at(12) === 'Good afternoon' && at(16) === 'Good afternoon');
  ok('5:00 to 9:59 PM: good evening', at(17) === 'Good evening' && at(21) === 'Good evening');
  ok('10 PM: burning the midnight oil', at(22) === 'Burning the midnight oil' && at(0) === 'Burning the midnight oil');
}

console.log('\nHome');
{
  const c = fakeClient(); const root = await mount(c);
  const t = txt(document.body);
  ok('"Good morning, Jordan." and "Reed Realty Group is in the build."', /Good morning, Jordan\./.test(t) && /Reed Realty Group is in the build\./.test(t), t.slice(0, 200));
  const stg = [...document.querySelectorAll('.stg')].map(e => e.className.replace('stg', '').trim() + ':' + txt(e.querySelector('b')));
  ok('five stages, Intake done, Build now', stg.length === 5 && stg[0].startsWith('done') && stg[1].startsWith('now'), stg.join(' | '));
  ok('Day 1 of 14 (the CRM\'s own clock: started Oct 8)', /1of 14 days/.test(txt(document.querySelector('.dring'))), txt(document.querySelector('.dring')));
  ok('the ticket: clock started Oct 8, launch by Oct 22', /Clock startedOct 8/.test(txt(document.querySelector('.ticket'))) && /By Oct 22/.test(txt(document.querySelector('.ticket'))));
  ok('the road to Launch Day lists done and next', document.querySelectorAll('.tl li.ok').length >= 3 && document.querySelectorAll('.tl li.nx').length === 1);
  ok('waiting on you: all clear', /All clear/.test(txt(document.querySelector('.need'))));
  ok('billing from their own proposal: $1,500 paid, $1,500 at launch, $299/mo', /✓ \$1,500 paid/.test(txt(document.querySelector('.bill'))) && /Balance, due at launch\$1,500/.test(txt(document.querySelector('.bill'))) && /\$299\/mo/.test(txt(document.querySelector('.bill'))));
  const crew = document.querySelector('.crew');
  ok('the crew, with tap-to-call, text and email', crew && crew.querySelector('a[href="tel:9132374403"]') && crew.querySelector('a[href="sms:9132374403"]') && crew.querySelector('a[href="mailto:logan@agency.test"]'));
  const tabs = [...document.querySelectorAll('.pt-tabs button')].map(b => txt(b));
  ok('only Home and Documents (no dead tabs for later steps)', tabs.join() === 'Home,Documents', tabs.join());
  ok('it asked for portal_touch and portal_home, with NO arguments', c.rpcs.map(r => r.name).sort().join() === 'portal_home,portal_touch' && c.rpcs.every(r => r.args === undefined), JSON.stringify(c.rpcs));
  await click([...document.querySelectorAll('.pt-tabs button')].find(b => /Documents/.test(b.textContent)));
  const d = txt(document.body);
  ok('Documents: the accepted proposal, read-only', /Your 48-home year/.test(d) && /Accepted by Jordan Reed/.test(d));
  const links = [...document.querySelectorAll('.terms a')];
  ok('  the Terms version, both links opening in a new tab', /version 2026-10-04/.test(d) && links.length === 2 && links.every(a => a.target === '_blank' && /noopener/.test(a.rel)));
  ok('  the onboarding answers, the EIN as the database masked it', /•••••6789/.test(d) && !/12-3456789/.test(d));
  ok('  portal_documents asked for with no arguments', c.rpcs.some(r => r.name === 'portal_documents' && r.args === undefined));
  root.unmount();
}

console.log('\nwhat a client never sees');
{
  const m = homeModel({ ...HOME, phase: 'atrisk' }, '2026-10-09');
  ok('At Risk reads as Active ("is live and growing")', m.stage === 'active' && m.stageLine === 'is live and growing');
  const c = fakeClient({ home: { ...HOME, phase: 'atrisk' } }); const root = await mount(c);
  ok('  and the words "at risk" are nowhere on the page', !/at risk/i.test(txt(document.body)));
  root.unmount();
  const i = homeModel({ ...HOME, phase: 'intake', phase_since: '2026-10-01', checklist: { deposit_paid: tick('2026-10-02'), onbSkip: [] }, onboarding: null }, '2026-10-03');
  ok('intake before the clock: what it waits for, in plain words', !i.clock.started && i.waiting.includes('onboarding') && i.waiting.includes('logo'), i.waiting.join());
}

console.log('\nsigned out, and a login with no portal');
{
  const c = fakeClient({ session: null }); const root = await mount(c);
  ok('signed out: the email form', !!document.querySelector('form.signin input[type=email]') && /Sign in with your email/.test(txt(document.body)));
  const posted = []; globalThis.fetch = async (u, o) => { posted.push({ u, b: JSON.parse(o.body) }); return { ok: true, json: async () => ({ ok: true, message: 'If that email has a client portal, we just sent it a sign-in link.' }) }; };
  const inp = document.querySelector('form.signin input');
  await act(async () => { const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set; set.call(inp, 'jordan@reed.test'); inp.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  await act(async () => { document.querySelector('form.signin').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  ok('  it posts the email, and only the email, to /api/portal-login', posted.length === 1 && posted[0].u === '/api/portal-login' && JSON.stringify(posted[0].b) === '{"email":"jordan@reed.test"}');
  ok('  and shows the same reply everyone gets', /If that email has a client portal/.test(txt(document.body)));
  ok('  no data was asked for while signed out', !c.rpcs.length);
  root.unmount();
  const n = fakeClient({ home: null }); const r2 = await mount(n);
  ok('a login with no portal: "isn\'t connected", with sign out', /isn't connected to a client portal/.test(txt(document.body)) && !!document.querySelector('.pt-me'));
  r2.unmount();
}

console.log('\nthe bundle');
{
  const inputs = Object.keys(out.metafile.inputs);
  ok('no CRM code in the portal: not App, not the CRM database client, not the CRM screens', !inputs.some(f => /src\/(App|ClientView|Proposals|Onboarding)\.jsx$|src\/lib\/supabase\.js$/.test(f)), inputs.filter(f => /src\/(App|lib\/supabase)/.test(f)).join());
  const src = fs.readFileSync('src/portal/main.jsx', 'utf8');
  ok('its sign-in session has its own storage key (never the CRM\'s)', /storageKey: 'portal-auth'/.test(src));
  ok('it never names a lead, proposal or email when reading', !/rpc\('portal_(home|documents|touch)',/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
