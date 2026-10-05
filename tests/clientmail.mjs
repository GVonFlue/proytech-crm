/* TWO DOORS FOR MAIL, AND NEITHER CAN BE AIMED.
   ============================================================================

   api/_mail.js has two senders:
   - sendMail()        the owners allowlist (NOTIFY_TO + active owners), and
                       nobody else. notify.js, coffee-book.js and the proposal
                       acceptance notice use it. PR #80 made it owner-only;
                       coffee-book, a PUBLIC route, depends on that.
   - sendClientMail()  one client. It takes a proposal id OR an onboarding id
                       and NO address: the recipient is read server-side from
                       the lead the record belongs to.

   The proposals port arrived with a sendMail() that would send to any address.
   This file proves the split held: the owner door still cannot reach a client,
   the client door cannot be pointed anywhere but the lead's own email, and
   only proposal-send.js, proposal-public.js (the client's copy of an
   acceptance) and onboarding-public.js hold the client door.                 */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'CRM <crm@agency.test>';
process.env.NOTIFY_TO = 'owner@agency.test';

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sendMail, sendClientMail, clientRecipientFor, clientRecipientForOnboarding } = await import('../api/_mail.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const PID = '11111111-1111-4111-8111-111111111111', PID_NOEMAIL = '22222222-2222-4222-8222-222222222222';
const PROPOSALS = { [PID]: 'L1', [PID_NOEMAIL]: 'L2' };
const OID = '33333333-3333-4333-8333-333333333333';
const ONBOARDINGS = { [OID]: 'L1' };
const LEADS = { L1: { id: 'L1', email: 'client@client.test' }, L2: { id: 'L2', email: '' } };
let sent = [], dbCalls = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const J = (d, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('api.resend.com')) { sent.push(JSON.parse(opts.body)); return J({ id: 'm1' }); }
  if (u.includes('crm_users')) return J([{ email: 'logan@agency.test' }]);
  if (u.includes('/rest/v1/onboardings?id=eq.')) { dbCalls++; const id = u.match(/id=eq\.([^&]+)/)[1]; return J(ONBOARDINGS[id] ? [{ lead_id: ONBOARDINGS[id] }] : []); }
  if (u.includes('/rest/v1/proposals?id=eq.')) { dbCalls++; const id = u.match(/id=eq\.([^&]+)/)[1]; return J(PROPOSALS[id] ? [{ lead_id: PROPOSALS[id] }] : []); }
  if (u.includes('/rest/v1/leads?id=eq.')) { dbCalls++; const id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]); return J(LEADS[id] ? [{ data: LEADS[id] }] : []); }
  return J({}, false);
};
const reset = () => { sent = []; dbCalls = 0; };

console.log('\nsendMail() — still the owners and nobody else');
{
  reset();
  const r = await sendMail({ to: ['client@client.test'], subject: 's', html: 'h' });
  ok("a client's address is refused", r.ok === false && r.reason === 'no_recipients' && sent.length === 0, JSON.stringify(r));
  reset();
  await sendMail({ subject: 's', html: 'h' });
  ok('with no `to` it reaches exactly the owners', sent.length === 1 && sent[0].to.slice().sort().join() === 'logan@agency.test,owner@agency.test', sent[0] && sent[0].to);
  ok('  and takes no proposalId: passing one changes nothing', await (async () => { reset(); await sendMail({ proposalId: PID, subject: 's', html: 'h' }); return sent.length === 1 && !sent[0].to.includes('client@client.test'); })());
}

console.log('\nsendClientMail() — the recipient comes from the record');
{
  reset();
  const r = await sendClientMail({ proposalId: PID, subject: 'Your proposal', html: '<p>hi</p>', replyTo: 'me@agency.test' });
  ok('it sends to the email on the proposal\'s lead', r.ok && sent.length === 1 && sent[0].to.join() === 'client@client.test', JSON.stringify(sent[0] && sent[0].to));
  ok('  with the reply going to the owner who sent it', sent[0].reply_to === 'me@agency.test');

  reset();
  await sendClientMail({ proposalId: PID, to: ['attacker@evil.test'], email: 'attacker@evil.test', recipient: 'attacker@evil.test', subject: 's', html: 'h' });
  ok('an address passed in ANY field is ignored', sent.length === 1 && sent[0].to.join() === 'client@client.test' && !JSON.stringify(sent).includes('evil.test'), JSON.stringify(sent));

  reset();
  await sendClientMail({ proposalId: PID, subject: 's', html: 'h', replyTo: 'not an address' });
  ok('a malformed reply-to is dropped, not sent', sent.length === 1 && sent[0].reply_to === undefined);

  reset();
  const r2 = await sendClientMail({ proposalId: PID_NOEMAIL, subject: 's', html: 'h' });
  ok('a lead with no email: nothing sent, says why', r2.ok === false && r2.reason === 'no_email' && sent.length === 0, JSON.stringify(r2));

  reset();
  const r3 = await sendClientMail({ proposalId: '99999999-9999-4999-8999-999999999999', subject: 's', html: 'h' });
  ok('an unknown proposal: nothing sent', r3.ok === false && r3.reason === 'not_found' && sent.length === 0);

  reset();
  const r4 = await sendClientMail({ proposalId: "x' or 1=1", subject: 's', html: 'h' });
  ok('a malformed id never reaches the database', r4.ok === false && r4.reason === 'not_found' && dbCalls === 0 && sent.length === 0);

  reset();
  const r5 = await sendClientMail({ subject: 's', html: 'h', to: ['attacker@evil.test'] });
  ok('no proposal id at all: nothing sent, even with a `to`', r5.ok === false && sent.length === 0);

  reset();
  const keep = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  const r6 = await sendClientMail({ proposalId: PID, subject: 's', html: 'h' });
  process.env.RESEND_API_KEY = keep;
  ok('unconfigured: not_configured, nothing sent', r6.reason === 'not_configured' && sent.length === 0);

  const rc = await clientRecipientFor(PID);
  ok('clientRecipientFor names the same address', rc.ok && rc.to === 'client@client.test');
}

console.log('\nsendClientMail() by onboarding id — the same rule');
{
  reset();
  const r = await sendClientMail({ onboardingId: OID, subject: 'Your link', html: 'h', to: ['attacker@evil.test'] });
  ok('it sends to the email on the onboarding\'s lead, ignoring any `to`', r.ok && sent.length === 1 && sent[0].to.join() === 'client@client.test' && !JSON.stringify(sent).includes('evil.test'), JSON.stringify(sent));
  reset();
  const r2 = await sendClientMail({ onboardingId: OID, proposalId: PID, subject: 's', html: 'h' });
  ok('both ids at once: nothing sent', r2.ok === false && sent.length === 0);
  reset();
  const r3 = await sendClientMail({ onboardingId: '99999999-9999-4999-8999-999999999999', subject: 's', html: 'h' });
  ok('an unknown onboarding: nothing sent', r3.ok === false && sent.length === 0);
  reset();
  const r4 = await sendClientMail({ onboardingId: "x' or 1=1", subject: 's', html: 'h' });
  ok('a malformed onboarding id never reaches the database', r4.ok === false && dbCalls === 0 && sent.length === 0);
  const rc = await clientRecipientForOnboarding(OID);
  ok('clientRecipientForOnboarding names the same address', rc.ok && rc.to === 'client@client.test');
}

console.log('\nwho holds which door');
{
  const files = (await fs.readdir(path.join(ROOT, 'api'))).filter(f => f.endsWith('.js'));
  const holders = [];
  for (const f of files) {
    const src = await fs.readFile(path.join(ROOT, 'api', f), 'utf8');
    if (f !== '_mail.js' && /\bsendClientMail\b/.test(src)) holders.push(f);
  }
  /* a listed set, widened on purpose: proposal-public.js sends the client their
     copy of an acceptance (Terms §18.2). It passes only the id of the proposal
     the token just accepted; the recipient is still read from the lead. */
  ok('only proposal-send.js, proposal-public.js and onboarding-public.js use sendClientMail()', holders.sort().join() === 'onboarding-public.js,proposal-public.js,proposal-send.js', holders.join());
  const onb = await fs.readFile(path.join(ROOT, 'api/onboarding-public.js'), 'utf8');
  const onbCode = onb.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('onboarding-public.js never reads an address off the request', !/\bb\.(to|email|recipient)\b/.test(onbCode));
  ok('  and passes no `to` to the client door', !/sendClientMail\(\{[^}]*\bto\s*:/.test(onbCode));

  const book = await fs.readFile(path.join(ROOT, 'api/coffee-book.js'), 'utf8');
  ok('coffee-book.js (public) imports only the owner door', /import \{ sendMail \} from '\.\/_mail\.js'/.test(book) && !/sendClientMail|clientRecipientFor/.test(book));

  const send = await fs.readFile(path.join(ROOT, 'api/proposal-send.js'), 'utf8');
  const code = send.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('proposal-send.js never reads an address off the request', !/\bb\.(to|email|recipient)\b/.test(code) && !/req\.body\.(to|email)/.test(code));
  ok('  and passes no `to` to the client door', !/sendClientMail\(\{[^}]*\bto\s*:/.test(code));

  const mail = await fs.readFile(path.join(ROOT, 'api/_mail.js'), 'utf8');
  const sig = (mail.match(/export async function sendClientMail\(\{([^}]*)\}/) || [])[1] || '';
  ok('sendClientMail\'s own signature has no `to`', sig && !/\bto\b/.test(sig), sig);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
