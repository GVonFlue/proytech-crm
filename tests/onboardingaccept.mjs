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
     - if the onboarding cannot be made (migration not run), accepting still
       works and falls back to the offer's static onboarding link

   Seen red: building the link before acceptance; dropping the fallback (a
   missing migration broke "You're in"). */
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
let DB, asks, onbWorks;
const reset = () => {
  DB = { [T('open')]: { status: 'sent', body: BODY, expires_at: new Date(Date.now() + 864e5).toISOString() }, [T('acc')]: { status: 'accepted', body: BODY, accepted_name: 'Dee' } };
  asks = []; onbWorks = true;
};
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const b = opts.body ? JSON.parse(opts.body) : {};
  const J = (d, okk = true) => ({ ok: okk, status: okk ? 200 : 400, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('api_hits')) return J([]);
  if (u.includes('crm_users')) return J([{ email: 'logan@agency.test' }]);
  if (u.includes('api.resend.com')) return J({ id: 'm1' });
  if (u.includes('/rest/v1/app_settings')) return J([{ data: { offer: { packages: [{ id: 'growth-os', name: 'Growth OS' }], company: { name: 'Agency' } },
    onboarding: { state: 'KS', productMap: { 'growth-os': ['website', 'suite'], automations: ['automations'] } } } }]);
  if (u.includes('/rpc/proposal_public')) { const r = DB[b.p_token]; return J(r ? [JSON.parse(JSON.stringify(r))] : []); }
  if (u.includes('/rpc/proposal_mark_viewed')) return J(null);
  if (u.includes('/rpc/proposal_accept')) { const r = DB[b.p_token]; if (!r) return J('not_found'); if (r.status === 'accepted') return J('already'); r.status = 'accepted'; return J('accepted'); }
  if (u.includes('/rpc/onboarding_for_proposal')) {
    asks.push(b);
    if (!onbWorks) return J({ message: 'function does not exist' }, false);
    const r = DB[b.p_token]; if (!r || r.status !== 'accepted') return J([]);
    return J([{ token: ONB, client: r.body.client }]);
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
ok('migration not run: accepting still works, with the static link', r.body.ok && r.body.result === 'accepted' && r.body.onboardingUrl === 'https://forms.test/static', JSON.stringify(r.body));
r = await call({ t: T('acc') });
ok('  and a return visit falls back the same way', r.body.proposal.onboardingUrl === 'https://forms.test/static');

console.log(`\nonboardingaccept: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
