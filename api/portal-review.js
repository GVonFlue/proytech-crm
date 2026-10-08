// The client portal's Review actions (B-2). A CLIENT route: the caller must
// hold a portal session (api/_portal.js clientOf: Supabase Auth says which
// login, Postgres's portal_lead() says which client). The client is never
// taken from the request; every Postgres call below is a service_role-only
// function that finds the lead from the login id itself (review_client).
//
//   submit                      close the open round; "We got your notes" to
//                               them, a note to the owners
//   extra                       after the included rounds, open a QUOTED
//                               change round (Terms 3.4); owners told
//   approve  { name }           "Approve my site": typed name, time, and the
//                               IP and browser THIS server saw; permanent
//   delete   { id }             a DRAFT note, and its files
//   upload   { noteId, kind, ext, bytes }
//                               a signed URL for ONE path the server chose
//   attach   { noteId, kind, path }
//                               after the upload: checked by its bytes, then
//                               recorded on the note
//   files                       five-minute links to this client's own images
//
// Adding a note and editing its comment go straight to Postgres from the
// portal (portal_note_save, which starts from portal_lead()).
import { randomBytes } from 'node:crypto';
import { guard, sweep, ipOf } from './_guard.js';
import { clientOf } from './_portal.js';
import { signUpload, head, remove, signDownloads, REVIEW_BUCKET } from './_storage.js';
import { fileKindOk } from '../src/lib/onboarding.js';
import { rpcAs, get, sendNotesReceived, tellOwners } from './_review.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REVIEW_MAX_BYTES = 10 * 1024 * 1024;
const EXTS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const KINDS = ['shot', 'attach'];
const B = { bucket: REVIEW_BUCKET };
/** The ONE path a file for this note may have: the client's folder, the
 *  note, the kind, 12 random characters. */
export const reviewPath = (leadId, noteId, kind, ext) => `${leadId}/${noteId}-${kind}-${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 12)}.${ext === 'jpeg' ? 'jpg' : ext}`;
const pathFor = (leadId, noteId, kind) => new RegExp(`^${leadId.replace(/[^A-Za-z0-9_-]/g, '')}/${noteId}-${kind}-[A-Za-z0-9]{12}\\.(jpg|png|webp)$`);

const WHY = {
  not_a_client: 'This sign-in is not connected to a client portal.',
  no_open_round: 'There is no open review round right now.',
  empty: 'Leave at least one note first. Happy with everything? Approve your site instead.',
  approved: 'Your site is already approved.',
  open: 'A review round is already open.',
  not_yet: 'Your next included round opens when we send you the next version.',
  name: 'Type your full name to approve.',
  no_preview: 'Your site preview is not ready yet.',
  already: 'Your site is already approved.',
  unsubmitted: 'You have notes that are not submitted yet. Submit them, or delete them, before approving.',
};

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'portal-review', perIp: 120, windowMin: 10, perDay: 5000, maxChars: 1500 });
  if (!gate.ok) return;
  sweep();
  const send = (code, body) => res.status(code).json(body);
  if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only.' });
  const me = await clientOf(req);
  if (!me.ok) return send(401, { ok: false, error: 'Sign in to your portal again.' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(b.action || '');
  const fail = (code, key) => send(code, { ok: false, error: WHY[key] || 'That did not work. Try again.', reason: key });

  try {
    if (action === 'submit') {
      const r = await rpcAs('review_submit', { p_uid: me.uid });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : { error: 'error' };
      if (d.error) return fail(409, d.error);
      const round = { number: d.number, extra: !!d.extra };
      await Promise.all([
        sendNotesReceived(me.uid, d.lead_id, round, d.included, d.notes),
        tellOwners(d.lead_id, `${d.extra ? 'change round' : 'review round'} ${d.number} submitted`, `${d.notes} note${d.notes === 1 ? '' : 's'} to work through${d.extra ? '. This round is beyond the included rounds: send a quote before the work.' : '.'}`),
      ]);
      return send(200, { ok: true, number: d.number, notes: d.notes });
    }
    if (action === 'extra') {
      const r = await rpcAs('review_request_extra', { p_uid: me.uid });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : { error: 'error' };
      if (d.error) return fail(409, d.error);
      await tellOwners(d.lead_id, `asked for change round ${d.number} (quoted)`, `Their ${d.included} included round${d.included === 1 ? ' is' : 's are'} used. They can leave notes now; send a quote before doing the work.`);
      return send(200, { ok: true, number: d.number });
    }
    if (action === 'approve') {
      const name = String(b.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
      const ua = String((req.headers && req.headers['user-agent']) || '').slice(0, 300);
      const r = await rpcAs('review_approve', { p_uid: me.uid, p_name: name, p_ip: ipOf(req), p_ua: ua });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : { error: 'error' };
      if (d.error) return fail(409, d.error);
      await tellOwners(d.lead_id, 'approved their site', `Approved by ${d.typed_name}. Ready to launch.`);
      return send(200, { ok: true, approved_at: d.approved_at });
    }
    if (action === 'delete') {
      const id = String(b.id || '');
      if (!UUID.test(id)) return fail(400, 'bad');
      const r = await rpcAs('review_note_delete', { p_uid: me.uid, p_id: id });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : null;
      if (!d) return send(404, { ok: false, error: 'That note can no longer be deleted.' });
      const files = [d.shot_path, d.attach_path].filter(Boolean);
      if (files.length) await remove(files, B);
      return send(200, { ok: true });
    }
    if (action === 'upload') {
      const noteId = String(b.noteId || ''), kind = String(b.kind || ''), ext = String(b.ext || '').toLowerCase();
      if (!UUID.test(noteId) || !KINDS.includes(kind) || !EXTS[ext]) return send(400, { ok: false, error: 'Only JPG, PNG or WebP images.' });
      if (!(Number(b.bytes) > 0) || Number(b.bytes) > REVIEW_MAX_BYTES) return send(400, { ok: false, error: 'Images up to 10 MB.' });
      const t = await rpcAs('review_upload_target', { p_uid: me.uid, p_note: noteId });
      if (!t.ok || typeof t.data !== 'string' || t.data !== me.leadId) return send(409, { ok: false, error: 'That note can no longer change.' });
      const path = reviewPath(me.leadId, noteId, kind, ext);
      const signed = await signUpload(path, B);
      if (!signed.ok) return send(502, { ok: false, error: 'Could not start that upload. Try again.' });
      return send(200, { ok: true, uploadUrl: signed.url, path, mime: EXTS[ext] });
    }
    if (action === 'attach') {
      const noteId = String(b.noteId || ''), kind = String(b.kind || ''), path = String(b.path || '');
      if (!UUID.test(noteId) || !KINDS.includes(kind) || !pathFor(me.leadId, noteId, kind).test(path)) return send(400, { ok: false, error: 'That upload is not part of this note.' });
      const got = await head(path, 64, B);
      if (!got.ok) return send(404, { ok: false, error: 'We could not find that upload. Try again.' });
      const ext = path.split('.').pop();
      if ((got.size !== null && got.size > REVIEW_MAX_BYTES) || !fileKindOk(ext, got.head)) {
        await remove([path], B);
        return send(400, { ok: false, error: `That file is not really a .${ext} image under 10 MB.` });
      }
      const r = await rpcAs('review_set_file', { p_uid: me.uid, p_note: noteId, p_kind: kind, p_path: path });
      const d = r.ok && r.data && typeof r.data === 'object' ? r.data : { error: 'error' };
      if (d.error) { await remove([path], B); return send(409, { ok: false, error: 'That note can no longer change.' }); }
      if (d.replaced && d.replaced !== path) await remove([d.replaced], B);
      return send(200, { ok: true });
    }
    if (action === 'files') {
      const rows = await get(`review_notes?lead_id=eq.${encodeURIComponent(me.leadId)}&select=id,shot_path,attach_path`);
      const list = Array.isArray(rows) ? rows : [];
      const paths = list.flatMap(n => [n.shot_path, n.attach_path]).filter(Boolean);
      const s = await signDownloads(paths, B);
      const L = s.ok ? s.links : {};
      const links = {};
      for (const n of list) if (n.shot_path || n.attach_path) links[n.id] = { shot: L[n.shot_path] || null, attach: L[n.attach_path] || null };
      return send(200, { ok: true, links });
    }
    return send(400, { ok: false, error: 'Unknown action.' });
  } catch (e) {
    console.error('[portal-review]', String((e && e.message) || e).slice(0, 200));
    return send(502, { ok: false, error: 'Could not reach the server. Try again.' });
  }
}
