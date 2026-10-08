// The owner's controls for a client's site review (B-2). OWNER ONLY.
//
//   get     { leadId }                  the preview URL, rounds, notes (with
//                                       five-minute image links) and the
//                                       approval record, IP included
//   site    { leadId, url }             save the preview URL; https, and a
//                                       host Settings → Site review allows
//   open    { leadId }                  "Send for review": the next round,
//                                       and the email to every active portal
//                                       login of THIS client
//   status  { noteId, status, reason }  open / done / won't do (a reason is
//                                       required), on a SUBMITTED round only
//   links   { leadId }                  seven-day image links for "Copy
//                                       revision prompt"
//
// Every table here is server-write-only (REVIEW-MIGRATION.sql); what a client
// wrote is frozen in Postgres once their round is submitted, so even this
// route can change only a note's status, reason and done date.
import { guard, sweep } from './_guard.js';
import { SUPA_URL, SUPA_KEY } from './_env.js';
import { signDownloads, REVIEW_BUCKET } from './_storage.js';
import { previewOk, readReview } from '../src/lib/review.js';
import { get, rpcAs, sendReviewReady } from './_review.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD_ID = /^[A-Za-z0-9_-]{1,80}$/;
const STATUSES = ['open', 'done', 'wont_do'];
const H = (extra = {}) => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json', ...extra });
const B = { bucket: REVIEW_BUCKET };
export const PROMPT_LINK_SECONDS = 7 * 24 * 3600;

async function notesOf(leadId) {
  const rows = await get(`review_notes?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=created_at.asc`);
  return Array.isArray(rows) ? rows : [];
}
async function linksFor(notes, expiresIn) {
  const paths = notes.flatMap(n => [n.shot_path, n.attach_path]).filter(Boolean);
  const s = await signDownloads(paths, { ...B, expiresIn });
  const L = s.ok ? s.links : {};
  const out = {};
  for (const n of notes) if (n.shot_path || n.attach_path) out[n.id] = { shot: L[n.shot_path] || null, attach: L[n.attach_path] || null };
  return out;
}

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'review-admin', perIp: 120, windowMin: 10, perDay: 3000, maxChars: 1500, requireOwner: true });
  if (!gate.ok) return;
  sweep();
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(b.action || '');
  const leadId = String(b.leadId || '');
  const send = (code, body) => res.status(code).json(body);
  const needLead = () => { if (!LEAD_ID.test(leadId)) { send(400, { ok: false, error: 'Which client?' }); return false; } return true; };

  try {
    if (action === 'get') {
      if (!needLead()) return;
      const enc = encodeURIComponent(leadId);
      const [st, notes, appr, rounds] = await Promise.all([
        rpcAs('review_state', { p_lead: leadId }),
        notesOf(leadId),
        get(`site_approvals?lead_id=eq.${enc}&select=*`),
        get(`review_rounds?lead_id=eq.${enc}&select=*&order=number.asc`),
      ]);
      const state = st.ok && st.data && typeof st.data === 'object' ? st.data : {};
      return send(200, { ok: true, state, notes, rounds: Array.isArray(rounds) ? rounds : [],
        approval: Array.isArray(appr) && appr[0] ? appr[0] : null, links: await linksFor(notes, 300) });
    }
    if (action === 'site') {
      if (!needLead()) return;
      const rows = await get('app_settings?id=eq.main&select=data');
      const { hosts } = readReview((Array.isArray(rows) && rows[0] && rows[0].data) || {});
      const chk = previewOk(String(b.url || '').trim(), hosts);
      if (!chk.ok) return send(400, { ok: false, error: chk.why === 'host_not_allowed' ? `${chk.host} is not on the allowed preview hosts (Settings → Site review: ${hosts.join(', ')}).` : 'Paste the full https:// preview link.' });
      const lr = await get(`leads?id=eq.${encodeURIComponent(leadId)}&select=id`);
      if (!Array.isArray(lr) || !lr.length) return send(404, { ok: false, error: 'That client was not found.' });
      const r = await fetch(`${SUPA_URL}/rest/v1/review_sites?on_conflict=lead_id`, {
        method: 'POST', headers: H({ prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ lead_id: leadId, preview_url: chk.url, updated_at: new Date().toISOString(), updated_by: (gate.user && gate.user.id) || null }),
      });
      return send(r.ok ? 200 : 502, r.ok ? { ok: true, url: chk.url } : { ok: false, error: 'Could not save the preview link.' });
    }
    if (action === 'open') {
      if (!needLead()) return;
      const r = await rpcAs('review_open_round', { p_lead: leadId });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : { error: 'error' };
      const why = { no_lead: 'That client was not found.', no_preview: 'Save the preview link first.', approved: 'They already approved the site.', open: 'A round is already open: they are reviewing now.' };
      if (d.error) return send(409, { ok: false, error: why[d.error] || 'Could not open a round.' });
      const sent = await sendReviewReady(leadId, { number: d.number, extra: !!d.extra }, d.included);
      return send(200, { ok: true, number: d.number, extra: !!d.extra, included: d.included, emailed: sent });
    }
    if (action === 'status') {
      const noteId = String(b.noteId || ''), status = String(b.status || ''), reason = String(b.reason || '').trim().slice(0, 500);
      if (!UUID.test(noteId) || !STATUSES.includes(status)) return send(400, { ok: false, error: 'Which note, and which status?' });
      if (status === 'wont_do' && !reason) return send(400, { ok: false, error: "Say why it won't be done: the client sees the reason." });
      const rows = await get(`review_notes?id=eq.${noteId}&select=id,round_id,review_rounds(submitted_at)`);
      const n = Array.isArray(rows) ? rows[0] : null;
      if (!n) return send(404, { ok: false, error: 'Note not found.' });
      if (!(n.review_rounds && n.review_rounds.submitted_at)) return send(409, { ok: false, error: 'That round is still open: the client is still writing it.' });
      const r = await fetch(`${SUPA_URL}/rest/v1/review_notes?id=eq.${noteId}`, {
        method: 'PATCH', headers: H({ prefer: 'return=minimal' }),
        body: JSON.stringify({ status, reason: status === 'wont_do' ? reason : '', done_at: status === 'open' ? null : new Date().toISOString() }),
      });
      return send(r.ok ? 200 : 502, r.ok ? { ok: true } : { ok: false, error: 'Could not save that.' });
    }
    if (action === 'links') {
      if (!needLead()) return;
      return send(200, { ok: true, links: await linksFor(await notesOf(leadId), PROMPT_LINK_SECONDS) });
    }
    return send(400, { ok: false, error: 'Unknown action.' });
  } catch (e) {
    console.error('[review-admin]', String((e && e.message) || e).slice(0, 200));
    return send(502, { ok: false, error: 'Could not reach Supabase.' });
  }
}
