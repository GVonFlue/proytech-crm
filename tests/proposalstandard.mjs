/* THE PROPOSAL STANDARD: one rule, enforced where it counts.
   ============================================================================

   Before a proposal can be sent (as an email or as a link) it must have:
     a package selected · their goal · at least 3 of their numbers ·
     exactly 3 levers · 3 to 5 gaps · every build item tied to something
     they are buying · a valid email on the lead (email only) · and the
     owner's tick that they read every section.

   ONE function, readiness() in lib/proposal.js. The review screen calls it to
   show the checklist and disable Send (tests/proposalui.mjs); api/proposal-
   send.js calls it to REFUSE. This file proves both halves of the rule:
   every rule on its own, and the SERVER refusing a proposal that fails any
   one of them — before it publishes anything, so a refusal leaves a draft
   with no validity clock started and no email sent.                       */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';

const { readiness, READY_RULES, cleanCopy, isEmail } = await import('../src/lib/proposal.js');
const send = (await import('../api/proposal-send.js')).default;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const clone = v => JSON.parse(JSON.stringify(v));

/* a proposal that meets the standard */
const READY = {
  quote: { packageId: 'growth-os', items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package', setup: 3000, monthly: 299 }, { id: 'automations', name: 'Automations', kind: 'addon', setup: 1499, monthly: 249 }], setup: 4499, monthly: 548, deposit: 2249.5 },
  copy: {
    plan: { goal: 'Close 48 homes in 2027', numbers: [{ label: 'Homes closed', value: '31' }, { label: 'Commission', value: '$8,400' }, { label: 'Leads a month', value: '40' }], levers: ['Answer fast', 'Follow up for 90 days', 'Track the numbers'] },
    gaps: [{ title: 'Leads wait', text: 'x' }, { title: 'Follow up stops', text: 'x' }, { title: 'Numbers in five places', text: 'x' }],
    build: [{ title: 'A custom website', tag: 'new', text: 'x', item: 'growth-os' }, { title: 'Automations', tag: 'new', text: 'x', item: 'automations' }],
  },
};
const R = (body, o = {}) => readiness(body, { mode: 'email', leadEmail: 'client@client.test', reviewed: true, ...o });
const failing = r => r.checks.filter(c => !c.ok).map(c => c.key);
/* one broken copy per rule */
const BREAK = {
  package: b => { b.quote.packageId = ''; },
  goal: b => { b.copy.plan.goal = '   '; },
  numbers: b => { b.copy.plan.numbers = b.copy.plan.numbers.slice(0, 2); },
  levers: b => { b.copy.plan.levers = b.copy.plan.levers.slice(0, 2); },
  gaps: b => { b.copy.gaps = b.copy.gaps.slice(0, 2); },
  build: b => { b.copy.build[0].item = ''; },
};
/* the same rule from the other side: nothing to build at all (server too) */
const BREAK_EMPTY_BUILD = b => { b.copy.build = []; };

console.log('\nreadiness(): every rule');
{
  const r = R(READY);
  ok('a complete proposal is ready', r.ok && r.missing.length === 0, failing(r));
  ok('the rules are the eight named', READY_RULES.join() === 'package,goal,numbers,levers,gaps,build,email,reviewed');
  ok('every check has a label a person can read', r.checks.every(c => c.label && c.label.length > 8));
  for (const [key, brk] of Object.entries(BREAK)) {
    const b = clone(READY); brk(b); const x = R(b);
    ok(`fails ${key}, and ONLY ${key}`, !x.ok && failing(x).join() === key, failing(x));
  }
  ok('package: an add-on alone is not a package', !R({ ...clone(READY), quote: { ...READY.quote, packageId: 'automations' } }).ok);
  ok('package: no quote at all fails', failing(R({ copy: READY.copy })).includes('package'));
  ok('numbers: 3 counts, a blank one does not', R(READY).ok && !R({ ...clone(READY), copy: { ...READY.copy, plan: { ...READY.copy.plan, numbers: [...READY.copy.plan.numbers.slice(0, 2), { label: 'x', value: '' }] } } }).ok);
  ok('numbers: more than 3 is fine', R({ ...clone(READY), copy: { ...READY.copy, plan: { ...READY.copy.plan, numbers: [...READY.copy.plan.numbers, { label: 'Close', value: '1 in 5' }] } } }).ok);
  ok('levers: 4 is not exactly 3', failing(R({ ...clone(READY), copy: { ...READY.copy, plan: { ...READY.copy.plan, levers: [...READY.copy.plan.levers, 'Four'] } } })).join() === 'levers');
  const gapsOf = n => ({ ...clone(READY), copy: { ...READY.copy, gaps: Array.from({ length: n }, (_, i) => ({ title: 'Gap ' + i, text: 'x' })) } });
  ok('gaps: 3, 4 and 5 pass', [3, 4, 5].every(n => R(gapsOf(n)).ok));
  ok('gaps: 2 and 6 fail', [2, 6].every(n => failing(R(gapsOf(n))).join() === 'gaps'));
  ok('build: an item linked to something NOT bought fails', failing(R({ ...clone(READY), copy: { ...READY.copy, build: [{ title: 'SEO', item: 'seo' }] } })).join() === 'build');
  {
    const none = R({ ...clone(READY), copy: { ...READY.copy, build: [] } });
    ok('build: NO build items fails ("Add at least one build item")', failing(none).join() === 'build' && none.checks.find(c => c.key === 'build').detail === 'Add at least one build item', JSON.stringify(none.checks.find(c => c.key === 'build')));
    ok('build: a missing build list fails the same way', failing(R({ ...clone(READY), copy: { ...READY.copy, build: undefined } })).join() === 'build');
    ok('build: an entry with no title does not count as one', failing(R({ ...clone(READY), copy: { ...READY.copy, build: [{ title: '  ', item: 'growth-os' }] } })).includes('build'));
    ok('build: one linked item is enough', R({ ...clone(READY), copy: { ...READY.copy, build: [READY.copy.build[0]] } }).ok);
  }
  ok('build: the failing item is named', /Not linked: A custom website/.test(R((() => { const b = clone(READY); b.copy.build[0].item = ''; return b; })()).checks.find(c => c.key === 'build').detail));
  ok('email: applies to email only', R(READY, { leadEmail: '' }).ok === false && R(READY, { mode: 'link', leadEmail: '' }).ok === true);
  ok('email: an invalid address fails', failing(R(READY, { leadEmail: 'not an email' })).join() === 'email');
  ok('email: the same rule the mailer uses', isEmail('a@b.co') && !isEmail('a@b') && !isEmail('a b@c.co'));
  ok('reviewed: must be exactly true, not truthy', failing(R(READY, { reviewed: 'yes' })).join() === 'reviewed' && failing(R(READY, { reviewed: undefined })).join() === 'reviewed');
  ok('no body at all is not ready, and does not throw', !readiness(null, { reviewed: true }).ok && !readiness(undefined).ok);
}

console.log('\ncleanCopy links each build item to what was bought');
{
  const bought = [{ id: 'growth-os', name: 'Growth OS' }, { id: 'automations', name: 'Automations' }];
  const { copy } = cleanCopy({ build: [
    { title: 'A custom website', item: 'growth-os' },          // the model gave the id
    { title: 'Automations' },                                   // title is an item's name
    { title: 'SEO package', item: 'seo' },                      // not bought: dropped, left unlinked
  ] }, bought);
  ok('an id that was bought is kept', copy.build[0].item === 'growth-os');
  ok('a title that IS an item name is linked to it', copy.build[1].item === 'automations');
  ok('an id that was NOT bought is dropped, so readiness flags it', copy.build[2].item === '');
}

/* ---- the server: same rules, refused before anything is published ---- */
let DB, sent, patches;
const reset = (body, leadEmail = 'client@client.test') => {
  DB = { id: '22222222-2222-4222-8222-222222222222', lead_id: 'L1', token: 'T'.repeat(43), status: 'draft', valid_days: 7, body };
  globalThis.__LEAD_EMAIL__ = leadEmail; sent = []; patches = [];
};
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || 'GET').toUpperCase();
  const J = (d, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('/auth/v1/user')) return J({ id: 'u1', email: 'me@agency.test' });
  if (u.includes('/rpc/crm_whoami')) return J([{ role: 'owner', active: true }]);
  if (u.includes('api_hits')) return { ok: true, json: async () => [], text: async () => '[]' };
  if (u.includes('api.resend.com')) { sent.push(JSON.parse(opts.body)); return J({ id: 'm1' }); }
  if (u.includes('/rest/v1/proposals?id=eq.')) {
    if (method === 'PATCH') { patches.push(JSON.parse(opts.body)); Object.assign(DB, JSON.parse(opts.body)); return { ok: true, status: 204, json: async () => null }; }
    return J(u.includes('select=lead_id') && !u.includes('token') ? [{ lead_id: DB.lead_id }] : [DB]);
  }
  if (u.includes('/rest/v1/leads?id=eq.')) return J([{ data: { id: 'L1', email: globalThis.__LEAD_EMAIL__ } }]);
  return J({}, false);
};
const mkRes = () => { const r = { code: 0, body: null }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; r.setHeader = () => {}; r.end = () => r; return r; };
const hit = async body => { const res = mkRes(); await send({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9', authorization: 'Bearer good-owner' }, socket: {}, body }, res); return res.body || {}; };
const EMAIL = { mode: 'email', subject: 'Your proposal', message: 'Thanks for the time today. Here it is.' };

console.log('\nproposal-send refuses a proposal that fails ANY rule');
{
  reset(clone(READY));
  let r = await hit({ id: DB.id, reviewed: true, ...EMAIL });
  ok('a ready proposal sends', r.ok === true && sent.length === 1 && DB.status === 'sent', JSON.stringify(r));
  for (const [key, brk] of Object.entries(BREAK)) {
    for (const mode of ['email', 'link']) {
      const b = clone(READY); brk(b); reset(b);
      r = await hit({ id: DB.id, reviewed: true, ...(mode === 'email' ? EMAIL : { mode: 'link' }) });
      ok(`${key} (${mode}): refused, nothing published, nothing sent`,
        r.ok === false && r.notReady === true && (r.missing || []).includes(key) && patches.length === 0 && sent.length === 0 && DB.status === 'draft' && !DB.expires_at,
        JSON.stringify({ r, patches: patches.length, sent: sent.length }));
    }
  }
  for (const mode of ['email', 'link']) {
    const b = clone(READY); BREAK_EMPTY_BUILD(b); reset(b);
    r = await hit({ id: DB.id, reviewed: true, ...(mode === 'email' ? EMAIL : { mode: 'link' }) });
    ok(`no build items (${mode}): refused, nothing published, nothing sent`,
      r.ok === false && (r.missing || []).includes('build') && /Add at least one build item/.test(r.error) && patches.length === 0 && sent.length === 0, JSON.stringify(r));
  }
  reset(clone(READY));
  r = await hit({ id: DB.id, ...EMAIL });
  ok('not reviewed: refused, nothing published', r.ok === false && (r.missing || []).includes('reviewed') && patches.length === 0 && sent.length === 0);
  reset(clone(READY));
  r = await hit({ id: DB.id, reviewed: 'true', ...EMAIL });
  ok('"reviewed" must be the boolean true, not a string', r.ok === false && (r.missing || []).includes('reviewed'));
  reset(clone(READY), 'not-an-email');
  r = await hit({ id: DB.id, reviewed: true, ...EMAIL });
  ok('a lead with no valid email: refused for email', r.ok === false && /no valid email/.test(r.error) && patches.length === 0 && sent.length === 0);
  reset(clone(READY), 'not-an-email');
  r = await hit({ id: DB.id, reviewed: true, mode: 'link' });
  ok('  but a link needs no email', r.ok === true && !!r.link);
  reset((() => { const b = clone(READY); b.copy.gaps = []; b.copy.plan.levers = []; return b; })());
  r = await hit({ id: DB.id, reviewed: true, ...EMAIL });
  ok('the refusal names every failing rule, in words', r.ok === false && /3 to 5 gaps/.test(r.error) && /exactly 3 levers/.test(r.error), r.error);
  /* the server checks the STORED body, not what the browser says */
  reset((() => { const b = clone(READY); b.copy.plan.goal = ''; return b; })());
  r = await hit({ id: DB.id, reviewed: true, ...EMAIL, body: READY, copy: READY.copy, ready: true });
  ok('a request cannot vouch for itself: the stored body is what is checked', r.ok === false && (r.missing || []).includes('goal') && patches.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
