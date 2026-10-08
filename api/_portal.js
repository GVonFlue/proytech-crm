/* ============================================================================
   _portal.js — the server's half of the client portal (B-1).

   Every door into a client's account is here, so the rules are in one place:

   - A LINK, never a password. linkFor() asks Supabase's admin API for a
     magic link (an "invite" the first time, which also creates the login);
     Supabase never sends anything itself. We email the link through
     sendClientMail({ clientUserId }), whose recipient is read from the
     client_users row, never from a request.
   - The link lands on the portal and nowhere else: redirect_to is fixed here
     (PORTAL_URL, else APP_URL + /portal), never taken from the caller.
   - Sign-ups stay OFF on the project. These admin calls are how a client
     login is made, and only for an address on a lead (at acceptance) or one
     an owner typed (api/portal-admin.js).
   - The tie between a login and a lead is made in Postgres, by
     portal_link_client(), which refuses a CRM user and refuses to move a
     login from one client to another.
   ============================================================================ */
import { SUPA_URL, SUPA_KEY } from './_env.js';
import { appUrl } from './_google.js';
import { sendClientMail, esc } from './_mail.js';

const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The CLIENT behind a request (B-2): the bearer token is checked by Supabase
 * Auth (which login) AND, with that same token, by Postgres's portal_lead()
 * (which client, if any: an active client login, never a CRM user). Both or
 * nothing; any failure is "no". The lead comes from the session, never from
 * the request body. -> { ok, uid, leadId }
 */
export async function clientOf(req) {
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(String((req && req.headers && req.headers.authorization) || ''));
  if (!m || !SUPA_URL || !SUPA_KEY) return { ok: false };
  const token = m[1];
  try {
    const u = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, authorization: `Bearer ${token}` } });
    if (!u.ok) return { ok: false };
    const uj = await u.json().catch(() => null);
    const uid = uj && uj.id;
    if (!UUID.test(String(uid || ''))) return { ok: false };
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/portal_lead`, { method: 'POST', headers: { apikey: SUPA_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    if (!r.ok) return { ok: false };
    const lead = await r.json().catch(() => null);
    if (typeof lead !== 'string' || !lead) return { ok: false };
    return { ok: true, uid, leadId: lead };
  } catch { return { ok: false }; }
}

/** Where every magic link lands. Fixed by the server. */
export function portalUrl() {
  const p = String(process.env.PORTAL_URL || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9/_-]*)?$/i.test(p) ? p : appUrl().replace(/\/+$/, '') + '/portal';
}

export async function rpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args || {}) });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, data };
}

/** A sign-in link for this email. kind 'invite' makes the login if it does
 *  not exist yet; an existing login gets a plain magic link instead. Returns
 *  { ok, link, uid } or { ok:false, reason }. */
export async function linkFor(email, kind = 'magiclink') {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  const go = async type => {
    const r = await fetch(`${SUPA_URL}/auth/v1/admin/generate_link`, {
      method: 'POST', headers: H(), body: JSON.stringify({ type, email, redirect_to: portalUrl() }),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };
  try {
    let { r, j } = await go(kind);
    /* invite on an address that already has a login: fall back to a magic link */
    if (!r.ok && kind === 'invite' && (r.status === 422 || /already/i.test(String(j.msg || j.message || '')))) ({ r, j } = await go('magiclink'));
    if (!r.ok) return { ok: false, reason: 'link_failed', detail: String(j.msg || j.message || r.status).slice(0, 160) };
    const link = j.action_link || (j.properties && j.properties.action_link) || '';
    const uid = j.id || (j.user && j.user.id) || null;
    if (!/^https:\/\//.test(link) || !uid) return { ok: false, reason: 'link_failed' };
    return { ok: true, link, uid };
  } catch (e) {
    return { ok: false, reason: 'link_error', detail: String((e && e.message) || e).slice(0, 160) };
  }
}

const shell = (title, lead, button, link, foot) => `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B1633;max-width:560px">
  <p style="margin:0 0 4px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1F6FEB">Client portal</p>
  <p style="margin:0 0 10px;font-size:24px;font-weight:700;color:#061431">${esc(title)}</p>
  <p style="margin:0 0 16px">${lead}</p>
  <p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#CC4A0A;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(button)}</a></p>
  <p style="margin:18px 0 0;font-size:13px;color:#56637F">${foot}</p></div>`;

/** "Your portal is ready": the first email, at acceptance or an owner's invite. */
export function inviteEmail({ name, company, agency, link }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const subject = `Your ${agency || 'client'} portal is ready`;
  const lead = `Hi ${esc(first)}, everything about ${esc(company || 'your build')} now lives in one place: where it stands, the date it launches, what we need from you, and the proposal you accepted.`;
  return { subject, html: shell(`Your portal is ready, ${first}.`, lead, 'Open my portal', link, 'This button signs you in. It works once and expires soon; you can always ask for a new one on the sign-in page. No password needed, ever.'),
    text: `Your portal is ready, ${first}.\n\n${company || 'Your build'}: where it stands, the launch date, what we need from you, and your proposal.\n\nOpen your portal (this link signs you in, works once, expires soon):\n${link}` };
}
/** "Your sign-in link", when they ask on the sign-in page. */
export function signInEmail({ link }) {
  return { subject: 'Your sign-in link',
    html: shell('Here is your sign-in link.', 'Tap the button to open your portal.', 'Sign in', link, 'It works once and expires soon. If you did not ask for this, ignore it: nobody can sign in without this email.'),
    text: `Your sign-in link (works once, expires soon):\n${link}\n\nIf you did not ask for this, ignore it.` };
}

/**
 * At acceptance (proposal-public.js): make the client's portal login and send
 * the invite. Fail-soft and idempotent:
 *   - the address is the lead's own (portal_invite_target), never the request's
 *   - a lead that already has an active portal login gets nothing new
 *   - a CRM user's email, or one already tied to a different client, is
 *     refused by portal_link_client and only logged
 */
export async function inviteAtAcceptance(proposalId, agency) {
  try {
    const t = await rpc('portal_invite_target', { p_proposal_id: proposalId });
    const row = t.ok && Array.isArray(t.data) ? t.data[0] : null;
    if (!row || !row.email) { console.error('[portal] invite: the lead has no usable email'); return { ok: false, reason: 'no_email' }; }
    if (row.client_user_id) return { ok: true, reason: 'already' };
    const l = await linkFor(row.email, 'invite');
    if (!l.ok) { console.error('[portal] invite link:', l.reason, l.detail || ''); return l; }
    const linked = await rpc('portal_link_client', { p_uid: l.uid, p_lead_id: row.lead_id, p_name: row.name, p_invited_by: null });
    if (!linked.ok || linked.data !== 'linked') { console.error('[portal] link refused:', linked.data); return { ok: false, reason: String(linked.data || 'link_refused') }; }
    const company = row.company || '';
    const mail = inviteEmail({ name: row.name, company, agency, link: l.link });
    const sent = await sendClientMail({ clientUserId: l.uid, ...mail, tag: 'portal-invite' });
    if (!sent.ok) console.error('[portal] invite not sent:', sent.reason);
    return { ok: !!sent.ok, uid: l.uid };
  } catch (e) {
    console.error('[portal] invite failed:', String((e && e.message) || e).slice(0, 200));
    return { ok: false, reason: 'error' };
  }
}
