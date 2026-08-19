import { createHash } from 'node:crypto';

// api/_pocket.js — how a Pocket recording is SHAPED and STORED.
//
// Shared by api/pocket-hook.js (Pocket pushes) and api/pocket-backfill.js (we
// pull). Deliberately one module, not two that resemble each other: a recording
// must not mean something different depending on which door it came through,
// and the merge below is the only thing standing between at-least-once delivery
// and duplicate rows. ENGINEERING.md §2 — when the same fact is computed in two
// places, they diverge and the bug is invisible until someone compares them.
//
// What is NOT here: raw-body reading, signature verification and the replay
// window. Those are the webhook's own problem — the backfill authenticates as
// an owner instead — so they stay in pocket-hook.js.

/* Raw body ceiling. This CANNOT be a truncation: the webhook signature covers
   the whole body, so a partially-read body can never verify. Anything past this
   is refused outright. 5 MB is far beyond a real transcript — a four-hour
   recording is a few hundred KB of JSON — so reaching it means something is
   wrong rather than something is long. */
export const RAW_MAX = 5_000_000;

/* A stored transcript is clamped separately and FLAGGED rather than refused.
   Losing the end of a transcript loudly beats losing the recording quietly. */
export const TRANSCRIPT_MAX = 2_000_000;

const SUPA = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/* ------------------------------------------------------------- supabase */

export async function sb(path, opts = {}) {
  if (!SUPA || !KEY) return { ok: false, rows: null };
  try {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`,
        'content-type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    const text = await r.text();
    let rows = null;
    try { rows = text ? JSON.parse(text) : []; } catch { rows = []; }
    return { ok: r.ok, status: r.status, rows };
  } catch {
    return { ok: false, rows: null };
  }
}

/* -------------------------------------------------------- reading the body */

export const str = (v, cap = 4000) => (v == null ? '' : String(v)).slice(0, cap);
const firstString = (...vals) => { for (const v of vals) { const s = str(v, 200).trim(); if (s) return s; } return ''; };

/** Pocket's recording id.
 *
 *  The published docs describe recording.title / description / duration /
 *  language / createdAt and NEVER name an id, so this tries the plausible
 *  spellings and falls back to a content hash. The fallback is stable for the
 *  same recording (same user, same creation time, same title), which is all
 *  idempotency needs — but it is a GUESS, so it is flagged on the row and the
 *  UI is expected to say so. One real delivery settles this permanently. */
export function recordingIdOf(b) {
  const rec = (b && b.recording) || {};
  const direct = firstString(
    rec.id, rec.recordingId, rec.recording_id, rec.uuid, rec.recordingUuid,
    b.recordingId, b.recording_id, b.id,
  );
  if (direct) return { id: direct, guessed: false };

  const seed = [
    str((b && b.user && b.user.id) || '', 100),
    str(rec.createdAt || rec.created_at || '', 60),
    str(rec.title || '', 200),
  ].join('|');
  return { id: 'sha:' + createHash('sha256').update(seed).digest('hex').slice(0, 32), guessed: true };
}

/** Flatten Pocket's speaker segments into text, defensively.
 *
 *  The docs say "array of speaker segments with text and timestamps" without
 *  naming the keys, so several spellings are tried. If NOTHING yields text, the
 *  raw array is stringified rather than dropped — an unreadable transcript we
 *  kept is recoverable; one we discarded because we did not recognise its shape
 *  is not. */
export function readTranscript(t) {
  if (typeof t === 'string') return { text: t, segments: [] };
  if (!Array.isArray(t)) return { text: '', segments: [] };

  const segments = t.map(s => ({
    speaker: str((s && (s.speaker ?? s.speakerName ?? s.speaker_label ?? s.name)) || '', 120),
    text:    str((s && (s.text ?? s.content ?? s.transcript ?? s.value)) || '', 20000),
    start:   Number(s && (s.start ?? s.startTime ?? s.start_time ?? s.startMs ?? s.offset)) || 0,
    end:     Number(s && (s.end ?? s.endTime ?? s.end_time ?? s.endMs)) || 0,
  })).filter(s => s.text || s.speaker);

  const text = segments.map(s => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n').trim();
  if (text) return { text, segments };
  return { text: str(JSON.stringify(t), TRANSCRIPT_MAX), segments: [], unknownShape: true };
}

export const asList = v => (Array.isArray(v) ? v : []);

/** Everything this delivery tells us about the recording. Fields it does not
 *  mention come back empty and are dropped by the merge, never written as
 *  blanks over something a previous delivery already established. */
export function patchFrom(b) {
  const rec  = (b && b.recording) || {};
  const sums = (b && b.summarizations) || {};
  const t    = readTranscript(b && b.transcript);

  const full = t.text;
  const clamped = full.length > TRANSCRIPT_MAX;

  return {
    title:       str(rec.title, 300),
    description: str(rec.description, 2000),
    createdAt:   str(rec.createdAt || rec.created_at, 60),
    duration:    Number(rec.duration) || 0,
    language:    str(rec.language, 40),
    summary:     str(sums.summary ?? sums.summaryText ?? (sums.summary && sums.summary.text), 20000),
    actionItems: asList(sums.actionItems ?? sums.action_items).slice(0, 100),
    transcript:  clamped ? full.slice(0, TRANSCRIPT_MAX) : full,
    segments:    t.segments.slice(0, 5000),
    truncated:   clamped || undefined,
    unknownTranscriptShape: t.unknownShape || undefined,
    pocketUser:  b && b.user ? { id: str(b.user.id, 100), email: str(b.user.email, 200) } : null,
  };
}

/** Merge an incoming patch over what is stored.
 *
 *  NON-EMPTY WINS. transcription.completed and summary.completed are two
 *  deliveries about one recording, and the second must not blank what the first
 *  brought just because it did not mention it.
 *
 *  transcript.edited and speakers.labeled legitimately REPLACE the transcript,
 *  and they carry a non-empty one, so replacement falls out of the same rule.
 *
 *  Known limit: a retried older delivery can overwrite a newer edit, because
 *  ordering is not enforced. The window is the retry window — under a minute —
 *  and the damage is a transcript reverting one edit, which the next edit
 *  fixes. Every delivery is recorded in events[] so it is at least visible.
 *  Enforcing order would mean per-field timestamps, which costs more than the
 *  problem. */
export function mergeData(stored, patch, meta) {
  const out = { ...(stored || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === 'number' && !v && out[k]) continue;
    out[k] = v;
  }
  out.events = [...asList(out.events), meta].slice(-40);
  if (meta.idGuessed) out.idGuessed = true;
  return out;
}

/* ------------------------------------------------------------ the write */

/** Read, merge, write — with optimistic concurrency on updated_at.
 *
 *  Two deliveries for one recording can land at the same moment, and a plain
 *  read-then-write would silently lose one of them. The conditional PATCH turns
 *  that into a detectable miss we retry.
 *
 *  After 3 misses it writes unconditionally. That is deliberate: at that point
 *  the choice is between possibly losing one FIELD and definitely losing the
 *  DELIVERY, and a recording is the thing we cannot get back. */
export async function upsertMerge(id, patch, meta) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const last = attempt === 3;
    const got = await sb(`pocket_recordings?id=eq.${encodeURIComponent(id)}&select=id,data,status,updated_at`);
    if (!got.ok) return { ok: false };
    const row = asList(got.rows)[0];
    const now = new Date().toISOString();

    if (!row) {
      const ins = await sb('pocket_recordings', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          id, data: mergeData({}, patch, meta), status: 'open',
          received_at: now, updated_at: now,
        }),
      });
      if (ins.ok) return { ok: true, created: true };
      if (ins.status === 409) continue;          // someone inserted it first; re-read and merge
      return { ok: false };
    }

    /* A recording the owner has already finished with is not reopened by a
       redelivery. The content still merges — a later transcript edit is worth
       having — but status is theirs, not Pocket's. */
    const body = { data: mergeData(row.data, patch, meta), updated_at: now };

    const q = last
      ? `pocket_recordings?id=eq.${encodeURIComponent(id)}`
      : `pocket_recordings?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`;
    const upd = await sb(q, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (!upd.ok) return { ok: false };
    if (asList(upd.rows).length || last) return { ok: true, created: false };
    // 0 rows: someone else wrote between our read and our write. Go again.
  }
  return { ok: false };
}

/** recording.deleted — Pocket deleted THEIR copy.
 *
 *  We do NOT delete ours. An inbound webhook destroying the only stored copy of
 *  a transcript is irreversible and triggered by a system we do not control, and
 *  outputs may already have been made from it. So the row is marked and, if it
 *  was still open, moved out of the queue. Deleting it is an owner action in the
 *  app, where it can be seen and reconsidered. */
export async function markDeleted(id, meta) {
  const got = await sb(`pocket_recordings?id=eq.${encodeURIComponent(id)}&select=id,data,status`);
  if (!got.ok) return { ok: false };
  const row = asList(got.rows)[0];
  if (!row) return { ok: true, missing: true };
  const data = mergeData(row.data, { deletedInPocket: true, deletedAt: new Date().toISOString() }, meta);
  const upd = await sb(`pocket_recordings?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data,
      status: row.status === 'open' ? 'dismissed' : row.status,
      updated_at: new Date().toISOString(),
    }),
  });
  return { ok: upd.ok };
}

