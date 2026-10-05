import { guard, sweep } from './_guard.js';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { appUrl } from './_google.js';
// sendMail() reaches the owners allowlist and nobody else (_mail.js); esc is
// the shared HTML escape.
import { sendMail, esc } from './_mail.js';
// the token rule is defined once, in the shared library the CRM also uses
import { TOKEN_RE } from '../src/lib/proposal.js';

// api/proposal-public.js — the ONLY way in for someone without a login.
//
// NO SESSION, BY DESIGN: the client opening their proposal has no account.
// What stands in for one is the token: 256 random bits in the link's #
// fragment (never in a URL the server logs), checked here against a strict
// shape and then against the database.
//
// WHAT IT CAN READ: one proposal, the one the token names, and only through
// the security-definer function proposal_public(), which returns named
// columns and refuses drafts. Then THIS file picks the display fields again
// by name (PUBLIC_BODY_KEYS), so a field added to the body later is not
// published by accident. The raw meeting notes are a separate column that
// no public function returns at all.
//
// WHAT IT CAN WRITE: first-viewed time, and an acceptance. Both go through
// security-definer functions whose rules (published, not expired, not already
// accepted, a name, a known plan) are enforced IN POSTGRES, so nothing about
// this page or a hand-made request can skip them.
//
// IT NEVER TOUCHES A LEAD. The CRM applies an acceptance to the lead itself,
// through the owner's normal save path (lib/proposal acceptancePatch), because
// leads are whole-record JSON and a server write would race the owner's open
// screen (ENGINEERING §3).
//
// One answer for "malformed", "unknown" and "draft", so the endpoint cannot
// be used to learn which tokens exist.

export { TOKEN_RE };
/* contacts: the point(s) of contact chosen for THIS proposal (name, phone,
   email), frozen at send — never the offer's whole list. launchDays: for the
   "You're in" screen. The onboarding and payment links are NOT here: they are
   handed over only once the proposal is accepted (below). */
export const PUBLIC_BODY_KEYS = ['client', 'company', 'preparedOn', 'validDays', 'copy', 'quote', 'standard', 'contacts', 'launchDays'];
const NOT_FOUND = 'This proposal link is not valid. Ask us for a fresh one.';
const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });

async function rpc(fn, args) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args) });
    if (!r.ok) return { ok: false };
    return { ok: true, data: await r.json().catch(() => null) };
  } catch { return { ok: false }; }
}

/** The display fields, picked by name. Exported so the test proves it. */
export function publicView(row) {
  const body = (row && row.body) || {};
  const out = {};
  for (const k of PUBLIC_BODY_KEYS) if (body[k] !== undefined) out[k] = body[k];
  const exp = Date.parse(row && row.expires_at);
  return {
    status: row.status, body: out,
    expiresAt: row.expires_at || null,
    expired: row.status !== 'accepted' && (!Number.isFinite(exp) || Date.now() > exp),
    acceptedAt: row.accepted_at || null, acceptedName: row.accepted_name || null, acceptedPlan: row.accepted_plan || null,
    /* only after acceptance: where to go next, for a client who comes back */
    ...(row.status === 'accepted' ? { onboardingUrl: body.onboardingUrl || '', paymentUrl: body.paymentUrl || '' } : {}),
  };
}

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'proposal-public', perIp: 60, windowMin: 10, perDay: 5000, maxChars: 2000 });
  if (!gate.ok) return;
  sweep();
  if (!SUPA_URL || !SUPA_KEY) { res.status(503).json({ ok: false, error: 'Proposals are not available right now.' }); return; }

  const b = req.body || {};
  const t = String(b.t || '');
  if (!TOKEN_RE.test(t)) { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }

  const got = await rpc('proposal_public', { p_token: t });
  const row = got.ok && Array.isArray(got.data) ? got.data[0] : null;
  if (!row) { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }

  if (b.action !== 'accept') {
    if (row.status === 'sent' || row.status === 'viewed') rpc('proposal_mark_viewed', { p_token: t });
    res.status(200).json({ ok: true, proposal: publicView(row) });
    return;
  }

  // ---- accept ----
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120) { res.status(400).json({ ok: false, error: 'Type your full name to sign.' }); return; }
  if (b.agree !== true) { res.status(400).json({ ok: false, error: 'Tick the box to agree to the terms.' }); return; }
  const hasPrepay = !!(row.body && row.body.quote && row.body.quote.prepay);
  const plan = b.plan === 'annual' && hasPrepay ? 'annual' : 'monthly';

  const acc = await rpc('proposal_accept', { p_token: t, p_name: name, p_ip: String(gate.ip || '').slice(0, 64), p_plan: plan });
  const result = acc.ok ? String(acc.data || '') : 'error';
  const onboardingUrl = (row.body && row.body.onboardingUrl) || '';
  const paymentUrl = (row.body && row.body.paymentUrl) || '';

  if (result === 'accepted' || result === 'already') {
    if (result === 'accepted') {
      // Owners only: sendMail() with no `to` IS the owners allowlist, the same
      // call notify.js and coffee-book.js make. Soft: a mail failure must not
      // undo an acceptance the client just made.
      const q = (row.body && row.body.quote) || {}; const cl = (row.body && row.body.client) || {};
      const who = esc(cl.company || cl.name || 'A client');
      const usd = v => '$' + (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
      await sendMail({
        tag: 'proposal-public', subject: `${cl.company || cl.name || 'A client'} accepted their proposal`,
        html: `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;color:#14122B;line-height:1.5">
          <p style="margin:0 0 6px;font-size:17px;font-weight:600">Proposal accepted</p>
          <p style="margin:0 0 12px"><b>${esc(name)}</b> accepted the proposal for <b>${who}</b>${plan === 'annual' ? ', choosing the prepay' : ''}.</p>
          <p style="margin:0 0 12px">Setup ${usd(q.setup)} · deposit due ${usd(q.deposit)}${Number(q.monthly) ? ` · ${usd(q.monthly)}/mo from launch` : ''}</p>
          <p style="margin:0 0 12px"><b>Next: send the deposit payment link.</b></p>
          <p style="margin:0"><a href="${esc(appUrl())}" style="color:#2B4DE0">Open the CRM</a></p></div>`,
      });
    }
    res.status(200).json({ ok: true, result, onboardingUrl, paymentUrl });
    return;
  }
  if (result === 'expired') { res.status(410).json({ ok: false, error: 'This proposal has expired. Reply to our email and we will send a fresh one.' }); return; }
  if (result === 'not_found') { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }
  if (result === 'bad_name' || result === 'bad_plan') { res.status(400).json({ ok: false, error: 'Check your name and try again.' }); return; }
  res.status(200).json({ ok: false, error: 'We could not record that just now. Please try again in a moment.' });
}
