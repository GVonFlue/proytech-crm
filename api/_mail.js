/* ============================================================================
   _mail.js — the one place mail leaves this domain. Not a route (underscore).

   WHY THIS IS A HELPER AND NOT AN HTTP CALL TO /api/notify

   /api/coffee-book posted to /api/notify over HTTP with no session, and
   notify.js is guard({requireAuth}), so every coffee booking email was a 401
   that the booking's fail-soft catch swallowed. Giving the server a key to
   call its own route, or opening notify.js, would both add a door. Calling the
   send logic in-process adds none: notify.js keeps its auth and calls this,
   and coffee-book calls this directly.

   THE ALLOWLIST IS ENFORCED HERE, NOT BY THE CALLER

   Because more than one caller reaches this, the recipient rule lives inside
   sendMail() and cannot be skipped. A caller may NARROW the list; it cannot
   extend it. The list is built from two sources no rep and no public visitor
   can write (see notify.js for why app_settings is NOT one of them):
     - NOTIFY_TO           a Vercel env var
     - crm_users.email     role='owner' AND active, read with the service key

   Delivery is fail-soft and the allowlist is hard: sendMail() never throws,
   it returns {ok:false, reason} and logs, and a send with no provable
   recipient does not go out.

   CLIENT MAIL IS A SEPARATE FUNCTION, NOT A WIDER sendMail()

   A proposal has to reach a client, who is by definition not on the owners
   allowlist. Widening sendMail() to "any address" would hand that reach to
   every caller, including the public coffee-book route, so client mail is
   its own door: sendClientMail(). It takes a PROPOSAL ID and no address at
   all. The recipient is read here, server-side with the service key, from the
   lead that proposal belongs to (clientRecipientFor). There is no parameter a
   caller could aim, so no route can turn it into a relay, and sendMail()
   below is unchanged: it still reaches the owners and nobody else.

   It also takes an ONBOARDING ID instead (the portal's "email me my link"),
   resolved the same way: onboarding -> its lead -> the email on that lead.
   Exactly one of the two ids; both, or neither, sends nothing.
   ========================================================================== */
import { SUPA_KEY, SUPA_URL } from './_env.js';

const norm = s => String(s == null ? '' : s).trim().toLowerCase();

/** The caller may NARROW the allowlist. It cannot extend it.
 *  An unknown address is dropped, not fatal: one stale entry in
 *  settings.notifyEmails must not silently stop the owners being told. */
export function pickRecipients(asked, allowed) {
  const want = (Array.isArray(asked) ? asked : []).map(norm).filter(e => e.includes('@'));
  if (!want.length) return { to: allowed.slice(), dropped: [] };
  return {
    to: want.filter(e => allowed.includes(e)),
    dropped: want.filter(e => !allowed.includes(e)),
  };
}

/** Active owners' addresses, read with the service key because a rep's own
 *  token cannot see anybody else's crm_users row. Fails to EMPTY, not to open:
 *  NOTIFY_TO still carries the common case, and an install with neither sends
 *  nothing rather than sending wherever it was told to. */
async function ownerEmails() {
  if (!SUPA_URL || !SUPA_KEY) return [];
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/crm_users?role=eq.owner&active=is.true&select=email`,
      { headers: { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` } });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map(u => norm(u && u.email)).filter(e => e.includes('@'));
  } catch {
    return [];
  }
}

/** Every address mail may go to, from sources the caller cannot write. */
export async function allowedRecipients() {
  const envTo = String(process.env.NOTIFY_TO || '').split(',').map(norm).filter(e => e.includes('@'));
  return [...new Set([...envTo, ...(await ownerEmails())])];
}

/** Send one email through Resend to the allowed recipients.
 *  `to` is optional and can only narrow; omit it to reach every allowed address.
 *  `tag` names the caller in the server log. Never throws. */
export async function sendMail({ to, subject, html, tag = 'mail' } = {}) {
  try {
    const RESEND = process.env.RESEND_API_KEY;
    const FROM = process.env.NOTIFY_FROM;
    if (!RESEND || !FROM) return { ok: false, reason: 'not_configured' };

    const allowed = await allowedRecipients();
    if (!allowed.length) {
      console.error(`[${tag}] no allowed recipients: NOTIFY_TO is unset and no active owner has an email on their crm_users row`);
      return { ok: false, reason: 'no_recipients' };
    }
    const picked = pickRecipients(to, allowed);
    if (picked.dropped.length) {
      // Loud on the server, quiet to the caller: the count goes back, never
      // which addresses would have worked.
      console.error(`[${tag}] dropped ${picked.dropped.length} recipient(s) not on the allowlist`);
    }
    if (!picked.to.length) return { ok: false, reason: 'no_recipients', rejected: picked.dropped.length };

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RESEND}` },
      body: JSON.stringify({ from: FROM, to: picked.to, subject: String(subject || ''), html: String(html || '') }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`[${tag}] send failed:`, j.message || j.name || r.status);
      return { ok: false, reason: 'send_failed', detail: j.message || j.name || r.status };
    }
    return { ok: true, id: j.id || null, to: picked.to, rejected: picked.dropped.length };
  } catch (e) {
    const detail = String((e && e.message) || e).slice(0, 200);
    console.error(`[${tag}] send error:`, detail);
    return { ok: false, reason: 'send_error', detail };
  }
}

/* ---- client mail: one proposal, one recipient, read from the record ------ */

export const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
// ONE email rule, shared with the proposal standard (lib/proposal readiness),
// so "the lead has a valid email" means the same thing on screen and here.
import { isEmail } from '../src/lib/proposal.js';
export { isEmail };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The address a proposal may be emailed to: the email on the lead the
 *  proposal belongs to, read with the service key. Returns {ok, to} or
 *  {ok:false, reason}. Never throws, and never takes an address as input. */
export async function clientRecipientFor(proposalId) { return recipientVia('proposals', proposalId); }
/** The same, for an onboarding: the email on the onboarding's lead. */
export async function clientRecipientForOnboarding(onboardingId) { return recipientVia('onboardings', onboardingId); }

/** A client portal login: the email ON ITS OWN client_users row (the
 *  address the login was made for), and only while it is active. */
export async function clientRecipientForPortalUser(clientUserId) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  const id = String(clientUserId || '');
  if (!UUID.test(id)) return { ok: false, reason: 'not_found' };
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/client_users?id=eq.${id}&active=is.true&select=email`, { headers: { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` } });
    const rows = r.ok ? await r.json() : null;
    const to = Array.isArray(rows) && rows[0] ? String(rows[0].email || '').trim() : '';
    if (!to) return { ok: false, reason: 'not_found' };
    if (!isEmail(to)) return { ok: false, reason: 'no_email' };
    return { ok: true, to };
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

/* `table` is one of two literals chosen by the two exports above, never by a
   caller, so it cannot be pointed at another table. */
async function recipientVia(table, rowId) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  if (table !== 'proposals' && table !== 'onboardings') return { ok: false, reason: 'not_found' };
  const id = String(rowId || '');
  if (!UUID.test(id)) return { ok: false, reason: 'not_found' };
  const H = { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` };
  try {
    const pr = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}&select=lead_id`, { headers: H });
    const prow = pr.ok ? await pr.json() : null;
    const leadId = Array.isArray(prow) && prow[0] ? prow[0].lead_id : null;
    if (!leadId) return { ok: false, reason: 'not_found' };
    const lr = await fetch(`${SUPA_URL}/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}&select=data`, { headers: H });
    const lrow = lr.ok ? await lr.json() : null;
    const lead = Array.isArray(lrow) && lrow[0] ? (lrow[0].data || {}) : null;
    if (!lead) return { ok: false, reason: 'no_lead' };
    const to = String(lead.email || '').trim();
    if (!isEmail(to)) return { ok: false, reason: 'no_email' };
    return { ok: true, to };
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

/** Email ONE client: the client of a proposal, of an onboarding, or a client
 *  portal login. There is deliberately no `to`: anything else a caller passes
 *  is ignored, and the recipient is resolved here from the record (the lead's
 *  email, or the portal login's own row). Exactly one id. `replyTo` only sets
 *  where the client's reply goes. Never throws. Used by api/proposal-send.js
 *  (proposalId), api/proposal-public.js (proposalId: the client's copy of
 *  their acceptance; clientUserId: the portal invite), api/onboarding-public.js
 *  (onboardingId), api/portal-login.js and api/portal-admin.js (clientUserId),
 *  and nothing else; tests/clientmail.mjs holds that list. */
export async function sendClientMail({ proposalId, onboardingId, clientUserId, subject, html, text, replyTo, tag = 'client-mail' } = {}) {
  try {
    const RESEND = process.env.RESEND_API_KEY;
    const FROM = process.env.NOTIFY_FROM;
    if (!RESEND || !FROM) return { ok: false, reason: 'not_configured' };
    if ([proposalId, onboardingId, clientUserId].filter(Boolean).length !== 1) return { ok: false, reason: 'not_found' };
    const rc = proposalId ? await clientRecipientFor(proposalId) : onboardingId ? await clientRecipientForOnboarding(onboardingId) : await clientRecipientForPortalUser(clientUserId);
    if (!rc.ok) return { ok: false, reason: rc.reason };
    const payload = { from: FROM, to: [rc.to], subject: String(subject || '').slice(0, 200), html: String(html || '') };
    if (text) payload.text = String(text);
    if (replyTo && isEmail(replyTo)) payload.reply_to = String(replyTo).trim();
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RESEND}` },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`[${tag}] send failed:`, j.message || j.name || r.status);
      return { ok: false, reason: 'send_failed', detail: j.message || j.name || r.status };
    }
    return { ok: true, id: j.id || null, to: [rc.to] };
  } catch (e) {
    const detail = String((e && e.message) || e).slice(0, 200);
    console.error(`[${tag}] send error:`, detail);
    return { ok: false, reason: 'send_error', detail };
  }
}
