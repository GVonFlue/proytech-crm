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
