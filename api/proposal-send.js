import { guard, sweep } from './_guard.js';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { appUrl } from './_google.js';
// sendClientMail() takes a proposal id, not an address: it reads the
// recipient from the proposal's lead itself (_mail.js). clientRecipientFor()
// is the same lookup, used here to refuse BEFORE publishing.
import { sendClientMail, clientRecipientFor, esc } from './_mail.js';
// THE PROPOSAL STANDARD: the same function the review screen calls. The
// screen disables Send; this refuses it. One rule, two callers.
import { readiness, proposalUrl } from '../src/lib/proposal.js';

// api/proposal-send.js — publish a proposal, and optionally email it.
//
// mode 'link'  : publish only (status sent, the validity clock starts), return
//                the link. For walking a client through it on screen.
// mode 'email' : publish, then email the link to THE ADDRESS ON THE LEAD.
//
// THE RECIPIENT IS NOT A PARAMETER. notify.js was hardened so a session could
// not aim mail anywhere (tests/relay.mjs). A proposal must go to an outside
// address, so the rule here is narrower than "owners only" and just as hard:
// sendClientMail() (_mail.js) has no `to` at all. It reads the lead this
// proposal belongs to, with the service key, and sends to the email on that
// record. Nothing in the request body can name a recipient. Owner only,
// rate-limited, and the link is pinned to APP_URL.
//
// PUBLISH BEFORE SEND. If the email fails, the link already works and the
// owner can retry. The other order would email a link to a page that says
// "not found".
//
// RE-SENDING restarts the validity window from now. That is the owner's call
// to make by pressing Send again; an accepted proposal cannot be re-sent.

const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });
const DAY = 864e5;

/* Where client links point. PROPOSAL_URL is the proposals domain (for example
   https://proposals.getproytech.com), which vercel.json locks to the proposal
   paths; unset, links stay on the app's own URL. Only an https URL is taken:
   a typo here would otherwise be emailed to every client. */
export function proposalBase() {
  const p = String(process.env.PROPOSAL_URL || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(p) ? p : appUrl();
}
/* ONE place builds the client link: here. The CRM asks for it (mode 'peek')
   rather than building its own from window.location, which could disagree. */
export function proposalLink(base, token, client) {
  return proposalUrl(base, client, token);
}

/** Plain text from the owner's edited email -> safe HTML paragraphs. */
export function emailHtml({ message, link, until, company }) {
  const paras = String(message || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#14122B;max-width:560px">
    ${paras}
    <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#2B4DE0;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">View your proposal</a></p>
    <p style="margin:0;color:#5E5A7A;font-size:13px">This proposal is good until ${esc(until)}${company ? ` · ${esc(company)}` : ''}.</p>
  </div>`;
}

export default async function handler(req, res) {
  const gate = await guard(req, res, {
    name: 'proposal-send', perIp: 30, windowMin: 10, perDay: 200,
    maxChars: 12000, requireOwner: true,
  });
  if (!gate.ok) return;
  sweep();
  if (!SUPA_URL || !SUPA_KEY) { res.status(200).json({ ok: false, error: 'The server is not connected to the database.' }); return; }

  const b = req.body || {};
  const id = String(b.id || '');
  const mode = b.mode === 'email' ? 'email' : b.mode === 'peek' ? 'peek' : 'link';
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ ok: false, error: 'Save the proposal first.' }); return; }

  const pr = await fetch(`${SUPA_URL}/rest/v1/proposals?id=eq.${id}&select=id,lead_id,token,status,valid_days,body,expires_at`, { headers: H() })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  const p = Array.isArray(pr) ? pr[0] : null;
  if (!p) { res.status(404).json({ ok: false, error: 'That proposal no longer exists.' }); return; }
  /* PEEK: the link of a proposal already published, changing nothing — no
     re-publish, no new validity window, no email. */
  if (mode === 'peek') {
    if (p.status === 'draft') { res.status(200).json({ ok: false, error: 'This proposal has not been published yet.' }); return; }
    res.status(200).json({ ok: true, link: proposalLink(proposalBase(), p.token, (p.body || {}).client), expiresAt: p.expires_at || null });
    return;
  }
  if (p.status === 'accepted') { res.status(200).json({ ok: false, error: 'This proposal is already accepted. Make a new one for a new offer.' }); return; }

  // the recipient: from the record, never from the request. Checked here so a
  // lead with no email refuses BEFORE anything is published; sendClientMail()
  // resolves it again itself at send time.
  let to = '';
  if (mode === 'email') {
    const rc = await clientRecipientFor(p.id);
    if (!rc.ok && rc.reason === 'no_email') { res.status(200).json({ ok: false, error: 'This lead has no valid email on file. Add one to the lead, then send.' }); return; }
    if (!rc.ok) { res.status(404).json({ ok: false, error: 'The lead for this proposal could not be found.' }); return; }
    to = rc.to;
  }

  /* NOT READY, NOT SENT. Checked against the STORED body — the exact snapshot
     the client would see — before anything is published, so a refusal leaves
     the proposal a draft with no validity clock started. `reviewed` is the
     owner's tick for THIS send; a request without it is refused. */
  const ready = readiness(p.body, { mode, leadEmail: to, reviewed: b.reviewed === true });
  if (!ready.ok) {
    const failing = ready.checks.filter(c => !c.ok);
    res.status(200).json({ ok: false, notReady: true, missing: ready.missing,
      error: 'Not ready to send: ' + failing.map(c => c.label.toLowerCase() + (c.detail ? ` (${c.detail})` : '')).join('; ') + '.' });
    return;
  }

  const now = new Date();
  const days = Math.max(1, Math.min(60, Number(p.valid_days) || 7));
  const expiresAt = new Date(now.getTime() + days * DAY).toISOString();
  const patch = { status: p.status === 'viewed' ? 'viewed' : 'sent', sent_at: now.toISOString(), expires_at: expiresAt, updated_at: now.toISOString() };
  if (to) patch.email_to = to;
  const up = await fetch(`${SUPA_URL}/rest/v1/proposals?id=eq.${id}&status=neq.accepted`, {
    method: 'PATCH', headers: { ...H(), prefer: 'return=minimal' }, body: JSON.stringify(patch),
  }).catch(() => null);
  if (!up || !up.ok) { res.status(200).json({ ok: false, error: 'Could not publish the proposal. Nothing was sent.' }); return; }

  const link = proposalLink(proposalBase(), p.token, (p.body || {}).client);
  if (mode === 'link') { res.status(200).json({ ok: true, link, expiresAt }); return; }

  const until = new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const company = p.body && p.body.company && p.body.company.name;
  const subject = String(b.subject || '').trim() || 'Your proposal';
  const message = String(b.message || '').trim();
  if (message.length < 20) { res.status(200).json({ ok: false, error: 'Write the email first.', link, expiresAt }); return; }
  const sent = await sendClientMail({
    proposalId: p.id, subject, replyTo: gate.user && gate.user.email, tag: 'proposal-send',
    html: emailHtml({ message, link, until, company }),
    text: `${message}\n\nView your proposal: ${link}\n\nThis proposal is good until ${until}.`,
  });
  if (!sent.ok) {
    res.status(200).json({ ok: false, error: sent.reason === 'not_configured' ? 'Email is not set up on this install (RESEND_API_KEY / NOTIFY_FROM). The link works; copy it instead.' : 'The email did not go out. The link works; try again or copy it.', link, expiresAt });
    return;
  }
  res.status(200).json({ ok: true, link, expiresAt, to: (sent.to || [])[0] || to });
}
