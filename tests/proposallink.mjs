/* per-process bundle names, deleted on exit: tests/tmpbundle.mjs */
import { bundleName } from './tmpbundle.mjs';
const B_pl = bundleName('pl');
const B_pl_entry_JSX = bundleName('pl-entry', '.jsx');
/* THE CLIENT LINK, AND THE DOMAIN IT LIVES ON.
   ============================================================================

   Was:  https://proytech-crm.vercel.app/proposal.html#t=<token>
   Now:  {PROPOSAL_URL or APP_URL}/p/<client-slug>#t=<token>

   - The slug is COSMETIC. The server never reads it; the 43-character token
     in the fragment is still the only key, so access rules are unchanged and
     a mangled slug opens the same proposal.
   - Old /proposal.html#t= links keep working: same page, same token.
   - ONE place builds the link (api/proposal-send.js). The CRM used to build
     its own from window.location, which could disagree with the emailed one;
     it now asks the server (mode 'peek', which changes nothing).
   - On proposals.getproytech.com, vercel.json serves ONLY the proposal page,
     its assets and /api/proposal-public; every other path goes to
     getproytech.com, so the CRM is never reachable there.                 */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.APP_URL = 'https://crm.test';
import fs from 'node:fs'; import path from 'node:path'; import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const { clientSlug, proposalUrl, TOKEN_RE } = await import('../src/lib/proposal.js');
const SEND = await import('../api/proposal-send.js');
const T = 'Ab3_-'.repeat(8) + 'xyz';   // 43 chars, the token alphabet

console.log('\nthe slug');
{
  const cases = [
    [{ company: 'Reed Realty Group' }, 'reed-realty-group'],
    [{ company: 'Café Olé & Sons, LLC' }, 'cafe-ole-and-sons-llc'],
    [{ company: "O'Brien's Plumbing" }, 'o-brien-s-plumbing'],
    [{ company: '  ACME   Roofing!!! ' }, 'acme-roofing'],
    [{ company: '🔥 Fire & Ice 🔥' }, 'fire-and-ice'],
    [{ company: 'Zoë Ångström Ünited' }, 'zoe-angstrom-united'],
    [{ company: '24/7 HVAC' }, '24-7-hvac'],
    [{ company: '', name: 'Jordan Reed' }, 'jordan-reed'],
    [{ company: '!!!' }, 'proposal'],
    [{}, 'proposal'],
    [null, 'proposal'],
  ];
  for (const [c, want] of cases) ok(`${JSON.stringify(c)} → ${want}`, clientSlug(c) === want, clientSlug(c));
  const long = clientSlug({ company: 'The Very Long Name Of A Family Owned Roofing And Gutter Company Serving Wichita And Surrounding Areas' });
  ok('a long name is cut at a word boundary, at most 60 characters, no trailing hyphen', long.length <= 60 && !/-$/.test(long) && 'the-very-long-name-of-a-family-owned-roofing-and-gutter-company-serving'.startsWith(long), `${long} (${long.length})`);
  const word = clientSlug({ company: 'x'.repeat(200) });
  ok('one enormous word is cut to 60', word === 'x'.repeat(60));
  ok('only lowercase letters, digits and single hyphens', ['Reed Realty Group', 'Café Olé & Sons, LLC', '🔥 Fire & Ice 🔥', 'a -- b'].every(n => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(clientSlug({ company: n }))));
}

console.log('\nthe link');
{
  const url = proposalUrl('https://proposals.getproytech.com/', { company: 'Reed Realty Group' }, T);
  ok('{base}/p/{slug}#t={token}', url === `https://proposals.getproytech.com/p/reed-realty-group#t=${T}`, url);
  ok('the token is the fragment, so it never reaches a server log', url.split('#')[0].indexOf(T) === -1 && TOKEN_RE.test(decodeURIComponent(url.split('#t=')[1])));
  ok('the server builds it the same way', SEND.proposalLink('https://a.test', T, { company: 'Reed Realty Group' }) === `https://a.test/p/reed-realty-group#t=${T}`);
  delete process.env.PROPOSAL_URL;
  ok('no PROPOSAL_URL: links stay on APP_URL', SEND.proposalBase() === 'https://crm.test');
  process.env.PROPOSAL_URL = 'https://proposals.getproytech.com/';
  ok('PROPOSAL_URL set: links use it (trailing slash trimmed)', SEND.proposalBase() === 'https://proposals.getproytech.com');
  for (const bad of ['http://proposals.getproytech.com', 'proposals.getproytech.com', 'https://proposals.getproytech.com/p', 'javascript:alert(1)', ' '])
    { process.env.PROPOSAL_URL = bad; ok(`a bad PROPOSAL_URL (${bad.trim() || 'blank'}) falls back to APP_URL, never emailed out`, SEND.proposalBase() === 'https://crm.test'); }
  process.env.PROPOSAL_URL = 'https://proposals.getproytech.com';
}

/* the route: link and peek, against a fake database */
let DB, patches;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const J = (d, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('/auth/v1/user')) return J({ id: 'u1', email: 'me@agency.test' });
  if (u.includes('/rpc/crm_whoami')) return J([{ role: 'owner', active: true }]);
  if (u.includes('api_hits')) return { ok: true, json: async () => [], text: async () => '[]' };
  if (u.includes('/rest/v1/proposals?id=eq.')) { if (method === 'PATCH') { patches.push(JSON.parse(opts.body)); Object.assign(DB, JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => null }; } return J([DB]); }
  return J({}, false);
};
const hit = async body => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = () => {}; r.end = () => r;
  await SEND.default({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9', authorization: 'Bearer good-owner' }, socket: {}, body }, r); return r.body || {}; };
const READY = { client: { name: 'Jordan Reed', company: 'Reed Realty Group' },
  quote: { packageId: 'growth-os', items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package' }] },
  copy: { plan: { goal: 'g', numbers: [1, 2, 3].map(i => ({ label: 'l' + i, value: 'v' })), levers: ['a', 'b', 'c'] }, gaps: [1, 2, 3].map(i => ({ title: 'g' + i })), build: [{ title: 'Site', item: 'growth-os' }] } };
const ID = '11111111-1111-4111-8111-111111111111';

console.log('\nproposal-send: the one place links are built');
{
  DB = { id: ID, lead_id: 'L1', token: T, status: 'draft', valid_days: 7, body: READY }; patches = [];
  let r = await hit({ id: ID, mode: 'link', reviewed: true });
  ok('publishing returns /p/<client-slug> on the proposals domain', r.ok && r.link === `https://proposals.getproytech.com/p/reed-realty-group#t=${T}`, JSON.stringify(r));
  const sentAt = DB.sent_at, exp = DB.expires_at; patches = [];
  r = await hit({ id: ID, mode: 'peek' });
  ok('peek returns the same link', r.ok && r.link === `https://proposals.getproytech.com/p/reed-realty-group#t=${T}`);
  ok('  and changes NOTHING: no re-publish, the validity window is untouched', patches.length === 0 && DB.sent_at === sentAt && DB.expires_at === exp && r.expiresAt === exp);
  DB = { id: ID, lead_id: 'L1', token: T, status: 'draft', valid_days: 7, body: READY }; patches = [];
  r = await hit({ id: ID, mode: 'peek' });
  ok('peek on a draft is refused (nothing is published to link to)', r.ok === false && patches.length === 0);
  const src = fs.readFileSync(path.join(ROOT, 'src/Proposals.jsx'), 'utf8');
  ok('the CRM never builds a client link itself', !/window\.location\.origin/.test(src) && !/proposal\.html#t=/.test(src) && /publish\(frozen && !isExpired\(pub\.expires_at\) \? 'peek' : 'link'\)/.test(src));
}

console.log('\nthe client page reads the token, whatever the path');
{
  const e = path.join(ROOT, 'tests/'+B_pl_entry_JSX);
  fs.writeFileSync(e, `export { tokenFromHash } from '../src/proposal/main.jsx';`);
  globalThis.__NO_MOUNT__ = true;
  const b = await esbuild.build({ entryPoints: [e], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.js': 'jsx' },
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'], logLevel: 'error' });
  const o = path.join(ROOT, 'tests/'+B_pl); fs.writeFileSync(o, b.outputFiles[0].text);
  const { tokenFromHash } = await import(o + '?' + Date.now()); fs.unlinkSync(e); fs.unlinkSync(o);
  for (const href of [`https://proposals.getproytech.com/p/reed-realty-group#t=${T}`, `https://proposals.getproytech.com/p/a-wrong-slug#t=${T}`, `https://proytech-crm.vercel.app/proposal.html#t=${T}`])
    ok(`token read from ${href.split('#')[0].replace(/^https:\/\//, '')}`, tokenFromHash(new URL(href).hash) === T);
  const main = fs.readFileSync(path.join(ROOT, 'src/proposal/main.jsx'), 'utf8');
  ok('the page reads only the fragment, never the path (the slug opens nothing)', !/location\.pathname/.test(main));
  const pub = fs.readFileSync(path.join(ROOT, 'api/proposal-public.js'), 'utf8');
  ok('and the public API takes only the token: there is no slug to check', !/slug/i.test(pub.replace(/\/\/.*$/gm, '')));
  ok('old links: proposal.html is still built', /proposal: resolve\(__dirname, 'proposal\.html'\)/.test(fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')) && fs.existsSync(path.join(ROOT, 'proposal.html')));
}

console.log('\nvercel.json: /p/<slug>, /onboarding/<slug>, and the proposals domain locked to the client pages');
{
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  ok('/p/:slug is served by proposal.html', (v.rewrites || []).some(r => r.source === '/p/:slug' && r.destination === '/proposal.html'));
  ok('/onboarding/:slug is served by onboarding.html', (v.rewrites || []).some(r => r.source === '/onboarding/:slug' && r.destination === '/onboarding.html'));
  ok('the crons are untouched', JSON.stringify(v.crons) === JSON.stringify([{ path: '/api/content-slate', schedule: '0 1 * * 1' }]));
  const rd = (v.redirects || []).find(r => (r.has || []).some(h => h.type === 'host' && h.value === 'proposals.getproytech.com'));
  ok('a redirect applies ONLY on proposals.getproytech.com', !!rd && rd.has.length === 1, JSON.stringify(v.redirects));
  ok('  to https://getproytech.com, temporarily (302/307, so it can change later)', rd && rd.destination === 'https://getproytech.com' && rd.permanent === false);
  ok('  and it is the only redirect (the CRM domain is untouched)', (v.redirects || []).length === 1);
  /* Vercel compiles `source` with path-to-regexp v6; this source is written so
     the same string is a plain RegExp too — checked against path-to-regexp
     6.3.0 when written (every path below agreed). */
  const re = new RegExp('^' + rd.source + '$');
  const serve = [`/p/reed-realty-group`, '/p/x', '/proposal.html', '/assets/proposal-Ab12.js', '/assets/main-Xy.js',
    '/api/proposal-public', '/proytech-logo-dark.png', '/proytech-nucleus.png', '/favicon-32.png', '/logo.svg', '/mark.webp',
    /* the onboarding portal shares the client domain (the proposal's "Start
       my onboarding" button lands here), and its build-crew photos */
    '/onboarding/reed-realty-group', '/onboarding.html', '/api/onboarding-public', '/team/garrett.jpg'];
  const away = ['/', '/index.html', '/p', '/p/', '/p/a/b', '/proposal.htmlx', '/api/proposal-send', '/api/proposal-draft', '/api/jarvis',
    '/api/notify', '/api/proposal-publicx', '/settings', '/leads', '/img/x.png', '/manifest.json', '/.env', '/api/coffee-race',
    '/onboarding', '/onboarding/', '/onboarding/a/b', '/api/onboarding-admin', '/api/onboarding-publicx', '/team/', '/team/x.html', '/team/a/b.jpg'];
  for (const p of serve) ok(`served on proposals.: ${p}`, !re.test(p));
  for (const p of away) ok(`redirected to getproytech.com: ${p}`, re.test(p));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
