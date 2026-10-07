// api/_clientemail.js — sending the onboarding client emails: to whom, once,
// and the record of it. The emails themselves are ./_clientemail-tpl.js.
// Underscore prefix => Vercel does not expose this as a route.
//
// THREE CALLERS, ONE RULE EACH
//   sendLockedIn(leadId)    api/client-email.js (the owner ticked the deposit),
//                           a future Square webhook (it ticks the same box),
//                           and the daily job (a tick that did not trigger)
//   sendTicket(onboardingId) api/onboarding-public.js on submit, and the
//                           daily job (a submit whose send failed)
//   runDaily(now)           api/client-emails-cron.js: the backstops above,
//                           the "saved your seat" reminders, the day-10 claim
//
// WHO: sendClientMail({onboardingId}) ONLY. It reads the address from the
// onboarding's lead; nothing here takes, builds or forwards an address, and
// nothing a request carries can reach one (tests/clientemails.mjs sends with
// an attacker's address in every field and checks where it went).
//
// ONCE: every send first CLAIMS its (lead, kind) row in client_emails
// (CLIENT-EMAILS-MIGRATION.sql, unique (lead_id, kind)) with "insert, do
// nothing on conflict". No row back means someone else already has it, and
// nothing is sent. A failed send DELETES its claim so tomorrow's run retries;
// a sent one stamps sent_at.
//
// THE PAST-CLIENT GUARD: each email is OFF until an owner switches it on in
// Settings, and only a tick / activity / submit dated on or after that day
// can trigger it (_clientemail-tpl allowed()).
//
// IT NEVER WRITES A LEAD. The CRM saves whole lead records from the browser,
// so a server write would race an open screen (ENGINEERING §3). The day-10
// "Call [client]" task is a claim here; the owner's CRM turns it into a task.

import { SUPA_KEY, SUPA_URL } from './_env.js';
import { sendClientMail } from './_mail.js';
import { calendarTz } from './_google.js';
import { proposalBase } from './proposal-send.js';
import { loadConfig, publicView, portalLink } from './onboarding-public.js';
import { setupPaid } from '../src/lib/retainer.js';
import {
  ctxOf, progress, stillNeeded, SECTIONS, sectionTitle,
} from '../src/lib/onboarding.js';
import {
  readSwitches, allowed, localDay, isSendHour, reminderDue, firstName,
  lockedIn, savedSeat, launchTicket, launchIcs,
} from './_clientemail-tpl.js';

const H = (extra = {}) => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json', ...extra });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const S = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);
const get = async path => { try { const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H() }); return r.ok ? await r.json() : null; } catch { return null; } };
const doneOf = v => (!v ? null : typeof v === 'string' ? v : v.done || null);

async function readSettings() {
  const rows = await get('app_settings?id=eq.main&select=data');
  return (Array.isArray(rows) && rows[0] && rows[0].data) || {};
}
async function readLead(leadId) {
  if (!LEAD_ID.test(String(leadId || ''))) return null;
  const rows = await get(`leads?id=eq.${encodeURIComponent(leadId)}&select=id,data`);
  return Array.isArray(rows) && rows[0] ? { id: rows[0].id, ...(rows[0].data || {}) } : null;
}
async function rpcRow(token) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/onboarding_public`, { method: 'POST', headers: H(), body: JSON.stringify({ p_token: token }) });
    const j = r.ok ? await r.json() : null;
    return Array.isArray(j) ? j[0] || null : null;
  } catch { return null; }
}

/* ------------------------------------------------------------- the claim */
/** Claim (lead, kind). Returns the claim's id, or null if it was already
 *  claimed (or the write failed: no claim, no send). */
export async function claim(leadId, kind, onboardingId, detail) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/client_emails?on_conflict=lead_id,kind`, {
      method: 'POST', headers: H({ prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ lead_id: leadId, kind, onboarding_id: onboardingId && UUID.test(onboardingId) ? onboardingId : null, detail: detail ? S(detail, 300) : null }),
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0] && rows[0].id ? rows[0].id : null;
  } catch { return null; }
}
const settle = async (id, sent, detail) => {
  try {
    if (sent) await fetch(`${SUPA_URL}/rest/v1/client_emails?id=eq.${id}`, { method: 'PATCH', headers: H(), body: JSON.stringify({ sent_at: new Date().toISOString() }) });
    else await fetch(`${SUPA_URL}/rest/v1/client_emails?id=eq.${id}`, { method: 'DELETE', headers: H() });
  } catch { /* a stamp that fails leaves the claim: never a second send */ }
  if (!sent) console.error('[client-email] send failed, claim released for a retry:', detail);
};
/** claim, send, settle. `build` returns the email or a reason not to send. */
async function once(leadId, kind, onboardingId, build) {
  const id = await claim(leadId, kind, onboardingId);
  if (!id) return { ok: false, reason: 'already' };
  let mail;
  try { mail = await build(); } catch (e) { mail = { skip: 'build_error:' + S(e && e.message, 80) }; }
  if (!mail || mail.skip) { await settle(id, false, mail && mail.skip); return { ok: false, reason: (mail && mail.skip) || 'skip' }; }
  const sent = await sendClientMail({ onboardingId, ...mail, tag: 'client-email:' + kind });
  await settle(id, sent.ok, sent.reason);
  return sent.ok ? { ok: true, kind } : { ok: false, reason: sent.reason };
}

/* ------------------------------------------------- what every email needs */
async function common(row, cfg) {
  const view = publicView(row, cfg);
  const base = proposalBase();
  const absLogo = /^https:\/\//.test(S(cfg.agencyLogo, 500)) ? cfg.agencyLogo : (S(cfg.agencyLogo, 500).startsWith('/') ? base.replace(/\/+$/, '') + cfg.agencyLogo : '');
  const first = firstName((row.answers && row.answers['biz.contact_name']) || row.client_name);
  const company = S((row.answers && row.answers['biz.name']) || row.client_company || row.client_name || 'your business', 120);
  return {
    view, base, agency: cfg.agency || '', logo: absLogo, contact: view.contacts[0] || null, first, company,
    link: portalLink({ company: row.client_company, name: row.client_name }, row.token || ''),
    launchDays: view.launchDays,
  };
}

/* ------------------------------------------------- 1. "You're locked in" */
async function latestOnboarding(leadId) {
  const rows = await get(`onboardings?lead_id=eq.${encodeURIComponent(leadId)}&select=id,token,status,submitted_at,last_activity_at&order=created_at.desc&limit=1`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}
/** The deposit tick on this lead's checklist sends "You're locked in", once.
 *  Reads the tick from the RECORD: whoever calls this cannot claim a tick
 *  that is not there. */
export async function sendLockedIn(leadId, { settings } = {}) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  const st = settings || await readSettings();
  const sw = readSwitches(st).lockedIn;
  if (!sw.on) return { ok: false, reason: 'switched_off' };
  const lead = await readLead(leadId);
  if (!lead) return { ok: false, reason: 'not_found' };
  const ticked = doneOf(lead.onboarding && lead.onboarding.deposit_paid);
  if (!ticked) return { ok: false, reason: 'not_ticked' };
  if (!allowed(sw, ticked)) return { ok: false, reason: 'before_switched_on' };
  const onb = await latestOnboarding(lead.id);
  if (!onb) return { ok: false, reason: 'no_onboarding' };
  if (onb.status === 'submitted') return { ok: false, reason: 'already_submitted' };
  return once(lead.id, 'locked_in', onb.id, async () => {
    const row = await rpcRow(onb.token); if (!row) return { skip: 'no_onboarding_row' };
    const cfg = await loadConfig();
    const c = await common({ ...row, token: onb.token }, cfg);
    const pays = (Array.isArray(lead.payments) ? lead.payments : []).filter(p => p && Number(p.amount) > 0)
      .sort((a, b) => S(b.date).localeCompare(S(a.date)));
    const dep = pays.find(p => !ticked || S(p.date, 10) <= S(ticked, 10)) || pays[0] || null;
    const remaining = Number(lead.dealValue) > 0 ? Number(lead.dealValue) - setupPaid(lead) : 0;
    return { ...lockedIn({ ...c, product: c.view.productLine, deposit: dep ? { amount: Number(dep.amount), method: dep.method, on: dep.date || ticked } : { on: ticked },
      nextAmount: remaining > 0 ? remaining : 0 }), replyTo: cfg.agencyEmail };
  });
}

/* ------------------------------------------------ 3. "Launch Day Ticket" */
const kickoffOf = (lead, now) => {
  const m = (Array.isArray(lead && lead.meetings) ? lead.meetings : [])
    .filter(x => x && (x.mtype === 'Onboarding' || /kick-?off/i.test(S(x.title))) && Date.parse(x.start) > now && x.status !== 'noshow')
    .sort((a, b) => S(a.start).localeCompare(S(b.start)))[0];
  if (!m) return null;
  const d = new Date(m.start), tz = calendarTz();
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(d) + ' · '
    + new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d).replace(':00', '');
};
/** Submitting onboarding sends the client their ticket, once. */
export async function sendTicket(onboardingId, { settings, now = Date.now() } = {}) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  if (!UUID.test(String(onboardingId || ''))) return { ok: false, reason: 'not_found' };
  const st = settings || await readSettings();
  const sw = readSwitches(st).ticket;
  if (!sw.on) return { ok: false, reason: 'switched_off' };
  const rows = await get(`onboardings?id=eq.${onboardingId}&select=id,lead_id,token,status,submitted_at`);
  const onb = Array.isArray(rows) && rows[0];
  if (!onb) return { ok: false, reason: 'not_found' };
  if (onb.status !== 'submitted' || !onb.submitted_at) return { ok: false, reason: 'not_submitted' };
  if (!allowed(sw, localDay(onb.submitted_at, calendarTz()))) return { ok: false, reason: 'before_switched_on' };
  return once(onb.lead_id, 'ticket', onb.id, async () => {
    const row = await rpcRow(onb.token); if (!row) return { skip: 'no_onboarding_row' };
    const cfg = await loadConfig();
    const c = await common({ ...row, token: onb.token }, cfg);
    const lead = await readLead(onb.lead_id);
    const at = kickoffOf(lead, now);
    const L = c.view.launch;
    const ics = L.started && L.target ? launchIcs({ company: c.company, agency: c.agency, target: L.target, uid: `launch-${onb.id}@${(c.base.replace(/^https?:\/\//, '').split('/')[0]) || 'crm'}`, now }) : null;
    const mail = launchTicket({ ...c, productLine: c.view.productLine, launch: L, kickoff: { at, url: cfg.kickoffUrl || null }, crew: c.view.contacts, ics: !!ics });
    return { ...mail, replyTo: cfg.agencyEmail, ...(ics ? { attachments: [{ filename: 'launch-day.ics', content: Buffer.from(ics).toString('base64') }] } : {}) };
  });
}

/* ------------------------------------------------ 2. "We saved your seat" */
async function sendSeat(onb, kind, cfg) {
  return once(onb.lead_id, kind, onb.id, async () => {
    const row = await rpcRow(onb.token); if (!row) return { skip: 'no_onboarding_row' };
    if (row.status === 'submitted') return { skip: 'submitted' };        // they finished between the read and now
    const c = await common({ ...row, token: onb.token }, cfg);
    const ctx = ctxOf(row, row.answers, cfg);
    const p = progress(ctx, row.answers || {}, row.files || [], row.sections || {}, cfg);
    const sec = SECTIONS.find(s => s.id === p.current);
    const nowSec = p.sections.find(s => s.id === p.current);
    const needed = stillNeeded(ctx, row.answers || {}, row.files || [], row.checklist, cfg).filter(x => !x.ok && x.key !== 'deposit').map(x => x.label);
    const asset = needed.find(x => /logo/i.test(x)) ? 'logo' : needed.find(x => /headshot|photo/i.test(x)) ? 'headshot' : null;
    return { ...savedSeat({ ...c, stage: kind, done: p.done, total: p.total, minutesLeft: p.minutesLeft,
      next: sec ? { title: sectionTitle(sec, ctx), minutes: nowSec && nowSec.total ? Math.max(1, Math.round(nowSec.minutes * (1 - nowSec.filled / nowSec.total))) : sec.minutes } : null,
      needed, asset }), replyTo: cfg.agencyEmail };
  });
}

/* ------------------------------------------------------- the daily job */
/** Once a day at 10 AM local. Returns what it did, by name, for the log. */
export async function runDaily(now = Date.now(), { force = false } = {}) {
  const tz = calendarTz();
  if (!force && !isSendHour(now, tz)) return { ok: true, skipped: `not 10 AM in ${tz}` };
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  const st = await readSettings();
  const sw = readSwitches(st);
  const out = { lockedIn: [], seat: [], stall: [], ticket: [], switches: Object.fromEntries(['lockedIn', 'seat', 'stall', 'ticket'].map(k => [k, sw[k].on])) };
  if (!['lockedIn', 'seat', 'stall', 'ticket'].some(k => sw[k].on)) return { ok: true, ...out, skipped: 'every client email is switched off' };
  const claimsRows = await get('client_emails?select=lead_id,kind');
  if (!Array.isArray(claimsRows)) return { ok: false, reason: 'claims_unreadable' };   // fail closed: no record, no sends
  const claimed = new Map();
  for (const r of claimsRows) { if (!claimed.has(r.lead_id)) claimed.set(r.lead_id, new Set()); claimed.get(r.lead_id).add(r.kind); }
  const has = (lead, k) => !!(claimed.get(lead) && claimed.get(lead).has(k));
  const onbs = await get('onboardings?select=id,lead_id,token,status,last_activity_at,submitted_at&order=created_at.desc');
  if (!Array.isArray(onbs)) return { ok: false, reason: 'onboardings_unreadable' };
  const cfg = await loadConfig();

  /* backstop: deposit ticks that did not trigger "You're locked in" */
  if (sw.lockedIn.on) {
    const leads = await get('leads?select=id,data');
    for (const l of Array.isArray(leads) ? leads : []) {
      const t = doneOf(l.data && l.data.onboarding && l.data.onboarding.deposit_paid);
      if (!t || !allowed(sw.lockedIn, t) || has(l.id, 'locked_in')) continue;
      if (!onbs.some(o => o.lead_id === l.id && o.status !== 'submitted')) continue;
      out.lockedIn.push({ lead: l.id, ...(await sendLockedIn(l.id, { settings: st })) });
    }
  }
  const latest = new Map();
  for (const o of onbs) if (!latest.has(o.lead_id)) latest.set(o.lead_id, o);
  for (const o of latest.values()) {
    /* backstop: submits whose ticket did not go out */
    if (sw.ticket.on && o.status === 'submitted' && o.submitted_at && !has(o.lead_id, 'ticket') && allowed(sw.ticket, localDay(o.submitted_at, tz))) {
      out.ticket.push({ lead: o.lead_id, ...(await sendTicket(o.id, { settings: st, now })) });
      continue;
    }
    const kind = reminderDue({ status: o.status, lastActivityAt: o.last_activity_at, submittedAt: o.submitted_at }, now, claimed.get(o.lead_id) || new Set(), sw);
    if (!kind) continue;
    const group = kind === 'stall_10d' ? 'stall' : 'seat';
    if (!allowed(sw[group], localDay(o.last_activity_at, tz))) continue;     // stalled since before it was switched on
    if (kind === 'stall_10d') {
      const row = await rpcRow(o.token);
      const who = S((row && ((row.answers && row.answers['biz.name']) || row.client_company || row.client_name)) || 'the client', 120);
      const id = await claim(o.lead_id, 'stall_10d', o.id, `Call ${who}: onboarding stalled 10 days`);
      if (id) await settle(id, true);
      out.stall.push({ lead: o.lead_id, ok: !!id, reason: id ? undefined : 'already' });
    } else {
      out.seat.push({ lead: o.lead_id, kind, ...(await sendSeat(o, kind, cfg)) });
    }
  }
  return { ok: true, ...out };
}
