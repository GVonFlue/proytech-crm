import { guard, sweep } from './_guard.js';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { signDownloads, remove } from './_storage.js';
// the client link's base is built in ONE place, proposal-send.js
import { proposalBase } from './proposal-send.js';
import { clientSlug } from '../src/lib/proposal.js';
import { onboardingUrl } from '../src/lib/onboarding.js';

// api/onboarding-admin.js — what an OWNER needs from the onboarding that the
// browser cannot do under RLS.
//
// The owner reads and edits onboardings and their file rows directly, under
// the owner-only policies (ONBOARDING-MIGRATION.sql). Three things need the
// service key, so they live here, behind requireOwner (crm_whoami with the
// caller's own token; a rep is refused 403 and never reaches the database):
//
//   files    five-minute signed links to every checked file of one
//            onboarding. Sensitive files (EIN letters, insurance, contact
//            lists) and SVGs are links that DOWNLOAD, never render inline.
//   link     the client's portal link, built in one place (the same base as
//            proposal links), so the CRM never builds its own from
//            window.location and disagrees.
//   delete   the onboarding, its file rows (cascade) AND its objects in
//            Storage. Deleting the row from the browser would leave the
//            files behind with nothing pointing at them.

const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const get = async path => {
  try { const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H() }); return r.ok ? await r.json() : null; } catch { return null; }
};

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'onboarding-admin', perIp: 120, windowMin: 10, perDay: 3000, maxChars: 2000, requireOwner: true });
  if (!gate.ok) return;
  sweep();
  if (!SUPA_URL || !SUPA_KEY) { res.status(200).json({ ok: false, error: 'The server is not connected to the database.' }); return; }
  const b = req.body || {};
  const id = String(b.id || '');
  if (!UUID.test(id)) { res.status(400).json({ ok: false, error: 'Pick an onboarding first.' }); return; }

  if (b.action === 'files') {
    const rows = await get(`onboarding_files?onboarding_id=eq.${id}&state=eq.ok&select=id,slot,path,original_name,mime,bytes,sensitive,created_at&order=created_at.asc`);
    if (!Array.isArray(rows)) { res.status(200).json({ ok: false, error: 'Could not read the files.' }); return; }
    const download = {};
    for (const f of rows) if (f.sensitive || /svg/.test(f.mime || '') || !/^image\//.test(f.mime || '')) download[f.path] = f.original_name || 'file';
    const signed = await signDownloads(rows.map(f => f.path), { expiresIn: 300, download });
    if (!signed.ok) { res.status(200).json({ ok: false, error: 'Could not make download links just now.' }); return; }
    res.status(200).json({ ok: true, files: rows.map(f => ({
      id: f.id, slot: f.slot, name: f.original_name, mime: f.mime, bytes: f.bytes, sensitive: f.sensitive, at: f.created_at, path: f.path,
      url: signed.links[f.path] || null,
      /* a thumbnail only for a non-sensitive raster image: never a document,
         never an SVG rendered from the storage domain */
      thumb: !f.sensitive && /^image\/(jpeg|png|webp)$/.test(f.mime || '') ? signed.links[f.path] || null : null,
    })) });
    return;
  }

  if (b.action === 'link') {
    const rows = await get(`onboardings?id=eq.${id}&select=token,lead_id`);
    const o = Array.isArray(rows) ? rows[0] : null;
    if (!o) { res.status(404).json({ ok: false, error: 'That onboarding no longer exists.' }); return; }
    const leads = await get(`leads?id=eq.${encodeURIComponent(o.lead_id)}&select=data`);
    const lead = (Array.isArray(leads) && leads[0] && leads[0].data) || {};
    res.status(200).json({ ok: true, link: onboardingUrl(proposalBase(), clientSlug({ company: lead.company, name: lead.name }), o.token) });
    return;
  }

  if (b.action === 'delete') {
    const files = await get(`onboarding_files?onboarding_id=eq.${id}&select=path`);
    if (!Array.isArray(files)) { res.status(200).json({ ok: false, error: 'Could not read the files, so nothing was deleted.' }); return; }
    /* files first: if Storage refuses, the row stays and the owner can retry,
       rather than the row going and the files being stranded */
    const gone = await remove(files.map(f => f.path));
    if (!gone.ok) { res.status(200).json({ ok: false, error: 'Could not delete the files, so nothing was deleted. Try again.' }); return; }
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/onboardings?id=eq.${id}`, { method: 'DELETE', headers: { ...H(), prefer: 'return=minimal' } });
      if (!r.ok) throw new Error(String(r.status));
    } catch { res.status(200).json({ ok: false, error: 'The files were deleted but the onboarding was not. Try again.' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ ok: false, error: 'Unknown action.' });
}
