/* "START MY ONBOARDING" OPENS THE ONBOARDING MADE AT ACCEPTANCE.

   Drives api/proposal-public.js with a fake network that models
   proposal_public, proposal_accept and onboarding_for_proposal (whose real
   rules, accepted-only and one per proposal, are proven on Postgres by
   tests/onbrlsdb.mjs). Proves:

     - accepting returns the portal link for THIS proposal's onboarding, on
       the configured client base, with its token in the fragment
     - the onboarding is asked for with the products the offer's productMap
       gives for what was accepted, and the package name
     - a return visit to the accepted proposal gets the SAME link
     - a proposal that is not accepted never asks for an onboarding and never
       carries a link
     - THE OCT 2026 PRODUCTION BUG, reproduced: onboarding_for_proposal()
       errors (on Supabase it could not find gen_random_bytes, so it failed on
       every call) and the client saw the static fallback with nothing logged.
       Now the server creates the onboarding itself, once per proposal, logs
       the database's error, and the client gets "Start my onboarding"
     - only if that fails too does the client see the static link, and then
       the OWNERS ARE EMAILED (never silent)
     - a package the offer's productMap does not know ("Business Suite" with
       id business-suite) still gets an onboarding, products guessed from its
       name, and the owners are told which package to map; a return visit does
       not email again

   Seen red: building the link before acceptance; with the direct create
   removed (the Oct 2026 failure: static link, no onboarding); with the
   owners' email removed. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';
process.env.APP_URL = 'https://crm.test';
process.env.PROPOSAL_URL = 'https://proposals.agency.test';

const pub = (await import('../api/proposal-public.js')).default;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };
const T = s => (s + 'A'.repeat(43)).slice(0, 43);
const ONB = 'O'.repeat(40) + 'abc';
const BODY = { client: { name: 'Dee', company: 'Dee Co' }, company: { name: 'Agency' }, onboardingUrl: 'https://forms.test/static',
  quote: { items: [{ id: 'growth-os', name: 'Growth OS', kind: 'package' }, { id: 'automations', name: 'Automations', kind: 'addon' }], prepay: null } };
let DB, asks, onbWorks, directWorks, ONBROWS, MAILS, LOGS;
const reset = () => {
  DB = { [T('open')]: { status: 'sent', body: BODY, expires_at: new Date(Date.now() + 864e5).toISOString() }, [T('acc')]: { status: 'accepted', body: BODY, accepted_name: 'Dee' } };
  asks = []; onbWorks = true; directWorks = true; ONBROWS = []; MAILS = []; LOGS = [];
};
const realErr = console.error; console.error = (...a) => { LOGS.push(a.join(' ')); };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const b = opts.body ? JSON.parse(opts.body) : {};
  const J = (d, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('api_hits')) return J([]);
  if (u.includes('crm_users')) return J([{ email: 'logan@agency.test' }]);
  if (u.includes('api.resend.com')) { MAILS.push(b); return J({ id: 'm1' }); }
  if (u.includes('/rest/v1/app_settings')) return J([{ data: { offer: { packages: [{ id: 'growth-os', name: 'Growth OS' }], company: { name: 'Agency' } },
    onboarding: { state: 'KS', productMap: { 'growth-os': ['website', 'suite'], automations: ['automations'] } } } }]);
  if (u.includes('/rpc/proposal_public')) { const r = DB[b.p_token]; return J(r ? [JSON.parse(JSON.stringify(r))] : []); }
  if (u.includes('/rpc/proposal_mark_viewed')) return J(null);
  if (u.includes('/rpc/proposal_accept')) { const r = DB[b.p_token]; if (!r) return J('not_found'); if (r.status === 'accepted') return J('already'); r.status = 'accepted'; return J('accepted'); }
  if (u.includes('/rpc/onboarding_for_proposal')) {
    asks.push(b);
    if (!onbWorks) return J({ code: '42883', message: 'function gen_random_bytes(integer) does not exist' }, false);
    const r = DB[b.p_token]; if (!r || r.status !== 'accepted') return J([]);
    return J([{ token: ONB, client: r.body.client }]);
  }
  /* the server's direct create (service key): proposals read, onboardings insert */
  if (u.includes('/rest/v1/proposals?token=eq.')) {
    const tok = decodeURIComponent(u.split('token=eq.')[1].split('&')[0]); const r = DB[tok];
    return J(r ? [{ id: 'p-' + tok.slice(0, 4), lead_id: 'L1', status: r.status, created_by: null, body: r.body }] : []);
  }
  if (u.includes('/rest/v1/onboardings')) {
    if ((opts.method || 'GET') === 'POST') {
      if (!directWorks) return J({ message: 'permission denied' }, false);
      if (ONBROWS.some(o => o.proposal_id === b.proposal_id)) return J([]);
      ONBROWS.push(b); return J([b]);
    }
    const pid = u.split('proposal_id=eq.')[1].split('&')[0]; return J(ONBROWS.filter(o => o.proposal_id === pid).map(o => ({ token: o.token })));
  }
  return J({}, false);
};
const call = async body => { const res = { code: 0, body: null }; res.status = c => { res.code = c; return res; }; res.json = x => { res.body = x; return res; }; res.end = () => res; res.setHeader = () => {};
  await pub({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body }, res); return res; };
const LINK = `https://proposals.agency.test/onboarding/dee-co#t=${ONB}`;

reset();
let r = await call({ t: T('open') });
ok('a sent proposal: no onboarding asked for, no link', asks.length === 0 && !('onboardingUrl' in r.body.proposal), JSON.stringify(r.body.proposal).slice(0, 200));
r = await call({ t: T('open'), action: 'accept', name: 'Dee Client', agree: true });
ok('accepting returns THIS proposal\'s portal link', r.body.ok && r.body.onboardingUrl === LINK, r.body.onboardingUrl);
ok('  asked once, with the products from productMap and the package name', asks.length === 1 && JSON.stringify(asks[0].p_products) === '["website","suite","automations"]' && asks[0].p_package === 'Growth OS', JSON.stringify(asks));
r = await call({ t: T('open') });
ok('a return visit gets the same link', r.body.proposal.onboardingUrl === LINK);
r = await call({ t: T('open'), action: 'accept', name: 'Dee Client', agree: true });
ok('accepting again ("already") still hands back the same link', r.body.result === 'already' && r.body.onboardingUrl === LINK);
reset(); onbWorks = false;
r = await call({ t: T('open'), action: 'accept', name: 'Dee Client', agree: true });
const made = ONBROWS[0] || {};
ok('THE BUG: the database function fails, yet accepting creates the onboarding (directly)', r.body.ok && r.body.result === 'accepted' && ONBROWS.length === 1, JSON.stringify(r.body));
ok('  and the client gets "Start my onboarding" with ITS portal link, not the static one', r.body.onboardingUrl === `https://proposals.agency.test/onboarding/dee-co#t=${made.token}` && r.body.onboardingUrl !== 'https://forms.test/static', r.body.onboardingUrl);
ok('  for this proposal and lead, with the mapped products and the package name', made.proposal_id === 'p-open' && made.lead_id === 'L1' && JSON.stringify(made.products) === '["website","suite","automations"]' && made.package_name === 'Growth OS', JSON.stringify(made));
ok('  with a 256-bit token in the portal\'s token shape', /^[A-Za-z0-9_-]{43}$/.test(made.token || ''));
ok('  and the database\'s actual error is in the log', LOGS.some(l => /onboarding_for_proposal/.test(l) && /gen_random_bytes/.test(l)), LOGS.join(' | '));
ok('  no "no onboarding" email: it worked', !MAILS.some(m => /No onboarding was created/.test(m.subject)));
r = await call({ t: T('open') });
ok('a return visit: the same onboarding, not a second one', ONBROWS.length === 1 && r.body.proposal.onboardingUrl === `https://proposals.agency.test/onboarding/dee-co#t=${made.token}`);

reset(); onbWorks = false; directWorks = false;
r = await call({ t: T('open'), action: 'accept', name: 'Dee Client', agree: true });
ok('both ways fail: accepting still works, with the static link', r.body.ok && r.body.result === 'accepted' && r.body.onboardingUrl === 'https://forms.test/static', JSON.stringify(r.body));
ok('  and the OWNERS ARE EMAILED, never silent', MAILS.some(m => /No onboarding was created for Dee Co/.test(m.subject)), JSON.stringify(MAILS.map(m => m.subject)));
ok('  both failures are logged', LOGS.some(l => /direct onboarding create failed/.test(l)));
const before = MAILS.length;
r = await call({ t: T('acc') });
ok('  a return visit falls back the same way, without emailing again', r.body.proposal.onboardingUrl === 'https://forms.test/static' && MAILS.length === before);

/* the user's case: "Business Suite", an id productMap does not list */
reset();
const SUITE = { ...BODY, quote: { items: [{ id: 'business-suite', name: 'Business Suite', kind: 'package' }], prepay: null } };
DB[T('bs')] = { status: 'sent', body: SUITE, expires_at: new Date(Date.now() + 864e5).toISOString() };
r = await call({ t: T('bs'), action: 'accept', name: 'Dee Client', agree: true });
ok('an UNMAPPED package (Business Suite) still gets an onboarding and the portal link', r.body.ok && r.body.onboardingUrl === LINK, r.body.onboardingUrl);
ok('  products guessed from its name: the suite', JSON.stringify(asks[asks.length - 1].p_products) === '["suite"]', JSON.stringify(asks[asks.length - 1]));
ok('  and the owners are told which package to map', MAILS.some(m => /package not in your product map/.test(m.subject) && /Business Suite/.test(m.html)), JSON.stringify(MAILS.map(m => m.subject)));
const b2 = MAILS.length;
await call({ t: T('bs') });
ok('  a return visit does not email again', MAILS.length === b2);

console.error = realErr;
console.log(`\nonboardingaccept: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
