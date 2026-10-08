// api/_review.js — the server's half of site review (client portal B-2).
// Underscore prefix => Vercel does not expose this as a route.
//
// The emails a review causes, in one place:
//   - "Your site is ready for review" to EVERY active portal login of the
//     client, when an owner sends a round (api/review-admin.js)
//   - "We got your notes" to the login that submitted (api/portal-review.js)
//   - a short note to the owners on a submitted round, a quoted change round
//     and an approval (sendMail: the owners allowlist, nobody else)
// Client mail goes through sendClientMail({ clientUserId }) ONLY: the address
// is read from that login's client_users row, never from a request. Every
// send is fail-soft: the round, the approval or the note is already saved,
// and a mail that does not go out is logged, never a failed request.

import { SUPA_URL, SUPA_KEY } from './_env.js';
import { portalUrl } from './_portal.js';
import { appUrl } from './_google.js';
import { loadConfig } from './onboarding-public.js';
import { proposalBase } from './proposal-send.js';
import { sendClientMail, sendMail, esc } from './_mail.js';
import { reviewReady, notesReceived, firstName } from './_clientemail-tpl.js';

const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });
const S = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);
export async function get(path) {
  try { const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H() }); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function rpcAs(fn, args) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args || {}) });
    return { ok: r.ok, data: await r.json().catch(() => null) };
  } catch { return { ok: false, data: null }; }
}

/** The portal, opened on Review. The link signs nobody in: a signed-out
 *  client lands on the sign-in page. */
export const reviewLink = () => portalUrl() + '?go=review';

/** What every review email needs, read from the records. */
export async function mailBits(leadId) {
  const enc = encodeURIComponent(leadId);
  const [leads, props, cfg] = await Promise.all([
    get(`leads?id=eq.${enc}&select=data`),
    get(`proposals?lead_id=eq.${enc}&status=eq.accepted&select=body&order=accepted_at.desc.nullslast&limit=1`),
    loadConfig().catch(() => ({})),
  ]);
  const lead = (Array.isArray(leads) && leads[0] && leads[0].data) || {};
  const body = (Array.isArray(props) && props[0] && props[0].body) || {};
  const base = proposalBase();
  const lg = S(cfg && cfg.agencyLogo, 500);
  const logo = /^https:\/\//.test(lg) ? lg : lg.startsWith('/') ? base.replace(/\/+$/, '') + lg : '';
  const contact = Array.isArray(body.contacts) && body.contacts[0] ? body.contacts[0] : null;
  return { agency: (cfg && cfg.agency) || '', logo, base, contact, company: S(lead.company || lead.name, 120) };
}

/** "Your site is ready for review" to every active login of this client.
 *  -> number sent */
export async function sendReviewReady(leadId, round, included) {
  const users = await get(`client_users?lead_id=eq.${encodeURIComponent(leadId)}&active=is.true&select=id,name`);
  if (!Array.isArray(users) || !users.length) return 0;
  const bits = await mailBits(leadId);
  let sent = 0;
  for (const u of users) {
    const mail = reviewReady({ ...bits, first: firstName(u.name), link: reviewLink(), round, included });
    const r = await sendClientMail({ clientUserId: u.id, ...mail, tag: 'review-ready' });
    if (r.ok) sent += 1; else console.error('[review] "ready for review" not sent:', r.reason);
  }
  return sent;
}

/** "We got your notes" to the login that submitted. -> boolean */
export async function sendNotesReceived(uid, leadId, round, included, count) {
  const [users, bits] = await Promise.all([get(`client_users?id=eq.${uid}&select=name`), mailBits(leadId)]);
  const name = Array.isArray(users) && users[0] ? users[0].name : '';
  const mail = notesReceived({ ...bits, first: firstName(name), link: reviewLink(), round, included, count });
  const r = await sendClientMail({ clientUserId: uid, ...mail, tag: 'review-received' });
  if (!r.ok) console.error('[review] "we got your notes" not sent:', r.reason);
  return !!r.ok;
}

/** A short note to the owners (sendMail: NOTIFY_TO and active owners only). */
export async function tellOwners(leadId, subject, line) {
  const bits = await mailBits(leadId).catch(() => ({ company: '' }));
  const who = bits.company || 'A client';
  const crm = appUrl().replace(/\/+$/, '');
  const html = `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B1633">
<p style="margin:0 0 8px;font-weight:700">${esc(who)}: ${esc(subject)}</p><p style="margin:0 0 12px">${esc(line)}</p>
<p style="margin:0;font-size:13px;color:#56637F">Open the client in the CRM → Review tab${crm ? ` (${esc(crm)})` : ''}.</p></div>`;
  const r = await sendMail({ subject: `${who}: ${subject}`, html, tag: 'review-owners' });
  if (!r.ok) console.error('[review] owners not told:', r.reason);
  return !!r.ok;
}
