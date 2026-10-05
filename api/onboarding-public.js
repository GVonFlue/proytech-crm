import { randomUUID } from 'node:crypto';
import { guard, sweep } from './_guard.js';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { appUrl } from './_google.js';
// Two mail doors (_mail.js): sendMail() reaches the owners allowlist and
// nobody else; sendClientMail() takes an onboarding id and reads the client's
// address from the onboarding's lead. Neither takes an address from here.
import { sendMail, sendClientMail, esc } from './_mail.js';
import { signUpload, head, remove } from './_storage.js';
// the client link's base is built in ONE place, proposal-send.js
import { proposalBase } from './proposal-send.js';
import { readOffer, clientSlug } from '../src/lib/proposal.js';
import {
  TOKEN_RE, ctxOf, readOnbConfig, cleanAnswers, cleanSections, prefill, fileAllowed, fileKindOk, extOf, FILE_SLOTS,
  missingRequired, stillNeeded, progress, checklistState, launchState, onboardingUrl, productLine, MAX_FILE_BYTES,
} from '../src/lib/onboarding.js';
import { buildOutputs } from '../src/lib/onboarding-prompts.js';

// api/onboarding-public.js — the onboarding portal's only way in.
//
// NO SESSION, BY DESIGN, exactly like proposal-public.js: the client has a
// link, not an account. The token (256 random bits in the link's # fragment,
// never in a URL a server logs) stands in for one, checked against a strict
// shape and then against the database through security-definer functions
// only the service role can call (ONBOARDING-MIGRATION.sql).
//
// WHAT IT SENDS BACK is picked by name (PUBLIC_KEYS, publicFiles): never the
// onboarding id, a file's storage path, the lead id or the stored outputs.
//
// WHAT IT CAN WRITE, one action per call:
//   save         answers + section marks. Rebuilt from the field schema first
//                (unknown ids dropped, values coerced and capped), and REFUSED
//                if any value is shaped like an SSN or a card number
//                (lib/onboarding cleanAnswers). Postgres refuses a submitted
//                onboarding.
//   upload-sign  a one-off signed upload URL for ONE server-chosen path inside
//                this onboarding's folder, after the slot, extension and size
//                pass. The client's file name is display text only.
//   upload-done  reads the object's first bytes and size from Storage; a file
//                that is not what its extension claims, or too big, is deleted
//                and refused. Only then is it listed.
//   file-remove  before submit only.
//   resume-mail  "email me my link": to the address ON THE LEAD (sendClientMail,
//                by onboarding id), at most every ten minutes (Postgres).
//   submit       required fields checked here (the schema lives in JS) and the
//                ones Postgres can see checked again there; both prompts built
//                from the same function the CRM's Regenerate uses; the owners
//                told through sendMail().
//
// IT NEVER WRITES A LEAD. The CRM ticks the lead's checklist itself when it
// sees a submitted onboarding, through the owner's normal save path, because a
// server write would race the owner's open screen (ENGINEERING §3).
//
// One answer for malformed and unknown tokens, so the endpoint cannot be used
// to learn which exist.

const NOT_FOUND = 'This onboarding link is not valid. Reply to any of our emails and we will send a fresh one.';
const LOCKED = 'You already submitted this. Reply to any of our emails if something needs changing.';
const H = () => ({ apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}`, 'content-type': 'application/json' });
const PATH_RE = /^[0-9a-f-]{36}\/(logos|photos|documents|contacts)\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

async function rpc(fn, args) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(), body: JSON.stringify(args) });
    if (!r.ok) return { ok: false };
    return { ok: true, data: await r.json().catch(() => null) };
  } catch { return { ok: false }; }
}
const one = got => (got.ok && Array.isArray(got.data) ? got.data[0] || null : null);

/* settings.offer and settings.onboarding, read with the service key. The
   portal needs the agency's name and logo, the people, launch days and the
   industry templates; nothing else in settings is read or returned. */
async function readSettings() {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/app_settings?id=eq.main&select=data`, { headers: H() });
    const rows = r.ok ? await r.json() : [];
    return (Array.isArray(rows) && rows[0] && rows[0].data) || {};
  } catch { return {}; }
}
export async function loadConfig() {
  const st = await readSettings();
  const { offer } = readOffer(st);
  const { config, fellBack } = readOnbConfig(st, offer);
  /* named, once per cold start: "never set up" must be findable in the log
     without one line per autosave */
  const said = fellBack.join(', ');
  if (said && said !== loadConfig.said) { console.warn('[onboarding-public] config fell back to defaults for: ' + said); loadConfig.said = said; }
  return config;
}

/** The files a browser may know about: picked by name. No path, no flag that
 *  says where it is stored. */
export const publicFiles = files => (Array.isArray(files) ? files : []).map(f => ({ id: f.id, slot: f.slot, name: f.name, mime: f.mime, bytes: f.bytes, at: f.at }));

/** Everything the portal renders, picked by name. Exported so the test proves
 *  what is (and is not) in it. */
export const PUBLIC_KEYS = ['status', 'industry', 'lenderKind', 'products', 'packageName', 'answers', 'sections', 'submittedAt', 'lastActivityAt',
  'files', 'checklist', 'contacts', 'launchDays', 'agency', 'config', 'launch', 'productLine'];
export function publicView(row, cfg) {
  const ctx = ctxOf(row, row.answers, cfg);
  const answers = prefill(row.answers || {}, {
    client: { name: row.client_name, email: row.client_email, phone: row.client_phone, company: row.client_company, website: row.client_website },
    plan: row.plan, products: ctx.products,
  });
  const contacts = (Array.isArray(row.contacts) && row.contacts.length ? row.contacts : cfg.contacts || [])
    .filter(c => c && c.name).map(c => {
      /* the proposal froze its chosen contacts without photos before contacts
         had them; take the photo and role from the offer by name */
      const fromOffer = (cfg.contacts || []).find(x => x && x.name === c.name) || {};
      return { name: String(c.name), role: c.role || fromOffer.role || '', photo: c.photo || fromOffer.photo || '', phone: c.phone || fromOffer.phone || '', email: c.email || fromOffer.email || '' };
    });
  const launchDays = Number.isInteger(row.launch_days) ? row.launch_days : cfg.launchDays;
  const view = {
    status: row.status, industry: ctx.industry, lenderKind: ctx.lenderKind, products: ctx.products, packageName: row.package_name || '',
    answers, sections: row.sections || {}, submittedAt: row.submitted_at || null, lastActivityAt: row.last_activity_at || null,
    files: publicFiles(row.files), checklist: checklistState(row.checklist), contacts, launchDays,
    agency: { name: cfg.agency, email: cfg.agencyEmail, logo: cfg.agencyLogo, mark: cfg.agencyMark },
    config: { state: cfg.state, productNames: cfg.productNames, pipelines: cfg.pipelines, tiles: cfg.tiles, kickoffUrl: cfg.kickoffUrl, seatsIncluded: cfg.seatsIncluded, agency: cfg.agency, agencyEmail: cfg.agencyEmail },
    launch: launchState({ submittedAt: row.submitted_at, checklist: row.checklist, ctx, answers, launchDays }),
    productLine: row.package_name || productLine(ctx.products, cfg.productNames),
  };
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = view[k];
  return out;
}

function submittedHtml({ business, who, product, missing }) {
  return `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;color:#14122B;line-height:1.5">
    <p style="margin:0 0 6px;font-size:17px;font-weight:600">${esc(business)} finished onboarding</p>
    <p style="margin:0 0 12px"><b>${esc(who)}</b> submitted the onboarding for <b>${esc(business)}</b>${product ? ` (${esc(product)})` : ''}.</p>
    ${missing.length ? `<p style="margin:0 0 6px"><b>Still needed:</b></p><ul style="margin:0 0 12px;padding-left:18px">${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p style="margin:0 0 12px">Nothing outstanding.</p>'}
    <p style="margin:0 0 12px">The answers PDF, the build prompts and the files are on the client's Onboarding view.</p>
    <p style="margin:0"><a href="${esc(appUrl())}" style="color:#2B4DE0">Open the CRM</a></p></div>`;
}
function resumeHtml({ first, link, done, total, agency }) {
  return `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#14122B;max-width:560px">
    <p style="margin:0 0 14px">${first ? `${esc(first)}, we` : 'We'} saved your seat.</p>
    <p style="margin:0 0 14px">You're ${done} of ${total} sections in. Everything you entered is saved, so you can pick up exactly where you left off, on your phone or your computer.</p>
    <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#FB6926;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">Pick up where I left off</a></p>
    <p style="margin:0;color:#5E5A7A;font-size:13px">This link is yours. Anyone with it can see your answers, so keep it to yourself.${agency ? ` · ${esc(agency)}` : ''}</p>
  </div>`;
}

export default async function handler(req, res) {
  const gate = await guard(req, res, { name: 'onboarding-public', perIp: 300, windowMin: 10, perDay: 20000, maxChars: 200000 });
  if (!gate.ok) return;
  sweep();
  if (!SUPA_URL || !SUPA_KEY) { res.status(503).json({ ok: false, error: 'Onboarding is not available right now.' }); return; }
  /* about 1% of calls: delete uploads that were signed and never finished */
  if (Math.random() < 0.01) rpc('onboarding_sweep_pending', {}).then(g => { if (g.ok && Array.isArray(g.data) && g.data.length) remove(g.data.map(x => (typeof x === 'string' ? x : x.onboarding_sweep_pending))); }).catch(() => {});

  const b = req.body || {};
  const t = String(b.t || '');
  if (!TOKEN_RE.test(t)) { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }
  const row = one(await rpc('onboarding_public', { p_token: t }));
  if (!row) { res.status(404).json({ ok: false, error: NOT_FOUND }); return; }
  const cfg = await loadConfig();
  const action = String(b.action || 'load');

  if (action === 'load') { res.status(200).json({ ok: true, onboarding: publicView(row, cfg) }); return; }

  const locked = row.status === 'submitted';

  if (action === 'save') {
    if (locked) { res.status(409).json({ ok: false, locked: true, error: LOCKED }); return; }
    const ctx = ctxOf(row, b.answers, cfg);
    const cleaned = cleanAnswers(b.answers, ctx, cfg);
    if (cleaned.error) { res.status(400).json({ ok: false, error: cleaned.error, field: cleaned.field }); return; }
    const got = await rpc('onboarding_save', { p_token: t, p_answers: cleaned.answers, p_sections: cleanSections(b.sections) });
    const r = got.ok ? String(got.data || '') : 'error';
    if (r === 'saved') { res.status(200).json({ ok: true, savedAt: new Date().toISOString() }); return; }
    if (r === 'locked') { res.status(409).json({ ok: false, locked: true, error: LOCKED }); return; }
    res.status(200).json({ ok: false, error: 'Not saved just now. We will keep trying.' });
    return;
  }

  if (action === 'upload-sign') {
    if (locked) { res.status(409).json({ ok: false, locked: true, error: LOCKED }); return; }
    const slot = String(b.slot || '');
    const allowed = fileAllowed(slot, b.name, b.bytes);
    if (!allowed.ok) { res.status(400).json({ ok: false, error: allowed.error }); return; }
    /* THE SERVER CHOOSES THE PATH: this onboarding's folder, the slot's
       folder, a fresh uuid. The client's name is kept only for display. */
    const path = `${row.id}/${FILE_SLOTS[slot].folder}/${randomUUID()}.${allowed.ext}`;
    const name = String(b.name || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
    const begun = await rpc('onboarding_file_begin', { p_token: t, p_slot: slot, p_path: path, p_name: name, p_mime: allowed.mime, p_sensitive: !!FILE_SLOTS[slot].sensitive });
    const br = begun.ok ? String(begun.data || '') : 'error';
    if (br === 'too_many') { res.status(400).json({ ok: false, error: 'That is a lot of files. Reply to any of our emails with the rest.' }); return; }
    if (br !== 'ok') { res.status(br === 'locked' ? 409 : 200).json({ ok: false, error: br === 'locked' ? LOCKED : 'Could not start that upload. Try again.' }); return; }
    const signed = await signUpload(path);
    if (!signed.ok) { res.status(200).json({ ok: false, error: 'Could not start that upload. Try again.' }); return; }
    res.status(200).json({ ok: true, uploadUrl: signed.url, path, mime: allowed.mime });
    return;
  }

  if (action === 'upload-done') {
    const path = String(b.path || '');
    if (!PATH_RE.test(path) || !path.startsWith(row.id + '/')) { res.status(400).json({ ok: false, error: 'That upload is not part of this onboarding.' }); return; }
    const ext = extOf(path);
    const got = await head(path, 64);
    if (!got.ok) { res.status(200).json({ ok: false, error: 'We could not find that upload. Try again.' }); return; }
    const tooBig = got.size !== null && got.size > MAX_FILE_BYTES;
    if (tooBig || !fileKindOk(ext, got.head)) {
      await remove([path]);
      res.status(400).json({ ok: false, error: tooBig ? 'That file is over 50 MB. Reply to any of our emails with it instead.' : `That file is not really a .${ext}. Export it again and try once more.` });
      return;
    }
    const fin = await rpc('onboarding_file_finish', { p_token: t, p_path: path, p_bytes: got.size });
    if (!fin.ok || String(fin.data) !== 'ok') { res.status(200).json({ ok: false, error: 'Could not save that upload. Try again.' }); return; }
    const fresh = one(await rpc('onboarding_public', { p_token: t }));
    res.status(200).json({ ok: true, files: publicFiles(fresh ? fresh.files : []) });
    return;
  }

  if (action === 'file-remove') {
    if (locked) { res.status(409).json({ ok: false, locked: true, error: LOCKED }); return; }
    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ ok: false, error: 'That file is not part of this onboarding.' }); return; }
    const got = await rpc('onboarding_file_drop', { p_token: t, p_file_id: id });
    const path = got.ok ? got.data : null;
    if (typeof path === 'string' && path) await remove([path]);
    const fresh = one(await rpc('onboarding_public', { p_token: t }));
    res.status(200).json({ ok: true, files: publicFiles(fresh ? fresh.files : []) });
    return;
  }

  if (action === 'resume-mail') {
    if (locked) { res.status(409).json({ ok: false, locked: true, error: LOCKED }); return; }
    const marked = await rpc('onboarding_mark_mailed', { p_token: t });
    const id = marked.ok && typeof marked.data === 'string' ? marked.data : null;
    if (!id) { res.status(200).json({ ok: false, tooSoon: true, error: 'We just sent your link. Check your inbox, and your spam folder.' }); return; }
    const ctx = ctxOf(row, row.answers, cfg);
    const p = progress(ctx, row.answers || {}, row.files || [], row.sections || {}, cfg);
    const link = onboardingUrl(proposalBase(), clientSlug({ company: row.client_company, name: row.client_name }), t);
    const first = String((row.answers && row.answers['biz.contact_name']) || row.client_name || '').trim().split(/\s+/)[0] || '';
    const sent = await sendClientMail({
      onboardingId: id, tag: 'onboarding-resume', replyTo: cfg.agencyEmail,
      subject: `We saved your seat: ${p.done} of ${p.total} sections in`,
      html: resumeHtml({ first, link, done: p.done, total: p.total, agency: cfg.agency }),
      text: `${first ? first + ', we' : 'We'} saved your seat. You're ${p.done} of ${p.total} sections in.\n\nPick up where you left off: ${link}\n\nThis link is yours. Anyone with it can see your answers, so keep it to yourself.`,
    });
    if (!sent.ok) {
      res.status(200).json({ ok: false, error: sent.reason === 'no_email' ? 'We do not have an email for you yet. Everything is saved; keep this page bookmarked.' : 'The email did not go out. Everything is saved; try again in a few minutes.' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'submit') {
    if (locked) { res.status(200).json({ ok: true, result: 'already', onboarding: publicView(row, cfg) }); return; }
    const answers = row.answers || {};
    const ctx = ctxOf(row, answers, cfg);
    const missing = missingRequired(ctx, answers, row.files || [], cfg);
    if (missing.length) { res.status(400).json({ ok: false, missing, error: 'A few required answers are still empty: ' + missing.map(m => m.label).join(', ') + '.' }); return; }
    const outputs = buildOutputs({ row, answers, ctx, files: row.files || [], checklist: row.checklist, cfg });
    const got = await rpc('onboarding_submit', { p_token: t, p_outputs: outputs });
    const r = got.ok ? String(got.data || '') : 'error';
    if (r === 'rights') { res.status(400).json({ ok: false, error: 'Tick the box to confirm you own or have permission to use what you uploaded.' }); return; }
    if (r === 'incomplete') { res.status(400).json({ ok: false, error: 'Your name, email and business name are needed to submit.' }); return; }
    if (r !== 'submitted' && r !== 'already') { res.status(200).json({ ok: false, error: 'We could not submit just now. Everything is saved; try again in a moment.' }); return; }
    const fresh = one(await rpc('onboarding_public', { p_token: t })) || { ...row, status: 'submitted', submitted_at: new Date().toISOString() };
    if (r === 'submitted') {
      /* Owners only: sendMail() with no `to` IS the owners allowlist. Soft: a
         mail failure must not undo a submit the client just made. */
      const business = String(answers['biz.name'] || row.client_company || 'A client');
      const open = stillNeeded(ctx, answers, row.files || [], row.checklist, cfg).filter(x => !x.ok).map(x => x.label);
      await sendMail({ tag: 'onboarding-public', subject: `${business} finished onboarding`,
        html: submittedHtml({ business, who: String(answers['biz.contact_name'] || row.client_name || 'The client'), product: row.package_name || productLine(ctx.products, cfg.productNames), missing: open }) });
    }
    res.status(200).json({ ok: true, result: r, onboarding: publicView(fresh, cfg) });
    return;
  }

  res.status(400).json({ ok: false, error: 'Unknown action.' });
}
