import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { guard, sweep } from './_guard.js';

// api/pocket-hook.js — Pocket AI posts every recording here.
//
// THIS IS THE ONLY ENDPOINT IN THE CRM WITH NO USER SESSION.
//
//   Pocket is the caller, not a browser, so there is nothing to authenticate a
//   session against. The HMAC signature IS the authentication. Everything below
//   follows from that one fact:
//
//   * bodyParser is OFF, because the signature covers the RAW BYTES. Parsing
//     first and re-serialising produces different bytes and a signature that
//     never matches — key order and whitespace are not preserved by a round
//     trip through JSON.parse.
//   * No secret configured means 503 and nothing stored. It must NEVER fall
//     back to trusting the caller: a missing env var would otherwise turn this
//     into an open write endpoint into the CRM.
//   * The signature is checked BEFORE guard(). guard() costs two Supabase round
//     trips; verification is pure CPU and rejects a forgery in microseconds.
//     Spending database calls on forged traffic is how a rate limiter becomes
//     the denial of service. guard() is still here — it bounds a validly signed
//     flood, which is what matters if the secret ever leaks.
//
// WRITES BYPASS RLS, ON PURPOSE
//
//   This writes pocket_recordings with SUPABASE_SERVICE_KEY, the same key
//   _guard.js already uses for api_hits. RLS governs the browser and cannot
//   govern a caller with no session; VERIFY-RLS.md §7 proves the browser side
//   and says so explicitly.
//
// DELIVERY IS AT-LEAST-ONCE
//
//   Pocket retries 3 times with 1s–30s backoff and guarantees at-least-once.
//   So the same recording arrives repeatedly, and several DIFFERENT events
//   (transcription.completed, then summary.completed) each describe the same
//   one. Pocket's recording id is the primary key, which makes "do not store
//   this twice" a database constraint rather than application logic, and every
//   write below is a MERGE that can be replayed without damage.
//
// STATUS CODES ARE CHOSEN FOR HOW POCKET REACTS TO THEM
//
//   200  stored, or already stored, or nothing we act on   -> no retry
//   401  bad or missing signature                          -> retries, then drops. Correct.
//   413  body beyond what we can hold in memory            -> retries, then drops
//   500  the database write failed                         -> retries. The one case retrying helps.
//   503  no signing secret configured                      -> retries, giving you time to set it
//
//   A 429 from guard() COSTS YOU A RECORDING: Pocket retries three times and
//   gives up. The daily cap here is not tuning, it is data loss, so it is set
//   far above real volume and hitting it is an incident.

/* Raw body ceiling. This CANNOT be a truncation: the signature covers the whole
   body, so a partially-read body can never verify. Anything past this is
   refused outright. 5 MB is far beyond a real transcript — a four-hour
   recording is a few hundred KB of JSON — so reaching it means something is
   wrong rather than something is long. */
const RAW_MAX = 5_000_000;

/* A stored transcript is clamped separately and FLAGGED rather than refused.
   Losing the end of a transcript loudly beats losing the recording quietly. */
const TRANSCRIPT_MAX = 2_000_000;

/* Replay window. Retries back off 1s–30s, so a legitimate redelivery is never
   near five minutes. Without this, a captured delivery replays forever. */
const SKEW_PAST_MS   = 5 * 60 * 1000;
const SKEW_FUTURE_MS = 60 * 1000;

const SUPA   = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY    = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.POCKET_WEBHOOK_SECRET;

/* ------------------------------------------------------------- raw body */

/** Read the body as bytes. Returns null if it exceeds RAW_MAX — the caller
 *  turns that into a 413. We stop reading at the ceiling rather than buffering
 *  a hostile body to the end. */
async function readRaw(req) {
  // Some runtimes (and every test) hand us a string or Buffer directly.
  if (typeof req.body === 'string') return req.body.length > RAW_MAX ? null : req.body;
  if (Buffer.isBuffer(req.body)) return req.body.length > RAW_MAX ? null : req.body.toString('utf8');

  const chunks = [];
  let n = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    n += b.length;
    if (n > RAW_MAX) return null;
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/* ---------------------------------------------------------- verification */

/** HMAC-SHA256(secret, `${timestamp}.${rawBody}`), compared in constant time.
 *  Never ===: a plain string compare leaks the correct prefix through timing
 *  and turns a 256-bit secret into a few thousand guesses. */
function signatureOk(raw, sig, ts) {
  if (!sig || !ts) return false;
  const expected = createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(sig).trim().replace(/^sha256=/i, ''), 'utf8');
  if (a.length !== b.length) return false;      // timingSafeEqual throws on a length mismatch
  return timingSafeEqual(a, b);
}

function timestampOk(ts) {
  const t = Number(ts);
  if (!isFinite(t) || t <= 0) return false;
  const drift = Date.now() - t;
  return drift <= SKEW_PAST_MS && drift >= -SKEW_FUTURE_MS;
}

/* ------------------------------------------------------------- supabase */

async function sb(path, opts = {}) {
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

const str = (v, cap = 4000) => (v == null ? '' : String(v)).slice(0, cap);
const firstString = (...vals) => { for (const v of vals) { const s = str(v, 200).trim(); if (s) return s; } return ''; };

/** Pocket's recording id.
 *
 *  The published docs describe recording.title / description / duration /
 *  language / createdAt and NEVER name an id, so this tries the plausible
 *  spellings and falls back to a content hash. The fallback is stable for the
 *  same recording (same user, same creation time, same title), which is all
 *  idempotency needs — but it is a GUESS, so it is flagged on the row and the
 *  UI is expected to say so. One real delivery settles this permanently. */
function recordingIdOf(b) {
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
function readTranscript(t) {
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

const asList = v => (Array.isArray(v) ? v : []);

/** Everything this delivery tells us about the recording. Fields it does not
 *  mention come back empty and are dropped by the merge, never written as
 *  blanks over something a previous delivery already established. */
function patchFrom(b) {
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
function mergeData(stored, patch, meta) {
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
async function upsertMerge(id, patch, meta) {
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
async function markDeleted(id, meta) {
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

/* -------------------------------------------------------------- handler */

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Checked here rather than left to guard(), because guard() runs after the
  // signature and a probe should get 405 rather than 401.
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  // Fail closed. Never fall back to accepting unsigned deliveries — the docs
  // warn that webhooks created before signing existed still send them, and the
  // fix for that is to recreate the webhook, not to trust it.
  if (!SECRET) {
    console.error('[pocket-hook] POCKET_WEBHOOK_SECRET is not set; refusing every delivery');
    res.status(503).json({ error: 'Webhook not configured.' });
    return;
  }

  const raw = await readRaw(req);
  if (raw === null) { res.status(413).json({ error: 'Body too large.' }); return; }

  const sig = req.headers['x-heypocket-signature'];
  const ts  = req.headers['x-heypocket-timestamp'];

  if (!timestampOk(ts))            { res.status(401).json({ error: 'Stale or invalid timestamp.' }); return; }
  if (!signatureOk(raw, sig, ts))  { res.status(401).json({ error: 'Bad signature.' }); return; }

  /* guard() reads req.body for its size check and has a string branch, so
     handing it the raw string measures the true payload and _guard.js needs no
     change. maxChars matches RAW_MAX deliberately: a guard 413 and a readRaw
     413 must not disagree, or a legitimate recording is refused by one limit
     after passing the other. */
  req.body = raw;
  const gate = await guard(req, res, {
    name: 'pocket', perIp: 240, windowMin: 10, perDay: 3000,
    maxChars: RAW_MAX, requireAuth: false,
  });
  if (!gate.ok) return;
  sweep();

  let body;
  try { body = JSON.parse(raw); }
  catch { res.status(200).json({ ok: true, ignored: 'unparseable' }); return; }

  const event = str(body && body.event, 80);
  const { id, guessed } = recordingIdOf(body);
  if (!id) { res.status(200).json({ ok: true, ignored: 'no recording' }); return; }

  const meta = {
    event: event || 'unknown',
    at: str(body && body.timestamp, 60) || new Date().toISOString(),
    idGuessed: guessed || undefined,
  };

  /* First delivery of an unrecognised shape logs its KEY NAMES — never any
     values, which are transcripts. This is what settles the id question. */
  if (guessed) {
    console.error('[pocket-hook] no recording id found; keys were',
      JSON.stringify({ top: Object.keys(body || {}), recording: Object.keys((body && body.recording) || {}) }));
  }

  if (event === 'recording.deleted') {
    const out = await markDeleted(id, meta);
    if (!out.ok) { res.status(500).json({ error: 'Store failed.' }); return; }
    res.status(200).json({ ok: true, id, deleted: true });
    return;
  }

  /* Every other event upserts. Deliberately not an allowlist: you press record
     on purpose, so everything comes, and a new Pocket event type should arrive
     rather than be silently dropped by a list written today. */
  const out = await upsertMerge(id, patchFrom(body), meta);
  if (!out.ok) { res.status(500).json({ error: 'Store failed.' }); return; }
  res.status(200).json({ ok: true, id, created: !!out.created });
}
