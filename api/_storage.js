import { SUPA_KEY, SUPA_URL } from './_env.js';
// api/_storage.js — the private onboarding bucket, reached ONLY with the
// service key. Not a route (underscore).
//
// The bucket has no policy on storage.objects (ONBOARDING-MIGRATION.sql), so
// nothing but this file can read, list or write it. Four operations:
//
//   signUpload(path)        a one-off URL the BROWSER uploads to directly.
//                           Files never pass through a Vercel function, which
//                           rejects bodies over 4.5 MB. Supabase fixes a
//                           signed upload URL's life at two hours and does not
//                           let it be shortened; what keeps it narrow is that
//                           the server chose the path (one object, one name)
//                           and the upload is checked afterwards.
//   head(path)              the first bytes and the total size, so the server
//                           judges the file by what it IS (lib/onboarding
//                           fileKindOk), not by what it is called.
//   remove(paths)           delete objects (a rejected upload, a removed file,
//                           a swept pending upload, a deleted onboarding).
//   signDownloads(paths)    five-minute links for an OWNER's browser.
//
// PHASE 2 (Drive) reads objects through this file too, so the portal and the
// rows do not change when files start being copied out.
//
// UNVERIFIED AGAINST A LIVE PROJECT: the endpoint shapes below are the ones
// supabase-js uses (storage-api v1). The route tests drive them through a
// fake; nothing here has talked to real Storage yet. VERIFY-RLS §14 step 4
// and the first real upload are the proof.

export const BUCKET = 'onboarding';
const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` });
const enc = p => String(p).split('/').map(encodeURIComponent).join('/');
const base = () => `${SUPA_URL}/storage/v1`;

/** -> { ok, url } with an absolute URL the browser PUTs the file to. */
export async function signUpload(path) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch(`${base()}/object/upload/sign/${BUCKET}/${enc(path)}`, {
      method: 'POST', headers: { ...H(), 'content-type': 'application/json', 'x-upsert': 'false' }, body: '{}',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j || typeof j.url !== 'string') return { ok: false, reason: 'sign_failed' };
    return { ok: true, url: base() + j.url };
  } catch { return { ok: false, reason: 'sign_failed' }; }
}

/** The first `n` bytes and the total size. Reads one chunk and cancels, so a
 *  50 MB video is not pulled into the function to check four bytes.
 *  -> { ok, head: Uint8Array, size: number|null } */
export async function head(path, n = 64) {
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch(`${base()}/object/authenticated/${BUCKET}/${enc(path)}`, { headers: { ...H(), range: `bytes=0-${n - 1}` } });
    if (!r.ok) return { ok: false, reason: r.status === 404 || r.status === 400 ? 'missing' : 'read_failed' };
    const cr = r.headers.get('content-range') || '';
    const m = /\/(\d+)\s*$/.exec(cr);
    let size = m ? Number(m[1]) : null;
    if (size === null && r.status === 200) { const cl = Number(r.headers.get('content-length')); if (cl > 0) size = cl; }
    let bytes = new Uint8Array(0);
    if (r.body && typeof r.body.getReader === 'function') {
      const rd = r.body.getReader();
      while (bytes.length < n) { const { value, done } = await rd.read(); if (done) break; const nb = new Uint8Array(bytes.length + value.length); nb.set(bytes); nb.set(value, bytes.length); bytes = nb; }
      rd.cancel().catch(() => {});
    } else {
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    return { ok: true, head: bytes.slice(0, n), size };
  } catch { return { ok: false, reason: 'read_failed' }; }
}

/** Delete objects. Never throws; returns whether Storage said yes. */
export async function remove(paths) {
  const list = (Array.isArray(paths) ? paths : []).filter(Boolean);
  if (!list.length || !SUPA_URL || !SUPA_KEY) return { ok: !list.length };
  try {
    const r = await fetch(`${base()}/object/${BUCKET}`, {
      method: 'DELETE', headers: { ...H(), 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: list }),
    });
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

/** Five-minute signed links. `download` names force a download (sensitive
 *  documents and contact lists, and SVG, which must never render inline on
 *  the storage domain). -> { ok, links: {path: url} } */
export async function signDownloads(paths, { expiresIn = 300, download = {} } = {}) {
  const list = (Array.isArray(paths) ? paths : []).filter(Boolean);
  if (!list.length) return { ok: true, links: {} };
  if (!SUPA_URL || !SUPA_KEY) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch(`${base()}/object/sign/${BUCKET}`, {
      method: 'POST', headers: { ...H(), 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn, paths: list }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(j)) return { ok: false, reason: 'sign_failed' };
    const links = {};
    for (const x of j) {
      if (!x || x.error || typeof x.signedURL !== 'string') continue;
      const name = download[x.path];
      links[x.path] = base() + x.signedURL + (name ? `&download=${encodeURIComponent(name)}` : '');
    }
    return { ok: true, links };
  } catch { return { ok: false, reason: 'sign_failed' }; }
}
