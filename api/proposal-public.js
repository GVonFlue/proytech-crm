import { guard, sweep } from './_guard.js';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { appUrl, calendarTz } from './_google.js';
// sendMail() reaches the owners allowlist and nobody else (_mail.js); esc is
// the shared HTML escape.
import { sendMail, sendClientMail, esc } from './_mail.js';
import { inviteAtAcceptance } from './_portal.js';
import { proposalLink, proposalBase } from './proposal-send.js';
// the token rule is defined once, in the shared library the CRM also uses
import { TOKEN_RE, hasLegal, fmtWhen } from '../src/lib/proposal.js';
// the onboarding created at acceptance: its config reader, link builder and
// product mapping are the onboarding portal's own, so the two cannot disagree
import { loadConfig, portalLink } from './onboarding-public.js';
import { productsFor } from '../src/lib/onboarding.js';

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
   handed over only once the proposal is accepted (below); the onboarding link
   is the portal onboarding made for this proposal (portalLinkFor). */
export const PUBLIC_BODY_KEYS = ['client', 'company', 'preparedOn', 'validDays', 'copy', 'quote', 'standard', 'contacts', 'launchDays', 'legal'];
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

/* THE ONBOARDING, CREATED AT ACCEPTANCE. The "You're in" screen's "Start my
   onboarding" button opens the onboarding made for THIS proposal: Postgres
   creates it on first ask and returns the same one after (one per proposal,
   and only for an accepted proposal: onboarding_for_proposal() in
   ONBOARDING-MIGRATION.sql). Products come from the offer's productMap over
   what was accepted. Returns '' when that cannot be done (the migration has
   not run, the database is down), and the caller falls back to the offer's
   static onboarding link, so accepting never fails because of onboarding. */
export async function portalLinkFor(t, row) {
  try {
    const items = (row && row.body && row.body.quote && Array.isArray(row.body.quote.items)) ? row.body.quote.items : [];
    const cfg = await loadConfig();
    const pkg = (items.find(i => i && i.kind === 'package') || items[0] || {}).name || '';
    const got = await rpc('onboarding_for_proposal', { p_token: t, p_products: productsFor(items.map(i => i && i.id), cfg.productMap), p_package: String(pkg).slice(0, 120) });
    const o = got.ok && Array.isArray(got.data) ? got.data[0] : null;
    if (!o || !TOKEN_RE.test(String(o.token || ''))) return '';
    return portalLink(o.client || (row.body && row.body.client), o.token);
  } catch { return ''; }
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
    const view = publicView(row);
    /* a client coming back to an accepted proposal: the same onboarding */
    if (row.status === 'accepted') view.onboardingUrl = (await portalLinkFor(t, row)) || view.onboardingUrl;
    res.status(200).json({ ok: true, proposal: view });
    return;
  }

  // ---- accept ----
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120) { res.status(400).json({ ok: false, error: 'Type your full name to sign.' }); return; }
  if (b.agree !== true) { res.status(400).json({ ok: false, error: 'Tick the box to agree to the terms.' }); return; }
  /* Terms of Service and Privacy Policy: required whenever the proposal shows
     them. Refused here as a courtesy; proposal_accept() refuses it in Postgres
     ('terms_required'), which is the boundary. */
  const needsTerms = hasLegal(row.body);
  if (needsTerms && b.agreeTerms !== true) { res.status(400).json({ ok: false, error: 'Tick the box to agree to the Terms of Service and Privacy Policy.' }); return; }
  const hasPrepay = !!(row.body && row.body.quote && row.body.quote.prepay);
  const plan = b.plan === 'annual' && hasPrepay ? 'annual' : 'monthly';

  const acc = await rpc('proposal_accept', { p_token: t, p_name: name, p_ip: String(gate.ip || '').slice(0, 64), p_plan: plan, p_agreed_terms: b.agreeTerms === true });
  const result = acc.ok ? String(acc.data || '') : 'error';
  let onboardingUrl = (row.body && row.body.onboardingUrl) || '';
  const paymentUrl = (row.body && row.body.paymentUrl) || '';

  if (result === 'accepted' || result === 'already') {
    onboardingUrl = (await portalLinkFor(t, row)) || onboardingUrl;
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
    if (result === 'accepted') {
      const pid = await sendClientCopy(t, row.body, name, plan);
      /* the client's portal login and its invite, from the lead's own email
         (api/_portal.js). Fail-soft: the acceptance stands whatever this does. */
      if (pid) await inviteAtAcceptance(pid, ((row.body || {}).company || {}).name || '');
    }
    res.status(200).json({ ok: true, result, onboardingUrl, paymentUrl });
    return;
  }
  if (result === 'terms_required') { res.status(400).json({ ok: false, error: 'Tick the box to agree to the Terms of Service and Privacy Policy.' }); return; }
  if (result === 'expired') { res.status(410).json({ ok: false, error: 'This proposal has expired. Reply to our email and we will send a fresh one.' }); return; }
  if (result === 'not_found') { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }
  if (result === 'bad_name' || result === 'bad_plan') { res.status(400).json({ ok: false, error: 'Check your name and try again.' }); return; }
  res.status(200).json({ ok: false, error: 'We could not record that just now. Please try again in a moment.' });
}


/* ---- the client's own copy of what they accepted (Terms §18.2) -----------
   Sent once, on a NEW acceptance, through sendClientMail: it takes a proposal
   id and reads the recipient from that proposal's lead itself, so nothing in
   this request can aim it. The time is Postgres's own accepted_at. Fail-soft:
   the acceptance has already happened and stands whatever the mail does. */
async function sendClientCopy(token, body, name, plan) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/proposals?token=eq.${encodeURIComponent(token)}&select=id,accepted_at`, { headers: H() });
    const row = r.ok ? (await r.json())[0] : null;
    if (!row || !row.id) { console.error('[proposal-public] client copy: proposal id not found'); return null; }
    const mail = clientAcceptedEmail({ body, name, plan, acceptedAt: row.accepted_at, link: proposalLink(proposalBase(), token, (body || {}).client), tz: calendarTz() });
    const sent = await sendClientMail({ proposalId: row.id, subject: mail.subject, html: mail.html, text: mail.text, tag: 'proposal-accepted' });
    if (!sent.ok) console.error('[proposal-public] client copy not sent:', sent.reason);
    return row.id;
  } catch (e) { console.error('[proposal-public] client copy failed:', String((e && e.message) || e).slice(0, 200)); return null; }
}

/** "You're in" confirmation for the client: what they accepted, when, the
 *  link back, and the Terms and Privacy Policy (with the version) they agreed
 *  to. Exported so tests read exactly what is sent. */
export function clientAcceptedEmail({ body, name, plan, acceptedAt, link, tz = 'America/Chicago' }) {
  const b = body || {}; const q = b.quote || {}; const cl = b.client || {}; const co = b.company || {}; const lg = b.legal || null;
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const company = cl.company || cl.name || 'your business';
  const bought = (q.items || []).map(i => i.name).filter(Boolean).join(' + ') || 'your build';
  const usd = v => { const n = Number(v) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  const when = fmtWhen(acceptedAt, tz);
  const prepay = plan === 'annual' && q.prepay ? `${q.prepay.months} months up front: ${usd(q.prepay.total)} at launch` : '';
  const rows = [['What you locked in', bought], ['Setup', usd(q.setup)], [`Deposit (${q.depositPct || 50}%)`, `${usd(q.deposit)} due now`],
    ...(Number(q.monthly) ? [['Monthly', `${usd(q.monthly)}/mo from launch`]] : []), ...(prepay ? [['Your plan', prepay]] : []), ['Accepted', `${when} by ${name}`]];
  const subject = `You're in, ${first}. Your proposal is locked in.`;
  const row = ([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#56637F;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;color:#0B1633;font-weight:600">${esc(v)}</td></tr>`;
  const legalHtml = lg ? `<p style="margin:18px 0 0;font-size:13px;color:#56637F">You agreed to our <a href="${esc(lg.termsUrl)}" style="color:#1F6FEB">Terms of Service</a> and <a href="${esc(lg.privacyUrl)}" style="color:#1F6FEB">Privacy Policy</a>, version ${esc(lg.version)}. Keep this email as your copy.</p>` : '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0B1633;max-width:560px">
    <p style="margin:0 0 4px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#1F6FEB">Proposal accepted</p>
    <p style="margin:0 0 10px;font-size:24px;font-weight:700;color:#061431">You're in, ${esc(first)}. Let's grow.</p>
    <p style="margin:0 0 16px">Today's the day ${esc(company)} starts running on a real system. Here's your copy of what you locked in.</p>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${rows.map(row).join('')}</table>
    <p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#FB6926;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">View your proposal</a></p>
    ${legalHtml}
    <p style="margin:18px 0 0;font-size:13px;color:#56637F">${esc(co.name || '')}${co.website ? ' · ' + esc(co.website) : ''}</p>
  </div>`;
  const text = [`You're in, ${first}. Let's grow.`, '', `Today's the day ${company} starts running on a real system. Your copy of what you locked in:`, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '', `View your proposal: ${link}`,
    ...(lg ? ['', `You agreed to our Terms of Service (${lg.termsUrl}) and Privacy Policy (${lg.privacyUrl}), version ${lg.version}.`] : [])].join('\n');
  return { subject, html, text };
}
