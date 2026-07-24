/* ============================================================================
   POST /api/notify — tells the owners something happened.
   Currently one event: a rep converted a lead to a client.

   Deliberately fail-soft. If RESEND_API_KEY isn't set, this returns
   {ok:false, reason:'not_configured'} and the app carries on — the in-app
   "Awaiting onboarding" queue is the source of truth either way. An email
   provider being down must never break a conversion.

   Vercel → Settings → Environment Variables:
     RESEND_API_KEY   re_...            (from resend.com)
     NOTIFY_FROM      "ProyTech CRM <crm@getproytech.com>"   — the domain must
                      be verified in Resend, or delivery fails
     NOTIFY_TO        garrett@…,logan@…  (comma separated; the app can also
                      pass recipients, and they're intersected with nothing —
                      whatever is sent is used, this is just the default)
   ========================================================================== */

const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const usd = v => '$' + Math.round(Number(v) || 0).toLocaleString();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const KEY = process.env.RESEND_API_KEY;
  const FROM = process.env.NOTIFY_FROM;
  if (!KEY || !FROM) return res.status(200).json({ ok: false, reason: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const to = (Array.isArray(body.to) && body.to.length ? body.to : String(process.env.NOTIFY_TO || '').split(','))
    .map(s => String(s).trim()).filter(s => s.includes('@'));
  if (!to.length) return res.status(200).json({ ok: false, reason: 'no_recipients' });

  const kind = body.kind || 'conversion';
  const rep = esc(body.rep || 'A rep');
  const client = esc(body.client || 'a client');
  const when = esc(body.when || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const link = typeof body.link === 'string' && /^https?:\/\//.test(body.link) ? body.link : '';

  const subject = kind === 'conversion'
    ? `${rep} converted ${client}`
    : `ProyTech CRM — ${esc(kind)}`;

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
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'send_failed', detail: j.message || j.name || r.status });
    return res.status(200).json({ ok: true, id: j.id || null, to });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'send_failed', detail: String(e.message || e) });
  }
}
