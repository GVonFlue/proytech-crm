/* ============================================================================
   POST /api/notify — tells the owners something happened.
   Two events: a rep converted a lead to a client, and a rep BOOKED A CALL.
   The second is the urgent one — a conversion can wait until morning, a demo
   at ten cannot — and it carries everything SOP-03 has the rep texting Logan.

   TWO SEPARATE PROBLEMS WERE FIXED HERE, AND THE SECOND IS THE REAL ONE.

   1. No session. Anyone who knew the path could send mail from a domain you
      verified in Resend. guard({requireAuth}) closes that.

   2. A SESSION DOES NOT CONSTRAIN THE RECIPIENT. `to` came off the request
      body and was used as-is — the old comment here said "whatever is sent is
      used" as though it were a feature. Guarding alone would have narrowed an
      open relay to a relay any signed-in rep could aim anywhere, which is not
      a fix: the damage is your sending domain's reputation, and it does not
      matter whose session sent the mail that got you blacklisted.

   So the recipient is now decided SERVER-SIDE. The caller may narrow the list;
   it cannot extend it.

   WHERE THE ALLOWLIST COMES FROM, AND WHY NOT FROM SETTINGS

   The obvious source is settings.notifyEmails, which is what the app sends.
   It is the wrong source: app_settings is writable by ANY listed user
   (MIGRATION.sql, settings_write → crm_listed()), so a rep can set it to
   whatever they like and the "allowlist" checks a value the attacker controls.

   Both real sources are ones a rep cannot touch:
     - NOTIFY_TO           a Vercel env var, owner-only by construction
     - crm_users.email     for role='owner' AND active — crm_users is
                           owner-managed (users_manage → is_owner())

   settings.notifyEmails still works exactly as before for any address that is
   on that list. An address that is not is dropped, and the drop is logged.

   Deliberately fail-soft on DELIVERY. If RESEND_API_KEY isn't set this returns
   {ok:false, reason:'not_configured'} and the app carries on — the in-app
   "Awaiting onboarding" queue is the source of truth either way. An email
   provider being down must never break a conversion. Note the asymmetry: the
   provider failing is soft, the allowlist failing is hard. A send with no
   provable recipient does not go out.

   Vercel → Settings → Environment Variables:
     RESEND_API_KEY   re_...            (from resend.com)
     NOTIFY_FROM      "ProyTech CRM <crm@getproytech.com>"   — the domain must
                      be verified in Resend, or delivery fails
     NOTIFY_TO        garrett@…,logan@…  (comma separated) — the default
                      recipients AND part of the allowlist above
     APP_URL          https://…          — the only origin a link may point at.
                      Shared with the Google flow; api/_google.js holds the
                      default if it is unset.
   ========================================================================== */
import { supaKey, supaUrl } from '@getproytech/core/env';
import { guard, sweep } from '@getproytech/core/guard';
// appUrl(), not a second copy of the app's URL and its fallback. Two spellings
// of "where this app lives" drift, and the one that drifts here silently drops
// the only link in the email.
import { appUrl } from './_google.js';


const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const usd = v => '$' + Math.round(Number(v) || 0).toLocaleString();
const norm = s => String(s == null ? '' : s).trim().toLowerCase();

/** The caller may NARROW the allowlist. It cannot extend it.
 *
 *  Exported so the rule is tested for what it does rather than matched for how
 *  it is spelled — same reason sheet-read.js exports sheetIdFrom.
 *
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

/** The link is an anchor in mail leaving a domain you verified, so it is pinned
 *  to the app's own origin rather than to "starts with http". Anything else
 *  falls back to the app URL — the button says "Open the CRM", so a link that
 *  goes anywhere else was never correct, whoever sent it. */
export function safeLink(wanted, app) {
  const APP = String(app || '').replace(/\/+$/, '');
  const w = typeof wanted === 'string' ? wanted.trim() : '';
  return (APP && w && (w === APP || w.startsWith(APP + '/'))) ? w : APP;
}

/** Active owners' addresses, read with the service key because a rep's own
 *  token cannot see anybody else's crm_users row. */
async function ownerEmails() {
  if (!supaUrl() || !supaKey()) return [];
  try {
    const r = await fetch(
      `${supaUrl()}/rest/v1/crm_users?role=eq.owner&active=is.true&select=email`,
      { headers: { apikey: supaKey(), authorization: `Bearer ${supaKey()}` } });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map(u => norm(u && u.email)).filter(e => e.includes('@'));
  } catch {
    // Fails to EMPTY, not to open. NOTIFY_TO below still carries the common
    // case, and an install with neither sends nothing rather than sending
    // wherever it was told to.
    return [];
  }
}

export default async function handler(req, res) {
  // Signed-in only. Small body — a name, a client, a link. perDay is a real
  // ceiling on how much mail can leave this domain in a day, which is the
  // number that matters if something ever does go wrong here.
  const gate = await guard(req, res, {
    name: 'notify', perIp: 20, windowMin: 10, perDay: 300,
    maxChars: 4000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();

  const RESEND = process.env.RESEND_API_KEY;
  const FROM = process.env.NOTIFY_FROM;
  if (!RESEND || !FROM) return res.status(200).json({ ok: false, reason: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // --- the allowlist. Built here, from sources the caller cannot write. -----
  const envTo = String(process.env.NOTIFY_TO || '').split(',').map(norm).filter(e => e.includes('@'));
  const allowed = [...new Set([...envTo, ...(await ownerEmails())])];
  if (!allowed.length) {
    console.error('[notify] no allowed recipients: NOTIFY_TO is unset and no active owner has an email on their crm_users row');
    return res.status(200).json({ ok: false, reason: 'no_recipients' });
  }

  const { to, dropped } = pickRecipients(body.to, allowed);
  if (dropped.length) {
    // Loud on the server, quiet to the caller — same posture as guard()'s
    // daily cap. The count goes back so a client can say "2 addresses were
    // skipped" without being told which addresses would have worked.
    console.error(`[notify] dropped ${dropped.length} recipient(s) not on the allowlist`);
  }
  if (!to.length) return res.status(200).json({ ok: false, reason: 'no_recipients', rejected: dropped.length });

  const kind = body.kind || 'conversion';
  const rep = esc(String(body.rep || 'A rep').slice(0, 120));
  const client = esc(String(body.client || 'a client').slice(0, 120));
  const when = esc(String(body.when || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).slice(0, 60));

  const link = safeLink(body.link, appUrl());

  /* ---- a booked call ------------------------------------------------------

     THE MOST TIME-CRITICAL THING A REP PRODUCES, and until now nothing told
     anybody. notify.js fired on conversion only, which is the LEAST urgent of
     the two: a conversion can wait until morning, a demo at ten cannot.

     SOP-03 has the rep texting Logan within ten minutes — business name,
     contact, phone, email, the time, industry, and the five things — because
     Logan builds their site in the half hour before the call and cannot start
     until it lands. This email carries all of it, so the text is a courtesy
     rather than the only copy.

     EVERY FIELD COMES FROM THE RECORD. The composer refuses to save a BK
     without them (dispErr in LeadView), which is what makes it safe to send
     this without checking whether it is complete. */
  if (kind === 'booked') {
    const b = body.brief && typeof body.brief === 'object' ? body.brief : {};
    const F = v => esc(String(v == null ? '' : v).slice(0, 400));
    const row = (label, v, fallback) => {
      const val = F(v) || (fallback ? `<i style="color:#A6A2BC">${esc(fallback)}</i>` : '');
      return val ? `<tr><td style="padding:6px 14px 6px 0;color:#8E89A8;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0;color:#181530">${val}</td></tr>` : '';
    };
    const subj = `${rep} booked ${F(b.company) || client}${b.when ? ` — ${F(b.when)}` : ''}`;
    const html2 = `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;color:#181530;line-height:1.5">
      <p style="margin:0 0 4px;font-size:17px;font-weight:600">Booked call</p>
      <p style="margin:0 0 16px;color:#56527a"><b>${rep}</b> booked <b>${F(b.company) || client}</b>.</p>
      <table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">
        ${row('When', b.when)}
        ${row('Contact', b.contact)}
        ${row('Phone', b.phone)}
        ${row('Email', b.email)}
        ${row('Industry', b.industry)}
      </table>
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#8E89A8;text-transform:uppercase">What they asked for</p>
      <table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">
        ${row('Name as written', b.nameAsWritten)}
        ${row('Current site', b.website, 'not captured')}
        ${row('Wants calls for', b.wants)}
        ${row('Works', b.area)}
        ${row('Photos', b.photos)}
      </table>
      ${link ? `<p style="margin:0"><a href="${esc(link)}" style="color:#2B4DE0">Open the lead</a></p>` : ''}
    </div>`;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${RESEND}` },
        body: JSON.stringify({ from: FROM, to, subject: subj, html: html2 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(200).json({ ok: false, reason: 'send_failed', detail: j.message || j.name || r.status });
      return res.status(200).json({ ok: true, id: j.id || null, to, rejected: dropped.length });
    } catch (e) {
      return res.status(200).json({ ok: false, reason: 'send_error', detail: String((e && e.message) || e).slice(0, 200) });
    }
  }

  const subject = kind === 'conversion'
    ? `${rep} converted ${client}`
    : `ProyTech CRM — ${esc(String(kind).slice(0, 60))}`;

  const lines = [`<p style="margin:0 0 12px"><b>${rep}</b> converted <b>${client}</b> on ${when}.</p>`];
  if (body.amount != null) lines.push(`<p style="margin:0 0 12px;color:#56527a">Commission pending: ${usd(body.amount)} — approve it in the CRM when the money lands.</p>`);
  lines.push('<p style="margin:0 0 12px;color:#56527a">It\'s in <b>Awaiting onboarding</b> on your dashboard.</p>');
  if (link) lines.push(`<p style="margin:0"><a href="${esc(link)}" style="color:#2B4DE0">Open the CRM</a></p>`);

  const html = `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;color:#181530;line-height:1.5">
    <p style="margin:0 0 14px;font-size:17px;font-weight:600">New client converted</p>${lines.join('')}
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${RESEND}` },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'send_failed', detail: j.message || j.name || r.status });
    return res.status(200).json({ ok: true, id: j.id || null, to, rejected: dropped.length });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'send_failed', detail: String(e.message || e) });
  }
}
