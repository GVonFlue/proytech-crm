/* THE ONBOARDING CLIENT EMAILS: once each, to the lead's own address, on time.
   ============================================================================

   "You're locked in" (the deposit tick), "We saved your seat" (24 hours, day
   3, day 6 after the last onboarding activity), the "Launch Day Ticket" (on
   submit), and the day-10 call-task claim. api/_clientemail.js sends them;
   api/_clientemail-tpl.js renders them and decides when; client_emails
   (CLIENT-EMAILS-MIGRATION.sql) is the record that makes each send once.

   What is asserted, against a fake Supabase and a fake Resend:
     the record      the SQL as text: one owner SELECT policy, no write policy,
                     unique (lead_id, kind) (tests/clientemailsdb.mjs runs it
                     on real Postgres)
     the schedule    both UTC crons; 10 AM Chicago in daylight AND standard
                     time, and only then
     the timing      24 h / day 3 / day 6 / day 10 from the LAST activity; the
                     first 10 AM run past each; a missed run sends the latest
                     stage only, once, never an earlier one after it; new
                     activity restarts the count; submitted stops everything
     the switches    never saved = off, named; the past-client guard
     each email      ONE send to the address on the lead, never to an address
                     anywhere else (an attacker's address rides in the lead's
                     other fields and the request); a second trigger sends
                     nothing; a failed send releases its claim and the next run
                     sends; switched off sends nothing; a tick or activity from
                     before the switch-on day sends nothing
     the content     escaped client text; the #CC4A0A button (4.5:1 under
                     white, checked with the contrast engine); the ticket never
                     promises a date the clock has not started; the .ics
     the routes      client-email.js reads only the lead id and requires an
                     owner; the cron requires the secret or an owner; submit
                     sends the ticket after the owners' email
   Seen red: with the claim skipped (two sends), with the address read from
   the lead's other fields, and with the 10 AM check removed. */
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.RESEND_API_KEY = 're_test';
process.env.NOTIFY_FROM = 'ProyTech <hello@getproytech.com>';
process.env.APP_URL = 'https://crm.test';
process.env.CALENDAR_TZ = 'America/Chicago';
import fs from 'node:fs';
import { ratio, parseColor } from './contrast.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 400) : ''))); };

const TPL = await import('../api/_clientemail-tpl.js');
const CE = await import('../api/_clientemail.js');

/* ---------------------------------------------------------------- the record */
console.log('\nthe record (CLIENT-EMAILS-MIGRATION.sql, as text)');
{
  const sql = fs.readFileSync('CLIENT-EMAILS-MIGRATION.sql', 'utf8').replace(/--.*$/gm, '');
  const pols = sql.match(/create policy[^;]+;/gi) || [];
  ok('exactly one policy, and it is a SELECT', pols.length === 1 && /for select/i.test(pols[0]), pols.join(' | '));
  ok('  which requires an owner', /is_owner\(\)/.test(pols[0] || ''));
  ok('no insert / update / delete / all policy anywhere', !/create policy[^;]+for (insert|update|delete|all)/i.test(sql));
  ok('unique (lead_id, kind)', /unique\s*\(\s*lead_id\s*,\s*kind\s*\)/i.test(sql));
  ok('anon and authenticated lose every write grant', /revoke all on client_emails from anon/i.test(sql) && /revoke insert, update, delete, truncate on client_emails from authenticated/i.test(sql));
  ok('RLS-AUDIT.sql checks it', /c\.relname in \('client_emails'[,)]/.test(fs.readFileSync('RLS-AUDIT.sql', 'utf8')));
}

/* -------------------------------------------------------------- the schedule */
console.log('\nthe schedule: 10 AM in Chicago, year round');
{
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const mine = (v.crons || []).filter(c => c.path === '/api/client-emails-cron').map(c => c.schedule).sort();
  ok('vercel.json runs it at 15:00 and 16:00 UTC', JSON.stringify(mine) === JSON.stringify(['0 15 * * *', '0 16 * * *']), JSON.stringify(mine));
  const C = 'America/Chicago';
  ok('July (CDT): 15:00 UTC is 10 AM, 16:00 is not', TPL.isSendHour(Date.parse('2030-07-01T15:00:00Z'), C) && !TPL.isSendHour(Date.parse('2030-07-01T16:00:00Z'), C));
  ok('January (CST): 16:00 UTC is 10 AM, 15:00 is not', TPL.isSendHour(Date.parse('2030-01-15T16:00:00Z'), C) && !TPL.isSendHour(Date.parse('2030-01-15T15:00:00Z'), C));
  ok('the DST change days too (Mar 10 and Nov 3, 2030)', TPL.isSendHour(Date.parse('2030-03-10T15:00:00Z'), C) && TPL.isSendHour(Date.parse('2030-11-03T16:00:00Z'), C));
}

/* ---------------------------------------------------------------- the timing */
console.log('\nthe timing, from the last activity');
{
  const NOW = Date.parse('2030-03-12T15:00:00Z');
  const on = { seat: { on: true }, stall: { on: true } };
  const due = (hoursAgo, claimed = [], sw = on, extra = {}) => TPL.reminderDue({ status: 'in_progress', lastActivityAt: new Date(NOW - hoursAgo * 36e5).toISOString(), ...extra }, NOW, new Set(claimed), sw);
  ok('23 hours: nothing yet', due(23) === null);
  ok('25 hours: "saved your seat" #1', due(25) === 'seat_1d');
  ok('  and not again once sent', due(40, ['seat_1d']) === null);
  ok('day 3: #2', due(73, ['seat_1d']) === 'seat_3d');
  ok('day 6: #3, the personal one', due(145, ['seat_1d', 'seat_3d']) === 'seat_6d');
  ok('a missed run at day 7 with nothing sent: only the latest stage', due(7 * 24) === 'seat_6d');
  ok('  and after it, never an earlier one', due(8 * 24, ['seat_6d']) === null);
  ok('day 10: the call task', due(241, ['seat_1d', 'seat_3d', 'seat_6d']) === 'stall_10d');
  ok('new activity restarts the count: 2 hours after it, nothing', due(2, ['seat_1d']) === null);
  ok('submitted: nothing, ever', due(200, [], on, { submittedAt: '2030-03-05T00:00:00Z' }) === null && TPL.reminderDue({ status: 'submitted', lastActivityAt: '2030-03-01T00:00:00Z' }, NOW, new Set(), on) === null);
  ok('not started (no activity): nothing', TPL.reminderDue({ status: 'not_started', lastActivityAt: null }, NOW, new Set(), on) === null);
  ok('reminders off, task on: only the task, at day 10', due(7 * 24, [], { seat: { on: false }, stall: { on: true } }) === null && due(250, [], { seat: { on: false }, stall: { on: true } }) === 'stall_10d');
  ok('task off: day 11 with #3 sent is nothing', due(11 * 24, ['seat_6d'], { seat: { on: true }, stall: { on: false } }) === null);
}

/* -------------------------------------------------------------- the switches */
console.log('\nthe switches');
{
  const sw = TPL.readSwitches({});
  ok('never saved: all four off, named', ['lockedIn', 'seat', 'stall', 'ticket'].every(k => sw[k].on === false) && sw.fellBack.length === 4);
  const s2 = TPL.readSwitches({ clientEmails: { lockedIn: { on: true, since: '2030-03-01' } } });
  ok('one switched on: on, with its day; the rest still named off', s2.lockedIn.on && s2.lockedIn.since === '2030-03-01' && s2.fellBack.length === 3);
  ok('the past-client guard: a tick before the switch-on day does not count', !TPL.allowed(s2.lockedIn, '2030-02-28') && TPL.allowed(s2.lockedIn, '2030-03-01'));
  ok('  on with no day is not allowed either (fails closed)', !TPL.allowed({ on: true, since: null }, '2030-03-01'));
}

/* ---------------------------------------------------------------- the content */
console.log('\nthe content');
{
  const base = { agency: 'ProyTech', logo: 'https://crm.test/logo.png', base: 'https://crm.test', contact: { name: 'Logan Sell', phone: '(913) 237-4403', photo: '/team/logan.jpg' },
    first: 'Jordan', company: 'Reed <script>alert(1)</script> Realty', link: 'https://crm.test/onboarding/reed#t=TOKEN', launchDays: 14 };
  const li = TPL.lockedIn({ ...base, product: 'Growth OS', deposit: { amount: 1500, method: 'ach', on: '2030-03-11' }, nextAmount: 1500 });
  ok('"You\'re locked in": subject and the onboarding link', li.subject === "🔒 You're locked in, Jordan" && li.html.includes('https://crm.test/onboarding/reed#t=TOKEN') && li.text.includes('https://crm.test/onboarding/reed#t=TOKEN'));
  ok('  the paid line, and the next payment', /\$1,500 paid/.test(li.html) && /Bank \(ACH\) · Mar 11/.test(li.html) && /\$1,500 on Launch Day/.test(li.html));
  ok('  client text is escaped', !li.html.includes('<script>alert(1)') && li.html.includes('&lt;script&gt;'));
  ok('  the photo is an absolute URL', li.html.includes('https://crm.test/team/logan.jpg'));
  const fills = [...li.html.matchAll(/bgcolor="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1]);
  ok('  the button is #CC4A0A, not the brand orange', fills.includes('#CC4A0A') && !fills.includes('#FB6926'), fills.join());
  ok('  and white on it clears 4.5:1', ratio(parseColor('#fff').rgb, parseColor('#CC4A0A').rgb) >= 4.5);
  const s1 = TPL.savedSeat({ ...base, stage: 'seat_1d', done: 5, total: 8, next: { title: 'Brand & design', minutes: 2 }, needed: ['Logo', 'Headshot', 'Domain access'], asset: 'logo' });
  ok('"We saved your seat": progress, next item, still needed, resume', /5 of 8 sections/.test(s1.html) && /Brand &amp; design · about 2 min/.test(s1.html) && /Logo, Headshot, Domain access/.test(s1.html) && s1.html.includes('Finish my onboarding'));
  ok('  "reply with your logo"', /reply to this email with your logo/.test(s1.html));
  ok('  the 24-hour one is not personal', !/I'll call you/.test(s1.html));
  const s6 = TPL.savedSeat({ ...base, stage: 'seat_6d', done: 5, total: 8, needed: [], asset: null });
  ok('  day 6 is personal and offers a call, with their phone', /knock it out together/.test(s6.html) && /Reply and I'll call you, or text me at \(913\) 237-4403/.test(s6.html));
  const notStarted = TPL.launchTicket({ ...base, company: 'Reed Realty', productLine: 'Growth OS', launch: { started: false, waiting: ['your deposit', 'domain access'] }, kickoff: { at: null, url: 'https://cal.test/kickoff' }, crew: [base.contact, { name: 'Garrett Von Flue', role: 'Strategy & your build' }], ics: false });
  ok('"Launch Day Ticket": ADMIT ONE and the crew', /ADMIT ONE · LAUNCH DAY/.test(notStarted.html) && /Garrett/.test(notStarted.html) && /Strategy &amp; your build/.test(notStarted.html));
  ok('  clock not started: NO date promised, it says what it waits on', !/CLOCK STARTED/.test(notStarted.html) && !/By [A-Z][a-z]{2} \d/.test(notStarted.html)
    && /countdown starts when we receive your deposit, domain access/.test(notStarted.html) && !/launch-day\.ics/.test(notStarted.html));
  ok('  and offers the kickoff booking', notStarted.html.includes('https://cal.test/kickoff'));
  const started = TPL.launchTicket({ ...base, company: 'Reed Realty', productLine: 'Growth OS', launch: { started: true, startedOn: '2030-03-12', target: '2030-03-26', launchDays: 14, waiting: [] }, kickoff: { at: 'Mar 13 · 10 AM', url: null }, crew: [], ics: true });
  ok('  clock started: started date, kickoff, Launch Day, the calendar file', /Mar 12/.test(started.html) && /Mar 13 · 10 AM/.test(started.html) && /By Mar 26/.test(started.html) && /launch-day\.ics/.test(started.html));
  const ics = TPL.launchIcs({ company: 'Reed, Realty; Group', agency: 'ProyTech', target: '2030-03-26', uid: 'launch-1@crm.test', now: Date.parse('2030-03-12T15:00:00Z') });
  ok('the .ics: an all-day event on Launch Day, CRLF, escaped', /DTSTART;VALUE=DATE:20300326\r\nDTEND;VALUE=DATE:20300327/.test(ics) && ics.includes('SUMMARY:Reed\\, Realty\\; Group Launch Day') && ics.endsWith('END:VCALENDAR\r\n'));
  ok('  and none without a date', TPL.launchIcs({ company: 'x', agency: 'y', target: '', uid: 'u', now: 0 }) === null);
}

/* ------------------------------------------------- against a fake Supabase */
const ATTACKER = 'attacker@evil.test';
const TOK = n => String(n).repeat(43).slice(0, 43);
const DB = { settings: {}, leads: new Map(), onbs: [], claims: [], mails: [], resendFail: false };
let seq = 0;
const lead = (id, email, data = {}) => DB.leads.set(id, { id, data: { id, name: 'Jordan Reed', email, company: 'Reed Realty',
  /* the attacker's address sits in every other field a careless sender might read */
  phone: ATTACKER, notes: ATTACKER, contacts: [{ email: ATTACKER }], ...data } });
const onb = (id, leadId, o = {}) => DB.onbs.push({ id, lead_id: leadId, token: TOK(id.slice(-1)), status: 'in_progress', last_activity_at: null, submitted_at: null, created_at: new Date(++seq * 1000).toISOString(), ...o });
const rowFor = o => ({ id: o.id, status: o.status, industry: 'realtor', lender_kind: null, products: ['website', 'suite'], package_name: 'Growth OS',
  answers: { 'biz.contact_name': 'Jordan Reed', 'biz.name': 'Reed Realty', 'biz.email': ATTACKER }, sections: {}, files: [], submitted_at: o.submitted_at, last_activity_at: o.last_activity_at,
  checklist: { deposit_paid: { done: '2030-03-11' } }, contacts: [{ name: 'Logan Sell', phone: '(913) 237-4403', photo: '/team/logan.jpg', role: 'Onboarding & support', email: ATTACKER }],
  launch_days: 14, client_name: 'Jordan Reed', client_email: ATTACKER, client_phone: '', client_company: 'Reed Realty', client_website: '', plan: null });
const J = (d, s = 200) => ({ ok: s < 300, status: s, json: async () => d, text: async () => JSON.stringify(d) });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); const method = (opts.method || 'GET').toUpperCase(); const q = u.searchParams;
  if (u.host === 'api.resend.com') { const b = JSON.parse(opts.body); if (DB.resendFail) return J({ message: 'down' }, 500); DB.mails.push(b); return J({ id: 'm' + DB.mails.length }); }
  const p = u.pathname.replace('/rest/v1/', '');
  const eqv = k => (q.get(k) || '').replace(/^eq\./, '');
  if (p === 'app_settings') return J([{ data: DB.settings }]);
  if (p === 'rpc/onboarding_public') { const t = JSON.parse(opts.body).p_token; const o = DB.onbs.find(x => x.token === t); return J(o ? [rowFor(o)] : []); }
  if (p === 'leads') { if (q.get('id')) { const l = DB.leads.get(decodeURIComponent(eqv('id'))); return J(l ? [l] : []); } return J([...DB.leads.values()]); }
  if (p === 'onboardings') {
    let rows = [...DB.onbs];
    if (q.get('id')) rows = rows.filter(o => o.id === eqv('id'));
    if (q.get('lead_id')) rows = rows.filter(o => o.lead_id === decodeURIComponent(eqv('lead_id')));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    return J(rows);
  }
  if (p === 'client_emails') {
    if (method === 'GET') return J(DB.claims.map(c => ({ lead_id: c.lead_id, kind: c.kind, sent_at: c.sent_at })));
    if (method === 'POST') { const b = JSON.parse(opts.body); if (DB.claims.some(c => c.lead_id === b.lead_id && c.kind === b.kind)) return J([]); const row = { id: 'c' + (++seq), ...b, sent_at: null }; DB.claims.push(row); return J([row], 201); }
    if (method === 'PATCH') { const c = DB.claims.find(x => x.id === eqv('id')); if (c) Object.assign(c, JSON.parse(opts.body)); return J([]); }
    if (method === 'DELETE') { DB.claims = DB.claims.filter(x => x.id !== eqv('id')); return J([]); }
  }
  return J({}, 404);
};
const sentTo = () => DB.mails.map(m => m.to.join());
const reset = () => { DB.settings = {}; DB.leads = new Map(); DB.onbs = []; DB.claims = []; DB.mails = []; DB.resendFail = false; };
const ON = { lockedIn: { on: true, since: '2030-03-01' }, seat: { on: true, since: '2030-03-01' }, stall: { on: true, since: '2030-03-01' }, ticket: { on: true, since: '2030-03-01' } };
const O1 = '11111111-1111-4111-8111-111111111111', O2 = '22222222-2222-4222-8222-222222222222', O3 = '33333333-3333-4333-8333-333333333333', O4 = '44444444-4444-4444-8444-444444444444';

console.log('\n"You\'re locked in": once, to the lead\'s own address');
{
  reset();
  lead('L1', 'jordan@reed.test', { onboarding: { deposit_paid: { done: '2030-03-11' } }, payments: [{ amount: 1500, date: '2030-03-11', method: 'ach' }], dealValue: 3000 });
  onb(O1, 'L1');
  let r = await CE.sendLockedIn('L1');
  ok('switched off (never saved): nothing sent, and it says so', r.reason === 'switched_off' && DB.mails.length === 0);
  DB.settings = { clientEmails: ON };
  r = await CE.sendLockedIn('L1');
  ok('switched on: sent', r.ok, JSON.stringify(r));
  ok('  ONE email, to the lead\'s address only', DB.mails.length === 1 && sentTo()[0] === 'jordan@reed.test', sentTo().join(' | '));
  ok('  never the address in the lead\'s other fields, the answers or the contacts', !JSON.stringify(DB.mails.map(m => m.to)).includes(ATTACKER));
  ok('  with a plain-text part and the subject', DB.mails[0].text && DB.mails[0].subject === "🔒 You're locked in, Jordan");
  ok('  the claim is recorded as sent', DB.claims.length === 1 && DB.claims[0].kind === 'locked_in' && !!DB.claims[0].sent_at);
  r = await CE.sendLockedIn('L1');
  ok('a second trigger sends nothing', !r.ok && r.reason === 'already' && DB.mails.length === 1);
  const both = await Promise.all([CE.sendLockedIn('L1'), CE.sendLockedIn('L1')]);
  ok('  nor two at once', both.every(x => !x.ok) && DB.mails.length === 1);

  lead('L2', 'old@client.test', { onboarding: { deposit_paid: { done: '2030-02-20' } } }); onb(O2, 'L2');
  r = await CE.sendLockedIn('L2');
  ok('a deposit ticked BEFORE the switch-on day: nothing (past clients are never emailed)', r.reason === 'before_switched_on' && DB.mails.length === 1);
  lead('L3', 'new@client.test', { onboarding: { deposit_paid: { done: '2030-03-11' } } });
  r = await CE.sendLockedIn('L3');
  ok('no onboarding yet: nothing, and it says why', r.reason === 'no_onboarding');
  lead('L4', 'untick@client.test', { onboarding: {} }); onb(O3, 'L4');
  r = await CE.sendLockedIn('L4');
  ok('not ticked: nothing (the tick is read from the record, not the caller)', r.reason === 'not_ticked');
  lead('L5', 'retry@client.test', { onboarding: { deposit_paid: { done: '2030-03-11' } } }); onb(O4, 'L5');
  DB.resendFail = true;
  r = await CE.sendLockedIn('L5');
  ok('a failed send releases its claim', !r.ok && !DB.claims.some(c => c.lead_id === 'L5'));
  DB.resendFail = false;
  r = await CE.sendLockedIn('L5');
  ok('  so the next try sends', r.ok && sentTo().includes('retry@client.test'));
}

console.log('\nthe daily job');
{
  reset(); DB.settings = { clientEmails: ON };
  const NOW = Date.parse('2030-03-12T15:00:00Z');       // 10 AM CDT
  lead('L1', 'one@client.test'); onb(O1, 'L1', { last_activity_at: new Date(NOW - 25 * 36e5).toISOString() });
  lead('L2', 'stall@client.test'); onb(O2, 'L2', { last_activity_at: new Date(NOW - 10.5 * 864e5).toISOString() });
  lead('L3', 'early@client.test'); onb(O3, 'L3', { last_activity_at: '2030-02-20T12:00:00Z' });       // before the switch-on day
  lead('L4', 'done@client.test'); onb(O4, 'L4', { status: 'submitted', submitted_at: '2030-03-11T18:00:00Z', last_activity_at: '2030-03-11T18:00:00Z' });
  let r = await CE.runDaily(Date.parse('2030-03-12T16:00:00Z'));
  ok('the run that is not 10 AM in Chicago does nothing', !!r.skipped && DB.mails.length === 0, JSON.stringify(r));
  r = await CE.runDaily(NOW);
  ok('at 10 AM: "saved your seat" #1 to the 25-hour onboarding', sentTo().includes('one@client.test') && DB.claims.some(c => c.lead_id === 'L1' && c.kind === 'seat_1d'), JSON.stringify(r));
  ok('  day 10: no email, a call-task claim naming the client', !sentTo().includes('stall@client.test') && DB.claims.some(c => c.lead_id === 'L2' && c.kind === 'stall_10d' && /Call Reed Realty: onboarding stalled 10 days/.test(c.detail)), JSON.stringify(DB.claims));
  ok('  stalled since before the switch-on day: nothing', !sentTo().includes('early@client.test') && !DB.claims.some(c => c.lead_id === 'L3'));
  ok('  a submit whose ticket never went out: the backstop sends it', sentTo().includes('done@client.test') && DB.claims.some(c => c.lead_id === 'L4' && c.kind === 'ticket'));
  ok('  every email went to its own lead\'s address, and none to the attacker', DB.mails.every(m => m.to.length === 1) && !JSON.stringify(DB.mails.map(m => m.to)).includes(ATTACKER));
  const before = DB.mails.length;
  await CE.runDaily(NOW);
  ok('run again the same day: nothing new', DB.mails.length === before);
  await CE.runDaily(NOW + 864e5);
  ok('the next day: still nothing for the same stages', DB.mails.length === before);
  DB.onbs.find(o => o.id === O1).status = 'submitted'; DB.onbs.find(o => o.id === O1).submitted_at = new Date(NOW + 2 * 864e5).toISOString();
  DB.settings = { clientEmails: { ...ON, ticket: { on: false } } };
  await CE.runDaily(NOW + 3 * 864e5);
  ok('once they submit, no more reminders (day 3 never comes)', !DB.claims.some(c => c.lead_id === 'L1' && c.kind === 'seat_3d'));
  DB.settings = { clientEmails: {} };
  const off = await CE.runDaily(NOW + 5 * 864e5);
  ok('every email switched off: the job says so and sends nothing', /switched off/.test(off.skipped || '') && DB.mails.length === before);
}

console.log('\nthe Launch Day ticket');
{
  reset(); DB.settings = { clientEmails: ON };
  lead('L1', 'ticket@client.test'); onb(O1, 'L1', { status: 'submitted', submitted_at: '2030-03-12T17:00:00Z' });
  let r = await CE.sendTicket(O1, { now: Date.parse('2030-03-12T17:01:00Z') });
  ok('sent once, to the lead\'s address', r.ok && DB.mails.length === 1 && sentTo()[0] === 'ticket@client.test', JSON.stringify(r));
  ok('  the clock has not started (no access yet): no date, no calendar file', !/CLOCK STARTED/.test(DB.mails[0].html) && !DB.mails[0].attachments);
  r = await CE.sendTicket(O1);
  ok('again: nothing', r.reason === 'already' && DB.mails.length === 1);
  lead('L2', 'notyet@client.test'); onb(O2, 'L2', { status: 'in_progress' });
  ok('not submitted: nothing', (await CE.sendTicket(O2)).reason === 'not_submitted');
}

/* --------------------------------------------------------------- the routes */
console.log('\nthe routes');
{
  const ce = fs.readFileSync('api/client-email.js', 'utf8');
  ok('client-email.js requires an owner', /requireOwner:\s*true/.test(ce));
  ok('  and reads ONLY the lead id from the request', (ce.match(/\bb\.[a-zA-Z]+/g) || []).every(x => x === 'b.leadId'), (ce.match(/\bb\.[a-zA-Z]+/g) || []).join());
  const cron = fs.readFileSync('api/client-emails-cron.js', 'utf8');
  ok('the cron: the scheduler secret, or an owner', /isCronCaller\(req\)/.test(cron) && /requireOwner:\s*true/.test(cron));
  const op = fs.readFileSync('api/onboarding-public.js', 'utf8');
  const sub = op.slice(op.indexOf("if (action === 'submit')"));
  ok('submit sends the ticket, after the owners\' email', sub.indexOf('sendTicket(row.id)') > sub.indexOf("subject: `${business} finished onboarding`"));
  const tpl = fs.readFileSync('api/_clientemail.js', 'utf8');
  ok('_clientemail.js reaches the client only through sendClientMail, by onboarding id', /sendClientMail\(\{ onboardingId,/.test(tpl) && !/sendMail\(/.test(tpl) && !/api\.resend\.com/.test(tpl));
}

console.log(`\nclientemails: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
