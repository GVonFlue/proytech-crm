/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_onbpage = bundleName('onbpage');
/* THE CLIENT'S ONBOARDING PAGE: what it shows, what it saves, and what it
   never ships.

   Renders src/onboarding/main.jsx in a simulated browser with the server and
   the upload stubbed. Asserts on what the page SENDS (the save bodies, the
   upload calls), not only on what it shows:

     - the token is read from the # fragment only; a bad one never reaches the
       server
     - the dashboard: welcome, progress, ticket, sections, still needed, crew
     - autosave is DEBOUNCED (no request per keystroke) and every section
       change flushes immediately, carrying the section mark
     - a value the server refuses is shown ON THAT FIELD
     - "Email me a link" posts resume-mail and nothing else (no address)
     - uploads: sign, PUT to the signed URL as FormData, then upload-done;
       the thumbnail is the local file
     - review blocks submit while a required answer is empty; submit saves
       first, then submits, then shows the launch ticket
     - every input on every section has an accessible name
     - the bundle has no database client and none of the CRM
     - the palette: the CTA fill passes AA with white; the mockup's orange
       does not, which is why it carries no text

   Seen red: a save per keystroke (no debounce); reading the token from the
   query string; an unlabelled tag input; importing lib/lead (pulled the CRM
   into the bundle). */
import fs from 'fs';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';
import { ratio, parseColor } from './contrast.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : '')); } };

const built = await esbuild.build({ entryPoints: ['src/onboarding/main.jsx'], bundle: true, write: false, format: 'esm', jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx' }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'], logLevel: 'silent' });
const code = built.outputFiles[0].text;
ok('the portal bundle has no database client', !/supabase|createClient/.test(code));
ok('  and none of the CRM', !/LeadView|ServiceAssign|dealRows|owedBy|ProposalDoc/.test(code));
ok('  and none of the prompt builder (that runs on the server)', !/Website build:|complianceLines/.test(code));
fs.writeFileSync('tests/'+B_onbpage, code);

const TOK = 'Ab_-'.repeat(10) + 'xyz';
const VIEW = (over = {}) => ({
  status: 'in_progress', industry: null, lenderKind: null, products: ['website', 'suite'], packageName: 'Growth OS',
  answers: { 'biz.industry': 'realtor', 'biz.contact_name': 'Jordan Reed', 'biz.email': 'jordan@reed.test', 'biz.phone': '316-555-0100', 'biz.name': 'Reed Realty Group' },
  sections: {}, submittedAt: null, lastActivityAt: null, files: [],
  checklist: { depositAt: '2026-10-04', depositSkipped: false, access: {} },
  contacts: [{ name: 'Garrett', role: 'Strategy & your build', photo: '/team/garrett.jpg', phone: '901-335-3905' }, { name: 'Logan', role: 'Onboarding & support', photo: '' }],
  launchDays: 14, agency: { name: 'Agency', email: 'hi@agency.test', logo: '/logo.png', mark: '/mark.png' },
  config: { state: 'KS', productNames: { website: 'Website', suite: 'Business Suite', automations: 'Automations' }, pipelines: { realtor: ['New lead', 'Closed'] }, tiles: { all: ['Revenue vs goal'], realtor: ['Closings this year'] }, kickoffUrl: '', seatsIncluded: 5, agency: 'Agency', agencyEmail: 'hi@agency.test' },
  launch: { started: false, waiting: ['your onboarding'], startedOn: null, target: null }, productLine: 'Growth OS', ...over,
});

const boot = async (hash, server) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://proposals.agency.test/onboarding/reed-realty-group' + hash, pretendToBeVisual: true });
  for (const k of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'navigator', 'location', 'FormData', 'File', 'Blob'])
    try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__NO_MOUNT__ = true;
  globalThis.URL.createObjectURL = () => 'blob:local-preview';
  dom.window.scrollTo = () => {};
  const calls = [], puts = [];
  globalThis.fetch = async (u, o = {}) => { const b = JSON.parse(o.body || '{}'); calls.push({ u: String(u), b, keepalive: !!o.keepalive }); const r = server(b, calls); return { status: r.status || 200, json: async () => r.body }; };
  globalThis.XMLHttpRequest = class { constructor() { this.upload = {}; } open(m, u) { this.m = m; this.u = u; } setRequestHeader() {}
    send(body) { puts.push({ m: this.m, u: this.u, body }); setTimeout(() => { this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1 }); this.status = 200; this.onload(); }, 5); } };
  const { Portal } = await import('./'+B_onbpage+'?v=' + Math.random());
  const React = (await import('react')).default; const { createRoot } = await import('react-dom/client'); const { act } = await import('react');
  const root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Portal)); });
  const wait = ms => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  await wait(60);
  const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); await wait(30); };
  const type = async (el, v) => { await act(async () => { const proto = el.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };
  const btn = re => [...document.querySelectorAll('button')].find(b => re.test(b.textContent));
  return { dom, calls, puts, root, click, type, wait, btn, txt: () => document.body.textContent.replace(/\s+/g, ' '), saves: () => calls.filter(c => c.b.action === 'save') };
};
const okServer = (over = {}) => (b) => {
  if (b.action === 'load') return { body: { ok: true, onboarding: VIEW(over) } };
  if (b.action === 'save') return { body: { ok: true, savedAt: new Date().toISOString() } };
  return { body: { ok: true } };
};

console.log('\nthe token');
{
  const q = await boot('?t=' + TOK, okServer());
  ok('a token in the query string is not read', q.calls.length === 0 && /not valid/.test(q.txt()));
  q.root.unmount();
  const m = await boot('#t=short', okServer());
  ok('a malformed token never reaches the server', m.calls.length === 0 && /Onboarding unavailable/.test(m.txt()));
  m.root.unmount();
}

console.log('\nthe dashboard');
{
  const t = await boot('#t=' + TOK, okServer());
  const x = t.txt();
  ok('loads with the token from the fragment', t.calls[0] && t.calls[0].b.t === TOK && t.calls[0].b.action === 'load');
  ok('welcome: the agency, their first name, their business', /Welcome to Agency, Jordan\./.test(x) && /Let's build Reed Realty Group's system\./.test(x), x.slice(0, 300));
  ok('progress: 0 of 8 sections (Growth OS realtor)', /0 of 8 sections done/.test(x));
  ok('the CTA starts with the first section', !!t.btn(/Start: Your business/));
  ok('the ticket: business, product line, deposit paid, ~14 days', /ADMIT ONE · LAUNCH DAY/.test(x) && /Growth OS/.test(x) && /Paid ✓/.test(x) && /~14 days/.test(x));
  ok('sections listed by industry: Realtor details', /Realtor details/.test(x) && /Your website/.test(x) && /Your Business Suite/.test(x) && !/Texting setup/.test(x));
  ok('still needed: deposit ticked with its date, the logo and goals open', /Paid Oct 4/.test(x) && /Your logo/.test(x) && /Your 3 goals/.test(x));
  ok('build crew from the offer, with a photo and an initial fallback', /Garrett/.test(x) && /Strategy & your build/.test(x) && document.querySelector('.ob-mem img[src="/team/garrett.jpg"]') && document.querySelector('.ob-mem .ini'));
  ok('help line: text the first contact with a phone', /Text us at 901-335-3905/.test(x) && document.querySelector('a[href="sms:9013353905"]'));
  t.root.unmount();
}

console.log('\nautosave');
{
  const t = await boot('#t=' + TOK, okServer());
  await t.click(t.btn(/Start: Your business/));
  ok('section 1 of 8 opens', /Section 1 of 8 · Your business/.test(t.txt()));
  const role = document.getElementById('f-biz-role');
  await t.type(role, 'O'); await t.type(role, 'Ow'); await t.type(role, 'Own'); await t.type(role, 'Owner');
  await t.wait(200);
  ok('no save while typing (debounced)', t.saves().length === 0, t.saves().length);
  await t.wait(1300);
  ok('one save after the pause, carrying the value', t.saves().length === 1 && t.saves()[0].b.answers['biz.role'] === 'Owner', JSON.stringify(t.saves().map(s => s.b.answers['biz.role'])));
  ok('  with the token, and no address field of any kind', t.saves()[0].b.t === TOK && !('to' in t.saves()[0].b) && !('email' in t.saves()[0].b));
  ok('the pill says saved', /Saved/.test(document.querySelector('.ob-save').textContent));
  await t.type(document.getElementById('f-biz-year'), '2014');
  await t.click(t.btn(/Save & continue/));
  await t.wait(30);
  const last = t.saves().at(-1);
  ok('Save & continue saves immediately, marking the section done', t.saves().length === 2 && last.b.answers['biz.year'] === '2014' && last.b.sections.biz && last.b.sections.biz.done === true, JSON.stringify(last && last.b.sections));
  ok('  and moves to section 2', /Section 2 of 8 · Online presence/.test(t.txt()));
  t.root.unmount();
}

console.log('\na refused value is shown on its field');
{
  const t = await boot('#t=' + TOK, (b) => {
    if (b.action === 'load') return { body: { ok: true, onboarding: VIEW() } };
    if (b.action === 'save') return { status: 400, body: { ok: false, field: 'biz.role', error: '"Your role" looks like a Social Security number. We never need one. Please remove it.' } };
    return { body: { ok: true } };
  });
  await t.click(t.btn(/Start: Your business/));
  await t.type(document.getElementById('f-biz-role'), '123-45-6789');
  await t.wait(1400);
  const alert = document.getElementById('f-biz-role').closest('.ob-q').querySelector('[role=alert]');
  ok('the message sits on that field', alert && /Social Security/.test(alert.textContent));
  ok('  the field is marked invalid, and the pill says not saved', document.getElementById('f-biz-role').getAttribute('aria-invalid') === 'true' && /Not saved/.test(document.querySelector('.ob-save').textContent));
  t.root.unmount();
}

console.log('\nsave and finish later');
{
  const t = await boot('#t=' + TOK, okServer());
  await t.click(t.btn(/Start: Your business/));
  await t.click(t.btn(/Email me a link to finish later/));
  await t.wait(30);
  const rm = t.calls.filter(c => c.b.action === 'resume-mail');
  ok('posts resume-mail once, with only the token', rm.length === 1 && JSON.stringify(Object.keys(rm[0].b).sort()) === '["action","t"]', JSON.stringify(rm));
  ok('  and says so', /Link sent/.test(t.txt()));
  t.root.unmount();
}

console.log('\nuploads');
{
  const PATH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/logos/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
  const t = await boot('#t=' + TOK, (b) => {
    if (b.action === 'load') return { body: { ok: true, onboarding: VIEW() } };
    if (b.action === 'upload-sign') return { body: { ok: true, uploadUrl: 'https://x.supabase.co/storage/v1/object/upload/sign/onboarding/' + PATH + '?token=abc', path: PATH, mime: 'image/png' } };
    if (b.action === 'upload-done') return { body: { ok: true, files: [{ id: 'f1', slot: 'logos', name: 'reed-logo.png', mime: 'image/png', bytes: 2048 }] } };
    return { body: { ok: true } };
  });
  await t.click([...document.querySelectorAll('.ob-sec')].find(b => /Brand & design/.test(b.textContent)));
  const input = document.getElementById('f-brand-logo');
  ok('the logo drop zone is a labelled file input', input && input.type === 'file' && document.querySelector('label[for="f-brand-logo"]'));
  const file = new File([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], 'reed-logo.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await (await import('react')).act(async () => { input.dispatchEvent(new t.dom.window.Event('change', { bubbles: true })); });
  await t.wait(120);
  const sign = t.calls.find(c => c.b.action === 'upload-sign');
  ok('asks the server to sign: slot, name, size; never a path of its own', sign && sign.b.slot === 'logos' && sign.b.name === 'reed-logo.png' && sign.b.bytes === 4 && !('path' in sign.b), JSON.stringify(sign && sign.b));
  ok('PUTs the file to the signed URL as FormData', t.puts.length === 1 && t.puts[0].m === 'PUT' && /token=abc/.test(t.puts[0].u) && t.puts[0].body instanceof t.dom.window.FormData);
  const done = t.calls.find(c => c.b.action === 'upload-done');
  ok('then reports the path back for checking', done && done.b.path === PATH);
  ok('the thumbnail is the local file', document.querySelector('.ob-thumb img[src="blob:local-preview"]'));
  await t.click(document.querySelector('.ob-top .brand'));
  ok('back on the dashboard, still needed shows the logo ticked', [...document.querySelectorAll('.ob-need li.ok')].some(li => /Your logo/.test(li.textContent)), document.querySelector('.ob-need') && document.querySelector('.ob-need').textContent);
  t.root.unmount();
}

console.log('\nreview and submit');
{
  const full = { 're.license': 'SP1', 're.brokerage': 'Prairie', 're.broker_name': 'Pat', 're.broker_email': 'p@p.test' };
  const t = await boot('#t=' + TOK, okServer());
  await t.click([...document.querySelectorAll('.ob-sec')].find(b => /Review & submit/.test(b.textContent)));
  ok('missing required answers are listed and submit is disabled', /Needed before you can submit/.test(t.txt()) && t.btn(/Submit and start my launch/).disabled);
  t.root.unmount();

  let submitted = false;
  const s = await boot('#t=' + TOK, (b, calls) => {
    if (b.action === 'load') return { body: { ok: true, onboarding: VIEW({ answers: { ...VIEW().answers, ...full, 'suite.goals': [{ label: 'Closings', target: '24' }, { label: 'GCI', target: '400k' }, { label: 'Leads', target: '40' }] } }) } };
    if (b.action === 'save') return { body: { ok: true } };
    if (b.action === 'submit') { submitted = true; return { body: { ok: true, result: 'submitted', onboarding: VIEW({ status: 'submitted', submittedAt: '2026-10-05T12:00:00Z', launch: { started: false, waiting: ['domain access'], startedOn: null, target: null } }) } }; }
    return { body: { ok: true } };
  });
  await s.click([...document.querySelectorAll('.ob-sec')].find(b => /Review & submit/.test(b.textContent)));
  ok('complete: submit is enabled, the summary shows their answers', !s.btn(/Submit and start my launch/).disabled && /Prairie/.test(s.txt()));
  await s.click(s.btn(/Submit and start my launch/));
  await s.wait(60);
  const order = s.calls.map(c => c.b.action);
  ok('it saves first, then submits', order.lastIndexOf('save') >= 0 && order.lastIndexOf('save') < order.indexOf('submit'), order.join(','));
  ok('the launch ticket: what the clock waits for, in plain words', submitted && /You did it, Jordan\./.test(s.txt()) && /as soon as domain access/.test(s.txt()), s.txt().slice(0, 400));
  s.root.unmount();
}

console.log('\nevery input on every section has a name');
{
  const t = await boot('#t=' + TOK, okServer({ products: ['website', 'suite', 'automations'], answers: { ...VIEW().answers, 'web.domain_own': 'yes', 'web.gbp_status': 'have', 'web.facebook': 'fb.com/x', 'web.analytics': 'yes', 're.solo': 'team', 're.listings': 'yes', 'biz.approver_name': 'Al' } }));
  const bad = [];
  for (const title of ['Your business', 'Online presence', 'Realtor details', 'Brand & design', 'Your website', 'Your Business Suite', 'Texting setup', 'Access', 'Photos & files']) {
    const home = document.querySelector('.ob-top .brand'); await t.click(home);
    const card = [...document.querySelectorAll('.ob-sec')].find(b => b.textContent.includes(title));
    if (!card) { bad.push('no card: ' + title); continue; }
    await t.click(card);
    for (const el of document.querySelectorAll('.ob-form input, .ob-form select, .ob-form textarea')) {
      const named = el.getAttribute('aria-label') || el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.placeholder;
      if (!named) bad.push(`${title}: ${el.outerHTML.slice(0, 90)}`);
    }
  }
  ok('no unnamed input anywhere', bad.length === 0, bad.join(' | '));
  t.root.unmount();
}

console.log('\nthe palette');
{
  const { THEME, PORTAL_CSS } = await import('../src/onboarding/theme.js');
  const r = (a, b) => ratio(parseColor(a).rgb, parseColor(b).rgb);
  ok(`CTA fill with white text passes AA 4.5 (${r(THEME.cta, '#ffffff').toFixed(2)})`, r(THEME.cta, '#ffffff') >= 4.5);
  ok(`body ink on the page background (${r(THEME.ink, THEME.bg2).toFixed(2)})`, r(THEME.ink, THEME.bg2) >= 4.5);
  ok(`muted text on white (${r(THEME.mute, '#ffffff').toFixed(2)})`, r(THEME.mute, '#ffffff') >= 4.5);
  ok(`the mockup orange would FAIL with white text (${r(THEME.hot, '#ffffff').toFixed(2)}), so it carries none`, r(THEME.hot, '#ffffff') < 3 && !/background:var\(--o-hot\);color:#fff/.test(PORTAL_CSS));
  const mobile = PORTAL_CSS.slice(PORTAL_CSS.indexOf('@media (max-width:700px)'));
  ok('mobile: under 700px the business name hides and the top bar tightens (it wrapped in the mockup)', mobile.includes('.ob-biz,.ob-save .long{display:none}') && mobile.includes('.ob-top{padding:10px 14px'));
  ok('a visible focus ring on everything', /\.ob :focus-visible\{outline:3px solid/.test(PORTAL_CSS));
  ok('no hex outside theme.js in the portal screens', ['Screens.jsx', 'Section.jsx', 'Fields.jsx', 'main.jsx'].every(f => !/#[0-9a-fA-F]{6}\b/.test(fs.readFileSync('src/onboarding/' + f, 'utf8'))));
}

fs.unlinkSync('tests/'+B_onbpage);
console.log(`\nonboardingpage: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
